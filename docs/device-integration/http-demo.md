# HTTP 设备接入 Demo

HTTP 设备接入用于不保持 MQTT 长连接的设备。默认示例使用 seed 数据：

| 字段 | 默认值 |
| --- | --- |
| Base URL | `http://localhost:3000` |
| Product Key | `pk_demo` |
| Device Key | `dk_mqtt_demo` |
| Device Secret | `DeviceSecret123` |

## 认证头

HTTP 请求使用设备标识、时间戳、nonce、body hash 和 HMAC 签名：

```text
sign = HMAC_SHA256(device_secret, method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + body_sha256)
```

当前实现因为数据库只保存 `device_secret_hash`，服务端无法直接反算明文密钥，所以请求需要同时携带 `x-ziot-device-secret`。服务端先用 bcrypt 校验设备密钥，再校验 HMAC 签名。后续如果要避免每次传明文密钥，需要新增可解密的 HTTP access key 或独立签名密钥。

必填请求头：

| Header | 说明 |
| --- | --- |
| `x-ziot-product-key` | 产品 Product Key |
| `x-ziot-device-key` | 设备 Device Key |
| `x-ziot-device-secret` | 设备密钥 |
| `x-ziot-timestamp` | 毫秒时间戳，允许 5 分钟窗口 |
| `x-ziot-nonce` | 随机字符串，窗口内不可重复 |
| `x-ziot-body-sha256` | 原始 body 的 SHA256 hex，GET 请求为空字符串 hash |
| `x-ziot-signature` | HMAC-SHA256 hex 签名 |

## 接口

属性上报：

```text
POST /device-api/v1/properties
```

事件上报：

```text
POST /device-api/v1/events
```

日志上报：

```text
POST /device-api/v1/logs
```

拉取待处理命令：

```text
GET /device-api/v1/commands/pending
```

回复命令：

```text
POST /device-api/v1/commands/{request_id}/reply
```

属性上报示例 body：

```json
{
  "id": "report_1",
  "params": {
    "temperature": 23.6,
    "humidity": 58
  }
}
```

命令回复示例 body：

```json
{
  "code": 0,
  "data": {
    "ok": true
  }
}
```

## TypeScript 模拟器

```bash
pnpm --filter @ziot/device-simulator http
```

指定设备参数：

```bash
HTTP_DEVICE_API_URL=http://localhost:3000 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 pnpm --filter @ziot/device-simulator http
```

模拟器会执行一次属性上报，然后拉取待处理命令并逐条回复成功。

## Python Demo

Python demo 只使用标准库，不需要额外安装依赖。

运行：

```bash
python3 docs/device-integration/http-python-demo.py
```

指定设备参数：

```bash
HTTP_DEVICE_API_URL=http://localhost:3000 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 python3 docs/device-integration/http-python-demo.py
```

## C Demo

C demo 使用 POSIX socket 发送 HTTP 请求，使用 OpenSSL `libcrypto` 计算 SHA256 和 HMAC。

安装依赖示例：

```bash
sudo apt-get install libssl-dev
```

编译：

```bash
gcc docs/device-integration/http-c-demo.c -lcrypto -o /tmp/ziot-http-c-demo
```

运行：

```bash
/tmp/ziot-http-c-demo
```

指定设备参数：

```bash
HTTP_DEVICE_API_URL=http://localhost:3000 PRODUCT_KEY=pk_demo DEVICE_KEY=dk_mqtt_demo DEVICE_SECRET=DeviceSecret123 /tmp/ziot-http-c-demo
```

Python 和 C demo 都会执行一次属性上报，然后拉取待处理命令并逐条回复成功。C demo 为轻量示例，仅支持本地明文 `http://`，不支持 `https://`。
