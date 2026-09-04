# airlock

The single egress boundary for fetching **untrusted, user-supplied URLs** in
Blot's build pipeline.

Two callers in Blot are routed through it - both fetch a URL a user controls,
on Blot's own infrastructure, and show the result back to that user, which is
what makes them read primitives rather than just SSRF:

| Caller | User input | What it does |
| --- | --- | --- |
| [`app/build/plugins/linkScreenshot`](../../app/build/plugins/linkScreenshot) | `href` from an uploaded `.webloc` / `.url` bookmark file | screenshots the page, embeds the image in the post |
| [`app/helper/transformer/download`](../../app/helper/transformer/download) | `<img src>` / `![](…)` in a post | downloads the asset, caches it, rewrites to the CDN |

See "Known sinks not covered" below for other user-controlled fetches in the
app that aren't routed through `airlock` yet.

Without protection either one is a classic SSRF primitive: point it at
`http://169.254.169.254/…` (cloud instance metadata → credentials),
`http://10.x/…` (internal services, e.g. Redis on another instance), or
`http://localhost:8080/…` and the response comes back to the user.

`airlock` removes the whole class of problem by running those fetches inside a
container whose **network egress is filtered in the kernel**. The application
code does no IP classification.

## What's in the container

* **Chromium** (headless), DevTools bound to `127.0.0.1:9221`, attached to by
  `app/helper/screenshot` via `puppeteer.connect()`.
* **nginx** on **:9222** — a thin front for Chromium's DevTools endpoint.
  Alpine's Chromium ignores `--remote-debugging-address` and its `/json/*`
  endpoints reject a non-localhost `Host` header, so the app can't talk to it
  as `http://airlock:9222` directly. nginx forwards with `Host` reset to
  localhost, rewrites `webSocketDebuggerUrl` in the JSON back to the address
  the caller dialled, and carries the WebSocket upgrade. See
  [`nginx.conf`](nginx.conf).
* **tinyproxy** on **:8888** — an HTTP(S) forward proxy that
  `app/helper/transformer/download` points `node-fetch` at. It does no
  destination filtering itself (no `ConnectPort` allow-list either - see the
  comment in [`tinyproxy.conf`](tinyproxy.conf) for why that would just add a
  confusing failure mode without adding real protection); `egress.nft` is the
  only destination control.
* **[`egress.nft`](egress.nft)** — installed by
  [`entrypoint.sh`](entrypoint.sh) before any service starts. It `reject`s
  (fails fast, not a multi-second timeout per blocked destination) every
  RFC1918 / loopback / link-local / ULA / CGNAT / documentation / benchmark /
  6to4 / Teredo / NAT64 / multicast / reserved destination, v4 and v6. The
  cloud metadata address `169.254.169.254` is inside `169.254.0.0/16`.
  Loopback (`127.0.0.0/8`) is **not** blanket-allowed: Chromium and tinyproxy
  run as the unprivileged `airlock` user and handle user-supplied URLs, so if
  they could reach `127.0.0.1` freely, a bookmark or `<img src>` pointed at
  `http://127.0.0.1:9221/json/version` would reach this container's own
  unauthenticated DevTools endpoint. Only Docker's DNS resolver
  (`127.0.0.11`), nginx's own uid (the nginx → Chromium hop), and root (this
  entrypoint, the `HEALTHCHECK`) may use loopback - see the comment in
  [`egress.nft`](egress.nft).

`entrypoint.sh` runs all three services and exits (bringing the container
down for Docker to restart) if any of them stops.

Because the filter matches the **real destination IP at `connect()` time**,
in-kernel:

* DNS-rebinding doesn't help an attacker — the name is re-resolved by the
  kernel path and the *connection* is what's checked, not an earlier lookup.
* Redirects and sub-resources are covered — every hop is a fresh `connect()`.
* Non-HTTP egress (WebRTC, etc.) is covered too.

