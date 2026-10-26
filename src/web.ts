import { type Delivery, type Env, type Lock, deliveryMarks, type Message, type Project, type Proposal, MAX_BODY, MEMBER_OF, RECEIVES, activeLocks, address, authenticate, coMembers, isAdmin, myProjects, normChannel, postMessage, roleIn, sha256, workingOn, newToken, HANDLE, limit, UserError } from "./lib";
import { agentsView } from "./agents";
import { pendingApprovals } from "./approvals";
import { openSignup, setSetting } from "./github";
import { tools } from "./tools";
import { GITHUB_ICON, LOGO, avatar, codeBlock, deliveryMark, esc, hidden, html, icon, md, page, redirect, time } from "./ui";

export const COOKIE = "intercom_token";

/** The one setup command, with the token filled in (it lands in shell history, which only you can read). */
const SETUP = (origin: string, token: string) => `curl -fsSL ${origin}/setup.sh | sh -s -- ${token}`;

/** Everything someone needs after getting a token. */
function setupSteps(origin: string, token: string): string {
  return `<div><h3>Connect Claude Code</h3><p class="small muted">Run this in a terminal (macOS or Linux). It checks <code>node</code> (22 or newer), installs the Claude Code plugin and stores your token.</p>${codeBlock(SETUP(origin, token))}
    <p class="tiny muted">Prefer not to have the token in your shell history? Run <code>curl -fsSL ${esc(origin)}/setup.sh | sh</code> and paste it when asked. No <code>claude</code> CLI on your PATH? In Claude Code: <code>/plugin install intercom --marketplace edvin/intercom</code>.</p></div>
    <div><h3>Then restart Claude Code</h3><p class="small muted">Type <code>/intercom</code> to see your team, locks and votes, and <code>/intercom dashboard</code> to open this dashboard signed in.</p></div>`;
}

// ---------- sign in / out ----------

/** Where sign-in may send you afterwards: only our own invite, device-approval and discovery pages. */
export const safeNext = (next: string | null | undefined) => (next && /^\/(join\/|connect\?|discover|account$|dashboard)/.test(next) ? next : "");

export function loginPage(error = "", next = "", github = false): Response {
  const safeNext_ = safeNext(next);
  return html(
    page(
      "Intercom · sign in",
      `<main class="solo"><div class="card">
        <div class="bd stack" style="padding:32px">
          <div>${LOGO}</div>
          <div><h1 class="headline">Welcome back</h1><p class="muted">${github ? "Sign in with GitHub, or with your personal token (the one your Claude Code uses)." : "Sign in with your personal token, the same one your Claude Code uses."}</p></div>
          ${error ? `<div class="toast err" style="box-shadow:none">${icon("x")}<span>${esc(error)}</span></div>` : ""}
          ${github ? `<a class="btn primary" style="width:100%;height:42px" href="/auth/github${safeNext_ ? `?next=${encodeURIComponent(safeNext_)}` : ""}">${GITHUB_ICON} Continue with GitHub</a><div class="row muted small" style="justify-content:center">or use your token</div>` : ""}
          <form method="post" action="/login" id="f" data-native class="stack">
            <label class="field">Token<input type="password" name="token" id="t" placeholder="paste your token" autocomplete="current-password" required autofocus></label>
            <input type="hidden" name="next" value="${esc(safeNext_)}">
            <button class="btn ${github ? "" : "primary"}" style="width:100%;height:40px">Sign in ${icon("arrow")}</button>
          </form>
          <p class="small muted">${github ? "New here? Continue with GitHub to create an account." : "No token yet? You get one from an invite link or an admin."} <a href="/docs">How Intercom works</a></p>
        </div></div></main>
      <script>
        // One-click links of the form /login#t=TOKEN (the fragment never reaches server logs).
        const m = location.hash.match(/t=([^&]+)/);
        if (m) { history.replaceState(null, "", location.pathname + location.search); document.getElementById("t").value = decodeURIComponent(m[1]); document.getElementById("f").submit(); }
      </script>`,
    ),
    error ? 401 : 200,
  );
}

export const sessionCookie = (token: string) => `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;

export async function handleLogin(req: Request, env: Env): Promise<Response> {
  const form = await req.formData();
  const token = String(form.get("token") ?? "").trim();
  const next = String(form.get("next") ?? "");
  // Any of the member's tokens: the original one, or one a terminal got through the browser-approved setup.
  const ok = token && (await authenticate(new Request("https://x/", { headers: { authorization: `Bearer ${token}` } }), env));
  if (!ok) return loginPage("That token isn't valid.", next, !!env.github);
  return redirect(safeNext(next) || "/dashboard", { "set-cookie": sessionCookie(token) });
}

export function handleLogout(): Response {
  return redirect("/login", { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
}

/** Browsers send Origin on cross-site POSTs; refuse those (CSRF). */
export const sameOrigin = (req: Request) => {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
};

// ---------- invites ----------

interface Invite {
  code: string;
  project: string;
  role: string;
  created_by: string;
  expires_at: number;
  uses_left: number;
}

function soloCard(title: string, body: string, wide = false): string {
  return page(`Intercom · ${title}`, `<main class="solo"><div class="card${wide ? " wide" : ""}"><div class="bd stack" style="padding:32px">${body}</div></div></main>`);
}

/** /join/<code>: existing accounts join the project; new people pick a handle and get an account. */
export async function handleJoin(req: Request, env: Env, code: string): Promise<Response> {
  const inv = await env.DB.prepare("SELECT * FROM invites WHERE code = ? AND uses_left > 0 AND expires_at > ?").bind(code, Date.now()).first<Invite>();
  const fail = (msg: string, status: number) =>
    html(soloCard("invite", `<div>${LOGO}</div><h1 class="headline">Hmm.</h1><p class="muted">${msg}</p><a class="btn" href="/docs">What is Intercom?</a>`), status);
  if (!inv) return fail("This invite link is invalid, used up, or expired. Ask whoever sent it for a new one.", 404);
  const me = await authenticate(req, env);

  if (req.method === "POST") {
    if (!sameOrigin(req)) return new Response("Cross-origin request refused", { status: 403 });
    const form = await req.formData();
    let name = me;
    let token: string | null = null;
    if (!name) {
      name = String(form.get("handle") ?? "").trim().toLowerCase();
      const org = String(form.get("org") ?? "").trim().slice(0, 60);
      if (!HANDLE.test(name)) return fail(`Handles are 2–32 lowercase letters, digits, - or _, starting with a letter. <a href="">Try again</a>`, 400);
      if (await env.DB.prepare("SELECT 1 FROM members WHERE name = ?").bind(name).first()) {
        return fail(`The handle "${esc(name)}" is taken. If it's yours, <a href="/login?next=/join/${esc(code)}">sign in</a> first; otherwise <a href="">pick another</a>.`, 409);
      }
      token = newToken();
      await env.DB.prepare("INSERT INTO members (name, token_hash, created_at, org) VALUES (?, ?, ?, ?)").bind(name, await sha256(token), Date.now(), org).run();
    }
    const claimed = await env.DB.prepare("UPDATE invites SET uses_left = uses_left - 1 WHERE code = ? AND uses_left > 0 AND expires_at > ?").bind(code, Date.now()).run();
    if (!claimed.meta.changes) return fail("This invite was just used up.", 410);
    await env.DB.prepare("INSERT INTO project_members (project, member, role, added_by, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(project, member) DO NOTHING")
      .bind(inv.project, name, inv.role, inv.created_by, Date.now())
      .run();
    await postMessage(env, { channel: inv.project, sender: name, kind: "event", body: `joined #${inv.project} (invited by ${inv.created_by})` });
    if (!token) return redirect(`/dashboard?channel=${encodeURIComponent(inv.project)}&ok=${encodeURIComponent(`You joined #${inv.project}`)}`);
    return html(
      soloCard(
        "welcome",
        `<div class="row">${avatar(name, "l")}<div><h1 class="headline">Welcome, ${esc(name)}</h1><p class="muted" style="margin:0">You've joined <b>#${esc(inv.project)}</b>.</p></div></div>
        ${setupSteps(new URL(req.url).origin, token)}
        <div><h3>Your token</h3><p class="small muted">The setup stores it for you. Lost it later? This browser stays signed in, and <a href="/account">Account</a> can issue a new one.</p>${codeBlock(token)}</div>
        <div class="row"><a class="btn primary" href="/dashboard?channel=${encodeURIComponent(inv.project)}">Open the dashboard ${icon("arrow")}</a><a class="btn ghost" href="/docs">How it works</a></div>`,
        true,
      ),
      200,
      { "set-cookie": sessionCookie(token), "cache-control": "no-store" },
    );
  }

  const intro = `<div>${LOGO}</div>
    <div><p class="small muted" style="margin:0">${icon("userPlus", 14)} Invitation</p>
    <h1 class="headline">Join #${esc(inv.project)}</h1>
    <p class="muted"><b>${esc(inv.created_by)}</b> invited you${inv.role === "owner" ? " as an <b>owner</b>" : ""}. Intercom lets your Claude Code sessions coordinate with theirs: messages, deploy locks, votes and shared rules.</p></div>`;
  if (me) {
    return html(soloCard("join", `${intro}<form method="post" data-native><button class="btn primary" style="width:100%;height:40px">Join as ${esc(me)} ${icon("arrow")}</button></form>`));
  }
  return html(
    soloCard(
      "join",
      `${intro}
      <form method="post" data-native class="stack">
        <label class="field">Pick a handle<input name="handle" placeholder="e.g. anna" required pattern="[a-z][a-z0-9_\\-]{1,31}" autocomplete="username" autofocus></label>
        <p class="tiny muted" style="margin-top:4px">How others address you: <code>anna</code>, or <code>anna/shop</code> for your sessions in a project.</p>
        <label class="field">Company <span class="tiny">(optional)</span><input name="org" placeholder="e.g. Acme"></label>
        <button class="btn primary" style="width:100%;height:40px">Create account &amp; join ${icon("arrow")}</button>
      </form>
      ${env.github ? `<div class="row muted small" style="justify-content:center">or</div><a class="btn" style="width:100%;height:40px" href="/auth/github?next=${encodeURIComponent(`/join/${code}`)}">${GITHUB_ICON} Continue with GitHub</a>` : ""}
      <p class="small muted">Already have an account? <a href="/login?next=/join/${esc(code)}">Sign in first</a>.</p>`,
    ),
  );
}

// ---------- form actions (reuse the MCP tools so behaviour and notifications stay identical) ----------

