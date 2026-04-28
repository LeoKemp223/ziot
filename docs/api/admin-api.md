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

## 5. 产品 API

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
- 暂未实现权限校验，默认使用临时组织上下文。

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
| `product_key` | string | 是 | 3-64 位，只允许字母、数字、下划线和中划线 |
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

软删除产品。当前实现写入 `deleted_at`，列表接口默认不再返回已删除产品。

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

## 6. 已验证用例

2026-04-28 本地验证过以下用例：

| 用例 | 结果 |
| --- | --- |
| `GET /api/v1/health` | 返回 `code=0` |
| `GET /api/v1/products` | 返回 seed 产品和接口创建产品 |
| `POST /api/v1/products` | 返回 HTTP `201`，产品成功写入 PostgreSQL |
| `PATCH /api/v1/products/{product_id}` | 返回 HTTP `200`，产品名称成功更新 |
| `DELETE /api/v1/products/{product_id}` | 返回 HTTP `200`，产品成功软删除 |
| `GET /products` | 产品列表展示编辑、删除操作按钮 |
| 数据库直查 | `products` 表可查到新建产品 |

验证日志：

```text
docs/dev-logs/2026-04-28-local-db-and-product-api.md
```

## 7. 待补充接口

以下接口在 PRD 中已规划，但当前尚未实现：

| 接口 | 状态 |
| --- | --- |
| `GET /api/v1/products/{product_id}` | 未实现 |
| `GET /api/v1/products/{product_id}/thing-model` | 未实现 |
| `PUT /api/v1/products/{product_id}/thing-model` | 未实现 |
| 账号与登录 API | 未实现 |
| 设备 API | 未实现 |
| 控制 API | 未实现 |
| OTA API | 未实现 |
| 日志 API | 未实现 |
