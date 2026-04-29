#!/usr/bin/env bash
set -euo pipefail

EMQX_API_URL="${EMQX_API_URL:-http://localhost:18083}"
EMQX_DASHBOARD_USERNAME="${EMQX_DASHBOARD_USERNAME:-admin}"
EMQX_DASHBOARD_PASSWORD="${EMQX_DASHBOARD_PASSWORD:-public123}"
ZIOT_WEBHOOK_BASE_URL="${ZIOT_WEBHOOK_BASE_URL:-http://web:3000}"

login_payload=$(
  jq -cn \
    --arg username "$EMQX_DASHBOARD_USERNAME" \
    --arg password "$EMQX_DASHBOARD_PASSWORD" \
    '{username: $username, password: $password}'
)

token=$(
  curl -fsS \
    -X POST "$EMQX_API_URL/api/v5/login" \
    -H "content-type: application/json" \
    -d "$login_payload" |
    jq -r ".token"
)

api() {
  curl -fsS \
    -H "authorization: Bearer $token" \
    -H "content-type: application/json" \
    "$@"
}

connector_payload=$(
  jq -cn \
    --arg url "$ZIOT_WEBHOOK_BASE_URL" \
    '{
      type: "http",
      name: "ziot_webhook_connector",
      url: $url,
      enable: true,
      headers: {
        "content-type": "application/json"
      },
      pool_size: 1
    }'
)

action_payload=$(
  jq -cn \
    '{
      type: "http",
      name: "ziot_lifecycle_webhook",
      connector: "ziot_webhook_connector",
      enable: true,
      parameters: {
        method: "post",
        path: "/api/internal/emqx/webhook",
        headers: {
          "content-type": "application/json",
          "x-request-source": "emqx"
        },
        body: "{\"event\":\"${event}\",\"username\":\"${username}\",\"clientid\":\"${clientid}\"}"
      },
      resource_opts: {
        query_mode: "sync",
        worker_pool_size: 1
      }
    }'
)

command_reply_action_payload=$(
  jq -cn \
    '{
      type: "http",
      name: "ziot_command_reply_webhook",
      connector: "ziot_webhook_connector",
      enable: true,
      parameters: {
        method: "post",
        path: "/api/internal/emqx/webhook",
        headers: {
          "content-type": "application/json",
          "x-request-source": "emqx"
        },
        body: "{\"topic\":\"${topic}\",\"payload\":${payload}}"
      },
      resource_opts: {
        query_mode: "sync",
        worker_pool_size: 1
      }
    }'
)

rule_payload=$(
  jq -cn \
    '{
      id: "ziot_lifecycle_events",
      name: "ZiOT lifecycle events",
      enable: true,
      sql: "SELECT event, username, clientid FROM \"$events/client_connected\", \"$events/client_disconnected\"",
      actions: ["http:ziot_lifecycle_webhook"]
    }'
)

command_reply_rule_payload=$(
  jq -cn \
    '{
      id: "ziot_command_reply_events",
      name: "ZiOT command reply events",
      enable: true,
      sql: "SELECT topic, payload FROM \"/sys/+/+/thing/service/+/reply\"",
      actions: ["http:ziot_command_reply_webhook"]
    }'
)

api -X DELETE "$EMQX_API_URL/api/v5/rules/ziot_lifecycle_events" >/dev/null 2>&1 || true
api -X DELETE "$EMQX_API_URL/api/v5/rules/ziot_command_reply_events" >/dev/null 2>&1 || true
api -X DELETE "$EMQX_API_URL/api/v5/actions/http:ziot_lifecycle_webhook" >/dev/null 2>&1 || true
api -X DELETE "$EMQX_API_URL/api/v5/actions/http:ziot_command_reply_webhook" >/dev/null 2>&1 || true
api -X DELETE "$EMQX_API_URL/api/v5/connectors/http:ziot_webhook_connector" >/dev/null 2>&1 || true

api -X POST "$EMQX_API_URL/api/v5/connectors" -d "$connector_payload" >/dev/null
api -X POST "$EMQX_API_URL/api/v5/actions" -d "$action_payload" >/dev/null
api -X POST "$EMQX_API_URL/api/v5/actions" -d "$command_reply_action_payload" >/dev/null
api -X POST "$EMQX_API_URL/api/v5/rules" -d "$rule_payload" >/dev/null
api -X POST "$EMQX_API_URL/api/v5/rules" -d "$command_reply_rule_payload" >/dev/null

echo "EMQX lifecycle webhook configured: $ZIOT_WEBHOOK_BASE_URL/api/internal/emqx/webhook"
echo "EMQX command reply webhook configured: $ZIOT_WEBHOOK_BASE_URL/api/internal/emqx/webhook"
