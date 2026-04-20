import type { AcceptanceResult } from "../domain/acceptance.js";
import type {
  KnowledgeCandidate,
  KnowledgeRecord,
} from "../domain/knowledge.js";
import type { Assignment, Phase, Plan } from "../domain/plan.js";
import type { HumanIntervention, Incident } from "../domain/incident.js";
import type { TaskUnit } from "../domain/task-unit.js";
import type { KnowledgeEvent, TaskEvent } from "../domain/events.js";

export const taskUnitFixture: TaskUnit = {
  taskId: "backend-user-register",
  title: "实现用户注册接口与测试",
  goal: "提供用户注册能力并确保后端测试通过",
  type: "backend",
  phase: "phase-2",
  priority: "high",
  dependencies: [],
  readSet: ["docs/**"],
  writeSet: ["src/**"],
  inputs: ["做一个用户系统"],
  deliverables: ["注册接口", "后端测试"],
  acceptanceCriteria: ["注册接口测试通过"],
  testCommands: ["npm test"],
  handoffTo: "acceptance-agent",
  blockedConditions: ["权限越界"],
  autoFixPolicy: ["类型错误可自动修"],
  humanGate: { required: false },
  knowledgePolicy: {
    enabled: true,
    candidateType: "pattern",
    reusableScoreThreshold: 0.7,
    stabilityScoreThreshold: 0.75,
    confidenceThreshold: 0.8,
  },
  status: "READY",
};

export const acceptanceResultFixture: AcceptanceResult = {
  status: "passed",
  summary: "用户注册任务验收通过",
  acceptanceChecks: ["注册接口测试通过"],
  evidence: ["npm test passed"],
  rootCause: "",
  autoFixable: false,
  requiresHuman: false,
  nextAction: "进入知识捕获",
  knowledgeSignal: {
    reusableScore: 0.8,
    noveltyScore: 0.6,
    confidence: 0.9,
    stabilityScore: 0.88,
    impactScore: 0.75,
    candidateType: "pattern",
    recommendedAction: "capture",
  },
  knowledgeDraft: {
    title: "用户注册接口与测试经验",
    summary: "已验证用户注册能力，最低通过证据包含 npm test。",
    recommendation: "复用时优先保留输入校验、重复用户处理和后端测试。",
    constraints: [],
    sourceRefs: ["task:backend-user-register", "command:npm test"],
    derivedFrom: ["status:passed"],
  },
};

export const knowledgeRecordFixture: KnowledgeRecord = {
  knowledgeId: "user.register",
  version: 1,
  scope: "backend/general",
  status: "active",
  title: "用户注册稳定经验",
  summary: "用户注册流程已稳定通过验收",
  recommendation: "优先补齐注册接口测试再进入联调",
  constraints: [],
  confidence: 0.9,
  candidateType: "pattern",
  sourceRefs: ["task:backend-user-register"],
  derivedFrom: [],
  supersedes: [],
  updatedAt: "2026-04-16T00:00:00.000Z",
};

export const knowledgeCandidateFixture: KnowledgeCandidate = {
  candidateId: "kc-backend-user-register",
  knowledgeId: "user.register",
  scope: "backend/general",
  summary: "用户注册任务的稳定经验",
  recommendation: "优先补齐注册接口测试再进入联调",
  sourceRefs: ["task:backend-user-register"],
  candidateType: "pattern",
  scores: {
    reusableScore: 0.8,
    noveltyScore: 0.6,
    confidence: 0.9,
    stabilityScore: 0.88,
    impactScore: 0.75,
    publishScore: 0.748,
  },
};

export const phaseFixture: Phase = {
  phaseId: "phase-2",
  title: "最小可运行控制平面",
  order: 2,
  status: "PLANNED",
};

export const planFixture: Plan = {
  planId: "plan-user-system-001",
  title: "用户系统计划",
  goal: "完成用户系统后端、验收和知识沉淀",
  status: "PLANNED",
  phases: [phaseFixture],
  taskIds: [taskUnitFixture.taskId],
};

export const assignmentFixture: Assignment = {
  assignmentId: "assign-001",
  taskId: taskUnitFixture.taskId,
  executor: "codex",
  status: "ASSIGNED",
};

export const incidentFixture: Incident = {
  incidentId: "incident-001",
  taskId: taskUnitFixture.taskId,
  severity: "medium",
  type: "retryable_failure",
  summary: "测试命令第一次执行失败",
  evidence: ["npm test exit code 1"],
  requiresHuman: false,
};

export const humanInterventionFixture: HumanIntervention = {
  interventionId: "human-001",
  relatedId: incidentFixture.incidentId,
  type: "decision",
  summary: "确认采用 refresh token 策略",
  actor: "owner",
  createdAt: "2026-04-16T00:00:00.000Z",
};

export const taskEventFixture: TaskEvent = {
  eventId: "event-task-001",
  taskId: taskUnitFixture.taskId,
  type: "task_ready",
  timestamp: "2026-04-16T00:00:00.000Z",
};

export const knowledgeEventFixture: KnowledgeEvent = {
  eventId: "event-knowledge-001",
  knowledgeId: knowledgeRecordFixture.knowledgeId,
  type: "knowledge_published",
  timestamp: "2026-04-16T00:00:00.000Z",
};
