# 2026-09-10 设备在线语义改为"连接即在线" 开发日志

## 背景

原判定是双层：EMQX 连接事件（实时）+ 120 秒心跳超时补偿（`DEVICE_ONLINE_TTL_SECONDS`，查设备列表/详情时把 `last_heartbeat_at` 超过 120s 的"在线"设备翻成离线）。问题：

1. **长连接低频上报设备被误判**——MQTT 连接活着（还能收命令），只因上报间隔 > 120s 就显示离线；
2. 补偿**只降不升**，被误判后设备恢复上报也不会翻回在线，唯一恢复路径是断开重连；
3. OTA 进度/命令应答不算心跳，升级中的设备也可能被显示成离线。

用户拍板改为 **A 方向：连接即在线**（多数 IoT 平台语义——连接在就能收命令，显示离线反而误导）。

## 方案

1. **删除 120s 补偿**：`lib/devices/online-status.ts` 整个文件删除（`compensateOnlineStatuses` + 只写不读的 Redis `device:online:{id}` 缓存），`device-service` 的 list/get 不再触发补偿。在线/离线完全由 EMQX `client.connected`/`client.disconnected` 事件驱动（keepalive 超时也会触发 disconnected，死链设备照样能转离线）。
2. **上报即在线自愈**：三类遥测上报（property/event/log）到达时，若设备当前不是 `online`，顺带翻回 `online` + 刷 `last_online_at` + 推 `device.status.changed` 事件——能收到 publish 必然已连接，这是 connected 事件丢失（web 重启窗口等）时的自愈路径。web 直写路径与 worker 队列路径都做了。
3. `last_heartbeat_at` 保留（连接 + 上报时刷新），语义弱化为"最后数据时间"展示字段。

## 新增/改动代码

| 文件 | 改动 |
| --- | --- |
| `apps/web/lib/devices/online-status.ts` | 删除 |
| `apps/web/lib/devices/device-service.ts` | 移除两处补偿调用 |
| `apps/web/features/ingress/mqtt/mqtt-ingress-service.ts` | 移除缓存标记调用；`recordMqttReport` 上报翻回在线 + 事件 |
| `apps/worker/src/telemetry/consume-device-reports.ts` | 同上报翻回逻辑 |
| `apps/worker/src/telemetry/publish-device-event.ts` | 新增。与 web `device-events.ts` 同频道（`ziot:device-events`）同格式的最小发布端——频道与 JSON 结构是跨进程契约，改动需两边同步 |
| `docs/api/admin-api.md` | webhook 节补"在线语义"说明 |

## 测试与验证

- 单测：web 新增 2 例（在线设备上报只刷心跳、离线设备上报翻回在线）；worker 新增 1 例（翻回 + 事件断言，`publish-device-event` mock）。
- 真实栈：连接后长时间不上报 → 查列表仍在线（旧逻辑 120s 后会翻离线）；手工把设备标 offline 后发一条上报 → 自动翻回 online。

## 注意

- 部署需同时更新 web 与 worker（两边都有上报路径的改动）。
- Redis 里的 `device:online:*` 键随 TTL 自然消亡，无需清理。
