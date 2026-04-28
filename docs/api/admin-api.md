# 后台管理 API 文档

版本：v0.1  
更新日期：2026-04-28  
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

请求体：

```json
{
  "account": "user@example.com",
  "password": "Password123",
  "display_name": "设备管理员",
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

查询当前组织角色列表。

### `GET /api/v1/invitations`

查询当前组织邀请码列表。需要 `invite:read` 或 `invite:write` 权限。

### `POST /api/v1/invitations`

创建邀请码。需要 `invite:write` 权限。

请求体：

```json
{
  "role_id": "role_org_admin",
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
    "role_id": "role_org_admin",
    "role_name": "组织管理员",
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

### `POST /api/v1/products`

创建产品。

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

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `product_id` | string | 否 | 只返回指定产品下的设备 |

### `POST /api/v1/devices`

创建设备。需要 `device:write` 权限。

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
- `404001`: 产品不存在、不是当前组织产品或已删除。
- `409001`: 同一产品下 `device_key` 已存在。

### `GET /api/v1/devices/{device_id}`

查询设备详情。需要 `device:read` 权限。

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

### `GET /api/v1/device-groups`

查询设备分组列表。需要 `device:read` 权限。

### `POST /api/v1/device-groups`

创建设备分组，或添加设备到分组。需要 `device:write` 权限。

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

## 8. 已验证用例

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
| `GET /api/v1/device-groups` | 返回设备分组列表 |
| `POST /api/v1/device-groups` | 可创建同产品分组并添加设备成员 |
| 数据库直查 | `products`、`devices`、`device_groups`、`device_shadows` 表可查到对应数据 |

验证日志：

```text
docs/dev-logs/2026-04-28-local-db-and-product-api.md
```

## 9. 待补充接口

以下接口在 PRD 中已规划，但当前尚未实现：

| 接口 | 状态 |
| --- | --- |
| 控制 API | 未实现 |
| OTA API | 未实现 |
| 日志 API | 未实现 |
