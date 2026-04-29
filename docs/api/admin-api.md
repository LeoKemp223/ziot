# 后台管理 API 文档

版本：v0.1  
更新日期：2026-04-29  
当前状态：本文件只记录本地已实现并验证过的接口，未实现接口不在本文档中展开。

## 1. 本地开发环境

本地开发服务：

```text
http://localhost:3000
```

本地 PostgreSQL：

```text
DATABASE_URL=postgresql://ziot:ziot@localhost:55432/ziot
```

当前 Web 环境文件：

```text
apps/web/.env.local
```

## 2. 通用响应格式

所有后台 API 使用统一响应 envelope。

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": {}
}
```

错误响应：

```json
{
  "code": 400001,
  "message": "参数错误",
  "request_id": "req_xxx",
  "data": null
}
```

当前已使用错误码：

| code | HTTP | 说明 |
| --- | --- | --- |
| `0` | 200 / 201 | 成功 |
| `400001` | 400 | 参数错误 |
| `404001` | 404 | 资源不存在，例如产品不存在或已删除 |
| `409001` | 409 | 资源冲突，例如 `product_key` 重复 |
| `500001` | 500 | 系统错误，未知异常统一返回 `internal server error` |

## 3. 临时组织上下文

认证和组织切换尚未完成前，后台 API 使用临时组织上下文：

```text
org_default
```

当前实现支持通过请求头覆盖组织 ID：

```http
x-org-id: org_default
```

如果未传 `x-org-id`，默认使用 `org_default`。

> 注意：这是本地开发阶段的临时方案。登录、Session、RBAC 和真实组织切换完成后，应改为从认证上下文读取组织 ID。

## 4. 健康检查

### `GET /api/v1/health`

检查 Web API 服务是否可用。

请求示例：

```bash
curl http://localhost:3000/api/v1/health
```

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": {
    "status": "ok",
    "service": "ziot-web",
    "timestamp": "2026-04-28T09:00:00.000Z"
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `status` | string | 服务状态 |
| `service` | string | 服务名 |
| `timestamp` | string | 服务端当前时间，ISO 8601 |

## 5. 身份与邀请码 API

### `POST /api/v1/auth/login`

使用账号密码登录。成功后服务端设置 `ziot_access_token`、`ziot_refresh_token` 和 `ziot_current_org_id` HttpOnly Cookie。

请求体：

```json
{
  "account": "admin@example.com",
  "password": "Admin123456"
}
```

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": {
    "id": "usr_admin",
    "account": "admin@example.com",
    "display_name": "平台管理员",
    "current_org_id": "org_default",
    "organizations": [
      {
        "id": "org_default",
        "name": "默认组织",
        "roles": [{ "id": "role_org_admin", "code": "org_admin", "name": "组织管理员" }]
      }
    ],
    "permissions": ["user:read", "invite:write"]
  }
}
```

### `POST /api/v1/auth/register`

使用邀请码注册并登录。邀请码只存储 hash，明文邀请码只在创建时返回一次。
注册请求不提交角色字段，服务端会使用邀请码绑定的角色。

请求体：

```json
{
  "account": "user@example.com",
  "password": "Password123",
  "display_name": "张三",
  "invitation_code": "inv_xxx"
}
```

成功响应 HTTP 状态码：`201`，响应体同登录用户结构。

### `POST /api/v1/auth/refresh`

使用 refresh token Cookie 换发新 session，并撤销旧 refresh token。

### `POST /api/v1/auth/logout`

撤销当前 refresh token 并清空登录 Cookie。

### `GET /api/v1/me`

返回当前登录用户、当前组织、可切换组织和当前组织权限集合。

### `PATCH /api/v1/me`

切换当前组织。

请求体：

```json
{
  "current_org_id": "org_default"
}
```

### `GET /api/v1/users`

查询当前组织用户列表。需要 `user:read` 权限。

### `GET /api/v1/roles`

查询当前组织角色列表。需要 `user:read` 或 `invite:write` 权限。接口会确保当前组织至少存在 `org_admin` 和 `org_member` 中的普通用户角色，其中 `org_member` 包含产品、设备、OTA 的创建/更新权限和日志查看权限，不包含用户管理、邀请码和审计权限。

角色示例：

```json
[
  { "id": "role_org_admin", "code": "org_admin", "name": "组织管理员" },
  { "id": "role_org_member", "code": "org_member", "name": "普通用户" }
]
```

### `GET /api/v1/invitations`

查询当前组织邀请码列表。需要 `invite:read` 或 `invite:write` 权限。

### `POST /api/v1/invitations`

创建邀请码。需要 `invite:write` 权限。

