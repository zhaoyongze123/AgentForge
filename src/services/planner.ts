import { DEFAULT_KNOWLEDGE_THRESHOLDS } from "../config/defaults.js";
import {
  validatePlannerInput,
  validateTaskUnit,
} from "../contracts/validator.js";
import { AppError } from "../core/errors/app-error.js";
import type { PlannerResult, TaskSketch } from "../domain/planner.js";
import type { PlanInput, TaskType, TaskUnit } from "../domain/task-unit.js";

interface CapabilityRule {
  capability: string;
  taskId: string;
  title: string;
  goal: string;
  type: TaskType;
  dependencies: string[];
}

const USER_SYSTEM_RULES: CapabilityRule[] = [
  {
    capability: "user-register",
    taskId: "backend-user-register",
    title: "实现用户注册接口与测试",
    goal: "提供用户注册能力，包含输入校验、重复用户处理和后端测试",
    type: "backend",
    dependencies: [],
  },
  {
    capability: "user-login",
    taskId: "backend-user-login",
    title: "实现用户登录接口与测试",
    goal: "提供用户登录能力，包含密码校验、失败返回和后端测试",
    type: "backend",
    dependencies: ["backend-user-register"],
  },
  {
    capability: "jwt-auth",
    taskId: "backend-user-jwt",
    title: "实现 JWT 策略与鉴权中间件",
    goal: "补齐 JWT 生成、校验、过期策略和受保护接口鉴权",
    type: "backend",
    dependencies: ["backend-user-login"],
  },
  {
    capability: "auth-pages",
    taskId: "frontend-auth-pages",
    title: "实现注册登录页面与表单交互",
    goal: "提供注册、登录页面和真实接口交互，并处理错误态",
    type: "frontend",
    dependencies: ["backend-user-login"],
  },
  {
    capability: "auth-integration",
    taskId: "integration-auth-flow",
    title: "串联注册登录与 JWT 鉴权链路",
    goal: "验证前后端注册、登录、受保护接口访问的最小联调链路",
    type: "integration",
    dependencies: ["backend-user-jwt", "frontend-auth-pages"],
  },
  {
    capability: "auth-acceptance",
    taskId: "acceptance-auth-flow",
    title: "验收用户系统认证主路径",
    goal: "基于验收协议确认注册、登录、JWT 鉴权主路径通过",
    type: "acceptance",
    dependencies: ["integration-auth-flow"],
  },
  {
    capability: "auth-knowledge",
    taskId: "knowledge-auth-flow",
    title: "沉淀用户认证链路稳定经验",
    goal: "从通过验收的用户认证链路中抽取可复用知识候选",
    type: "knowledge_capture",
    dependencies: ["acceptance-auth-flow"],
  },
];

export class Planner {
  private readonly validator = new PlannerResultValidator();

  plan(input: PlanInput): TaskUnit[] {
    const plannerInput = validatePlannerInput(input);
    const result = this.createTaskSketches(plannerInput);
    const tasks = result.sketches.map((sketch) =>
      this.materializeTask(sketch, plannerInput),
    );

    this.validator.validate(tasks);
    return tasks;
  }

  createTaskSketches(input: PlanInput): PlannerResult {
    const normalizedRequest = input.request.toLowerCase();
    const rules = this.selectRules(normalizedRequest);

    return {
      request: input.request,
      phase: input.phase,
      sketches: rules.map((rule) => ({
        taskId: rule.taskId,
        title: rule.title,
        goal: rule.goal,
        type: rule.type,
        capability: rule.capability,
        dependencies: rule.dependencies,
      })),
    };
  }

  private selectRules(normalizedRequest: string): CapabilityRule[] {
    if (
      normalizedRequest.includes("用户") ||
      normalizedRequest.includes("user") ||
      normalizedRequest.includes("auth")
    ) {
      return USER_SYSTEM_RULES;
    }

    return [
      {
        capability: "generic-planning",
        taskId: "docs-generic-task-breakdown",
        title: "拆解通用研发任务",
        goal: "将高层目标拆解为后续可执行 TaskUnit 草案",
        type: "docs",
        dependencies: [],
      },
    ];
  }

  private materializeTask(sketch: TaskSketch, input: PlanInput): TaskUnit {
    const task: TaskUnit = {
      taskId: sketch.taskId,
      title: sketch.title,
      goal: sketch.goal,
      type: sketch.type,
      phase: input.phase,
      priority: this.inferPriority(sketch),
      dependencies: sketch.dependencies,
      readSet: this.inferReadSet(sketch),
      writeSet: this.inferWriteSet(sketch),
      inputs: [input.request, ...(input.constraints ?? [])],
      deliverables: this.inferDeliverables(sketch),
      acceptanceCriteria: this.inferAcceptanceCriteria(sketch),
      testCommands: this.inferTestCommands(sketch),
      handoffTo: this.inferHandoff(sketch),
      blockedConditions: this.inferBlockedConditions(sketch),
      autoFixPolicy: this.inferAutoFixPolicy(sketch),
      humanGate: {
        required: false,
        triggerConditions: [
          "需求语义冲突",
          "权限边界不清",
          "需要修改未授权 write_set",
        ],
      },
      knowledgePolicy: {
        enabled: sketch.type !== "docs",
        candidateType:
          sketch.type === "knowledge_capture" ? "pattern" : "pattern",
        reusableScoreThreshold: DEFAULT_KNOWLEDGE_THRESHOLDS.reusableScore,
        stabilityScoreThreshold: DEFAULT_KNOWLEDGE_THRESHOLDS.stabilityScore,
        confidenceThreshold: DEFAULT_KNOWLEDGE_THRESHOLDS.confidence,
      },
      status: sketch.dependencies.length === 0 ? "READY" : "PLANNED",
    };

    return validateTaskUnit(task);
  }

