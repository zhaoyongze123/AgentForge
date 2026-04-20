# Task Schema

## 目标

TaskUnit 是 AgentForge 最关键的 contract。任何执行器、验收器、调度器都不应该直接消费模糊自然语言，而应该消费结构化任务单元。

## TaskUnit 字段

- `task_id`
  任务唯一标识。
- `title`
  任务标题，要求可读、可定位。
- `goal`
  任务目标，说明这次闭环要达成什么。
- `type`
  任务类型，例如 `backend`、`frontend`、`integration`、`acceptance`、`docs`、`knowledge_capture`、`knowledge_merge`、`knowledge_review`、`knowledge_cleanup`。
- `phase`
  任务所属阶段。
- `priority`
  优先级。
- `dependencies`
  依赖的其他 TaskUnit 列表。
- `read_set`
  允许读取的范围。
- `write_set`
  允许修改的范围。
- `inputs`
  执行该任务所需的输入，例如需求摘要、接口契约、前置任务结果。
- `deliverables`
  预期交付物。
- `acceptance_criteria`
  验收标准，必须是可检查的。
- `test_commands`
  本任务完成后必须执行的验证命令。
- `handoff_to`
  成功后交给哪个角色或下一类 agent。
- `blocked_conditions`
  哪些情况必须 blocked。
- `auto_fix_policy`
  哪些失败允许自动修复，哪些不允许。
- `human_gate`
  是否需要人工 gate，以及触发条件。
- `knowledge_policy`
  本任务与知识闭环的关系，例如是否允许生成知识候选、最低评分门槛、候选类型。

## 什么叫最小闭环

一个 TaskUnit 必须满足：

- 目标单一
- 修改范围有限
- 验收标准明确
- 执行后能明确得到 `done / failed / blocked`

如果一个任务同时要求：

- 改后端接口
- 改前端页面
- 跑浏览器联调

那么它通常不是最小闭环，应拆成多个 TaskUnit。

## 什么叫原子任务

原子任务是指：

- 交给一个 agent 可以独立完成
- 不需要中途再做新的产品或架构决策
- 不需要越过既定 `write_set`

## 什么情况必须拆小

- 目标覆盖多个模块
- 涉及前后端同时开发
- 需要多人或多 agent 并行
- 验收标准无法在一次执行中判断
- 失败后根因会混在一起，难以归因

## 什么情况禁止并行

- 两个任务共享同一个 `write_set`
- 两个任务对同一个状态机节点有互斥影响
- 后置任务依赖前置任务的真实输出
- 验收任务依赖实现任务先完成
- 多个知识任务会同时修改同一个 `knowledge_id`

## 知识相关任务原则

知识任务必须独立建模，不能和业务实现任务揉在一起。

- `knowledge_capture`
  从稳定点事件中抽取候选知识。
- `knowledge_merge`
  对已有知识做版本演进、去重、替换或废弃。
- `knowledge_review`
  用于处理冲突、高价值覆盖或需要人工审查的知识对象。
- `knowledge_cleanup`
  对低质量、低使用、重复知识做降级或归档。

知识任务额外约束：

- 必须声明目标 `knowledge_id` 或候选身份信息
- 必须声明 `source_refs`
- 不得在没有证据和验收来源的情况下直接发布长期知识
- 不得绕过预算与冲突检查直接写入 Obsidian

## knowledge_policy 约定

建议结构：

```yaml
knowledge_policy:
  enabled: true
  candidate_type: pattern|incident|sop|adr
  reusable_score_threshold: 0.70
  stability_score_threshold: 0.75
  confidence_threshold: 0.80
```

约束：

- `enabled: false` 表示该任务结果不进入知识闭环
- 阈值未显式声明时，使用系统默认阈值
- `novelty_score` 只参与排序，不单独决定是否发布

## 示例 1：后端接口任务

