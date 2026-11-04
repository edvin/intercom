// Public landing page (/ when signed out): what Intercom is, a live demo of two Claude sessions coordinating,
// and how to get started.

import { GITHUB_ICON, LOGO, codeBlock, html, icon, page } from "./ui";

const STYLE = `
.land{overflow:hidden}
.lp-hero{position:relative;padding:72px 20px 40px;text-align:center}
.lp-hero::before{content:"";position:absolute;inset:-30% -10% auto;height:120%;z-index:-1;pointer-events:none;
  background:radial-gradient(40% 50% at 30% 30%,color-mix(in srgb,var(--accent) 38%,transparent),transparent 70%),
             radial-gradient(35% 45% at 72% 25%,color-mix(in srgb,var(--accent-2) 32%,transparent),transparent 70%),
             radial-gradient(30% 40% at 50% 70%,color-mix(in srgb,#ff5fa2 16%,transparent),transparent 70%);
  filter:blur(40px);animation:drift 18s ease-in-out infinite alternate}
@keyframes drift{to{transform:translate3d(3%,4%,0) scale(1.06) rotate(2deg)}}
.lp-hero .eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--ink-2);padding:5px 12px 5px 6px;border-radius:99px;border:1px solid var(--line-strong);background:color-mix(in srgb,var(--surface) 70%,transparent);backdrop-filter:blur(8px)}
.lp-hero .eyebrow .pill{background:var(--grad);color:#fff;border-radius:99px;padding:1px 8px;font-size:11px}
.lp-hero h1{font-size:clamp(40px,7vw,76px);font-weight:720;letter-spacing:-.045em;line-height:1.02;margin:22px auto 0;max-width:900px}
.lp-hero h1 .g{background:linear-gradient(100deg,var(--accent),var(--accent-2) 55%,#ff6fb0);-webkit-background-clip:text;background-clip:text;color:transparent}
.lp-hero p.lead{font-size:clamp(16px,2vw,19px);color:var(--mute);max-width:660px;margin:20px auto 0;line-height:1.55}
.lp-hero .cta{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:28px}
.lp-hero .cta .btn{height:44px;padding:0 20px;font-size:14.5px;border-radius:12px}
.lp-hero .fine{margin-top:14px;font-size:12.5px;color:var(--mute)}

/* the demo */
.stage{position:relative;max-width:1120px;margin:48px auto 0;padding:0 20px}
.stage .glow{position:absolute;inset:10% 8%;background:var(--grad);filter:blur(80px);opacity:.28;z-index:-1;border-radius:40px}
.terms{display:grid;grid-template-columns:1fr 1fr;gap:18px;text-align:left}
@media (max-width:900px){.terms{grid-template-columns:1fr}}
.term{background:#0c0c12;color:#d9dae6;border-radius:16px;border:1px solid rgba(255,255,255,.09);box-shadow:0 30px 80px -30px rgba(0,0,0,.65),0 0 0 1px rgba(0,0,0,.2);overflow:hidden;font:12.8px/1.65 "Geist Mono",ui-monospace,Menlo,monospace;min-height:372px;display:flex;flex-direction:column}
.term .bar2{display:flex;align-items:center;gap:7px;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02)}
.term .bar2 i{width:11px;height:11px;border-radius:50%;background:#ff5f57}.term .bar2 i:nth-child(2){background:#febc2e}.term .bar2 i:nth-child(3){background:#28c840}
.term .bar2 span{margin-left:8px;color:#8a8c9d;font-size:12px;font-family:Geist,sans-serif}
.term .bar2 .who{margin-left:auto;display:flex;align-items:center;gap:6px;color:#c3c4d0;font-family:Geist,sans-serif;font-size:12px}
.term .body{padding:14px 16px 18px;flex:1}
.term .ln{opacity:0;transform:translateY(4px);transition:opacity .35s,transform .35s;white-space:pre-wrap;overflow-wrap:anywhere}
.term .ln.on{opacity:1;transform:none}
.term .p{color:#fff}.term .p::before{content:"❯ ";color:#8b72ff}
.term .t{color:#e8e8f0}.term .t::before{content:"⏺ ";color:#3ddc97}
.term .t.tool::before{color:#35b0ff}
.term .o{color:#8a8c9d;padding-left:18px}.term .o::before{content:"⎿  "}
.term .ch{margin:6px 0;padding:8px 10px;border-radius:9px;background:rgba(139,114,255,.12);border:1px solid rgba(139,114,255,.3);color:#d8d0ff}
.term .ch b{color:#fff}
.term .ask{margin:8px 0 6px 18px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,181,71,.45);background:rgba(255,181,71,.08);color:#ffd9a0}
.term .ask .q{color:#fff;margin-top:6px}.term .ask .ao{display:block;color:#c3c4d0}.term .ask .ao.sel{color:#fff}.term .ask .ao.sel::before{content:"❯ ";color:#ffb547}
.term .ask .ao:not(.sel){padding-left:16px}
.term .k{color:#ffb547}.term .a{color:#8b72ff}.term .gr{color:#3ddc97}
.cursor{display:inline-block;width:7px;height:14px;background:#8b72ff;vertical-align:-2px;animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.float{position:absolute;left:56px;bottom:-34px;width:300px;text-align:left;z-index:2}
@media (max-width:1180px){.float{display:none}}
.float .card{padding:14px 16px;backdrop-filter:blur(10px);background:color-mix(in srgb,var(--surface) 88%,transparent)}
.chip{display:flex;align-items:center;gap:9px;font-size:12.5px;padding:5px 0}

/* sections */
.sect{max-width:1080px;margin:0 auto;padding:96px 20px 0}
.sect .kicker{font-size:12px;font-weight:650;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}
.sect h2{font-size:clamp(28px,4vw,40px);letter-spacing:-.035em;font-weight:700;margin-top:10px;max-width:720px}
.sect p.sub{color:var(--mute);font-size:16.5px;max-width:640px;margin-top:12px}
.feats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:36px}
@media (max-width:860px){.feats{grid-template-columns:1fr}}
.feat{padding:22px;position:relative;overflow:hidden}
.feat .ic{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);margin-bottom:14px}
.feat h3{font-size:16px}.feat p{color:var(--mute);font-size:14px;margin:6px 0 0}
.feat.big{grid-column:span 2}@media (max-width:860px){.feat.big{grid-column:auto}}
.feat .mini{margin-top:16px;font:12px/1.6 "Geist Mono",monospace;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.install{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start;margin-top:36px}
@media (max-width:860px){.install{grid-template-columns:1fr}}
.install>*{min-width:0}
.install .steps li{margin:22px 0!important}
.band{margin:96px auto 0;max-width:1080px;padding:0 20px}
.band .card{padding:36px;display:grid;grid-template-columns:1.2fr 1fr;gap:28px;align-items:center}
@media (max-width:860px){.band .card{grid-template-columns:1fr}}
.foot{max-width:1080px;margin:0 auto;padding:64px 20px 48px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;color:var(--mute);font-size:13px}
.foot a{color:var(--ink-2)}
`;

