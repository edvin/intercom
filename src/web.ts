import { type Env, type Lock, type Message, type Project, type Proposal, MAX_BODY, MEMBER_OF, RECEIVES, activeLocks, address, ago, authenticate, coMembers, isAdmin, myProjects, normChannel, postMessage, sha256, until } from "./lib";
import { tools } from "./tools";

export const COOKIE = "intercom_token";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });

const redirect = (to: string, headers: Record<string, string> = {}) => new Response(null, { status: 303, headers: { location: to, ...headers } });

const STYLE = `
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1b;--mute:#6b6a65;--line:#e4e2dc;--accent:#2f5bd3;--warn:#b5481b;--ok:#2e7d4f;--chip:#efeee9;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--ink:#ecebe6;--mute:#9d9b94;--line:#33322e;--accent:#7a9bff;--warn:#f08a5d;--ok:#6fcf97;--chip:#2a2a27;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1080px;margin:0 auto;padding:24px 16px 64px}
header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px}
h1{font-size:22px;margin:0}h1 span{color:var(--mute);font-weight:400}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin:0 0 10px}
.grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:20px}@media(max-width:800px){.grid{grid-template-columns:1fr}}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:20px}
.item{padding:10px 0;border-top:1px solid var(--line)}.item:first-of-type{border-top:0;padding-top:0}
.q{font-weight:600}.meta{color:var(--mute);font-size:13px}.empty{color:var(--mute);font-style:italic}
.chip{display:inline-block;background:var(--chip);border-radius:999px;padding:1px 9px;font-size:12px;margin:2px 4px 2px 0}
.chip.win{background:var(--ok);color:var(--card)}
.need{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.lock{color:var(--warn)}.mine{color:var(--accent)}
.msg{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;padding:6px 0;border-top:1px solid var(--line);font-size:14px}
.msg:first-of-type{border-top:0}.msg .who{font-weight:600;white-space:nowrap}.msg .body{white-space:pre-wrap;overflow-wrap:anywhere}
.msg.event .body{color:var(--mute)}.msg.dm .who{color:var(--accent)}
form.inline{display:inline}button{font:inherit;font-size:13px;padding:4px 12px;border-radius:8px;border:1px solid var(--line);background:var(--chip);color:var(--ink);cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}button:hover{filter:brightness(.95)}
input,select,textarea{font:inherit;font-size:14px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);max-width:100%}
textarea{width:100%;min-height:60px;resize:vertical}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
nav a{color:var(--accent);text-decoration:none;margin-right:10px;font-size:13px}nav a.on{font-weight:700;text-decoration:underline}
.flash{background:var(--chip);border-left:3px solid var(--accent);padding:8px 12px;border-radius:6px;margin-bottom:16px}
.flash.err{border-color:var(--warn)}
`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

