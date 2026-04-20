# AgentForge Release Candidate 验收报告（2026-04-17）

## 版本目标

- 覆盖控制平面、知识闭环、飞书真实回调、观测、安全、前端控制台与运维资产
- 为后续 staging / production 发布提供可复核的基线

## 已完成能力摘要

- 控制平面 API：计划创建、运行、状态查询、知识查询、人工 gate
- 编排：in-memory、LangGraph、Temporal 接口
- 知识系统：identity、conflict、budget、lifecycle、mem0、Obsidian
- 外部集成：GitHub、Playwright、飞书、mem0、Obsidian
- 安全治理：认证、项目隔离、人工 gate 专用密钥、日志脱敏、执行边界
- 控制台：计划、任务、知识、告警、人工动作面板
- 运维：Docker、Compose、部署脚本、备份恢复、Runbook、演练记录

## 验收证据

- `npm run typecheck` 通过
- `npm test` 通过
- 当前测试结果：`74 pass / 0 fail / 1 skip`
- `docker compose -f docker-compose.dev.yml config` 通过
- `bash -n scripts/*.sh` 通过
- 飞书真实联调已完成：
  - 卡片发送成功
  - 点击回调到达服务
  - `WAITING_HUMAN -> READY`
  - 事件写入 `task.human_gate_resolved`

## 风险结论

- 当前适合作为 release candidate
- 仍未完成内容：
  - `T157-T162` 文档模板与多项目复用收尾
- 仍需后续持续关注：
  - 生产长期备份调度
  - 任务事件主键复合化
  - 更真实的高并发压测

## 结论

AgentForge 当前版本达到 release candidate 门槛，可进入文档收尾与多项目复用阶段。
