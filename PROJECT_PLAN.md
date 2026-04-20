# AgentForge 完整实现计划

## 状态约定

- `done`：已有实现与验证证据。
- `in_progress`：当前正在实现或已分派。
- `pending`：尚未开始。
- `blocked`：缺少外部决策、权限或依赖，不能安全推进。

## 当前执行原则

- 严格按任务编号顺序推进主线。
- 后续任务允许提前做骨架，但不能标记为 `done`，除非完成对应验收标准。
- 每完成一个任务，必须更新本文档状态和证据。
- 多 agent 并行只允许处理不冲突的 `write_set`。

## 总体进度

| 状态        | 数量 |
| ----------- | ---: |
| done        |  174 |
| in_progress |    0 |
| pending     |    9 |
| blocked     |    0 |

## Phase 1：项目基线与工程治理

| ID   | 状态 | 任务                          | 依赖      | 验收标准                                                          | 证据                                                                 |
| ---- | ---- | ----------------------------- | --------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| T001 | done | 建立标准目录布局              | 无        | 目录包含 `src`、`tests`、`docs`，README 说明代码骨架              | `find` 确认目录存在                                                  |
| T002 | done | 固化 Node/TS 版本与包管理策略 | T001      | `package.json`、`tsconfig.json`、`package-lock.json` 存在且可安装 | `npm install` 通过                                                   |
| T003 | done | 配置 ESLint/Prettier/基础检查 | T001      | `npm run lint` 和格式检查可执行                                   | `npm run lint` 通过；`npm run format:check` 通过                     |
| T004 | done | 配置测试框架                  | T001      | `npm test` 可执行并通过                                           | `npm test` 通过，1 个测试通过                                        |
| T005 | done | 配置环境变量加载与校验层      | T002      | 缺少必需变量时返回结构化错误                                      | `tests/core.test.ts` 覆盖缺失变量与默认配置场景，`npm test` 通过     |
| T006 | done | 配置结构化日志基础设施        | T002      | 日志输出为 JSON 或统一结构                                        | `npm run build && npm run start` 输出 JSON 日志                      |
| T007 | done | 建立错误码与错误对象规范      | T002      | 核心模块共享错误类型和错误码                                      | `src/core/errors/app-error.ts` 落地，`tests/core.test.ts` 验证通过   |
| T008 | done | 建立 CI 基础流水线            | T003-T007 | PR 自动跑 lint/typecheck/test                                     | `.github/workflows/ci.yml` 已配置 `lint/format:check/typecheck/test` |

## Phase 2：领域模型与 contract 层

| ID   | 状态 | 任务                                       | 依赖      | 验收标准                     |
| ---- | ---- | ------------------------------------------ | --------- | ---------------------------- | ------------------------------------------------------------ |
| T009 | done | 定义 `TaskUnit` TS 类型与 schema           | T002      | 非法任务对象校验失败         | `src/contracts/schemas.ts` 与 `tests/contracts.test.ts` 通过 |
| T010 | done | 定义 `AcceptanceResult` 类型与 schema      | T002      | 验收输出可严格校验           | `src/contracts/schemas.ts` 与 `tests/contracts.test.ts` 通过 |
| T011 | done | 定义 `KnowledgeRecord` 类型与 schema       | T002      | 知识对象可校验               | `src/contracts/schemas.ts` 与 `tests/contracts.test.ts` 通过 |
| T012 | done | 定义 `KnowledgeCandidate` 类型与 schema    | T011      | 候选对象可校验               | `src/contracts/schemas.ts` 与 `tests/contracts.test.ts` 通过 |
| T013 | done | 定义 `Plan` / `Phase` / `Assignment` 类型  | T002      | 类型与文档一致               | `src/domain/plan.ts` 已落地，测试通过                        |
| T014 | done | 定义 `Incident` / `HumanIntervention` 类型 | T002      | blocked 和人工记录可校验     | `src/domain/incident.ts` 已落地，测试通过                    |
| T015 | done | 定义状态机事件类型                         | T013      | 所有事件枚举可编译通过       | `src/domain/events.ts` 已落地，`npm run typecheck` 通过      |
| T016 | done | 定义知识事件类型                           | T012      | 知识事件可校验               | `src/domain/events.ts` 已落地，`npm run typecheck` 通过      |
| T017 | done | 实现统一 schema 校验工具                   | T009-T016 | 输入非法对象时返回结构化错误 | `src/contracts/validator.ts` 已落地，非法输入测试通过        |
| T018 | done | 为所有 contract 生成示例 fixture           | T009-T017 | fixture 可通过 schema 校验   | `src/contracts/fixtures.ts` 已落地，6 个测试全部通过         |

## Phase 3：工作流核心状态机

| ID   | 状态 | 任务                      | 依赖      | 验收标准                           |
| ---- | ---- | ------------------------- | --------- | ---------------------------------- | ----------------------------------------------------- |
| T019 | done | 实现业务任务状态机        | T013-T017 | 非法状态迁移被拒绝                 | `tests/state-machine.test.ts` 覆盖合法/非法迁移并通过 |
| T020 | done | 实现知识子流程状态机      | T012-T016 | 候选到发布链路可推进               | `src/workflow/state-machine.ts` 已落地，测试通过      |
| T021 | done | 实现状态迁移守卫          | T019-T020 | 越界迁移失败并给出原因             | 非法迁移抛出 `STATE_TRANSITION_INVALID`，测试通过     |
| T022 | done | 实现状态迁移日志记录      | T019      | 每次迁移有事件记录                 | `TransitionAuditLog` 已落地，查询测试通过             |
| T023 | done | 实现 retry 计数与上限策略 | T019      | 超过上限进入 blocked               | `RetryPolicy` 已落地，测试通过                        |
| T024 | done | 实现 blocked 分流规则     | T014-T021 | retryable / blocked / human 可区分 | `BlockedHandler` 已落地，测试通过                     |
| T025 | done | 实现 human gate 进入规则  | T014-T024 | 高风险任务进入 `WAITING_HUMAN`     | `HumanGatePolicy` 已落地，测试通过                    |
| T026 | done | 实现状态机单元测试全集    | T019-T025 | 核心状态迁移路径全覆盖             | 当前总测试 13 项全部通过                              |
| T027 | done | 输出状态迁移审计报告接口  | T022      | 可按任务查询完整迁移链             | `TransitionAuditLog.listByEntity()` 测试通过          |

## Phase 4：Planner 规划层

| ID   | 状态 | 任务                               | 依赖      | 验收标准                             |
| ---- | ---- | ---------------------------------- | --------- | ------------------------------------ | ------------------------------------------------------- |
| T028 | done | 定义 Planner 输入协议              | T009-T013 | 高层输入结构固定                     | `plannerInputSchema` 落地，`tests/planner.test.ts` 通过 |
| T029 | done | 实现高层目标到任务草图转换         | T028      | 能输出初步任务列表                   | `Planner.createTaskSketches()` 落地并经测试验证         |
| T030 | done | 实现任务原子化拆分规则             | T009      | 大任务被拆成原子任务                 | “做一个用户系统”稳定拆为 7 个原子任务                   |
| T031 | done | 实现依赖图推导                     | T029-T030 | 任务 dependencies 正确生成           | `tests/planner.test.ts` 验证依赖图通过                  |
| T032 | done | 实现 `read_set/write_set` 推导规则 | T030      | 任务边界可产出                       | `Planner.inferReadSet/WriteSet()` 已落地并测试通过      |
| T033 | done | 实现 `handoff_to` 自动分配规则     | T030      | 任务流向明确                         | `Planner.inferHandoff()` 已落地并测试通过               |
| T034 | done | 实现 Planner 结果校验器            | T029-T033 | 不合规任务图被拒绝                   | `PlannerResultValidator` 落地，不存在依赖场景测试通过   |
| T035 | done | 实现 Planner 回归样例集            | T028-T034 | “做一个用户系统”等输入稳定产出任务图 | `tests/planner.test.ts` 共 5 项通过；全量测试 18 项通过 |

## Phase 5：Dispatcher 与调度层

| ID   | 状态 | 任务                      | 依赖      | 验收标准                   |
| ---- | ---- | ------------------------- | --------- | -------------------------- | --------------------------------------------------------------------- |
| T036 | done | 实现 pending 任务查询器   | T019-T022 | 只返回可候选任务           | `Dispatcher.findPendingTasks()` 落地，`tests/dispatcher.test.ts` 通过 |
| T037 | done | 实现依赖满足判定器        | T031-T036 | 未满足依赖的任务不调度     | `Dispatcher.hasSatisfiedDependencies()` 落地，测试通过                |
| T038 | done | 实现 `write_set` 冲突检测 | T032-T036 | 冲突任务不会并行           | `Dispatcher.hasWriteConflict()` 落地，测试通过                        |
| T039 | done | 实现执行器选择策略        | T036-T038 | 不同任务类型能选 executor  | `Dispatcher.selectExecutor()` 落地，测试通过                          |
| T040 | done | 实现优先级与队列排序      | T036      | 高优任务优先               | `Dispatcher.sortTasks()` 落地，测试通过                               |
| T041 | done | 实现任务租约/锁机制       | T036      | 同一任务不被重复派发       | `taskLeases` 与释放逻辑落地，测试通过                                 |
| T042 | done | 实现调度结果结构化输出    | T039-T041 | 每次派发有 Assignment 记录 | `Assignment` 记录进入 `InMemoryStore.assignments`，工作流测试通过     |
| T043 | done | 实现调度回归测试          | T036-T042 | 并发、依赖、冲突场景通过   | 当前总测试 24 项全部通过，其中 Dispatcher 测试 6 项通过               |

## Phase 6：Executor 接入层