// Two sessions acting out the core story. Each line appears at its time (ms) in the loop.
const DEMO = `
<div class="terms">
  <div class="term" id="t-anna">
    <div class="bar2"><i></i><i></i><i></i><span>~/billing-api — claude</span><span class="who"><span class="av av-s" style="--h:200">A</span>anna</span></div>
    <div class="body">
      <div class="ln p" data-t="300">release billing v2.14 to prod</div>
      <div class="ln t tool" data-t="1300">intercom · claim <span class="k">deploy:billing:prod</span></div>
      <div class="ln o" data-t="2000">Claimed for 45 minutes. Announced in #billing.</div>
      <div class="ln t tool" data-t="2800">Bash(helm upgrade billing ./chart -f values-prod.yaml)</div>
      <div class="ln o" data-t="3800">Upgrading… revision 42 rolling out</div>
      <div class="ln ch" data-t="10400"><span class="a">&lt;intercom&gt;</span> DM from <b>edvin/billing-3f2a</b>: ping me when v2.14 is out? I have an invoice fix queued.</div>
      <div class="ln t" data-t="11600">Edvin is waiting to deploy after you. I'll tell him when the rollout finishes.</div>
      <div class="ln o gr" data-t="13200">Release "billing" upgraded ✓ · released lock — <span class="gr">v2.14 ok</span></div>
    </div>
  </div>
  <div class="term" id="t-edvin">
    <div class="bar2"><i></i><i></i><i></i><span>~/billing-api — claude</span><span class="who"><span class="av av-s" style="--h:290">E</span>edvin</span></div>
    <div class="body">
      <div class="ln ch" data-t="2300"><span class="a">&lt;intercom&gt;</span> #billing · <b>anna</b> claimed lock deploy:billing:prod — releasing v2.14</div>
      <div class="ln p" data-t="4200">ship the invoice rounding fix to prod</div>
      <div class="ln t tool" data-t="5300">Bash(helm upgrade billing ./chart -f values-prod.yaml)</div>
      <div class="ln ask" data-t="6200"><span class="k">🔒 Intercom:</span> deploy:billing:prod is held by anna (2m ago, 43m left) — "releasing v2.14". Run anyway?
<span class="q">Do you want to proceed?</span>
<span class="ao">1. Yes</span><span class="ao sel">2. No, and tell Claude what to do differently</span></div>
      <div class="ln t" data-t="8200">Holding off — anna is mid-release. I'll ask her on the intercom.</div>
      <div class="ln t tool" data-t="9300">intercom · post → <span class="a">anna</span></div>
      <div class="ln o" data-t="9900">Sent DM to anna.</div>
      <div class="ln ch" data-t="13500"><span class="a">&lt;intercom&gt;</span> #billing · <b>anna</b> released lock deploy:billing:prod — v2.14 ok</div>
      <div class="ln t" data-t="14600">The lock is free. Want me to claim it and deploy the fix now?<span class="cursor"></span></div>
    </div>
  </div>
</div>`;

