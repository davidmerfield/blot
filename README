Blot is a site generator. Blot turns a folder into a website. The point of all this — the reason Blot exists — is so you can use your favorite tools to create whatever you publish. Please don’t hesitate to contact me with any questions: 

support@blot.im

The general architecture of Blot is:

The internet <> Reverse proxy (Openresty) <> Blot (express.js node application) <> Redis

To get Blot running locally, you will need Docker, mkcert and dnsmasq. 

Once you have Docker installed and running, clone the repository:

git clone https://github.com/davidmerfield/blot --depth 1

Blot requires a huge number of subdomains to work e.g.

https://local.blot
https://cdn.local.blot
https://site.local.blot
https://preview-of-blog-on-site.local.blot
https://preview-of-hypertext-on-site.local.blot

etc...

We use dnsmasq to point all requests to the fake TLD '.blot' to the loopback:

brew install dnsmasq
mkdir -pv $(brew --prefix)/etc/
echo 'address=/.blot/127.0.0.1' >> $(brew --prefix)/etc/dnsmasq.conf
echo 'port=53' >> $(brew --prefix)/etc/dnsmasq.conf
sudo brew services start dnsmasq
sudo mkdir -v /etc/resolver
sudo bash -c 'echo "nameserver 127.0.0.1" > /etc/resolver/blot'

To create the SSL certificate required for this to work locally, we use:

brew install mkcert nss

Then start the server:

npm start

### Redis fault injection in development (Toxiproxy)

The development compose stack now includes a `toxiproxy` hop between the app and Redis:

`node-app -> toxiproxy:26379 -> redis:6379`

It is enabled by default in development and configures:

- latency with jitter (default `50ms ± 20ms`)
- packet loss (default `2%`)
- packet reordering (default `10%`)

You can tune this when starting the dev environment:

```bash
BLOT_TOXIPROXY_LATENCY_MS=80 \
BLOT_TOXIPROXY_JITTER_MS=30 \
BLOT_TOXIPROXY_PACKET_LOSS_PERCENT=5 \
BLOT_TOXIPROXY_REORDER_PERCENT=15 \
npm start
```

To disable fault injection entirely:

```bash
BLOT_USE_TOXIPROXY=false npm start
```