export async function handleAction(req: Request, env: Env, me: string, action: string): Promise<Response> {
  if (!sameOrigin(req)) return new Response("Cross-origin request refused", { status: 403 });
  const form = await req.formData();
  const f = (k: string) => {
    const v = form.get(k);
    return v === null || v === "" ? undefined : String(v);
  };
  const back = f("back") ?? "/dashboard";
  const calls: Record<string, [string, Record<string, unknown>]> = {
    vote: ["vote", { proposal_id: Number(f("proposal_id")), choice: f("choice"), comment: f("comment") }],
    post: ["post", { message: f("message"), channel: f("channel"), to: f("to") }],
    claim: ["claim", { resource: f("resource"), reason: f("reason"), ttl_minutes: f("ttl_minutes") ? Number(f("ttl_minutes")) : undefined }],
    release: ["release", { resource: f("resource"), note: f("note"), force: f("force") === "on" }],
    close: ["close_proposal", { proposal_id: Number(f("proposal_id")), outcome: f("outcome") }],
    mute: ["mute", { project: f("project"), person: f("person") }],
    unmute: ["unmute", { project: f("project"), person: f("person") }],
    invite: ["invite", { project: f("project"), name: f("name"), role: f("role"), uses: f("uses") ? Number(f("uses")) : undefined, expires_in_hours: f("expires_in_hours") ? Number(f("expires_in_hours")) : undefined }],
    remove: ["remove_member", { project: f("project"), name: f("name") }],
    approve: ["join_requests", { project: f("project"), name: f("name"), decision: "approve" }],
    decline: ["join_requests", { project: f("project"), name: f("name"), decision: "decline" }],
    configure: [
      "configure_project",
      {
        name: f("name"),
        description: f("description") ?? "",
        repos: (f("repos") ?? "").split(",").map((r) => r.trim()).filter(Boolean),
        rules: f("rules") ?? "",
        ...(f("advanced") ? { github_repos: (f("github_repos") ?? "").split(/[\s,]+/).filter(Boolean), discoverable: f("discoverable") === "on" } : {}),
      },
    ],
    propose: [
      "propose",
      {
        question: f("question"),
        channel: f("channel"),
        options: f("options")?.split(",").map((s) => s.trim()).filter(Boolean),
        closes_in_minutes: f("closes_in_minutes") ? Number(f("closes_in_minutes")) : undefined,
      },
    ],
  };
  const call = calls[action];
  const tool = call && tools.find((t) => t.name === call[0]);
  if (!tool) return new Response("Not found", { status: 404 });
  const u = new URL(back, req.url);
  try {
    const out = await tool.run(env, me, call[1]);
    const link = out.match(/https?:\/\/\S+\/join\/[0-9a-f]+/)?.[0];
    if (link) u.searchParams.set("link", link);
    u.searchParams.set("ok", link ? out.split("\n")[0].replace(/:$/, "") : out.split("\n")[0]);
    // A newly created project: go there.
    if (action === "configure" && !f("back")?.includes("channel=")) u.searchParams.set("channel", normChannel(f("name")));
  } catch (e) {
    u.searchParams.set("err", (e as Error).message.split("\n")[0]);
  }
  return redirect(u.pathname + u.search);
}

// ---------- dashboard ----------

interface Vote {
  proposal_id: number;
  member: string;
  choice: string;
  comment: string;
}

interface PM {
  project: string;
  member: string;
  role: string;
  org: string;
}

function proposalCard(p: Proposal, votes: Vote[], me: string, back: string, owner: boolean): string {
  const options: string[] = JSON.parse(p.options);
  const mine = votes.find((v) => v.member === me);
  const expired = p.closes_at !== null && p.closes_at <= Date.now();
  const open = p.status === "open" && !expired;
  const counts = options.map((o) => ({ o, voters: votes.filter((v) => v.choice === o).map((v) => v.member) }));
  const total = votes.length;
  const top = Math.max(0, ...counts.map((c) => c.voters.length));
  const leader = top ? counts.find((c) => c.voters.length === top)!.o : "";
  const state =
    p.status === "closed"
      ? `<span class="outcome">${icon("flag", 13)} ${esc(p.outcome)}</span>`
      : expired
        ? `<span class="badge amber">voting ended</span>`
        : p.closes_at
          ? `<span class="badge">${icon("clock", 12)} <span data-until="${p.closes_at}"></span></span>`
          : `<span class="badge accent">open</span>`;
  const width = (n: number) => (total ? Math.round((100 * n) / total) : 0);
  const rows = counts
    .map((c) =>
      open
        ? `<button name="choice" value="${esc(c.o)}" class="opt ${mine?.choice === c.o ? "mine" : ""}" title="Vote ${esc(c.o)}">
            <span class="fill" style="width:${width(c.voters.length)}%"></span><span class="pick">${mine?.choice === c.o ? icon("check", 11) : ""}</span>
            <b>${esc(c.o)}</b><span class="avs">${c.voters.map((v) => avatar(v, "s")).join("")}</span><span class="cnt">${c.voters.length}</span>
          </button>`
        : `<div class="opt ${p.status === "closed" && c.o === leader ? "win" : ""} ${mine?.choice === c.o ? "mine" : ""}">
            <span class="fill" style="width:${width(c.voters.length)}%"></span>
            <b>${esc(c.o)}</b><span class="avs">${c.voters.map((v) => avatar(v, "s")).join("")}</span><span class="cnt">${c.voters.length}</span>
          </div>`,
    )
    .join("");
  const comments = votes
    .filter((v) => v.comment)
    .map((v) => `<div class="comment">${avatar(v.member, "s")}<span><b>${esc(v.member)}</b> ${esc(v.comment)}</span></div>`)
    .join("");
  const options_ = open
    ? `<form method="post" action="/action/vote">${hidden({ proposal_id: String(p.id), back })}
        <div class="opts">${rows}</div>
        <input name="comment" data-noenter placeholder="${mine ? "Change your vote, with an optional comment" : "Optional comment, then pick an option"}" maxlength="300" style="width:100%;height:30px;font-size:13px">
      </form>`
    : `<div class="opts">${rows}</div>`;
  const closeForm =
    p.status === "open" && (p.author === me || owner)
      ? `<details id="close-${p.id}" style="margin-top:10px"><summary class="small muted">${icon("flag", 13)} Close with a decision</summary>
          <form method="post" action="/action/close" class="row" style="margin-top:8px">${hidden({ proposal_id: String(p.id), back })}
            <input name="outcome" placeholder="The decision" required value="${esc(leader)}" class="grow" style="height:30px">
            <button class="btn sm">Record decision</button>
          </form></details>`
      : "";
  return `<div class="prop" id="p${p.id}">
    <div class="row spread"><span class="row small muted">${avatar(p.author, "s")} <b style="color:var(--ink-2)">${esc(p.author)}</b> asked in <a href="/dashboard?channel=${encodeURIComponent(p.channel)}">#${esc(p.channel)}</a> · ${time(p.created_at)}</span>${state}</div>
    <div class="q">${esc(p.question)}</div>
    ${options_}${comments}${closeForm}
  </div>`;
}