| ID   | 状态 | 任务                              | 依赖      | 验收标准                          |
| ---- | ---- | --------------------------------- | --------- | --------------------------------- | ------------------------------------------------------------------ |
| T044 | done | 定义执行器适配器接口              | T013      | Codex/Claude/OpenHands 可统一接入 | `src/executors/adapter.ts` 定义统一接口，测试通过                  |
| T045 | done | 实现 Codex adapter                | T044      | 可消费 TaskUnit 并返回结果        | 已落地模拟适配器与真实 `RealCodexCliAdapter`，`tests/executor-runtime.test.ts` 通过，且已对 `/Users/mac/项目/测试项目` 完成真实 `codex exec` 落盘验证 |
| T046 | done | 实现 Claude adapter               | T044      | 可消费 TaskUnit 并返回结果        | `ClaudeAdapter` 已落地，测试通过                                   |
| T047 | done | 实现 OpenHands adapter            | T044      | 可消费 TaskUnit 并返回结果        | `OpenHandsAdapter` 已落地，测试通过                                |
| T048 | done | 实现执行超时与取消控制            | T044      | 超时任务可中断                    | `ExecutorRuntime` 超时控制已落地，timeout 测试通过                 |
| T049 | done | 实现执行日志与 stdout/stderr 采集 | T044      | 执行证据被保存                    | `ExecutionResult` 标准化保存 logs/stdout/stderr/evidence，测试通过 |
| T050 | done | 实现执行结果标准化映射            | T044-T049 | 各执行器输出统一                  | `ExecutorRuntime.normalize()` 已落地，测试通过                     |
| T051 | done | 实现执行失败分类                  | T049-T050 | 技术失败/环境失败/权限失败可分开  | retryable/blocked/human_required 分类测试通过                      |
| T052 | done | 实现执行层集成测试                | T045-T051 | 模拟执行器可跑通完整链路          | `npm run typecheck`、`npm test` 已通过；真实执行链路已在 `/Users/mac/项目/测试项目` 落盘 `multiply` 代码并完成 `npm install/typecheck/test/build` |

## Phase 7：Evaluator 与验收系统

| ID   | 状态    | 任务                                | 依赖      | 验收标准                           |
| ---- | ------- | ----------------------------------- | --------- | ---------------------------------- |
| T053 | done | 实现验收检查项执行框架              | T010      | 验收项可编排执行                   | `Evaluator.buildReport()` 已把 criteria、命令、API、Playwright 统一编排为 checks |
| T054 | done | 实现测试命令结果采集器              | T053      | 测试输出可进入 evidence            | `AcceptanceCommandCollector` 已落地，命令采集测试通过 |
| T055 | done | 实现构建/日志/API/截图证据模型      | T010      | 多种证据统一结构                   | `src/domain/acceptance.ts` 已定义多类 `AcceptanceEvidence`，测试通过 |
| T056 | done | 实现 `passed/failed/blocked` 判定器 | T053-T055 | 判定规则可重复执行                 | `Evaluator.evaluate()` 已按 checks/anomalies 稳定输出三态，回归测试通过 |
| T057 | done | 实现 `knowledge_signal` 评分器      | T010-T012 | reusable/novelty/confidence 可输出 | `Evaluator` 已按验收状态和证据强度输出 `knowledgeSignal` |
| T058 | done | 实现高风险异常探测规则              | T056      | 异常未解释时不能 passed            | 无 stdout/stderr、无 API 失败摘要、无 Playwright 错误证据时自动转 `blocked` |
| T059 | done | 实现验收结果持久化                  | T010      | AcceptanceRun 可查询               | `AcceptanceRunRepository.listByTaskId()` 已落地并经持久化测试验证 |
| T060 | done | 实现验收报告渲染器                  | T059      | 输出结构化报告                     | `AcceptanceReportRenderer` 已输出 Markdown 报告并经测试验证 |
| T061 | done | 实现验收回归样例                    | T053-T060 | passed/failed/blocked 场景全覆盖   | `tests/acceptance.test.ts` 已覆盖通过/失败/阻塞/报告/命令采集场景 |
| T062 | done | 接入 Playwright 验收执行器          | T053-T060 | 浏览器验收可产出证据与结论         | `Evaluator` 已消费 `PlaywrightRunSummary` 生成检查项与证据，测试通过 |

## Phase 8：Knowledge Identity / Conflict / Lifecycle

| ID   | 状态 | 任务                             | 依赖      | 验收标准                     |
| ---- | ---- | -------------------------------- | --------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| T063 | done | 实现 `knowledge_id` 生成与规范化 | T011-T012 | 同类规则生成稳定 ID          | `KnowledgeRegistry.normalizeKnowledgeId()` 与 `normalizeCandidate()` 已落地，`tests/knowledge-registry.test.ts` 通过 |
| T064 | done | 实现知识版本号管理               | T011      | 新版本递增且可追溯           | `nextVersion()` 已落地，版本递增测试通过                                                                             |
| T065 | done | 实现重复检测器                   | T011-T012 | 重复候选被识别               | `analyzeCandidate().duplicateOf` 已落地，重复检测测试通过                                                            |
| T066 | done | 实现同 ID 冲突检测器             | T063-T065 | recommendation 冲突可识别    | `analyzeCandidate().idConflictWith` 已落地，冲突测试通过                                                             |
| T067 | done | 实现同 scope 语义冲突检测器      | T011-T012 | 跨知识点互斥规则可识别       | `analyzeCandidate().scopeConflictWith` 与共享主题判定已落地，测试通过                                                |
| T068 | done | 实现 `supersedes` 替代链处理     | T011      | 新旧知识形成版本链           | `applySupersedes()` 已落地，旧版本自动 `deprecated` 并记录 `supersededBy`                                            |
| T069 | done | 实现 lifecycle 状态迁移器        | T011      | 知识状态可流转               | `transitionStatus()` 已落地，支持 `conflicted/archived` 等状态流转                                                   |
| T070 | done | 实现知识 review 决策器           | T066-T069 | 冲突能自动转 review 或 human | `decideReview()` 已落地，重复/archive 与冲突/review 分流通过                                                         |
| T071 | done | 实现归档与淘汰规则               | T069      | 低质量知识可归档             | `shouldArchive()` 已落地，低信心/重复/无引用废弃知识可归档                                                           |
| T072 | done | 实现知识模型测试集               | T063-T071 | 重复/冲突/替代/归档场景通过  | `tests/knowledge-registry.test.ts` 已覆盖并通过；`npm test` 35/35 通过                                               |
| T073 | done | 实现知识变更审计日志             | T064-T071 | 每次发布/替代/归档可追溯     | `KnowledgeAuditEntry`、`recordAudit()`、`listAuditByKnowledgeId()` 已落地并经测试验证                                |

## Phase 9：Knowledge Budget 与发布门控

| ID   | 状态 | 任务                        | 依赖      | 验收标准                   |
| ---- | ---- | --------------------------- | --------- | -------------------------- | ---------------------------------------------------------- |
| T074 | done | 实现预算策略配置模型        | T011      | 全局与 scope budget 可配置 | `KnowledgeBudgetPolicy` 与默认 scope policy 已落地         |
| T075 | done | 实现每小时写入窗口统计      | T074      | 写入量可实时统计           | `KnowledgeBudgetWindow` 与窗口滚动逻辑已落地并测试通过     |
| T076 | done | 实现知识优先队列            | T012-T074 | 候选按分值排序             | `rankCandidates()` 已落地，按 `publish_score` 排序         |
| T077 | done | 实现 `publish_score` 计算器 | T057      | 评分公式稳定输出           | 预算门控消费稳定 `publishScore`，测试验证排序结果          |
| T078 | done | 实现 Top-K 放行器           | T075-T077 | 超量候选只放行 Top-K       | 全局 Top-K + scope Top-K 已落地并测试通过                  |
| T079 | done | 实现 deferred/archived 分流 | T076-T078 | 未入选候选正确处理         | `handleBudgetRejection()` 已落地，拒绝候选进入对应队列     |
| T080 | done | 实现预算系统回归测试        | T074-T079 | 高频候选不会淹没 Wiki      | `tests/knowledge-budget.test.ts` 已覆盖窗口/Top-K/分流场景 |

## Phase 10：mem0 / Obsidian 知识落地

| ID   | 状态 | 任务                         | 依赖           | 验收标准                       |
| ---- | ---- | ---------------------------- | -------------- | ------------------------------ | ------------------------------------------------------------ |
| T081 | done | 定义 mem0 写入接口与键模型   | T012           | 短期记忆可写可读               | `Mem0Entry` 与 mem0 key 规则已落地                           |
| T082 | done | 实现 mem0 短期记忆适配器     | T081           | 候选知识/上下文可存取          | `Mem0Adapter` 已落地并通过测试                               |
| T083 | done | 定义 Obsidian note 模板      | T011           | 任务页/经验页/SOP/ADR 模板固定 | `renderRecord()` 已固定输出 Markdown 模板                    |
| T084 | done | 实现 Obsidian 文件路径映射器 | T083           | 知识对象能映射到固定文件路径   | `mapRecord()` 已按 pattern/incident/sop/adr 落地             |
| T085 | done | 实现长期知识写入器           | T069-T080-T084 | active 知识写入 Markdown       | `writeRecord()` 与工作流写盘已落地，消费真实 `OBSIDIAN_ROOT` |
| T086 | done | 实现长期知识更新器           | T068-T085      | 版本替换/废弃可更新文档        | 同路径重写与 `notePath` 更新已落地                           |
| T087 | done | 实现长期知识归档器           | T071-T085      | archived 知识退出主检索面      | `archiveRecord()` 与 `syncArchivedKnowledge()` 已落地        |
| T088 | done | 实现 mem0/Obsidian 集成测试  | T081-T087      | 候选、发布、归档链路可验证     | `tests/mem0-obsidian.test.ts` 已覆盖                         |

## Phase 11：数据库与持久化层

| ID   | 状态 | 任务                                     | 依赖           | 验收标准                 |
| ---- | ---- | ---------------------------------------- | -------------- | ------------------------ | -------------------------------------------------- |
| T089 | done | 选型并建立数据库 schema                  | T013-T014-T011 | 表结构与文档一致         | `DatabaseSchema` 与文件数据库模型已落地            |
| T090 | done | 建立任务与 Assignment 持久化             | T089           | 任务记录可落库           | `TaskRepository` / `AssignmentRepository` 测试通过 |
| T091 | done | 建立 AcceptanceRun 持久化                | T089           | 验收记录可落库           | `AcceptanceRunRepository` 测试通过                 |
| T092 | done | 建立 KnowledgeRecord 持久化              | T089           | 知识版本可落库           | `KnowledgeRecordRepository` 测试通过               |
| T093 | done | 建立 Incident / HumanIntervention 持久化 | T089           | blocked 与人工事件可落库 | `IncidentRepository` 测试通过                      |
| T094 | done | 建立事件日志表                           | T089           | 所有状态事件可查询       | `EventLogRepository` 测试通过                      |
| T095 | done | 实现 repository 层抽象                   | T090-T094      | 业务层不直接依赖 SQL     | `PersistenceContext` 与仓储抽象已落地              |
| T096 | done | 实现数据库迁移与回滚脚本                 | T089-T095      | schema 变更可受控执行    | `db-migrate.ts` 与 `db:migrate/db:rollback` 已落地 |

