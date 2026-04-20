import { AppError } from "../core/errors/app-error.js";
import type { TaskUnit } from "../domain/task-unit.js";

const WRITE_SET_ALLOWLIST: Record<TaskUnit["type"], string[]> = {
  backend: ["src/", "tests/", "runtime/backend/"],
  frontend: ["frontend/", "tests/frontend/"],
  integration: ["tests/integration/", "runtime/integration/"],
  acceptance: ["runtime/acceptance/"],
  docs: ["docs/"],
  knowledge_capture: ["obsidian/", "runtime/knowledge/"],
  knowledge_merge: ["obsidian/", "runtime/knowledge/"],
  knowledge_review: ["obsidian/", "runtime/knowledge/"],
  knowledge_cleanup: ["obsidian/", "runtime/knowledge/"],
};

export class ExecutionPermissionGuard {
  assertTask(task: TaskUnit): void {
    const allowlist = WRITE_SET_ALLOWLIST[task.type];
    const invalid = task.writeSet.find(
      (entry) => !allowlist.some((prefix) => entry.startsWith(prefix)),
    );

    if (invalid) {
      throw new AppError({
        code: "PERMISSION_DENIED",
        message: "任务 write_set 超出当前执行角色允许范围。",
        details: {
          taskId: task.taskId,
          taskType: task.type,
          invalidWriteSet: invalid,
          allowlist,
        },
      });
    }
  }
}
