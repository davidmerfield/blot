# Containerised OpenResty proxy (build-only scaffolding)

This directory is a work-in-progress containerisation of the OpenResty reverse
proxy that currently runs on bare metal from [`config/openresty`](../config/openresty).

**It is not wired to production.** Nothing here is deployed, and merging it
changes no running system. The goal at this stage is only that the image
builds, the generated config is valid, and the container boots and serves a
health check, so the work stops rotting while the remaining pieces are done
separately.

## Layout

| Path | Purpose |
| --- | --- |
| `config/` | Source `.conf` / `.lua` files (a hand-maintained fork of `config/openresty/conf`). |
| `build/index.js` | Renders `config/server.conf` + partials into a single `openresty.conf`. |
| `build/build.sh` | Wrapper that runs `build/index.js` with the container's paths. Run this before `docker build`. |
| `build/data/latest/` | Generated output (git-ignored). |
| `Dockerfile` | Two-stage build: vendors the Lua deps, then assembles the image. |
| `entrypoint.sh` | Validates `BLOT_HOST` and a certificate is present, then starts OpenResty. |

## Build and run locally

```sh
bash proxy/build/build.sh
docker build -f proxy/Dockerfile -t blot-proxy proxy/
docker run --rm --cap-add SYS_NICE -p 8080:80 -p 8443:443 \
  -e BLOT_HOST=example.com blot-proxy
curl -i http://localhost:8080/health   # -> 200
```

`--cap-add SYS_NICE` avoids a harmless `setpriority(-20) failed` alert from
`worker_priority` in an unprivileged container.

CI runs the same steps in [`.github/workflows/proxy.yml`](../.github/workflows/proxy.yml)
on any change under `proxy/`.

## Pinned dependencies

Reproducibility relies on pinning, because the upstream toolchain has drifted:

- Base image `openresty/openresty:1.25.3.1-alpine-fat` — newer `alpine-fat`
  tags ship GCC 14, which will not compile `sockproc`.
- Lua modules (`lua-resty-auto-ssl` 0.13.1, `lua-resty-http` 0.17.2,
  `shell-games` 1.1.0) are fetched as checksummed `.src.rock` archives from
  luarocks.org rather than via the images' bundled `luarocks`, whose remote
  manifest no longer loads.
- `resty.auto-ssl.vendor.shell` and `sockproc` are pinned to the same commits
  the `lua-resty-auto-ssl` Makefile uses.

## Not done yet (deferred, intentionally)

1. **Certificate issuance.** The image ships a self-signed placeholder at
   `/etc/ssl/private/letsencrypt-domain.{pem,key}` so OpenResty can start.
   `entrypoint.sh` no longer shells out to `acme-nginx`. On-demand issuance for
   custom blog domains still needs `lua-resty-auto-ssl` wired to Redis + a
   working `sockproc` + the `dehydrated` hook scripts, none of which are
   exercised here. For now, mount a real cert over those paths.
2. **Zero-downtime deployment.** Replacing the container drops the `:80`/`:443`
   listening socket. Config-only changes can still use `openresty -s reload`
   against a bind-mounted config dir; container/image replacement needs a
   blue/green mechanism (`SO_REUSEPORT` on `--network host`, or iptables
   port-shifting). Out of scope for this PR.
3. **Config de-duplication.** `proxy/config/` is a fork of
   `config/openresty/conf/` and omits the rate-limit and bot-restriction
   includes (`restrict-bot-uas.conf`, `reverse-proxy-limit-*.conf`, …). These
   two copies should become one source.
4. **Persistent volumes.** The proxy cache (`/var/cache/openresty`) and
   `lua-resty-auto-ssl` storage (`/etc/resty-auto-ssl`) must be volumes so a
   redeploy does not cold-start the cache or re-request certificates.
5. **Cache integration tests.** A `proxy/tests/` suite exists on the older
   `containerize-proxy` branch. It is kept out of this PR because it needs
   OpenResty and Redis available to the runner; it will land in the follow-up
   that wires it into CI as its own test suite.
