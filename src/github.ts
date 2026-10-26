// GitHub integration through an OAuth app: "Sign in with GitHub" (no scopes: public profile only) and
// checking a member's push access to a repo before letting them join the project linked to it.
// User tokens are used for the request at hand and never stored.

import type { Env } from "./lib";

export interface GitHubConfig {
  client_id: string;
  client_secret: string;
}

const API = "https://api.github.com";
const HEADERS = { accept: "application/vnd.github+json", "user-agent": "intercom", "x-github-api-version": "2022-11-28" };

export async function getSetting(env: Env, key: string): Promise<string | null> {
  return (await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>())?.value ?? null;
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();
}

/** The GitHub OAuth app, from the Worker's GITHUB_CLIENT_ID var and GITHUB_CLIENT_SECRET secret. */
export const githubConfig = (env: Env): GitHubConfig | null => env.github ?? null;

/** Anyone may create an account with GitHub. On by default once GitHub is configured; admins can turn it off. */
/** Anyone with GitHub may create an account: only when an admin turned it on. The default is invite-only. */
export async function openSignup(env: Env): Promise<boolean> {
  return !!env.github && (await getSetting(env, "open_signup")) === "1";
}

/**
 * Invite-only (the default): only admins bring people in, whether to the intercom or to a project: invite links,
 * adding by handle, approving join requests. Self-joining through GitHub repo access is off.
 */
export async function adminsInvite(env: Env): Promise<boolean> {
  return (await getSetting(env, "open_signup")) !== "1";
}

/** Sign-in asks for no scopes (public profile only). Checking access to a private repo needs "repo"; asked only on request. */
export const authorizeUrl = (cfg: GitHubConfig, origin: string, state: string, scope = "") =>
  `https://github.com/login/oauth/authorize?${new URLSearchParams({ client_id: cfg.client_id, redirect_uri: `${origin}/auth/github/callback`, state, scope, allow_signup: "true" })}`;

export async function exchangeCode(cfg: GitHubConfig, code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { ...HEADERS, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: cfg.client_id, client_secret: cfg.client_secret, code }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string };
  if (!body.access_token) throw new Error(body.error_description ?? "GitHub sign-in failed");
  return body.access_token;
}

export async function githubUser(token: string): Promise<{ id: number; login: string }> {
  const res = await fetch(`${API}/user`, { headers: { ...HEADERS, authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  const u = (await res.json()) as { id: number; login: string };
  return { id: u.id, login: u.login };
}

/** Can this user push to owner/repo? visible=false means GitHub won't show us the repo (private, app not installed). */
export async function pushAccess(token: string, login: string, repo: string): Promise<{ visible: boolean; push: boolean }> {
  const auth = { ...HEADERS, authorization: `Bearer ${token}` };
  const res = await fetch(`${API}/repos/${repo}`, { headers: auth });
  if (!res.ok) return { visible: false, push: false };
  const r = (await res.json()) as { permissions?: { push?: boolean; maintain?: boolean; admin?: boolean } };
  if (r.permissions) return { visible: true, push: !!(r.permissions.push || r.permissions.maintain || r.permissions.admin) };
  const p = await fetch(`${API}/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`, { headers: auth });
  if (!p.ok) return { visible: true, push: false };
  const perm = ((await p.json()) as { permission?: string }).permission;
  return { visible: true, push: perm === "admin" || perm === "maintain" || perm === "write" };
}

/** "acme/billing-api" from a git remote or user input; null if it isn't a GitHub repo name. */
export function githubRepo(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().replace(/\.git$/, "").replace(/^(https?:\/\/|git@|ssh:\/\/git@)?github\.com[/:]/i, "");
  const m = s.match(/^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

/**
 * An invite link that can still be used: unexpired, uses left, and (while invite-only) made by an admin. Links
 * project owners made before invite-only stop working.
 */
export async function usableInvite<T = Record<string, unknown>>(env: Env, code: string): Promise<T | null> {
  const adminsOnly = await adminsInvite(env);
  return env.DB.prepare(
    `SELECT i.* FROM invites i WHERE i.code = ?1 AND i.uses_left > 0 AND i.expires_at > ?2
       AND (?3 = 0 OR EXISTS (SELECT 1 FROM members m WHERE m.name = i.created_by AND m.is_admin = 1))`,
  )
    .bind(code, Date.now(), adminsOnly ? 1 : 0)
    .first<T>();
}
