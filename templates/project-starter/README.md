# {{PROJECT_NAME}}

## 项目定位

这是一个基于 AgentForge 模式搭建的多 agent 控制平面项目。

需要先明确：

- 目标业务域
- 交付主线
- 验收标准
- 长期知识主库
- 人工 gate 边界

## 启动前先补齐

- `AGENTS.md`
- `docs/PROJECT_BRIEF.md`
- `docs/BOOTSTRAP_PROMPT.md`
- `docs/TASK_UNIT_EXAMPLE.yaml`
- `.env.example`

## 推荐运行方式

1. 用文档先定义角色边界
2. 用 TaskUnit 先固化原子任务 contract
3. 先跑 in-memory，再接 LangGraph / Temporal
4. 先打通验收，再接知识闭环

## 最小目录建议

```text
src/
tests/
docs/
templates/
```
