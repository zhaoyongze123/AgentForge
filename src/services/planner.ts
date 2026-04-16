import { DEFAULT_KNOWLEDGE_THRESHOLDS } from "../config/defaults.js";
import type { PlanInput, TaskUnit } from "../domain/task-unit.js";

export class Planner {
  plan(input: PlanInput): TaskUnit[] {
    return [
      this.createTask(
        "task-user-register",
        "用户注册",
        "实现用户注册能力并补齐验收",
        "backend",
        [],
      ),
      this.createTask(
        "task-user-login",
        "用户登录",
        "实现用户登录能力并补齐验收",
        "backend",
        ["task-user-register"],
      ),
      this.createTask(
        "task-user-jwt",
        "JWT 策略",
        "补齐 JWT 生成、校验与过期策略",
        "knowledge_capture",
        ["task-user-login"],
      ),
    ].map((task) => ({
      ...task,
      inputs: [input.request],
      phase: input.phase,
    }));
  }

  private createTask(
    taskId: string,
    title: string,
    goal: string,
    type: TaskUnit["type"],
    dependencies: string[],
  ): TaskUnit {
    return {
      taskId,
      title,
      goal,
      type,
      phase: "phase-2",
      priority: "high",
      dependencies,
      readSet: ["docs/**"],
      writeSet: ["src/**"],
      inputs: [],
      deliverables: [title],
      acceptanceCriteria: [`${title} 对应验收通过`],
      testCommands: ["npm test"],
      handoffTo: "acceptance-agent",
      blockedConditions: ["需求歧义", "权限越界"],
      autoFixPolicy: ["类型错误可自动修", "需求冲突不可自动修"],
      humanGate: { required: false },
      knowledgePolicy: {
        enabled: true,
        candidateType: type === "knowledge_capture" ? "pattern" : "pattern",
        reusableScoreThreshold: DEFAULT_KNOWLEDGE_THRESHOLDS.reusableScore,
        stabilityScoreThreshold: DEFAULT_KNOWLEDGE_THRESHOLDS.stabilityScore,
        confidenceThreshold: DEFAULT_KNOWLEDGE_THRESHOLDS.confidence,
      },
      status: "READY",
    };
  }
}

