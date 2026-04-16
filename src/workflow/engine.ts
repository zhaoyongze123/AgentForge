import type { KnowledgeRecord } from "../domain/knowledge.js";
import type { PlanInput, TaskUnit } from "../domain/task-unit.js";
import { InMemoryStore } from "../runtime/in-memory-store.js";
import { Dispatcher } from "../services/dispatcher.js";
import { Evaluator } from "../services/evaluator.js";
import { KnowledgeWorkflow } from "../services/knowledge-workflow.js";
import { Planner } from "../services/planner.js";

export interface WorkflowRunResult {
  tasks: TaskUnit[];
  publishedKnowledge: KnowledgeRecord[];
}

export class WorkflowEngine {
  private readonly store = new InMemoryStore();
  private readonly planner = new Planner();
  private readonly dispatcher = new Dispatcher();
  private readonly evaluator = new Evaluator();
  private readonly knowledgeWorkflow = new KnowledgeWorkflow(this.store);

  run(input: PlanInput): WorkflowRunResult {
    const tasks = this.planner.plan(input);
    for (const task of tasks) {
      this.store.tasks.set(task.taskId, task);
    }

    const publishedKnowledge: KnowledgeRecord[] = [];

    while (true) {
      const dispatchDecisions = this.dispatcher.dispatch([...this.store.tasks.values()]);
      if (dispatchDecisions.length === 0) {
        break;
      }

      for (const decision of dispatchDecisions) {
        const task = this.store.tasks.get(decision.taskId);
        if (!task) {
          continue;
        }

        task.status = "DONE";
        const acceptance = this.evaluator.evaluate(task);
        this.store.acceptanceResults.set(task.taskId, acceptance);

        const candidate = this.knowledgeWorkflow.createCandidate(task, acceptance);
        if (!candidate) {
          continue;
        }

        const budgetDecision = this.knowledgeWorkflow.evaluateBudget(candidate);
        if (!budgetDecision.allowed) {
          continue;
        }

        publishedKnowledge.push(this.knowledgeWorkflow.publish(candidate));
      }
    }

    return {
      tasks: [...this.store.tasks.values()],
      publishedKnowledge,
    };
  }
}