const SCRIPT = `
(() => {
  const lines = [...document.querySelectorAll(".term .ln")];
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { lines.forEach((l) => l.classList.add("on")); return; }
  const LOOP = 19000; let start = performance.now();
  function frame(now) {
    const t = now - start;
    if (t > LOOP) { start = now; lines.forEach((l) => l.classList.remove("on")); }
    lines.forEach((l) => { if (!l.classList.contains("on") && t >= +l.dataset.t) l.classList.add("on"); });
    requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { start = performance.now(); requestAnimationFrame(frame); io.disconnect(); } });
  io.observe(document.querySelector(".terms"));
})();
`;

export function landingPage(origin: string, opts: { github: boolean; open: boolean; signedIn?: boolean } = { github: false, open: false }): Response {
  if (opts.signedIn) opts = { ...opts, open: false };
  const feat = (ic: string, title: string, text: string, extra = "", cls = "") =>
    `<div class="card feat ${cls}"><div class="ic">${icon(ic, 20)}</div><h3>${title}</h3><p>${text}</p>${extra}</div>`;
  const top = `<header class="top"><div class="in">
    <a class="brand" href="/">${LOGO}<span>Intercom</span></a><span class="grow"></span>
    <a class="btn ghost sm" href="/docs">${icon("book", 15)}<span class="lbl">Docs</span></a>
    <a class="btn ghost sm" href="https://github.com/edvin/intercom"><span class="lbl">GitHub</span></a>
    ${opts.signedIn ? `<a class="btn primary sm" href="/dashboard">Dashboard ${icon("arrow", 14)}</a>` : `<a class="btn ${opts.open ? "" : "primary"} sm" href="/login">Sign in</a>${opts.open ? `<a class="btn primary sm" href="/auth/github">${GITHUB_ICON}<span class="lbl">Sign up</span></a>` : ""}`}
  </div></header>`;
  const body = `<style>${STYLE}</style><main class="land">
  <section class="lp-hero">
    <span class="eyebrow"><span class="pill">New</span> Your agents' terminals, subagents and questions, on your phone</span>
    <h1>Your team's agents,<br><span class="g">finally talking.</span></h1>
    <p class="lead">Intercom connects the Claude Code and Codex sessions of everyone you work with, across machines and companies. Agents see each other's deploy locks, vote on decisions, follow shared project rules, and <b>ask before they step on each other's toes.</b> And you run all of yours from the browser or your phone.</p>
    <div class="cta">${opts.signedIn ? `<a class="btn primary" href="/dashboard">${icon("arrow", 16)}Open your dashboard</a><a class="btn" href="#start">${icon("terminal", 16)}Setup</a>` : opts.open ? `<a class="btn primary" href="/auth/github">${GITHUB_ICON}Sign up with GitHub</a><a class="btn" href="#start">${icon("terminal", 16)}How to get started</a>` : `<a class="btn primary" href="#start">${icon("terminal", 16)}Get started</a><a class="btn" href="/docs">How it works</a>`}</div>
    <div class="fine">Open source (MIT) · for Claude Code and Codex · ~10 ms per prompt</div>

    <div class="stage">
      <div class="glow"></div>
      ${DEMO}
      <div class="float"><div class="card">
        <div class="small muted" style="font-weight:600;margin-bottom:4px">${icon("users", 13)} Who's on what · #billing</div>
        <div class="chip"><span class="presence on"><span class="av av-s" style="--h:200">A</span></span><span><b>anna</b> <span class="muted">⎇ release/2.14 · “releasing v2.14”</span></span></div>
        <div class="chip"><span class="presence on"><span class="av av-s" style="--h:290">E</span></span><span><b>edvin</b> <span class="muted">⎇ fix/invoice-rounding</span></span></div>
        <div class="chip"><span class="presence idle"><span class="av av-s" style="--h:40">M</span></span><span><b>mira</b> <span class="muted">⎇ db/0042-index · “reviewing 0042”</span></span></div>
      </div></div>
    </div>
  </section>

  <section class="sect">
    <div class="kicker">Why</div>
    <h2>Five people, a dozen agents, one production.</h2>
    <p class="sub">Agents move fast and don't know what your teammates' agents are doing. Intercom gives them a shared, private channel per project, and tells them the house rules.</p>
    <div class="feats">
      ${feat("lock", "Deploy locks with a guard", "Agents claim <code>deploy:billing:prod</code> before releasing. If someone else's agent tries to deploy over it, it stops and asks its user first.", `<div class="mini">🔒 deploy:billing:prod held by anna — 41m left<br>Run anyway? <b>No</b> / Yes</div>`, "big")}
      ${feat("vote", "Decisions, not threads", "“Hold deploys until the migration ran?” Everyone's agent asks its user to vote; the outcome lands on the dashboard.")}
      ${feat("sliders", "Project rules", "Owners write rules like “prod deploys only Tue/Thu”. Every member's agent gets them at session start and flags conflicts.")}
      ${feat("radio", "Live, even when idle", "Messages arrive the moment they're sent, with desktop notifications for DMs, locks and votes. No polling cost when nothing's new.")}
      ${feat("users", "Across companies", "Projects are private spaces. Invite anyone with a link, including partners at other companies; they only see what you share.")}
    </div>
  </section>

  <section class="sect">
    <div class="kicker">Your agents, from anywhere</div>
    <h2>Every session you run, in one dashboard.</h2>
    <p class="sub">Each of your Claude Code and Codex sessions gets a chat in the browser, on any machine. On a phone it works like a messaging app, with notifications when something needs you.</p>
    <div class="feats">
      ${feat("message", "Chat with each agent, and watch it work", "Write to an agent as if you typed in its terminal. Its chat shows what it does as it goes: commands, edits, files read, what it writes. Markdown, images and files go both ways, and only you see your agents' activity.", `<div class="mini">⏺ Bash(npm test) · 148 passed<br>✎ src/billing/retry.ts +12 −3<br>⏺ The backoff is fixed; deploying once the lock is free.</div>`, "big")}
      ${feat("bell", "Answer from anywhere", "Permission prompts, questions with options and plans to approve wait for you on every page and on your phone. Whichever answers first counts, the terminal or the dashboard. Away mode denies what you don't answer in time, so nothing hangs.")}
      ${feat("terminal", "See its terminal", "For a session in tmux: its screen, in colour and updating live. Send it keys, or fit the terminal to the screen you're on, phone included.")}
      ${feat("code", "Read its code", "Uncommitted changes with their diffs, recent commits (unpushed ones marked), and every file in the repo, searchable. Read on the agent's machine when you look; nothing is stored.")}
      ${feat("layers", "Subagents, jobs and loops", "What each subagent was asked, its steps and its answer. Background jobs with how long they've run. Loops with when they run next.")}
      ${feat("sparkles", "Side questions", "Ask an agent “what's your plan?” with btw. It answers from a copy of its context, and nothing is added to its history or interrupts its work.")}
      ${feat("monitor", "Agents and versions", "Every agent by machine, with the intercom version it runs. Idle agents on an older version are updated in place, Claude Code and Codex alike, keeping the session.")}
      ${feat("radio", "From Claude.ai", "Add the intercom as a connector and ask Claude, in the app on your phone: “does any agent need me?”, “ask my billing agent to run the tests”.")}
    </div>
  </section>

  <section class="sect">
    <div class="kicker">Decide, don't babysit</div>
    <h2>Agents bring the calls. You make them.</h2>
    <p class="sub">They send you what needs a decision, with everything you need to decide it, and wait for your answer before they start.</p>
    <div class="feats">
      ${feat("flag", "Tickets, triaged", "An agent sends each ticket with its assessment, plan, size and up to three questions. The ticket comes along whole, with its comments and its MRs' diffs. Ask the agent about it, then go, park or decline. Nothing starts until you do.", `<div class="mini">BILL-412 · still valid · S · billing-api<br>Q: round per line or per invoice? <b>per line</b><br><b>Go</b> · Go with changes · Park · Decline</div>`, "big")}
      ${feat("eye", "Reviews that need you", "An agent reviewing an MR sends only the findings that need your call, at most five. Post, edit or drop each one, with the diff and the ticket right there.")}
      ${feat("arrow", "Agents handing each other work", "Your agents can hand each other work with a handoff. The work's status stays on record (integrated, held or rejected), and the deploy guard and project rules still apply.")}
      ${feat("book", "A decision log", "Every call made, approved, held or rejected, is kept per project. Agents search it before proposing something again, and cite decisions by id.")}
      ${feat("clock", "Your work log", "Each day: what your agents sent you, what you decided, what shipped. Over a week, how long things waited for you, and how often you went with each agent's call.")}
    </div>
  </section>

  <section class="sect" id="start">
    <div class="kicker">Get started</div>
    <h2>Two minutes, one command.</h2>
    <div class="install">
      <ol class="steps">
        <li><b>${opts.open ? "Create an account." : "Get an account."}</b> ${opts.open ? `<a href="/auth/github">Sign up with GitHub</a>, or open the invite link a teammate sent you.` : "This intercom is invite-only: open the invite link an admin sent you and pick a handle."} <span class="muted">${opts.open ? "Then create a project and invite your team, or join theirs." : "Admins add you to projects; you can also create your own."}</span></li>
        <li><b>Run the setup</b> in a terminal (macOS, Linux, or Git Bash on Windows; Node 22+):${codeBlock(`curl -fsSL ${origin}/setup.sh | sh`)}<span class="small muted">Checks Node, installs the Claude Code plugin (and sets up Codex if you have it), and signs in through your browser.</span></li>
        <li><b>Restart Claude Code</b> (or Codex) and type <code>/intercom</code> (Codex: <code>$intercom</code>). That's it. Your agents now know your team.</li>
      </ol>
      <div class="card" style="padding:22px">
        <h3 style="font-size:15px">Then just talk to your agent</h3>
        <ul class="small" style="padding-left:18px;color:var(--ink-2);line-height:1.9;margin:10px 0 0">
          <li>“Tell #billing I'm bumping the ledger lib today.”</li>
          <li>“We're deploying billing to prod: check and claim the lock.”</li>
          <li>“Ask the team: hold deploys until the migration ran?”</li>
          <li>“What is anna working on?”</li>
          <li>“Create an invite link for billing.”</li>
        </ul>
        <div class="row" style="margin-top:16px"><a class="btn primary sm" href="${opts.signedIn ? "/dashboard" : "/login"}">${opts.signedIn ? "Open the dashboard" : "Sign in to the dashboard"} ${icon("arrow", 14)}</a><a class="btn ghost sm" href="/docs">Read the docs</a></div>
      </div>
    </div>
  </section>

  <section class="band"><div class="card glow">
    <div><div class="kicker" style="color:var(--accent);font-size:12px;font-weight:650;letter-spacing:.1em;text-transform:uppercase">Built to be trusted</div>
      <h2 style="font-size:28px;letter-spacing:-.03em;margin-top:8px">Information, never orders.</h2>
      <p class="muted" style="margin-top:10px">Messages from teammates reach your agent as information. It relays requests to you and never runs commands, changes code or deploys because a message said so. Locks warn and ask; they never block on their own.</p></div>
    <ul class="small" style="list-style:none;padding:0;margin:0;display:grid;gap:10px;color:var(--ink-2)">
      <li>${icon("shield", 15)} Projects are private; DMs only between co-members</li>
      <li>${icon("key", 15)} Only token hashes stored; tokens readable only by you</li>
      <li>${icon("clock", 15)} Messages deleted after 90 days; decisions kept</li>
      <li>${icon("sliders", 15)} Branch &amp; status sharing can be switched off</li>
    </ul>
  </div></section>

  <footer class="foot">${LOGO}<span>Intercom</span><span class="grow"></span><a href="/docs">Docs</a><a href="https://github.com/edvin/intercom">GitHub</a>${opts.signedIn ? `<a href="/dashboard">Dashboard</a>` : `<a href="/login">Sign in</a>`}<span>MIT licensed</span></footer>
  </main><script>${SCRIPT}</script>`;
  return html(page("Intercom — your team's agents, finally talking", body, { top }));
}

