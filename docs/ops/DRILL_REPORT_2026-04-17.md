# AgentForge 真实环境演练记录（2026-04-17）

## 演练目标

- 验证 Docker 构建与远端容器替换流程可执行
- 验证 Nginx 反代到 AgentForge 服务可用
- 验证飞书卡片发送、点击回调、任务状态推进闭环

## 环境

- 远端 Linux 主机
- `agentforge-hook` 容器
- 反代域名 `hooks.zyzsharehub.cn`
- 飞书自建应用回调链路

## 执行动作

1. 本地构建 `dist`
2. 打包 `Dockerfile + dist + package.json + package-lock.json`
3. 上传到远端部署目录
4. 远端 `docker build`
5. 远端 `docker run` 重启 `agentforge-hook`
6. 发送真实飞书交互卡片
7. 点击按钮并检查任务状态与事件日志

## 结果

- Docker 重建成功
- 新容器成功绑定 `127.0.0.1:3302 -> 3000`
- 飞书卡片发送成功
- 按钮点击后服务收到真实回调
- 任务由 `WAITING_HUMAN -> READY`
- 事件日志写入 `task.human_gate_resolved`
- 未再出现旧问题 `feishu.card_action.unmatched`

## 证据摘要

- 真实飞书消息发送返回 `code=0`
- 回调日志包含 `plan_id + task_id + related_id`
- 事件日志包含：
  - `task.human_gate_resolved`
  - `fromStatus=WAITING_HUMAN`
  - `toStatus=READY`

## 风险与后续

- 生产长期运行仍需补自动备份和恢复演练
- 还需在正式生产链路接入更严格的发布前 gate
- 任务事件主键后续建议升级为复合标识 `planId:taskId`