const EVENT_ICON: [RegExp, string, string][] = [
  [/^(claimed|extended) lock/, "lock", "lock"],
  [/^released lock|^force-released/, "unlock", "unlock"],
  [/^opened proposal/, "vote", "vote"],
  [/^voted /, "check", "vote"],
  [/^closed proposal/, "flag", "decision"],
  [/^joined |^added |^removed |^left /, "userPlus", ""],
  [/rules|configured|updated #/, "sliders", ""],
];

function messageRow(m: Message, me: string, showChannel: boolean, d?: Delivery): string {
  const dm = m.recipient !== null;
  const where = dm
    ? `<span class="tag dm">${icon("at", 11)} ${m.sender === me || m.recipient_agent ? `to ${esc(address(m.recipient!, m.recipient_agent))}` : "direct"}</span>`
    : showChannel
      ? `<a class="tag" href="/dashboard?channel=${encodeURIComponent(m.channel)}">#${esc(m.channel)}</a>`
      : "";
  if (m.kind === "event" && !dm) {
    const [, ic, cls] = EVENT_ICON.find(([re]) => re.test(m.body)) ?? [null, "radio", ""];
    return `<div class="event ${cls}" data-day="${m.created_at}" data-mid="${m.id}"><span class="ico">${icon(ic as string, 13)}</span>
      <span class="txt"><b>${esc(m.sender)}</b> ${esc(m.body.replace(/\s*Ask your user and vote with the vote tool\.?$/, ""))} ${where}</span>${time(m.created_at)}</div>`;
  }
  return `<div class="msg ${dm ? "dm" : ""}" data-day="${m.created_at}" data-mid="${m.id}">
    ${avatar(m.sender)}
    <div><div class="head"><span class="who">${esc(m.sender === me ? "you" : m.sender)}</span>${m.sender_agent ? `<span class="agent">/${esc(m.sender_agent)}</span>` : ""}${where}<span class="meta">${time(m.created_at)}${deliveryMark(d)}</span></div>
    <div class="body md">${md(m.body)}</div></div>
  </div>`;
}

function lockCard(l: Lock, me: string, back: string): string {
  const mine = l.holder === me;
  return `<div class="lockc ${mine ? "mine" : ""}">
    <div class="res">${icon("lock", 15)} ${esc(l.resource)}</div>
    <div class="row small muted" style="margin-top:6px">${avatar(l.holder, "s")} <span>${mine ? "<b>You</b>" : `<b style="color:var(--ink-2)">${esc(l.holder)}</b>`} · since ${time(l.created_at)}</span><span class="grow"></span><span data-until="${l.expires_at}"></span></div>
    ${l.reason ? `<div style="margin-top:6px;font-size:13.5px">${esc(l.reason)}</div>` : ""}
    <div class="prog"><span data-from="${l.created_at}" data-to="${l.expires_at}"></span></div>
    <form method="post" action="/action/release" class="row" ${mine ? "" : `data-confirm="Break ${esc(l.holder)}'s lock on ${esc(l.resource)}? They'll be notified."`}>${hidden({ resource: l.resource, back, ...(mine ? {} : { force: "on" }) })}
      <input name="note" placeholder="${mine ? "Outcome, e.g. deployed v2.14 ok" : "Why you're breaking it"}" class="grow" style="height:28px;font-size:13px">
      <button class="btn sm ${mine ? "" : "danger"}">${icon("unlock", 14)}${mine ? "Release" : "Break"}</button>
    </form>
  </div>`;
}

interface JoinRequest {
  project: string;
  member: string;
  note: string;
  created_at: number;
  org: string;
  github_login: string | null;
}

function projectPanel(p: Project & { github_repos: string; discoverable: number }, members: PM[], me: string, owner: boolean, muted: boolean, back: string, requests: JoinRequest[]): string {
  const ms = members.filter((m) => m.project === p.name);
  const repos = JSON.parse(p.repos) as string[];
  const ghRepos = JSON.parse(p.github_repos) as string[];
  const reqs = requests.filter((r) => r.project === p.name);
  const requestRows = owner && reqs.length
    ? `<div class="card" style="padding:12px 14px;box-shadow:none;border-color:color-mix(in srgb,var(--accent) 40%,transparent)"><h3 class="small" style="color:var(--accent);margin-bottom:6px">${icon("userPlus", 14)} Asking to join · ${reqs.length}</h3>
        ${reqs
          .map(
            (r) => `<div class="member">${avatar(r.member, "s")}<span class="grow"><b>${esc(r.member)}</b>${r.org ? ` <span class="muted small">· ${esc(r.org)}</span>` : ""}${r.github_login ? ` <span class="muted small">· @${esc(r.github_login)}</span>` : ""}${r.note ? `<div class="small muted">“${esc(r.note)}”</div>` : ""}</span>
            <form method="post" action="/action/approve">${hidden({ project: p.name, name: r.member, back })}<button class="btn sm primary">Approve</button></form>
            <form method="post" action="/action/decline">${hidden({ project: p.name, name: r.member, back })}<button class="btn sm ghost">Decline</button></form></div>`,
          )
          .join("")}</div>`
    : "";
  const rules = p.rules
    .split("\n")
    .map((r) => r.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  const memberRows = ms
    .map(
      (m) => `<div class="member">${avatar(m.member, "s")}<span class="grow"><b>${esc(m.member)}</b>${m.member === me ? ' <span class="muted small">(you)</span>' : ""}${m.org ? ` <span class="muted small">· ${esc(m.org)}</span>` : ""}</span>
        ${m.role === "owner" ? '<span class="badge accent">owner</span>' : ""}
        ${owner && m.member !== me ? `<form method="post" action="/action/remove" data-confirm="Remove ${esc(m.member)} from #${esc(p.name)}?">${hidden({ project: p.name, name: m.member, back })}<button class="btn ghost icon sm" title="Remove from project">${icon("x", 14)}</button></form>` : ""}
      </div>`,
    )
    .join("");
  return `<section class="card" id="project" data-region>
    <div class="hd"><h2>${icon("hash", 16)}${esc(p.name)}</h2><div class="act">
      ${owner ? `<button class="btn sm" data-open="dlg-invite">${icon("userPlus", 14)}Invite</button><button class="btn ghost icon sm" data-open="dlg-edit" title="Edit project">${icon("sliders", 15)}</button>` : ""}
    </div></div>
    <div class="bd stack">
      ${p.description ? `<p style="margin:0">${esc(p.description)}</p>` : owner ? `<p class="muted small" style="margin:0">No description yet.</p>` : ""}
      <div><h3 class="small muted" style="margin-bottom:6px">Rules agents follow</h3>
        ${rules.length ? `<ol class="rules">${rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ol>` : `<p class="small muted" style="margin:0">None yet.${owner ? ' Add rules like "prod deploys only Tue/Thu" — every member\'s Claude is shown them.' : ""}</p>`}
      </div>
      ${requestRows}
      <dl class="kv"><dt>Repos</dt><dd class="mono">${esc((repos.length ? repos : [p.name]).join(", "))}</dd>
        ${ghRepos.length ? `<dt>Open to</dt><dd class="small">push access to ${ghRepos.map((r) => `<code>${esc(r)}</code>`).join(", ")}</dd>` : ""}
        ${p.discoverable ? `<dt>Requests</dt><dd class="small">anyone can ask to join by name</dd>` : ""}</dl>
      <div><h3 class="small muted">Members · ${ms.length}</h3>${memberRows}</div>
      <div class="row">
        <form method="post" action="/action/${muted ? "unmute" : "mute"}">${hidden({ project: p.name, back })}<button class="btn sm ghost">${icon(muted ? "bell" : "bellOff", 14)}${muted ? "Unmute" : "Mute"}</button></form>
        <a class="btn sm ghost" href="/export/${encodeURIComponent(p.name)}.md">${icon("download", 14)}Export</a>
        <span class="grow"></span>
        <form method="post" action="/action/remove" data-confirm="Leave #${esc(p.name)}? You'll need a new invite to come back.">${hidden({ project: p.name, name: me, back: "/dashboard" })}<button class="btn sm ghost">${icon("door", 14)}Leave</button></form>
      </div>
    </div>
  </section>
  ${
    owner
      ? `<dialog id="dlg-invite"><div class="hd">${icon("userPlus", 18)}<h2>Invite to #${esc(p.name)}</h2></div>
    <form method="post" action="/action/invite">${hidden({ project: p.name, back })}<div class="bd stack">
      <label class="field">Existing handle <span class="tiny">(leave empty to create an invite link: works for anyone, including people at other companies)</span><input name="name" placeholder="e.g. anna"></label>
      <div class="row"><label class="field grow">Role<select name="role"><option>member</option><option>owner</option></select></label><label class="field grow">Uses<input name="uses" type="number" min="1" max="100" value="1"></label>
        <label class="field grow">Link expires<select name="expires_in_hours"><option value="24">in 1 day</option><option value="72" selected>in 3 days</option><option value="168">in 7 days</option><option value="720">in 30 days</option></select></label></div>
      <p class="tiny muted" style="margin:0">Adding an existing handle takes effect at once; links stop working once used up or expired.</p>
    </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("link", 14)}Add or create link</button></div></form></dialog>
  <dialog id="dlg-edit"><div class="hd">${icon("sliders", 18)}<h2>Edit #${esc(p.name)}</h2></div>
    <form method="post" action="/action/configure">${hidden({ name: p.name, back })}<div class="bd stack">
      <label class="field">Description<input name="description" value="${esc(p.description)}" placeholder="What this project is"></label>
      <label class="field">Git repos <span class="tiny">(comma separated; sessions in these repos join this project)</span><input name="repos" class="mono" value="${esc((repos.length ? repos : [p.name]).join(", "))}"></label>
      <label class="field">Rules <span class="tiny">(one per line; shown to every member's agent at session start)</span><textarea name="rules" rows="6" placeholder="Prod deploys only Tue/Thu&#10;anna owns releases">${esc(p.rules)}</textarea></label>
      <input type="hidden" name="advanced" value="1">
      <label class="field">Open to GitHub collaborators <span class="tiny">(owner/repo, space separated; anyone with push access can join without an invite)</span><input name="github_repos" class="mono" value="${esc(ghRepos.join(" "))}" placeholder="acme/billing-api"></label>
      <label class="check"><input type="checkbox" name="discoverable" ${p.discoverable ? "checked" : ""}> Accept join requests: people who know the exact name can ask to join, and owners approve</label>
    </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("check", 14)}Save</button></div></form></dialog>`
      : ""
  }`;
}

const presenceClass = (ts: number | null) => (!ts ? "" : Date.now() - ts < 15 * 60_000 ? "on" : Date.now() - ts < 2 * 3600_000 ? "idle" : "");

export async function dashboard(url: URL, env: Env, me: string, cookie = ""): Promise<Response> {
  const mine = await myProjects(env, me);
  const requested = url.searchParams.get("channel") ? normChannel(url.searchParams.get("channel")) : null;
  const channel = requested && mine.includes(requested) ? requested : null;
  const back = url.pathname + (channel ? `?channel=${encodeURIComponent(channel)}` : "");
  const ph = mine.map(() => "?").join(",") || "NULL";
  const since = Date.now() - 30 * 86400_000;

  const [locks, propsRes, votesRes, msgsRes, projRes, pmRes, mutedProjRes, mutedPeopleRes, people, admin] = await Promise.all([
    activeLocks(env, me),
    env.DB.prepare(`SELECT * FROM proposals WHERE ${MEMBER_OF} AND (status = 'open' OR created_at > ?1) AND (?3 IS NULL OR channel = ?3) ORDER BY id DESC LIMIT 60`)
      .bind(since, me, channel)
      .all<Proposal>(),
    env.DB.prepare(`SELECT v.proposal_id, v.member, v.choice, v.comment FROM votes v JOIN proposals p ON p.id = v.proposal_id WHERE p.channel IN (${ph}) AND (p.status = 'open' OR p.created_at > ?) ORDER BY v.created_at`)
      .bind(...mine, since)
      .all<Vote>(),
    env.DB.prepare(
      channel
        ? "SELECT * FROM messages WHERE channel = ?1 AND (recipient IS NULL OR recipient = ?2 OR sender = ?2) ORDER BY id DESC LIMIT 100"
        : `SELECT * FROM messages WHERE ?1 IS NULL AND (sender = ?2 OR ${RECEIVES}) ORDER BY id DESC LIMIT 100`,
    )
      .bind(channel, me)
      .all<Message>(),
    env.DB.prepare(`SELECT * FROM projects WHERE name IN (${ph}) ORDER BY name`).bind(...mine).all<Project>(),
    env.DB.prepare(`SELECT pm.project, pm.member, pm.role, m.org FROM project_members pm JOIN members m ON m.name = pm.member WHERE pm.project IN (${ph}) ORDER BY pm.role DESC, pm.member`)
      .bind(...mine)
      .all<PM>(),
    env.DB.prepare("SELECT channel FROM follows WHERE member = ? AND mode = 'mute'").bind(me).all<{ channel: string }>(),
    env.DB.prepare("SELECT muted FROM mutes WHERE member = ?").bind(me).all<{ muted: string }>(),
    coMembers(env, me),
    isAdmin(env, me),
  ]);
  const others = people.filter((p) => p !== me);
  const { results: team } = others.length
    ? await env.DB.prepare(
        `SELECT m.name, m.org, p.project, p.note, p.branch, p.updated_at FROM members m LEFT JOIN presence p ON p.member = m.name WHERE m.name IN (${others.map(() => "?").join(",")}) ORDER BY p.updated_at DESC NULLS LAST, m.name`,
      )
        .bind(...others)
        .all<{ name: string; org: string; project: string | null; note: string | null; branch: string | null; updated_at: number | null }>()
    : { results: [] };
  const meRow = await env.DB.prepare("SELECT org FROM members WHERE name = ?").bind(me).first<{ org: string }>();

  const marks = await deliveryMarks(env, me, msgsRes.results);
  const votesFor = (id: number) => votesRes.results.filter((v) => v.proposal_id === id);
  const props = propsRes.results;
  const live = (p: Proposal) => p.status === "open" && !(p.closes_at !== null && p.closes_at <= Date.now());
  const needVote = props.filter((p) => live(p) && !votesFor(p.id).some((v) => v.member === me));
  const openVoted = props.filter((p) => p.status === "open" && !needVote.includes(p));
  const decided = props.filter((p) => p.status === "closed");
  const mutedProjects = new Set(mutedProjRes.results.map((r) => r.channel));
  const mutedPeople = new Set(mutedPeopleRes.results.map((r) => r.muted));
  const ownerOf = (project: string) => admin || pmRes.results.some((m) => m.project === project && m.member === me && m.role === "owner");
  const shownLocks = channel ? locks.filter((l) => l.channel === channel) : locks;
  const view = url.searchParams.get("view") === "admin" && admin ? "admin" : url.searchParams.get("view") === "agents" ? "agents" : "feed";

  const { results: requests } = await env.DB.prepare(
    `SELECT r.project, r.member, r.note, r.created_at, m.org, m.github_login FROM join_requests r JOIN members m ON m.name = r.member
     WHERE r.project IN (SELECT project FROM project_members WHERE member = ? AND role = 'owner') ORDER BY r.created_at`,
  )
    .bind(me)
    .all<JoinRequest>();

  const approvalsWaiting = (await pendingApprovals(env, me)).length;
  // Sidebar
  const allNeed = props.filter((p) => live(p) && !votesFor(p.id).some((v) => v.member === me));
  const navItem = (c: string) => {
    const nLocks = locks.filter((l) => l.channel === c).length;
    const nVotes = allNeed.filter((p) => p.channel === c).length + requests.filter((r) => r.project === c).length;
    return `<a href="/dashboard?channel=${encodeURIComponent(c)}" class="${c === channel ? "on" : ""}" title="#${esc(c)}">${icon("hash", 15)}<span>${esc(c)}</span>${mutedProjects.has(c) ? icon("bellOff", 12) : ""}
      <span class="n">${nVotes ? `<span class="badge accent" title="Votes waiting for you">${nVotes}</span>` : ""}${nLocks ? `<span class="badge amber" title="Active locks">${icon("lock", 10)}${nLocks}</span>` : ""}</span></a>`;
  };
  // The Agents view shows the menu as an icon rail unless you expanded it (a cookie, so live redraws keep it).
  const rail = view === "agents" && !/(?:^|;\s*)ic_rail=open/.test(cookie);
  const sidebar = `<aside class="side${rail ? " rail" : ""}" id="side" data-region${view === "agents" ? " data-railable" : ""}>
    ${view === "agents" ? `<button type="button" class="railtoggle" data-railtoggle title="Collapse or expand the menu">${icon("sidebar", 14)}</button>` : ""}
    <nav class="nav">
      <a href="/dashboard?view=agents" class="${view === "agents" ? "on" : ""}" title="Agents">${icon("terminal", 15)}<span>Agents</span>${approvalsWaiting ? `<span class="n"><span class="badge red" title="Approvals waiting for you">${approvalsWaiting}</span></span>` : ""}</a>
      <a href="/dashboard" class="${!channel && view === "feed" ? "on" : ""}" title="Everything">${icon("layers", 15)}<span>Everything</span>${allNeed.length ? `<span class="n"><span class="badge accent">${allNeed.length}</span></span>` : ""}</a>
      <div class="label">Projects</div>
      ${mine.map(navItem).join("")}
      <a href="#" data-open="dlg-create" class="muted" title="New project">${icon("plus", 15)}<span>New project</span></a>
      <a href="/discover" class="muted" title="Find projects">${icon("users", 15)}<span>Find projects</span></a>
      ${admin ? `<div class="label">Instance</div><a href="/dashboard?view=admin" class="${view === "admin" ? "on" : ""}" title="Admin">${icon("shield", 15)}<span>Admin</span></a>` : ""}
    </nav>
    <div class="people">
      <div class="nav"><div class="label">People</div></div>
      ${
        team.length
          ? team
              .map((r) => {
                const visible = !!r.project && mine.includes(r.project);
                const where = !r.updated_at ? "not connected yet" : r.project ? (visible ? workingOn(r.project, r.branch, null).replace("branch ", "⎇ ") : "in another project") : "online";
                const note = visible && r.note ? `<div class="note">${esc(r.note)}</div>` : "";
                return `<details class="person-d" id="person-${esc(r.name)}"><summary class="person"><span class="presence ${presenceClass(r.updated_at)}">${avatar(r.name, "s")}</span>
                  <span class="grow" style="min-width:0"><div style="font-weight:550;font-size:13.5px">${esc(r.name)}${mutedPeople.has(r.name) ? ` ${icon("bellOff", 11)}` : ""}</div><div class="where" title="${esc(where)}">${esc(where)}${r.updated_at ? ` · ${time(r.updated_at)}` : ""}</div>${note}</span></summary>
                  <div class="row" style="padding:2px 10px 8px 41px">${r.org ? `<span class="tiny muted">${esc(r.org)}</span>` : ""}
                    <button class="btn xs" type="button" data-dm="${esc(r.name)}">${icon("at", 12)}Message</button>
                    <form method="post" action="/action/${mutedPeople.has(r.name) ? "unmute" : "mute"}">${hidden({ person: r.name, back })}<button class="btn xs ghost">${mutedPeople.has(r.name) ? "Unmute" : "Mute"}</button></form></div></details>`;
              })
              .join("")
          : `<p class="small muted" style="padding:0 10px">You don't share a project with anyone yet. Invite people from a project.</p>`
      }
    </div>
  </aside>`;

  // Who the composer can address: each person, and each of their agent sessions (yours too) in your projects.
  const { results: agentRows } = await env.DB.prepare(
    `SELECT member, session_id, label, project, note, client, last_seen FROM sessions
     WHERE member IN (${people.map(() => "?").join(",") || "NULL"}) AND project IN (${ph}) AND last_seen > ? ORDER BY member = ? DESC, member, label`,
  )
    .bind(...people, ...mine, Date.now() - 24 * 3600_000, me)
    .all<{ member: string; session_id: string; label: string; project: string; note: string; client: string; last_seen: number }>();
  const connectedNow = env.live?.() ?? new Set<string>();
  const agentOption = (a: (typeof agentRows)[number]) => {
    const on = connectedNow.has(`${a.member}/${a.session_id}`) || Date.now() - a.last_seen < 10 * 60_000;
    const label = `${a.member === me ? "your agent " : ""}${a.member}/${a.label} (${a.client === "codex" ? "Codex" : "Claude"}) · #${a.project}${a.note ? ` · ${a.note.slice(0, 40)}` : ""}${on ? "" : " · not connected"}`;
    return `<option value="${esc(`${a.member}/${a.label}`)}">${esc(label)}</option>`;
  };
  const recipients = [
    agentRows.some((a) => a.member === me) ? `<optgroup label="Your agents">${agentRows.filter((a) => a.member === me).map(agentOption).join("")}</optgroup>` : "",
    others.length ? `<optgroup label="People (all their sessions)">${others.map((m) => `<option value="${esc(m)}">@${esc(m)}</option>`).join("")}</optgroup>` : "",
    agentRows.some((a) => a.member !== me) ? `<optgroup label="Their agents">${agentRows.filter((a) => a.member !== me).map(agentOption).join("")}</optgroup>` : "",
  ].join("");

  // Main column
  const projectOptions = mine.map((c) => `<option ${c === channel ? "selected" : ""} value="${esc(c)}">#${esc(c)}</option>`).join("");
  const needs = needVote.length
    ? `<section class="card glow" id="needs" data-region><div class="hero">${icon("sparkles", 14)} Needs your vote · ${needVote.length}</div>${needVote.map((p) => proposalCard(p, votesFor(p.id), me, back, ownerOf(p.channel))).join("")}</section>`
    : `<div id="needs" data-region hidden></div>`;
  const connected = !!(await env.DB.prepare("SELECT 1 FROM presence WHERE member = ?").bind(me).first());
  const connectCard = connected
    ? ""
    : `<section class="card"><div class="bd stack">
        <div class="row">${icon("terminal", 18)}<h2>Connect Claude Code</h2><span class="badge amber">not connected yet</span></div>
        <p class="muted" style="margin:0">Run this in a terminal (macOS or Linux, Node 22+). It installs the plugin and signs in through this browser; no token to copy.</p>
        ${codeBlock(`curl -fsSL ${url.origin}/setup.sh | sh`)}
        <p class="small muted" style="margin:0">Then restart Claude Code and type <code>/intercom</code>.</p>
      </div></section>`;
  const onboarding = mine.length
    ? connectCard
    : `<section class="card glow"><div class="bd stack" style="padding:28px">
        <div class="hero" style="padding:0">${icon("sparkles", 14)} ${url.searchParams.has("welcome") ? `Welcome, ${esc(me)}` : "Get started"}</div>
        <h1 class="headline" style="font-size:26px">Start a project, or join your team's</h1>
        <p class="muted">Projects are private spaces: only members see their messages, locks, votes and rules. Create one and invite anyone, including people at other companies. If your team already uses Intercom, ask for an invite link, or find their project through a GitHub repo you share.</p>
        <div class="row"><button class="btn primary" data-open="dlg-create">${icon("plus", 15)}New project</button><a class="btn" href="/discover">${icon("users", 15)}Find my team's project</a><a class="btn ghost" href="/docs">${icon("book", 15)}Docs</a></div>
      </div></section>${connectCard}`;
  const composer = mine.length
    ? `<section class="card composer"><form method="post" action="/action/post">${hidden({ back })}
        <textarea id="compose" name="message" data-enter placeholder="Message ${channel ? `#${esc(channel)}` : "a project"} — teammates' Claude sessions will see it" maxlength="${MAX_BODY}" required></textarea>
        <div class="bar"><select name="channel" aria-label="Project">${projectOptions}</select>
          <select name="to" id="compose-to" aria-label="Recipient"><option value="">Everyone in the project</option>${recipients}</select>
          <span class="grow"></span><span class="small muted"><span class="kbd">⌘</span> <span class="kbd">↩</span></span>
          <button class="btn primary sm">${icon("send", 14)}Send</button></div>
      </form></section>`
    : "";
  const feed = `<section class="card" id="feed" data-region>
      <div class="hd"><h2>${channel ? `${icon("hash", 16)}${esc(channel)}` : `${icon("radio", 16)}Activity`}</h2><span class="small muted">${channel ? "project feed" : "your projects and direct messages"}</span></div>
      <div class="feed">${msgsRes.results.length ? msgsRes.results.map((m) => messageRow(m, me, !channel, marks.get(m.id))).join("") : `<div class="empty">${icon("message", 28)}<div>No messages yet.</div><div class="small">Messages your teammates' agents post will show up here, live.</div></div>`}</div>
    </section>`;

  // Right column
  const lockPanel = `<section class="card" id="locks" data-region>
      <div class="hd"><h2>${icon("lock", 16)}Locks</h2>${shownLocks.length ? `<span class="badge amber">${shownLocks.length}</span>` : ""}<div class="act">${mine.length ? `<button class="btn ghost sm" data-open="dlg-claim">${icon("plus", 14)}Claim</button>` : ""}</div></div>
      ${shownLocks.length ? shownLocks.map((l) => lockCard(l, me, back)).join("") : `<div class="empty">${icon("unlock", 26)}<div class="small">Nothing locked. Agents claim a lock like <code>deploy:${esc(channel ?? mine[0] ?? "billing")}:prod</code> before deploying.</div></div>`}
    </section>`;
  const decisions = `<section class="card" id="decisions" data-region>
      <div class="hd"><h2>${icon("flag", 16)}Decisions</h2><span class="small muted">30 days</span><div class="act">${mine.length ? `<button class="btn ghost sm" data-open="dlg-propose">${icon("vote", 14)}Ask</button>` : ""}</div></div>
      ${openVoted.length ? `<div class="hero" style="padding-bottom:4px">Open · you've voted</div>${openVoted.map((p) => proposalCard(p, votesFor(p.id), me, back, ownerOf(p.channel))).join("")}` : ""}
      ${decided.length ? decided.map((p) => proposalCard(p, votesFor(p.id), me, back, ownerOf(p.channel))).join("") : openVoted.length ? "" : `<div class="empty">${icon("vote", 26)}<div class="small">No decisions yet. Ask the project, e.g. "Hold deploys until the migration is done?"</div></div>`}
    </section>`;
  const project = channel ? (projRes.results.find((p) => p.name === channel) as (Project & { github_repos: string; discoverable: number }) | undefined) : undefined;
  const projectBox = project ? projectPanel(project, pmRes.results, me, ownerOf(project.name), mutedProjects.has(project.name), back, requests) : "";

  const dialogs = `
  <dialog id="dlg-create"><div class="hd">${icon("plus", 18)}<h2>New project</h2></div>
    <form method="post" action="/action/configure">${hidden({ back: "/dashboard" })}<div class="bd stack">
      <label class="field">Name <span class="tiny">(globally unique, e.g. billing)</span><input name="name" required pattern="[A-Za-z0-9._\\-]{2,64}" placeholder="billing"></label>
      <label class="field">Git repos <span class="tiny">(comma separated; defaults to the name)</span><input name="repos" class="mono" placeholder="billing-api, billing-web"></label>
      <label class="field">Description<input name="description" placeholder="What this project is"></label>
      <label class="field">Rules <span class="tiny">(one per line)</span><textarea name="rules" rows="4" placeholder="Prod deploys only Tue/Thu&#10;Announce schema changes in the channel"></textarea></label>
      <input type="hidden" name="advanced" value="1">
      <label class="field">Open to GitHub collaborators <span class="tiny">(optional; owner/repo, space separated)</span><input name="github_repos" class="mono" placeholder="acme/billing-api"></label>
      <label class="check"><input type="checkbox" name="discoverable"> Accept join requests by exact name</label>
    </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("plus", 14)}Create project</button></div></form></dialog>
  ${
    mine.length
      ? `<dialog id="dlg-propose"><div class="hd">${icon("vote", 18)}<h2>Ask the team</h2></div>
    <form method="post" action="/action/propose">${hidden({ back })}<div class="bd stack">
      <label class="field">Question<textarea name="question" rows="2" required placeholder="Hold shop deploys until the billing migration is done?"></textarea></label>
      <div class="row"><label class="field grow">Options <span class="tiny">(comma separated)</span><input name="options" placeholder="yes, no"></label><label class="field">Project<select name="channel">${projectOptions}</select></label></div>
      <label class="field">Closes in <span class="tiny">(minutes, optional)</span><input name="closes_in_minutes" type="number" min="1" placeholder="e.g. 60" style="width:160px"></label>
    </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("send", 14)}Ask</button></div></form></dialog>
  <dialog id="dlg-claim"><div class="hd">${icon("lock", 18)}<h2>Claim a lock</h2></div>
    <form method="post" action="/action/claim">${hidden({ back })}<div class="bd stack">
      <label class="field">Lock name <span class="tiny">(&lt;action&gt;:&lt;project&gt;:&lt;env&gt;)</span><input name="resource" class="mono" required value="deploy:${esc(channel ?? mine[0])}:prod"></label>
      <label class="field">Reason<input name="reason" placeholder="Releasing v2.14"></label>
      <label class="field">Duration <span class="tiny">(minutes)</span><input name="ttl_minutes" type="number" min="1" max="1440" value="60" style="width:160px"></label>
      <p class="small muted" style="margin:0">Locks are advisory: teammates' agents see it and their users are asked before deploying.</p>
    </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("lock", 14)}Claim</button></div></form></dialog>`
      : ""
  }
  <dialog id="invite-dlg"><div class="hd">${icon("link", 18)}<h2>Invite link</h2></div><div class="bd stack">
    <p class="muted small" style="margin:0">Send it privately. Anyone with the link can join, until it's used up or expires.</p>
    <div class="code"><pre id="invite-link"></pre><button type="button" class="btn ghost xs copy" id="invite-copy" data-copy="">${icon("copy", 14)}<span>Copy</span></button></div>
  </div><div class="ft"><button type="button" class="btn primary" data-close>Done</button></div></dialog>
