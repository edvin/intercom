// Sign-in with GitHub, open registration, browser-approved setup ("device" flow), and finding projects
// without an invite: by GitHub repo access, or by asking a project's owners.

import { authorizeUrl, exchangeCode, githubConfig, githubRepo, githubUser, openSignup, pushAccess } from "./github";
import { type Env, freeHandle, issueToken, limit, myProjects, newToken, normChannel, postMessage, rateLimit, sha256, authenticate } from "./lib";
import { GITHUB_ICON, LOGO, avatar, codeBlock, esc, hidden, html, icon, page, redirect } from "./ui";
import { loginPage, safeNext, sameOrigin, sessionCookie } from "./web";

const MIN = 60_000;
const STATE_COOKIE = "intercom_oauth";

const solo = (title: string, body: string, status = 200, headers: Record<string, string> = {}) =>
  html(page(`Intercom · ${title}`, `<main class="solo"><div class="card wide"><div class="bd stack" style="padding:32px">${body}</div></div></main>`), status, { "cache-control": "no-store", ...headers });

const cookieValue = (req: Request, name: string) => (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null;

// ---------- GitHub OAuth ----------

type Purpose = "signin" | "link" | "discover";

/** GET /auth/github?purpose=…&next=…&repo=…&private=1 → GitHub's consent screen. */
export async function githubStart(req: Request, env: Env, url: URL): Promise<Response> {
  const cfg = githubConfig(env);
  if (!cfg) return loginPage("GitHub sign-in isn't set up on this instance.");
  const purpose = (["link", "discover"].includes(url.searchParams.get("purpose") ?? "") ? url.searchParams.get("purpose") : "signin") as Purpose;
  const me = await authenticate(req, env);
  if (purpose !== "signin" && !me) return redirect("/login");
  if (env.ip && !(await rateLimit(env, `oauth:ip:${env.ip}`, 30, 10 * MIN))) return loginPage("Too many sign-in attempts. Try again in a few minutes.");
  const state = newToken();
  const data = JSON.stringify({ next: safeNext(url.searchParams.get("next")), repo: githubRepo(url.searchParams.get("repo")) });
  await env.DB.prepare("INSERT INTO oauth_states (state, purpose, data, member, expires_at) VALUES (?, ?, ?, ?, ?)").bind(state, purpose, data, me, Date.now() + 10 * MIN).run();
  // Reading a private repo's permissions needs the "repo" scope: only when the user explicitly asks.
  const scope = purpose === "discover" && url.searchParams.get("private") === "1" ? "repo" : "";
  return redirect(authorizeUrl(cfg, url.origin, state, scope), {
    "set-cookie": `${STATE_COOKIE}=${state}; Path=/auth/github; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  });
}

/** GET /auth/github/callback: finish sign-in, account linking, or a repo-access check. */
export async function githubCallback(req: Request, env: Env, url: URL): Promise<Response> {
  const cfg = githubConfig(env);
  const state = url.searchParams.get("state") ?? "";
  const row = state ? await env.DB.prepare("DELETE FROM oauth_states WHERE state = ? RETURNING *").bind(state).first<{ purpose: Purpose; data: string; member: string | null; expires_at: number }>() : null;
  // The state must be ours, fresh, and started in this browser (no login CSRF).
  if (!cfg || !row || row.expires_at < Date.now() || cookieValue(req, STATE_COOKIE) !== state) {
    console.error("github oauth state", JSON.stringify({ row: !!row, cookie: !!cookieValue(req, STATE_COOKIE) }));
    return loginPage("That sign-in link expired. Please try again.", "", !!cfg);
  }
  const { next, repo } = JSON.parse(row.data) as { next: string; repo: string | null };
  const clear = { "set-cookie": `${STATE_COOKIE}=; Path=/auth/github; HttpOnly; Secure; SameSite=Lax; Max-Age=0` };
  const ghError = url.searchParams.get("error");
  if (ghError) {
    const why = ghError === "access_denied" ? "GitHub sign-in was cancelled." : `GitHub said: ${url.searchParams.get("error_description") ?? ghError}`;
    if (row.purpose === "signin") return loginPage(why, next, true);
    return redirect(row.purpose === "link" ? `/account?err=${encodeURIComponent(why)}` : `/discover?${repo ? `repo=${repo}&` : ""}err=${encodeURIComponent(why)}`, clear);
  }

  let token: string;
  let gh: { id: number; login: string };
  try {
    token = await exchangeCode(cfg, url.searchParams.get("code") ?? "");
    gh = await githubUser(token);
  } catch (e) {
    console.error("github oauth", (e as Error).message);
    const why = `GitHub sign-in failed: ${(e as Error).message}`;
    if (row.purpose === "link") return redirect(`/account?err=${encodeURIComponent(why)}`, clear);
    return loginPage(why, next, true);
  }
  const owner = await env.DB.prepare("SELECT name FROM members WHERE github_id = ?").bind(gh.id).first<{ name: string }>();
  const me = await authenticate(req, env);

  // Attach this GitHub account to the signed-in member, unless another member already has it.
  const link = async (member: string): Promise<string | null> => {
    if (owner && owner.name !== member) {
      // A duplicate made by signing up with GitHub instead of connecting it: if it's still empty, fold it in.
      const used = await env.DB.prepare("SELECT 1 FROM project_members WHERE member = ?1 UNION ALL SELECT 1 FROM messages WHERE sender = ?1 LIMIT 1").bind(owner.name).first();
      if (used) return `@${gh.login} is already connected to the Intercom account "${owner.name}". Sign in to that one, disconnect GitHub there, and try again.`;
      await env.DB.batch([
        env.DB.prepare("DELETE FROM members WHERE name = ?").bind(owner.name),
        env.DB.prepare("DELETE FROM tokens WHERE member = ?").bind(owner.name),
        env.DB.prepare("DELETE FROM presence WHERE member = ?").bind(owner.name),
        env.DB.prepare("DELETE FROM sessions WHERE member = ?").bind(owner.name),
        env.DB.prepare("DELETE FROM join_requests WHERE member = ?").bind(owner.name),
      ]);
    }
    await env.DB.prepare("UPDATE members SET github_id = ?, github_login = ? WHERE name = ? AND (github_id IS NULL OR github_id = ?)").bind(gh.id, gh.login, member, gh.id).run();
    return null;
  };

  if (row.purpose === "link") {
    if (!me || me !== row.member) return redirect("/login", clear);
    const err = await link(me);
    return redirect(`/account?${err ? "err" : "ok"}=${encodeURIComponent(err ?? `Connected GitHub (@${gh.login})`)}`, clear);
  }

  if (row.purpose === "discover") {
    if (!me || me !== row.member || !repo) return redirect("/discover", clear);
    if (!owner) await link(me);
    const access = await pushAccess(token, gh.login, repo);
    if (access.push) {
      await env.DB.prepare("INSERT INTO repo_access (member, repo, expires_at) VALUES (?, ?, ?) ON CONFLICT(member, repo) DO UPDATE SET expires_at = excluded.expires_at")
        .bind(me, repo, Date.now() + 30 * MIN)
        .run();
      return redirect(`/discover?repo=${repo}`, clear);
    }
    return redirect(access.visible ? `/discover?repo=${repo}&err=${encodeURIComponent(`@${gh.login} doesn't have push access to ${repo}.`)}` : `/discover?repo=${repo}&private=1`, clear);
  }

  // Sign in.
  if (owner) return signedIn(env, owner.name, next || "/", clear);
  if (me) {
    const err = await link(me);
    return redirect(`${next || "/"}${(next || "/").includes("?") ? "&" : "?"}${err ? "err" : "ok"}=${encodeURIComponent(err ?? `Connected GitHub (@${gh.login})`)}`, clear);
  }
  const invited = next.startsWith("/join/") && !!(await env.DB.prepare("SELECT 1 FROM invites WHERE code = ? AND uses_left > 0 AND expires_at > ?").bind(next.slice(6), Date.now()).first());
  if (!invited && !(await openSignup(env))) return loginPage("Accounts on this instance are invite-only. Open the invite link you were sent and continue with GitHub from there.", next, true);
  if (!(await rateLimit(env, `signup:ip:${env.ip ?? "?"}`, 5, 60 * MIN)) || !(await rateLimit(env, "signup:all", 200, 24 * 60 * MIN))) {
    return loginPage("Too many new accounts right now. Try again later.", next, true);
  }
  // Ask first: people with an existing (token) account should connect GitHub to it instead.
  const pending = newToken();
  await env.DB.prepare("INSERT INTO oauth_states (state, purpose, data, expires_at) VALUES (?, 'create', ?, ?)")
    .bind(pending, JSON.stringify({ id: gh.id, login: gh.login, next }), Date.now() + 10 * MIN)
    .run();
  const name = await freeHandle(env, gh.login);
  return solo(
    "new account",
    `<div>${LOGO}</div>
    <div><p class="small muted" style="margin:0">${GITHUB_ICON} @${esc(gh.login)}</p><h1 class="headline">Create a new account?</h1></div>
    <p class="muted">There's no Intercom account connected to this GitHub account yet. We'll create <b>${esc(name)}</b> for you.</p>
    <form method="post" action="/auth/github/create" data-native>${hidden({ pending })}<button class="btn primary" style="width:100%;height:42px">${icon("userPlus", 15)} Create account “${esc(name)}”</button></form>
    <div class="card" style="padding:14px;box-shadow:none"><b>Already have an Intercom account?</b><p class="small muted" style="margin:6px 0 10px">Sign in with your token (or <code>/intercom dashboard</code> in Claude Code), then connect GitHub under Account, so you don't end up with two accounts.</p>
      <a class="btn sm" href="/login?next=/account">Sign in with a token</a></div>`,
    200,
    clear,
  );
}

/** POST /auth/github/create: confirmed sign-up after a GitHub sign-in. */
export async function githubCreate(req: Request, env: Env): Promise<Response> {
  if (!sameOrigin(req)) return new Response("Cross-origin request refused", { status: 403 });
  const form = await req.formData();
  const row = await env.DB.prepare("DELETE FROM oauth_states WHERE state = ? AND purpose = 'create' RETURNING data, expires_at").bind(String(form.get("pending") ?? "")).first<{ data: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return loginPage("That sign-up expired. Please continue with GitHub again.", "", true);
  const { id, login, next } = JSON.parse(row.data) as { id: number; login: string; next: string };
  const taken = await env.DB.prepare("SELECT name FROM members WHERE github_id = ?").bind(id).first<{ name: string }>();
  if (taken) return signedIn(env, taken.name, next || "/", {});
  const name = await freeHandle(env, login);
  await env.DB.prepare("INSERT INTO members (name, token_hash, created_at, org, github_id, github_login) VALUES (?, ?, ?, '', ?, ?)")
    .bind(name, await sha256(newToken()), Date.now(), id, login)
    .run();
  return signedIn(env, name, next || "/?welcome=1", {});
}

async function signedIn(env: Env, member: string, to: string, extra: Record<string, string>): Promise<Response> {
  const token = await issueToken(env, member, "web", "browser");
  const headers: [string, string][] = [["location", to], ["set-cookie", sessionCookie(token)]];
  if (extra["set-cookie"]) headers.push(["set-cookie", extra["set-cookie"]]);
  return new Response(null, { status: 303, headers });
}

/** Sign out: also forget a browser session token. */
export async function signOut(req: Request, env: Env): Promise<void> {
  const token = cookieValue(req, "intercom_token");
  if (token) await env.DB.prepare("DELETE FROM tokens WHERE token_hash = ? AND kind = 'web'").bind(await sha256(decodeURIComponent(token))).run();
}

// ---------- browser-approved setup ----------

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const userCode = () => {
  const b = crypto.getRandomValues(new Uint8Array(8));
  const c = [...b].map((x) => ALPHABET[x % ALPHABET.length]).join("");
  return `${c.slice(0, 4)}-${c.slice(4)}`;
};

/** POST /api/cli/start: the setup script asks for a code, then polls while the user approves it in the browser. */
export async function cliStart(env: Env, origin: string): Promise<Response> {
  if (!(await rateLimit(env, `cli:ip:${env.ip ?? "?"}`, 20, 60 * MIN))) return Response.json({ error: "rate limited" }, { status: 429 });
  const code = newToken();
  const uc = userCode();
  await env.DB.prepare("INSERT INTO device_codes (code, user_code, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(code, uc, Date.now(), Date.now() + 10 * MIN).run();
  return Response.json({ code, user_code: uc, url: `${origin}/connect?c=${uc}`, interval: 2, expires_in: 600 });
}

/** GET /api/cli/poll?code=…: pending until approved; the token is handed out exactly once. */
export async function cliPoll(env: Env, code: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM device_codes WHERE code = ?").bind(code).first<{ member: string | null; token: string | null; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return Response.json({ status: "expired" }, { status: 404 });
  if (!row.token) return Response.json({ status: "pending" });
  await env.DB.prepare("DELETE FROM device_codes WHERE code = ?").bind(code).run();
  return Response.json({ status: "approved", token: row.token, name: row.member });
}

/** /connect?c=ABCD-EFGH: approve (or refuse) a setup running in a terminal. */
export async function connectPage(req: Request, env: Env, me: string, url: URL): Promise<Response> {
  const uc = (url.searchParams.get("c") ?? "").toUpperCase();
  const row = await env.DB.prepare("SELECT * FROM device_codes WHERE user_code = ? AND expires_at > ?").bind(uc, Date.now()).first<{ code: string; token: string | null }>();
  if (!row) return solo("connect", `<div>${LOGO}</div><h1 class="headline">Code expired</h1><p class="muted">This setup code is no longer valid. Run the setup command again to get a new one.</p>`, 404);
  if (req.method === "POST") {
    if (!sameOrigin(req)) return new Response("Cross-origin request refused", { status: 403 });
    const form = await req.formData();
    if (form.get("action") !== "approve") {
      await env.DB.prepare("DELETE FROM device_codes WHERE code = ?").bind(row.code).run();
      return solo("connect", `<div>${LOGO}</div><h1 class="headline">Refused</h1><p class="muted">The terminal won't be connected. If you didn't start this, nothing else is needed.</p>`);
    }
    const token = await issueToken(env, me, "cli", `setup ${new Date().toISOString().slice(0, 10)}`);
    await env.DB.prepare("UPDATE device_codes SET member = ?, token = ? WHERE code = ?").bind(me, token, row.code).run();
    return solo(
      "connected",
      `<div class="row">${avatar(me, "l")}<div><p class="small muted" style="margin:0">${icon("check", 13)} Approved</p><h1 class="headline">You're connected</h1></div></div>
      <p class="muted">Go back to your terminal: the setup finishes by itself. Then restart Claude Code and type <code>/intercom</code>.</p>
      <div class="row"><a class="btn primary" href="/">${icon("arrow", 15)}Open the dashboard</a></div>`,
    );
  }
  if (row.token) return solo("connect", `<h1 class="headline">Already approved</h1><p class="muted">Go back to your terminal.</p>`);
  return solo(
    "connect",
    `<div>${LOGO}</div>
    <div><p class="small muted" style="margin:0">${icon("terminal", 13)} Connect Claude Code</p><h1 class="headline">Approve this terminal?</h1></div>
    <p class="muted">A setup running in a terminal wants to sign in to Intercom as <b>${esc(me)}</b>. Check that it shows the same code:</p>
    <div style="font:600 30px/1 'Geist Mono',monospace;letter-spacing:.12em;text-align:center;padding:18px;border-radius:14px;background:var(--surface-2);border:1px solid var(--line)">${esc(uc)}</div>
    <p class="small muted">Only approve if you just ran the setup yourself.</p>
    <form method="post" data-native class="row">${hidden({ action: "approve" })}<button class="btn primary">${icon("check", 15)}Approve</button></form>
    <form method="post" data-native>${hidden({ action: "refuse" })}<button class="btn ghost sm">That wasn't me</button></form>`,
  );
}

// ---------- discovery: join by repo access, or ask to join ----------

/** GET /discover: find projects to join without an invite link. */
export async function discoverPage(env: Env, me: string, url: URL): Promise<Response> {
  const repo = githubRepo(url.searchParams.get("repo"));
  const err = url.searchParams.get("err");
  const ok = url.searchParams.get("ok");
  const cfg = githubConfig(env);
  const mine = new Set(await myProjects(env, me));
  let repoSection = "";
  if (cfg) {
    let result = "";
    if (repo) {
      const access = await env.DB.prepare("SELECT 1 FROM repo_access WHERE member = ? AND repo = ? AND expires_at > ?").bind(me, repo, Date.now()).first();
      if (access) {
        const { results } = await env.DB.prepare("SELECT p.name, p.description FROM projects p WHERE EXISTS (SELECT 1 FROM json_each(p.github_repos) WHERE lower(value) = ?) ORDER BY p.name")
          .bind(repo)
          .all<{ name: string; description: string }>();
        result = results.length
          ? results
              .map(
                (p) => `<div class="row card" style="padding:12px 14px;box-shadow:none">${icon("hash", 16)}<div class="grow"><b>${esc(p.name)}</b>${p.description ? `<div class="small muted">${esc(p.description)}</div>` : ""}</div>
                ${mine.has(p.name) ? `<a class="btn sm" href="/?channel=${encodeURIComponent(p.name)}">Open</a>` : `<form method="post" action="/discover/join" data-native>${hidden({ project: p.name, repo })}<button class="btn primary sm">${icon("userPlus", 14)}Join</button></form>`}</div>`,
              )
              .join("")
          : `<p class="muted small">You have push access to <b>${esc(repo)}</b>, but no project is linked to it yet. A project owner can add it under Edit → GitHub repos.</p>`;
      } else if (url.searchParams.get("private") === "1") {
        result = `<div class="card" style="padding:14px;box-shadow:none"><p style="margin-top:0">GitHub didn't show us <b>${esc(repo)}</b>. If it's private, Intercom needs GitHub's <i>repo</i> permission to read your access level. The token is used once, for this check, and never stored.</p>
          <a class="btn primary sm" href="/auth/github?purpose=discover&private=1&repo=${encodeURIComponent(repo)}">${GITHUB_ICON} Check private repo access</a></div>`;
      } else {
        result = `<a class="btn primary" href="/auth/github?purpose=discover&repo=${encodeURIComponent(repo)}">${GITHUB_ICON} Check my access to ${esc(repo)}</a>`;
      }
    }
    repoSection = `<div><h3>${icon("link", 15)} Join through a GitHub repo</h3>
      <p class="small muted">Projects can be linked to GitHub repos. If you can push to one, you can join its project directly.</p>
      <form method="get" action="/discover" class="row" data-native><input name="repo" class="grow mono" placeholder="owner/repo, e.g. acme/billing-api" value="${esc(repo ?? "")}" required><button class="btn">Look up</button></form>
      ${result ? `<div class="stack" style="margin-top:12px">${result}</div>` : ""}</div>`;
  }
  const { results: pending } = await env.DB.prepare("SELECT project, created_at FROM join_requests WHERE member = ? ORDER BY created_at DESC").bind(me).all<{ project: string; created_at: number }>();
  return solo(
    "find projects",
    `<div><p class="small muted" style="margin:0">${icon("users", 13)} Find projects</p><h1 class="headline">Join your team</h1>
    <p class="muted">The quickest way in is an invite link from a project owner. No link? Try these:</p></div>
    ${err ? `<div class="toast err" style="box-shadow:none">${icon("x")}<span>${esc(err)}</span></div>` : ""}${ok ? `<div class="toast" style="box-shadow:none">${icon("check")}<span>${esc(ok)}</span></div>` : ""}
    ${repoSection}
    <div><h3>${icon("hash", 15)} Ask to join by name</h3>
      <p class="small muted">If the project accepts requests, its owners are asked to approve you. Projects stay private: you'll get the same answer whether or not a project exists.</p>
      <form method="post" action="/discover/request" class="stack" data-native>
        <div class="row"><input name="project" class="grow" placeholder="project name, e.g. billing" required><button class="btn">${icon("send", 14)}Ask to join</button></div>
        <input name="note" style="width:100%" placeholder="Optional note for the owners, e.g. “Dominic from Acme, working on payments”" maxlength="200">
      </form>
      ${pending.length ? `<p class="small muted">Waiting for approval: ${pending.map((p) => `#${esc(p.project)}`).join(", ")}</p>` : ""}</div>
    <div class="row"><a class="btn ghost" href="/">${icon("arrow", 15)}Dashboard</a></div>`,
  );
}

/** POST /discover/join: join a project linked to a repo you've just proven push access to. */
export async function discoverJoin(req: Request, env: Env, me: string): Promise<Response> {
  if (!sameOrigin(req)) return new Response("Cross-origin request refused", { status: 403 });
  const form = await req.formData();
  const project = normChannel(form.get("project"), "");
  const repo = githubRepo(String(form.get("repo") ?? ""));
  const ok =
    repo &&
    (await env.DB.prepare("SELECT 1 FROM repo_access WHERE member = ? AND repo = ? AND expires_at > ?").bind(me, repo, Date.now()).first()) &&
    (await env.DB.prepare("SELECT 1 FROM projects p WHERE name = ? AND EXISTS (SELECT 1 FROM json_each(p.github_repos) WHERE lower(value) = ?)").bind(project, repo).first());
  if (!ok) return redirect(`/discover?err=${encodeURIComponent("Check your repo access again, then join.")}`);
  const res = await env.DB.prepare("INSERT INTO project_members (project, member, role, added_by, created_at) VALUES (?, ?, 'member', ?, ?) ON CONFLICT(project, member) DO NOTHING")
    .bind(project, me, `github:${repo}`, Date.now())
    .run();
  if (res.meta.changes) await postMessage(env, { channel: project, sender: me, kind: "event", body: `joined #${project} (push access to ${repo})` });
  await env.DB.prepare("DELETE FROM join_requests WHERE project = ? AND member = ?").bind(project, me).run();
  return redirect(`/?channel=${encodeURIComponent(project)}&ok=${encodeURIComponent(`You joined #${project}`)}`);
}

/** POST /discover/request: ask a discoverable project's owners to let you in. */
export async function discoverRequest(req: Request, env: Env, me: string): Promise<Response> {
  if (!sameOrigin(req)) return new Response("Cross-origin request refused", { status: 403 });
  const form = await req.formData();
  const project = normChannel(form.get("project"), "");
  const note = String(form.get("note") ?? "").trim().slice(0, 200);
  try {
    await limit(env, `request:${me}`, 20, 24 * 60 * MIN, "join requests");
  } catch (e) {
    return redirect(`/discover?err=${encodeURIComponent((e as Error).message)}`);
  }
  const generic = `If #${project} accepts requests, its owners have been asked to approve you.`;
  if (!project) return redirect("/discover");
  if ((await myProjects(env, me)).includes(project)) return redirect(`/?channel=${encodeURIComponent(project)}`);
  const p = await env.DB.prepare("SELECT name FROM projects WHERE name = ? AND discoverable = 1").bind(project).first();
  if (p) {
    const fresh = await env.DB.prepare("INSERT INTO join_requests (project, member, note, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(project, member) DO NOTHING").bind(project, me, note, Date.now()).run();
    if (fresh.meta.changes) {
      const { results: owners } = await env.DB.prepare("SELECT member FROM project_members WHERE project = ? AND role = 'owner'").bind(project).all<{ member: string }>();
      for (const o of owners) {
        await postMessage(env, {
          channel: project,
          sender: me,
          recipient: o.member,
          kind: "event",
          body: `asked to join #${project}${note ? ` — “${note}”` : ""}. Approve or decline on the dashboard, or with the join_requests tool.`,
        });
      }
    }
  }
  return redirect(`/discover?ok=${encodeURIComponent(generic)}`);
}

