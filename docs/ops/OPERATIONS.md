# Operations

## 目标

这份文档补齐运行与发布层面的操作说明，和 `docs/ops/RUNBOOK.md` 的关系如下：

- `RUNBOOK.md`
  偏故障处置与操作流程
- `OPERATIONS.md`
  偏部署方式、环境矩阵、发布动作与日常巡检

## 部署形态

当前支持三种形态：

- 本地 Node 进程
- 本地 Docker Compose
- 远程 Docker 单容器部署

## 1. 本地 Node 运行

```bash
npm install
npm run build
npm start
```

默认监听：

- `HOST=127.0.0.1`
- `PORT=3000`

## 2. 本地 Docker Compose

```bash
npm run compose:dev
```

当前 compose 会启动：

- `agentforge`
- `temporal`
- `temporal-ui`

端口：

- AgentForge: `3000`
- Temporal: `7233`
- Temporal UI: `8088`

停止：

```bash
npm run compose:down
```

## 3. Staging / Production 部署

### Staging

```bash
REMOTE_HOST=root@your-server \
ENV_FILE=.env.staging \
bash scripts/deploy-staging.sh
```

### Production

```bash
REMOTE_HOST=root@your-server \
ENV_FILE=.env.production \
bash scripts/deploy-production.sh
```

生产脚本默认会先执行：

```bash
npm run release:check
```

## 环境文件

示例：

- `.env.staging.example`
- `.env.production.example`

关键变量：

- `WORKFLOW_EXECUTOR`
- `DATABASE_URL`
- `CONTROL_PLANE_API_KEY`
- `HUMAN_GATE_API_KEY`
- `PROJECT_ALLOWLIST`
- `TEMPORAL_ADDRESS`
- `TEMPORAL_NAMESPACE`
- `TEMPORAL_TASK_QUEUE`
- `FEISHU_*`
- `OBSIDIAN_*`

## 推荐环境矩阵

| 环境 | `WORKFLOW_EXECUTOR` | 建议 |
| --- | --- | --- |
| 本地开发 | `in_memory` | 最快回归 |
| 集成联调 | `langgraph` | 验证图编排 |
| staging | `langgraph` 或 `temporal` | 看是否联调 durable workflow |
| production | `temporal` | 推荐 |

## 健康检查

### HTTP 服务

```bash
curl http://127.0.0.1:3000/health
```

### 控制台

- 打开 `/console`

### 指标

```bash
curl http://127.0.0.1:3000/metrics
```

### Temporal

- 检查 `7233` 端口
- 检查 Temporal UI `8088`
- 如使用独立 worker，确认 `npm run temporal:worker` 正常运行

## 发布前检查

统一入口：

```bash
npm run release:check
```

当前检查内容：

- `npm run typecheck`
- `npm test`
- `docker compose -f docker-compose.dev.yml config`
- `docker build`

## 备份与恢复

### 备份

```bash
npm run backup
```

默认备份源：

- `.agentforge`

### 恢复

```bash
bash scripts/restore.sh <backup-file.tgz> [target-dir]
```

## 反向代理建议

飞书回调常见配置：

- `/feishu/events`
- `/feishu/card-actions`

建议反代到 AgentForge 服务，不要指向静态站点。

示例上游：

- `http://127.0.0.1:3000`

## 日常巡检

### 每日

- `/health` 返回 `ok`
- `/metrics` 可读
- 最近发布没有新增高优告警

### 每周

- 检查备份目录是否持续产出
- 检查 deferred / conflicted 知识是否堆积
- 检查 Temporal worker 是否长期在线

## 真实联调专项

### 飞书

验证链路：

1. 发送卡片
2. 点击按钮
3. 观察回调日志
4. 确认任务状态变化
5. 确认事件写入 `task.human_gate_resolved`

### GitHub

验证链路：

1. 使用 token 查询仓库
2. 创建测试分支
3. 可选创建测试 PR
4. 查询 check 状态

### Obsidian

验证链路：

1. 开启 `OBSIDIAN_ENABLED=true`
2. 运行一条可发布知识的计划
3. 检查 vault 中是否生成 Markdown

## 升级注意事项

- 不要直接覆盖生产 `.env`
- 调整 `PROJECT_ALLOWLIST` 前先确认调用方请求头
- 调整飞书应用后必须重新发布版本
- 调整知识预算前要先确认 deferred / archived 行为是否符合预期
