import { describe, expect, it } from "vitest";
import { handle, type Env } from "./relay.js";
import { readIssue } from "./share.js";

const share = {
  name: "Wiggle",
  author: "Sam",
  description: "A worm that dances.",
  code: "creature Wiggle\nball()\n",
  turnstile: "token",
};

const env: Env = {
  GITHUB_TOKEN: "secret",
  TURNSTILE_SECRET: "turnstile-secret",
  REPO: "genocode-org/GenoCode",
  ALLOWED_ORIGINS: "https://genocode.piorek.co.za, http://localhost:4173",
};

/** A pretend Turnstile and GitHub, remembering what was sent to them. */
function world(options: { person?: boolean; github?: number } = {}) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const http = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("turnstile")) return Response.json({ success: options.person ?? true });
    return Response.json(
      { number: 12, html_url: "https://github.com/genocode-org/GenoCode/issues/12" },
      { status: options.github ?? 201 },
    );
  };
  return { calls, http };
}

const post = (body: unknown, origin = "https://genocode.piorek.co.za") =>
  new Request("https://share.example/share", {
    method: "POST",
    headers: { Origin: origin, "CF-Connecting-IP": "1.2.3.4" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("the relay", () => {
  it("files a share as an issue labelled community", async () => {
    const { calls, http } = world();
    const r = await handle(post(share), env, http);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({
      issue: 12,
      url: "https://github.com/genocode-org/GenoCode/issues/12",
    });
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("https://genocode.piorek.co.za");
    const github = calls.find((c) => c.url.includes("api.github.com"))!;
    expect(github.url).toBe("https://api.github.com/repos/genocode-org/GenoCode/issues");
    const sent = JSON.parse(github.init!.body as string) as { labels: string[]; body: string };
    expect(sent.labels).toEqual(["community"]);
    const { turnstile: _, ...expected } = share;
    expect(readIssue(sent.body)).toEqual(expected);
    expect((github.init!.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("answers the browser's question before a share", async () => {
    const r = await handle(
      new Request("https://share.example/share", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:4173" },
      }),
      env,
      world().http,
    );
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4173");
  });

  it("turns away other pages, robots and broken shares without filing anything", async () => {
    const cases = [
      { request: post(share, "https://evil.example"), status: 403 },
      { request: post("{not json"), status: 400 },
      { request: post({ ...share, author: "@octocat" }), status: 400 },
      { request: post({ ...share, turnstile: undefined }), status: 403 },
      { request: post("x".repeat(200_000)), status: 413 },
      {
        request: new Request("https://share.example/share", {
          method: "POST",
          headers: { Origin: "https://genocode.piorek.co.za", "Content-Length": "5000000" },
          body: JSON.stringify(share),
        }),
        status: 413,
      },
      { request: new Request("https://share.example/other"), status: 404 },
    ];
    for (const { request, status } of cases) {
      const { calls, http } = world();
      const r = await handle(request, env, http);
      expect(r.status).toBe(status);
      expect(calls.some((c) => c.url.includes("api.github.com"))).toBe(false);
    }
  });

  it("turns away a robot that Turnstile caught", async () => {
    const { calls, http } = world({ person: false });
    expect((await handle(post(share), env, http)).status).toBe(403);
    expect(calls.some((c) => c.url.includes("api.github.com"))).toBe(false);
  });

  it("stops a visitor who shares too often", async () => {
    const limited: Env = { ...env, SHARES: { limit: async () => ({ success: false }) } };
    const { calls, http } = world();
    expect((await handle(post(share), limited, http)).status).toBe(429);
    expect(calls).toEqual([]);
  });

  it("says so when GitHub won't take it", async () => {
    const r = await handle(post(share), env, world({ github: 500 }).http);
    expect(r.status).toBe(502);
  });
});
