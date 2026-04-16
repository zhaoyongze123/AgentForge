# Knowledge Budget

## 目标

Knowledge Budget 用于限制长期知识写入速率、控制知识任务队列规模，并通过价值排序避免 Obsidian 在高吞吐任务场景下快速退化成垃圾堆。

## 核心原则

- 触发知识候选不等于允许写入长期主库
- 写入长期知识前必须经过预算门
- 预算策略默认采用“限流 + Top-K”
- 低价值候选优先延迟、归档或保留在 `mem0`
- 系统必须支持淘汰，不允许知识无限制只增不减

## 默认预算策略

推荐默认配置：

```json
{
  "max_wiki_writes_per_hour": 10,
  "max_knowledge_tasks_in_queue": 20,
  "top_k_per_window": 5,
  "priority_queue": true
}
```

字段说明：

- `max_wiki_writes_per_hour`
  每小时允许进入长期主库的最大写入次数
- `max_knowledge_tasks_in_queue`
  知识任务最大排队数量
- `top_k_per_window`
  每个预算窗口中最多放行多少条最高价值候选
- `priority_queue`
  是否按价值排序处理候选

## 预算窗口

系统应至少同时维护两层预算窗口：

- 全局窗口
  限制整个系统单位时间内的写入量
- scope 窗口
  限制单个 `scope` 在单位时间内的写入量，避免单模块知识刷屏

示例：

- 全局：每小时最多 10 条
- `backend/auth`：每小时最多 3 条

## 放行顺序

长期知识发布必须严格按以下顺序执行：

1. 验收通过
2. 评分达标
3. 去重与冲突检查
4. 预算门控
5. Top-K 排序
6. 发布或延迟

任何一步失败，都不能直接写入 Obsidian。

## 排序规则

默认发布分值：

```text
publish_score = 0.45 * reusable_score
              + 0.25 * novelty_score
              + 0.20 * confidence
              + 0.10 * impact_score
```

说明：

- `reusable_score`
  权重最高，因为首要目标是保留高复用知识
- `novelty_score`
  用于避免系统重复写入旧知识
- `confidence`
  用于压制低可靠候选
- `impact_score`
  用于让高价值问题修复和关键策略优先入库

首版不做复杂学习排序，固定加权即可。

## 默认阈值

默认最小发布阈值：

- `reusable_score >= 0.70`
- `stability_score >= 0.75`
- `confidence >= 0.80`

说明：

- `novelty_score` 只影响排序，不作为单独发布门槛
- `stability_score` 由验收或知识评分阶段给出，用于过滤过程性信息

## 候选结果去向

### 发布

满足以下条件：

- 验收通过
- 阈值达标
- 冲突检查通过
- 位于当前窗口 Top-K
- 预算未超限

结果：

- 写入 Obsidian
- 创建或更新 `KnowledgeRecord`

### 延迟

满足以下条件：

- 候选有效但预算窗口已满
- 候选分值低于当前 Top-K，但高于归档阈值

结果：

- 保存在 `mem0` 或候选池
- 标记为 `knowledge_budget_deferred`

### 归档

满足以下条件：

- 低质量
- 低信心
- 重复
- 长期未入选且无新增证据

结果：

- 状态改为 `archived`
- 不进入 Obsidian 主内容

## 队列策略

知识任务队列默认使用优先队列。

优先级来源：

- `publish_score`
- 是否来源于 retry 成功或 blocked 解除
- 是否会替换现有高价值知识

当队列达到 `max_knowledge_tasks_in_queue` 时：

- 低分候选直接归档或覆盖旧的低分延迟项
- 不因队列拥塞自动触发人工 gate

## 人工介入规则

预算系统不应该把低价值候选一股脑推给人工。只有以下情况需要人工：

- 高分冲突候选同时进入同一 `knowledge_id`
- 高价值 active 知识将被覆盖
- 批量清理将影响多条高引用知识

以下情况不需要人工：

- 预算超限导致的普通延迟
- 低分候选被丢弃
- 近重复候选被归档

## 淘汰策略

系统必须定期执行 `knowledge_cleanup`，用于：

- 将低引用、低质量知识降级为 `archived`
- 将被替代知识标记为 `deprecated`
- 清理预算延迟队列中的过期候选

推荐默认清理条件：

- 30 天内未被引用且 `publish_score` 低
- 已被高置信度 active 规则替代
- 候选延迟超过预算窗口阈值仍未入选

## 可观测性要求

至少应记录以下指标：

- 每小时候选数
- 每小时实际发布数
- 延迟数
- 归档数
- 冲突数
- 人工 gate 数
- 每个 scope 的写入分布

如果没有这些指标，知识系统会在没有明显报警的情况下退化。
