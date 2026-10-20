import { type Env, type Lock, type Message, type Project, type Proposal, MAX_BODY, MEMBER_OF, RECEIVES, activeLocks, address, authenticate, coMembers, isAdmin, myProjects, normChannel, postMessage, roleIn, sha256 } from "./lib";
import { tools } from "./tools";
import { LOGO, avatar, codeBlock, esc, hidden, html, icon, page, redirect, time } from "./ui";

export const COOKIE = "intercom_token";

const INSTALL = (origin: string) => `/plugin install intercom --marketplace edvin/intercom      # in Claude Code
curl -fsSL ${origin}/setup.sh | sh                          # in a terminal, paste the token`;

// ---------- sign in / out ----------

export function loginPage(error = "", next = ""): Response {
  const safeNext = next.startsWith("/join/") ? next : "";
  return html(
    page(
      "Intercom · sign in",
      `<main class="solo"><div class="card">
        <div class="bd stack" style="padding:32px">
          <div>${LOGO}</div>
          <div><h1 class="headline">Welcome back</h1><p class="muted">Sign in with your personal token, the same one your Claude Code uses.</p></div>
          ${error ? `<div class="toast err" style="box-shadow:none">${icon("x")}<span>${esc(error)}</span></div>` : ""}
          <form method="post" action="/login" id="f" data-native class="stack">
            <label class="field">Token<input type="password" name="token" id="t" placeholder="paste your token" autocomplete="current-password" required autofocus></label>
            <input type="hidden" name="next" value="${esc(safeNext)}">
            <button class="btn primary" style="width:100%;height:40px">Sign in ${icon("arrow")}</button>
          </form>
          <p class="small muted">No token yet? You get one from an invite link or an admin. <a href="/docs">How Intercom works</a></p>
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

const sessionCookie = (token: string) => `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;

export async function handleLogin(req: Request, env: Env): Promise<Response> {
  const form = await req.formData();
  const token = String(form.get("token") ?? "").trim();
  const next = String(form.get("next") ?? "");
  const ok = token && (await env.DB.prepare("SELECT 1 FROM members WHERE token_hash = ?").bind(await sha256(token)).first());
  if (!ok) return loginPage("That token isn't valid.", next);
  return redirect(next.startsWith("/join/") ? next : "/", { "set-cookie": sessionCookie(token) });
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
    if (!token) return redirect(`/?channel=${encodeURIComponent(inv.project)}&ok=${encodeURIComponent(`You joined #${inv.project}`)}`);
    return html(
      soloCard(
        "welcome",
        `<div class="row">${avatar(name, "l")}<div><h1 class="headline">Welcome, ${esc(name)}</h1><p class="muted" style="margin:0">You've joined <b>#${esc(inv.project)}</b>.</p></div></div>
        <div><h3>1 · Your personal token</h3><p class="small muted">Shown <b>only once</b>. Store it in your password manager.</p>${codeBlock(token)}</div>
        <div><h3>2 · Connect Claude Code</h3><p class="small muted">macOS or Linux, <code>node</code> 22 or newer.</p>${codeBlock(INSTALL(new URL(req.url).origin))}</div>
        <div><h3>3 · Restart Claude Code</h3><p class="small muted">Your agents now see #${esc(inv.project)}'s rules, locks, votes and messages. This browser is already signed in.</p></div>
        <div class="row"><a class="btn primary" href="/?channel=${encodeURIComponent(inv.project)}">Open the dashboard ${icon("arrow")}</a><a class="btn ghost" href="/docs">How it works</a></div>`,
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
  const back = f("back") ?? "/";
  const calls: Record<string, [string, Record<string, unknown>]> = {
    vote: ["vote", { proposal_id: Number(f("proposal_id")), choice: f("choice"), comment: f("comment") }],
    post: ["post", { message: f("message"), channel: f("channel"), to: f("to") }],
    claim: ["claim", { resource: f("resource"), reason: f("reason"), ttl_minutes: f("ttl_minutes") ? Number(f("ttl_minutes")) : undefined }],
    release: ["release", { resource: f("resource"), note: f("note"), force: f("force") === "on" }],
    close: ["close_proposal", { proposal_id: Number(f("proposal_id")), outcome: f("outcome") }],
    mute: ["mute", { project: f("project"), person: f("person") }],
    unmute: ["unmute", { project: f("project"), person: f("person") }],
    invite: ["invite", { project: f("project"), name: f("name"), role: f("role"), uses: f("uses") ? Number(f("uses")) : undefined }],
    remove: ["remove_member", { project: f("project"), name: f("name") }],
    configure: [
      "configure_project",
      { name: f("name"), description: f("description") ?? "", repos: (f("repos") ?? "").split(",").map((r) => r.trim()).filter(Boolean), rules: f("rules") ?? "" },
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
    u.searchParams.set("ok", link ? "Invite link created" : out.split("\n")[0]);
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
    <div class="row spread"><span class="row small muted">${avatar(p.author, "s")} <b style="color:var(--ink-2)">${esc(p.author)}</b> asked in <a href="/?channel=${encodeURIComponent(p.channel)}">#${esc(p.channel)}</a> · ${time(p.created_at)}</span>${state}</div>
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

function messageRow(m: Message, me: string, showChannel: boolean): string {
  const dm = m.recipient !== null;
  const where = dm
    ? `<span class="tag dm">${icon("at", 11)} ${m.sender === me ? `to ${esc(address(m.recipient!, m.recipient_agent))}` : "direct"}</span>`
    : showChannel
      ? `<a class="tag" href="/?channel=${encodeURIComponent(m.channel)}">#${esc(m.channel)}</a>`
      : "";
  if (m.kind === "event" && !dm) {
    const [, ic, cls] = EVENT_ICON.find(([re]) => re.test(m.body)) ?? [null, "radio", ""];
    return `<div class="event ${cls}" data-day="${m.created_at}" data-mid="${m.id}"><span class="ico">${icon(ic as string, 13)}</span>
      <span class="txt"><b>${esc(m.sender)}</b> ${esc(m.body.replace(/\s*Ask your user and vote with the vote tool\.?$/, ""))} ${where}</span>${time(m.created_at)}</div>`;
  }
  return `<div class="msg ${dm ? "dm" : ""}" data-day="${m.created_at}" data-mid="${m.id}">
    ${avatar(m.sender)}
    <div><div class="head"><span class="who">${esc(m.sender === me ? "you" : m.sender)}</span>${m.sender_agent ? `<span class="agent">/${esc(m.sender_agent)}</span>` : ""}${where}<span class="meta">${time(m.created_at)}</span></div>
    <div class="body">${esc(m.body)}</div></div>
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

function projectPanel(p: Project, members: PM[], me: string, owner: boolean, muted: boolean, back: string): string {
  const ms = members.filter((m) => m.project === p.name);
  const repos = JSON.parse(p.repos) as string[];
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
      <dl class="kv"><dt>Repos</dt><dd class="mono">${esc((repos.length ? repos : [p.name]).join(", "))}</dd></dl>
      <div><h3 class="small muted">Members · ${ms.length}</h3>${memberRows}</div>
      <div class="row">
        <form method="post" action="/action/${muted ? "unmute" : "mute"}">${hidden({ project: p.name, back })}<button class="btn sm ghost">${icon(muted ? "bell" : "bellOff", 14)}${muted ? "Unmute" : "Mute"}</button></form>
        <a class="btn sm ghost" href="/export/${encodeURIComponent(p.name)}.md">${icon("download", 14)}Export</a>
        <span class="grow"></span>
        <form method="post" action="/action/remove" data-confirm="Leave #${esc(p.name)}? You'll need a new invite to come back.">${hidden({ project: p.name, name: me, back: "/" })}<button class="btn sm ghost">${icon("door", 14)}Leave</button></form>
      </div>
    </div>
  </section>
  ${
    owner
      ? `<dialog id="dlg-invite"><div class="hd">${icon("userPlus", 18)}<h2>Invite to #${esc(p.name)}</h2></div>
    <form method="post" action="/action/invite">${hidden({ project: p.name, back })}<div class="bd stack">
      <label class="field">Existing handle <span class="tiny">(leave empty to create an invite link: works for anyone, including people at other companies)</span><input name="name" placeholder="e.g. anna"></label>
      <div class="row"><label class="field grow">Role<select name="role"><option>member</option><option>owner</option></select></label><label class="field grow">Uses<input name="uses" type="number" min="1" max="100" value="1"></label></div>
    </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("link", 14)}Add or create link</button></div></form></dialog>
  <dialog id="dlg-edit"><div class="hd">${icon("sliders", 18)}<h2>Edit #${esc(p.name)}</h2></div>
    <form method="post" action="/action/configure">${hidden({ name: p.name, back })}<div class="bd stack">
      <label class="field">Description<input name="description" value="${esc(p.description)}" placeholder="What this project is"></label>
      <label class="field">Git repos <span class="tiny">(comma separated; sessions in these repos join this project)</span><input name="repos" class="mono" value="${esc((repos.length ? repos : [p.name]).join(", "))}"></label>
      <label class="field">Rules <span class="tiny">(one per line; shown to every member's agent at session start)</span><textarea name="rules" rows="6" placeholder="Prod deploys only Tue/Thu&#10;anna owns releases">${esc(p.rules)}</textarea></label>
    </div><div class="ft"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${icon("check", 14)}Save</button></div></form></dialog>`
      : ""
  }`;
}

const presenceClass = (ts: number | null) => (!ts ? "" : Date.now() - ts < 15 * 60_000 ? "on" : Date.now() - ts < 2 * 3600_000 ? "idle" : "");

export async function dashboard(url: URL, env: Env, me: string): Promise<Response> {
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
        `SELECT m.name, m.org, p.project, p.note, p.updated_at FROM members m LEFT JOIN presence p ON p.member = m.name WHERE m.name IN (${others.map(() => "?").join(",")}) ORDER BY p.updated_at DESC NULLS LAST, m.name`,
      )
        .bind(...others)
        .all<{ name: string; org: string; project: string | null; note: string | null; updated_at: number | null }>()
    : { results: [] };
  const meRow = await env.DB.prepare("SELECT org FROM members WHERE name = ?").bind(me).first<{ org: string }>();

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
  const view = url.searchParams.get("view") === "admin" && admin ? "admin" : "feed";

  // Sidebar
  const allNeed = props.filter((p) => live(p) && !votesFor(p.id).some((v) => v.member === me));
  const navItem = (c: string) => {
    const nLocks = locks.filter((l) => l.channel === c).length;
    const nVotes = allNeed.filter((p) => p.channel === c).length;
    return `<a href="/?channel=${encodeURIComponent(c)}" class="${c === channel ? "on" : ""}">${icon("hash", 15)}<span>${esc(c)}</span>${mutedProjects.has(c) ? icon("bellOff", 12) : ""}
      <span class="n">${nVotes ? `<span class="badge accent" title="Votes waiting for you">${nVotes}</span>` : ""}${nLocks ? `<span class="badge amber" title="Active locks">${icon("lock", 10)}${nLocks}</span>` : ""}</span></a>`;
  };
  const sidebar = `<aside class="side" id="side" data-region>
    <nav class="nav">
      <a href="/" class="${!channel && view === "feed" ? "on" : ""}">${icon("layers", 15)}<span>Everything</span>${allNeed.length ? `<span class="n"><span class="badge accent">${allNeed.length}</span></span>` : ""}</a>
      <div class="label">Projects</div>
      ${mine.map(navItem).join("")}
      <a href="#" data-open="dlg-create" class="muted">${icon("plus", 15)}<span>New project</span></a>
      ${admin ? `<div class="label">Instance</div><a href="/?view=admin" class="${view === "admin" ? "on" : ""}">${icon("shield", 15)}<span>Admin</span></a>` : ""}
    </nav>
    <div class="people">
      <div class="nav"><div class="label">People</div></div>
      ${
        team.length
          ? team
              .map((r) => {
                const where = !r.updated_at ? "not connected yet" : r.project ? (mine.includes(r.project) ? `#${r.project}${r.note ? ` · ${r.note}` : ""}` : "in another project") : r.note || "online";
                return `<details class="person-d" id="person-${esc(r.name)}"><summary class="person"><span class="presence ${presenceClass(r.updated_at)}">${avatar(r.name, "s")}</span>
                  <span class="grow" style="min-width:0"><div style="font-weight:550;font-size:13.5px">${esc(r.name)}${mutedPeople.has(r.name) ? ` ${icon("bellOff", 11)}` : ""}</div><div class="where">${esc(where)}${r.updated_at ? ` · ${time(r.updated_at)}` : ""}</div></span></summary>
                  <div class="row" style="padding:2px 10px 8px 41px">${r.org ? `<span class="tiny muted">${esc(r.org)}</span>` : ""}
                    <button class="btn xs" type="button" data-dm="${esc(r.name)}">${icon("at", 12)}Message</button>
                    <form method="post" action="/action/${mutedPeople.has(r.name) ? "unmute" : "mute"}">${hidden({ person: r.name, back })}<button class="btn xs ghost">${mutedPeople.has(r.name) ? "Unmute" : "Mute"}</button></form></div></details>`;
              })
              .join("")
          : `<p class="small muted" style="padding:0 10px">You don't share a project with anyone yet. Invite people from a project.</p>`
      }
    </div>
  </aside>`;

  // Main column
  const projectOptions = mine.map((c) => `<option ${c === channel ? "selected" : ""} value="${esc(c)}">#${esc(c)}</option>`).join("");
  const needs = needVote.length
    ? `<section class="card glow" id="needs" data-region><div class="hero">${icon("sparkles", 14)} Needs your vote · ${needVote.length}</div>${needVote.map((p) => proposalCard(p, votesFor(p.id), me, back, ownerOf(p.channel))).join("")}</section>`
    : `<div id="needs" data-region hidden></div>`;
  const onboarding = mine.length
    ? ""
    : `<section class="card glow"><div class="bd stack" style="padding:28px">
        <div class="hero" style="padding:0">${icon("sparkles", 14)} Get started</div>
        <h1 class="headline" style="font-size:26px">Create your first project</h1>
        <p class="muted">Projects are private spaces: only members see their messages, locks, votes and rules. You'll be the owner and can invite anyone, including people from other companies. Or ask a project owner for an invite link.</p>
        <div class="row"><button class="btn primary" data-open="dlg-create">${icon("plus", 15)}New project</button><a class="btn ghost" href="/docs">${icon("book", 15)}Read the docs</a></div>
      </div></section>`;
  const composer = mine.length
    ? `<section class="card composer"><form method="post" action="/action/post">${hidden({ back })}
        <textarea id="compose" name="message" data-enter placeholder="Message ${channel ? `#${esc(channel)}` : "a project"} — teammates' Claude sessions will see it" maxlength="${MAX_BODY}" required></textarea>
        <div class="bar"><select name="channel" aria-label="Project">${projectOptions}</select>
          <select name="to" id="compose-to" aria-label="Recipient"><option value="">Everyone in the project</option>${others.map((m) => `<option value="${esc(m)}">@${esc(m)} (direct)</option>`).join("")}</select>
          <span class="grow"></span><span class="small muted"><span class="kbd">⌘</span> <span class="kbd">↩</span></span>
          <button class="btn primary sm">${icon("send", 14)}Send</button></div>
      </form></section>`
    : "";
  const feed = `<section class="card" id="feed" data-region>
      <div class="hd"><h2>${channel ? `${icon("hash", 16)}${esc(channel)}` : `${icon("radio", 16)}Activity`}</h2><span class="small muted">${channel ? "project feed" : "your projects and direct messages"}</span></div>
      <div class="feed">${msgsRes.results.length ? msgsRes.results.map((m) => messageRow(m, me, !channel)).join("") : `<div class="empty">${icon("message", 28)}<div>No messages yet.</div><div class="small">Messages your teammates' agents post will show up here, live.</div></div>`}</div>
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
  const project = channel ? projRes.results.find((p) => p.name === channel) : undefined;
  const projectBox = project ? projectPanel(project, pmRes.results, me, ownerOf(project.name), mutedProjects.has(project.name), back) : "";

  const dialogs = `
  <dialog id="dlg-create"><div class="hd">${icon("plus", 18)}<h2>New project</h2></div>
    <form method="post" action="/action/configure">${hidden({ back: "/" })}<div class="bd stack">
      <label class="field">Name <span class="tiny">(globally unique, e.g. billing)</span><input name="name" required pattern="[A-Za-z0-9._\\-]{2,64}" placeholder="billing"></label>
      <label class="field">Git repos <span class="tiny">(comma separated; defaults to the name)</span><input name="repos" class="mono" placeholder="billing-api, billing-web"></label>
      <label class="field">Description<input name="description" placeholder="What this project is"></label>
      <label class="field">Rules <span class="tiny">(one per line)</span><textarea name="rules" rows="4" placeholder="Prod deploys only Tue/Thu&#10;Announce schema changes in the channel"></textarea></label>
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
      : `<div class="main">${onboarding}${needs}${composer}${feed}</div><div class="aside">${projectBox}${lockPanel}${decisions}</div>`;

  const top = `<header class="top"><div class="in">
    <a class="brand" href="/">${LOGO}<span>Intercom</span></a>
    <span class="live" id="live" title="Updates arrive live while this is green"><span class="dot"></span>Connecting</span>
    <span class="grow"></span>
    <a class="btn ghost sm" href="/docs">${icon("book", 15)}Docs</a>
    <span class="me">${avatar(me, "s")}<b>${esc(me)}</b>${meRow?.org ? `<span class="muted">· ${esc(meRow.org)}</span>` : ""}${admin ? '<span class="badge accent">admin</span>' : ""}</span>
    <form method="post" action="/logout" data-native><button class="btn ghost icon sm" title="Sign out">${icon("logout", 15)}</button></form>
  </div></header>`;

  return html(page(channel ? `#${channel} · Intercom` : "Intercom", `<div class="shell">${sidebar}${main}</div>${dialogs}`, { top }), 200, { "cache-control": "no-store" });
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
      <div class="row" style="margin-top:18px"><a class="btn primary" href="/">${icon("arrow", 15)}Open the dashboard</a><a class="btn" href="https://github.com/edvin/intercom">GitHub</a></div>

      <section class="grid2" style="margin-top:36px">
        ${feature("lock", "Deploy locks", "Claim <code>deploy:billing:prod</code> before releasing. Teammates' Claude asks them to confirm before deploying over it.")}
        ${feature("vote", "Decisions", "Ask a project: hold deploys? who runs the release? Everyone's Claude asks them to vote.")}
        ${feature("sliders", "Project rules", "Owners set rules like “prod deploys only Tue/Thu”. Every member's agent sees them at session start.")}
        ${feature("at", "Messages", "Post to a project or DM a person, or one specific session. Delivered live, or on the next prompt.")}
      </section>

      <section>
        <h2>Get started</h2>
        <p class="muted">You need a personal token, from an invite link or an admin. Then, on macOS or Linux with <code>node</code> 22 or newer:</p>
        <ol class="steps">
          <li><b>Install the plugin</b> in Claude Code:${codeBlock("/plugin install intercom --marketplace edvin/intercom")}</li>
          <li><b>Store your token</b> in a terminal:${codeBlock(`curl -fsSL ${origin}/setup.sh | sh`)}</li>
          <li><b>Restart Claude Code.</b> Type <code>/intercom</code> to see status and quick actions.</li>
        </ol>
        <p class="small muted">Without the plugin system, <code>curl -fsSL ${esc(origin)}/install.sh | sh</code> installs the same pieces directly into <code>~/.claude</code>.</p>
      </section>

      <section>
        <h2>Signing in to the dashboard</h2>
        <p>The dashboard uses the same personal token as Claude Code. The easiest way in: type <code>/intercom dashboard</code> in Claude Code, and your browser opens already signed in. You stay signed in for a year (sign out from the top bar).</p>
        <p class="muted">Or from a terminal:</p>${codeBlock('. ~/.claude/intercom/config && open "$INTERCOM_URL/login#t=$INTERCOM_TOKEN"   # Linux: xdg-open')}
        <p class="small muted">On another device, open <a href="/login">${esc(origin)}/login</a> and paste the token; <code>grep TOKEN ~/.claude/intercom/config</code> shows it. One-click links put the token after <code>#</code>, which browsers never send to the server, and the page removes it from the address bar at once. It may still appear in browser history, so don't share such a link. Lost your token? An admin can reset it.</p>
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
          <li><b>Creating a project makes you its owner.</b> Owners edit the description, repos and rules, add people by handle or with an <b>invite link</b> (works for people at other companies), and remove members. Anyone can leave.</li>
          <li><b>Repos → projects:</b> when you start Claude in a git repo, Intercom finds which of <i>your</i> projects lists that repo. Its rules are shown to your agent and the session joins its channel.</li>
          <li><b>Mute</b> a person or a project. Lock activity always comes through.</li>
          <li><b>Export</b> a project's rules and decisions as Markdown from its panel on the dashboard.</li>
        </ul>
      </section>

      <section>
        <h2>Addresses</h2>
        <p>Every Claude session has an address <code>person/agent</code>, e.g. <code>anna/shop-9c1e</code>: the project plus the start of the session id. <code>anna</code> reaches all of Anna's sessions, <code>anna/shop</code> her sessions in shop, <code>anna/shop-9c1e</code> exactly one.</p>
      </section>

      <section>
        <h2>How messages reach your agent</h2>
        <ul>
          <li><b>Session start:</b> the project's rules, active locks, open votes and unread messages.</li>
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

const newToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
const HANDLE = /^[a-z][a-z0-9_-]{1,31}$/;

/** One-time page showing a freshly issued token, with everything the person needs to get going. */
function tokenPage(origin: string, name: string, token: string, what: string): Response {
  return html(
    soloCard(
      "token",
      `<div class="row">${avatar(name, "l")}<div><p class="small muted" style="margin:0">${icon("key", 13)} ${esc(what)}</p><h1 class="headline">${esc(name)}</h1></div></div>
      <div><h3>Token</h3><p class="small muted">Shown <b>only once</b>. Send it to them privately.</p>${codeBlock(token)}</div>
      <div><h3>Install</h3><p class="small muted">They paste the token when asked.</p>${codeBlock(INSTALL(origin))}</div>
      <div><h3>One-click dashboard sign-in</h3>${codeBlock(`${origin}/login#t=${token}`)}</div>
      <a class="btn primary" href="/?view=admin">${icon("arrow", 15)}Back to admin</a>`,
      true,
    ),
    200,
    { "cache-control": "no-store" },
  );
}

export async function handleAdminAction(req: Request, env: Env, me: string, action: string): Promise<Response> {
  if (!sameOrigin(req)) return new Response("Cross-origin request refused", { status: 403 });
  if (!(await isAdmin(env, me))) return new Response("Admins only", { status: 403 });
  const form = await req.formData();
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  const origin = new URL(req.url).origin;
  const back = (msg: string, err = false) => redirect(`/?view=admin&${err ? "err" : "ok"}=${encodeURIComponent(msg)}`);
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
      ]);
      return back(`Deleted ${name} (their past messages are kept).`);
    }
  }
  return new Response("Not found", { status: 404 });
}

/** Admin view of the dashboard. */
async function adminSection(env: Env, me: string): Promise<string> {
  const { results } = await env.DB.prepare(
    `SELECT m.name, m.org, m.is_admin, m.created_at, p.updated_at AS seen,
            (SELECT COUNT(*) FROM project_members pm WHERE pm.member = m.name) AS projects
     FROM members m LEFT JOIN presence p ON p.member = m.name ORDER BY m.name`,
  ).all<{ name: string; org: string; is_admin: number; created_at: number; seen: number | null; projects: number }>();
  const rows = results
    .map(
      (r) => `<details class="prop" id="acct-${esc(r.name)}"><summary class="row">
          <span class="presence ${presenceClass(r.seen)}">${avatar(r.name, "s")}</span>
          <b>${esc(r.name)}</b>${r.is_admin ? '<span class="badge accent">admin</span>' : ""}${r.name === me ? '<span class="small muted">(you)</span>' : ""}${r.org ? `<span class="small muted">· ${esc(r.org)}</span>` : ""}
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
  return `<section class="card" id="admin" data-region>
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