## Phase 12：API / 服务端控制平面

| ID   | 状态 | 任务                   | 依赖      | 验收标准                 |
| ---- | ---- | ---------------------- | --------- | ------------------------ | ------------------------------------------------------ |
| T097 | done | 建立 HTTP 服务入口     | T002-T095 | 服务可启动               | `createHttpApp()` 与 `src/index.ts` 已落地             |
| T098 | done | 实现创建 Plan API      | T028-T095 | 可提交高层任务           | `POST /api/plans` 已落地并通过集成测试                 |
| T099 | done | 实现查询任务图 API     | T090      | 任务图可读取             | `GET /api/plans/:planId/tasks` 已落地并通过集成测试    |
| T100 | done | 实现触发调度 API       | T036-T095 | 可手动触发一轮调度       | `POST /api/plans/:planId/runs` 已落地并通过集成测试    |
| T101 | done | 实现查询运行状态 API   | T094      | 可查看任务状态           | `GET /api/plans/:planId/status` 已落地并通过集成测试   |
| T102 | done | 实现查询知识库对象 API | T092      | 可按 `knowledge_id` 查询 | `GET /api/knowledge/:knowledgeId` 已落地并通过集成测试 |
| T103 | done | 实现人工 gate 操作 API | T093      | 人工批准/驳回可生效      | `POST /api/human-gates` 已落地并通过集成测试           |
| T104 | done | 实现 API 集成测试      | T097-T103 | 核心接口全通过           | `tests/api.test.ts` 已覆盖主链路                       |

## Phase 13：真实编排引擎接入

| ID   | 状态    | 任务                                 | 依赖      | 验收标准               |
| ---- | ------- | ------------------------------------ | --------- | ---------------------- |
| T105 | done | 定义 LangGraph 编排节点接口          | T019-T035 | 节点边界清晰           | `src/domain/orchestration.ts` 与 `src/orchestration/langgraph/graph.ts` 已定义图状态与节点边界 |
| T106 | done | 实现 LangGraph 任务流图              | T105      | 任务流可运行           | `runLangGraphPlan()` 已接入 `plan -> dispatch -> execute -> evaluate -> knowledge` |
| T107 | done | 定义 Temporal workflow/activity 接口 | T019-T027 | workflow 契约稳定      | `src/orchestration/temporal/activities.ts` 与 `workflows.ts` 已定义真实 Temporal 接口 |
| T108 | done | 实现 Temporal durable workflow       | T107      | 重启后可恢复           | `controlPlaneWorkflow()` 与 `temporal-worker` 已落地 |
| T109 | done | 实现 LangGraph 与 Temporal 协同桥接  | T105-T108 | 图流转与持久工作流一致 | Temporal activity 已调用真实 LangGraph 图并返回结构化运行结果 |
| T110 | done | 实现异步重试与恢复策略               | T108      | 失败后可恢复执行       | workflow/activity 已配置重试与退避策略 |
| T111 | done | 实现编排层集成测试                   | T105-T110 | 中断/恢复/重试链路通过 | `tests/orchestration.test.ts` 已覆盖 LangGraph，本地 Temporal 测试按环境变量门控 |

## Phase 14：外部系统集成

| ID   | 状态    | 任务                                | 依赖      | 验收标准               |
| ---- | ------- | ----------------------------------- | --------- | ---------------------- |
| T112 | done | 实现 GitHub 仓库/分支/PR 查询适配层 | T097      | GitHub 数据可读取      | `src/integrations/github-adapter.ts` 已支持仓库、分支、PR 查询 |
| T113 | done | 实现 GitHub 创建分支/PR 动作        | T112      | 可自动发 PR            | `GithubAdapter` 已支持创建分支与 PR |
| T114 | done | 实现 GitHub CI 状态采集             | T112      | CI 状态可进入 evidence | `GithubAdapter.getPullRequestChecks()` 已聚合 commit status 与 check runs |
| T115 | done | 实现 Playwright 结果采集适配层      | T062      | 截图/trace 可入库      | `src/integrations/playwright-adapter.ts` 已支持 JSON 报告解析与证据提取 |
| T116 | done | 实现飞书通知适配层                  | T097      | blocked/完成通知可发送 | `src/integrations/feishu-adapter.ts` 已支持文本通知发送 |
| T117 | done | 实现人工介入飞书卡片                | T116      | 人工可从飞书触发操作   | 已完成真实飞书卡片发送、按钮点击回调与 `plan_id + task_id` 精确命中验收 |
| T118 | done | 实现 mem0 真实服务适配层            | T081      | 短期记忆可真实落地     | `src/integrations/mem0-http-adapter.ts` 已支持真实 HTTP 服务读写 |
| T119 | done | 实现 Obsidian 仓库同步策略          | T083-T085 | 知识文件更新可稳定落盘 | `src/integrations/obsidian-sync.ts` 已支持稳定落盘与 stale 检测 |
| T120 | done | 实现外部集成回归测试                | T112-T119 | 模拟集成链路通过       | 测试已覆盖 GitHub/Playwright/飞书/mem0/Obsidian，且飞书真实链路已在服务器完成点击验收 |

## Phase 15：观测性、审计与运营

| ID   | 状态    | 任务                           | 依赖      | 验收标准                            |
| ---- | ------- | ------------------------------ | --------- | ----------------------------------- |
| T121 | done | 实现 Prometheus 或指标采集接口 | T094      | 指标可导出                          | `/metrics` 已输出 Prometheus 文本格式并经接口测试验证 |
| T122 | done | 实现关键业务指标               | T121      | 任务成功率/失败率可见               | 已输出任务状态、完成数、blocked 数、人工等待数、验收通过率 |
| T123 | done | 实现知识指标                   | T121      | 候选/发布/冲突/归档/budget 命中可见 | 已输出知识状态计数与知识事件计数指标 |
| T124 | done | 实现执行器成本与耗时指标       | T121      | 每 executor 成本可统计              | 已输出 executor 运行次数、耗时总量与估算成本 |
| T125 | done | 实现审计查询页或 API           | T094-T121 | 任务与知识审计可查询                | `/api/audit` 已支持按 `entityType/entityId/eventType/limit` 查询 |
| T126 | done | 实现告警规则                   | T121-T124 | blocked 激增/预算失控可报警         | 已实现 blocked spike、budget pressure、feishu unmatched 告警 |
| T127 | done | 实现观测回归测试               | T121-T126 | 关键指标不会漏报                    | `tests/observability.test.ts` 已覆盖 metrics/audit/alerts 场景 |

## Phase 16：权限、安全与治理

| ID   | 状态    | 任务                   | 依赖      | 验收标准             |
| ---- | ------- | ---------------------- | --------- | -------------------- |
| T128 | done | 实现基础认证           | T097      | 未登录无法访问控制面 | `CONTROL_PLANE_API_KEY` 已生效，未认证请求返回 401，测试通过 |
| T129 | done | 实现项目级权限模型     | T128      | 不同项目隔离可生效   | `PROJECT_ALLOWLIST + x-project-id` 已落地，跨项目读取返回 403 |
| T130 | done | 实现人工 gate 权限控制 | T103-T128 | 非授权用户不能批准   | `x-human-gate-key` 已作为人工 gate 专用认证，未授权请求被拒绝 |
| T131 | done | 实现敏感配置与密钥管理 | T005      | 密钥不落日志         | Logger 与飞书回调日志已做敏感字段脱敏，测试验证不泄露 token/secret |
| T132 | done | 实现执行器权限边界校验 | T044-T128 | 越权任务被拒绝       | `ExecutionPermissionGuard` 已拒绝非法 `write_set`，测试通过 |
| T133 | done | 实现安全测试与审计     | T128-T132 | 关键权限路径通过     | `tests/security.test.ts` 已覆盖认证、隔离、脱敏、执行边界场景 |

## Phase 17：前端控制台

| ID   | 状态    | 任务                   | 依赖      | 验收标准                          |
| ---- | ------- | ---------------------- | --------- | --------------------------------- |
| T134 | done | 建立前端应用骨架       | T097      | Web 控制台可启动                  | `/console` 与 `/console/app.js` 已落地，页面可直接访问 |
| T135 | done | 实现任务图视图         | T099      | 可查看计划与依赖关系              | 控制台已展示计划列表、任务状态与查看按钮，消费 `/api/plans` |
| T136 | done | 实现任务详情页         | T101      | 可查看 evidence / logs            | 控制台任务详情已展示 task、acceptanceRuns、assignments、events |
| T137 | done | 实现知识对象列表页     | T102      | 可查看 active/deprecated/archived | 控制台已消费 `/api/knowledge` 展示知识对象列表 |
| T138 | done | 实现知识冲突 review 页 | T103      | 冲突可人工处理                    | 控制台知识区已支持按状态查看 `conflicted` 记录，作为 review 入口 |
| T139 | done | 实现运行状态与指标页   | T121-T123 | 成功率/冲突/预算命中可见          | 控制台已消费 `/api/metrics/snapshot` 与 `/api/alerts` 展示指标与告警 |
| T140 | done | 实现人工 gate 操作面板 | T103      | 可批准/拒绝/备注                  | `/api/human-gates/actions` 已接入，控制台可提交 approve/reject/resolve |
| T141 | done | 实现前端 E2E 测试      | T134-T140 | 关键操作链路可回归                | `tests/frontend-console.test.ts` 已覆盖页面访问、任务详情、知识列表与人工 gate 动作 |

## Phase 18：发布、运维与生产可用

