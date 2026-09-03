#!/usr/bin/env bash
# 生产部署/更新脚本（deploy/docker-compose.prod.yml 单机栈）。
#
# 用法（模块可组合）：
#   scripts/prod-deploy.sh                 # 全量：构建 → 结构同步(有差异才推) → up -d → 重启 nginx → 健康验证
#   scripts/prod-deploy.sh app             # web + worker（共享 ziot-app:prod 镜像，最常见）
#   scripts/prod-deploy.sh web             # 只更新 web（构建 + 重建 web；web 换 IP 后自动重启 nginx）
#   scripts/prod-deploy.sh worker          # 只更新 worker
#   scripts/prod-deploy.sh db              # 只同步数据库结构（prisma migrate diff 检测，无差异直接跳过）
#   scripts/prod-deploy.sh infra           # nginx/emqx 配置变更后重建（force-recreate 绕过单文件挂载 inode 坑）
#   scripts/prod-deploy.sh postgres        # 其它 compose 服务（redis/minio/emqx/nginx 同理）：force-recreate
#
# emqx 被重建后自动重跑 scripts/setup-emqx-webhook.sh（规则存在 /opt/emqx/data 卷，双保险）。
# 环境变量：PUBLIC_DOMAIN（健康检查域名，默认 www.ziot.asia）
set -eu

cd "$(dirname "$0")/.."

ENV_FILE="deploy/prod.env"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
DOMAIN="${PUBLIC_DOMAIN:-www.ziot.asia}"
HEALTH_URL="https://${DOMAIN}/api/v1/health"

usage() {
  cat >&2 <<'EOF'
用法: scripts/prod-deploy.sh [模块...]（可组合，默认 all）
  all       全量：构建 → 结构同步(有差异才推) → up -d → 重启 nginx → 健康验证
  app       web + worker（共享 ziot-app:prod 镜像）
  web       只更新 web（自动重启 nginx）
  worker    只更新 worker
  db        只同步数据库结构（无差异跳过）
  infra     nginx/emqx 配置变更后重建（emqx 重建后自动重配 webhook 规则）
  postgres|redis|minio|emqx|nginx   单独 force-recreate 某服务
环境变量: PUBLIC_DOMAIN（默认 www.ziot.asia）
EOF
  exit 1
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

# 在 web 容器（当前镜像）里跑 prisma 命令
prisma() {
  compose run --rm --no-deps -T web pnpm --filter @ziot/db exec prisma "$@"
}

wait_service_healthy() {
  local svc="$1" i=0 status
  while [ "$i" -lt 30 ]; do
    status="$(docker inspect --format '{{.State.Health.Status}}' "ziot-${svc}-1" 2>/dev/null || echo missing)"
    if [ "$status" = "healthy" ]; then
      echo "$svc: healthy"
      return 0
    fi
    i=$((i + 1))
    sleep 5
  done
  echo "$svc 健康检查超时（150s），查看: compose logs $svc" >&2
  return 1
}

wait_http_healthy() {
  local i=0
  echo "== 健康验证 $HEALTH_URL =="
  while [ "$i" -lt 24 ]; do
    if curl -sf -o /dev/null "$HEALTH_URL"; then
      echo "health: ok"
      return 0
    fi
    i=$((i + 1))
    sleep 5
  done
  echo "HTTP 健康检查超时（120s）" >&2
  return 1
}

# 数据库结构同步：migrate diff 先探测，无差异不动库；db push 被拒时给出人工确认命令
sync_db() {
  local out rc
  echo "== 检查数据库结构差异 =="
  set +e
  out="$(prisma migrate diff \
    --from-config-datasource \
    --to-schema prisma/schema.prisma \
    --exit-code 2>&1)"
  rc=$?
  set -e
  if [ "$rc" -eq 0 ]; then
    echo "结构已一致，跳过 db push"
    return 0
  fi
  if [ "$rc" -ne 2 ]; then
    # 0=无差异 2=有差异，其余是命令本身失败（连不上库等），不能当差异处理
    printf '%s\n' "$out" >&2
    echo "migrate diff 执行失败（rc=$rc）" >&2
    return 1
  fi
  printf '%s\n' "$out" | head -20
  echo "== 检测到结构差异，执行 prisma db push =="
  if ! prisma db push --schema prisma/schema.prisma; then
    cat >&2 <<'HINT'
db push 被拒：通常是 prisma 对潜在数据损失的例行警告（如给全新列加唯一索引）。
人工确认变更安全后执行：
  docker compose --env-file deploy/prod.env -f deploy/docker-compose.prod.yml \
    run --rm --no-deps web pnpm --filter @ziot/db exec prisma db push \
    --schema prisma/schema.prisma --accept-data-loss
HINT
    return 1
  fi
}

# 重建 EMQX webhook 规则（setup-emqx-webhook.sh 幂等：先删后建）
setup_webhooks() {
  echo "== 重配 EMQX webhook 规则 =="
  set -a
  # shellcheck disable=SC1090
  . <(grep -E '^(EMQX_DASHBOARD_USERNAME|EMQX_DASHBOARD_PASSWORD)=' "$ENV_FILE")
  set +a
  EMQX_API_URL=http://localhost:18083 ZIOT_WEBHOOK_BASE_URL=http://web:3000 \
    bash scripts/setup-emqx-webhook.sh
}

[ -f "$ENV_FILE" ] || { echo "缺少 $ENV_FILE（生产凭证，生成方式见 docs/deployment/production.md）" >&2; exit 1; }

# ---------- 解析模块：app 先展开成 web worker ----------
if [ $# -eq 0 ]; then
  set -- all
fi
EXPANDED=""
for module in "$@"; do
  if [ "$module" = "app" ]; then
    EXPANDED="$EXPANDED web worker"
  else
    EXPANDED="$EXPANDED $module"
  fi
done

WANT_BUILD=0
WANT_DB=0
UP_ALL=0
UP_SERVICES=""
FORCE_SERVICES=""
WANT_NGINX_RESTART=0

for module in $EXPANDED; do
  case "$module" in
    all)    WANT_BUILD=1; WANT_DB=1; UP_ALL=1; WANT_NGINX_RESTART=1 ;;
    web)    WANT_BUILD=1; UP_SERVICES="$UP_SERVICES web"; WANT_NGINX_RESTART=1 ;;
    worker) WANT_BUILD=1; UP_SERVICES="$UP_SERVICES worker" ;;
    db)     WANT_DB=1 ;;
    infra)  FORCE_SERVICES="$FORCE_SERVICES nginx emqx" ;;
    postgres|redis|minio|emqx|nginx) FORCE_SERVICES="$FORCE_SERVICES $module" ;;
    *)      echo "未知模块: $module" >&2; usage ;;
  esac
