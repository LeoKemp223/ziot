#!/usr/bin/env sh
# 清理 Docker 构建产物与过期镜像（保守模式，生产卷/网络/运行中容器不动）。
#
# 用法：
#   scripts/docker-cleanup.sh          # 清 exited 容器 + 悬空镜像 + 构建缓存（保留最近 1GB，deps 层缓存还能命中）
#   scripts/docker-cleanup.sh --full   # 激进：连未被容器引用的镜像和全部构建缓存一起清
set -eu

# 默认保留 2GB 近期构建缓存：pnpm deps 层约 1.6GB，留住它下次重建只需 ~30s
KEEP_STORAGE="${DOCKER_BUILD_CACHE_KEEP:-2GB}"

echo "== before =="
docker system df

echo
echo "== prune exited containers =="
docker container prune -f

echo "== prune dangling images =="
if [ "${1:-}" = "--full" ]; then
  docker image prune -a -f
else
  docker image prune -f
fi

echo "== prune build cache (keep recent ${KEEP_STORAGE}) =="
if [ "${1:-}" = "--full" ]; then
  docker builder prune -a -f
else
  docker builder prune -f --keep-storage "${KEEP_STORAGE}"
fi

echo
echo "== after =="
docker system df
