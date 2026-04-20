# API

## 基本约定

- 基础地址：`http://127.0.0.1:3000`
- 数据格式：JSON
- 健康检查与控制台页面无需认证
- 大多数 `/api/*` 路由受控制平面认证保护

## 认证头

### 控制平面认证

当配置了 `CONTROL_PLANE_API_KEY` 时，请求必须带：

```http
Authorization: Bearer <CONTROL_PLANE_API_KEY>
```

### 项目级隔离

当配置了 `PROJECT_ALLOWLIST` 时，请求必须带：

```http
x-project-id: <project-id>
```

### 人工 gate 额外认证

写入人工 gate 接口还要额外带：

```http
x-human-gate-key: <HUMAN_GATE_API_KEY>
```

## 公共接口

### `GET /health`

返回：

```json
{ "ok": true }
```

### `GET /console`

返回内嵌控制台 HTML。

### `GET /console/app.js`

返回控制台脚本。

### `GET /metrics`

返回 Prometheus 文本格式指标。

## 控制平面接口

### `POST /api/plans`

用途：

- 创建一个计划
- 由 Planner 拆解成任务图并持久化

请求体：

```json
{
  "request": "做一个用户系统",
  "phase": "phase-1",
  "projectId": "demo",
  "constraints": ["必须带人工 gate"],
  "targetModules": ["src/api", "src/workflow"]
}
```

返回：

```json
{
  "planId": "plan-1776400000000-1",
  "taskCount": 7,
  "tasks": []
}
```

### `GET /api/plans`

用途：

- 列出已创建计划

返回：

```json
{
  "plans": [
    {
      "planId": "plan-1776400000000-1",
      "phase": "phase-1",
      "request": "做一个用户系统",
      "runStatus": "completed",
      "tasks": []
    }
  ]
}
```

### `GET /api/plans/:planId/tasks`

用途：

- 读取指定计划的任务图

返回：

```json
{
  "planId": "plan-1776400000000-1",
  "tasks": []
}
```

### `POST /api/plans/:planId/runs`

用途：

- 触发一轮工作流执行

返回：

```json
{
  "planId": "plan-1776400000000-1",
  "taskCount": 7,
  "assignmentCount": 7,
  "publishedKnowledgeCount": 5
}
```

### `GET /api/plans/:planId/status`

用途：

- 查看计划运行状态

返回：

```json
{
  "planId": "plan-1776400000000-1",
  "runStatus": "completed",
  "taskCount": 7,
  "doneTaskCount": 7
}
```

### `GET /api/tasks/:taskId?planId=<planId>`

用途：

- 查看任务详情、指派、验收、人工介入和事件

返回：

```json
{
  "task": {},
  "assignments": [],
  "acceptanceRuns": [],
  "humanInterventions": [],
  "events": []
}
```

## 知识接口

### `GET /api/knowledge`

查询参数：

- `status`
- `scope`

返回：

```json
{
  "records": []
}
```

### `GET /api/knowledge/:knowledgeId`

返回：

```json
{
  "knowledgeId": "knowledge.auth.flow",
  "records": []
}
```

## 观测与审计接口

### `GET /api/metrics/snapshot`

返回：

```json
{
  "businessMetrics": {},
  "knowledgeMetrics": {},
  "executorMetrics": {},
  "alerts": []
}
```

### `GET /api/audit`

查询参数：

- `entityType`
- `entityId`
- `eventType`
- `limit`

返回：

```json
{
  "events": [],
  "acceptanceRuns": []
}
```

### `GET /api/alerts`

返回：

```json
{
  "alerts": []
}
```

## 人工 gate 接口

### `GET /api/human-gates`

查询参数：

- `relatedId`

返回：

```json
{
  "items": []
}
```

### `POST /api/human-gates`

用途：

- 人工插入一条 intervention 记录

请求体：

```json
{
  "relatedId": "backend-user-register",
  "type": "approval",
  "summary": "人工确认可继续",
  "actor": "operator"
}
```

### `POST /api/human-gates/actions`

用途：

- 对任务执行人工动作，并尝试推进状态

请求体：

```json
{
  "action": "approve",
  "actor": "operator",
  "summary": "人工批准",
  "relatedId": "backend-user-register",
  "taskId": "backend-user-register",
  "planId": "plan-1776400000000-1"
}
```

成功返回：

```json
{
  "intervention": {},
  "taskUpdated": true,
  "taskId": "backend-user-register",
  "fromStatus": "WAITING_HUMAN",
  "toStatus": "READY"
}
```

## 飞书回调接口

### `POST /feishu/events`

用途：

- 飞书事件订阅
- `url_verification`

### `POST /feishu/card-actions`

用途：

- 飞书卡片按钮回调
- 把动作转成 `HumanIntervention`
- 如条件满足，推进目标任务状态

卡片动作 value 推荐字段：

```json
{
  "action": "approve",
  "plan_id": "plan-1776400000000-1",
  "task_id": "backend-user-register",
  "related_id": "backend-user-register"
}
```

## 测试专用接口

### `POST /api/test/tasks/:taskId/status`

约束：

- 只在 `NODE_ENV=test` 时可用

用途：

- 测试时直接覆写任务状态

## 常见错误码

| 错误码 | 含义 |
| --- | --- |
| `AUTH_REQUIRED` | 缺少认证头 |
| `AUTH_FORBIDDEN` | 鉴权失败或项目越权 |
| `AUTH_INVALID` | 飞书 token 校验失败 |
| `TASK_NOT_FOUND` | 任务不存在 |
| `PLAN_NOT_FOUND` | 计划不存在 |
| `CONFIG_MISSING` | 缺少必要配置 |
| `CONFIG_INVALID` | 配置值非法 |
| `NOT_FOUND` | 路由不存在 |
| `INTERNAL_ERROR` | 未分类内部错误 |