```yaml
task_id: backend-resource-create
title: 补齐资源创建接口的请求校验与回归测试
goal: 让资源创建接口在缺失标题与非法分类时返回稳定错误，并补齐集成测试
type: backend
phase: phase-3
priority: high
dependencies: []
read_set:
  - backend/src/main/java/com/example/resource/**
  - docs/openapi.yaml
write_set:
  - backend/src/main/java/com/example/resource/**
  - backend/src/test/java/com/example/resource/**
inputs:
  - 资源创建接口契约
  - 当前失败用例
deliverables:
  - 接口校验逻辑
  - 集成测试
acceptance_criteria:
  - 缺失标题返回预期错误码
  - 非法分类返回预期错误码
  - 定向测试命令通过
test_commands:
  - ./gradlew test --tests ResourceControllerTest
handoff_to: acceptance-agent
blocked_conditions:
  - 需要新增字段但产品未定义
  - 需要修改不在 write_set 的公共鉴权模块
auto_fix_policy:
  - 编译错误可自动修
  - 需求歧义不可自动修
human_gate:
  required: false
knowledge_policy:
  enabled: true
  candidate_type: pattern
  reusable_score_threshold: 0.70
  stability_score_threshold: 0.75
  confidence_threshold: 0.80
```

## 示例 2：前端真接口对接任务

```yaml
task_id: frontend-profile-dashboard
title: 个人中心页面切换到真实聚合接口
goal: 让个人中心展示来自真实 /api/me 的数据，而不是本地模拟状态
type: frontend
phase: phase-3
priority: high
dependencies:
  - backend-me-dashboard
read_set:
  - frontend/src/views/user/ProfileView.vue
  - frontend/src/api/me.ts
  - docs/openapi.yaml
write_set:
  - frontend/src/views/user/ProfileView.vue
  - frontend/src/api/me.ts
inputs:
  - /api/me 接口契约
  - 当前页面展示逻辑
deliverables:
  - 页面真实数据绑定
  - 文案中的模拟描述移除
acceptance_criteria:
  - 页面加载后展示真实接口数据
  - 页面不再保留模拟保存提示
  - 前端构建或对应 E2E 命令通过
test_commands:
  - npm run build
  - npx playwright test tests/e2e/profile.spec.ts
handoff_to: acceptance-agent
blocked_conditions:
  - 后端缺少必要字段
  - 真实接口返回结构与契约不一致
auto_fix_policy:
  - 类型错误和字段映射错误可自动修
  - 产品语义缺失不可自动修
human_gate:
  required: false
knowledge_policy:
  enabled: true
  candidate_type: pattern
  reusable_score_threshold: 0.70
  stability_score_threshold: 0.75
  confidence_threshold: 0.80
```

## 示例 3：知识捕获任务

```yaml
task_id: knowledge-capture-auth-jwt-expiry
title: 抽取 JWT 过期策略的稳定经验并写入候选知识
goal: 基于已验收通过的后端认证任务，产出可复用的 JWT 过期策略候选知识
type: knowledge_capture
phase: phase-3
priority: medium
dependencies:
  - backend-auth-jwt-policy
read_set:
  - docs/ACCEPTANCE.md
  - docs/KNOWLEDGE_MODEL.md
  - runtime/acceptance/backend-auth-jwt-policy.json
write_set:
  - obsidian/knowledge/auth/**
inputs:
  - acceptance_passed 事件
  - 源任务结果
  - 证据与日志
deliverables:
  - KnowledgeCandidate
  - Obsidian 候选草稿或队列记录
acceptance_criteria:
  - 产出唯一 knowledge_id
  - 含 source_refs、confidence、candidate_type
  - 未绕过预算与冲突门控
test_commands:
  - npm run validate:knowledge-contracts
handoff_to: knowledge-review-agent
blocked_conditions:
  - 无法确定 knowledge_id
  - 证据不足以支撑长期知识
  - 命中高价值冲突
auto_fix_policy:
  - 字段缺失可自动补齐
  - 身份冲突不可自动决策
human_gate:
  required: false
knowledge_policy:
  enabled: true
  candidate_type: pattern
  reusable_score_threshold: 0.70
  stability_score_threshold: 0.75
  confidence_threshold: 0.80
```
