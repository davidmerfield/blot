#!/usr/bin/env bash
# Per-boot reconciliation for the Blot dev environment. Brings up the daemons
# every Cloud Agent needs before the application stack can run:
#   - the Docker daemon (fuse-overlayfs graph driver)
#   - bridge-netfilter disabled, so same-network container-to-container traffic
#     is L2-switched instead of being dropped by nftables in this nested VM
#   - dnsmasq resolving *.blot to loopback
#   - the locally-trusted wildcard TLS certificate
# It is idempotent, launches nothing in the foreground, and then returns.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$DIR/start-docker.sh"

# In this nested VM, packets between containers on the same Docker bridge are
# handed to nftables (bridge-nf-call-iptables=1) and silently dropped. Disable
# bridge netfilter so intra-network traffic (e.g. node-app -> redis) flows.
sudo sysctl -w net.bridge.bridge-nf-call-iptables=0 >/dev/null 2>&1 || true
sudo sysctl -w net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true

bash "$DIR/start-dns.sh"
bash "$DIR/certs.sh"

echo "[start] Blot dev environment daemons ready"
