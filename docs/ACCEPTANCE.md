# Acceptance

## 目标

验收 agent 不负责做功能开发，只负责基于既定验收标准给出结构化判定。验收结果必须可被控制平面直接消费，而不是继续靠人读长篇自然语言猜结果。

## 验收输出格式

固定结构如下：

```json
{
  "status": "passed|failed|blocked",
  "summary": "",
  "acceptance_checks": [],
  "evidence": [],
  "root_cause": "",
  "auto_fixable": true,
  "requires_human": false,
  "next_action": "",
  "knowledge_signal": {
    "reusable_score": 0.0,
    "novelty_score": 0.0,
    "confidence": 0.0,
    "stability_score": 0.0,
    "impact_score": 0.0,
    "candidate_type": "pattern|incident|sop|adr",
    "recommended_action": "ignore|capture|review|archive"
  }
}
```

字段说明：

- `status`
  只能是 `passed`、`failed` 或 `blocked`
- `summary`
  对本次验收结论的简要总结
- `acceptance_checks`
  本次实际检查过的验收项
- `evidence`
  命令输出、截图、日志、网络请求、CI 链接等证据
- `root_cause`
  失败或 blocked 的根因归纳
- `auto_fixable`
  是否允许进入自动修复流程
- `requires_human`
  是否必须人工介入
- `next_action`
  下一步推荐动作
- `knowledge_signal`
  供工作流判断是否值得进入知识闭环的价值信号

## 判定规则

### passed

只有当以下条件同时成立时才能判定 `passed`：

- 所有关键验收项都通过
- 没有高风险未解释异常
- 证据足够复核

### failed

用于以下情况：

- 验收项明确不通过
- 有真实错误，但系统仍可以继续自动修复
- 失败原因已经足够清楚，不需要立即人工决策

### blocked

用于以下情况：

- 需求歧义导致无法判定通过与否
- 环境异常或外部依赖不可用
- 权限边界不足，无法继续
- 错误需要人做产品、架构或风险决策

## 知识信号规则

`knowledge_signal` 不改变验收主结论，但它是知识闭环的唯一结构化入口。Evaluator 或其内部知识评分阶段必须给出以下信号：

- `reusable_score`
  结果在未来任务中可复用的概率和价值
- `novelty_score`
  相对于现有知识库的新颖度，用于预算排序
- `confidence`
  本次知识结论的确信度
- `stability_score`
  该结论是否已经跨过“过程信息”，成为稳定规则
- `impact_score`
  该知识对系统、任务成功率或问题排查效率的影响
- `candidate_type`
  知识候选类型，例如 `pattern`、`incident`、`sop`、`adr`
- `recommended_action`
  对知识闭环的推荐动作，只能是 `ignore`、`capture`、`review`、`archive`

默认约束：

- `status != passed` 时，不得推荐 `capture`
- `reusable_score`、`stability_score`、`confidence` 任一低于阈值时，不得直接进入长期 Wiki
- `novelty_score` 只参与 Top-K 排序，不单独决定发布

默认阈值：

- `reusable_score >= 0.70`
- `stability_score >= 0.75`
- `confidence >= 0.80`

## 自动修复与人工介入边界

### 允许自动修复

- 编译错误
- 类型错误
- 明确字段映射错误
- 明确接口路径错误
- 明确测试断言错误
- 可复现且低风险的前端渲染/后端返回问题

### 不允许自动修复

- 需求本身不清楚
- 产品语义冲突
- 架构改动会影响多个上下游系统
- 权限模型需要调整
- 数据迁移与破坏性操作

## 证据要求

验收结果必须至少包含以下一种证据：

- 测试命令输出
- 构建日志
- 浏览器截图
- Playwright 结果
- API 请求 / 响应证据
- CI 状态链接

如果没有证据，就不能判为 `passed`。

如果没有证据，也不能生成长期知识候选。

## 知识发布建议规则

推荐的工作流决策如下：

```text
status != passed -> ignore
status == passed 但评分不足 -> ignore 或 archive
status == passed 且评分达标 -> capture
高价值冲突 -> review
低质量重复 -> archive
```

`recommended_action` 是建议，不是最终发布动作。最终是否写入长期知识，仍由工作流引擎执行预算、冲突和生命周期门控。

## 验收分级

### 代码级

- 静态检查
- 编译
- 类型检查
- 单元测试

### 集成级

- 模块集成测试
- 接口契约验证
- 后端 / 前端最小联调

### 浏览器联调级

- Playwright 点击路径
- 页面渲染
- 网络请求与结果校验
- 用户路径是否闭环

### 发布前 gate 级

- 核心业务路径通过
- 高风险失败项清零
- blocked 项已处理或转人工确认
- 满足进入发布流程的最小门槛