export function loginPage(error = "", next = ""): Response {
  const safeNext = next.startsWith("/join/") ? next : "";
  return html(
    page(
      "Intercom · sign in",
      `<header><h1>Intercom</h1><nav><a href="/docs">What is this?</a></nav></header>
      <section style="max-width:460px">
        <h2>Sign in</h2>
        ${error ? `<div class="flash err">${esc(error)}</div>` : ""}
        <form method="post" action="/login" id="f">
          <p class="meta">Paste your personal token (the same one your Claude Code uses).</p>
          <input type="password" name="token" id="t" placeholder="token" style="width:100%" autocomplete="current-password" required>
          <input type="hidden" name="next" value="${esc(safeNext)}">
          <div class="row"><button class="primary">Sign in</button></div>
        </form>
      </section>
      <script>
        // Support one-click links of the form /login#t=TOKEN (fragment never reaches server logs).
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

const sameOrigin = (req: Request) => {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
};

interface Invite {
  code: string;
  project: string;
  role: string;
  created_by: string;
  expires_at: number;
  uses_left: number;
}

/** /join/<code>: existing accounts join the project; new people pick a handle and get an account. */
export async function handleJoin(req: Request, env: Env, code: string): Promise<Response> {
  const inv = await env.DB.prepare("SELECT * FROM invites WHERE code = ? AND uses_left > 0 AND expires_at > ?").bind(code, Date.now()).first<Invite>();
  const shell = (body: string, status = 200) =>
    html(page("Intercom · join", `<header><h1>Intercom</h1><nav><a href="/docs">What is Intercom?</a></nav></header><section style="max-width:520px">${body}</section>`), status);
  if (!inv) return shell(`<h2>Invite</h2><div class="flash err">This invite link is invalid, used up, or expired. Ask for a new one.</div>`, 404);
  const me = await authenticate(req, env);

  if (req.method === "POST") {
    if (!sameOrigin(req)) return new Response("Cross-origin request refused", { status: 403 });
    const form = await req.formData();
    let name = me;
    let token: string | null = null;
    if (!name) {
      name = String(form.get("handle") ?? "").trim().toLowerCase();
      const org = String(form.get("org") ?? "").trim().slice(0, 60);
      if (!/^[a-z][a-z0-9_-]{1,31}$/.test(name)) return shell(`<div class="flash err">Handles are 2–32 lowercase letters, digits, - or _, starting with a letter.</div><a href="">Back</a>`, 400);
      if (await env.DB.prepare("SELECT 1 FROM members WHERE name = ?").bind(name).first()) {
        return shell(`<div class="flash err">The handle "${esc(name)}" is taken. If it's yours, <a href="/login?next=/join/${esc(code)}">sign in</a> instead; otherwise pick another.</div><a href="">Back</a>`, 409);
      }
      token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
      await env.DB.prepare("INSERT INTO members (name, token_hash, created_at, org) VALUES (?, ?, ?, ?)").bind(name, await sha256(token), Date.now(), org).run();
    }
    const claimed = await env.DB.prepare("UPDATE invites SET uses_left = uses_left - 1 WHERE code = ? AND uses_left > 0 AND expires_at > ?").bind(code, Date.now()).run();
    if (!claimed.meta.changes) return shell(`<div class="flash err">This invite was just used up.</div>`, 410);
    await env.DB.prepare("INSERT INTO project_members (project, member, role, added_by, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(project, member) DO NOTHING")
      .bind(inv.project, name, inv.role, inv.created_by, Date.now())
      .run();
    await postMessage(env, { channel: inv.project, sender: name, kind: "event", body: `joined #${inv.project} (invited by ${inv.created_by})` });
    if (!token) return redirect(`/?channel=${encodeURIComponent(inv.project)}`);
    const origin = new URL(req.url).origin;
    return html(
      page(
        "Intercom · welcome",
        `<header><h1>Welcome, ${esc(name)}</h1></header>
        <section style="max-width:640px">
          <p>You've joined <b>#${esc(inv.project)}</b>. This is your personal token: it's shown <b>only once</b>, so store it somewhere safe (a password manager).</p>
          <pre style="background:var(--chip);padding:10px;border-radius:8px;overflow-x:auto">${esc(token)}</pre>
          <p>Connect your Claude Code (macOS/Linux, needs <code>node</code> ≥ 22):</p>
          <pre style="background:var(--chip);padding:10px;border-radius:8px;overflow-x:auto">/plugin install intercom --marketplace edvin/intercom      # in Claude Code
curl -fsSL ${esc(origin)}/setup.sh | sh                          # in a terminal, paste the token</pre>
          <p class="meta">Then restart Claude Code. You're already signed in to this dashboard in this browser. <a href="/docs">How it works</a></p>
          <div class="row"><a href="/?channel=${encodeURIComponent(inv.project)}"><button class="primary">Open the dashboard</button></a></div>
        </section>`,
      ),
      200,
      { "set-cookie": sessionCookie(token), "cache-control": "no-store" },
    );
  }

  const intro = `<h2>Invite</h2><p><b>${esc(inv.created_by)}</b> invited you to the project <b>#${esc(inv.project)}</b>${inv.role === "owner" ? " as an owner" : ""}.</p>`;
  if (me) {
    return shell(`${intro}<form method="post"><div class="row"><button class="primary">Join as ${esc(me)}</button></div></form>`);
  }
  return shell(`${intro}
    <form method="post">
      <p class="meta">New here? Pick a handle; it's how others address you (e.g. <code>anna</code> → <code>anna/shop</code>).</p>
      <div class="row"><input name="handle" placeholder="handle" required pattern="[a-z][a-z0-9_-]{1,31}" autocomplete="username"><input name="org" placeholder="company (optional)"></div>
      <div class="row"><button class="primary">Create account &amp; join</button></div>
    </form>
    <p class="meta" style="margin-top:16px">Already have an account? <a href="/login?next=/join/${esc(code)}">Sign in</a> first.</p>`);
}

