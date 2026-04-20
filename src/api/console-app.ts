export function renderConsoleHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AgentForge Console</title>
    <style>
      :root {
        --bg: #f5efe6;
        --panel: #fffdf8;
        --ink: #1d1a16;
        --muted: #6e6256;
        --accent: #0d6b5f;
        --accent-soft: #d8eee8;
        --line: #d9cfc1;
        --danger: #8d2b1f;
        --warning: #926a10;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background:
          radial-gradient(circle at top left, rgba(13,107,95,.12), transparent 30%),
          linear-gradient(180deg, #f9f3ea 0%, var(--bg) 100%);
        color: var(--ink);
        font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
      }
      .page {
        max-width: 1440px;
        margin: 0 auto;
        padding: 24px;
      }
      .hero {
        display: grid;
        grid-template-columns: 1.2fr .8fr;
        gap: 20px;
        margin-bottom: 22px;
      }
      .hero-card, .panel {
        background: color-mix(in srgb, var(--panel) 94%, white);
        border: 1px solid var(--line);
        border-radius: 22px;
        box-shadow: 0 20px 60px rgba(50, 38, 25, 0.08);
      }
      .hero-card {
        padding: 28px;
      }
      .eyebrow {
        display: inline-flex;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 16px 0 12px;
        font-size: clamp(32px, 5vw, 56px);
        line-height: .95;
      }
      p {
        margin: 0;
        color: var(--muted);
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 22px;
      }
      .stat {
        background: #f7f1e8;
        border-radius: 16px;
        padding: 14px;
      }
      .stat strong {
        display: block;
        font-size: 28px;
      }
      .auth {
        padding: 22px;
        display: grid;
        gap: 12px;
      }
      .auth h2, .section-head h2 {
        margin: 0;
        font-size: 22px;
      }
      .field-grid {
        display: grid;
        gap: 10px;
      }
      input, select, textarea, button {
        font: inherit;
      }
      input, select, textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 10px 12px;
        background: #fff;
      }
      textarea { min-height: 88px; resize: vertical; }
      button {
        border: none;
        background: var(--accent);
        color: #fff;
        padding: 11px 14px;
        border-radius: 12px;
        cursor: pointer;
      }
      button.secondary {
        background: #efe7d9;
        color: var(--ink);
      }
      .grid {
        display: grid;
        grid-template-columns: 1.15fr .85fr;
        gap: 20px;
      }
      .stack {
        display: grid;
        gap: 20px;
      }
      .panel { padding: 20px; }
      .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .pill {
        display: inline-flex;
        padding: 4px 10px;
        border-radius: 999px;
        background: #f2eadf;
        color: var(--muted);
        font-size: 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        text-align: left;
        padding: 10px 0;
        border-bottom: 1px solid #eee2d2;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-weight: 600;
        font-size: 13px;
      }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
      }
      .status {
        display: inline-flex;
        align-items: center;
        padding: 4px 9px;
        border-radius: 999px;
        font-size: 12px;
        background: #efe7d9;
      }
      .status.DONE, .status.active, .status.passed { background: #dff3ea; color: #176653; }
      .status.FAILED_BLOCKED, .status.conflicted, .status.failed { background: #f7ddd7; color: var(--danger); }
      .status.WAITING_HUMAN, .status.blocked { background: #f8ebcc; color: var(--warning); }
      .status.deprecated, .status.archived { background: #ece7e0; color: #72685d; }
      .cards {
        display: grid;
        gap: 12px;
      }
      .card {
        border: 1px solid #e9ddce;
        border-radius: 16px;
        padding: 14px;
        background: #fffdfa;
      }
      .card h3 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .empty {
        color: var(--muted);
        padding: 8px 0;
      }
      @media (max-width: 980px) {
        .hero, .grid, .stats {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <section class="hero">
        <div class="hero-card">
          <span class="eyebrow">AgentForge Control Console</span>
          <h1>任务图、知识库与人工介入在一个界面里闭环。</h1>
          <p>这不是演示页。它直接消费控制平面接口，展示计划、任务、知识对象、观测指标和人工 gate 动作。</p>
          <div class="stats" id="summary-stats"></div>
        </div>
        <div class="hero-card auth">
          <div class="section-head">
            <h2>访问上下文</h2>
            <span class="pill">本地缓存</span>
          </div>
          <div class="field-grid">
            <input id="api-key" placeholder="CONTROL_PLANE_API_KEY（可空）" />
            <input id="project-id" placeholder="x-project-id（可空）" />
            <input id="human-gate-key" placeholder="x-human-gate-key（可空）" />
            <button id="save-auth">保存并刷新</button>
          </div>
          <p>如果服务开启了控制面认证或项目隔离，这里填入对应 header 值。</p>
        </div>
      </section>

      <section class="grid">
        <div class="stack">
          <div class="panel">
            <div class="section-head">
              <h2>创建计划</h2>
              <span class="pill">Planner Input</span>
            </div>
            <div class="field-grid">
              <textarea id="create-request" placeholder="输入高层目标，例如：做一个用户系统"></textarea>
              <input id="create-phase" placeholder="phase，例如：phase-console" value="phase-console" />
              <input id="create-constraints" placeholder="constraints，逗号分隔（可空）" />
              <input id="create-target-modules" placeholder="targetModules，逗号分隔（可空）" />
              <div class="actions">
                <button id="submit-create-plan">创建计划</button>
                <button class="secondary" id="reset-create-plan">清空</button>
              </div>
            </div>
            <div id="create-plan-result" class="empty">尚未创建计划。</div>
          </div>

          <div class="panel">
            <div class="section-head">
              <h2>计划与任务图</h2>
              <span class="pill" id="plans-count">0 plans</span>
            </div>
            <div id="plans-list" class="cards"></div>
          </div>

          <div class="panel">
            <div class="section-head">
              <h2>任务详情</h2>
              <span class="pill" id="task-badge">未选择</span>
            </div>
            <div id="task-detail" class="empty">选择一条任务后查看验收、指派、事件和人工介入记录。</div>
          </div>

          <div class="panel">
            <div class="section-head">
              <h2>知识对象 / 冲突 Review</h2>
              <span class="pill" id="knowledge-count">0 records</span>
            </div>
            <div id="knowledge-list" class="cards"></div>
          </div>
        </div>

        <div class="stack">
          <div class="panel">
            <div class="section-head">
              <h2>运行状态与告警</h2>
              <span class="pill">实时快照</span>
            </div>
            <div id="metrics-view" class="cards"></div>
          </div>

          <div class="panel">
            <div class="section-head">
              <h2>人工 Gate 操作面板</h2>
              <span class="pill">Approve / Reject / Note</span>
            </div>
            <div class="field-grid">
              <input id="gate-plan-id" placeholder="plan_id" />
              <input id="gate-task-id" placeholder="task_id / related_id" />
              <select id="gate-action">
                <option value="approve">approve</option>
                <option value="reject">reject</option>
                <option value="resolve">resolve</option>
              </select>
              <input id="gate-actor" placeholder="actor" value="console-operator" />
              <textarea id="gate-note" placeholder="备注（可选）"></textarea>
              <div class="actions">
                <button id="submit-gate">提交动作</button>
                <button class="secondary" id="refresh-all">刷新全部</button>
              </div>
            </div>
            <div id="gate-result" class="empty">尚未提交人工动作。</div>
          </div>
        </div>
      </section>
    </div>
    <script type="module" src="/console/app.js"></script>
  </body>
</html>`;
}

export function renderConsoleScript(): string {
  return `const state = {
  planId: null,
  taskId: null,
};

const els = {
  apiKey: document.getElementById("api-key"),
  projectId: document.getElementById("project-id"),
  humanGateKey: document.getElementById("human-gate-key"),
  saveAuth: document.getElementById("save-auth"),
  createRequest: document.getElementById("create-request"),
  createPhase: document.getElementById("create-phase"),
  createConstraints: document.getElementById("create-constraints"),
  createTargetModules: document.getElementById("create-target-modules"),
  submitCreatePlan: document.getElementById("submit-create-plan"),
  resetCreatePlan: document.getElementById("reset-create-plan"),
  createPlanResult: document.getElementById("create-plan-result"),
  refreshAll: document.getElementById("refresh-all"),
  plansList: document.getElementById("plans-list"),
  plansCount: document.getElementById("plans-count"),
  taskDetail: document.getElementById("task-detail"),
  taskBadge: document.getElementById("task-badge"),
  knowledgeList: document.getElementById("knowledge-list"),
  knowledgeCount: document.getElementById("knowledge-count"),
  metricsView: document.getElementById("metrics-view"),
  gatePlanId: document.getElementById("gate-plan-id"),
  gateTaskId: document.getElementById("gate-task-id"),
  gateAction: document.getElementById("gate-action"),
  gateActor: document.getElementById("gate-actor"),
  gateNote: document.getElementById("gate-note"),
  gateResult: document.getElementById("gate-result"),
  summaryStats: document.getElementById("summary-stats"),
  submitGate: document.getElementById("submit-gate"),
};

boot();

function boot() {
  hydrateAuth();
  els.saveAuth.addEventListener("click", () => {
    persistAuth();
    refreshAll();
  });
  els.submitCreatePlan.addEventListener("click", submitCreatePlan);
  els.resetCreatePlan.addEventListener("click", resetCreatePlanForm);
  els.refreshAll.addEventListener("click", refreshAll);
  els.submitGate.addEventListener("click", submitGateAction);
  refreshAll();
}

function hydrateAuth() {
  els.apiKey.value = localStorage.getItem("agentforge.apiKey") ?? "";
  els.projectId.value = localStorage.getItem("agentforge.projectId") ?? "";
  els.humanGateKey.value = localStorage.getItem("agentforge.humanGateKey") ?? "";
}

function persistAuth() {
  localStorage.setItem("agentforge.apiKey", els.apiKey.value.trim());
  localStorage.setItem("agentforge.projectId", els.projectId.value.trim());
  localStorage.setItem("agentforge.humanGateKey", els.humanGateKey.value.trim());
}

async function refreshAll() {
  await Promise.all([
    loadPlans(),
    loadKnowledge(),
    loadMetrics(),
  ]);

  if (state.taskId) {
    await loadTaskDetail(state.planId, state.taskId);
  }
}

function authHeaders(includeHumanGate = false) {
  const headers = {};
  if (els.apiKey.value.trim()) {
    headers.Authorization = 'Bearer ' + els.apiKey.value.trim();
  }
  if (els.projectId.value.trim()) {
    headers['x-project-id'] = els.projectId.value.trim();
  }
  if (includeHumanGate && els.humanGateKey.value.trim()) {
    headers['x-human-gate-key'] = els.humanGateKey.value.trim();
  }
  return headers;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...authHeaders(Boolean(options.includeHumanGate)),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }
  return await response.text();
}

async function loadPlans() {
  const data = await apiFetch('/api/plans');
  const plans = data.plans ?? [];
  els.plansCount.textContent = plans.length + ' plans';
  els.plansList.innerHTML = plans.length
    ? plans.map(renderPlanCard).join('')
    : '<div class="empty">暂无计划。</div>';

  els.plansList.querySelectorAll('[data-plan-id][data-task-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.planId = button.getAttribute('data-plan-id');
      state.taskId = button.getAttribute('data-task-id');
      els.gatePlanId.value = state.planId ?? '';
      els.gateTaskId.value = state.taskId ?? '';
      loadTaskDetail(state.planId, state.taskId);
    });
  });

  els.plansList.querySelectorAll('[data-run-plan-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const planId = button.getAttribute('data-run-plan-id');
      runPlan(planId);
    });
  });
}

