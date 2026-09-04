# airlock

The single egress boundary for fetching **untrusted, user-supplied URLs** in
Blot's build pipeline.

Two things in Blot fetch a URL that a user controls, on Blot's own
infrastructure, and show the result back to that user:

| Caller | User input | What it does |
| --- | --- | --- |
| [`app/build/plugins/linkScreenshot`](../../app/build/plugins/linkScreenshot) | `href` from an uploaded `.webloc` / `.url` bookmark file | screenshots the page, embeds the image in the post |
| [`app/helper/transformer/download`](../../app/helper/transformer/download) | `<img src>` / `![](…)` in a post | downloads the asset, caches it, rewrites to the CDN |

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
  `app/helper/transformer/download` points `node-fetch` at.
* **[`egress.nft`](egress.nft)** — installed by
  [`entrypoint.sh`](entrypoint.sh) before any service starts. It `drop`s
  every RFC1918 / loopback / link-local / ULA / CGNAT / documentation /
  benchmark / multicast / reserved destination, v4 and v6. The cloud metadata
  address `169.254.169.254` is inside `169.254.0.0/16`.

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

   (`--network` replaces the default bridge; the published `-p` port mapping
   still works.)

4. **Harden the instance metadata service** while you're here — defence in
   depth for any other fetch in the app:

   ```sh
   aws ec2 modify-instance-metadata-options --instance-id i-xxxx \
     --http-tokens required --http-put-response-hop-limit 1 --http-endpoint enabled
   ```

## Verifying

```sh
# metadata + private ranges are unreachable from inside the container
docker exec blot-airlock sh -c 'curl -m3 -sS http://169.254.169.254/ ; echo exit=$?'
docker exec blot-airlock sh -c 'curl -m3 -sS http://10.0.0.1/       ; echo exit=$?'
# the public internet still works
docker exec blot-airlock sh -c 'curl -m5 -sS -o /dev/null -w "%{http_code}\n" https://example.com'
# the proxy path works end to end
docker exec blot-airlock sh -c 'curl -m5 -sS -x http://127.0.0.1:8888 -o /dev/null -w "%{http_code}\n" https://example.com'
```

The Jasmine spec [`app/build/plugins/linkScreenshot/tests.js`](../../app/build/plugins/linkScreenshot/tests.js)
covers the app-side URL rejection (protocol allow-list, credentials) that sits
in front of `airlock` as cheap defence in depth.

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