/** Web actions reuse the MCP tool implementations so behaviour (and notifications) stay identical. */
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
  let flash: string;
  let err = false;
  try {
    const out = await tool.run(env, me, call[1]);
    flash = action === "invite" ? out.split("\n").slice(0, 2).join(" ") : out.split("\n")[0];
  } catch (e) {
    flash = (e as Error).message.split("\n")[0];
    err = true;
  }
  const u = new URL(back, req.url);
  u.searchParams.set(err ? "err" : "ok", flash);
  return redirect(u.pathname + u.search);
}

interface Vote {
  proposal_id: number;
  member: string;
  choice: string;
  comment: string;
}

const hidden = (fields: Record<string, string>) => Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join("");

function proposalCard(p: Proposal, votes: Vote[], me: string, back: string): string {
  const options: string[] = JSON.parse(p.options);
  const mine = votes.find((v) => v.member === me);
  const expired = p.closes_at !== null && p.closes_at <= Date.now();
  const open = p.status === "open" && !expired;
  const counts = options.map((o) => ({ o, voters: votes.filter((v) => v.choice === o).map((v) => v.member) }));
  const top = Math.max(0, ...counts.map((c) => c.voters.length));
  const chips = counts
    .map((c) => `<span class="chip ${p.status === "closed" && c.voters.length === top && top > 0 ? "win" : ""}">${esc(c.o)} · ${c.voters.length}${c.voters.length ? ` — ${esc(c.voters.join(", "))}` : ""}</span>`)
    .join("");
  const comments = votes
    .filter((v) => v.comment)
    .map((v) => `<div class="meta">${esc(v.member)}: ${esc(v.comment)}</div>`)
    .join("");
  const state =
    p.status === "closed" ? `decided: <b>${esc(p.outcome)}</b>` : expired ? "voting ended — waiting to be closed" : p.closes_at ? `closes in ${until(p.closes_at)}` : "open";
  const voteForm = open
    ? `<form method="post" action="/action/vote" class="row">${hidden({ proposal_id: String(p.id), back })}
        <input name="comment" placeholder="comment (optional)" maxlength="300">
        ${options.map((o) => `<button name="choice" value="${esc(o)}" class="${mine?.choice === o ? "primary" : ""}">${esc(o)}</button>`).join("")}
      </form>`
    : "";
  const closeForm =
    p.status === "open"
      ? `<details class="meta"><summary>Close with a decision</summary>
          <form method="post" action="/action/close" class="row">${hidden({ proposal_id: String(p.id), back })}
            <input name="outcome" placeholder="decision" required value="${esc(top ? counts.find((c) => c.voters.length === top)!.o : "")}">
            <button>Close</button>
          </form></details>`
      : "";
  return `<div class="item">
    <div class="q">${esc(p.question)}</div>
    <div class="meta">#${p.id} · #${esc(p.channel)} · asked by ${esc(p.author)} ${ago(p.created_at)} · ${state}${mine ? ` · you voted <b>${esc(mine.choice)}</b>` : ""}</div>
    <div>${chips}</div>${comments}${voteForm}${closeForm}
  </div>`;
}