`--cap-add=NET_ADMIN` is required to install the ruleset. If it's missing the
entrypoint **exits non-zero** rather than coming up with no filter.

## Trust model

The DevTools endpoint and the proxy are **unauthenticated**. Network scope is
the access control: keep `airlock` on a Docker network shared **only** with the
Blot app containers. Nothing about `airlock` should be published to the host.

`airlock` itself only ever holds a rendered screenshot or a downloaded asset
in `/tmp` and `/home/airlock/profile` — no secrets, no data mount, no cloud
identity.

## Configuration (the app side)

`config/index.js` reads two env vars; both unset ⇒ the app fetches directly
with **no SSRF protection** (fine for local dev, not for production):

| Env var | Example | Used by |
| --- | --- | --- |
| `BLOT_AIRLOCK_BROWSER_URL` | `http://airlock:9222` | `app/helper/screenshot` |
| `BLOT_AIRLOCK_PROXY_URL` | `http://airlock:8888` | `app/helper/transformer/download` |

## Local development

Wired into [`scripts/development/docker-compose.yml`](../../scripts/development/docker-compose.yml)
as the `airlock` service, with the two env vars set on `node-app`. Just:

```
docker compose -f scripts/development/docker-compose.yml up
```

Comment out the two `BLOT_AIRLOCK_*` lines to bypass it.

## Production

Not yet wired into `scripts/deploy`. To roll out:

1. **Build & push** the image alongside the app image (add a matrix entry to
   `.github/workflows/build.yml`, context `config/airlock`), e.g.
   `ghcr.io/davidmerfield/blot-airlock:<tag>`.

2. **On each app host**, once, create a user-defined network and run the
   sidecar:

   ```sh
   docker network create blotnet 2>/dev/null || true

   docker run -d --name blot-airlock --restart unless-stopped \
     --network blotnet \
     --cap-add=NET_ADMIN \
     --security-opt no-new-privileges \
     --memory=1g --cpus=1 \
     --log-driver json-file --log-opt max-size=64m --log-opt max-file=1 \
     ghcr.io/davidmerfield/blot-airlock:<tag>
   ```

3. **Attach the app containers** to `blotnet` and set the env vars. In
   [`scripts/deploy/util/generateDockerCommand.js`](../../scripts/deploy/util/generateDockerCommand.js)
   add to the `docker run` array:

   ```js
   "--network blotnet",
   "-e BLOT_AIRLOCK_BROWSER_URL=http://blot-airlock:9222",
   "-e BLOT_AIRLOCK_PROXY_URL=http://blot-airlock:8888",
   ```

   This is the one step here that touches running production containers, and
   it's more than the one-liner it looks like: moving a container off the
   default `bridge` network onto `blotnet` also moves its gateway - the host
   stops being reachable at `172.17.0.1` and becomes `blotnet`'s gateway
   address instead. `config/index.js` reads `BLOT_REDIS_HOST` (default
   `127.0.0.1`) and `BLOT_REVERSE_PROXY_URLS` from `ENV_FILE_ON_SERVER`, so
   whether this is a no-op depends on how those are set on the live hosts -
   check both for a hardcoded bridge-gateway address **before** switching
   networks, and roll one container at a time given blue/green/yellow is
   already the deploy shape.

   (The published `-p` port mapping for the app's own HTTP port still works
   after the network change.)

4. **Harden the instance metadata service** while you're here — defence in
   depth for any other fetch in the app:

   ```sh
   aws ec2 modify-instance-metadata-options --instance-id i-xxxx \
     --http-tokens required --http-put-response-hop-limit 1 --http-endpoint enabled
   ```

## Known sinks not covered

Besides [`app/templates/screenshots.js`](../../app/templates/screenshots.js)
(template-gallery previews - **no** user input, its URLs are built entirely
from `config.host`; deliberately left on a locally-launched Chromium, don't
set `BLOT_AIRLOCK_BROWSER_URL` for that job), two more places take a
user-controlled hostname and fetch it from the app container, not routed
through `airlock`:

* [`app/dashboard/site/domain/verify.js`](../../app/dashboard/site/domain/verify.js)
  — a hostname the user typed into the dashboard, `fetch("http://" + hostname + "/verify/domain-setup")`.
* [`app/documentation/featured/verifySiteIsOnline.js`](../../app/documentation/featured/verifySiteIsOnline.js)
  — same shape, `https://<host>/verify/domain-setup`.

Both are **blind**: the response body is compared against the blog's handle,
never echoed back to the user, so they're not a read primitive the way
`linkScreenshot` and `transformer/download` are. They can still reach an
internal address from a user-supplied hostname, though, so routing them
through `airlock`'s proxy is worth doing - just not done in this PR. Treat
this list as "known and accepted for now," not exhaustive; grep for
user-controlled `fetch`/`request` calls in `app/build` and `app/dashboard`
before relying on it.

## Verifying

```sh
# metadata + private ranges are unreachable from inside the container
docker exec blot-airlock sh -c 'curl -m3 -sS http://169.254.169.254/ ; echo exit=$?'
docker exec blot-airlock sh -c 'curl -m3 -sS http://10.0.0.1/       ; echo exit=$?'
# the public internet still works
docker exec blot-airlock sh -c 'curl -m5 -sS -o /dev/null -w "%{http_code}\n" https://example.com'
# the proxy path works end to end
docker exec blot-airlock sh -c 'curl -m5 -sS -x http://127.0.0.1:8888 -o /dev/null -w "%{http_code}\n" https://example.com'
# the container's own DevTools endpoint is NOT reachable through the proxy
# (this is the loopback confinement above - it must time out, not 200)
docker exec blot-airlock sh -c 'curl -m3 -sS -x http://127.0.0.1:8888 http://127.0.0.1:9221/json/version ; echo exit=$?'
```

The Jasmine spec [`app/build/plugins/linkScreenshot/tests.js`](../../app/build/plugins/linkScreenshot/tests.js)
stubs `helper/screenshot` and asserts, per URL, whether it was called - so it
pins the actual boundary between refused and allowed (including that the
metadata address is deliberately *not* refused at that layer), not just "the
HTML wasn't rewritten," which a plugin that rejected everything would also
satisfy.

## Limitations

* **Always run it on a user-defined Docker network**, never the default
  bridge. On a user-defined network DNS is Docker's embedded resolver at
  `127.0.0.11` (reached over loopback, which the filter allows). On the
  default bridge `/etc/resolv.conf` points at a private address that the
  filter drops, so name resolution fails. Dev compose and the production
  steps above both use a named network.
* `airlock` becomes a build-pipeline dependency: if it's down, bookmark
  screenshots and remote-image transforms fail (they already degrade
  gracefully — the post builds without the image). Give it a restart policy
  and watch the healthcheck.
* The `172.16.0.0/12` drop also stops `airlock` reaching sibling containers on
  a Docker bridge — intended.
* `app/templates/screenshots.js` (the template-gallery build tool) has **no**
  user input and is left on a locally-launched Chromium; don't set
  `BLOT_AIRLOCK_BROWSER_URL` for that job.
* **Chromium/Puppeteer version drift.** `package.json` pins `puppeteer`;
  `alpine:3.20`'s `chromium` apk floats with the base image and is a
  different release train. The Dockerfile records the version it shipped
  with in `/etc/airlock/chromium-version` (also logged at container start)
  precisely so a drift shows up there before it shows up as bookmark
  screenshots silently failing in production after an image rebuild.
* In production, `config/index.js` only **warns** (`console.warn`, on
  startup) if `BLOT_AIRLOCK_BROWSER_URL` / `BLOT_AIRLOCK_PROXY_URL` are unset
  - it does not refuse to start. A hard failure was rejected on purpose: the
  production deploy wiring above hasn't landed yet, so a startup crash here
  would just take every app container down. Once the sidecar + env vars are
  actually deployed, consider tightening this to fail closed.
