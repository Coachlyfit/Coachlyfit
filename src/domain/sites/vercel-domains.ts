// Custom domains through the Vercel Domains API: attach a coach's domain to
// this project, read whether DNS points at us, detach it. Server-only in
// practice (it holds the API token) but framework-free: plain fetch.
//
// Env: VERCEL_API_TOKEN, VERCEL_PROJECT_ID, and VERCEL_TEAM_ID for team
// projects. Without the first two, `isConfigured()` is false and the editor
// says so instead of pretending to connect.

export type DomainState = "pending" | "connected" | "error";

export type DomainStatus = {
  state: DomainState;
  /** DNS records the coach must create, when Vercel asks for any. */
  records: { type: string; name: string; value: string }[];
};

type Env = { token?: string; projectId?: string; teamId?: string };

const API = "https://api.vercel.com";

/** A valid hostname with at least one dot, lowercase. Mirrors coach_sites.domain's CHECK. */
export const DOMAIN_PATTERN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export function normalizeDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return DOMAIN_PATTERN.test(host) ? host : null;
}

export class VercelDomains {
  constructor(private env: Env = {
    token: process.env.VERCEL_API_TOKEN,
    projectId: process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID,
  }) {}

  isConfigured(): boolean {
    return !!this.env.token && !!this.env.projectId;
  }

  private async call(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
    const url = new URL(`${API}${path}`);
    if (this.env.teamId) url.searchParams.set("teamId", this.env.teamId);
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.env.token}`, "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body };
  }

  /** Attach the domain to the project. A 409 means it's already attached
   * somewhere; status() then tells whether that somewhere is this project. */
  async add(domain: string): Promise<boolean> {
    const res = await this.call(`/v10/projects/${this.env.projectId}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    });
    return res.ok || res.status === 409;
  }

  /** Is the domain attached, verified and pointing at Vercel? */
  async status(domain: string): Promise<DomainStatus> {
    const project = await this.call(`/v9/projects/${this.env.projectId}/domains/${domain}`);
    if (!project.ok) return { state: "error", records: [] };

    const verified = project.body.verified === true;
    const config = await this.call(`/v6/domains/${domain}/config`);
    const misconfigured = config.ok ? config.body.misconfigured === true : true;

    const verification = (project.body.verification as { type: string; domain: string; value: string }[] | undefined) ?? [];
    const records = [
      ...verification.map((v) => ({ type: v.type, name: v.domain, value: v.value })),
      ...(misconfigured && domain.split(".").length === 2 ? [{ type: "A", name: "@", value: "76.76.21.21" }] : []),
      ...(misconfigured && domain.split(".").length > 2 ? [{ type: "CNAME", name: domain.split(".")[0], value: "cname.vercel-dns.com" }] : []),
    ];

    return { state: verified && !misconfigured ? "connected" : "pending", records };
  }

  /** Ask Vercel to re-check a TXT verification. */
  async verify(domain: string): Promise<void> {
    await this.call(`/v9/projects/${this.env.projectId}/domains/${domain}/verify`, { method: "POST" });
  }

  async remove(domain: string): Promise<boolean> {
    const res = await this.call(`/v9/projects/${this.env.projectId}/domains/${domain}`, { method: "DELETE" });
    return res.ok || res.status === 404;
  }
}