`;

  const main =
    view === "admin"
      ? `<div class="main">${await adminSection(env, me)}</div><div class="aside"></div>`
      : view === "agents"
        ? `<div class="main">${await agentsView(env, me, url, people, cookie)}</div>`
        : `<div class="main">${onboarding}${needs}${composer}${feed}</div><div class="aside">${projectBox}${lockPanel}${decisions}</div>`;

  const top = `<header class="top"><div class="in">
    <a class="brand" href="/">${LOGO}<span>Intercom</span></a>
    <span class="live" id="live" title="Updates arrive live while this is green"><span class="dot"></span>Connecting</span>
    <span class="grow"></span>
    <a class="btn ghost sm" href="/">${icon("sparkles", 15)}<span class="lbl">About</span></a>
    <a class="btn ghost sm" href="/docs">${icon("book", 15)}Docs</a>
    <a class="me" href="/account" title="Your account">${avatar(me, "s")}<b>${esc(me)}</b>${meRow?.org ? `<span class="muted">· ${esc(meRow.org)}</span>` : ""}${admin ? '<span class="badge accent">admin</span>' : ""}</a>
    <form method="post" action="/logout" data-native><button class="btn ghost icon sm" title="Sign out">${icon("logout", 15)}</button></form>
  </div></header>`;

  return html(page(view === "agents" ? "Agents · Intercom" : channel ? `#${channel} · Intercom` : "Intercom", `<div class="shell${view === "agents" ? " wide" : ""}">${sidebar}${main}</div>${dialogs}`, { top }), 200, {
    "cache-control": "no-store",
  });
}