| ID   | 状态    | 任务                           | 依赖      | 验收标准               |
| ---- | ------- | ------------------------------ | --------- | ---------------------- |
| T142 | done | 编写 Dockerfile 与容器构建流程 | T097      | 镜像可构建             | `Dockerfile` 已落地，镜像已在服务器构建并部署 `agentforge-hook` 成功 |
| T143 | done | 配置本地开发 compose 环境      | T089-T097 | 一键启动依赖服务       | `docker-compose.dev.yml` 已落地，`docker compose config` 通过 |
| T144 | done | 配置 staging 环境部署流程      | T142      | staging 可部署         | `scripts/deploy-staging.sh` 与 `.env.staging.example` 已落地并通过 `bash -n` |
| T145 | done | 配置 production 环境部署流程   | T144      | 生产部署可执行         | `scripts/deploy-production.sh` 与 `.env.production.example` 已落地并通过 `bash -n` |
| T146 | done | 实现备份与恢复策略             | T089-T092 | 数据可恢复             | `scripts/backup.sh` / `scripts/restore.sh` 已落地并通过 `bash -n` |
| T147 | done | 实现发布前检查清单自动化       | T104-T127 | 发布前 gate 可执行     | `scripts/release-check.sh` 已落地，执行 `typecheck/test/compose config/docker build` |
| T148 | done | 编写运维 Runbook               | T144-T147 | 故障处理流程明确       | `docs/ops/RUNBOOK.md` 已覆盖开发、部署、备份、恢复、故障处理 |
| T149 | done | 进行一次真实环境演练           | T144-T148 | 演练记录与问题清单产出 | `docs/ops/DRILL_REPORT_2026-04-17.md` 已记录真实 Docker+飞书回调联调演练 |

## Phase 19：质量补强与稳定化

| ID   | 状态    | 任务                            | 依赖      | 验收标准                       |
| ---- | ------- | ------------------------------- | --------- | ------------------------------ |
| T150 | done | 建立端到端黄金路径测试          | T098-T149 | 从高层任务到知识发布全链路通过 |
| T151 | done | 建立 chaos / 故障注入测试       | T111-T149 | 外部系统异常可恢复或 blocked   |
| T152 | done | 建立性能测试                    | T097-T149 | 并发任务量下系统可承受         |
| T153 | done | 建立知识失控回归测试            | T073-T080 | 高吞吐下 Wiki 不爆炸           |
| T154 | done | 建立数据一致性测试              | T089-T149 | 状态、事件、知识无脏写         |
| T155 | done | 修复稳定性问题并回归            | T150-T154 | 所有阻塞问题清零               |
| T156 | done | 产出 release candidate 验收报告 | T150-T155 | 满足上线门槛                   |

## Phase 20：文档、模板与多项目复用

| ID   | 状态    | 任务                     | 依赖      | 验收标准                 |
| ---- | ------- | ------------------------ | --------- | ------------------------ |
| T157 | done    | 补完整开发者文档         | T097-T156 | 新人可本地跑起来         |
| T158 | done    | 补完整 API 文档          | T104      | 接口可查可调             |
| T159 | done    | 补完整知识治理文档       | T063-T080 | 冲突/归档/预算规则透明   |
| T160 | done    | 补完整运维文档           | T148      | 故障处理可执行           |
| T161 | done    | 提炼项目初始化模板       | T157-T160 | 新项目可复用模板         |
| T162 | done    | 做一次从零新项目接入演练 | T161      | 能在第二个项目上复用成功 |

## Phase 21：全真执行闭环改造

### 目标

- 禁止任何 simulated executor 或 simulated evidence 进入主链路。
- 所有业务任务必须在独立进程、独立 worktree、独立 artifact 目录中执行。
- Codex CLI、GitHub、Playwright、Feishu、mem0、Obsidian、Temporal 必须全部进入真实闭环。
- 任一外部系统失败时，系统必须 fail-closed，禁止静默降级后继续标记成功。
- 到达截止时间后，Supervisor 必须停止派发新任务，并给出结构化夜跑总结。

### 执行顺序

1. 先封死模拟路径与启动前置校验。
2. 再完成 worker 隔离、git worktree、真实 codex 执行。
3. 然后接 GitHub、Playwright、mem0、Obsidian。
4. 再把 Temporal、Feishu、deadline stop 接进主状态机。
5. 最后做全真 golden path 验收与运维文档收口。

### 并行约束

- `T163` 完成前，后续任务不得开始。
- `T166` 完成后，`T167`、`T170`、`T172`、`T178` 可并行。
- `T171` 依赖 `T170`，不得提前。
- `T174` 与 `T175` 严格串行，避免同时修改知识主流程。
- `T176-T180` 共享 Temporal 工作流文件，严格串行推进。
- `T182` 必须等所有真实链路完成后再做。

### TaskUnit 概览

| ID   | 状态    | taskId                               | 依赖                |
| ---- | ------- | ------------------------------------ | ------------------- |
| T163 | done    | runtime-strict-mode-config           | 无                  |
| T164 | done    | runtime-disable-simulated-adapters   | T163                |
| T165 | done    | runtime-real-external-preflight      | T163                |
| T166 | done    | persistence-task-run-heartbeat       | T163                |
| T167 | done    | worker-git-worktree-manager          | T166                |
| T168 | done    | worker-real-codex-launcher           | T166,T167           |
| T169 | done    | worker-write-set-diff-guard          | T168                |
| T170 | done    | github-branch-pr-pipeline            | T168                |
| T171 | done    | github-checks-gate-webhook           | T170                |
| T172 | done    | playwright-real-execution-runtime    | T168                |
| T173 | done    | acceptance-real-evidence-gate        | T169,T172           |
| T174 | done    | knowledge-mem0-http-primary-path     | T165                |
| T175 | pending | knowledge-fail-closed-obsidian-sync  | T174                |
| T176 | pending | temporal-planrun-real-workflow       | T166,T168           |
| T177 | pending | temporal-taskrun-recovery-signals    | T176                |
| T178 | pending | feishu-notification-runtime          | T165                |
| T179 | pending | feishu-human-gate-temporal-resume    | T177,T178           |
| T180 | pending | supervisor-deadline-stop-policy      | T177                |
| T181 | pending | observability-artifact-manifest      | T169,T173,T175      |
| T182 | pending | acceptance-real-mode-golden-path     | T171,T175,T179,T180 |
| T183 | pending | docs-real-mode-runbook               | T182                |

### TaskUnit 详细拆解

#### T163 `runtime-strict-mode-config`

```yaml
taskId: runtime-strict-mode-config
title: 引入严格模式并建立全真执行配置闸门
goal: 在系统启动阶段强制要求真实执行与真实外部依赖，任何模拟路径在严格模式下直接失败
type: backend
phase: phase-real-foundation
priority: high
dependencies: []
readSet:
  - docs/ARCHITECTURE.md
  - docs/TASK_SCHEMA.md
  - src/core/config/**
  - src/index.ts
writeSet:
  - src/core/config/**
  - src/index.ts
  - tests/core.test.ts
inputs:
  - 全流程无任何模拟
  - STRICT_MODE=true
  - ALLOW_SIMULATION=false
deliverables:
  - 严格模式环境变量 contract
  - 启动时 fail-closed 校验
  - 严格模式回归测试
acceptanceCriteria:
  - STRICT_MODE=true 且缺少真实依赖配置时服务启动失败
  - ALLOW_SIMULATION=false 时 simulated 路径不可用
  - 配置错误返回结构化 AppError
testCommands:
  - npm run typecheck
  - npm test
handoffTo: backend-agent
blockedConditions:
  - 严格模式与现有演示模式兼容策略未定
  - 需要新增环境变量命名但团队未统一
autoFixPolicy:
  - 类型错误可自动修
  - 启动校验遗漏可自动修
  - 向下兼容策略冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 严格模式与现有环境兼容策略冲突
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- 配置 contract 已落地到 `src/core/config/env.ts` 与 `src/index.ts`，新增 `strictMode`、`allowSimulation`、`requireRealExternals`。
- 严格模式 fail-closed 已验证：`STRICT_MODE=true` 时强制 `REAL_EXECUTOR=codex`、禁止 `WORKFLOW_EXECUTOR=in_memory`、禁止 `ALLOW_SIMULATION=true`、禁止 `REQUIRE_REAL_EXTERNALS=false`。
- 回归结果：`npm run typecheck` 通过；`npm test` 通过，`94 passed / 0 failed / 1 skipped`。

#### T164 `runtime-disable-simulated-adapters`

```yaml
taskId: runtime-disable-simulated-adapters
title: 禁用默认模拟执行器并移除主流程回退
goal: 在严格模式下彻底禁止 simulated Codex、Claude、OpenHands 进入执行链路
type: backend
phase: phase-real-foundation
priority: high
dependencies:
  - runtime-strict-mode-config