done

# ---------- 执行 ----------
emqx_id() { docker inspect --format '{{.Id}}' ziot-emqx-1 2>/dev/null || true; }
EMQX_ID_BEFORE="$(emqx_id)"

if [ "$WANT_BUILD" -eq 1 ]; then
  echo "== 构建镜像 ziot-app:prod =="
  compose build web
fi

if [ "$WANT_DB" -eq 1 ]; then
  sync_db
fi

if [ "$UP_ALL" -eq 1 ]; then
  echo "== 启动全部服务 =="
  compose up -d
elif [ -n "${UP_SERVICES# }" ]; then
  echo "== 更新服务:${UP_SERVICES} =="
  # shellcheck disable=SC2086
  compose up -d $UP_SERVICES
fi

if [ -n "${FORCE_SERVICES# }" ]; then
  echo "== 强制重建(应用配置变更):${FORCE_SERVICES} =="
  # shellcheck disable=SC2086
  compose up -d --force-recreate $FORCE_SERVICES
fi

if [ "$WANT_NGINX_RESTART" -eq 1 ]; then
  echo "== 重启 nginx（web 容器 IP 变化，upstream 仅启动时解析）=="
  compose restart nginx
fi

# emqx 容器有重建（不论 up -d 还是 force-recreate 触发）：等健康后重配 webhook 规则。
# 规则存在 /opt/emqx/data 卷里理论上不丢，这里幂等重配一次做双保险（也覆盖首次部署）。
if [ "$(emqx_id)" != "$EMQX_ID_BEFORE" ]; then
  echo "== 检测到 emqx 容器重建 =="
  wait_service_healthy emqx
  setup_webhooks
fi

for svc in web worker; do
  if [ "$UP_ALL" -eq 1 ] || case " $UP_SERVICES $FORCE_SERVICES " in *" $svc "*) true;; *) false;; esac; then
    wait_service_healthy "$svc"
  fi
done

wait_http_healthy
echo
compose ps --format 'table {{.Name}}\t{{.Status}}'
echo "部署完成: $HEALTH_URL"