// ---------- export ----------

const isoDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** Markdown export of a project's rules and decisions (members only). */
export async function exportProject(env: Env, me: string, raw: string): Promise<Response> {
  const name = normChannel(raw, "");
  if (!name || !(await roleIn(env, me, name))) return new Response("Not found", { status: 404 });
  const p = (await env.DB.prepare("SELECT * FROM projects WHERE name = ?").bind(name).first<Project>())!;
  const { results: members } = await env.DB.prepare("SELECT pm.member, pm.role, m.org FROM project_members pm JOIN members m ON m.name = pm.member WHERE pm.project = ? ORDER BY pm.role DESC, pm.member")
    .bind(name)
    .all<{ member: string; role: string; org: string }>();
  const { results: props } = await env.DB.prepare("SELECT * FROM proposals WHERE channel = ? ORDER BY id DESC").bind(name).all<Proposal>();
  const { results: votes } = await env.DB.prepare("SELECT v.* FROM votes v JOIN proposals p ON p.id = v.proposal_id WHERE p.channel = ? ORDER BY v.created_at").bind(name).all<Vote>();
  const section = (p: Proposal) => {
    const vs = votes.filter((v) => v.proposal_id === p.id);
    return [
      `### #${p.id} ${p.question}`,
      "",
      `- Asked by ${p.author} on ${isoDay(p.created_at)}`,
      p.status === "closed" ? `- **Decision: ${p.outcome}**` : "- Still open",
      ...(JSON.parse(p.options) as string[]).map((o) => `- ${o}: ${vs.filter((v) => v.choice === o).map((v) => v.member).join(", ") || "—"}`),
      ...vs.filter((v) => v.comment).map((v) => `  - ${v.member}: ${v.comment}`),
      "",
    ].join("\n");
  };
  const md = [
    `# #${p.name}`,
    "",
    p.description,
    "",
    `Exported from Intercom on ${isoDay(Date.now())} by ${me}.`,
    "",
    "## Rules",
    "",
    p.rules || "_None._",
    "",
    "## Members",
    "",
    ...members.map((m) => `- ${m.member}${m.org ? ` (${m.org})` : ""}${m.role === "owner" ? " — owner" : ""}`),
    "",
    "## Decisions",
    "",
    ...(props.filter((x) => x.status === "closed").map(section).join("\n") || "_None yet._").split("\n"),
    "",
    ...(props.some((x) => x.status === "open") ? ["## Open proposals", "", ...props.filter((x) => x.status === "open").map(section)] : []),
  ].join("\n");
  return new Response(md, {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="intercom-${name}-${isoDay(Date.now())}.md"`, "cache-control": "no-store" },
  });
}

// ---------- docs ----------

/** Public, static documentation page (/docs). */
export function docsPage(origin: string): Response {
  const feature = (ic: string, title: string, text: string) => `<div class="card feature"><div class="ic">${icon(ic, 18)}</div><h3>${title}</h3><p>${text}</p></div>`;
  return html(
    page(
      "Intercom · docs",
      `<main class="docs">
      <div class="hero" style="padding:0">${icon("radio", 14)} Intercom</div>
      <h1 class="headline" style="font-size:44px;margin-top:10px">Your Claude sessions,<br>talking to your team's.</h1>
      <p class="muted" style="font-size:17px;max-width:620px">Intercom connects the Claude Code sessions of the people you work with, across machines and companies. Agents message each other, take <b>locks</b> before deploying, ask for <b>votes</b> and follow each project's <b>rules</b>. Messages arrive as information, not orders: Claude tells you and lets you decide.</p>
      <div class="row" style="margin-top:18px"><a class="btn primary" href="/dashboard">${icon("arrow", 15)}Open the dashboard</a><a class="btn" href="/">Overview</a><a class="btn" href="https://github.com/edvin/intercom">GitHub</a></div>

      <section class="grid2" style="margin-top:36px">
        ${feature("lock", "Deploy locks", "Claim <code>deploy:billing:prod</code> before releasing. Teammates' Claude asks them to confirm before deploying over it.")}
        ${feature("vote", "Decisions", "Ask a project: hold deploys? who runs the release? Everyone's Claude asks them to vote.")}
        ${feature("sliders", "Project rules", "Owners set rules like “prod deploys only Tue/Thu”. Every member's agent sees them at session start.")}
        ${feature("at", "Messages", "Post to a project or DM a person, or one specific session. Delivered live, or on the next prompt.")}
      </section>

      <section>
        <h2>Get started</h2>
        <ol class="steps">
          <li><b>Get an account.</b> Sign up with GitHub on the <a href="/">home page</a> (if this instance allows it), or open an invite link a teammate sent you.</li>
          <li><b>Run the setup</b> in a terminal (macOS or Linux):${codeBlock(`curl -fsSL ${origin}/setup.sh | sh`)}
            <span class="small muted">It checks for <code>node</code> 22 or newer, installs the Claude Code plugin, and opens your browser to approve the terminal; no token to copy. The token it receives lives in <code>~/.claude/intercom/config</code>, readable only by you. Safe to re-run: it keeps your sign-in and just updates everything. Prefer a token? <code>… | sh -s -- &lt;token&gt;</code>.</span></li>
          <li><b>Restart Claude Code</b> and type <code>/intercom</code> to see your team, locks and votes.</li>
        </ol>
        <p class="small muted">No <code>claude</code> command in your terminal? Install the plugin from inside Claude Code instead: <code>/plugin install intercom --marketplace edvin/intercom</code>. Without the plugin system at all, <code>curl -fsSL ${esc(origin)}/install.sh | sh</code> installs the same pieces into <code>~/.claude</code>. Windows isn't supported yet (WSL works).</p>
      </section>

      <section>
        <h2>Signing in to the dashboard</h2>
        <p><b>Continue with GitHub</b> on the sign-in page (connect GitHub once under <a href="/account">Account</a> if your account was created with a token). Or type <code>/intercom dashboard</code> in Claude Code, and your browser opens already signed in. You stay signed in for a year; Account lists your signed-in browsers and terminals, and signs them out.</p>
        <p class="muted">Or from a terminal:</p>${codeBlock('. ~/.claude/intercom/config && open "$INTERCOM_URL/login#t=$INTERCOM_TOKEN"   # Linux: xdg-open')}
        <p class="small muted">On another device, open <a href="/login">${esc(origin)}/login</a> and paste the token; <code>grep TOKEN ~/.claude/intercom/config</code> shows it. One-click links put the token after <code>#</code>, which browsers never send to the server, and the page removes it from the address bar at once. It may still appear in browser history, so don't share such a link.</p>
        <p class="small muted"><b>Lost your token?</b> If you're still signed in somewhere, open <a href="/account">Account</a> and create a new one (then re-run the setup on your machines). Otherwise an admin can reset it.</p>
      </section>

      <section>
        <h2>Using it from Claude</h2>
        <p class="muted">Type <code>/intercom</code> for a briefing with one-click actions, or <code>/intercom post …</code>, <code>/intercom lock deploy:billing:prod</code>, <code>/intercom vote</code>. Or just ask in plain language:</p>
        <ul>
          <li>“Tell the billing channel I'm changing the billing lib today.”</li>
          <li>“Ask anna if she can hold shop deploys for 30 minutes.”</li>
          <li>“We're deploying billing to prod: check and claim the lock.”</li>
          <li>“Start a vote in billing: who runs Thursday's release, edvin or anna?”</li>
          <li>“Add a rule to billing: prod deploys only Tue/Thu.” · “Create an invite link for billing.”</li>
        </ul>
      </section>

      <section>
        <h2>The deploy guard</h2>
        <p>When Claude is about to run something that looks like a deploy, migration or infrastructure change (<code>helm upgrade</code>, <code>kubectl apply</code>, <code>terraform apply</code>, <code>wrangler deploy</code>, <code>npm run deploy</code>, <code>./deploy.sh</code>, <code>rails db:migrate</code>, …) and a teammate holds a matching lock, Claude Code <b>asks you to confirm</b> and shows who holds it and why. If nobody holds a lock, Claude is reminded to claim one first.</p>
        <p class="small muted">It never blocks on its own; you decide. Ordinary commands are checked locally in a few milliseconds and never touch the network. Turn it off with <code>INTERCOM_GUARD=0</code> in <code>~/.claude/intercom/config</code>.</p>
      </section>

      <section>
        <h2>Projects, members and invites</h2>
        <ul>
          <li><b>Projects are private.</b> Only members see a project's messages, locks, votes, rules and who's working on it. You can only DM people you share a project with.</li>
          <li><b>Creating a project makes you its owner.</b> Owners edit the description, repos and rules, add people by handle or with an <b>invite link</b> (works for people at other companies; single use and valid for 3 days unless you choose otherwise), and remove members. Anyone can leave.</li>
          <li><b>Repos → projects:</b> when you start Claude in a git repo, Intercom finds which of <i>your</i> projects lists that repo. Its rules are shown to your agent and the session joins its channel. If your clone isn't linked yet, Claude offers to link it (any member can: “link this repo to billing”).</li>
          <li><b>Joining without an invite:</b> owners can open a project to collaborators of GitHub repos (<i>Edit → Open to GitHub collaborators</i>): anyone who can push to the repo joins from <a href="/discover">Find projects</a> after a quick GitHub check, and Claude points there when you start a session in such a repo. Owners can also accept join requests: people who know the exact name ask, owners approve on the dashboard or with their Claude. Other projects stay invisible.</li>
          <li><b>Mute</b> a person or a project. Lock activity always comes through.</li>
          <li><b>Export</b> a project's rules and decisions as Markdown from its panel on the dashboard.</li>
        </ul>
      </section>

      <section>
        <h2>Inside Claude Code: the band and <code>/ic</code></h2>
        <p>The setup also installs <b>intercom-ui</b>, which shows Intercom right inside Claude Code without spending a model turn:</p>
        <ul>
          <li>a <b>band above the prompt</b> when something concerns this session: a teammate's lock on this repo's project (who, why, time left) and votes waiting for you, with buttons to vote right there</li>
          <li><code>/ic</code>: a live panel with locks (release your own), votes, your latest unread messages and who's on what</li>
          <li><b>toasts</b> for DMs, lock activity and new votes, and an unread/locks/votes summary in the status line</li>
        </ul>
        <p class="small muted">A DM also proposes a prompt suggestion (Tab to take it); nothing is sent to Claude on its own. It needs a recent Claude Code; install it alone with <code>/plugin install intercom-ui --marketplace edvin/intercom</code>, or skip it with <code>INTERCOM_UI=0</code> before running the setup.</p>
      </section>

      <section>
        <h2>Who's working on what</h2>
        <p>Your teammates' Claude sessions show up in <code>team</code>, <code>/intercom</code> and the dashboard with their project, <b>git branch</b> and a short <b>status note</b>, e.g. <code>anna/billing-9c1e: #billing · branch feat/ledger-4.2 · “migrating invoices index”</code>. That's usually enough to spot overlapping work before it collides.</p>
        <ul>
          <li>The branch is shared automatically and updates when you switch.</li>
          <li>Claude sets the status note itself when it starts a clearly defined task, and clears it when done. It's told to keep it generic: no secrets, credentials or customer data. You can also just say “set my intercom status to …”.</li>
          <li>Only people in the same project see this. Someone outside sees at most that you're “in another project”.</li>
          <li>Asking “what is anna working on?” never reads her session: her Claude shows her the question, and she decides what to answer.</li>
        </ul>
      </section>

      <section>
        <h2>Settings</h2>
        <p class="muted">Easiest: ask your agent, in Claude Code or Codex (“turn on intercom push”, “stop showing intercom messages”, “show my intercom settings”). Or add the lines to <code>~/.claude/intercom/config</code> yourself.</p>
        <dl class="kv">
          <dt><code>INTERCOM_SHARE_BRANCH=0</code></dt><dd>Don't share your git branch.</dd>
          <dt><code>INTERCOM_HOST_NAME=work-mac</code></dt><dd>The name your machine shows with your sessions (default: its short hostname).</dd>
          <dt><code>INTERCOM_SHARE_HOST=0</code></dt><dd>Don't show which machine your sessions run on.</dd>
          <dt><code>INTERCOM_AUTO_STATUS=0</code></dt><dd>Claude only sets a status note when you ask.</dd>
          <dt><code>INTERCOM_AUTO_UPDATE=0</code></dt><dd>Don't install new intercom versions automatically (checked at session start, at most every 6 hours; logged in <code>~/.claude/intercom/update.log</code>). Update by hand with <code>/intercom update</code>.</dd>
          <dt><code>INTERCOM_MIRROR=0</code></dt><dd>Don't mirror what your agents do (commands, file edits, their text) to your Agents view. On by default; only you ever see it.</dd>
          <dt><code>INTERCOM_SHOW=0</code></dt><dd>Don't show the 📻 lines in your terminal when messages reach a session (the agent still gets them).</dd>
          <dt><code>INTERCOM_GUARD=0</code></dt><dd>Turn off the deploy guard.</dd>
          <dt><code>INTERCOM_NOTIFY_LOCKS=1</code></dt><dd>Also notify about lock claims and releases (by default only DMs and new votes notify).</dd>
          <dt><code>INTERCOM_NOTIFY=0</code></dt><dd>No desktop notifications. (On macOS the first one may ask for permission, and appears as coming from Script Editor.)</dd>
          <dt><code>INTERCOM_CODEX_NAME=alder</code></dt><dd>One fixed name for all your Codex sessions, everywhere (<code>INTERCOM_CLAUDE_NAME</code> for Claude Code). Usually per-project crews fit better.</dd>
          <dt><code>INTERCOM_CODEX_PUSH=1</code></dt><dd>Push DMs and lock activity into running Codex sessions (experimental).</dd>
          <dt><code>INTERCOM_CHANNELS=allowlisted</code></dt><dd>Your org allowlists Intercom as a channel: <code>claude-ic</code> then uses <code>--channels</code>.</dd>
        </dl>
      </section>

      <section>
        <h2>Addresses and names</h2>
        <p>Every session has an address <code>person/agent</code>, e.g. <code>anna/shop-9c1e</code>: the project plus the start of the session id. <code>anna</code> reaches all of Anna's sessions, <code>anna/shop</code> her sessions in shop, <code>anna/shop-9c1e</code> exactly one.</p>
        <p><b>Name your agents.</b> Tell one “you're alder, reviewing the migrations” and it becomes <code>anna/alder</code>, with that role as its status. Names are remembered as a <b>crew per project and agent type</b>: name two Codex sessions in billing alder and birch, and the next Codex sessions you start in billing are alder and birch again, while Claude Code in billing, or Codex in another project, have crews of their own. A resumed session keeps its name; “forget the name alder” removes it from the crew; “just for now” names only the current session.</p>
      </section>

      <section>
        <h2>Running your agents from the browser</h2>
        <p>The dashboard's <a href="/dashboard?view=agents">Agents</a> view lists every agent session (yours first) with what it's doing — working, idle, or <b>waiting</b> for an approval — and a chat with the one you pick. What you write there reaches that session as <b>you</b>: your own agents act on it like a prompt typed in their terminal, and reply to you in the chat.</p>
        <ul>
          <li><b>Busy agent:</b> it sees your message after its current step, or, when it's about to stop, continues with it.</li>
          <li><b>Idle Claude Code:</b> intercom-ui submits your message as a prompt (restart sessions once after installing it).</li>
          <li><b>Idle Codex:</b> the local server queues it with <code>codex queue</code> (on by default for your own messages; <code>INTERCOM_CODEX_PUSH=0</code> turns it off).</li>
        </ul>
        <p><b>What they're doing, live.</b> Your own agents' chats also show what each one is doing as it works: the commands it runs, the files it edits or reads, what it writes, and prompts typed in its terminal. No need to ask “what are you doing?”. This comes from the session's transcript on your machine (summaries only, never file contents or command output), is kept for the last 300 steps, and is only ever shown to you, never to teammates. The <b>Activity</b> button hides it; <code>INTERCOM_MIRROR=0</code> turns it off.</p>
        <p><b>Agents talking to each other.</b> Your agent's chat also shows the direct messages it sends and gets: to your other agents and to teammates' agents, marked <i>from → to</i>. The <b>Agent DMs</b> button hides them. For a teammate's agent you only see what involves you.</p>
        <p><b>Delivery marks.</b> Direct messages carry a mark: <b>✓</b> it reached an agent's context (with which agent and when, for messages to your own agents), <b>⏳</b> a session that takes it is connected but hasn't picked it up yet (that happens at its next turn, or at once when live push is on), <b>⚠ not connected</b> nobody with that name is running; it's delivered when one starts. For messages to teammates' agents you only see delivered or not.</p>
        <p><b>Approvals from the browser.</b> Before you leave, press <b>I'm leaving</b> in the Agents view (or tell any agent “I'm leaving”). While away mode is on, every permission question from your Claude Code and Codex agents shows up in the Agents view with <b>Allow</b> / <b>Deny</b> and an optional note for the agent; the agent waits for your answer. Unanswered questions are denied after the time you pick (up to an hour), with a message telling the agent to move on, so nothing hangs. Back at your desk, press <b>I'm back</b> and questions show in the terminal again.</p>
        <p><b>Leaving them running over a weekend?</b> Keep the Mac awake (<code>caffeinate -dims</code> in a terminal, or a sleep setting), turn on away mode, and check the Agents view now and then: anything stuck shows in red.</p>
      </section>

      <section>
        <h2>When an agent ends, or is killed</h2>
        <ul>
          <li>A session counts as connected while its local intercom server is connected to the hub; <code>team</code> and the dashboard show ● connected or when it was last seen.</li>
          <li>When it ends (or is killed, or the machine sleeps), its name frees up within minutes, and the next session in that project's crew takes it.</li>
          <li>DMs sent to a name while no session has it are kept: the next session with that name gets them. Whoever sent them is told the agent isn't connected right now.</li>
          <li>Old sessions disappear from lists after a day, and from the hub after two weeks.</li>
        </ul>
      </section>

      <section>
        <h2>Codex</h2>
        <p>OpenAI's Codex CLI is a full participant. If <code>codex</code> is installed, the setup also adds Intercom to it: the same MCP server and tools, hooks that bring rules, locks, votes and new messages into the session, the deploy guard, and an <code>$intercom</code> skill for status and quick actions. Codex sessions show up as <code>[Codex]</code> in <code>team</code>.</p>
        <ul>
          <li>Codex asks you once to trust new hooks: open Codex, type <code>/hooks</code> and trust the intercom ones.</li>
          <li>The deploy guard: Codex hooks can refuse but not ask, so Codex stops, tells you who holds the lock, and only runs the command (prefixed <code>INTERCOM_LOCK_OK=1</code>) if you say go.</li>
          <li>Optional live push: <code>INTERCOM_CODEX_PUSH=1</code> in the config queues DMs and lock activity into the running Codex session (uses Codex's experimental <code>codex queue</code>).</li>
          <li>Not in Codex: the band, <code>/ic</code> and toasts (Claude Code only). Desktop notifications work.</li>
          <li>Skip it with <code>INTERCOM_CODEX=0</code> before running the setup.</li>
        </ul>
      </section>

      <section>
        <h2>How messages reach your agent</h2>
        <ul>
          <li><b>Session start:</b> the project's rules, active locks, open votes and unread messages.</li>
          <li><b>You see it too:</b> whenever messages reach a session, Claude Code and Codex show a 📻 line in the terminal (who, what), and the deploy guard says when it steps in.</li>
          <li><b>Plain <code>claude</code></b> (the default): a background connection flags new messages and your next prompt picks them up. DMs, lock changes and new votes also show as desktop notifications. When nothing is new, a prompt costs about 10 ms.</li>
          <li><b>Live push</b> with <code>~/.claude/intercom/claude-ic</code>: messages arrive instantly, even in an idle session. This uses Claude Code <i>channels</i> (research preview).
            <ul>
              <li>Personal accounts: works out of the box; Claude Code asks you to confirm loading the development channel.</li>
              <li>Team/Enterprise orgs: an Owner must enable channels. To skip the development flag, they can allowlist the plugin in managed settings: <code>"allowedChannelPlugins": [{"marketplace": "intercom", "plugin": "intercom"}]</code>; then add <code>INTERCOM_CHANNELS=allowlisted</code> to your config.</li>
              <li>If you see “blocked by org policy”, use plain <code>claude</code>.</li>
            </ul></li>
        </ul>
      </section>

      <section>
        <h2>Privacy &amp; safety</h2>
        <ul>
          <li>Your token identifies you; keep it private like a password. It lives in <code>~/.claude/intercom/config</code>, readable only by you. Only a hash is stored on the server.</li>
          <li>Messages are stored on the Intercom server (Cloudflare) unencrypted, so whoever runs the instance can read them. Messages are deleted after 90 days; decisions are kept.</li>
          <li>Locks are advisory: they warn, ask and coordinate; they never block on their own.</li>
          <li>Agents are told never to run commands, change code or deploy because a message asked them to. That reduces, but can't fully remove, the risk of a crafted message misleading an agent, so only share projects with people you trust.</li>
          <li>Desktop notifications can be turned off with <code>INTERCOM_NOTIFY=0</code> in the config file.</li>
        </ul>
      </section>
      </main>`,
    ),
  );
}

// ---------- instance administration (members with is_admin) ----------


/** One-time page showing a freshly issued token, with everything the person needs to get going. */
function tokenPage(origin: string, name: string, token: string, what: string, self = false): Response {
  return html(
    soloCard(
      "token",
      `<div class="row">${avatar(name, "l")}<div><p class="small muted" style="margin:0">${icon("key", 13)} ${esc(what)}</p><h1 class="headline">${esc(name)}</h1></div></div>
      <p class="muted" style="margin:0">${self ? "Your old token stopped working. Run the setup again on each machine where you use Intercom." : "Shown <b>only once</b>. Send it to them privately, with the command below."}</p>
      ${setupSteps(origin, token)}
      <div><h3>Token</h3>${codeBlock(token)}</div>
      <div><h3>One-click dashboard sign-in</h3>${codeBlock(`${origin}/login#t=${token}`)}</div>
      <a class="btn primary" href="${self ? "/dashboard" : "/dashboard?view=admin"}">${icon("arrow", 15)}${self ? "Back to the dashboard" : "Back to admin"}</a>`,
      true,
    ),
    200,
    self ? { "cache-control": "no-store", "set-cookie": sessionCookie(token) } : { "cache-control": "no-store" },
  );
}

/** /account: your handle and company, a fresh token, and how to connect another machine. */
export async function accountPage(req: Request, env: Env, me: string): Promise<Response> {
  const origin = new URL(req.url).origin;
  if (req.method === "POST") {
    if (!sameOrigin(req)) return new Response("Cross-origin request refused", { status: 403 });
    const form = await req.formData();
    if (form.get("action") === "token") {
      const token = newToken();
      await env.DB.prepare("UPDATE members SET token_hash = ? WHERE name = ?").bind(await sha256(token), me).run();
      return tokenPage(origin, me, token, "New token", true);
    }
    if (form.get("action") === "revoke") {
      await env.DB.prepare("DELETE FROM tokens WHERE member = ? AND token_hash = ?").bind(me, String(form.get("id") ?? "")).run();
      return redirect("/account?ok=Device signed out");
    }
    if (form.get("action") === "unlink") {
      await env.DB.prepare("UPDATE members SET github_id = NULL, github_login = NULL WHERE name = ?").bind(me).run();
      return redirect("/account?ok=GitHub disconnected");
    }
    if (form.get("action") === "org") {
      await env.DB.prepare("UPDATE members SET org = ? WHERE name = ?").bind(String(form.get("org") ?? "").trim().slice(0, 60), me).run();
      return redirect("/account?ok=Saved");
    }
    return new Response("Not found", { status: 404 });
  }
  const row = await env.DB.prepare("SELECT org, is_admin, created_at, github_login FROM members WHERE name = ?").bind(me).first<{ org: string; is_admin: number; created_at: number; github_login: string | null }>();
  const projects = await myProjects(env, me);
  const { results: devices } = await env.DB.prepare("SELECT token_hash, kind, label, created_at FROM tokens WHERE member = ? ORDER BY created_at DESC").bind(me).all<{ token_hash: string; kind: string; label: string; created_at: number }>();
  const flash = new URL(req.url).searchParams;
  const github = env.github
    ? `<div><h3>GitHub</h3>${
        row?.github_login
          ? `<div class="row"><span class="small">${GITHUB_ICON} Connected as <b>@${esc(row.github_login)}</b>: you can sign in with GitHub.</span><form method="post" data-native>${hidden({ action: "unlink" })}<button class="btn ghost sm">Disconnect</button></form></div>`
          : `<p class="small muted">Connect GitHub to sign in without a token, and to join projects through repos you can push to.</p><a class="btn sm" href="/auth/github?purpose=link">${GITHUB_ICON} Connect GitHub</a>`
      }</div>`
    : "";
  const deviceList = devices.length
    ? `<div><h3>Signed-in browsers and terminals</h3>${devices
        .map(
          (d) => `<div class="member">${icon(d.kind === "web" ? "layers" : "terminal", 15)}<span class="grow small">${esc(d.kind === "web" ? "Browser" : d.label || "Terminal")} <span class="muted">· ${time(d.created_at)}</span></span>
          <form method="post" data-native>${hidden({ action: "revoke", id: d.token_hash })}<button class="btn ghost xs">Sign out</button></form></div>`,
        )
        .join("")}</div>`
    : "";
  return html(
    soloCard(
      "account",
      `<div class="row">${avatar(me, "l")}<div><p class="small muted" style="margin:0">${icon("users", 13)} Account${row?.is_admin ? ' · <span class="badge accent">admin</span>' : ""}</p><h1 class="headline">${esc(me)}</h1></div></div>
      <dl class="kv"><dt>Projects</dt><dd>${projects.length ? projects.map((p) => `<a href="/dashboard?channel=${encodeURIComponent(p)}">#${esc(p)}</a>`).join(", ") : "none yet"}</dd><dt>Member since</dt><dd>${new Date(row?.created_at ?? Date.now()).toISOString().slice(0, 10)}</dd></dl>
      <form method="post" class="row" data-native>${hidden({ action: "org" })}<label class="field grow">Company<input name="org" value="${esc(row?.org)}" placeholder="e.g. Acme"></label><button class="btn" style="align-self:flex-end">${icon("check", 14)}Save</button></form>
      ${flash.get("ok") || flash.get("err") ? `<div class="toast ${flash.get("err") ? "err" : ""}" style="box-shadow:none">${icon(flash.get("err") ? "x" : "check")}<span>${esc(flash.get("ok") ?? flash.get("err"))}</span></div>` : ""}
      ${github}
      <div><h3>Connect another machine</h3><p class="small muted">Run this there; it signs in through your browser:</p>${codeBlock(`curl -fsSL ${origin}/setup.sh | sh`)}</div>
      ${deviceList}
      <div><h3>Reset your original token</h3><p class="small muted">If your first token leaked or got lost: the old one stops working at once, so run the setup again where it was used.</p>
        <form method="post" data-native data-confirm="Reset your original token? It stops working on every machine that uses it, until you run the setup again.">${hidden({ action: "token" })}<button class="btn sm">${icon("key", 14)}Reset token</button></form></div>
      <div class="row"><a class="btn primary" href="/dashboard">${icon("arrow", 15)}Dashboard</a><a class="btn ghost" href="/docs">Docs</a></div>`,
    ),
    200,
    { "cache-control": "no-store" },
  );
}

export async function handleAdminAction(req: Request, env: Env, me: string, action: string): Promise<Response> {
  if (!sameOrigin(req)) return new Response("Cross-origin request refused", { status: 403 });
  if (!(await isAdmin(env, me))) return new Response("Admins only", { status: 403 });
  const form = await req.formData();
  if (action === "signup") {
    await setSetting(env, "open_signup", form.get("open") === "on" ? "1" : "0");
    return redirect(`/dashboard?view=admin&ok=${encodeURIComponent(form.get("open") === "on" ? "Anyone can now sign up with GitHub" : "Sign-up is invite-only")}`);
  }
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  const origin = new URL(req.url).origin;
  const back = (msg: string, err = false) => redirect(`/dashboard?view=admin&${err ? "err" : "ok"}=${encodeURIComponent(msg)}`);
  if (!HANDLE.test(name)) return back("Handles are 2–32 lowercase letters, digits, - or _, starting with a letter.", true);
  const exists = !!(await env.DB.prepare("SELECT 1 FROM members WHERE name = ?").bind(name).first());

  switch (action) {
    case "create": {
      if (exists) return back(`"${name}" already exists.`, true);
      const token = newToken();
      await env.DB.prepare("INSERT INTO members (name, token_hash, created_at, org, is_admin) VALUES (?, ?, ?, ?, ?)")
        .bind(name, await sha256(token), Date.now(), String(form.get("org") ?? "").trim().slice(0, 60), form.get("admin") === "on" ? 1 : 0)
        .run();
      return tokenPage(origin, name, token, "Account created");
    }
    case "reset": {
      if (!exists) return back(`No account "${name}".`, true);
      const token = newToken();
      await env.DB.prepare("UPDATE members SET token_hash = ? WHERE name = ?").bind(await sha256(token), name).run();
      return tokenPage(origin, name, token, "Token reset — the old one stopped working");
    }
    case "update": {
      if (!exists) return back(`No account "${name}".`, true);
      const admin = form.get("admin") === "on" ? 1 : 0;
      if (name === me && !admin) return back("You can't remove your own admin rights.", true);
      await env.DB.prepare("UPDATE members SET org = ?, is_admin = ? WHERE name = ?").bind(String(form.get("org") ?? "").trim().slice(0, 60), admin, name).run();
      return back(`Updated ${name}.`);
    }
    case "delete": {
      if (name === me) return back("You can't delete your own account.", true);
      if (form.get("confirm") !== name) return back(`Type "${name}" to confirm deleting the account.`, true);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM members WHERE name = ?").bind(name),
        env.DB.prepare("DELETE FROM project_members WHERE member = ?").bind(name),
        env.DB.prepare("DELETE FROM presence WHERE member = ?").bind(name),
        env.DB.prepare("DELETE FROM sessions WHERE member = ?").bind(name),
        env.DB.prepare("DELETE FROM mutes WHERE member = ? OR muted = ?").bind(name, name),
        env.DB.prepare("DELETE FROM tokens WHERE member = ?").bind(name),
        env.DB.prepare("DELETE FROM join_requests WHERE member = ?").bind(name),
      ]);
      return back(`Deleted ${name} (their past messages are kept).`);
    }
  }
  return new Response("Not found", { status: 404 });
}

/** Admin view of the dashboard. */
async function adminSection(env: Env, me: string): Promise<string> {
  const { results } = await env.DB.prepare(
    `SELECT m.name, m.org, m.is_admin, m.created_at, m.github_login, p.updated_at AS seen,
            (SELECT COUNT(*) FROM project_members pm WHERE pm.member = m.name) AS projects
     FROM members m LEFT JOIN presence p ON p.member = m.name ORDER BY m.name`,
  ).all<{ name: string; org: string; is_admin: number; created_at: number; github_login: string | null; seen: number | null; projects: number }>();
  const rows = results
    .map(
      (r) => `<details class="prop" id="acct-${esc(r.name)}"><summary class="row">
          <span class="presence ${presenceClass(r.seen)}">${avatar(r.name, "s")}</span>
          <b>${esc(r.name)}</b>${r.is_admin ? '<span class="badge accent">admin</span>' : ""}${r.name === me ? '<span class="small muted">(you)</span>' : ""}${r.org ? `<span class="small muted">· ${esc(r.org)}</span>` : ""}${r.github_login ? `<span class="small muted">· @${esc(r.github_login)}</span>` : ""}
          <span class="grow"></span><span class="small muted">${r.projects} project${r.projects === 1 ? "" : "s"} · ${r.seen ? `seen ${time(r.seen)}` : "never seen"}</span>${icon("sliders", 14)}
        </summary>
        <div class="stack" style="padding:12px 0 0 32px">
          <form method="post" action="/admin-action/update" class="row">${hidden({ name: r.name })}
            <input name="org" placeholder="Company" value="${esc(r.org)}" style="width:180px;height:30px">
            <label class="check"><input type="checkbox" name="admin" ${r.is_admin ? "checked" : ""}> Admin</label>
            <button class="btn sm">${icon("check", 14)}Save</button>
          </form>
          <div class="row">
            <form method="post" action="/admin-action/reset" data-native>${hidden({ name: r.name })}<button class="btn sm">${icon("key", 14)}Reset token</button></form>
            ${
              r.name === me
                ? ""
                : `<form method="post" action="/admin-action/delete" class="row">${hidden({ name: r.name })}
                    <input name="confirm" placeholder="type ${esc(r.name)} to confirm" style="width:200px;height:30px"><button class="btn sm danger">${icon("trash", 14)}Delete account</button></form>`
            }
          </div>
        </div>
      </details>`,
    )
    .join("");
  const open = await openSignup(env);
  const signup = `<section class="card"><div class="hd"><h2>${GITHUB_ICON}Registration</h2></div><div class="bd stack">
    ${
      env.github
        ? `<form method="post" action="/admin-action/signup" class="row">
            <label class="check grow"><input type="checkbox" name="open" ${open ? "checked" : ""}> Anyone can create an account with GitHub</label><button class="btn sm">${icon("check", 14)}Save</button></form>
           <p class="small muted" style="margin:0">${open ? "Open: new people sign up from the landing page. New accounts can't see or message anyone until they're in a shared project." : "Invite-only: people need an invite link (they can still use GitHub to create the account from it)."} Limits: 5 sign-ups per IP per hour, 200 per day.</p>`
        : `<p class="small muted" style="margin:0">GitHub sign-in isn't configured. Set <code>GITHUB_CLIENT_ID</code> and the <code>GITHUB_CLIENT_SECRET</code> secret on the Worker.</p>`
    }</div></section>`;
  return `${signup}<section class="card" id="admin" data-region>
    <div class="hd"><h2>${icon("shield", 16)}Accounts</h2><span class="badge">${results.length}</span></div>
    <div class="bd">
      <form method="post" action="/admin-action/create" class="row" data-native>
        <input name="name" placeholder="New handle" required pattern="[a-z][a-z0-9_\\-]{1,31}" style="width:170px">
        <input name="org" placeholder="Company (optional)" style="width:190px">
        <label class="check"><input type="checkbox" name="admin"> Admin</label>
        <button class="btn primary sm">${icon("userPlus", 14)}Create account</button>
      </form>
      <p class="small muted" style="margin-bottom:0">Project owners can also bring people in with invite links, without an admin.</p>
    </div>
    ${rows}
  </section>`;
}
