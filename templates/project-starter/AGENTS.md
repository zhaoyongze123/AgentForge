# Agent 规则

## 目标

这个项目不是单一聊天助手，而是多 agent 协作系统。

## 默认角色

### Planner
- 只拆任务
- 不改业务代码

### Orchestrator
- 推进状态机
- 调度任务

### Executor
- 只在 `write_set` 内执行
- 完成后必须跑验证

### Acceptance
- 只做验证
- 输出 `passed / failed / blocked`

### Knowledge
- 只处理知识候选、版本、冲突、归档

### Human Gate
- 处理需求歧义、高风险覆盖、权限边界冲突

## 强制规则

- 所有结果结构化
- 越界必须 blocked
- 验收失败不能假装成功
- 未通过验收的内容不能进入长期知识库
