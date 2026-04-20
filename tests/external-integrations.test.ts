import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { HumanIntervention, Incident } from "../src/domain/incident.js";
import type { KnowledgeRecord } from "../src/domain/knowledge.js";
import type { TaskUnit } from "../src/domain/task-unit.js";
import { FeishuAdapter } from "../src/integrations/feishu-adapter.js";
import { GithubAdapter } from "../src/integrations/github-adapter.js";
import { Mem0HttpAdapter } from "../src/integrations/mem0-http-adapter.js";
import { ObsidianSyncService } from "../src/integrations/obsidian-sync.js";
import { PlaywrightAdapter } from "../src/integrations/playwright-adapter.js";
import { GithubPrPipeline } from "../src/workers/github-pr-pipeline.js";

test("GitHub 适配层支持仓库/分支/PR 查询、创建与 CI 状态采集", async () => {
  const requests: Array<{ method: string; url: string; body: string }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requests.push({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      body: Buffer.concat(chunks).toString("utf8"),
    });

    const body = (() => {
      if (req.url === "/repos/tester/agentforge") {
        return {
          owner: { login: "tester" },
          name: "agentforge",
          default_branch: "main",
          private: false,
          html_url: "https://github.com/tester/agentforge",
        };
      }
      if (req.url === "/repos/tester/agentforge/branches") {
        return [
          { name: "main", protected: true, commit: { sha: "sha-main" } },
          { name: "feature/ext", protected: false, commit: { sha: "sha-1" } },
        ];
      }
      if (req.url === "/repos/tester/agentforge/pulls?state=open") {
        return [
          {
            number: 12,
            title: "feat: 接入外部集成",
            state: "open",
            html_url: "https://github.com/tester/agentforge/pull/12",
            head: { ref: "feature/ext", sha: "sha-head" },
            base: { ref: "main" },
          },
        ];
      }
      if (req.url === "/repos/tester/agentforge/pulls" && req.method === "POST") {
        return {
          number: 13,
          title: "feat: 创建 PR",
          state: "open",
          html_url: "https://github.com/tester/agentforge/pull/13",
          head: { ref: "feature/new", sha: "sha-new" },
          base: { ref: "main" },
        };
      }
      if (req.url === "/repos/tester/agentforge/pulls/12") {
        return {
          number: 12,
          title: "feat: 接入外部集成",
          state: "open",
          html_url: "https://github.com/tester/agentforge/pull/12",
          head: { ref: "feature/ext", sha: "sha-head" },
          base: { ref: "main" },
        };
      }
      if (req.url === "/repos/tester/agentforge/commits/sha-head/status") {
        return {
          statuses: [
            {
              context: "build",
              state: "success",
              target_url: "https://ci.example/build/1",
            },
          ],
        };
      }
      if (req.url === "/repos/tester/agentforge/commits/sha-head/check-runs") {
        return {
          check_runs: [
            {
              name: "unit",
              status: "completed",
              conclusion: "success",
              details_url: "https://ci.example/unit/1",
            },
          ],
        };
      }

      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return null;
    })();

    if (body !== null) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试端口");
  }

  const adapter = new GithubAdapter({
    token: "github-token",
    baseUrl: `http://127.0.0.1:${address.port}`,
  });

  try {
    const repo = await adapter.getRepository({
      owner: "tester",
      repo: "agentforge",
    });
    const branches = await adapter.listBranches({
      owner: "tester",
      repo: "agentforge",
    });
    const pulls = await adapter.listPullRequests({
      owner: "tester",
      repo: "agentforge",
    });
    const branch = await adapter.createBranch({
      owner: "tester",
      repo: "agentforge",
      branch: "feature/new",
      sha: "sha-new",
    });
    const pull = await adapter.createPullRequest({
      owner: "tester",
      repo: "agentforge",
      title: "feat: 创建 PR",
      body: "body",
      head: "feature/new",
      base: "main",
    });
    const checks = await adapter.getPullRequestChecks({
      owner: "tester",
      repo: "agentforge",
      pullNumber: 12,
    });

    assert.equal(repo.defaultBranch, "main");
    assert.equal(branches.length, 2);
    assert.equal(pulls[0]?.number, 12);
    assert.equal(branch.name, "feature/new");
    assert.equal(pull.number, 13);
    assert.equal(checks.length, 2);
    assert.equal(
      requests.some((item) => item.url.endsWith("/git/refs") && item.method === "POST"),
      true,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("GitHub PR pipeline 可真实完成 commit、push 与 PR 创建", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agentforge-github-pr-"));
  const repositoryRoot = await createGitRepository(tempRoot);
  const remoteRoot = join(tempRoot, "origin.git");
  execFileSync("git", ["init", "--bare", remoteRoot]);
  execFileSync("git", ["remote", "add", "origin", remoteRoot], {
    cwd: repositoryRoot,
  });

  const branchName = "task/plan-1/task-github-pr";
  execFileSync("git", ["checkout", "-b", branchName], {
    cwd: repositoryRoot,
  });
  await mkdir(join(repositoryRoot, "src"), { recursive: true });
  await writeFile(
    join(repositoryRoot, "src", "pipeline-created.txt"),
    "pipeline-ok\n",
    "utf8",
  );

  const requests: Array<{ method: string; url: string; body: string }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requests.push({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      body: Buffer.concat(chunks).toString("utf8"),
    });

    if (req.url === "/repos/tester/agentforge") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          owner: { login: "tester" },
          name: "agentforge",
          default_branch: "main",
          private: false,
          html_url: "https://github.com/tester/agentforge",
        }),
      );
      return;
    }

    if (req.url === "/repos/tester/agentforge/pulls" && req.method === "POST") {
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          number: 99,
          title: "feat: 接通任务完成后的分支推送与 PR 创建链路",
          state: "open",
          html_url: "https://github.com/tester/agentforge/pull/99",
          head: { ref: branchName, sha: "sha-pr" },
          base: { ref: "main" },
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试端口");
  }

  const pipeline = new GithubPrPipeline({
    token: "github-token",
    baseUrl: `http://127.0.0.1:${address.port}`,
    repositoryRef: {
      owner: "tester",
      repo: "agentforge",
    },
  });

  try {
    const result = await pipeline.deliver({
      worktreePath: repositoryRoot,
      branchName,
      task: createGithubTask("plan-1", "task-github-pr"),
      taskRunId: "taskrun-plan-1-task-github-pr",
    });

    assert.equal(result.pullRequest.number, 99);
    assert.equal(
      result.stagedFiles.includes("src/pipeline-created.txt"),
      true,
    );
    assert.equal(
      execFileSync("git", ["log", "-1", "--pretty=%s"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).trim(),
      result.commitMessage,
    );
    assert.equal(
      execFileSync(
        "git",
        [
          "--git-dir",
          remoteRoot,
          "show-ref",
          "--verify",
          `refs/heads/${branchName}`,
        ],
        {
          encoding: "utf8",
        },
      )
        .trim()
        .endsWith(`refs/heads/${branchName}`),
      true,
    );

    const createPrRequest = requests.find(
      (request) =>
        request.method === "POST" &&
        request.url === "/repos/tester/agentforge/pulls",
    );
    assert.ok(createPrRequest);

    const payload = JSON.parse(createPrRequest.body) as {
      body: string;
      head: string;
      base: string;
    };
    assert.equal(payload.head, branchName);
    assert.equal(payload.base, "main");
    assert.match(payload.body, /planId: plan-1/u);
    assert.match(payload.body, /taskId: task-github-pr/u);
    assert.match(payload.body, /taskRunId: taskrun-plan-1-task-github-pr/u);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Playwright 结果采集适配层可解析截图、trace 与失败证据", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-playwright-"));
  const reportPath = join(root, "report.json");
  await writeFile(
    reportPath,
    JSON.stringify({
      suites: [
        {
          tests: [
            {
              results: [
                {
                  status: "failed",
                  duration: 321,
                  error: { message: "locator timeout" },
                  attachments: [
                    {
                      name: "screenshot",
                      contentType: "image/png",
                      path: join(root, "error.png"),
                    },
                    {
                      name: "trace",
                      contentType: "application/zip",
                      path: join(root, "trace.zip"),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
    "utf8",
  );

  const summary = await new PlaywrightAdapter().collectFromJsonReport(reportPath);
  assert.equal(summary.status, "failed");
  assert.equal(summary.failed, 1);
  assert.equal(summary.screenshots.length, 1);
  assert.equal(summary.traces.length, 1);
  assert.equal(summary.evidence[0], "locator timeout");
});

test("飞书通知与人工介入卡片适配层可发送结构化消息", async () => {
  const bodies: unknown[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ code: 0, msg: "ok", request_id: "req-1" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试端口");
  }

  const adapter = new FeishuAdapter();
  const incident: Incident = {
    incidentId: "incident-1",
    taskId: "task-1",
    severity: "high",
    type: "blocked",
    summary: "GitHub 分支创建失败",
    evidence: ["403 Forbidden"],
    requiresHuman: true,
  };
  const intervention: HumanIntervention = {
    interventionId: "hi-1",
    relatedId: "incident-1",
    type: "approval",
    summary: "是否改为人工创建分支",
    actor: "agentforge",
    createdAt: new Date().toISOString(),
  };

  try {
    const textReceipt = await adapter.sendText(
      `http://127.0.0.1:${address.port}`,
      "任务 blocked",
    );
    const cardReceipt = await adapter.sendHumanGateCard(
      `http://127.0.0.1:${address.port}`,
      {
        incident,
        intervention,
        planId: "plan-1",
        taskId: "task-1",
        actions: [
          { text: "批准", value: "approve" },
          { text: "驳回", value: "reject" },
        ],
      },
    );

    assert.equal(textReceipt.ok, true);
    assert.equal(cardReceipt.requestId, "req-1");
    assert.equal(bodies.length, 2);
    const cardBody = bodies[1] as {
      card: {
        elements: Array<{
          actions?: Array<{
            value?: Record<string, unknown>;
          }>;
        }>;
      };
    };
    const actionValue = cardBody.card.elements[1]?.actions?.[0]?.value ?? {};
    assert.equal(actionValue.plan_id, "plan-1");
    assert.equal(actionValue.task_id, "task-1");
    assert.equal(actionValue.related_id, "incident-1");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("mem0 真实服务适配层支持写入、搜索与列表读取", async () => {
  const server = createServer(async (req, res) => {
    if (req.url?.startsWith("/memories/search")) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify([
          { id: "m-2", memory: "JWT 过期策略", score: 0.9 },
        ]),
      );
      return;
    }

    if (req.url?.startsWith("/memories?")) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify([
          {
            key: "context:auth",
            scope: "knowledge/auth",
            kind: "context",
            value: { recommendation: "use jwt" },
            createdAt: "2026-04-16T10:00:00.000Z",
            updatedAt: "2026-04-16T10:00:00.000Z",
          },
        ]),
      );
      return;
    }

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "m-1" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法获取测试端口");
  }

  const adapter = new Mem0HttpAdapter({
    baseUrl: `http://127.0.0.1:${address.port}`,
    apiKey: "mem0-token",
  });

  try {
    const added = await adapter.addMemory({
      userId: "tester",
      messages: [{ role: "user", content: "记录 JWT 策略" }],
    });
    const found = await adapter.searchMemories("tester", "JWT");
    const listed = await adapter.listMemories("tester");

    assert.equal(added.id, "m-1");
    assert.equal(found[0]?.id, "m-2");
    assert.equal(listed.items.length, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Obsidian 同步策略可稳定落盘并识别 stale 文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentforge-obsidian-sync-"));
  const staleDir = join(root, "knowledge", "patterns", "knowledge", "auth");
  await mkdir(staleDir, { recursive: true });
  await writeFile(join(staleDir, "stale.md"), "# stale", "utf8");

  const records: KnowledgeRecord[] = [
    {
      knowledgeId: "knowledge.auth.flow",
      version: 1,
      scope: "knowledge/auth",
      status: "active",
      title: "认证主路径",
      summary: "注册登录鉴权",
      recommendation: "使用 JWT",
      constraints: [],
      confidence: 0.9,
      candidateType: "pattern",
      sourceRefs: ["task:1"],
      derivedFrom: [],
      supersedes: [],
      updatedAt: "2026-04-16T10:00:00.000Z",
    },
  ];

  const result = await new ObsidianSyncService(root).sync(records);
  assert.equal(result.written.length, 1);
  assert.equal(result.stale.length, 1);
  assert.equal(result.written[0]?.endsWith("knowledge.auth.flow.md"), true);
});

async function createGitRepository(root: string): Promise<string> {
  const repositoryRoot = join(root, "repo");
  await mkdir(repositoryRoot, { recursive: true });
  await writeFile(join(repositoryRoot, "README.md"), "# temp\n", "utf8");
  execFileSync("git", ["init"], { cwd: repositoryRoot });
  execFileSync("git", ["config", "user.email", "agentforge@example.com"], {
    cwd: repositoryRoot,
  });
  execFileSync("git", ["config", "user.name", "AgentForge"], {
    cwd: repositoryRoot,
  });
  execFileSync("git", ["add", "README.md"], { cwd: repositoryRoot });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repositoryRoot });
  return repositoryRoot;
}

function createGithubTask(planId: string, taskId: string): TaskUnit {
  return {
    planId,
    taskId,
    title: "接通任务完成后的分支推送与 PR 创建链路",
    goal: "让真实任务执行后自动创建分支、提交、推送并创建 PR",
    type: "integration",
    phase: "phase-real-delivery",
    priority: "high",
    dependencies: [],
    readSet: ["src/integrations/github-adapter.ts", "src/workers/**"],
    writeSet: ["src/workers/**", "tests/external-integrations.test.ts"],
    inputs: ["真实 GitHub Token", "任务级分支命名"],
    deliverables: ["push/PR pipeline", "GitHub 结果持久化", "集成测试"],
    acceptanceCriteria: [
      "成功任务可创建 commit、push branch、open PR",
      "PR 元信息绑定 planId/taskId/taskRunId",
      "任一步骤失败时任务 blocked 并保留证据",
    ],
    testCommands: ["npm run typecheck", "npm test"],
    handoffTo: "integration-agent",
    blockedConditions: ["目标仓库无 push 权限"],
    autoFixPolicy: ["API 映射错误可自动修"],
    humanGate: { required: false },
    status: "READY",
  };
}
