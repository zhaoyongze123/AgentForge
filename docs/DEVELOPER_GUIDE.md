# Developer Guide

## 目标

这份文档回答 3 个问题：

- 新人如何在本地把 AgentForge 跑起来
- 三种运行模式分别怎么启
- 真实链路联调时需要哪些环境变量和验证命令

## 环境前置

- Node.js `>=20`
- npm
- Docker Desktop 或兼容 Docker Engine
- 可选：
  - Temporal 本地容器
  - 飞书应用配置
  - GitHub Token
  - 自托管或云端 mem0 服务
  - Obsidian 仓库目录

## 安装与基础验证

```bash
npm install
npm run typecheck
npm test
```

预期：

- `npm run typecheck` 通过
- `npm test` 通过

## 核心环境变量

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `NODE_ENV` | 运行环境 | `development` |
| `HOST` | HTTP 监听地址 | `127.0.0.1` |
| `PORT` | HTTP 监听端口 | `3000` |
| `WORKFLOW_EXECUTOR` | 运行模式 | `in_memory` |
| `DATABASE_URL` | 文件数据库路径 | `.agentforge/db.json` |
| `CONTROL_PLANE_API_KEY` | 控制平面鉴权 | 空 |
| `HUMAN_GATE_API_KEY` | 人工 gate 额外鉴权 | 空 |
| `PROJECT_ALLOWLIST` | 项目白名单，逗号分隔 | 空 |
| `OBSIDIAN_ENABLED` | 是否启用长期知识落盘 | `false` |
| `OBSIDIAN_ROOT` | Obsidian 根目录 | 空 |
| `TEMPORAL_ADDRESS` | Temporal 地址 | `127.0.0.1:7233` |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `default` |
| `TEMPORAL_TASK_QUEUE` | Temporal task queue | `agentforge-control-plane` |
| `GITHUB_TOKEN` | GitHub 集成 | 空 |
| `FEISHU_APP_ID` | 飞书应用 ID | 空 |
| `FEISHU_APP_SECRET` | 飞书应用密钥 | 空 |
| `FEISHU_VERIFICATION_TOKEN` | 飞书事件校验 token | 空 |
| `FEISHU_ENCRYPT_KEY` | 飞书事件解密 key | 空 |

约束：

- 当 `OBSIDIAN_ENABLED=true` 时，必须显式提供 `OBSIDIAN_ROOT`
- 开启 `PROJECT_ALLOWLIST` 后，请求必须带 `x-project-id`
- 配置 `HUMAN_GATE_API_KEY` 后，人工 gate 写接口必须额外带 `x-human-gate-key`

## 运行模式

### 1. in-memory

适用场景：

- 本地开发
- 回归测试
- 文档演示

启动：

```bash
npm run build
WORKFLOW_EXECUTOR=in_memory npm start
```

### 2. LangGraph

适用场景：

- 验证真实图编排节点
- 不想引入 Temporal 时复现任务流

启动：

```bash
npm run build
WORKFLOW_EXECUTOR=langgraph npm start
```

### 3. Temporal

适用场景：

- durable workflow
- worker / workflow 分离
- 重试与恢复链路验证

推荐启动顺序：

```bash
docker compose -f docker-compose.dev.yml up -d temporal temporal-ui
npm run temporal:worker
WORKFLOW_EXECUTOR=temporal npm start
```

可选烟雾验证：

```bash
npm run temporal:smoke
```

## 本地最小闭环

### 启动服务

```bash
npm run build
CONTROL_PLANE_API_KEY=dev-key \
HUMAN_GATE_API_KEY=human-key \
PROJECT_ALLOWLIST=demo \
WORKFLOW_EXECUTOR=in_memory \
npm start
```

### 创建计划

```bash
curl -X POST http://127.0.0.1:3000/api/plans \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer dev-key' \
  -H 'x-project-id: demo' \
  -d '{
    "request": "做一个用户系统",
    "phase": "phase-local"
  }'
```

### 运行计划

```bash
curl -X POST http://127.0.0.1:3000/api/plans/<planId>/runs \
  -H 'authorization: Bearer dev-key' \
  -H 'x-project-id: demo'
```

### 查看状态

```bash
curl http://127.0.0.1:3000/api/plans/<planId>/status \
  -H 'authorization: Bearer dev-key' \
  -H 'x-project-id: demo'
```

### 打开控制台

- 浏览器访问：`http://127.0.0.1:3000/console`

## 真实联调入口

### GitHub

至少提供：

```bash
GITHUB_TOKEN=...
```

当前代码已具备：

- 仓库查询
- 分支查询
- PR 查询
- 创建分支
- 创建 PR
- PR checks 读取

### 飞书

至少提供：

```bash
FEISHU_APP_ID=...
FEISHU_APP_SECRET=...
FEISHU_VERIFICATION_TOKEN=...
FEISHU_ENCRYPT_KEY=...
```

回调入口：

- `POST /feishu/events`
- `POST /feishu/card-actions`

反代场景下建议：

- `https://<your-domain>/feishu/events`
- `https://<your-domain>/feishu/card-actions`

### mem0

当前仓库已落地 HTTP 适配层；如果要接真实 mem0，建议补充：

- `MEM0_BASE_URL`
- `MEM0_API_KEY`
- `MEM0_USER_ID`

当前主线不强依赖它们作为启动条件。

### Obsidian

长期知识落盘需要：

```bash
OBSIDIAN_ENABLED=true
OBSIDIAN_ROOT=/absolute/path/to/your/vault
```

## 常用命令

```bash
npm run build
npm run typecheck
npm test
npm run release:check
npm run temporal:worker
npm run temporal:smoke
npm run compose:dev
npm run compose:down
npm run backup
```

## 常见问题

### 1. 服务能启动，但所有接口 401

检查：

- 是否设置了 `CONTROL_PLANE_API_KEY`
- 请求头是否带了 `authorization: Bearer <token>`

### 2. 开启项目白名单后所有接口 403

检查：

- 是否设置了 `x-project-id`
- 请求头项目是否与计划绑定项目一致

### 3. 飞书点击卡片报错

检查：

- 飞书后台事件订阅地址是否可达
- 请求地址是否指向 `/feishu/card-actions`
- 应用版本是否重新发布
- 群里是否重新添加了新版应用

### 4. 启用 Obsidian 后启动失败

检查：

- `OBSIDIAN_ENABLED=true`
- `OBSIDIAN_ROOT` 是否为空
- 目录是否真实存在且可写

## 建议的日常开发顺序

1. `npm run typecheck`
2. `npm test`
3. 只在需要 durable workflow 时启动 Temporal
4. 只在需要真实通知时接入飞书
5. 修改知识逻辑前先读 `docs/KNOWLEDGE_MODEL.md`、`docs/KNOWLEDGE_BUDGET.md`、`docs/KNOWLEDGE_GOVERNANCE.md`
