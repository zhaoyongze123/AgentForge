# Architecture

## 总体分层

AgentForge 第一版采用“控制平面 + 编排层 + 执行层 + 集成层 + 存储层 + 知识层”的分层结构。

系统主线分为三条：

- 交付主线：`Planner -> Dispatcher -> Executor -> Evaluator -> Blocked Handler`
- 知识判定主线：`Evaluator -> Knowledge Scorer -> Workflow Decision`
- 知识演化主线：`Capture -> Merge / Conflict Check -> Publish -> Deprecate / Archive`

## 1. 控制平面层

控制平面层是 AgentForge 的核心，负责：

- 任务接收
- 任务拆分
- 任务状态机推进
- 权限边界校验
- 结果汇总
- 知识闭环触发决策

这层的主要职责不是直接改代码，而是决定“谁做、做什么、做到什么程度才算完成、失败时如何升级”。

控制平面中的主入口角色为 `Supervisor`。它负责接收高层目标、创建计划、启动工作流、观察全局状态，但不直接执行实现任务。

## 2. 编排层

编排层采用双引擎：

- LangGraph：管理 agent graph orchestration
- Temporal：管理 durable workflow、重试、恢复、异步唤起

两者分工：

- LangGraph 负责“谁与谁协作、阶段如何流转”
- Temporal 负责“长流程如何稳定运行、失败如何恢复、异步任务如何继续”

编排层中的核心运行实体为 `Workflow Engine`。它负责：

- 基于状态机推进任务
- 管理依赖与并行限制
- 处理 retry / blocked / human gate
- 消费验收结果并派生知识任务
- 执行知识预算、冲突检查和发布决策

## 3. 执行层

执行层由具体执行器承担：

- Codex
- Claude
- OpenHands

控制平面不和某一个执行器强耦合。执行器的职责是消费 TaskUnit，按权限边界完成任务、跑验证、返回结构化结果。

执行层的默认角色分工如下：

- `Planner`：把高层输入拆成原子 `TaskUnit`
- `Dispatcher`：选择可运行任务并分配执行器
- `Executor`：执行具体任务，默认可由 Codex / Claude / OpenHands 承担
- `Evaluator`：给出结构化验收结论和知识价值信号
- `Blocked Handler`：把失败分流到 retry、blocked 或人工升级

## 4. 集成层

集成层负责对接外部系统：

- GitHub：issue、branch、PR、CI 状态
- Playwright：浏览器验收
- 飞书：通知、人工介入、blocked 升级

后续如果需要，还可以扩展更多系统，但第一版只围绕这 3 类外部系统设计接口。

## 5. 存储层

存储层负责持久化：

- 任务
- 运行记录
- 验收结果
- 事件日志
- agent 输出结果
- 知识对象与知识版本
- 预算窗口与发布记录

第一版不强行规定最终数据库实现，但默认设计允许持久化这些核心实体。

## 6. 知识层

知识层由两部分组成：

- `mem0`
  运行时记忆层，保存短中期事实、上下文、候选知识、延迟发布条目。
- `Obsidian`
  长期知识主库，保存任务页、SOP、ADR、经验页和稳定规则。

知识层的目标不是“多写笔记”，而是保证系统把经过验证、可复用、可追溯的知识沉淀下来，同时避免知识无限制膨胀。

## 核心实体

- `Plan`
  高层计划，来源于用户输入、需求描述或 issue 集合。
- `Phase`
  一个计划下的阶段，用于控制大粒度推进顺序。
- `TaskUnit`
  原子任务单元，是整个系统的核心执行 contract。
- `Assignment`
  某个 TaskUnit 被派发给某个 agent / 执行器的一次执行记录。
- `AcceptanceRun`
  一次验收执行及其结果。
- `KnowledgeCandidate`
  一次知识提取候选，尚未进入长期主库。
- `KnowledgeRecord`
  一个长期知识对象，粒度固定为“可复用规则单元”。
- `KnowledgeBudgetWindow`
  一个预算统计窗口，记录单位时间内知识写入占用情况。
- `Incident`
  失败、blocked、环境异常或高风险问题记录。
- `HumanIntervention`
  一次人工决策、人工审核或人工接管记录。

## 状态机

第一版统一采用以下状态：

- `PLANNED`
- `READY`
- `RUNNING`
- `TESTING`
- `AWAITING_FRONTEND`
- `AWAITING_ACCEPTANCE`
- `FAILED_RETRYABLE`
- `FAILED_BLOCKED`
- `WAITING_HUMAN`
- `DONE`

默认解释：

- `PLANNED`：计划已建立，但还没拆到可执行单元
- `READY`：任务已决策完备，可被派发
- `RUNNING`：执行器正在处理
- `TESTING`：进入验证环节
- `AWAITING_FRONTEND`：需要前端或下游 agent 接力
- `AWAITING_ACCEPTANCE`：等待验收 agent 判定
- `FAILED_RETRYABLE`：可自动重试
- `FAILED_BLOCKED`：不能安全自动继续
- `WAITING_HUMAN`：等待人工决策
- `DONE`：闭环完成

知识闭环不复用业务任务状态，而是采用事件驱动子流程：

`acceptance_passed -> knowledge_candidate_created -> scoring -> dedupe/conflict_check -> budget_gate -> publish/review/archive`

新增知识事件：

- `knowledge_candidate_created`
- `knowledge_conflict_detected`
- `knowledge_budget_deferred`
- `knowledge_published`
- `knowledge_deprecated`
- `knowledge_archived`

知识事件用于驱动知识任务，不直接替代业务任务状态。

## 知识身份与生命周期

长期知识必须遵守统一身份模型：

```json
{
  "knowledge_id": "auth.jwt.expiry.strategy",
  "version": 3,
  "scope": "backend/auth",
  "status": "active",
  "confidence": 0.92
}
```

关键约束：

- `knowledge_id` 表示一个可独立引用、替换、比较的规则单元。
- 粒度固定为策略、流程、约束、稳定模式，不允许使用整篇文档或单句。
- 同一 `knowledge_id` 的新旧知识通过版本与 `supersedes` 关系衔接。
- 生命周期采用软删除分层：`candidate`、`active`、`deprecated`、`archived`、`conflicted`。

生命周期默认迁移：

- `candidate -> active`
  通过评分阈值、冲突检查、预算放行。
- `active -> deprecated`
  被更优规则替代。
- `active/deprecated -> archived`
  长期低使用、重复、低质量或低信心。
- 任意状态 -> `conflicted`
  命中高价值冲突，需要 review 或人工 gate。

## 知识触发与门控

知识写入只允许发生在“认知稳定点”：

- 任务 `DONE` 且验收 `passed`
- retry 成功后形成稳定修复经验
- blocked 解除后形成可复用经验
- 已验证的新策略明确优于旧策略

知识写入前必须同时通过：

- 验收门
- 评分门
- 去重 / 冲突门
- 预算门

任何一关失败，都不得直接写入 Obsidian 主内容。

## 关键原则

- 每个任务单元必须有 `read_set` / `write_set` / `acceptance`
- 每个 agent 只能碰自己的 `write_set`
- 验收 agent 只读不写业务代码
- 控制平面负责协调，不直接替代执行器完成业务实现
- 任何越界、歧义和高风险动作，都必须显式 blocked 或进入人工 gate
- `Evaluator` 的主职责仍是验收，但必须产出知识价值信号，供工作流决策是否生成知识任务
- 知识系统不能只增长，必须支持版本、冲突、降级与归档
- 预算超限时优先延迟或淘汰低价值候选，而不是继续无上限写入
