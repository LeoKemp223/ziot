#!/usr/bin/env bash
# 从 /etc/letsencrypt 同步证书到 deploy/certs（nginx 与 emqx 容器挂载用）。
# 权限 640 + 属主 1000:1000（emqx 容器内用户 uid 为 1000，nginx master 为 root，都能读）。
set -euo pipefail

CERTBOT_ROOT="${CERTBOT_ROOT:-/etc/letsencrypt}"
DOMAIN="${1:-www.ziot.asia}"
LIVE="$CERTBOT_ROOT/live/$DOMAIN"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)/certs"

[ -f "$LIVE/fullchain.pem" ] || { echo "cert not found: $LIVE (先跑 certbot)"; exit 1; }

mkdir -p "$OUT_DIR"
install -m 640 -o 1000 -g 1000 "$LIVE/fullchain.pem" "$OUT_DIR/fullchain.pem"
install -m 640 -o 1000 -g 1000 "$LIVE/privkey.pem" "$OUT_DIR/privkey.pem"
install -m 640 -o 1000 -g 1000 "$LIVE/chain.pem" "$OUT_DIR/chain.pem"

echo "certs synced to $OUT_DIR"