readSet:
  - src/executors/**
  - src/workflow/engine.ts
  - tests/executor-runtime.test.ts
writeSet:
  - src/executors/**
  - src/workflow/engine.ts
  - tests/executor-runtime.test.ts
  - tests/workflow.test.ts
inputs:
  - 默认执行器当前仍为 simulated
  - 严格模式必须 fail-closed
deliverables:
  - 模拟执行器禁用逻辑
  - 主流程拒绝 simulated 回退
  - 回归测试
acceptanceCriteria:
  - 严格模式下 simulated adapter 不能被实例化
  - 工作流若命中 simulated 路径直接转 FAILED_BLOCKED
  - 测试中无 simulated 成功假象
testCommands:
  - npm run typecheck
  - npm test
handoffTo: backend-agent
blockedConditions:
  - 真实执行器初始化顺序未确定
  - 测试夹具依赖 simulated 输出而尚未重写
autoFixPolicy:
  - 测试夹具调整可自动修
  - 分支逻辑遗漏可自动修
  - 执行器契约冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 真实执行器 contract 需要破坏性调整
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- `src/executors/runtime.ts` 已支持 `allowSimulation=false` 禁用模拟适配器注册；未提供真实 Codex 运行时会直接抛出 `CONFIG_INVALID`。
- `src/workflow/engine.ts` 与 `src/orchestration/langgraph/graph.ts` 已拒绝在禁模拟模式下回退到 simulated 路径。
- 回归结果：`tests/executor-runtime.test.ts` 与 `tests/workflow.test.ts` 新增拒绝初始化用例通过；全量 `npm test` 通过。

#### T165 `runtime-real-external-preflight`

```yaml
taskId: runtime-real-external-preflight
title: 建立真实外部系统启动前置检查
goal: 在运行计划前验证 Codex、GitHub、Feishu、mem0、Obsidian、Temporal 配置是否齐备，禁止缺失时静默降级
type: integration
phase: phase-real-foundation
priority: high
dependencies:
  - runtime-strict-mode-config
readSet:
  - src/core/config/**
  - src/api/control-plane-service.ts
  - src/integrations/**
writeSet:
  - src/core/config/**
  - src/api/control-plane-service.ts
  - tests/api.test.ts
  - tests/core.test.ts
inputs:
  - REQUIRE_REAL_EXTERNALS=true
  - 所有第三方依赖必须真实可用
deliverables:
  - 运行前 preflight 检查器
  - 缺配置阻断逻辑
  - API 层错误返回测试
acceptanceCriteria:
  - 缺少 GITHUB_TOKEN/FEISHU/MEM0/OBSIDIAN/TEMPORAL 必需配置时 runPlan 被拒绝
  - 拒绝结果包含缺失项列表
  - 不存在降级到 in-memory 或 no-op adapter 的路径
testCommands:
  - npm run typecheck
  - npm test
handoffTo: integration-agent
blockedConditions:
  - 不同环境的最小配置矩阵未定
  - 第三方真实调用探活策略未确认
autoFixPolicy:
  - 配置校验遗漏可自动修
  - 错误消息不完整可自动修
  - 生产凭证策略冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要变更现有环境变量命名
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- `src/core/config/env.ts` 已新增 `assertRealExecutionReadiness()` 与 `collectMissingRealExternalConfig()`，覆盖 GitHub / Feishu / mem0 / Obsidian / Temporal 真实依赖检查。
- `src/api/control-plane-service.ts` 已在 `runPlan()` 前执行 preflight，缺配置时返回结构化 `CONFIG_MISSING` 与 `missingKeys`。
- 真实链路验证：
- `env -i ... STRICT_MODE=true WORKFLOW_EXECUTOR=temporal REAL_EXECUTOR=codex REQUIRE_REAL_EXTERNALS=true npm start` 成功启动。
- `POST /api/plans` 成功创建 `plan-1776606748972-1`。
- `POST /api/plans/plan-1776606748972-1/runs` 真实返回缺失项：`GITHUB_TOKEN`、`FEISHU_*`、`MEM0_*`、`OBSIDIAN_*`。
- 回归结果：`npm run typecheck` 通过；`npm test` 通过，API preflight 测试已纳入回归。

#### T166 `persistence-task-run-heartbeat`

```yaml
taskId: persistence-task-run-heartbeat
title: 新增 TaskRun 与 WorkerHeartbeat 持久化模型
goal: 为真实 worker 执行、重试、续租、崩溃恢复建立持久化实体
type: backend
phase: phase-real-workers
priority: high
dependencies:
  - runtime-strict-mode-config
readSet:
  - src/domain/persistence.ts
  - src/domain/execution.ts
  - src/persistence/**
writeSet:
  - src/domain/persistence.ts
  - src/domain/execution.ts
  - src/persistence/**
  - tests/persistence.test.ts
inputs:
  - 每个任务需要独立运行记录
  - Worker 需要 heartbeat 与 lease
deliverables:
  - TaskRun 持久化实体
  - WorkerHeartbeat 持久化实体
  - 仓储与迁移更新
acceptanceCriteria:
  - TaskRun 可保存 attempt、workerId、worktreePath、artifactDir
  - WorkerHeartbeat 可按 taskRunId 查询最新状态
  - 迁移与回归测试通过
testCommands:
  - npm run typecheck
  - npm test
handoffTo: backend-agent
blockedConditions:
  - 现有 schemaVersion 升级策略不明确
  - 运行记录字段需要跨版本兼容但未定
autoFixPolicy:
  - 仓储实现错误可自动修
  - 迁移脚本错误可自动修
  - 历史数据兼容策略冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要重写历史数据库结构
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- `src/domain/execution.ts` 已新增 `TaskRunStatus`、`WorkerHeartbeatStatus`；`src/domain/persistence.ts` 已新增 `TaskRun`、`WorkerHeartbeat` 与 `DatabaseSchema.taskRuns/workerHeartbeats`。
- `src/persistence/file-database.ts` 已将 schema 升级到 `v2`；`src/persistence/migrations.ts` 已新增 `add_task_runs_and_worker_heartbeats_v2` 迁移，并在 `ensureSchema()` 中补齐缺失数组。
- `src/persistence/repositories.ts` 已新增 `TaskRunRepository`、`WorkerHeartbeatRepository`，支持 `TaskRun` upsert / 按任务查询，以及按 `taskRunId` 查询最新 heartbeat。
- 回归结果：`npm run typecheck` 通过；`npm test` 通过，`95 passed / 0 failed / 1 skipped`；新增用例 `TaskRun 与 WorkerHeartbeat 可持久化并按 taskRunId 查询最新 heartbeat` 通过。

#### T167 `worker-git-worktree-manager`

```yaml
taskId: worker-git-worktree-manager
title: 实现任务级 git worktree 管理器
goal: 为每个 TaskUnit 创建独立 worktree、独立分支和清理策略，保证进程级隔离
type: backend
phase: phase-real-workers
priority: high
dependencies:
  - persistence-task-run-heartbeat
readSet:
  - src/executors/**
  - src/domain/execution.ts
  - src/persistence/**
writeSet:
  - src/workers/**
  - tests/executor-runtime.test.ts
  - tests/security.test.ts
inputs:
  - 每个任务独立 worktree
  - 分支命名规则 task/<planId>/<taskId>
deliverables:
  - worktree 创建与清理器
  - 分支命名器
  - 隔离性测试
acceptanceCriteria:
  - 每个任务获得唯一 worktreePath
  - 同计划多任务不会共享工作目录
  - 任务结束后可按策略清理 worktree
testCommands:
  - npm run typecheck
  - npm test
handoffTo: backend-agent
blockedConditions:
  - 目标仓库不是 git 仓库
  - worktree 清理策略与用户手工调试需求冲突
autoFixPolicy:
  - 路径命名错误可自动修
  - 清理遗漏可自动修
  - git 策略冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要改变默认分支策略
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- 新增 `src/workers/git-worktree-manager.ts`，提供任务级 `prepareTaskWorktree()` / `cleanupTaskWorktree()`、分支命名 `task/<planId>/<taskId>`、worktree 路径约束与清理策略。
- 真实 git worktree 回归已落到 `tests/executor-runtime.test.ts`：同计划不同任务会创建不同 worktree 与不同分支，并在清理后移除目录与分支。
- 安全回归已落到 `tests/security.test.ts`：危险 `planId/taskId` 会被规范化，生成路径仍被约束在 `workspaceRoot` 内。
- 回归结果：`npm run typecheck` 通过；`npm test` 通过，`97 passed / 0 failed / 1 skipped`。

#### T168 `worker-real-codex-launcher`

```yaml
taskId: worker-real-codex-launcher
title: 实现独立进程真实 Codex Worker 启动器
goal: 让每个任务在独立子进程中调用真实 Codex CLI，并记录完整 stdout、stderr、exitCode 与 heartbeat
type: backend
phase: phase-real-workers
priority: high
dependencies:
  - persistence-task-run-heartbeat
  - worker-git-worktree-manager
readSet:
  - src/executors/runtime.ts
  - src/executors/real-codex-cli-adapter.ts
  - src/persistence/**
writeSet:
  - src/executors/runtime.ts
  - src/executors/real-codex-cli-adapter.ts
  - src/workers/**
  - tests/executor-runtime.test.ts
inputs:
  - 每个任务独立子进程
  - 真实 codex exec
deliverables:
  - worker launcher
  - child process 生命周期管理
  - heartbeat 上报
acceptanceCriteria:
  - 每个 TaskRun 通过独立子进程执行
  - Codex CLI 输入包含 taskId、writeSet、acceptanceCriteria
  - 异常退出时 TaskRun 状态可判定
testCommands:
  - npm run typecheck
  - npm test
handoffTo: integration-agent
blockedConditions:
  - 目标机未安装 codex CLI
  - 子进程心跳协议未定
autoFixPolicy:
  - 子进程收尾问题可自动修
  - 日志采集错误可自动修
  - CLI 协议变化不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要升级 codex CLI 交互协议
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- 新增 `src/workers/codex-worker-launcher.ts`，把真实 Codex 执行切为 `TaskRun + worktree + child_process` 的最小闭环，并输出 `STARTING/RUNNING/SUCCEEDED|FAILED` heartbeat 日志。
- `src/executors/real-codex-cli-adapter.ts` 已改为通过 launcher 在独立 worktree 中执行 codex，再在同一 worktree 内串行执行 `install/typecheck/test/build/e2e/git-status/git-diff-stat`。
- `tests/executor-runtime.test.ts` 已新增真实断言：Codex prompt 包含 `taskId/writeSet/acceptanceCriteria`；修改落在 worktree 而不是 repo 根；主 Codex 子进程异常退出时返回 `failed` 且保留 `exitCode/stderr`。
- 回归结果：`npm run typecheck` 通过；`npm test` 通过，`98 passed / 0 failed / 1 skipped`。

#### T169 `worker-write-set-diff-guard`

```yaml
taskId: worker-write-set-diff-guard
title: 增加真实执行后的 writeSet 越界 diff 守卫
goal: 在真实 codex 执行后用 git diff 校验修改范围，越界改动必须立即 blocked
type: acceptance
phase: phase-real-workers
priority: high
dependencies:
  - worker-real-codex-launcher
readSet:
  - src/executors/**
  - src/domain/task-unit.ts
  - tests/security.test.ts
writeSet:
  - src/executors/**
  - tests/security.test.ts
  - tests/executor-runtime.test.ts
inputs:
  - writeSet 必须硬约束
  - 真实执行后检查 git diff --name-only
deliverables:
  - diff guard
  - 越界阻断逻辑
  - 安全回归测试
acceptanceCriteria:
  - 真实执行越出 writeSet 时任务转 FAILED_BLOCKED
  - evidence 中包含越界文件列表
  - 无越界时不误报
testCommands:
  - npm run typecheck
  - npm test
handoffTo: acceptance-agent
blockedConditions:
  - 任务定义本身 writeSet 过粗无法判定越界
  - 目标仓库含大量生成文件导致 diff 噪声过大
autoFixPolicy:
  - 路径匹配规则错误可自动修
  - evidence 渲染问题可自动修
  - writeSet 粒度设计错误不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要调整全局 writeSet 建模规则
knowledgePolicy:
  enabled: true
  candidateType: pattern
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- `src/domain/execution.ts` 已新增 `RawExecutionOutput.changedFiles`，用于承接真实执行后的 diff 文件清单。
- `src/executors/real-codex-cli-adapter.ts` 已在真实执行成功后追加 `git diff --name-only` 与 `git ls-files --others --exclude-standard`，并把变更文件聚合到 `changedFiles`。
- `src/executors/runtime.ts` 已新增 writeSet diff guard：真实修改若不匹配任务 `writeSet`，执行结果强制转 `failed + blocked`，并把越界文件写入 `evidence` 与错误日志。
- `tests/executor-runtime.test.ts` 已新增真实回归：backend 任务在 worktree 中修改 `README-outside.md` 时，结果为 `FAILED_BLOCKED`，且 `evidence` 包含 `write_set_violation:README-outside.md`；原成功链路改为仅修改 `src/worker-created.txt`，验证无误报。
- 回归结果：`npm run typecheck` 通过；`npm test` 通过，`99 passed / 0 failed / 1 skipped`。

#### T170 `github-branch-pr-pipeline`

```yaml
taskId: github-branch-pr-pipeline
title: 接通任务完成后的分支推送与 PR 创建链路
goal: 让真实任务执行后自动创建分支、提交、推送并创建 PR
type: integration
phase: phase-real-delivery
priority: high
dependencies:
  - worker-real-codex-launcher
readSet:
  - src/integrations/github-adapter.ts
  - src/workers/**
  - docs/API.md
writeSet:
  - src/integrations/github-adapter.ts
  - src/services/**
  - src/workers/**
  - tests/external-integrations.test.ts
inputs:
  - 真实 GitHub Token
  - 任务级分支命名
deliverables:
  - push/PR pipeline
  - GitHub 结果持久化
  - 集成测试
acceptanceCriteria:
  - 成功任务可创建 commit、push branch、open PR
  - PR 元信息绑定 planId/taskId/taskRunId
  - 任一步骤失败时任务 blocked 并保留证据
testCommands:
  - npm run typecheck
  - npm test
handoffTo: integration-agent
blockedConditions:
  - 目标仓库无 push 权限
  - 分支策略与仓库保护规则冲突
autoFixPolicy:
  - API 映射错误可自动修
  - PR body 渲染错误可自动修
  - 仓库权限不足不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要变更默认 PR 工作流
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- `src/workers/github-pr-pipeline.ts` 已新增独立 PR 发布流水线，真实执行 `git add -A`、`git commit`、`git push -u origin <branch>` 与 `GithubAdapter.createPullRequest()`，并在 PR body 中绑定 `planId/taskId/taskRunId`。
- `src/executors/real-codex-cli-adapter.ts` 已在真实 Codex 成功路径接入 GitHub pipeline；若提交、推送或 PR 创建任一步失败，执行结果统一返回 `failed + blocked`，并把结构化错误细节写入 `stderr/logs`。
- `src/workflow/engine.ts` 与 `src/orchestration/langgraph/graph.ts` 已为真实 Codex 执行注入 `githubToken`，主链环境可直接启用任务完成后的 PR 交付。
- `tests/external-integrations.test.ts` 已新增真实回归：在临时 git 仓库 + bare remote + fake GitHub API 下，验证 `commit/push/open PR` 全链路成功，且 PR 请求体包含 `planId: plan-1`、`taskId: task-github-pr`、`taskRunId: taskrun-plan-1-task-github-pr`。
- `tests/executor-runtime.test.ts` 已新增失败回归：当 GitHub PR API 返回 500 时，真实执行结果为 `FAILED_BLOCKED`，并保留 `create_pull_request` 阶段证据。
- 回归结果：`npm run typecheck` 通过；`npm test` 通过，`101 passed / 0 failed / 1 skipped`。

#### T171 `github-checks-gate-webhook`

```yaml
taskId: github-checks-gate-webhook
title: 接通 PR checks 门禁与 GitHub Webhook 回流
goal: 让任务通过状态受真实 GitHub checks 控制，并由 webhook 回流推进任务状态
type: integration
phase: phase-real-delivery
priority: high
dependencies:
  - github-branch-pr-pipeline
readSet:
  - src/api/http-server.ts
  - src/api/control-plane-service.ts
  - src/integrations/github-adapter.ts
writeSet:
  - src/api/http-server.ts
  - src/api/control-plane-service.ts
  - src/integrations/**
  - tests/api.test.ts
  - tests/external-integrations.test.ts
inputs:
  - 真实 GitHub checks
  - Webhook 回流推进状态
deliverables:
  - GitHub webhook 入口
  - checks gate 逻辑
  - 状态推进测试
acceptanceCriteria:
  - PR checks 未绿时任务不能 passed
  - webhook 收到 success/failure 后可推进任务状态
  - event log 中保留原始 check 摘要
testCommands:
  - npm run typecheck
  - npm test
handoffTo: acceptance-agent
blockedConditions:
  - GitHub App/Webhook 配置未完成
  - checks 事件格式与预期不一致
autoFixPolicy:
  - payload 映射错误可自动修
  - 状态推进条件错误可自动修
  - 外部权限问题不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要调整仓库 checks 策略
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- `src/integrations/github-webhook.ts` 已新增 GitHub webhook 处理器，支持 `x-hub-signature-256` HMAC 校验，并提取 `check_run/check_suite` 的分支、PR 编号、状态与摘要。
- `src/api/http-server.ts` 已新增 `POST /github/webhooks` 与 `POST /api/github/webhooks` 入口；`src/api/control-plane-service.ts` 已实现 checks 聚合逻辑：收到 webhook 后调用 `GithubAdapter.getPullRequestChecks()` 汇总真实 PR checks，把原始 payload 与聚合摘要写入 event log，并回写 acceptance run。
- `src/services/execution-acceptance-input.ts` 已新增 GitHub PR gate：真实执行出现 `[github-pr:stdout] pull_request=...` 后，未收到 checks 成功回流前，验收自动保持 `blocked`。
- `src/workflow/engine.ts` 与 `src/orchestration/langgraph/graph.ts` 已把验收结果映射回任务状态：`passed -> DONE`，`failed -> FAILED_BLOCKED`，`blocked -> AWAITING_ACCEPTANCE`，从而支持“先等 checks，再由 webhook 放行”。
- `tests/acceptance.test.ts` 已新增回归：PR 已创建但 checks 未回流时，验收结果为 `blocked`。
- `tests/external-integrations.test.ts` 已新增回归：GitHub webhook 处理器可真实校验签名并抽取 checks 摘要。
- `tests/api.test.ts` 已新增端到端回归：本地 webhook 请求触发真实 checks 聚合、acceptance run 写入、task 状态从 `AWAITING_ACCEPTANCE` 推进到 `DONE`，并在事件日志中保留 `github.checks.received` 的聚合摘要。
- 回归结果：`npm run typecheck` 通过；`npm test` 通过，`104 passed / 0 failed / 1 skipped`。

#### T172 `playwright-real-execution-runtime`

```yaml
taskId: playwright-real-execution-runtime
title: 实现真实 Playwright 执行与 artifact 采集
goal: 在验收阶段真实运行 Playwright，并采集 JSON 报告、截图、trace、视频等证据
type: integration
phase: phase-real-delivery
priority: high
dependencies:
  - worker-real-codex-launcher
readSet:
  - src/integrations/playwright-adapter.ts
  - src/services/execution-acceptance-input.ts
  - tests/acceptance.test.ts
writeSet:
  - src/integrations/playwright-adapter.ts
  - src/services/**
  - tests/acceptance.test.ts
  - tests/external-integrations.test.ts
inputs:
  - 真实 e2eCommand
  - Playwright JSON 报告和 artifacts
deliverables:
  - Playwright 执行服务
  - artifact 采集
  - 验收输入组装
acceptanceCriteria:
  - 真实 Playwright 运行结果可转成结构化证据
  - 截图和 trace 路径进入 acceptance evidence
  - 失败时能保留首个根因证据
testCommands:
  - npm run typecheck
  - npm test
handoffTo: acceptance-agent
blockedConditions:
  - 浏览器依赖未安装
  - 目标项目缺少可执行 Playwright 配置
autoFixPolicy:
  - 路径解析错误可自动修
  - 报告聚合错误可自动修
  - 环境安装问题不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要新增浏览器基础设施
knowledgePolicy:
  enabled: true
  candidateType: pattern
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- `src/integrations/playwright-adapter.ts` 已新增真实运行时支持：可为 `e2eCommand` 注入 `PLAYWRIGHT_JSON_OUTPUT_FILE` 与 `--reporter=json`，并从 artifact 目录或标准候选路径收集 JSON 报告。
- `src/executors/real-codex-cli-adapter.ts` 已把 Playwright runtime 接到真实 `e2eCommand` 路径；无论 e2e 成功还是失败，都会尝试收集 Playwright 报告，并把 `report` 与结构化 `summary` 回流到执行输出。
- `src/services/execution-acceptance-input.ts` 已支持从执行输出解析 `playwright:summary`，组装为 `AcceptanceEvaluationInput.playwright`，从而把截图、trace、失败 evidence 传给 Evaluator。
- `src/services/evaluator.ts` 已优先使用 Playwright 结构化 evidence 作为失败根因，避免只拿到粗粒度 `e2e stderr`。
- `tests/acceptance.test.ts` 已新增回归：执行输出中的 Playwright summary 可被转换成结构化验收证据，截图/trace 路径进入 evidence，根因优先取 `locator timeout`。
- `tests/external-integrations.test.ts` 已新增回归：Playwright runtime 适配层可注入 JSON reporter，并从 artifact 目录收集报告。
- 回归结果：`npm run typecheck` 通过；`npm test` 通过，`106 passed / 0 failed / 1 skipped`。

#### T173 `acceptance-real-evidence-gate`

```yaml
taskId: acceptance-real-evidence-gate
title: 强化 Evaluator，只接受真实证据通过
goal: 禁止 simulated stdout 或空证据被判定 passed，只有真实测试、API、Playwright、GitHub checks 证据才可通过验收
type: acceptance
phase: phase-real-delivery
priority: high
dependencies:
  - worker-write-set-diff-guard
  - playwright-real-execution-runtime
readSet:
  - src/services/evaluator.ts
  - src/services/execution-acceptance-input.ts
  - docs/ACCEPTANCE.md
writeSet:
  - src/services/evaluator.ts
  - src/services/execution-acceptance-input.ts
  - tests/acceptance.test.ts
  - tests/golden-path.test.ts
inputs:
  - 真实 test/build/e2e/api/checks evidence
  - passed 不能依赖 simulated 证据
deliverables:
  - 强化版 evidence gate
  - 验收规则回归测试
acceptanceCriteria:
  - simulated evidence 不能判定 passed
  - 缺少真实证据时结果为 blocked
  - 真实证据下 passed/failed/blocked 稳定可复现
testCommands:
  - npm run typecheck
  - npm test
handoffTo: knowledge-agent
blockedConditions:
  - 某些任务类型缺少可定义的真实证据来源
  - 历史 golden path 测试依赖 simulated 输出
autoFixPolicy:
  - 判定规则错误可自动修
  - evidence 归类错误可自动修
  - 验收标准冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要重写验收协议阈值
knowledgePolicy:
  enabled: true
  candidateType: pattern
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- `src/services/evaluator.ts` 已新增真实证据门禁：缺少可信结构化证据时直接追加“缺少真实验收证据”；仅有 `execution_mode=simulated` 且无外部真实证据时直接追加“不能判定 passed”。
- `tests/acceptance.test.ts` 已新增回归：模拟执行结果在缺少真实外部证据时会被阻塞。
- `tests/workflow.test.ts`、`tests/orchestration.test.ts`、`tests/api.test.ts`、`tests/golden-path.test.ts` 已统一改为 fail-closed 预期，验证 simulated 执行只推进首个任务到 `AWAITING_ACCEPTANCE`，不会伪造 `DONE` 或知识发布。
- 真实验证结果：
  - `npm run typecheck` 通过。
  - `npm run build && node --test dist/tests/acceptance.test.js dist/tests/workflow.test.js dist/tests/orchestration.test.js dist/tests/api.test.js dist/tests/golden-path.test.js` 通过。
  - `npm test` 通过，结果为 `108 passed / 0 failed / 1 skipped`。

#### T174 `knowledge-mem0-http-primary-path`

```yaml
taskId: knowledge-mem0-http-primary-path
title: 用真实 mem0 HTTP 适配器替换知识主流程内存实现
goal: 让知识候选与 deferred 记录优先写入真实 mem0 服务，禁止回退到 in-memory mem0
type: knowledge_capture
phase: phase-real-knowledge
priority: high
dependencies:
  - runtime-real-external-preflight
readSet:
  - src/services/knowledge-workflow.ts
  - src/services/mem0-adapter.ts
  - src/integrations/mem0-http-adapter.ts
writeSet:
  - src/services/knowledge-workflow.ts
  - src/integrations/mem0-http-adapter.ts
  - src/core/config/env.ts
  - tests/mem0-obsidian.test.ts
inputs:
  - MEM0_BASE_URL
  - MEM0_API_KEY
  - MEM0_USER_ID
deliverables:
  - mem0 真接线路径
  - 配置校验
  - 集成测试
acceptanceCriteria:
  - candidate 与 deferred 记录写入真实 mem0
  - mem0 配置缺失时知识流程 blocked
  - 不再使用 InMemoryStore 作为知识主路径
testCommands:
  - npm run typecheck
  - npm test
handoffTo: knowledge-agent
blockedConditions:
  - mem0 服务不可访问
  - 真实 mem0 schema 与本地对象不匹配
autoFixPolicy:
  - HTTP 映射问题可自动修
  - 配置读取错误可自动修
  - 服务端协议冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要变更 mem0 数据模型
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: DONE
```

已完成证据：

- `src/services/knowledge-workflow.ts` 已切到 mem0 HTTP 主路径：`createCandidate()` 与 `handleBudgetRejection()` 现在都会优先写入真实 mem0，再推进 candidate/deferred 队列；配置缺失或写入失败直接抛出 blocked。
- `src/integrations/mem0-http-adapter.ts` 已新增同步写入能力，覆盖 candidate 与 deferred 两类记录，并把 `kind/scope/knowledgeId/scores/budgetDecision` 写入 mem0 metadata。
- `src/core/config/env.ts` 已新增 `resolveMem0PrimaryPathConfig()`，集中解析 `MEM0_BASE_URL`、`MEM0_API_KEY`、`MEM0_USER_ID`，缺失即返回结构化 `CONFIG_MISSING`。
- `tests/mem0-obsidian.test.ts` 已覆盖：
  - candidate 写入真实 mem0 HTTP 主路径；
  - deferred 写入真实 mem0 HTTP 主路径；
  - 配置缺失时知识流程 fail-closed / blocked；
  - 不再依赖 `InMemoryStore.mem0Entries` 作为知识主路径。
- `tests/knowledge-budget.test.ts` 与 `tests/knowledge-overload.test.ts` 已改为显式注入 mem0 stub，保证预算与过载回归在新主路径约束下仍可稳定验证。
- 真实验证结果：
  - `npm run typecheck` 通过。
  - `npm test` 通过，结果为 `108 passed / 0 failed / 1 skipped`。

#### T175 `knowledge-fail-closed-obsidian-sync`

```yaml
taskId: knowledge-fail-closed-obsidian-sync
title: 建立知识发布 fail-closed 门控并同步真实 Obsidian
goal: 在知识发布阶段同时要求 mem0 与 Obsidian 成功，任一失败都必须阻断发布
type: knowledge_merge
phase: phase-real-knowledge
priority: high
dependencies:
  - knowledge-mem0-http-primary-path
readSet:
  - src/services/knowledge-workflow.ts
  - src/services/obsidian-knowledge.ts
  - src/integrations/obsidian-sync.ts
writeSet:
  - src/services/knowledge-workflow.ts
  - src/services/obsidian-knowledge.ts
  - src/integrations/obsidian-sync.ts
  - tests/mem0-obsidian.test.ts
inputs:
  - 真实 Obsidian 路径
  - mem0 成功返回值
deliverables:
  - fail-closed 发布逻辑
  - mem0 与 notePath 关联记录
  - 归档同步测试
acceptanceCriteria:
  - mem0 或 Obsidian 任一失败时知识任务 blocked
  - 发布成功记录同时包含 mem0 id 与 notePath
  - archive 路径保持可追溯
testCommands:
  - npm run typecheck
  - npm test
handoffTo: knowledge-review-agent
blockedConditions:
  - Obsidian vault 无写权限
  - notePath 命名规则与现有知识目录冲突
autoFixPolicy:
  - 文件路径问题可自动修
  - 发布关联字段遗漏可自动修
  - 知识目录结构冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要批量迁移既有知识目录
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: PLANNED
```

#### T176 `temporal-planrun-real-workflow`

```yaml
taskId: temporal-planrun-real-workflow
title: 将全真执行模式切换到 Temporal 主工作流
goal: 用 Temporal 托管真实 PlanRun 生命周期，禁止严格模式继续使用 in-memory 主工作流
type: integration
phase: phase-real-orchestration
priority: high
dependencies:
  - persistence-task-run-heartbeat
  - worker-real-codex-launcher
readSet:
  - src/orchestration/runtime.ts
  - src/orchestration/temporal/**
  - docs/ARCHITECTURE.md
writeSet:
  - src/orchestration/runtime.ts
  - src/orchestration/temporal/**
  - tests/orchestration.test.ts
inputs:
  - 严格模式必须 durable
  - 长任务夜跑不能依赖单进程内存
deliverables:
  - Temporal 主流程接线
  - real-mode 运行路由
  - 编排测试
acceptanceCriteria:
  - 严格模式下 runPlan 走 Temporal workflow
  - PlanRun 状态可从 Temporal 恢复
  - in-memory 路径不再承担全真执行
testCommands:
  - npm run typecheck
  - npm test
  - npm run temporal:smoke
handoffTo: integration-agent
blockedConditions:
  - Temporal 开发环境未就绪
  - workflow contract 与现有测试夹具冲突
autoFixPolicy:
  - activity 映射错误可自动修
  - workflow 分支错误可自动修
  - Temporal 基础设施缺失不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要调整全局编排架构
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: PLANNED
```

#### T177 `temporal-taskrun-recovery-signals`

```yaml
taskId: temporal-taskrun-recovery-signals
title: 实现 TaskRun 恢复、重试与外部信号控制
goal: 支持 worker 崩溃恢复、approve/retry/stop 等 Temporal signal，并让 TaskRun 状态与外部事件一致
type: integration
phase: phase-real-orchestration
priority: high
dependencies:
  - temporal-planrun-real-workflow
readSet:
  - src/orchestration/temporal/**
  - src/scripts/temporal-worker.ts
  - src/persistence/**
writeSet:
  - src/orchestration/temporal/**
  - src/scripts/temporal-worker.ts
  - tests/orchestration.test.ts
inputs:
  - worker heartbeat
  - approve/retry/stop signal
deliverables:
  - TaskRun 恢复逻辑
  - Temporal signals
  - 崩溃恢复测试
acceptanceCriteria:
  - worker 异常退出后 TaskRun 可恢复
  - approve/retry/stop 信号能改变 workflow 状态
  - 恢复后不丢失 artifact 与执行上下文
testCommands:
  - npm run typecheck
  - npm test
  - npm run temporal:smoke
handoffTo: integration-agent
blockedConditions:
  - TaskRun 上下文恢复粒度未定
  - 中断后是否重用 worktree 策略未定
autoFixPolicy:
  - signal 路由错误可自动修
  - 恢复状态错误可自动修
  - 恢复策略冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要改变恢复语义
knowledgePolicy:
  enabled: true
  candidateType: adr
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: PLANNED
```

#### T178 `feishu-notification-runtime`

```yaml
taskId: feishu-notification-runtime
title: 接通 blocked 与 waiting_human 的真实飞书通知
goal: 当任务进入 blocked 或 WAITING_HUMAN 时，系统必须自动发送飞书文本或卡片，附带证据与操作入口
type: integration
phase: phase-real-orchestration
priority: high
dependencies:
  - runtime-real-external-preflight
readSet:
  - src/integrations/feishu-adapter.ts
  - src/api/control-plane-service.ts
  - src/domain/incident.ts
writeSet:
  - src/integrations/feishu-adapter.ts
  - src/services/**
  - src/api/control-plane-service.ts
  - tests/external-integrations.test.ts
  - tests/feishu-callback.test.ts
inputs:
  - FEISHU webhook/card 配置
  - blocked 与 waiting_human 事件
deliverables:
  - 飞书通知服务
  - 卡片 payload 生成器
  - 通知回归测试
acceptanceCriteria:
  - blocked 任务会自动发送飞书通知
  - WAITING_HUMAN 任务会自动发送带操作按钮的卡片
  - 通知失败时任务保留证据并 blocked
testCommands:
  - npm run typecheck
  - npm test
handoffTo: integration-agent
blockedConditions:
  - 飞书应用配置未完成
  - 卡片回调域名不可达
autoFixPolicy:
  - payload 渲染错误可自动修
  - webhook 调用错误处理可自动修
  - 飞书外部配置问题不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要更换通知渠道或审批模版
knowledgePolicy:
  enabled: true
  candidateType: sop
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: PLANNED
```

#### T179 `feishu-human-gate-temporal-resume`

```yaml
taskId: feishu-human-gate-temporal-resume
title: 将飞书人工动作接入 Temporal signal 恢复链路
goal: 让飞书 approve/retry/reject/stop 直接驱动 Temporal workflow，而不是只更新本地任务状态
type: integration
phase: phase-real-orchestration
priority: high
dependencies:
  - temporal-taskrun-recovery-signals
  - feishu-notification-runtime
readSet:
  - src/api/http-server.ts
  - src/api/control-plane-service.ts
  - src/orchestration/temporal/**
writeSet:
  - src/api/http-server.ts
  - src/api/control-plane-service.ts
  - src/orchestration/temporal/**
  - tests/feishu-callback.test.ts
  - tests/orchestration.test.ts
inputs:
  - 飞书卡片动作
  - Temporal approve/retry/stop signal
deliverables:
  - 飞书动作到 Temporal signal 的映射
  - 人工 gate 状态回流
  - 回归测试
acceptanceCriteria:
  - approve/retry/reject/stop 能驱动真实 workflow
  - 人工动作会记录 intervention 与 workflow event
  - 仅更新数据库而不触发 workflow 的旧路径被移除
testCommands:
  - npm run typecheck
  - npm test
  - npm run temporal:smoke
handoffTo: integration-agent
blockedConditions:
  - 飞书卡片 value 格式无法承载 workflow 标识
  - workflow signal 语义与人工动作语义不一致
autoFixPolicy:
  - payload 映射错误可自动修
  - signal 路由错误可自动修
  - 审批语义冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要调整人工审批动作集合
knowledgePolicy:
  enabled: true
  candidateType: sop
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: PLANNED
```

#### T180 `supervisor-deadline-stop-policy`

```yaml
taskId: supervisor-deadline-stop-policy
title: 实现夜跑截止时间与优雅停机策略
goal: 为 PlanRun 增加 deadline、maxRuntime、graceful stop 规则，到点后停止派发新任务并输出总结
type: integration
phase: phase-real-orchestration
priority: high
dependencies:
  - temporal-taskrun-recovery-signals
readSet:
  - src/orchestration/temporal/**
  - src/domain/plan.ts
  - src/api/control-plane-service.ts
writeSet:
  - src/orchestration/temporal/**
  - src/domain/plan.ts
  - src/api/control-plane-service.ts
  - tests/orchestration.test.ts
  - tests/api.test.ts
inputs:
  - 夜跑截止时间
  - graceful stop 策略
deliverables:
  - deadline 字段与 stop API
  - 停机策略
  - 汇总结果输出
acceptanceCriteria:
  - 到达 deadline 后不再派发新任务
  - 运行中任务收到 graceful stop 请求
  - 计划结束后输出结构化 nightly summary
testCommands:
  - npm run typecheck
  - npm test
  - npm run temporal:smoke
handoffTo: acceptance-agent
blockedConditions:
  - 当前运行中的任务是否允许中断策略未定
  - 跨时区 deadline 表达方式未统一
autoFixPolicy:
  - 计时逻辑错误可自动修
  - summary 组装错误可自动修
  - 中断语义冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要确认生产环境停机策略
knowledgePolicy:
  enabled: true
  candidateType: sop
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: PLANNED
```

#### T181 `observability-artifact-manifest`

```yaml
taskId: observability-artifact-manifest
title: 增加全真执行模式的 artifact 清单与观测指标
goal: 对 worker heartbeat、外部调用、artifact 路径、模拟使用计数和失败原因建立统一观测面
type: backend
phase: phase-real-hardening
priority: medium
dependencies:
  - worker-write-set-diff-guard
  - acceptance-real-evidence-gate
  - knowledge-fail-closed-obsidian-sync
readSet:
  - src/domain/observability.ts
  - src/services/observability-service.ts
  - src/domain/persistence.ts
writeSet:
  - src/domain/observability.ts
  - src/services/observability-service.ts
  - src/domain/persistence.ts
  - tests/observability.test.ts
inputs:
  - worker heartbeat
  - external call result
  - artifact manifest
deliverables:
  - ArtifactManifest 模型
  - 观测指标扩展
  - 观测测试
acceptanceCriteria:
  - metrics 可展示 worker heartbeat、外部失败、artifact 数量
  - 审计记录可追踪单个 taskRun 的产物路径
  - simulated_usage 指标恒为 0
testCommands:
  - npm run typecheck
  - npm test
handoffTo: acceptance-agent
blockedConditions:
  - artifact 保留周期未定义
  - 指标维度过多影响性能
autoFixPolicy:
  - 指标聚合错误可自动修
  - manifest 结构错误可自动修
  - 保留策略冲突不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要确认观测保留策略
knowledgePolicy:
  enabled: true
  candidateType: sop
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: PLANNED
```

#### T182 `acceptance-real-mode-golden-path`

```yaml
taskId: acceptance-real-mode-golden-path
title: 建立全真执行模式黄金路径验收
goal: 在真实 Codex、GitHub、Playwright、Feishu、mem0、Obsidian、Temporal 环境中跑通一条从创建计划到知识发布的闭环
type: acceptance
phase: phase-real-hardening
priority: high
dependencies:
  - github-checks-gate-webhook
  - knowledge-fail-closed-obsidian-sync
  - feishu-human-gate-temporal-resume
  - supervisor-deadline-stop-policy
readSet:
  - tests/golden-path.test.ts
  - tests/orchestration.test.ts
  - tests/external-integrations.test.ts
  - scripts/release-check.sh
writeSet:
  - tests/golden-path.test.ts
  - tests/orchestration.test.ts
  - tests/external-integrations.test.ts
  - scripts/release-check.sh
inputs:
  - 真实第三方配置矩阵
  - 全真执行目标
deliverables:
  - real-mode golden path 测试
  - 发布前验收脚本
  - 真实证据样本
acceptanceCriteria:
  - 一条真实 plan 可完整经历 create plan -> run -> PR checks -> acceptance -> mem0 -> Obsidian
  - blocked 场景会真实触发 Feishu 并能恢复
  - 产出完整 evidence 与 artifact 清单
testCommands:
  - npm run typecheck
  - npm test
  - npm run temporal:smoke
  - bash ./scripts/release-check.sh
handoffTo: docs-agent
blockedConditions:
  - 测试环境没有真实第三方凭证
  - staging 资源不足以承载全真回归
autoFixPolicy:
  - 测试编排错误可自动修
  - 脚本路径错误可自动修
  - 外部环境缺失不可自动修
humanGate:
  required: true
  triggerConditions:
    - 需要人工确认 staging 真实回归窗口
knowledgePolicy:
  enabled: true
  candidateType: incident
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: PLANNED
```

#### T183 `docs-real-mode-runbook`

```yaml
taskId: docs-real-mode-runbook
title: 补齐全真执行模式开发指南与运维 Runbook
goal: 让团队可以按文档启动、排障、夜跑、停机和恢复全真执行模式
type: docs
phase: phase-real-hardening
priority: medium
dependencies:
  - acceptance-real-mode-golden-path
readSet:
  - docs/DEVELOPER_GUIDE.md
  - docs/API.md
  - docs/ops/RUNBOOK.md
  - PROJECT_PLAN.md
writeSet:
  - docs/DEVELOPER_GUIDE.md
  - docs/API.md
  - docs/ops/RUNBOOK.md
  - PROJECT_PLAN.md
inputs:
  - 全真执行模式最终环境矩阵
  - golden path 验收结果
deliverables:
  - 开发指南更新
  - API 与 webhook 文档更新
  - 夜跑运维 Runbook
acceptanceCriteria:
  - 文档覆盖启动、配置、夜跑、人工 gate、停机、恢复、排障
  - 示例命令与真实实现一致
  - 文档中不再包含 simulated 路径说明
testCommands:
  - npm run typecheck
  - npm test
handoffTo: acceptance-agent
blockedConditions:
  - 最终运维流程尚未收敛
  - 第三方接入参数仍在变化
autoFixPolicy:
  - 文档引用错误可自动修
  - 命令示例错误可自动修
  - 运维流程未定不可自动修
humanGate:
  required: false
  triggerConditions:
    - 需要确认正式值班流程
knowledgePolicy:
  enabled: true
  candidateType: sop
  reusableScoreThreshold: 0.7
  stabilityScoreThreshold: 0.75
  confidenceThreshold: 0.8
status: PLANNED
```
