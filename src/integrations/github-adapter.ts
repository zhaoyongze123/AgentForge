import { AppError } from "../core/errors/app-error.js";
import type {
  GithubBranchSummary,
  GithubCheckSummary,
  GithubCreateBranchInput,
  GithubCreatePullRequestInput,
  GithubPullRequestSummary,
  GithubRepositoryRef,
  GithubRepositorySummary,
} from "../domain/external.js";

export interface GithubAdapterOptions {
  token?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface GithubPullDetails {
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
}

export class GithubAdapter {
  private readonly token?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GithubAdapterOptions = {}) {
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? "https://api.github.com").replace(
      /\/$/,
      "",
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getRepository(
    ref: GithubRepositoryRef,
  ): Promise<GithubRepositorySummary> {
    const payload = await this.request<{
      owner: { login: string };
      name: string;
      default_branch: string;
      private: boolean;
      html_url: string;
    }>(`/repos/${ref.owner}/${ref.repo}`);

    return {
      owner: payload.owner.login,
      repo: payload.name,
      defaultBranch: payload.default_branch,
      private: payload.private,
      url: payload.html_url,
    };
  }

  async listBranches(ref: GithubRepositoryRef): Promise<GithubBranchSummary[]> {
    const payload = await this.request<
      Array<{
        name: string;
        protected: boolean;
        commit: { sha: string };
      }>
    >(`/repos/${ref.owner}/${ref.repo}/branches`);

    return payload.map((branch) => ({
      name: branch.name,
      sha: branch.commit.sha,
      protected: branch.protected,
    }));
  }

  async listPullRequests(
    ref: GithubRepositoryRef,
    state: "open" | "closed" | "all" = "open",
  ): Promise<GithubPullRequestSummary[]> {
    const payload = await this.request<
      Array<{
        number: number;
        title: string;
        state: "open" | "closed";
        html_url: string;
        head: { ref: string; sha: string };
        base: { ref: string };
      }>
    >(`/repos/${ref.owner}/${ref.repo}/pulls?state=${state}`);

    return payload.map((pull) => ({
      number: pull.number,
      title: pull.title,
      state: pull.state,
      url: pull.html_url,
      headRef: pull.head.ref,
      baseRef: pull.base.ref,
      headSha: pull.head.sha,
    }));
  }

  async createBranch(
    input: GithubCreateBranchInput,
  ): Promise<GithubBranchSummary> {
    await this.request(`/repos/${input.owner}/${input.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${input.branch}`,
        sha: input.sha,
      }),
    });

    return {
      name: input.branch,
      sha: input.sha,
      protected: false,
    };
  }

  async createPullRequest(
    input: GithubCreatePullRequestInput,
  ): Promise<GithubPullRequestSummary> {
    const payload = await this.request<{
      number: number;
      title: string;
      state: "open" | "closed";
      html_url: string;
      head: { ref: string; sha: string };
      base: { ref: string };
    }>(`/repos/${input.owner}/${input.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
        draft: input.draft ?? false,
      }),
    });

    return {
      number: payload.number,
      title: payload.title,
      state: payload.state,
      url: payload.html_url,
      headRef: payload.head.ref,
      baseRef: payload.base.ref,
      headSha: payload.head.sha,
    };
  }

  async getPullRequestChecks(
    ref: GithubRepositoryRef & { pullNumber: number },
  ): Promise<GithubCheckSummary[]> {
    const pull = await this.request<GithubPullRequestSummary & GithubPullDetails>(
      `/repos/${ref.owner}/${ref.repo}/pulls/${ref.pullNumber}`,
    );

    const [statusPayload, checkRunsPayload] = await Promise.all([
      this.request<{
        statuses: Array<{
          context: string;
          state: "success" | "failure" | "pending";
          target_url?: string;
        }>;
      }>(`/repos/${ref.owner}/${ref.repo}/commits/${pull.head.sha}/status`),
      this.request<{
        check_runs: Array<{
          name: string;
          status: "queued" | "in_progress" | "completed";
          conclusion:
            | "success"
            | "failure"
            | "cancelled"
            | "neutral"
            | "skipped"
            | null;
          details_url?: string;
        }>;
      }>(`/repos/${ref.owner}/${ref.repo}/commits/${pull.head.sha}/check-runs`, {
        headers: {
          accept: "application/vnd.github+json",
        },
      }),
    ]);

    return [
      ...statusPayload.statuses.map((status) => ({
        name: status.context,
        status:
          status.state === "pending"
            ? ("in_progress" as const)
            : ("completed" as const),
        conclusion:
          status.state === "pending"
            ? null
            : status.state === "success"
              ? ("success" as const)
              : ("failure" as const),
        detailsUrl: status.target_url,
      })),
      ...checkRunsPayload.check_runs.map((run) => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        detailsUrl: run.details_url,
      })) satisfies GithubCheckSummary[],
    ];
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    if (!this.token) {
      throw new AppError({
        code: "CONFIG_MISSING",
        message: "GitHub 适配层需要提供 GITHUB_TOKEN。",
        details: { key: "GITHUB_TOKEN" },
      });
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        "user-agent": "agentforge",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new AppError({
        code: "EXTERNAL_UNAVAILABLE",
        message: "GitHub API 调用失败。",
        details: {
          path,
          status: response.status,
          body: await response.text(),
        },
      });
    }

    return (await response.json()) as T;
  }
}
