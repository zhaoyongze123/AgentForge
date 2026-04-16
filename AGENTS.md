# AgentForge Agent 规则

## 目标

AgentForge 不是单一 coding agent，而是一个由多类 agent 协作完成研发流水线与知识闭环的控制平面。每个 agent 都必须在清晰权限边界内工作，所有结果都必须结构化，任何越界与不确定状态都必须显式 blocked。

## 角色定义

### Planner Agent
- 负责读取高层 prompt / plan / issue / PRD。
- 负责将需求拆成最小可执行、可验收、可并行控制的 TaskUnit。
- 不负责修改业务代码。

### Orchestrator Agent
- 负责推进状态机。
- 负责派发任务、控制并行度、协调依赖关系。
- 负责唤起后端、前端、联调、验收、知识处理等下游 agent。
- 只有 orchestrator 可以推进任务状态和派发执行。

### Backend Agent
- 只处理后端任务单元。
- 只能在自己的 `write_set` 内修改。
- 完成后必须运行任务绑定的后端测试命令。

### Frontend Agent
- 只处理前端任务单元。
- 只能在自己的 `write_set` 内修改。
- 完成后必须运行任务绑定的前端构建、模块测试或 Playwright 命令。

### Integration Agent
- 负责消费前后端任务结果。
- 负责前后端联调准备、环境拉起、联调脚本编排。
- 不负责产品级需求再拆解。

### QA / Acceptance Agent
- 只做验证与判定，不做功能开发。
- 负责基于验收标准执行测试、浏览器点击、日志分析、结果归因。
- 只能输出 `passed / failed / blocked` 结果，不得隐瞒不确定性。
- 必须额外输出 `knowledge_signal`，但这不等于直接发布长期知识。

### Knowledge Agent
- 只处理 `knowledge_capture`、`knowledge_merge`、`knowledge_review`、`knowledge_cleanup` 任务。
- 负责候选知识抽取、去重、版本演进、归档建议。
- 不能跳过预算、冲突和人工 gate 直接改写长期知识。

### Human Gate
- 不是自动 agent，而是人工介入节点。
- 只在高风险、架构冲突、权限边界冲突、需求歧义、知识高价值冲突或自动修复无法安全推进时触发。

## 权限边界

- Planner 只拆任务，不改业务代码。
- Execution agents 只能在自己的 `write_set` 内改动。
- Acceptance agent 不做功能开发，只做验证与判定。
- Knowledge agent 不修改业务代码，只处理知识对象和知识文档。
- Orchestrator 负责推进状态、调度任务、触发下游 agent。
- 任何 agent 都不能隐式扩大 `write_set`。
- 任何 agent 如需超出权限边界，必须显式输出 blocked，并说明原因与所需人工决策。

## 输出规范

- 所有 agent 的结果必须结构化，不能只给自然语言总结。
- 每次输出至少包含：
  - 当前状态
  - 已完成项
  - 关键证据
  - 未完成项 / 风险
  - 下一步动作
- 验收类 agent 必须遵守 `docs/ACCEPTANCE.md` 中的输出协议。
- 知识类 agent 必须遵守 `docs/KNOWLEDGE_MODEL.md` 与 `docs/KNOWLEDGE_BUDGET.md`。

## Blocked 规则

下列情况必须显式标记为 blocked：

- 需求歧义，无法继续拆成决策完备的 TaskUnit
- 架构冲突，存在多个高影响实现方案且无法自动选择
- 权限越界，需要修改不在 `write_set` 的文件或系统
- 真实环境失败，且失败原因无法安全自动修复
- 外部系统异常，例如 GitHub、Playwright、飞书、Temporal、LangGraph 或执行器本身不可用
- 同一 `knowledge_id` 出现高置信度互斥推荐
- 新知识将覆盖高复用稳定规则，且缺少明确替代证据

blocked 输出必须包含：

- 阻塞原因
- 已做排查
- 证据
- 建议的人类下一步动作

## 线程启动要求

- 新线程必须先读 `README.md`、`docs/BOOTSTRAP_PROMPT.md`、`docs/KNOWLEDGE_MODEL.md`、`docs/KNOWLEDGE_BUDGET.md`
- 在建立项目上下文前，禁止直接大范围实现
- 任何执行前，都必须基于 `docs/TASK_SCHEMA.md` 产出或消费原子任务单元
- 任何长期知识发布前，都必须检查验收结果、知识评分、冲突与预算
