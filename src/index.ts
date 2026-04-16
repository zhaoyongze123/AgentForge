import { WorkflowEngine } from "./workflow/engine.js";

const engine = new WorkflowEngine();
const result = engine.run({
  request: "做一个用户系统",
  phase: "phase-2",
});

console.log(
  JSON.stringify(
    {
      taskCount: result.tasks.length,
      doneTasks: result.tasks.filter((task) => task.status === "DONE").map((task) => task.taskId),
      publishedKnowledgeIds: result.publishedKnowledge.map((record) => `${record.knowledgeId}@${record.version}`),
    },
    null,
    2,
  ),
);