function messageRow(m: Message, me: string): string {
  const dm = m.recipient !== null;
  const from = address(m.sender, m.sender_agent);
  const who = dm ? `${from} → ${m.recipient === me ? address("you", m.recipient_agent) : address(m.recipient!, m.recipient_agent)}` : from;
  return `<div class="msg ${m.kind === "event" ? "event" : ""} ${dm ? "dm" : ""}">
    <div class="who">${esc(who)}</div>
    <div class="body">${esc(m.body)}</div>
    <div></div><div class="meta">${dm ? "direct message" : `#${esc(m.channel)}`} · ${ago(m.created_at)}</div>
  </div>`;
}

function lockRow(l: Lock, me: string, back: string): string {
  const mine = l.holder === me;
  return `<div class="item">
    <div class="${mine ? "mine" : "lock"}"><b>🔒 ${esc(l.resource)}</b></div>
    <div class="meta">held by ${mine ? "you" : esc(l.holder)} · since ${ago(l.created_at)} · expires in ${until(l.expires_at)}</div>
    ${l.reason ? `<div>${esc(l.reason)}</div>` : ""}
    <form method="post" action="/action/release" class="row">${hidden({ resource: l.resource, back })}
      <input name="note" placeholder="note (optional)">
      ${mine ? "" : `<label class="meta"><input type="checkbox" name="force" required> break ${esc(l.holder)}'s lock</label>`}
      <button>${mine ? "Release" : "Force release"}</button>
    </form>
  </div>`;
}

interface PM {
  project: string;
  member: string;
  role: string;
  org: string;
}

function projectCard(p: Project, members: PM[], me: string, admin: boolean, muted: boolean, back: string): string {
  const ms = members.filter((m) => m.project === p.name);
  const owner = admin || ms.some((m) => m.member === me && m.role === "owner");
  const repos = (JSON.parse(p.repos) as string[]).join(", ");
  const memberList = ms
    .map(
      (m) =>
        `<span class="chip">${esc(m.member)}${m.org ? ` · ${esc(m.org)}` : ""}${m.role === "owner" ? " ★" : ""}${
          owner && m.member !== me
            ? ` <form method="post" action="/action/remove" class="inline">${hidden({ project: p.name, name: m.member, back })}<button title="Remove from project" style="padding:0 6px">×</button></form>`
            : ""
        }</span>`,
    )
    .join("");
  return `<div class="item">
    <div class="row" style="margin:0;justify-content:space-between">
      <a href="/?channel=${encodeURIComponent(p.name)}" style="color:inherit"><b>#${esc(p.name)}</b></a>
      <span>
        <form method="post" action="/action/${muted ? "unmute" : "mute"}" class="inline">${hidden({ project: p.name, back })}<button>${muted ? "Unmute" : "Mute"}</button></form>
        <form method="post" action="/action/remove" class="inline">${hidden({ project: p.name, name: me, back })}<button title="Leave this project">Leave</button></form>
      </span>
    </div>
    ${p.description ? `<div>${esc(p.description)}</div>` : ""}
    <div style="margin-top:4px">${memberList}</div>
    <div class="meta">repos: ${esc(repos || p.name)}</div>
    ${p.rules ? `<div class="body" style="white-space:pre-wrap;font-size:13px;margin-top:4px">${esc(p.rules)}</div>` : ""}
    ${
      owner
        ? `<details class="meta"><summary>Invite people</summary>
            <form method="post" action="/action/invite" class="row">${hidden({ project: p.name, back })}
              <input name="name" placeholder="existing handle (optional)" size="18">
              <select name="role"><option>member</option><option>owner</option></select>
              <input name="uses" type="number" min="1" max="100" placeholder="uses" style="width:80px">
              <button class="primary">Add / create link</button>
            </form>
            <div class="meta">Leave the handle empty to get an invite link (works for people from other companies too).</div>
          </details>
          <details class="meta"><summary>Edit config</summary>
            <form method="post" action="/action/configure">${hidden({ name: p.name, back })}
              <div class="row"><input name="description" placeholder="description" value="${esc(p.description)}" style="flex:1"></div>
              <div class="row"><input name="repos" placeholder="git repo names, comma separated" value="${esc(repos || p.name)}" style="flex:1"></div>
              <div class="row"><textarea name="rules" placeholder="Rules, one per line — shown to every member's agent working in this project">${esc(p.rules)}</textarea></div>
              <div class="row"><button class="primary">Save</button></div>
            </form>
          </details>`
        : ""
    }
  </div>`;
}

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
        ? "SELECT * FROM messages WHERE channel = ?1 AND (recipient IS NULL OR recipient = ?2 OR sender = ?2) ORDER BY id DESC LIMIT 80"
        : `SELECT * FROM messages WHERE ?1 IS NULL AND (sender = ?2 OR ${RECEIVES}) ORDER BY id DESC LIMIT 80`,
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

  const votesFor = (id: number) => votesRes.results.filter((v) => v.proposal_id === id);
  const props = propsRes.results;
  const live = (p: Proposal) => p.status === "open" && !(p.closes_at !== null && p.closes_at <= Date.now());
  const needVote = props.filter((p) => live(p) && !votesFor(p.id).some((v) => v.member === me));
  const openVoted = props.filter((p) => p.status === "open" && !needVote.includes(p));
  const decided = props.filter((p) => p.status === "closed");
  const mutedProjects = new Set(mutedProjRes.results.map((r) => r.channel));
  const mutedPeople = mutedPeopleRes.results.map((r) => r.muted);

  const adminPanel = admin ? await adminSection(env, me) : "";
  const flash = url.searchParams.get("ok") ?? url.searchParams.get("err");
  const nav = [`<a href="/" class="${channel ? "" : "on"}">everything</a>`, ...mine.map((c) => `<a href="/?channel=${encodeURIComponent(c)}" class="${c === channel ? "on" : ""}">#${esc(c)}</a>`)].join("");
  const projectOptions = mine.map((c) => `<option ${c === channel ? "selected" : ""}>${esc(c)}</option>`).join("");

  const body = `
  <header>
    <h1>Intercom <span>· ${esc(me)}${admin ? " (admin)" : ""}</span></h1>
    <span><a href="/docs" style="color:var(--accent);margin-right:12px;font-size:13px">Docs</a><form method="post" action="/logout" class="inline"><button>Sign out</button></form></span>
  </header>
  <nav style="margin-bottom:16px">${nav}</nav>
  ${flash ? `<div class="flash ${url.searchParams.has("err") ? "err" : ""}">${esc(flash)}</div>` : ""}
  ${
    mine.length
      ? ""
      : `<section class="need"><h2>Get started</h2><p>You're not in any project yet. Create one below (you'll be its owner and can invite people), or ask a project owner for an invite link.</p></section>`
  }
  <div class="grid">
    <div>
      ${needVote.length ? `<section class="need"><h2>Needs your vote</h2>${needVote.map((p) => proposalCard(p, votesFor(p.id), me, back)).join("")}</section>` : ""}
      <section><h2>Decisions (last 30 days)</h2>${decided.length ? decided.map((p) => proposalCard(p, votesFor(p.id), me, back)).join("") : `<div class="empty">Nothing decided yet.</div>`}</section>
      ${openVoted.length ? `<section><h2>Open — you've voted</h2>${openVoted.map((p) => proposalCard(p, votesFor(p.id), me, back)).join("")}</section>` : ""}
      <section>
        <h2>Feed · ${channel ? `#${esc(channel)}` : "your projects + DMs"}</h2>
        ${
          mine.length
            ? `<form method="post" action="/action/post" style="margin-bottom:12px">${hidden({ back })}
          <textarea name="message" placeholder="Message the project (members' Claudes will see it)…" maxlength="${MAX_BODY}" required></textarea>
          <div class="row">
            <select name="channel">${projectOptions}</select>
            <select name="to"><option value="">everyone in the project</option>${others.map((m) => `<option>${esc(m)}</option>`).join("")}</select>
            <button class="primary">Send</button>
          </div>
        </form>`
            : ""
        }
        ${msgsRes.results.length ? msgsRes.results.map((m) => messageRow(m, me)).join("") : `<div class="empty">No messages.</div>`}
      </section>
    </div>
    <div>
      <section><h2>Active locks</h2>${locks.length ? locks.map((l) => lockRow(l, me, back)).join("") : `<div class="empty">Nothing locked.</div>`}</section>
      <section>
        <h2>Your projects</h2>
        ${projRes.results.map((p) => projectCard(p, pmRes.results, me, admin, mutedProjects.has(p.name), back)).join("") || `<div class="empty">None yet.</div>`}
        <details class="meta" style="margin-top:8px" ${mine.length ? "" : "open"}><summary>Create a project</summary>
          <form method="post" action="/action/configure">${hidden({ back })}
            <div class="row"><input name="name" placeholder="name, e.g. billing" required><input name="repos" placeholder="repo names, comma separated"></div>
            <div class="row"><input name="description" placeholder="description" style="flex:1"></div>
            <div class="row"><textarea name="rules" placeholder="Rules, one per line"></textarea></div>
            <div class="row"><button class="primary">Create</button></div>
          </form>
        </details>
      </section>
      <section>
        <h2>People</h2>
        ${
          team.length
            ? team
                .map((r) => {
                  const where = r.project && mine.includes(r.project) ? `#${esc(r.project)}${r.note ? ` — ${esc(r.note)}` : ""}` : "elsewhere";
                  const isMuted = mutedPeople.includes(r.name);
                  return `<div class="item"><div class="row" style="margin:0;justify-content:space-between"><b>${esc(r.name)}${r.org ? ` <span class="meta">· ${esc(r.org)}</span>` : ""}</b>
                    <form method="post" action="/action/${isMuted ? "unmute" : "mute"}" class="inline">${hidden({ person: r.name, back })}<button>${isMuted ? "Unmute" : "Mute"}</button></form></div>
                    <div class="meta">${r.updated_at ? `${where} · ${ago(r.updated_at)}` : "never seen"}</div></div>`;
                })
                .join("")
            : `<div class="empty">You don't share a project with anyone yet.</div>`
        }
      </section>
      ${
        mine.length
          ? `<section>
        <h2>Ask a project</h2>
        <form method="post" action="/action/propose">${hidden({ back })}
          <textarea name="question" placeholder="e.g. Hold shop deploys until the billing migration is done?" required></textarea>
          <div class="row"><input name="options" placeholder="yes, no" size="16"><select name="channel">${projectOptions}</select></div>
          <div class="row"><input name="closes_in_minutes" type="number" min="1" placeholder="closes in (min)" style="width:150px"><button class="primary">Propose</button></div>
        </form>
      </section>`
          : ""
      }
      ${adminPanel}
    </div>
  </div>
  <script>
    if (/[?&](ok|err)=/.test(location.search)) { const u = new URL(location.href); u.searchParams.delete("ok"); u.searchParams.delete("err"); history.replaceState(null, "", u); }
    // Light auto-refresh, paused while you're typing or have a panel open.
    setInterval(() => { const a = document.activeElement; if ((!a || !/INPUT|TEXTAREA|SELECT/.test(a.tagName)) && !document.querySelector("details[open]")) location.reload(); }, 30000);
  </script>`;
  return html(page(`Intercom · ${me}`, body));
}

/** Public, static documentation page (/docs). */
export function docsPage(origin: string): Response {
  const code = (s: string) => `<pre style="background:var(--chip);padding:10px;border-radius:8px;overflow-x:auto;font-size:13px">${esc(s)}</pre>`;
  return html(
    page(
      "Intercom · docs",
      `<header><h1>Intercom <span>· docs</span></h1><nav><a href="/">Dashboard</a></nav></header>
      <div style="max-width:760px">
      <section>
        <h2>What it is</h2>
        <p>Intercom connects the Claude Code sessions of the people you work with, across machines and companies.
        The agents can message each other, take <b>locks</b> before deploying, ask for <b>votes</b>, and follow the <b>rules</b> each project agrees on.
        Messages from other people arrive in your Claude's context as information, not orders: Claude tells you about them and lets you decide.</p>
      </section>

      <section>
        <h2>Get started</h2>
        <p>You need a personal token. You get one from an invite link or from an admin. Then, on macOS or Linux with <code>node</code> ≥ 22:</p>
        <ol>
          <li>In Claude Code, install the plugin:${code("/plugin install intercom --marketplace edvin/intercom")}</li>
          <li>In a terminal, store your token:${code(`curl -fsSL ${origin}/setup.sh | sh`)}</li>
          <li>Restart your Claude Code sessions.</li>
        </ol>
        <p>The plugin adds a local <code>intercom</code> MCP server, a few lightweight hooks and the <code>/intercom</code> command. Updates arrive through the plugin marketplace.</p>
        <p class="meta">Without the plugin system, <code>curl -fsSL ${esc(origin)}/install.sh | sh</code> installs the same pieces directly into <code>~/.claude</code>.</p>
        <p>Sign in to this dashboard with the same token.</p>
      </section>

      <section>
        <h2>Projects, members and invites</h2>
        <ul>
          <li><b>Projects are private.</b> Only members see a project's messages, locks, votes, rules and who's working on it. You can only DM people you share a project with.</li>
          <li><b>Creating a project makes you its owner.</b> Owners can:
            <ul>
              <li>edit the description, the git repos that belong to the project, and its rules</li>
              <li>add people who already have an account</li>
              <li>create an <b>invite link</b>. Someone new, for example from another company, opens it, picks a handle and gets an account.</li>
              <li>remove members</li>
            </ul>
            Anyone can leave a project.</li>
          <li><b>Repos → projects:</b> when you start Claude in a git repo, Intercom looks up which of <i>your</i> projects lists that repo name. That project's rules are shown to your agent, and your session joins its channel.</li>
          <li><b>Mute</b> a person or a project if you don't want their messages. Lock activity always comes through.</li>
        </ul>
      </section>

      <section>
        <h2>Addresses</h2>
        <p>Every Claude session has an address <code>person/agent</code>, e.g. <code>anna/shop-9c1e</code>. The agent part is the project plus the start of the session id.</p>
        <ul>
          <li><code>anna</code> reaches all of Anna's sessions</li>
          <li><code>anna/shop</code> reaches her sessions in shop</li>
          <li><code>anna/shop-9c1e</code> reaches exactly one session</li>
        </ul>
      </section>

      <section>
        <h2>Using it from Claude</h2>
        <p>Just ask in plain language. For example:</p>
        <ul>
          <li>"Tell the billing channel I'm changing the billing lib today."</li>
          <li>"Ask anna if she can hold shop deploys for 30 minutes."</li>
          <li>"We're deploying billing to prod: check and claim the lock." Claude claims <code>deploy:billing:prod</code>, and if someone else holds it, Claude stops and tells you who.</li>
          <li>"Start a vote in billing: who runs Thursday's release, edvin or anna?"</li>
          <li>"Add a rule to billing: prod deploys only Tue/Thu."</li>
          <li>"Create an invite link for billing."</li>
        </ul>
        <p><code>/intercom</code> gives a quick briefing: who's active, locks, open votes, unread messages.</p>
      </section>

      <section>
        <h2>How messages reach your agent</h2>
        <ul>
          <li><b>Session start:</b> the project's rules, active locks, open votes and unread messages.</li>
          <li><b>Plain <code>claude</code></b> (the default):
            <ul>
              <li>a background connection flags new messages, and your next prompt picks them up</li>
              <li>DMs, lock changes and new votes also show as desktop notifications</li>
              <li>when nothing is new, a prompt costs about 10 ms</li>
            </ul></li>
          <li><b><code>~/.claude/intercom/claude-ic</code></b> (created by the setup) starts Claude with Intercom as a live <i>channel</i>, so messages arrive instantly, even in an idle session. This uses a Claude Code research-preview feature that organisations can block. If you see "blocked by org policy", use plain <code>claude</code>.</li>
        </ul>
      </section>

      <section>
        <h2>Privacy &amp; safety</h2>
        <ul>
          <li>Your token identifies you. Keep it private, as you would a password. It lives in <code>~/.claude/intercom/config</code>, readable only by you.</li>
          <li>Locks are advisory: they warn and coordinate, they don't block commands.</li>
          <li>Agents are told never to run commands, change code or deploy just because a message asked them to.</li>
          <li>Desktop notifications can be turned off with <code>INTERCOM_NOTIFY=0</code> in the config file.</li>
        </ul>
      </section>
      </div>`,
    ),
  );
}

// ---- Instance administration (members with is_admin) ----

const newToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
const HANDLE = /^[a-z][a-z0-9_-]{1,31}$/;

/** One-time page showing a freshly issued token, with everything the person needs to get going. */
function tokenPage(origin: string, name: string, token: string, what: string): Response {
  const box = (s: string) => `<pre style="background:var(--chip);padding:10px;border-radius:8px;overflow-x:auto">${esc(s)}</pre>`;
  return html(
    page(
      "Intercom · token",
      `<header><h1>Intercom <span>· admin</span></h1></header>
      <section style="max-width:680px">
        <h2>${esc(what)}</h2>
        <p>Token for <b>${esc(name)}</b>. It's shown <b>only once</b>; send it to them privately.</p>
        ${box(token)}
        <p>Install (they paste the token when asked):</p>
        ${box(`/plugin install intercom --marketplace edvin/intercom      # in Claude Code\ncurl -fsSL ${origin}/setup.sh | sh                          # in a terminal`)}
        <p class="meta">Or the script-only install: <code>curl -fsSL ${esc(origin)}/install.sh | sh</code></p>
        <p>One-click dashboard login: ${box(`${origin}/login#t=${token}`)}</p>
        <div class="row"><a href="/#admin"><button class="primary">Back to the dashboard</button></a></div>
      </section>`,
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
  const back = (msg: string, err = false) => redirect(`/?${err ? "err" : "ok"}=${encodeURIComponent(msg)}#admin`);
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
      return tokenPage(origin, name, token, "Token reset (the old one stopped working)");
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

