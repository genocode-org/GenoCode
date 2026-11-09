// The relay: a Cloudflare Worker that takes a creature shared from the app and files it as a
// GitHub issue, so people can share without a GitHub account. It holds the only token, which can
// do nothing but write issues. Turnstile (Cloudflare's check that a person is there) and a limit
// per visitor keep robots out; the creature is checked properly once it's an issue.

import { asShare, issueBody, issueTitle, LABEL, LIMITS, problems } from "./share.js";

/** A Workers rate-limit binding. */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  /** A fine-grained GitHub token that may only write issues on `REPO`. */
  GITHUB_TOKEN: string;
  /** Turnstile's secret key. */
  TURNSTILE_SECRET: string;
  /** Where issues go, as `owner/name`. */
  REPO: string;
  /** The pages allowed to send, comma separated, such as `https://genocode.piorek.co.za`. */
  ALLOWED_ORIGINS: string;
  /** How many shares one visitor may send in a while (set up in wrangler.toml). */
  SHARES?: RateLimit;
}

type Http = (input: string, init?: RequestInit) => Promise<Response>;

/** Room for the largest share, written out as JSON, with the Turnstile token. */
const MOST_BYTES = 4 * (LIMITS.code + LIMITS.description + LIMITS.name + LIMITS.author) + 8192;

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env, (input, init) => fetch(input, init));
  },
};

export async function handle(request: Request, env: Env, http: Http): Promise<Response> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  const cors: Record<string, string> = allowed.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : {};
  const answer = (status: number, body: object) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...cors },
    });
  const fail = (status: number, error: string) => answer(status, { error });

  const path = new URL(request.url).pathname;
  if (path !== "/share") return fail(404, "There's nothing here.");
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  if (request.method !== "POST") return fail(405, "Creatures are shared with POST.");
  if (!cors["Access-Control-Allow-Origin"]) return fail(403, "Share from the GenoCode app.");

  const visitor = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (env.SHARES && !(await env.SHARES.limit({ key: visitor })).success) {
    return fail(429, "That's a lot of sharing. Please wait a few minutes and try again.");
  }

  const text = await request.text();
  if (text.length > MOST_BYTES) return fail(413, "This creature is too big to share.");
  let sent: unknown;
  try {
    sent = JSON.parse(text);
  } catch {
    return fail(400, "The share didn't arrive in one piece. Please try again.");
  }
  const wrong = problems(sent);
  if (wrong.length > 0) return answer(400, { error: wrong.join(" "), problems: wrong });
  const share = asShare(sent)!;

  const token = (sent as { turnstile?: unknown }).turnstile;
  if (typeof token !== "string" || !(await isPerson(token, visitor, env, http))) {
    return fail(403, "We couldn't tell that a person sent this. Please try again.");
  }

  const filed = await http(`https://api.github.com/repos/${env.REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "genocode-share-relay",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: issueTitle(share), body: issueBody(share), labels: [LABEL] }),
  });
  if (!filed.ok) return fail(502, "Sharing isn't working just now. Please try again later.");
  const issue = (await filed.json()) as { number: number; html_url: string };
  return answer(201, { issue: issue.number, url: issue.html_url });
}

async function isPerson(token: string, visitor: string, env: Env, http: Http): Promise<boolean> {
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (visitor !== "unknown") form.set("remoteip", visitor);
  const r = await http("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  if (!r.ok) return false;
  return ((await r.json()) as { success?: boolean }).success === true;
}