  private inferPriority(sketch: TaskSketch): TaskUnit["priority"] {
    if (sketch.type === "acceptance" || sketch.type === "knowledge_capture") {
      return "medium";
    }

    return "high";
  }

  private inferReadSet(sketch: TaskSketch): string[] {
    if (sketch.type === "frontend") {
      return ["docs/**", "frontend/**", "src/**"];
    }

    if (sketch.type === "knowledge_capture") {
      return ["docs/ACCEPTANCE.md", "docs/KNOWLEDGE_MODEL.md", "runtime/**"];
    }

    if (sketch.type === "acceptance") {
      return ["docs/ACCEPTANCE.md", "src/**", "tests/**"];
    }

    return ["docs/**", "src/**"];
  }

  private inferWriteSet(sketch: TaskSketch): string[] {
    if (sketch.type === "frontend") {
      return ["frontend/**", "tests/frontend/**"];
    }

    if (sketch.type === "integration") {
      return ["tests/integration/**", "runtime/integration/**"];
    }

    if (sketch.type === "acceptance") {
      return ["runtime/acceptance/**"];
    }

    if (sketch.type === "knowledge_capture") {
      return ["obsidian/knowledge/**", "runtime/knowledge/**"];
    }

    if (sketch.type === "docs") {
      return ["docs/**"];
    }

    return ["src/**", "tests/**"];
  }

  private inferDeliverables(sketch: TaskSketch): string[] {
    return [`${sketch.title} 的实现或结构化产物`, `${sketch.title} 的验证证据`];
  }

  private inferAcceptanceCriteria(sketch: TaskSketch): string[] {
    if (sketch.type === "acceptance") {
      return [
        "注册、登录、JWT 鉴权主路径全部通过",
        "验收输出符合 ACCEPTANCE.md",
      ];
    }

    if (sketch.type === "knowledge_capture") {
      return ["产出稳定 knowledge_id", "候选知识包含 source_refs 和评分"];
    }

    return [`${sketch.title} 满足任务目标`, "任务绑定测试命令通过"];
  }

  private inferTestCommands(sketch: TaskSketch): string[] {
    if (sketch.type === "frontend") {
      return ["npm test"];
    }

    if (sketch.type === "acceptance") {
      return ["npm test"];
    }

    return ["npm test"];
  }

  private inferHandoff(sketch: TaskSketch): string {
    if (sketch.type === "frontend") {
      return "integration-agent";
    }

    if (sketch.type === "integration") {
      return "acceptance-agent";
    }

    if (sketch.type === "acceptance") {
      return "knowledge-agent";
    }

    if (sketch.type === "knowledge_capture") {
      return "knowledge-review-agent";
    }

    return "acceptance-agent";
  }

  private inferBlockedConditions(sketch: TaskSketch): string[] {
    return [
      "需求歧义导致无法继续拆分",
      `需要修改 ${sketch.title} write_set 之外的文件`,
      "外部依赖或测试环境不可用",
    ];
  }

  private inferAutoFixPolicy(sketch: TaskSketch): string[] {
    if (sketch.type === "knowledge_capture") {
      return ["字段缺失可自动补齐", "知识身份冲突不可自动修"];
    }

    return [
      "类型错误可自动修",
      "测试断言错误可自动修",
      "产品语义冲突不可自动修",
    ];
  }
}

export class PlannerResultValidator {
  validate(tasks: TaskUnit[]): void {
    const ids = new Set<string>();
    for (const task of tasks) {
      if (ids.has(task.taskId)) {
        throw new AppError({
          code: "CONFIG_INVALID",
          message: "Planner 产出了重复 task_id。",
          details: { taskId: task.taskId },
        });
      }
      ids.add(task.taskId);
      validateTaskUnit(task);
    }

    for (const task of tasks) {
      for (const dependency of task.dependencies) {
        if (!ids.has(dependency)) {
          throw new AppError({
            code: "TASK_DEPENDENCY_UNMET",
            message: "Planner 产出了不存在的依赖。",
            details: { taskId: task.taskId, dependency },
          });
        }

        if (dependency === task.taskId) {
          throw new AppError({
            code: "TASK_DEPENDENCY_UNMET",
            message: "Planner 产出了自依赖任务。",
            details: { taskId: task.taskId },
          });
        }
      }
    }
  }
}