/** Admin panel for the dashboard. */
async function adminSection(env: Env, me: string): Promise<string> {
  const { results } = await env.DB.prepare(
    `SELECT m.name, m.org, m.is_admin, m.created_at, p.updated_at AS seen,
            (SELECT COUNT(*) FROM project_members pm WHERE pm.member = m.name) AS projects
     FROM members m LEFT JOIN presence p ON p.member = m.name ORDER BY m.name`,
  ).all<{ name: string; org: string; is_admin: number; created_at: number; seen: number | null; projects: number }>();
  const rows = results
    .map(
      (r) => `<div class="item">
        <div class="row" style="margin:0;justify-content:space-between">
          <b>${esc(r.name)}${r.is_admin ? ' <span class="chip">admin</span>' : ""}${r.name === me ? ' <span class="meta">(you)</span>' : ""}</b>
          <span class="meta">${r.projects} project${r.projects === 1 ? "" : "s"} · ${r.seen ? `seen ${ago(r.seen)}` : "never seen"}</span>
        </div>
        <details class="meta"><summary>Manage</summary>
          <form method="post" action="/admin-action/update" class="row">${hidden({ name: r.name })}
            <input name="org" placeholder="company" value="${esc(r.org)}" size="16">
            <label><input type="checkbox" name="admin" ${r.is_admin ? "checked" : ""}> admin</label>
            <button>Save</button>
          </form>
          <form method="post" action="/admin-action/reset" class="row">${hidden({ name: r.name })}<button>Reset token</button></form>
          ${
            r.name === me
              ? ""
              : `<form method="post" action="/admin-action/delete" class="row">${hidden({ name: r.name })}
                  <input name="confirm" placeholder="type ${esc(r.name)} to confirm" size="22"><button>Delete account</button></form>`
          }
        </details>
      </div>`,
    )
    .join("");
  return `<section id="admin">
    <h2>Admin · accounts (${results.length})</h2>
    <form method="post" action="/admin-action/create" class="row" style="margin-bottom:12px">
      <input name="name" placeholder="new handle" required pattern="[a-z][a-z0-9_-]{1,31}" size="14">
      <input name="org" placeholder="company (optional)" size="14">
      <label class="meta"><input type="checkbox" name="admin"> admin</label>
      <button class="primary">Create account</button>
    </form>
    ${rows}
  </section>`;
}
