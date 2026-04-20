# Knowledge Governance

## 目标

这份文档不重复定义数据结构，而是定义“知识系统如何不失控地运转”。

配套阅读：

- `docs/KNOWLEDGE_MODEL.md`
- `docs/KNOWLEDGE_BUDGET.md`
- `docs/ACCEPTANCE.md`

## 治理主线

知识闭环只有在以下链路中才允许成立：

`acceptance passed -> candidate -> scoring -> dedupe/conflict -> budget gate -> publish/review/archive`

任何绕过这条链路的 Obsidian 写入，都视为违规。

## 1. 知识身份

长期知识必须以“可复用规则单元”建模。

必须满足：

- 能被单独引用
- 能被新版本替代
- 能和其他知识做冲突判断

推荐粒度：

- 策略
- 流程
- 约束
- 已验证模式
- 事故复盘规则

禁止粒度：

- 整篇文档
- 原始对话
- 单句碎片

## 2. 候选创建条件

只有满足以下全部条件，才能创建候选知识：

- 任务状态已闭环
- 验收结果 `status=passed`
- `knowledge_signal.recommended_action=capture`
- `reusable_score`、`stability_score`、`confidence` 达到阈值

默认阈值：

- `reusable_score >= 0.70`
- `stability_score >= 0.75`
- `confidence >= 0.80`

## 3. 冲突与去重

### 直接重复

判定依据：

- `scope` 相同
- recommendation 归一化后相同

处理：

- 不发布
- 直接归档或保留为候选审计记录

### 同 ID 冲突

判定依据：

- `knowledge_id` 相同
- recommendation 不同
- 旧记录不是 `archived`

处理：

- 进入 `review`
- 高价值冲突时转人工

### 同 scope 语义冲突

判定依据：

- `scope` 相同
- `knowledge_id` 不同
- 主题高度重叠
- recommendation 互斥

处理：

- 标记 `conflicted`
- 进入 `knowledge_review`

## 4. 预算与放行

预算不是建议，是强约束。

默认采用：

- 限流
- 全局 Top-K
- scope 内 Top-K
- 低分候选延迟或归档

典型策略：

- `max_wiki_writes_per_hour=10`
- `max_knowledge_tasks_in_queue=20`
- `top_k_per_window=5`

预算不通过时：

- 高分但超量：`deferred`
- 低分且超量：`archived`

## 5. 生命周期

状态：

- `candidate`
- `active`
- `deprecated`
- `archived`
- `conflicted`

默认迁移：

- `candidate -> active`
- `active -> deprecated`
- `active/deprecated -> archived`
- `* -> conflicted`

治理要求：

- 不做硬删除
- 必须保留版本追溯
- 旧版本被替代时要保留 `supersedes` / `supersededBy`

## 6. mem0 与 Obsidian 的边界

### mem0

保存：

- 运行时事实
- 候选知识
- 延迟发布记录
- 短期经验

### Obsidian

只保存：

- `active`
- 经 review 通过后可长期保留的知识
- 任务页 / ADR / SOP / 经验页

禁止：

- 原始聊天记录直接写 Obsidian
- 未验收结果写 Obsidian
- 冲突候选直接覆盖主知识

## 7. 人工 gate 触发条件

必须人工处理：

- 同一 `knowledge_id` 的高置信互斥建议
- 新规则将覆盖高复用 `active` 规则
- 跨多个文档的稳定规则互相矛盾
- 批量 deprecated 或 archive 高引用知识

允许自动处理：

- 明显重复
- 低质量低信心候选
- 预算溢出的低分候选

## 8. 运维动作建议

### 每日

- 检查 deferred 候选是否堆积
- 检查 `conflicted` 是否增加

### 每周

- 复查低引用 `deprecated`
- 评估是否批量 `archived`

### 每次发布前

- 确认高价值知识无未决冲突
- 确认新规则替代链完整

## 9. 反模式

- 让 Workflow Engine 自己猜“要不要写 Wiki”
- 把整篇复盘文档当成一个 `knowledge_id`
- 不设写入预算
- 只增不减，不做 archive
- 让冲突知识自动覆盖主内容
