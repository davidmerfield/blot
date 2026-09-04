# Airlock: the single egress boundary for fetching untrusted, user-supplied
# URLs from Blot's build pipeline.
#
#   * Chromium (headless) with the DevTools protocol on :9222 - used by
#     app/helper/screenshot to screenshot bookmark links.
#   * tinyproxy on :8888 - an HTTP(S) forward proxy that app/helper/transformer
#     /download points node-fetch at, so downloads of remote assets referenced
#     in posts leave from inside this container's network namespace.
#
# entrypoint.sh installs an nftables egress filter (egress.nft) that DROPs
# every private / link-local / ULA / special-use destination - including the
# cloud metadata address 169.254.169.254 - before either service starts.
# Because the filter matches the real destination IP at connect() time, in
# kernel, it also defeats DNS-rebinding and covers redirects and sub-resources
# that application-level URL checks miss.
#
# Run with:  --cap-add=NET_ADMIN            (to install the ruleset)
# Keep it on a Docker network shared ONLY with the Blot app containers - the
# DevTools endpoint and the proxy are unauthenticated, so network scope is the
# access control.
#
# See config/airlock/README.md for the full rationale and deploy steps.

FROM alpine:3.20

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    font-noto-emoji \
    ca-certificates \
    tinyproxy \
    nginx \
    nftables \
    su-exec \
    tini \
    curl

# Dedicated unprivileged user that Chromium, nginx and tinyproxy run as.
RUN addgroup -S airlock \
 && adduser -S -G airlock -u 1001 -h /home/airlock airlock \
 && mkdir -p /home/airlock/profile /var/lib/nginx/logs /var/log/nginx \
 && chown -R airlock:airlock /home/airlock /var/lib/nginx /var/log/nginx

COPY egress.nft /etc/airlock/egress.nft
COPY tinyproxy.conf /etc/tinyproxy/tinyproxy.conf
COPY nginx.conf /etc/airlock/nginx.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV CHROMIUM_BIN=/usr/bin/chromium-browser \
    AIRLOCK_BROWSER_PORT=9222 \
    AIRLOCK_CHROMIUM_PORT=9221 \
    AIRLOCK_PROXY_PORT=8888

EXPOSE 9222 8888

# Checks both services locally, with no outbound traffic: the DevTools HTTP
# endpoint via the nginx front, and tinyproxy's stats page (StatHost).
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${AIRLOCK_BROWSER_PORT}/json/version" >/dev/null \
   && curl -fsS -x "http://127.0.0.1:${AIRLOCK_PROXY_PORT}" "http://tinyproxy.stats/" >/dev/null \
   || exit 1

# No USER: the entrypoint must start as root to install the nft ruleset,
# then drops to the 'airlock' user with su-exec.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