function renderPlanCard(plan) {
  const tasks = (plan.tasks ?? []).map((task) => \`
    <tr>
      <td><span class="mono">\${task.taskId}</span></td>
      <td><span class="status \${task.status}">\${task.status}</span></td>
      <td>\${task.type}</td>
      <td><button class="secondary" data-plan-id="\${plan.planId}" data-task-id="\${task.taskId}">查看</button></td>
    </tr>
  \`).join('');

  return \`
    <div class="card">
      <div class="section-head">
        <h3>\${plan.planId}</h3>
        <div class="actions">
          <button data-run-plan-id="\${plan.planId}">运行计划</button>
        </div>
      </div>
      <p>\${plan.phase ?? 'unknown phase'} · 运行状态 \${plan.runStatus} · \${plan.request ?? '无请求摘要'}</p>
      <table>
        <thead>
          <tr><th>任务</th><th>状态</th><th>类型</th><th></th></tr>
        </thead>
        <tbody>\${tasks}</tbody>
      </table>
    </div>
  \`;
}

async function loadTaskDetail(planId, taskId) {
  if (!planId || !taskId) {
    return;
  }
  const data = await apiFetch('/api/tasks/' + encodeURIComponent(taskId) + '?planId=' + encodeURIComponent(planId));
  els.taskBadge.textContent = taskId;
  const acceptance = (data.acceptanceRuns ?? []).map((run) => \`
    <div class="card">
      <h3>验收 \${run.runId}</h3>
      <p><span class="status \${run.status}">\${run.status}</span> \${run.summary}</p>
    </div>
  \`).join('');
  const assignments = (data.assignments ?? []).map((assignment) => \`
    <div class="card">
      <h3>\${assignment.assignmentId}</h3>
      <p>\${assignment.executor} · \${assignment.status}</p>
    </div>
  \`).join('');
  const interventions = (data.humanInterventions ?? []).map((item) => \`
    <div class="card">
      <h3>\${item.interventionId}</h3>
      <p>\${item.type} · \${item.summary}</p>
    </div>
  \`).join('');
  const events = (data.events ?? []).map((event) => \`
    <div class="card">
      <h3>\${event.eventType}</h3>
      <p class="mono">\${event.createdAt}</p>
    </div>
  \`).join('');

  els.taskDetail.innerHTML = \`
    <div class="cards">
      <div class="card">
        <h3>\${data.task.title}</h3>
        <p><span class="status \${data.task.status}">\${data.task.status}</span> · \${data.task.type}</p>
        <p class="mono">\${data.task.goal}</p>
      </div>
      \${acceptance || '<div class="empty">暂无验收记录。</div>'}
      \${assignments || '<div class="empty">暂无指派记录。</div>'}
      \${interventions || '<div class="empty">暂无人工介入记录。</div>'}
      \${events || '<div class="empty">暂无事件记录。</div>'}
    </div>
  \`;
}

async function loadKnowledge() {
  const data = await apiFetch('/api/knowledge');
  const records = data.records ?? [];
  els.knowledgeCount.textContent = records.length + ' records';
  els.knowledgeList.innerHTML = records.length
    ? records.map((record) => \`
        <div class="card">
          <h3>\${record.knowledgeId}</h3>
          <p><span class="status \${record.status}">\${record.status}</span> v\${record.version} · \${record.scope}</p>
          <p>\${record.summary}</p>
          <p class="mono">\${record.recommendation}</p>
        </div>
      \`).join('')
    : '<div class="empty">暂无知识对象。</div>';
}

async function loadMetrics() {
  const snapshot = await apiFetch('/api/metrics/snapshot');
  const alerts = snapshot.alerts ?? [];
  els.summaryStats.innerHTML = [
    ['计划数', snapshot.businessMetrics.totalPlans],
    ['任务总数', snapshot.businessMetrics.totalTasks],
    ['已完成', snapshot.businessMetrics.completedTasks],
    ['验收通过率', (snapshot.businessMetrics.acceptancePassRate * 100).toFixed(1) + '%'],
  ].map(([label, value]) => \`<div class="stat"><span>\${label}</span><strong>\${value}</strong></div>\`).join('');

  els.metricsView.innerHTML = \`
    <div class="card">
      <h3>任务概览</h3>
      <p>blocked: \${snapshot.businessMetrics.blockedTasks} · waiting_human: \${snapshot.businessMetrics.waitingHumanTasks}</p>
    </div>
    \${(snapshot.executorMetrics ?? []).map((metric) => \`
      <div class="card">
        <h3>\${metric.executor}</h3>
        <p>runs: \${metric.runs} · duration: \${metric.durationMs}ms · cost: $\${metric.estimatedCostUsd.toFixed(4)}</p>
      </div>
    \`).join('')}
    \${alerts.length ? alerts.map((alert) => \`
      <div class="card">
        <h3>\${alert.code}</h3>
        <p><span class="status \${alert.severity === 'critical' ? 'FAILED_BLOCKED' : 'WAITING_HUMAN'}">\${alert.severity}</span> \${alert.summary}</p>
      </div>
    \`).join('') : '<div class="empty">当前无告警。</div>'}
  \`;
}

async function submitGateAction() {
  const payload = {
    planId: els.gatePlanId.value.trim() || undefined,
    taskId: els.gateTaskId.value.trim(),
    relatedId: els.gateTaskId.value.trim(),
    action: els.gateAction.value,
    actor: els.gateActor.value.trim() || 'console-operator',
    summary: els.gateNote.value.trim(),
  };
  try {
    const result = await apiFetch('/api/human-gates/actions', {
      method: 'POST',
      includeHumanGate: true,
      body: JSON.stringify(payload),
    });
    els.gateResult.textContent = JSON.stringify(result, null, 2);
    state.planId = payload.planId ?? state.planId;
    state.taskId = payload.taskId;
    await refreshAll();
  } catch (error) {
    els.gateResult.textContent = String(error);
  }
}

function parseCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resetCreatePlanForm() {
  els.createRequest.value = '';
  els.createPhase.value = 'phase-console';
  els.createConstraints.value = '';
  els.createTargetModules.value = '';
  els.createPlanResult.textContent = '已清空创建计划表单。';
}

async function submitCreatePlan() {
  const request = els.createRequest.value.trim();
  const phase = els.createPhase.value.trim() || 'phase-console';
  if (!request) {
    els.createPlanResult.textContent = '请先输入高层目标。';
    return;
  }

  const payload = {
    request,
    phase,
    projectId: els.projectId.value.trim() || undefined,
    constraints: parseCsv(els.createConstraints.value),
    targetModules: parseCsv(els.createTargetModules.value),
  };

  try {
    const result = await apiFetch('/api/plans', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    els.createPlanResult.textContent = JSON.stringify(result, null, 2);
    state.planId = result.planId ?? null;
    state.taskId = result.tasks?.[0]?.taskId ?? null;
    els.gatePlanId.value = state.planId ?? '';
    if (state.taskId) {
      els.gateTaskId.value = state.taskId;
    }
    await refreshAll();
    if (state.planId && state.taskId) {
      await loadTaskDetail(state.planId, state.taskId);
    }
  } catch (error) {
    els.createPlanResult.textContent = String(error);
  }
}

async function runPlan(planId) {
  if (!planId) {
    return;
  }

  try {
    const result = await apiFetch('/api/plans/' + encodeURIComponent(planId) + '/runs', {
      method: 'POST',
    });
    els.createPlanResult.textContent = '计划已运行:\\n' + JSON.stringify(result, null, 2);
    state.planId = planId;
    await refreshAll();
  } catch (error) {
    els.createPlanResult.textContent = String(error);
  }
}`;
}