请求体：

```json
{
  "role_id": "role_org_member",
  "max_uses": 1
}
```

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": {
    "id": "inv_xxx",
    "role_id": "role_org_member",
    "role_name": "普通用户",
    "max_uses": 1,
    "used_count": 0,
    "status": "active",
    "expires_at": "2026-05-05T10:13:38.810Z",
    "created_at": "2026-04-28T10:13:38.814Z",
    "code": "inv_plain_code_only_once"
  }
}
```

### `GET /api/v1/invitations/{invitation_id}`

查询邀请码详情和使用记录。需要 `invite:read` 权限。

### `PATCH /api/v1/invitations/{invitation_id}`

禁用邀请码。需要 `invite:write` 权限。

请求体：

```json
{
  "status": "disabled"
}
```

## 6. 产品 API

### 产品对象

当前产品 API 返回结构：

```json
{
  "id": "prd_demo",
  "created_by": "usr_admin",
  "product_key": "pk_demo",
  "name": "演示产品",
  "protocols": ["mqtt", "http"],
  "auth_type": "device_secret",
  "data_format": "json",
  "thing_model": {
    "version": "1.0",
    "properties": [],
    "events": [],
    "services": []
  },
  "status": "active",
  "device_count": 2,
  "created_at": "2026-04-28T09:05:44.384Z",
  "updated_at": "2026-04-28T09:05:44.384Z"
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 产品 ID，服务端生成，当前前缀为 `prd_` |
| `created_by` | string | 创建用户 ID |
| `product_key` | string | 产品唯一标识，全局唯一 |
| `name` | string | 产品名称 |
| `protocols` | string[] | 支持协议，当前使用 `mqtt` / `http` |
| `auth_type` | string | 认证方式，当前默认 `device_secret` |
| `data_format` | string | 数据格式，当前默认 `json` |
| `thing_model` | object | 物模型定义 |
| `status` | string | 资源状态，当前为 `active` / `disabled` |
| `device_count` | number | 关联设备数量 |
| `created_at` | string | 创建时间，ISO 8601 |
| `updated_at` | string | 更新时间，ISO 8601 |

当前默认物模型：

```json
{
  "version": "1.0",
  "properties": [],
  "events": [],
  "services": []
}
```

### `GET /api/v1/products`

查询产品列表。

资源范围：

- 组织管理员可查看当前组织全部产品。
- 普通用户只返回自己创建的产品。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | number | 否 | `1` | 页码，从 1 开始 |
| `page_size` | number | 否 | `20` | 每页数量，范围 1-100 |
| `keyword` | string | 否 | 无 | 当前只匹配产品名称 `name` |

请求示例：

```bash
curl "http://localhost:3000/api/v1/products?page=1&page_size=20"
```

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": {
    "items": [
      {
        "id": "prd_demo",
        "product_key": "pk_demo",
        "name": "演示产品",
        "protocols": ["mqtt", "http"],
        "auth_type": "device_secret",
        "data_format": "json",
        "thing_model": {
          "version": "1.0",
          "properties": [],
          "events": [],
          "services": []
        },
        "status": "active",
        "device_count": 2,
        "created_at": "2026-04-28T09:05:44.384Z",
        "updated_at": "2026-04-28T09:05:44.384Z"
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

当前限制：

- `keyword` 当前只匹配 `name`，不匹配 `product_key`。
- 需要登录，并按当前组织和 `product:read` / `product:write` 权限访问。
- 普通用户访问别人创建的产品详情、物模型、更新或删除接口时返回 `404001`。

### `POST /api/v1/products`

创建产品。
创建成功后，服务端自动写入当前用户为 `created_by`。

请求头：

```http
content-type: application/json
```

请求体：

```json
{
  "product_key": "pk_sensor",
  "name": "温湿度传感器",
  "protocols": ["mqtt"],
  "auth_type": "device_secret",
  "data_format": "json",
  "thing_model": {
    "version": "1.0",
    "properties": [],
    "events": [],
    "services": []
  }
}
```

字段规则：

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `product_key` | string | 否 | 3-64 位，只允许字母、数字、下划线和中划线；不传时服务端生成 |
| `name` | string | 是 | 1-128 位 |
| `protocols` | string[] | 否 | 默认 `["mqtt"]` |
| `auth_type` | string | 否 | 默认 `device_secret` |
| `data_format` | string | 否 | 默认 `json` |
| `thing_model` | object | 否 | 默认空物模型 |

请求示例：

```bash
curl -s -w '\n%{http_code}\n' \
  -H 'content-type: application/json' \
  -X POST http://localhost:3000/api/v1/products \
  -d '{"product_key":"pk_sensor","name":"温湿度传感器","protocols":["mqtt"],"auth_type":"device_secret","data_format":"json"}'
```

成功响应：

HTTP 状态码：`201`

```json
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": {
    "id": "prd_xxx",
    "product_key": "pk_sensor",
    "name": "温湿度传感器",
    "protocols": ["mqtt"],
    "auth_type": "device_secret",
    "data_format": "json",
    "thing_model": {
      "version": "1.0",
      "properties": [],
      "events": [],
      "services": []
    },
    "status": "active",
    "device_count": 0,
    "created_at": "2026-04-28T09:10:33.579Z",
    "updated_at": "2026-04-28T09:10:33.579Z"
  }
}
```

常见错误：

`product_key` 格式不合法：

```json
{
  "code": 400001,
  "message": "product_key must be 3-64 characters of letters, numbers, underscore or hyphen",
  "request_id": "req_xxx",
  "data": null
}
```

`name` 格式不合法：

```json
{
  "code": 400001,
  "message": "name must be 1-128 characters",
  "request_id": "req_xxx",
  "data": null
}
```

`product_key` 重复：

```json
{
  "code": 409001,
  "message": "product_key already exists",
  "request_id": "req_xxx",
  "data": null
}
```

### `GET /api/v1/products/{product_id}`

查询产品详情。

成功响应 HTTP 状态码：`200`，响应体为产品对象。

### `PATCH /api/v1/products/{product_id}`

更新产品基础信息。当前后台页面使用该接口修改产品名称，`product_key` 创建后不可修改。

请求体示例：

```json
{
  "name": "更新后的产品名称"
}
```

字段规则：

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `name` | string | 否 | 1-128 位；当前产品列表编辑入口只提交该字段 |
| `protocols` | string[] | 否 | 为空数组时回退为 `["mqtt"]` |
| `auth_type` | string | 否 | 当前默认 `device_secret` |
| `data_format` | string | 否 | 当前默认 `json` |
| `thing_model` | object | 否 | 必须通过物模型结构校验 |

成功响应：

HTTP 状态码：`200`

```json
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": {
    "id": "prd_xxx",
    "product_key": "pk_sensor",
    "name": "更新后的产品名称",
    "protocols": ["mqtt"],
    "auth_type": "device_secret",
    "data_format": "json",
    "thing_model": {
      "version": "1.0",
      "properties": [],
      "events": [],
      "services": []
    },
    "status": "active",
    "device_count": 0,
    "created_at": "2026-04-28T09:10:33.579Z",
    "updated_at": "2026-04-28T09:30:33.579Z"
  }
}
```

常见错误：

`product_id` 不存在、不是当前组织产品，或产品已软删除：

```json
{
  "code": 404001,
  "message": "product not found",
  "request_id": "req_xxx",
  "data": null
}
```

`name` 格式不合法：

```json
{
  "code": 400001,
  "message": "name must be 1-128 characters",
  "request_id": "req_xxx",
  "data": null
}
```

### `DELETE /api/v1/products/{product_id}`

软删除产品。当前实现写入 `deleted_at`，列表接口默认不再返回已删除产品。存在未删除设备的产品不能删除。

成功响应：

HTTP 状态码：`200`

```json
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": {
    "id": "prd_xxx",
    "deleted_at": "2026-04-28T09:30:33.579Z"
  }
}
```

常见错误：

`product_id` 不存在、不是当前组织产品，或产品已软删除：

```json
{
  "code": 404001,
  "message": "product not found",
  "request_id": "req_xxx",
  "data": null
}
```

产品下仍存在未删除设备：

```json
{
  "code": 409001,
  "message": "product has active devices",
  "request_id": "req_xxx",
  "data": null
}
```

### `GET /api/v1/products/{product_id}/thing-model`

查询产品物模型。

### `PUT /api/v1/products/{product_id}/thing-model`

更新产品物模型。请求体可直接提交物模型对象，也可以放在 `thing_model` 字段中。

请求体：

```json
{
  "thing_model": {
    "version": "1.0",
    "properties": [
      {
        "identifier": "temperature",
        "name": "温度",
        "dataType": "number"
      }
    ],
    "events": [],
    "services": []
  }
}
```

物模型校验失败返回 `400001`，`message` 中包含结构化校验错误。

## 7. 设备 API

### 设备对象

```json
{
  "id": "dev_demo",
  "org_id": "org_default",
  "created_by": "usr_admin",
  "product_id": "prd_demo",
  "product_name": "演示产品",
  "product_key": "pk_demo",
  "device_key": "dk_demo",
  "name": "演示设备",
  "status": "active",
  "online_status": "unknown",
  "firmware_version": null,
  "tags": {},
  "last_heartbeat_at": null,
  "created_at": "2026-04-28T09:05:44.384Z",
  "updated_at": "2026-04-28T09:05:44.384Z"
}
```

创建和重置密钥的响应会额外返回 `device_secret`。该字段只显示一次，数据库只保存 `device_secret_hash`。

### `GET /api/v1/devices`

查询当前组织设备列表。需要 `device:read` 权限。

资源范围：

- 组织管理员可查看当前组织全部设备。
- 普通用户只返回自己创建的设备。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `product_id` | string | 否 | 只返回指定产品下的设备 |

### `POST /api/v1/devices`

创建设备。需要 `device:write` 权限。
普通用户只能在自己创建的产品下创建设备；服务端自动写入当前用户为 `created_by`。

请求体：

```json
{
  "product_id": "prd_demo",
  "name": "温湿度传感器",
  "device_key": "dk_sensor_001",
  "firmware_version": "v1.0.0",
  "tags": {
    "location": "office"
  }
}
```

字段规则：

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `product_id` | string | 是 | 必须属于当前组织且未删除 |
| `name` | string | 是 | 1-128 位 |
| `device_key` | string | 否 | 3-128 位，只允许字母、数字、下划线和中划线；不传时服务端生成 |
| `firmware_version` | string | 否 | 固件版本标识 |
| `tags` | object | 否 | 非对象会回退为空对象 |

成功响应 HTTP 状态码：`201`。

```json
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": {
    "id": "dev_xxx",
    "product_id": "prd_demo",
    "product_name": "演示产品",
    "product_key": "pk_demo",
    "device_key": "dk_sensor_001",
    "device_secret": "ds_xxx",
    "name": "温湿度传感器",
    "status": "active",
    "online_status": "unknown",
    "firmware_version": "v1.0.0",
    "tags": {
      "location": "office"
    },
    "last_heartbeat_at": null,
    "created_at": "2026-04-28T09:10:33.579Z",
    "updated_at": "2026-04-28T09:10:33.579Z"
  }
}
```

常见错误：

- `400001`: `name` 或 `device_key` 格式不合法。
- `404001`: 产品不存在、不是当前组织产品、已删除，或普通用户无权访问该产品。
- `409001`: 同一产品下 `device_key` 已存在。

### `GET /api/v1/devices/{device_id}`

查询设备详情。需要 `device:read` 权限。
普通用户访问别人创建的设备返回 `404001`。

### `PATCH /api/v1/devices/{device_id}`

更新设备基础信息。需要 `device:write` 权限。

请求体示例：

```json
{
  "name": "更新后的设备名称",
  "status": "disabled",
  "firmware_version": "v1.0.1",
  "tags": {
    "location": "lab"
  }
}
```

`status` 当前支持 `active` / `disabled`。禁用后的设备会在后续接入认证中被拒绝。

### `DELETE /api/v1/devices/{device_id}`

软删除设备。需要 `device:write` 权限。

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "request_id": "req_xxx",
  "data": {
    "id": "dev_xxx",
    "deleted_at": "2026-04-28T09:30:33.579Z"
  }
}
```

### `POST /api/v1/devices/{device_id}/secret`

重置设备密钥。需要 `device:write` 权限。响应中的 `device_secret` 只显示一次。

### `GET /api/v1/devices/{device_id}/shadow`

查询设备影子。需要 `device:read` 权限。

```json
{
  "device_id": "dev_demo",
  "reported": {},
  "desired": {},
  "version": 1,
  "updated_at": "2026-04-28T09:05:44.384Z"
}
```

### `PATCH /api/v1/devices/{device_id}/shadow`

更新设备影子的期望状态。需要 `device:write` 权限。

请求体：

```json
{
  "desired": {
    "power": true,
    "target_temperature": 24
  }
}
```

`desired` 必须是 JSON 对象。每次成功更新会将 `version` 递增 1。

### `GET /api/v1/devices/{device_id}/topics`

查询设备内置 MQTT Topic 列表。需要 `device:read` 权限。
普通用户访问别人创建的设备返回 `404001`。

成功响应中的 `data` 是数组：

```json
[
  {
    "key": "property-post",
    "name": "属性上报",
    "direction": "device_to_cloud",
    "operation": "publish",
    "topic": "/sys/pk_demo/dk_demo/thing/property/post",
    "description": "设备发布当前属性值，平台写入 reported 状态。"
  },
  {
    "key": "property-set",
    "name": "属性设置下发",
    "direction": "cloud_to_device",
    "operation": "subscribe",
    "topic": "/sys/pk_demo/dk_demo/thing/property/set",
    "description": "设备订阅平台下发的属性设置请求。"
  },
  {
    "key": "service-invoke",
    "name": "控制下发 / 服务调用",
    "direction": "cloud_to_device",
    "operation": "subscribe",
    "topic": "/sys/pk_demo/dk_demo/thing/service/+/invoke",
    "description": "设备订阅平台下发的服务或动作类控制指令。"
  }
]
```

当前内置 Topic：

| 名称 | 方向 | 权限 | Topic |
| --- | --- | --- | --- |
| 属性上报 | 设备到平台 | publish | `/sys/{product_key}/{device_key}/thing/property/post` |
| 属性设置下发 | 平台到设备 | subscribe | `/sys/{product_key}/{device_key}/thing/property/set` |
| 事件上报 | 设备到平台 | publish | `/sys/{product_key}/{device_key}/thing/event/post` |
| 日志上报 | 设备到平台 | publish | `/sys/{product_key}/{device_key}/thing/log/post` |
| 控制下发 / 服务调用 | 平台到设备 | subscribe | `/sys/{product_key}/{device_key}/thing/service/+/invoke` |
| 服务回执 | 设备到平台 | publish | `/sys/{product_key}/{device_key}/thing/service/{identifier}/reply` |

### `POST /api/v1/devices/{device_id}/commands`

向单个设备下发控制指令。需要 `device:control` 权限。
普通用户只能控制自己创建的设备。

属性设置下发：

```json
{
  "kind": "property_set",
  "params": {
    "power": true,
    "target_temperature": 24
  },
  "timeout_ms": 15000
}
```

服务调用下发：

```json
{
  "kind": "service",
  "identifier": "setSwitch",
  "params": {
    "power": true
  },
  "timeout_ms": 15000
}
```

平台会创建 `device_commands` 记录，并通过 EMQX Dashboard API 发布 MQTT 消息：

- `property_set`: `/sys/{product_key}/{device_key}/thing/property/set`
- `service`: `/sys/{product_key}/{device_key}/thing/service/{identifier}/invoke`

成功响应：

```json
{
  "id": "cmd_xxx",
  "device_id": "dev_demo",
  "identifier": "setSwitch",
  "params": {
    "power": true
  },
  "status": "sent",
  "request_id": "cmd_xxx",
  "result": null,
  "timeout_at": "2026-04-29T08:00:15.000Z",
  "sent_at": "2026-04-29T08:00:00.000Z",
  "replied_at": null,
  "created_at": "2026-04-29T08:00:00.000Z"
}
```

服务调用回执由设备发布到 `/thing/service/{identifier}/reply`，EMQX rule 会把回执转发到 Web，平台按 `id` 或 `request_id` 更新命令状态为 `success` / `failed`。

### `GET /api/v1/devices/{device_id}/commands`

查询当前设备最近 20 条控制指令。需要 `device:read` 权限。
查询时会把已超过 `timeout_at` 的 `pending` / `sent` / `delivered` 命令懒更新为 `timeout`。

### `GET /api/v1/devices/{device_id}/reports`

查询当前设备最近 20 条设备主动上报记录。需要 `device:read` 权限。
普通用户访问别人创建的设备返回 `404001`。

该接口只返回设备发布到以下 Topic 后由 EMQX webhook 写入的记录：

- `/sys/{product_key}/{device_key}/thing/property/post`
- `/sys/{product_key}/{device_key}/thing/event/post`
- `/sys/{product_key}/{device_key}/thing/log/post`

成功响应中的 `data` 是数组：

```json
[
  {
    "id": "dlg_xxx",
    "device_id": "dev_demo",
    "type": "property",
    "level": "info",
    "content": {
      "topic": "/sys/pk_demo/dk_demo/thing/property/post",
      "payload": {
        "id": "report_1",
        "params": {
          "temperature": 23.6
        }
      }
    },
    "occurred_at": "2026-04-29T08:00:00.000Z",
    "created_at": "2026-04-29T08:00:00.000Z"
  }
]
```

属性上报会同步合并到设备影子的 `reported` 字段，并递增 `version`。
命令记录只记录平台主动下发的控制指令；设备主动上报应使用本接口查询。

### `GET /api/v1/commands/{command_id}`

查询单条控制指令。需要 `device:read` 权限。

### `GET /api/v1/device-groups`

查询设备分组列表。需要 `device:read` 权限。
普通用户只返回自己创建的设备分组。

### `POST /api/v1/device-groups`

创建设备分组，或添加设备到分组。需要 `device:write` 权限。
普通用户只能基于自己创建的产品、设备和分组操作。

创建设备分组：

```json
{
  "product_id": "prd_demo",
  "name": "办公室设备",
  "description": "办公室传感器"
}
```

添加设备到分组：

```json
{
  "group_id": "dgp_demo",
  "device_id": "dev_demo"
}
```

分组在 MVP 中必须绑定一个产品。添加成员时，如果设备和分组不属于同一产品，接口返回 `409001`。

## 8. EMQX 内部回调 API

以下接口供 EMQX 在 Docker Compose 网络内调用，不面向浏览器用户。本地 EMQX 配置位于 `deploy/emqx/dev.conf`，回调地址使用 Compose 服务名 `web`。

### MQTT 认证口令

设备连接 MQTT 时使用：

| 字段 | 值 |
| --- | --- |
| username | `{product_key}:{device_key}` |
| password | `device_secret` |

服务端不保存明文 `device_secret`，只保存 `device_secret` 的 bcrypt hash。创建或重置设备密钥后，旧 MQTT password 立即失效。

### `POST /api/internal/emqx/auth`

EMQX HTTP 认证回调。请求体示例：

```json
{
  "username": "pk_demo:dk_mqtt_demo",
  "password": "DeviceSecret123",
  "clientid": "dk_mqtt_demo"
}
```

成功响应：

```json
{ "result": "allow" }
```

失败响应：

```json
{ "result": "deny", "reason": "invalid credentials" }
```

禁用设备、已删除设备、错误密钥都会返回 `deny`。

### `POST /api/internal/emqx/acl`

EMQX HTTP 授权回调。请求体示例：

```json
{
  "username": "pk_demo:dk_mqtt_demo",
  "action": "publish",
  "topic": "/sys/pk_demo/dk_mqtt_demo/thing/property/post"
}
```

当前允许：

- 发布到本设备的属性、事件、日志上报 Topic。
- 发布到本设备的服务回复 Topic。
- 发布到本设备的 OTA 进度/结果 Topic。
- 订阅本设备的属性设置、服务调用和 OTA 通知 Topic。
- Web 下发服务调用后，设备发布到本设备服务回执 Topic，EMQX rule 转发回执并更新命令状态。
- 设备发布属性、事件、日志上报后，EMQX rule 转发消息并写入 `device_logs`；属性上报还会更新设备影子的 `reported`。

跨设备 Topic、未知 Topic 或禁用设备返回 `deny`。

### `POST /api/internal/emqx/webhook`

EMQX WebHook 回调。当前处理连接生命周期、命令回执和设备主动上报：

- `client.connected`: 设备置为 `online`，更新 `last_online_at` 和 `last_heartbeat_at`。
- `client.disconnected`: 设备置为 `offline`，更新 `last_offline_at`。
- 同步写入 `device_logs` 生命周期日志。
- `/sys/{product_key}/{device_key}/thing/service/{identifier}/reply`: 更新匹配的 `device_commands` 状态。
- `/sys/{product_key}/{device_key}/thing/property/post`: 写入上报日志，并合并到 `device_shadows.reported`。
- `/sys/{product_key}/{device_key}/thing/event/post`: 写入事件上报日志。
- `/sys/{product_key}/{device_key}/thing/log/post`: 写入设备日志上报。

## 9. HTTP 设备接入 API

HTTP 设备接口面向设备端，不使用后台用户 Cookie。请求必须携带设备签名头：

| Header | 说明 |
| --- | --- |
| `x-ziot-product-key` | 产品 Product Key |
| `x-ziot-device-key` | 设备 Device Key |
| `x-ziot-device-secret` | 设备密钥；当前用于校验 bcrypt hash 后再校验 HMAC |
| `x-ziot-timestamp` | 毫秒时间戳，允许 5 分钟窗口 |
| `x-ziot-nonce` | 随机字符串，窗口内不可重复 |
| `x-ziot-body-sha256` | 原始 body 的 SHA256 hex |
| `x-ziot-signature` | HMAC-SHA256 hex 签名 |

签名原文：

```text
method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + body_sha256
```

当前 HTTP 设备接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/device-api/v1/properties` | 属性上报，写入上报记录并合并到 `device_shadows.reported` |
| `POST` | `/device-api/v1/events` | 事件上报，写入 `device_logs` |
| `POST` | `/device-api/v1/logs` | 日志上报，写入 `device_logs` |
| `GET` | `/device-api/v1/commands/pending` | 拉取当前设备待处理命令，并标记为 `delivered` |
| `POST` | `/device-api/v1/commands/{request_id}/reply` | 回复命令执行结果 |

防重放：

- 时间戳超过 5 分钟窗口返回 `401001`。
- 同一设备、同一 timestamp、同一 nonce 重复请求返回 `409001`。
- 如果配置 `REDIS_URL`，nonce 通过 Redis `SET NX EX` 保存；本地未配置 Redis 时使用进程内 nonce 存储。

## 10. OTA API

### `GET /api/v1/firmwares`

查询固件列表。需要 `ota:read` 权限。

### `POST /api/v1/firmwares`

创建固件记录。需要 `ota:write` 权限。

```json
{
  "product_id": "prd_demo",
  "version": "v1.0.1",
  "file_url": "https://example.com/fw.bin",
  "file_size": 1024,
  "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "release_note": "演示固件"
}
```

### `POST /api/v1/firmwares/upload`

直接上传固件文件并创建固件记录。需要 `ota:write` 权限。请求格式为 `multipart/form-data`，服务端会保存文件并自动计算 `file_size` 和 `sha256`。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `product_id` | string | 是 | 产品 ID |
| `version` | string | 是 | 固件版本，同一产品内唯一 |
| `file` | file | 是 | 固件文件，当前本地上传限制 50MB |
| `release_note` | string | 否 | 发布说明 |

### `GET /api/v1/firmwares/{firmware_id}`

查询固件详情。需要 `ota:read` 权限。

### `PATCH /api/v1/firmwares/{firmware_id}`

发布或废弃固件。需要 `ota:write` 权限。

```json
{
  "status": "released"
}
```

### `POST /api/v1/firmwares/{firmware_id}/upload-url`

生成固件上传 URL。需要 `ota:write` 权限。
如果配置了 MinIO 环境变量，返回预签名 PUT URL；本地未配置 MinIO 时返回固件记录中的 `file_url` 作为占位上传地址。

### `GET /api/v1/ota/tasks`

查询 OTA 任务列表。需要 `ota:read` 权限。

### `POST /api/v1/ota/tasks`

创建 OTA 任务。需要 `ota:write` 权限。

```json
{
  "firmware_id": "fw_xxx",
  "name": "演示升级任务",
  "strategy": {
    "target_type": "all"
  }
}
```

`strategy.target_type` 支持：

- `all`: 选择固件所属产品下全部设备。
- `devices`: 通过 `device_ids` 指定设备。
- `group`: 通过 `group_id` 指定设备分组。

### `GET /api/v1/ota/tasks/{task_id}`

查询 OTA 任务详情和统计。需要 `ota:read` 权限。

### `POST /api/v1/ota/tasks/{task_id}/start`

启动 OTA 任务。需要 `ota:execute` 权限。
启动后任务状态变为 `running`，设备记录变为 `notified`，平台向 MQTT 设备发布：

```text
/ota/{product_key}/{device_key}/upgrade/notify
```

### `POST /api/v1/ota/tasks/{task_id}/cancel`

取消 OTA 任务。需要 `ota:execute` 权限。

### `GET /api/v1/ota/tasks/{task_id}/records`

查询任务下设备升级记录。需要 `ota:read` 权限。

### HTTP 设备 OTA API

HTTP 设备使用 Task 7 的设备签名头认证。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/device-api/v1/ota/tasks/current` | 查询当前设备正在执行的 OTA 任务 |
| `POST` | `/device-api/v1/ota/tasks/{task_id}/progress` | 上报 OTA 进度或结果 |

进度上报示例：

```json
{
  "status": "installing",
  "progress": 80
}
```

成功结果示例：

```json
{
  "status": "success",
  "progress": 100,
  "firmware_version": "v1.0.1"
}
```

MQTT 设备通过以下 Topic 上报进度和结果，EMQX rule 会转发到 Web：

```text
/ota/{product_key}/{device_key}/upgrade/progress
/ota/{product_key}/{device_key}/upgrade/result
```

## 11. 审计日志 API

### `GET /api/v1/audit-logs`

查询当前组织审计日志。需要 `audit:read` 权限。

支持筛选参数：

| 参数 | 说明 |
| --- | --- |
| `user_id` | 按操作用户过滤 |
| `action` | 按动作关键字过滤，例如 `product.create`、`device.control`、`ota.start` |
| `resource_type` | 按资源类型过滤，例如 `product`、`device`、`firmware`、`ota_task` |
| `resource_id` | 按资源 ID 精确过滤 |
| `ip` | 按客户端 IP 过滤 |
| `start_time` | 起始时间，ISO 8601 格式 |
| `end_time` | 结束时间，ISO 8601 格式 |
| `page` | 页码，默认 `1` |
| `page_size` | 每页数量，默认 `20`，最大 `100` |

审计记录覆盖登录、产品创建/更新/删除、设备创建/更新/删除、设备密钥重置、设备控制、固件创建/上传/发布/废弃、OTA 创建/启动/取消和邀请码创建/禁用。

## 12. 已验证用例

2026-04-28 本地验证过以下用例：

| 用例 | 结果 |
| --- | --- |
| `GET /api/v1/health` | 返回 `code=0` |
| `POST /api/v1/auth/login` | 返回 `code=0`，写入登录 Cookie |
| `GET /api/v1/me` | 返回当前用户、当前组织和权限集合 |
| `GET /api/v1/users` | 返回当前组织成员 |
| `GET /api/v1/roles` | 返回当前组织角色 |
| `POST /api/v1/invitations` | 返回 HTTP `201`，只在创建响应中包含明文邀请码 |
| `GET /api/v1/invitations/{invitation_id}` | 返回邀请码详情和使用记录 |
| `PATCH /api/v1/invitations/{invitation_id}` | 可禁用邀请码 |
| `POST /api/v1/auth/register` | 有效邀请码可注册并登录 |
| `GET /api/v1/products` | 返回 seed 产品和接口创建产品 |
| `POST /api/v1/products` | 返回 HTTP `201`，产品成功写入 PostgreSQL |
| `PATCH /api/v1/products/{product_id}` | 返回 HTTP `200`，产品名称成功更新 |
| `DELETE /api/v1/products/{product_id}` | 返回 HTTP `200`，产品成功软删除 |
| `GET /api/v1/products/{product_id}` | 返回产品详情和接入参数所需字段 |
| `GET /api/v1/products/{product_id}/thing-model` | 返回产品物模型 |
| `PUT /api/v1/products/{product_id}/thing-model` | 返回 HTTP `200`，物模型成功更新 |
| `GET /products` | 产品列表展示编辑、删除操作按钮 |
| `GET /api/v1/devices` | 返回当前组织设备列表 |
| `POST /api/v1/devices` | 返回 HTTP `201`，只在创建响应中包含明文设备密钥 |
| `GET /api/v1/devices/{device_id}` | 返回设备详情 |
| `PATCH /api/v1/devices/{device_id}` | 可更新名称、状态、固件版本和标签 |
| `DELETE /api/v1/devices/{device_id}` | 返回 HTTP `200`，设备成功软删除 |
| `POST /api/v1/devices/{device_id}/secret` | 返回新密钥，旧密钥哈希被替换 |
| `GET /api/v1/devices/{device_id}/shadow` | 返回 reported、desired、version 和 updated_at |
| `PATCH /api/v1/devices/{device_id}/shadow` | 更新 desired 并递增 version |
| `GET /api/v1/devices/{device_id}/topics` | 返回设备内置 MQTT Topic 列表 |
| `POST /api/v1/devices/{device_id}/commands` | 返回命令记录并通过 EMQX 发布下发消息 |
| `GET /api/v1/devices/{device_id}/commands` | 返回设备最近命令记录 |
| `GET /api/v1/devices/{device_id}/reports` | 返回设备最近主动上报记录 |
| `GET /api/v1/commands/{command_id}` | 返回单条命令记录 |
| `GET /api/v1/device-groups` | 返回设备分组列表 |
| `POST /api/v1/device-groups` | 可创建同产品分组并添加设备成员 |
| `POST /api/internal/emqx/auth` | 有效 MQTT `device_secret` 返回 `allow`，错误密钥或禁用设备返回 `deny` |
| `POST /api/internal/emqx/acl` | 允许本设备 Topic，拒绝跨设备 Topic |
| `POST /api/internal/emqx/webhook` | 连接事件更新设备在线状态，命令回执更新命令状态，设备上报写入日志并更新 reported 影子 |
| `POST /device-api/v1/properties` | HTTP 设备属性上报更新 reported 影子并写入上报记录 |
| `GET /device-api/v1/commands/pending` | HTTP 设备可拉取待处理命令 |
| `POST /device-api/v1/commands/{request_id}/reply` | HTTP 设备可回复命令结果 |
| `GET /api/v1/audit-logs` | 可按用户、动作、资源、IP 和时间范围查询审计日志 |
| 数据库直查 | `products`、`devices`、`device_groups`、`device_shadows` 表可查到对应数据 |

验证日志：

```text
docs/dev-logs/2026-04-28-local-db-and-product-api.md
```

## 10. 待补充接口

以下接口在 PRD 中已规划，但当前尚未实现：

| 接口 | 状态 |
| --- | --- |
| 控制 API | 已实现 |
| OTA API | 已实现 |
| 日志 API | 审计日志已实现，设备日志页待补充 |
