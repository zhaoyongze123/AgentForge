# AgentForge

AgentForge 是一个以控制平面为核心的 agent 驱动研发流水线系统。它的目标不是把人继续困在 IDE 问答循环里，而是让人从“逐步指挥 AI 改代码”的角色，升级成“定义目标、拆解边界、审阅方案、把关验收”的角色。

第一版只做控制平面 MVP：先把任务编排、状态机、任务 DSL、验收协议、新线程启动上下文，以及知识闭环的核心 contract 沉淀清楚，不在这一阶段承诺完整执行器平台或自研模型能力。

当前技术路线摘要：

- 控制平面：AgentForge 自研
- agent graph orchestration：LangGraph
- durable workflow：Temporal
- 执行器：Codex / Claude / OpenHands
- 外部系统：GitHub / Playwright / 飞书
- 运行时记忆：mem0
- 长期知识主库：Obsidian

这份仓库文档的目标只有一个：让后续任何新开的 Codex / Claude / OpenHands 线程，不依赖聊天历史，也能直接接管这个项目。

## 文档入口

- [AGENTS.md](./AGENTS.md)
  项目内 agent 的角色、权限边界、输出规则和 blocked 规则。
- [docs/PRODUCT.md](./docs/PRODUCT.md)
  项目定位、目标用户、要解决的问题和 MVP 边界。
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
  系统分层、核心实体、状态机和关键原则。
- [docs/ROADMAP.md](./docs/ROADMAP.md)
  分阶段目标、完成标准和阶段边界。
- [docs/TASK_SCHEMA.md](./docs/TASK_SCHEMA.md)
  任务 DSL 规范，是整个系统最关键的 contract。
- [docs/ACCEPTANCE.md](./docs/ACCEPTANCE.md)
  验收协议、输出格式、自动修复边界与 blocked 判定。
- [docs/KNOWLEDGE_MODEL.md](./docs/KNOWLEDGE_MODEL.md)
  长期知识对象、知识身份、冲突检测、生命周期与 Obsidian 映射。
- [docs/KNOWLEDGE_BUDGET.md](./docs/KNOWLEDGE_BUDGET.md)
  知识写入预算、Top-K 放行、队列与淘汰策略。
- [docs/BOOTSTRAP_PROMPT.md](./docs/BOOTSTRAP_PROMPT.md)
  任何新线程的标准启动指令。

## 当前默认边界

- 面向对象：你自己，以及后续新开的 Codex / Claude / OpenHands 线程
- 目标：沉淀“可复用、能跑、能稳、可持续”的 agent 研发控制平面规格
- 当前不做：
  - 自研模型
  - 自研浏览器引擎
  - 自研 CI 平台
  - 完整的组织级 RBAC 平台

## 新增默认原则

- 交付闭环与知识闭环并行设计，但长期知识写入必须晚于验收结论。
- `mem0` 只保存短中期运行时记忆与候选知识，不作为长期真相源。
- Obsidian 是长期知识主库，只接收通过门控的稳定知识对象。
- 知识对象必须以“可复用规则单元”建模，不能直接以整篇文档或单句充当主身份。
- 知识写入受预算与 Top-K 双重控制，系统不能无限制自增。

## 使用方式

当你新开一个线程时，不要重新口述项目背景。直接让新线程先读取：

1. `README.md`
2. `AGENTS.md`
3. `docs/BOOTSTRAP_PROMPT.md`

然后按 `BOOTSTRAP_PROMPT.md` 的要求建立上下文、输出理解、收敛架构，再进入任务拆分与执行。
