# Knowledge Model

## 目标

Knowledge Model 用于定义 AgentForge 的长期知识对象、身份模型、冲突规则、生命周期和 Obsidian 落盘映射。它的目标不是把所有过程都写成笔记，而是让系统只沉淀“经过验证、可复用、可比较、可追溯”的稳定知识。

## 基本原则

- 长期知识的最小粒度是“可复用规则单元”
- 不允许用整篇文档或单句作为主身份单元
- 所有长期知识都必须有统一 `knowledge_id`
- 所有长期知识都必须能被版本化和追溯
- 长期知识写入必须经过验收、评分、冲突检查和预算门控

## KnowledgeRecord

推荐结构：

```json
{
  "knowledge_id": "auth.jwt.expiry.strategy",
  "version": 3,
  "scope": "backend/auth",
  "status": "active",
  "title": "JWT 过期时间策略",
  "summary": "Web 后端默认采用 access token 15 分钟、refresh token 7 天",
  "recommendation": "access token 15min + refresh token 7d",
  "constraints": [
    "需要 refresh token 机制",
    "需要统一 token 刷新接口"
  ],
  "confidence": 0.92,
  "candidate_type": "pattern",
  "source_refs": [
    "task:backend-auth-jwt-policy",
    "acceptance:acc-20260416-001"
  ],
  "derived_from": [
    "incident:auth-token-expired-retry"
  ],
  "supersedes": [
    "auth.jwt.expiry.strategy@2"
  ],
  "updated_at": "2026-04-16T10:00:00+08:00"
}
```

## 字段说明

- `knowledge_id`
  一个稳定、可引用、可替换的知识身份，例如 `auth.jwt.expiry.strategy`
- `version`
  同一 `knowledge_id` 的版本号，单调递增
- `scope`
  知识适用范围，例如 `backend/auth`、`frontend/profile`
- `status`
  生命周期状态，见下文
- `title`
  便于阅读和索引的人类可读标题
- `summary`
  对知识核心结论的简述
- `recommendation`
  实际推荐规则或策略
- `constraints`
  适用约束和边界条件
- `confidence`
  当前知识的确信度
- `candidate_type`
  类型，例如 `pattern`、`incident`、`sop`、`adr`
- `source_refs`
  来源证据，必须能追溯回任务、验收、日志或人工决策
- `derived_from`
  来源链，用于说明本知识由哪些经验抽象而来
- `supersedes`
  声明替代关系，用于将旧知识降级为 `deprecated`
- `updated_at`
  最后更新时间

## 知识身份规则

### 正确粒度

知识对象必须建模在“可复用规则单元”级别，例如：

- `auth.jwt.expiry.strategy`
- `frontend.profile.real-api-binding`
- `incident.retry.build-cache-cleanup`
- `workflow.blocked.escalation.rule`

### 错误粒度

以下粒度禁止作为长期知识主身份：

- 整篇文档，例如 `auth.md`
- 单句断言，例如“JWT 过期时间是 1 小时”
- 原始对话摘要

## KnowledgeCandidate

`KnowledgeCandidate` 用于描述尚未进入长期主库的候选知识。推荐结构：

```json
{
  "candidate_id": "kc-20260416-001",
  "knowledge_id": "auth.jwt.expiry.strategy",
  "scope": "backend/auth",
  "candidate_type": "pattern",
  "summary": "JWT 过期策略在后端认证任务中被验证通过",
  "recommendation": "access token 15min + refresh token 7d",
  "source_refs": [
    "task:backend-auth-jwt-policy",
    "acceptance:acc-20260416-001"
  ],
  "knowledge_signal": {
    "reusable_score": 0.82,
    "novelty_score": 0.61,
    "confidence": 0.91,
    "stability_score": 0.88,
    "impact_score": 0.76,
    "recommended_action": "capture"
  }
}
```

## 冲突检测规则

冲突检测分为三类：

### 1. 重复

满足以下条件之一时，可视为重复或近重复：

- 同一 `knowledge_id`，`recommendation` 等价
- 不同候选文本不同，但推荐规则、约束和来源高度一致

处理方式：

- 优先合并来源证据
- 不新增长期知识版本
- 低价值重复候选直接 `archived`

### 2. 版本演进

满足以下条件时，可视为新版本而非冲突：

- 同一 `knowledge_id`
- 新规则明确声明 `supersedes`
- 新旧差异可解释且方向一致

处理方式：

- 创建新版本
- 将旧版本标记为 `deprecated`

### 3. 冲突

满足以下条件之一时，进入 `conflicted`：

- 同一 `knowledge_id` 但核心 recommendation 互斥
- 不同 `knowledge_id` 但同一 `scope` 下规则语义互斥
- 新知识将覆盖高复用 `active` 规则且缺少明确替代证据

处理方式：

- 创建 `knowledge_review` 任务
- 高价值冲突进入 `WAITING_HUMAN`

## 生命周期

知识生命周期状态：

- `candidate`
  已提取但尚未进入长期主库
- `active`
  当前有效，可直接复用
- `deprecated`
  被更优知识替代，但保留追溯价值
- `archived`
  低质量、低使用、重复或过时，退出主检索面
- `conflicted`
  存在冲突，等待 review 或人工决策

默认迁移规则：

- `candidate -> active`
  满足阈值、通过冲突检查、通过预算放行
- `active -> deprecated`
  被新版本替代
- `active/deprecated -> archived`
  满足归档条件
- 任意状态 -> `conflicted`
  命中冲突规则

## 归档与淘汰

以下情况可自动归档：

- 长期未被引用且评分低
- 与高置信度 active 知识重复
- 来源证据弱且长期未补充

以下情况必须人工 gate：

- 批量 deprecated 或 archive 多条高引用知识
- 跨多个文档的稳定规则发生矛盾
- 同一 `knowledge_id` 出现高置信度互斥推荐

## 触发时机

长期知识候选只允许在“认知稳定点”创建：

- 任务 `DONE` 且验收 `passed`
- retry 成功并形成稳定修复路径
- blocked 解除并形成复用经验
- 已验证的新策略明确优于旧策略

禁止触发：

- 每轮对话自动总结即落库
- 未验证结果落库
- 原始执行日志直接落长期主库

## Obsidian 映射

Obsidian 是长期知识主库，默认映射如下：

- `pattern`
  写入经验页或稳定规则页
- `incident`
  写入问题复盘页
- `sop`
  写入流程页
- `adr`
  写入决策页

长期知识对象至少应映射出以下结构：

- 标题
- 知识身份与版本
- 适用范围
- 推荐规则
- 约束条件
- 来源证据
- 替代关系
- 状态

## mem0 与 Obsidian 的边界

- `mem0`
  保存短中期上下文、候选知识、延迟发布项、检索缓存
- `Obsidian`
  只保存通过门控的长期知识、任务页、ADR、SOP 和经验页

默认原则：

- 原始对话不写 Obsidian
- 未通过预算门控的 candidate 不写 Obsidian
- `conflicted` 状态不直接改写 Obsidian 主内容
