#!/usr/bin/env bash
# One-shot deploy of Sharondale to a server you can SSH into.
#
#   ./deploy/vps/deploy.sh user@your-server
#
# What it does, and why:
#   * builds the image on the server (no registry needed),
#   * runs ONE container with a named volume at /app/data, so the SQLite board
#     survives restarts and redeploys,
#   * puts the app on the server's loopback only,
#   * publishes it with Tailscale Serve, which gives a real HTTPS address on your
#     private tailnet (https://sharondale.<tailnet>.ts.net). No open port, no
#     certificate to renew.
#
# It is idempotent: run it again to deploy a new version. The volume is kept.
#
# Requirements on the target:
#   * Docker,
#   * a Tailscale auth key: https://login.tailscale.com/admin/settings/keys
#     (reusable, and "Pre-approved" so Serve/HTTPS works without extra prompts),
#   * SHARONDALE_TOKEN - the access code caretakers type into the dashboard.
#
# Both are read from the environment on the machine you run this from:
#
#   export TS_AUTHKEY=tskey-auth-...
#   export SHARONDALE_TOKEN=1234
#   ./deploy/vps/deploy.sh user@your-server
set -euo pipefail

TARGET="${1:-}"
HOSTNAME_TS="${SHARONDALE_HOSTNAME:-sharondale}"

if [ -z "$TARGET" ]; then
  echo "usage: TS_AUTHKEY=... SHARONDALE_TOKEN=... $0 user@host" >&2
  exit 1
fi
if [ -z "${TS_AUTHKEY:-}" ] || [ -z "${SHARONDALE_TOKEN:-}" ]; then
  echo "Set TS_AUTHKEY and SHARONDALE_TOKEN first. See the header of this script." >&2
  exit 1
fi

REMOTE_DIR="/opt/sharondale"
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "Copying the app to $TARGET:$REMOTE_DIR ..."
ssh "$TARGET" "sudo mkdir -p $REMOTE_DIR && sudo chown \$(id -u):\$(id -g) $REMOTE_DIR"
tar --exclude=.git --exclude=data --exclude=node_modules -C "$REPO_DIR" -czf - . \
  | ssh "$TARGET" "tar -xzf - -C $REMOTE_DIR"

echo "Building and starting the container ..."
ssh "$TARGET" bash -s <<EOF
set -euo pipefail
cd "$REMOTE_DIR"
# The write code never goes into the image or the repo; it is passed in here.
printf 'SHARONDALE_TOKEN=%s\n' "$SHARONDALE_TOKEN" > .env
chmod 600 .env
docker build -t sharondale .
if docker ps -a --format '{{.Names}}' | grep -qx sharondale; then
  docker rm -f sharondale
fi
# One instance only: the board is a single SQLite file.
docker run -d --name sharondale --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e SHARONDALE_TOKEN="$SHARONDALE_TOKEN" \
  -v sharondale-data:/app/data \
  sharondale
docker run --rm --network host node:22-alpine sh -c \
  'for i in \$(seq 1 30); do curl -fsS http://127.0.0.1:3000/api/health && exit 0; sleep 1; done; exit 1'
EOF

echo "Publishing it over Tailscale ..."
ssh "$TARGET" bash -s <<EOF
set -euo pipefail
command -v tailscale >/dev/null 2>&1 || { echo "Tailscale is not installed on the server. Install it or use docker-compose.yml instead." >&2; exit 1; }
sudo tailscale up --authkey "$TS_AUTHKEY" --hostname "$HOSTNAME_TS"
sudo tailscale serve --bg --https=443 http://127.0.0.1:3000
sudo tailscale serve status
EOF

echo
echo "Done. Open https://$HOSTNAME_TS.<your-tailnet>.ts.net from a device signed in to your tailnet."
echo "Then check it:  BASE_URL=https://$HOSTNAME_TS.<your-tailnet>.ts.net node tests/verify-deploy.mjs"
