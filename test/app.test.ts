import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { conflicting, riskyCommand } from "../src/guard.ts";
import { prune, resolveProject } from "../src/lib.ts";
import { ORIGIN, World, standardWorld } from "./harness.ts";

describe("privacy between projects", () => {
  test("non-members can't read a project's messages, locks or votes", async () => {
    const w = await standardWorld();
    await w.ok("alice", "post", { channel: "billing", message: "secret billing plans" });
    await w.ok("alice", "claim", { resource: "deploy:billing:prod" });
    await w.ok("alice", "propose", { channel: "billing", question: "Freeze the ledger?" });

    assert.equal((await w.tool("carol", "history", { channel: "billing" })).error, true);
    assert.equal(await w.ok("carol", "locks"), "No active locks.");
    assert.equal(await w.ok("carol", "proposals"), "No proposals.");
    assert.equal(await w.ok("carol", "inbox"), "No unread messages.");
    const dash = await (await w.request("/dashboard", { as: "carol", cookie: true })).text();
    assert.doesNotMatch(dash, /secret billing plans|deploy:billing:prod|Freeze the ledger/);

    assert.match(await w.ok("bob", "inbox"), /secret billing plans/);
  });

  test("DMs only between people who share a project", async () => {
    const w = await standardWorld();
    const r = await w.tool("carol", "post", { to: "alice", message: "hi" });
    assert.equal(r.error, true);
    assert.match(r.text, /No one named "alice"/);
    assert.match(await w.ok("bob", "post", { to: "alice", message: "hi alice" }), /Sent DM/);
    assert.match(await w.ok("alice", "inbox"), /hi alice/);
  });

  test("repo lookup only considers your own projects", async () => {
    const w = await standardWorld();
    await w.ok("carol", "configure_project", { name: "shop", repos: ["api"] });
    await w.ok("alice", "configure_project", { name: "core", repos: ["api"] });
    assert.equal((await resolveProject(w.env(), "api", "carol"))?.name, "shop");
    assert.equal((await resolveProject(w.env(), "api", "alice"))?.name, "core");
    assert.equal(await resolveProject(w.env(), "api", "bob"), null);
  });

  test("team only shows co-members, and where they are only if you can see it", async () => {
    const w = await standardWorld();
    const team = await w.ok("bob", "team");
    assert.match(team, /alice/);
    assert.doesNotMatch(team, /carol/);
  });
});

describe("locks", () => {
  test("a held lock can't be claimed by someone else, and outsiders can't claim at all", async () => {
    const w = await standardWorld();
    await w.ok("bob", "claim", { resource: "deploy:billing:prod", reason: "v2.14" });
    const taken = await w.tool("alice", "claim", { resource: "deploy:billing:prod" });
    assert.equal(taken.error, true);
    assert.match(taken.text, /NOT claimed.*bob/s);
    assert.equal((await w.tool("carol", "claim", { resource: "deploy:billing:prod" })).error, true);
    assert.match(await w.ok("bob", "release", { resource: "deploy:billing:prod", note: "done" }), /Released/);
    assert.match(await w.ok("alice", "claim", { resource: "deploy:billing:prod" }), /Claimed/);
  });

  test("lock activity reaches members who muted the sender", async () => {
    const w = await standardWorld();
    await w.ok("bob", "mute", { person: "alice" });
    await w.ok("alice", "post", { channel: "billing", message: "chatter" });
    await w.ok("alice", "claim", { resource: "deploy:billing:prod" });
    const inbox = await w.ok("bob", "inbox");
    assert.doesNotMatch(inbox, /chatter/);
    assert.match(inbox, /claimed lock deploy:billing:prod/);
  });
});

describe("deploy guard", () => {
  test("recognises risky commands and leaves ordinary ones alone", () => {
    for (const c of [
      "helm upgrade billing ./chart -f values-prod.yaml",
      "kubectl apply -f k8s/",
      "terraform apply -auto-approve",
      "npx wrangler deploy",
      "npm run deploy",
      "pnpm release",
      "./scripts/deploy.sh prod",
      "bundle exec rails db:migrate",
      "python manage.py migrate",
      "cd infra && FOO=1 terraform destroy",
      "flux reconcile kustomization billing",
    ]) {
      assert.ok(riskyCommand(c), c);
    }
    for (const c of ["ls -la", "cat deploy.yaml", "grep -r deploy src", "git log --grep deploy", "npm install", "kubectl get pods", "helm list", "npm test", "vim scripts/deploy.sh"]) {
      assert.equal(riskyCommand(c), null, c);
    }
    assert.equal(riskyCommand("helm upgrade billing ./chart --set env=production")?.env, "prod");
    assert.equal(riskyCommand("npm run migrate")?.action, "migrate");
    assert.equal(riskyCommand("npx wrangler deploy 2>/dev/null")?.env, null);
    assert.equal(riskyCommand("npm test && npx wrangler deploy")?.env, null);
    assert.equal(riskyCommand("npm test && helm upgrade billing chart -f values-prod.yaml")?.env, "prod");
  });

  test("only locks for the same project and environment conflict", () => {
    const lock = (resource: string, holder = "bob") => ({ resource, holder, reason: "", channel: resource.split(":")[1], created_at: 0, expires_at: Date.now() + 1e6 });
    const prod = riskyCommand("helm upgrade billing chart --set env=prod")!;
    assert.equal(conflicting([lock("deploy:billing:prod")], "alice", "billing", "helm upgrade billing chart --set env=prod", prod).length, 1);
    assert.equal(conflicting([lock("deploy:billing:staging")], "alice", "billing", "helm upgrade billing chart --set env=prod", prod).length, 0);
    assert.equal(conflicting([lock("deploy:billing:prod", "alice")], "alice", "billing", "helm upgrade x", prod).length, 0);
    assert.equal(conflicting([lock("deploy:shop:prod")], "alice", "billing", "helm upgrade x --set env=prod", prod).length, 0);
    // Deploying another project by name from a different repo still counts.
    assert.equal(conflicting([lock("deploy:shop:prod")], "alice", "billing", "helm upgrade shop chart --set env=prod", prod).length, 1);
  });

  test("asks the user when a teammate holds the lock; reminds to claim otherwise", async () => {
    const w = await standardWorld();
    const guard = async (command: string) => {
      const res = await w.request("/api/guard?project=billing-api", { method: "POST", as: "alice", body: JSON.stringify({ tool_input: { command } }) });
      const t = await res.text();
      return t ? JSON.parse(t).hookSpecificOutput : null;
    };
    assert.equal(await guard("ls -la"), null);
    const hint = await guard("helm upgrade billing chart -f values-prod.yaml");
    assert.equal(hint.permissionDecision, undefined);
    assert.match(hint.additionalContext, /claim `deploy:billing:prod`/);

    await w.ok("bob", "claim", { resource: "deploy:billing:prod", reason: "releasing v2.14" });
    const ask = await guard("helm upgrade billing chart -f values-prod.yaml");
    assert.equal(ask.permissionDecision, "ask");
    assert.match(ask.permissionDecisionReason, /deploy:billing:prod is held by bob.*releasing v2\.14/);

    // carol can't see billing's locks, so the guard can't reveal them to her.
    const res = await w.request("/api/guard?project=billing-api", { method: "POST", as: "carol", body: JSON.stringify({ tool_input: { command: "helm upgrade billing chart" } }) });
    assert.equal(await res.text(), "");
  });
});

describe("invites and accounts", () => {
  test("an invite link creates an account once, then is used up", async () => {
    const w = await standardWorld();
    const text = await w.ok("alice", "invite", { project: "billing", uses: 1 });
    const code = text.match(/\/join\/([0-9a-f]+)/)![1];
    const join = (handle: string) =>
      w.request(`/join/${code}`, { method: "POST", headers: { origin: ORIGIN }, body: new URLSearchParams({ handle, org: "initech" }) });
    const res = await join("dave");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie") ?? "", /intercom_token=.*HttpOnly; Secure; SameSite=Lax/);
    assert.match(await res.text(), /Welcome, dave/);
    assert.equal((await join("erin")).status, 404);
    const projects = await w.db.prepare("SELECT project FROM project_members WHERE member = 'dave'").all<{ project: string }>();
    assert.deepEqual(projects.results.map((r) => r.project), ["billing"]);
  });

  test("only owners can invite, and handles are validated", async () => {
    const w = await standardWorld();
    assert.equal((await w.tool("bob", "invite", { project: "billing" })).error, true);
    const code = (await w.ok("alice", "invite", { project: "billing" })).match(/\/join\/([0-9a-f]+)/)![1];
    const res = await w.request(`/join/${code}`, { method: "POST", headers: { origin: ORIGIN }, body: new URLSearchParams({ handle: "<script>" }) });
    assert.equal(res.status, 400);
  });

  test("admin actions: only admins, no self-demotion or self-deletion", async () => {
    const w = await standardWorld();
    assert.equal((await w.form("/admin-action/create", "bob", { name: "mallory" })).status, 403);
    const self = await w.form("/admin-action/delete", "alice", { name: "alice", confirm: "alice" });
    assert.match(decodeURIComponent(self.headers.get("location")!), /can't delete your own account/);
    const demote = await w.form("/admin-action/update", "alice", { name: "alice" });
    assert.match(decodeURIComponent(demote.headers.get("location")!), /can't remove your own admin/);
    const created = await w.form("/admin-action/create", "alice", { name: "frank" });
    assert.equal(created.status, 200);
    assert.match(await created.text(), /only once/);
  });
});

describe("web security", () => {
  test("cross-origin form posts are refused", async () => {
    const w = await standardWorld();
    const res = await w.form("/action/post", "alice", { channel: "billing", message: "csrf" }, "https://evil.example");
    assert.equal(res.status, 403);
    assert.equal(await w.ok("bob", "inbox"), "No unread messages.");
  });

  test("message text is escaped on the dashboard", async () => {
    const w = await standardWorld();
    await w.ok("bob", "post", { channel: "billing", message: '<img src=x onerror="alert(1)"><script>alert(2)</script>' });
    const res = await w.request("/dashboard", { as: "alice", cookie: true });
    const page = await res.text();
    assert.doesNotMatch(page, /<img src=x|<script>alert/);
    assert.match(page, /&lt;script&gt;alert\(2\)/);
    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  });

  test("dashboard requires sign-in", async () => {
    const w = await standardWorld();
    const res = await w.request("/account", { redirect: "manual" });
    assert.equal(res.status, 303);
    assert.match(await (await w.request("/")).text(), /finally talking/);
    // Signed in, the overview is still at /welcome, pointing to the dashboard.
    const welcome = await (await w.request("/", { as: "alice", cookie: true })).text();
    assert.match(welcome, /finally talking/);
    assert.match(welcome, /Open your dashboard/);
    // Old dashboard links move to /dashboard; /dashboard needs sign-in.
    const old = await w.request("/?channel=billing", { as: "alice", cookie: true, redirect: "manual" });
    assert.equal(old.headers.get("location"), "/dashboard?channel=billing");
    assert.match((await w.request("/dashboard", { redirect: "manual" })).headers.get("location") ?? "", /\/login\?next=%2Fdashboard/);
    assert.equal((await w.request("/mcp", { method: "POST", headers: { authorization: "Bearer nope" } })).status, 401);
  });
});

describe("hooks, status and export", () => {
  test("session start brings rules, locks and the session address", async () => {
    const w = await standardWorld();
    await w.ok("alice", "claim", { resource: "deploy:billing:prod" });
    const res = await w.request("/api/hook?event=SessionStart&project=billing-api&session=abcd1234-x", { as: "bob" });
    const ctx = ((await res.json()) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
    assert.match(ctx, /Prod deploys only Tue\/Thu/);
    assert.match(ctx, /deploy:billing:prod held by alice/);
    assert.match(ctx, /bob\/billing-abcd/);
  });

  test("brief is read-only", async () => {
    const w = await standardWorld();
    await w.ok("bob", "inbox"); // a member's read position starts when they first connect
    await w.ok("alice", "post", { channel: "billing", message: "heads up" });
    const brief = await (await w.request("/api/brief?project=billing-api", { as: "bob" })).text();
    assert.match(brief, /current project #billing/);
    assert.match(brief, /heads up/);
    assert.match(await w.ok("bob", "inbox"), /heads up/);
  });

  test("export is for members only", async () => {
    const w = await standardWorld();
    const id = (await w.ok("alice", "propose", { channel: "billing", question: "Freeze Friday?" })).match(/#(\d+)/)![1];
    await w.ok("bob", "vote", { proposal_id: Number(id), choice: "yes" });
    await w.ok("alice", "close_proposal", { proposal_id: Number(id), outcome: "yes, freeze" });
    const res = await w.request("/export/billing.md", { as: "bob" });
    const md = await res.text();
    assert.match(md, /\*\*Decision: yes, freeze\*\*/);
    assert.match(md, /- yes: bob/);
    assert.equal((await w.request("/export/billing.md", { as: "carol" })).status, 404);
  });
});

describe("retention", () => {
  test("old messages are pruned; decisions stay", async () => {
    const w = await standardWorld();
    await w.ok("alice", "post", { channel: "billing", message: "old news" });
    await w.ok("alice", "propose", { channel: "billing", question: "Keep me?" });
    const removed = await prune(w.env(), 90, Date.now() + 91 * 86400_000);
    assert.ok(removed.messages >= 2);
    const left = await w.db.prepare("SELECT COUNT(*) AS n FROM messages").first<{ n: number }>();
    assert.equal(left!.n, 0);
    assert.match(await w.ok("bob", "proposals"), /Keep me\?/);
  });
});

describe("visibility", () => {
  test("branch and status are shown to project members only", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=aaaa1111&branch=feat/ledger-4.2", { as: "bob" });
    await w.ok("bob", "set_status", { note: "migrating invoices index" }, { id: "aaaa1111", project: "billing-api" });
    const team = await w.ok("alice", "team");
    assert.match(team, /bob\/billing-aaaa \[Claude Code\]: #billing · branch feat\/ledger-4\.2 · “migrating invoices index”/);
    // carol shares no project with bob: she can't even see him.
    assert.doesNotMatch(await w.ok("carol", "team"), /bob/);
    // A project alice isn't in stays hidden from her, even though she shares #billing with bob.
    await w.ok("alice", "invite", { project: "shop", name: "bob" });
    await w.request("/api/hook?event=SessionStart&project=shop&session=bbbb2222&branch=secret-shop-branch", { as: "bob" });
    const later = await w.ok("alice", "team");
    assert.doesNotMatch(later, /secret-shop-branch/);
    assert.match(later, /also active in projects you're not in/);
  });

  test("any member can link a repo; the session's repo is the default", async () => {
    const w = await standardWorld();
    const out = await w.ok("bob", "link_repo", { project: "billing" }, { id: "cccc3333", project: "billing-legacy" });
    assert.match(out, /Linked billing-legacy to #billing/);
    assert.equal((await resolveProject(w.env(), "billing-legacy", "alice"))?.name, "billing");
    assert.equal((await w.tool("carol", "link_repo", { project: "billing", repo: "x" })).error, true);
  });

  test("unlinked repos get an offer to link them", async () => {
    const w = await standardWorld();
    const res = await w.request("/api/hook?event=SessionStart&project=billing-fork&session=dddd4444", { as: "bob" });
    const ctx = ((await res.json()) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
    assert.match(ctx, /isn't linked.*#billing.*link_repo/s);
  });
});

describe("account", () => {
  test("a new token replaces the old one", async () => {
    const w = await standardWorld();
    const res = await w.form("/account", "bob", { action: "token" });
    assert.equal(res.status, 200);
    const page = await res.text();
    const token = page.match(/setup\.sh \| sh -s -- ([0-9a-f]{48})/)![1];
    assert.equal((await w.request("/api/whoami", { as: "bob" })).status, 401);
    assert.equal(await (await w.request("/api/whoami", { headers: { authorization: `Bearer ${token}` } })).text(), "bob");
    assert.equal((await w.form("/account", "alice", { action: "token" }, "https://evil.example")).status, 403);
  });

  test("invite links honour the chosen lifetime", async () => {
    const w = await standardWorld();
    await w.ok("alice", "invite", { project: "billing", expires_in_hours: 24 });
    const inv = await w.db.prepare("SELECT expires_at, created_at FROM invites").first<{ expires_at: number; created_at: number }>();
    assert.equal(Math.round((inv!.expires_at - inv!.created_at) / 3600_000), 24);
  });
});

describe("browser-approved setup", () => {
  test("a terminal gets a token only after the user approves it", async () => {
    const w = await standardWorld();
    const start = (await (await w.request("/api/cli/start", { method: "POST" })).json()) as { code: string; user_code: string };
    assert.equal(((await (await w.request(`/api/cli/poll?code=${start.code}`)).json()) as { status: string }).status, "pending");
    const page = await (await w.request(`/connect?c=${start.user_code}`, { as: "bob", cookie: true })).text();
    assert.match(page, new RegExp(start.user_code));
    assert.equal((await w.form(`/connect?c=${start.user_code}`, "bob", { action: "approve" })).status, 200);
    const done = (await (await w.request(`/api/cli/poll?code=${start.code}`)).json()) as { status: string; token: string; name: string };
    assert.equal(done.status, "approved");
    assert.equal(done.name, "bob");
    assert.equal(await (await w.request("/api/whoami", { headers: { authorization: `Bearer ${done.token}` } })).text(), "bob");
    // The dashboard accepts it too (e.g. /intercom dashboard's one-click sign-in).
    const login = await w.request("/login", { method: "POST", body: new URLSearchParams({ token: done.token }), redirect: "manual" });
    assert.equal(login.status, 303);
    // Handed out once only.
    assert.equal((await w.request(`/api/cli/poll?code=${start.code}`)).status, 404);
    // Cross-site approval is refused.
    const again = (await (await w.request("/api/cli/start", { method: "POST" })).json()) as { user_code: string };
    assert.equal((await w.form(`/connect?c=${again.user_code}`, "bob", { action: "approve" }, "https://evil.example")).status, 403);
  });
});

describe("GitHub", () => {
  const realFetch = globalThis.fetch;
  function stubGitHub(user: { id: number; login: string }, repos: Record<string, { push: boolean }> = {}) {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input instanceof Request ? input.url : input);
      if (u.startsWith("https://github.com/login/oauth/access_token")) return Response.json({ access_token: "gh-token" });
      if (u === "https://api.github.com/user") return Response.json(user);
      const m = u.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/);
      if (m) return repos[m[1]] ? Response.json({ permissions: { push: repos[m[1]].push } }) : new Response("not found", { status: 404 });
      throw new Error(`unexpected fetch ${u}`);
    }) as typeof fetch;
  }
  const restore = () => (globalThis.fetch = realFetch);

  async function oauth(w: World, query: string, cookie = "") {
    const start = await w.request(`/auth/github${query}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
    assert.equal(start.status, 303);
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const stateCookie = start.headers.get("set-cookie")!.split(";")[0];
    return w.request(`/auth/github/callback?code=c&state=${state}`, { headers: { cookie: [stateCookie, cookie].filter(Boolean).join("; ") }, redirect: "manual" });
  }
  const sessionFrom = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("intercom_token=") && !c.includes("Max-Age=0"))!.split(";")[0];

  test("sign-up with GitHub creates one account; signing in again reuses it", async () => {
    const w = await standardWorld();
    w.github = { client_id: "id", client_secret: "secret" };
    await w.db.prepare("INSERT INTO settings (key, value) VALUES ('open_signup', '1')").run(); // anyone with GitHub
    stubGitHub({ id: 42, login: "Dominic.X" });
    try {
      const ask = await oauth(w, "");
      const askPage = await ask.text();
      assert.match(askPage, /Create a new account\?/);
      assert.match(askPage, /Already have an Intercom account\?/);
      const pending = askPage.match(/name="pending" value="([0-9a-f]+)"/)![1];
      const res = await w.request("/auth/github/create", { method: "POST", headers: { origin: ORIGIN }, body: new URLSearchParams({ pending }), redirect: "manual" });
      assert.equal(res.status, 303);
      assert.equal(res.headers.get("location"), "/dashboard?welcome=1");
      const who = await (await w.request("/api/whoami", { headers: { cookie: sessionFrom(res) } })).text();
      assert.equal(who, "dominic-x");
      const again = await oauth(w, "");
      assert.equal(await (await w.request("/api/whoami", { headers: { cookie: sessionFrom(again) } })).text(), "dominic-x");
      const n = await w.db.prepare("SELECT COUNT(*) AS n FROM members WHERE github_id = 42").first<{ n: number }>();
      assert.equal(n!.n, 1);
    } finally {
      restore();
    }
  });

  test("invite-only instances still let invited people sign up with GitHub", async () => {
    const w = await standardWorld();
    w.github = { client_id: "id", client_secret: "secret" };
    await w.db.prepare("INSERT INTO settings (key, value) VALUES ('open_signup', '0')").run();
    stubGitHub({ id: 7, login: "erin" });
    try {
      const closed = await oauth(w, "");
      assert.match(await closed.text(), /invite-only/);
      assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM members WHERE github_id = 7").first<{ n: number }>())!.n, 0);
      const code = (await w.ok("alice", "invite", { project: "billing" })).match(/\/join\/([0-9a-f]+)/)![1];
      const invited = await oauth(w, `?next=${encodeURIComponent(`/join/${code}`)}`);
      const pending = (await invited.text()).match(/name="pending" value="([0-9a-f]+)"/)![1];
      const made = await w.request("/auth/github/create", { method: "POST", headers: { origin: ORIGIN }, body: new URLSearchParams({ pending }), redirect: "manual" });
      assert.equal(made.headers.get("location"), `/join/${code}`);
    } finally {
      restore();
    }
  });

  test("push access to a linked repo lets you join; others are refused", async () => {
    const w = await standardWorld();
    await w.db.prepare("INSERT INTO settings (key, value) VALUES ('open_signup', '1')").run(); // open mode: owners and repo access let people in
    w.github = { client_id: "id", client_secret: "secret" };
    await w.ok("alice", "configure_project", { name: "billing", github_repos: ["acme/billing-api"] });
    const carol = `intercom_token=${w.tokens.carol}`;
    stubGitHub({ id: 9, login: "carol" }, { "acme/billing-api": { push: true } });
    try {
      // Without a fresh access check, joining is refused.
      const early = await w.form("/discover/join", "carol", { project: "billing", repo: "acme/billing-api" });
      assert.match(decodeURIComponent(early.headers.get("location")!), /Check your repo access/);
      const check = await oauth(w, "?purpose=discover&repo=acme/billing-api", carol);
      assert.equal(check.headers.get("location"), "/discover?repo=acme/billing-api");
      const page = await (await w.request("/discover?repo=acme/billing-api", { as: "carol", cookie: true })).text();
      assert.match(page, /billing/);
      const join = await w.form("/discover/join", "carol", { project: "billing", repo: "acme/billing-api" });
      assert.match(join.headers.get("location")!, /channel=billing/);
      assert.ok((await w.ok("carol", "projects")).includes("#billing"));
    } finally {
      restore();
    }
    stubGitHub({ id: 10, login: "mallory" }, { "acme/billing-api": { push: false } });
    try {
      await w.member("mallory");
      const denied = await oauth(w, "?purpose=discover&repo=acme/billing-api", `intercom_token=${w.tokens.mallory}`);
      assert.match(decodeURIComponent(denied.headers.get("location")!), /doesn't have push access/);
    } finally {
      restore();
    }
  });

  test("connecting GitHub folds in an empty duplicate account made by signing up", async () => {
    const w = await standardWorld();
    w.github = { client_id: "id", client_secret: "secret" };
    await w.db.prepare("INSERT INTO members (name, token_hash, created_at, github_id, github_login) VALUES ('alice-2', 'x', 0, 55, 'alice')").run();
    stubGitHub({ id: 55, login: "alice" });
    try {
      const res = await oauth(w, "?purpose=link", `intercom_token=${w.tokens.alice}`);
      assert.match(decodeURIComponent(res.headers.get("location")!), /Connected GitHub \(@alice\)/);
      assert.equal(await w.db.prepare("SELECT 1 FROM members WHERE name = 'alice-2'").first(), null);
      assert.equal((await w.db.prepare("SELECT github_id FROM members WHERE name = 'alice'").first<{ github_id: number }>())!.github_id, 55);
    } finally {
      restore();
    }
  });

  test("a callback without the browser's state cookie is rejected", async () => {
    const w = await standardWorld();
    w.github = { client_id: "id", client_secret: "secret" };
    stubGitHub({ id: 1, login: "x" });
    try {
      const start = await w.request("/auth/github", { redirect: "manual" });
      const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
      const res = await w.request(`/auth/github/callback?code=c&state=${state}`, { redirect: "manual" });
      assert.match(await res.text(), /expired/);
    } finally {
      restore();
    }
  });
});

describe("join requests", () => {
  test("discoverable projects accept requests; private ones give the same answer", async () => {
    const w = await standardWorld();
    await w.db.prepare("INSERT INTO settings (key, value) VALUES ('open_signup', '1')").run(); // open mode: owners and repo access let people in
    await w.ok("alice", "configure_project", { name: "billing", discoverable: true });
    const asked = await w.form("/discover/request", "carol", { project: "billing", note: "carol from globex" });
    const hidden_ = await w.form("/discover/request", "carol", { project: "shop-secret" });
    const msg = (r: Response) => decodeURIComponent(r.headers.get("location")!).replace(/#[\w-]+/, "#x");
    assert.equal(msg(asked), msg(hidden_));
    assert.match(await w.ok("alice", "inbox"), /asked to join #billing — “carol from globex”/);
    assert.match(await w.ok("alice", "join_requests"), /carol \(globex\)/);
    assert.equal((await w.tool("bob", "join_requests", { project: "billing", name: "carol", decision: "approve" })).error, true);
    assert.match(await w.ok("alice", "join_requests", { project: "billing", name: "carol", decision: "approve" }), /now a member/);
    assert.ok((await w.ok("carol", "projects")).includes("#billing"));
  });

  test("rate limits stop floods", async () => {
    const w = await standardWorld();
    const { rateLimit } = await import("../src/lib.ts");
    for (let i = 0; i < 3; i++) assert.equal(await rateLimit(w.env(), "t", 3, 60_000), true);
    assert.equal(await rateLimit(w.env(), "t", 3, 60_000), false);
  });
});

describe("ui snapshot", () => {
  test("shows locks, votes and unread for your projects only, without marking anything read", async () => {
    const w = await standardWorld();
    await w.ok("bob", "claim", { resource: "deploy:billing:prod", reason: "v2.14" });
    await w.ok("bob", "propose", { channel: "billing", question: "Freeze Friday?" });
    await w.ok("bob", "post", { to: "alice", message: "lunch?" });
    const a = (await (await w.request("/api/ui?project=billing-api", { as: "alice" })).json()) as {
      project: string; unread: number; locks: { resource: string; here: boolean; mine: boolean }[]; votes: { question: string }[]; recent: { dm: boolean; body: string }[];
    };
    assert.equal(a.project, "billing");
    assert.deepEqual(a.locks.map((l) => [l.resource, l.here, l.mine]), [["deploy:billing:prod", true, false]]);
    assert.deepEqual(a.votes.map((v) => v.question), ["Freeze Friday?"]);
    assert.ok(a.recent.some((m) => m.dm && m.body === "lunch?"));
    assert.match(await w.ok("alice", "inbox"), /lunch\?/); // still unread for the agent
    const c = (await (await w.request("/api/ui", { as: "carol" })).json()) as { locks: unknown[]; votes: unknown[]; recent: unknown[] };
    assert.equal(c.locks.length + c.votes.length + c.recent.length, 0);
  });
});

describe("Codex", () => {
  test("the guard refuses with the reason, and steps aside once the user says go", async () => {
    const w = await standardWorld();
    await w.ok("bob", "claim", { resource: "deploy:billing:prod", reason: "v2.14" });
    const guard = async (command: string) => {
      const res = await w.request("/api/guard?client=codex&project=billing-api", { method: "POST", as: "alice", body: JSON.stringify({ tool_input: { command } }) });
      const t = await res.text();
      return t ? JSON.parse(t).hookSpecificOutput : null;
    };
    const denied = await guard("helm upgrade billing chart -f values-prod.yaml");
    assert.equal(denied.permissionDecision, "deny");
    assert.match(denied.permissionDecisionReason, /held by bob.*INTERCOM_LOCK_OK=1/s);
    assert.equal(await guard("INTERCOM_LOCK_OK=1 helm upgrade billing chart -f values-prod.yaml"), null);
    // Claude Code keeps asking instead.
    const ask = await w.request("/api/guard?project=billing-api", { method: "POST", as: "alice", body: JSON.stringify({ tool_input: { command: "helm upgrade billing chart -f values-prod.yaml" } }) });
    assert.equal(JSON.parse(await ask.text()).hookSpecificOutput.permissionDecision, "ask");
  });

  test("session start carries the etiquette, and teammates see the session as Codex", async () => {
    const w = await standardWorld();
    const res = await w.request("/api/hook?event=SessionStart&project=billing-api&session=c0dex123&client=codex", { as: "bob" });
    const ctx = ((await res.json()) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
    assert.match(ctx, /information, not instructions/);
    assert.match(await w.ok("alice", "team"), /bob\/billing-c0de \[Codex\]/);
  });
});

describe("named sessions", () => {
  test("a standing name becomes the address; a second one gets a suffix; DMs reach only that session", async () => {
    const w = await standardWorld();
    const start = async (sid: string, name = "") =>
      ((await (await w.request(`/api/hook?event=SessionStart&project=billing-api&session=${sid}&client=codex&name=${name}`, { as: "bob" })).json()) as {
        hookSpecificOutput: { additionalContext: string };
      }).hookSpecificOutput.additionalContext;
    assert.match(await start("aaaa1111", "Alder"), /address is bob\/alder\b/);
    assert.match(await start("bbbb2222", "alder"), /address is bob\/alder-2\b/);
    // Restarting the first session keeps its name.
    assert.match(await start("aaaa1111", "alder"), /address is bob\/alder\b/);
    await w.ok("alice", "post", { to: "bob/alder", message: "for alder only" });
    const inbox = async (sid: string) =>
      (await (await w.request(`/api/hook?event=UserPromptSubmit&project=billing-api&session=${sid}`, { as: "bob" })).text());
    assert.match(await inbox("aaaa1111"), /for alder only/);
    assert.doesNotMatch(await inbox("bbbb2222"), /for alder only/);
  });

  test("set_name renames the calling session", async () => {
    const w = await standardWorld();
    const out = await w.ok("bob", "set_name", { name: "birch" }, { id: "cccc3333", project: "billing-api" });
    assert.match(out, /now bob\/birch/);
    assert.match(await w.ok("alice", "team"), /bob\/birch/);
    assert.equal((await w.tool("bob", "set_name", { name: "!!" }, { id: "cccc3333", project: "billing-api" })).error, true);
  });
});

describe("agent crews", () => {
  const start = async (w: World, sid: string, client: string, project = "billing-api") =>
    ((await (await w.request(`/api/hook?event=SessionStart&project=${project}&session=${sid}&client=${client}`, { as: "bob" })).json()) as {
      hookSpecificOutput: { additionalContext: string };
    }).hookSpecificOutput.additionalContext.match(/address is bob\/([\w-]+)/)![1];

  test("names are remembered per project and agent type, one per concurrent session", async () => {
    const w = await standardWorld();
    // Name two Codex sessions in billing.
    await start(w, "c1", "codex");
    await w.ok("bob", "set_name", { name: "alder", role: "reviews migrations" }, { id: "c1", project: "billing-api" });
    await start(w, "c2", "codex");
    await w.ok("bob", "set_name", { name: "birch" }, { id: "c2", project: "billing-api" });
    // Both end; new Codex sessions in billing take alder, then birch, then nothing.
    await w.request("/api/hook?event=SessionEnd&session=c1", { as: "bob" });
    await w.request("/api/hook?event=SessionEnd&session=c2", { as: "bob" });
    assert.equal(await start(w, "c3", "codex"), "alder");
    assert.equal(await start(w, "c4", "codex"), "birch");
    assert.match(await start(w, "c5", "codex"), /^billing-/);
    // Remembered roles come back as the status note.
    assert.match(await w.ok("alice", "team"), /bob\/alder \[Codex\]: .*“reviews migrations”/);
    // Claude Code sessions in billing and Codex elsewhere have crews of their own.
    assert.match(await start(w, "k1", "claude"), /^billing-/);
    await w.ok("alice", "invite", { project: "shop", name: "bob" });
    assert.match(await start(w, "c6", "codex", "shop"), /^shop-/);
    // A resumed session keeps its name.
    assert.equal(await start(w, "c4", "codex"), "birch");
  });

  test("forget removes a name from the crew", async () => {
    const w = await standardWorld();
    await start(w, "c1", "codex");
    await w.ok("bob", "set_name", { name: "alder" }, { id: "c1", project: "billing-api" });
    assert.match(await w.ok("bob", "set_name", { name: "alder", forget: true }, { id: "c1", project: "billing-api" }), /Forgot alder/);
    await w.request("/api/hook?event=SessionEnd&session=c1", { as: "bob" });
    assert.match(await start(w, "c2", "codex"), /^billing-/);
  });
});

describe("one person, several agents", () => {
  test("a Claude Code and a Codex session of the same person see each other's posts and DMs, not their own", async () => {
    const w = await standardWorld();
    const hook = async (sid: string, client: string, event = "SessionStart") =>
      (await (await w.request(`/api/hook?event=${event}&project=billing-api&session=${sid}&client=${client}`, { as: "bob" })).text());
    await hook("claude-1", "claude");
    await hook("codex-1", "codex");
    await w.ok("bob", "set_name", { name: "loxodon-core" }, { id: "claude-1", project: "billing-api" });
    await w.ok("bob", "set_name", { name: "alder" }, { id: "codex-1", project: "billing-api" });
    await w.ok("bob", "post", { channel: "billing", message: "schema change merged" }, { id: "claude-1", project: "billing-api" });
    assert.match(await hook("codex-1", "codex", "UserPromptSubmit"), /bob\/loxodon-core.*schema change merged/);
    assert.doesNotMatch(await hook("claude-1", "claude", "UserPromptSubmit"), /schema change merged/);
    await w.ok("bob", "post", { to: "bob/loxodon-core", message: "rebased, ready for review" }, { id: "codex-1", project: "billing-api" });
    assert.match(await hook("claude-1", "claude", "UserPromptSubmit"), /bob\/alder.*rebased, ready for review/);
    // The person's own view (status line, dashboard counts) still doesn't count their own messages as unread.
    const ui = (await (await w.request("/api/ui?project=billing-api", { as: "bob" })).json()) as { recent: { body: string }[] };
    assert.ok(!ui.recent.some((m) => m.body.includes("schema change merged")));
  });
});

describe("own agents through the tools", () => {
  test("inbox, history by address and team work between one person's sessions", async () => {
    const w = await standardWorld();
    const lox = { id: "claude-9", project: "billing-api" };
    const alder = { id: "codex-9", project: "billing-api" };
    await w.ok("bob", "inbox", {}, lox);
    await w.ok("bob", "inbox", {}, alder);
    await w.ok("bob", "set_name", { name: "loxodon-core" }, lox);
    await w.ok("bob", "set_name", { name: "alder" }, alder);
    await w.ok("bob", "post", { to: "bob/alder", message: "please review PR 12" }, lox);
    assert.match(await w.ok("bob", "inbox", {}, alder), /DM bob\/loxodon-core → bob\/alder.*please review PR 12/);
    assert.equal(await w.ok("bob", "inbox", {}, lox), "No unread messages.");
    assert.match(await w.ok("bob", "history", { with: "bob/loxodon-core" }, alder), /please review PR 12/);
    // A lone person's team view lists their own sessions instead of "nobody".
    const solo = new World();
    await solo.member("zed");
    await solo.ok("zed", "configure_project", { name: "zz" });
    await solo.ok("zed", "set_name", { name: "alder" }, { id: "s1", project: "zz" });
    const team = await solo.ok("zed", "team");
    assert.match(team, /Your sessions|your sessions/);
    assert.match(team, /zed\/alder/);
    assert.match(team, /Nobody else shares a project with you yet/);
  });
});

describe("status for an agent", () => {
  test("counts the other sessions' messages and lists them", async () => {
    const w = await standardWorld();
    const lox = { id: "claude-7", project: "billing-api" };
    const alder = { id: "codex-7", project: "billing-api" };
    await w.ok("bob", "inbox", {}, lox);
    await w.ok("bob", "inbox", {}, alder);
    await w.ok("bob", "set_name", { name: "alder" }, alder);
    await w.ok("bob", "post", { channel: "billing", message: "perf numbers are in" }, alder);
    const brief = await (await w.request("/api/brief?project=billing-api&session=claude-7", { as: "bob" })).text();
    assert.match(brief, /Unread \(1\)/);
    assert.match(brief, /perf numbers are in/);
    assert.match(brief, /Your other sessions:\n\s+bob\/alder/);
  });
});

describe("what the person sees", () => {
  test("hook deliveries carry a one-line summary for the terminal, unless switched off", async () => {
    const w = await standardWorld();
    const get = async (q: string) => (await (await w.request(`/api/hook?${q}`, { as: "bob" })).json()) as { systemMessage?: string };
    const start = await get("event=SessionStart&project=billing-api&session=s1");
    assert.match(start.systemMessage!, /📻 bob\/billing-s1 in #billing/);
    await w.ok("alice", "post", { to: "bob", message: "can you hold the deploy?" });
    const next = await get("event=UserPromptSubmit&project=billing-api&session=s1");
    assert.match(next.systemMessage!, /📻 billing-s1 · 1 new — alice \(DM\): can you hold the deploy\?/);
    await w.ok("alice", "post", { to: "bob", message: "thanks" });
    const quiet = await get("event=UserPromptSubmit&project=billing-api&session=s1&show=0");
    assert.equal(quiet.systemMessage, undefined);
  });
});

describe("dead agents", () => {
  const start = async (w: World, sid: string) =>
    ((await (await w.request(`/api/hook?event=SessionStart&project=billing-api&session=${sid}&client=codex`, { as: "bob" })).json()) as {
      hookSpecificOutput: { additionalContext: string };
    }).hookSpecificOutput.additionalContext.match(/address is bob\/([\w-]+)/)![1];

  test("an ended agent's DMs go to the next session with its name, and senders are told", async () => {
    const w = await standardWorld();
    await start(w, "c1");
    await w.ok("bob", "set_name", { name: "alder" }, { id: "c1", project: "billing-api" });
    await w.request("/api/hook?event=SessionEnd&session=c1", { as: "bob" });
    const sent = await w.ok("alice", "post", { to: "bob/alder", message: "while you were out" });
    assert.match(sent, /no bob\/alder session is connected right now/);
    const ctx = ((await (await w.request("/api/hook?event=SessionStart&project=billing-api&session=c2&client=codex", { as: "bob" })).json()) as {
      hookSpecificOutput: { additionalContext: string };
    }).hookSpecificOutput.additionalContext;
    assert.match(ctx, /address is bob\/alder\b/);
    assert.match(ctx, /while you were out/);
  });

  test("a killed agent (no SessionEnd) frees its name once it has been quiet for a while", async () => {
    const w = await standardWorld();
    await start(w, "k1");
    await w.ok("bob", "set_name", { name: "birch" }, { id: "k1", project: "billing-api" });
    assert.match(await start(w, "k2"), /^billing-/); // birch still counts as running
    await w.db.prepare("UPDATE sessions SET last_seen = ? WHERE session_id = 'k1'").bind(Date.now() - 11 * 60_000).run();
    assert.equal(await start(w, "k3"), "birch");
  });

  test("the composer's recipients list connected agents only", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=r1&name=core", { as: "bob" });
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=r2&name=shop", { as: "bob" });
    await w.db.prepare("UPDATE sessions SET last_seen = ? WHERE session_id = 'r2'").bind(Date.now() - 11 * 60_000).run();
    const to = (await (await w.request("/dashboard", { as: "bob", cookie: true })).text()).match(/<select name="to"[\s\S]*?<\/select>/)![0];
    assert.match(to, /value="bob\/core"/);
    assert.doesNotMatch(to, /bob\/shop|not connected/);
  });
});

describe("managing your agents from the dashboard", () => {
  test("a message from you is YOUR USER; a busy agent continues with it at Stop; its reply reaches only you", async () => {
    const w = await standardWorld();
    const alder = { id: "codex-m", project: "billing-api" };
    const lox = { id: "claude-m", project: "billing-api" };
    await w.ok("bob", "inbox", {}, alder);
    await w.ok("bob", "inbox", {}, lox);
    await w.ok("bob", "set_name", { name: "alder" }, alder);
    await w.ok("bob", "set_name", { name: "loxodon" }, lox);
    // Bob types in the dashboard (no session): to one agent.
    await w.ok("bob", "post", { to: "bob/alder", message: "Switch to the WebP fixes first." });
    const stop = async (sid: string) => {
      const t = await (await w.request(`/api/hook?event=Stop&project=billing-api&session=${sid}`, { as: "bob" })).text();
      return t ? JSON.parse(t) : null;
    };
    const cont = await stop("codex-m");
    assert.equal(cont.decision, "block");
    assert.match(cont.reason, /Switch to the WebP fixes first\./);
    assert.equal(await stop("codex-m"), null); // handed over once
    assert.equal(await stop("claude-m"), null); // not for loxodon
    // alder answers its user; loxodon (another of bob's agents) doesn't get that reply.
    await w.ok("bob", "post", { to: "bob", message: "On it: WebP first." }, alder);
    assert.equal(await w.ok("bob", "inbox", {}, lox), "No unread messages.");
    // In an agent's view, your own dashboard messages are marked as yours.
    await w.ok("bob", "post", { channel: "billing", message: "Freeze after 18:00." });
    assert.match(await w.ok("bob", "inbox", {}, lox), /bob \(YOUR USER, from the dashboard\).*Freeze after 18:00/);
  });

  test("hooks report what a session is doing", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=st1", { as: "bob" });
    const state = async () => (await w.db.prepare("SELECT state, state_detail FROM sessions WHERE session_id = 'st1'").first<{ state: string; state_detail: string }>())!;
    await w.request("/api/hook?event=UserPromptSubmit&project=billing-api&session=st1", { as: "bob" });
    assert.equal((await state()).state, "working");
    await w.request("/api/hook?event=Notification&session=st1&detail=Claude%20needs%20your%20permission%20to%20use%20Bash", { as: "bob" });
    const waiting = await state();
    assert.equal(waiting.state, "waiting");
    assert.equal(waiting.state_detail, "Claude needs your permission to use Bash");
    await w.request("/api/hook?event=Notification&session=st1&kind=idle_prompt", { as: "bob" });
    assert.equal((await state()).state, "idle");
  });
});

describe("approvals from the browser", () => {
  test("only while away; the hook gets the dashboard's answer, or a deny when nobody answers", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=ap1&client=codex", { as: "bob" });
    const ask = (tool_input: object) =>
      w.request("/api/approval?session=ap1&client=codex", { method: "POST", as: "bob", body: JSON.stringify({ tool_name: "Bash", tool_input }) });
    assert.equal((await ask({ command: "npm run migrate" })).status, 204); // at the desk: the terminal asks
    assert.match(await w.ok("bob", "away", { on: true, wait_minutes: 20 }), /Away mode on/);
    const { id } = (await (await ask({ command: "npm run migrate" })).json()) as { id: number };
    const poll = async () => (await (await w.request(`/api/approval/${id}`, { as: "bob" })).json()) as { status: string; output?: string };
    assert.equal((await poll()).status, "pending");
    const dash = await (await w.request("/dashboard?view=agents", { as: "bob", cookie: true })).text();
    assert.match(dash, /Bash: npm run migrate/);
    const res = await w.form(`/approval/${id}`, "bob", { decision: "allow", note: "staging only" });
    assert.match(new URL(res.headers.get("location")!, ORIGIN).searchParams.get("ok")!, /Allowed/);
    const done = await poll();
    const out = JSON.parse(done.output!);
    assert.equal(out.hookSpecificOutput.decision.behavior, "allow");
    assert.match(out.additionalContext, /staging only/);
    // Someone else can't answer bob's approvals.
    const { id: id2 } = (await (await ask({ command: "terraform apply" })).json()) as { id: number };
    const other = new URL((await w.form(`/approval/${id2}`, "alice", { decision: "allow" })).headers.get("location")!, ORIGIN);
    assert.match(other.searchParams.get("err")!, /already answered or has expired/);
    // Unanswered past the wait: a deny that tells the agent to move on.
    await w.db.prepare("UPDATE approvals SET expires_at = ? WHERE id = ?").bind(Date.now() - 1, id2).run();
    const expired = JSON.parse((await (await w.request(`/api/approval/${id2}`, { as: "bob" })).json() as { output: string }).output);
    assert.equal(expired.hookSpecificOutput.decision.behavior, "deny");
    assert.match(expired.hookSpecificOutput.decision.message, /didn't answer/);
  });
});

describe("message rendering", () => {
  test("Markdown agents write, ANSI colours, and nothing unsafe", async () => {
    const { md } = await import("../src/markdown.ts");
    const html = md(
      [
        "## Results",
        "**bold** and *italic* and ~~gone~~, `code`",
        "",
        "| step | p50 |",
        "|:-----|----:|",
        "| cold | 1.08s |",
        "",
        "- [x] lazy codecs",
        "- [ ] autoloader",
        "1. first",
        "2. second",
        "",
        "> quoted",
        "",
        "```bash",
        "npm test",
        "```",
        "\u001b[32mPASS\u001b[0m 48 tests",
        "<script>alert(1)</script> [x](javascript:alert(2)) https://example.com/a?b=1",
      ].join("\n"),
    );
    assert.match(html, /<div class="mdh mdh2">Results<\/div>/);
    assert.match(html, /<b>bold<\/b> and <i>italic<\/i> and <s>gone<\/s>, <code>code<\/code>/);
    assert.match(html, /<th style="text-align:left">step<\/th>|<th>step<\/th>/);
    assert.match(html, /<td style="text-align:right">1\.08s<\/td>/);
    assert.match(html, /class="mdbox on">✓<\/span>lazy codecs/);
    assert.match(html, /<ol><li[^>]*>first<\/li>/);
    assert.match(html, /<blockquote><p>quoted<\/p><\/blockquote>/);
    assert.match(html, /<pre class="mdpre" data-lang="bash"><code>npm test<\/code><\/pre>/);
    assert.match(html, /<span class="a-green">PASS<\/span> 48 tests/);
    assert.doesNotMatch(html, /<script>|href="javascript:/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /<a href="https:\/\/example\.com\/a\?b=1"/);
  });
});

describe("machines", () => {
  test("a session shows the machine it runs on", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=h1&client=codex&host=Edvins-MBP.local", { as: "bob" });
    assert.match(await w.ok("alice", "team"), /bob\/billing-h1 \[Codex on Edvins-MBP\]/);
    const page = await (await w.request("/dashboard?view=agents", { as: "bob", cookie: true })).text();
    assert.match(page, /Edvins-MBP/);
  });
});

describe("renaming from the web", () => {
  test("rename an agent and nickname a machine from the dashboard; set_name can rename another session", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=rn1&client=codex&host=edvins-mbp", { as: "bob" });
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=rn2&client=claude", { as: "bob" });
    const res = await w.form("/agent/rename", "bob", { session: "rn1", name: "Alder", role: "perf work", remember: "on" });
    const loc = new URL(res.headers.get("location")!, ORIGIN);
    assert.equal(loc.searchParams.get("agent"), "bob/alder");
    await w.form("/host/rename", "bob", { host: "edvins-mbp", name: "work mac" });
    const page = await (await w.request("/dashboard?view=agents&agent=bob/alder", { as: "bob", cookie: true })).text();
    assert.match(page, /work mac/);
    assert.match(page, /perf work/);
    // Another person can't rename bob's sessions.
    const other = new URL((await w.form("/agent/rename", "alice", { session: "rn1", name: "evil" })).headers.get("location")!, ORIGIN);
    assert.match(other.searchParams.get("err")!, /No such session/);
    // From an agent: rename a sibling session by its current name.
    assert.match(await w.ok("bob", "set_name", { name: "birch", agent: "billing-rn2" }, { id: "rn1", project: "billing-api" }), /That session is now bob\/birch/);
  });
});

describe("activity mirroring", () => {
  test("stored for your own sessions, shown only to you, capped", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=mir1&client=claude", { as: "bob" });
    await w.ok("bob", "set_name", { name: "alder" }, { id: "mir1", project: "billing-api" });
    const send = (as: string, items: object[]) =>
      w.request("/api/activity?session=mir1", { method: "POST", as, body: JSON.stringify({ items }) }).then((r) => r.json() as Promise<{ stored: number }>);
    assert.equal((await send("bob", [{ kind: "cmd", text: "npm test" }, { kind: "edit", text: "edit src/app.ts" }, { kind: "bogus", text: "x" }])).stored, 2);
    // Someone else can't write into bob's session.
    assert.equal((await send("alice", [{ kind: "cmd", text: "rm -rf /" }])).stored, 0);
    const mine = await (await w.request("/dashboard?view=agents&agent=bob/alder", { as: "bob", cookie: true })).text();
    assert.match(mine, /npm test/);
    assert.match(mine, /edit src\/app\.ts/);
    // alice shares #billing with bob and sees his agent, but never its activity.
    const theirs = await (await w.request("/dashboard?view=agents&agent=bob/alder", { as: "alice", cookie: true })).text();
    assert.match(theirs, /bob\/alder/);
    assert.doesNotMatch(theirs, /npm test|edit src\/app\.ts/);
    // Only the newest 300 are kept.
    for (let i = 0; i < 4; i++) await send("bob", Array.from({ length: 100 }, (_, j) => ({ kind: "cmd", text: `step ${i}-${j}` })));
    const n = await w.db.prepare("SELECT COUNT(*) AS n FROM activity WHERE session_id = 'mir1'").first<{ n: number }>();
    assert.equal(n!.n, 300);
  });
});

describe("plugin versions", () => {
  test("the plugin manifest, local server, hook and hub agree on the version", async () => {
    const { readFileSync } = await import("node:fs");
    const { PLUGIN_VERSION } = await import("../src/version.ts");
    const manifest = JSON.parse(readFileSync(new URL("../plugins/intercom/.claude-plugin/plugin.json", import.meta.url), "utf8")).version;
    const market = JSON.parse(readFileSync(new URL("../.claude-plugin/marketplace.json", import.meta.url), "utf8")).plugins.find((p: { name: string }) => p.name === "intercom").version;
    const mjs = readFileSync(new URL("../plugins/intercom/intercom-channel.mjs", import.meta.url), "utf8").match(/const VERSION = "([\d.]+)"/)![1];
    const hook = readFileSync(new URL("../plugins/intercom/hook.sh", import.meta.url), "utf8").match(/^VERSION=([\d.]+)/m)![1];
    assert.deepEqual([manifest, market, mjs, hook], [PLUGIN_VERSION, PLUGIN_VERSION, PLUGIN_VERSION, PLUGIN_VERSION]);
  });

  test("outdated sessions are told at start; auto-update says what it's doing", async () => {
    const { outdated, PLUGIN_VERSION } = await import("../src/version.ts");
    assert.equal(outdated("0.9.10"), true);
    assert.equal(outdated(PLUGIN_VERSION), false);
    assert.equal(outdated("99.0.0"), false);
    const w = await standardWorld();
    const msg = async (q: string) => ((await (await w.request(`/api/hook?event=SessionStart&project=billing-api&session=v1&${q}`, { as: "bob" })).json()) as { systemMessage: string }).systemMessage;
    assert.match(await msg("version=0.1.0"), /updating intercom to .* in the background/);
    assert.match(await msg("version=0.1.0&autoupdate=0"), /is available .* \/intercom:update/);
    assert.match(await msg(`version=0.1.0&updated=${PLUGIN_VERSION}`), /is installed; restart this session/);
    assert.doesNotMatch(await msg(`version=${PLUGIN_VERSION}`), /⬆/);
  });

  test("open dashboards can tell a new version is out: the page's build stamp matches /api/build", async () => {
    const w = await standardWorld();
    const page = await (await w.request("/dashboard", { as: "bob", cookie: true })).text();
    const stamp = page.match(/<meta name="ic-build" content="([a-z0-9]+)">/)![1];
    assert.equal(((await (await w.request("/api/build")).json()) as { build: string }).build, stamp);
  });

  test("the dashboard's update line names the outdated sessions until dismissed for this version", async () => {
    const { PLUGIN_VERSION } = await import("../src/version.ts");
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=u1&name=core&version=0.1.0", { as: "bob" });
    const page = async (extra = "") =>
      (await w.request("/dashboard?view=agents", { headers: { cookie: `intercom_token=${w.tokens.bob}${extra}` } })).text();
    assert.match(await page(), /id="updatebar"[^>]*title="Outdated: core\.[^"]*"[\s\S]*1 session on an older version[\s\S]*data-dismiss="ic_upd=/);
    assert.doesNotMatch(await page(`; ic_upd=${PLUGIN_VERSION}`), /id="updatebar"/);
    assert.match(await page("; ic_upd=0.0.1"), /id="updatebar"/); // an older dismissal doesn't hide a newer version
  });
});

describe("locks per project", () => {
  test("a session sees its own project's locks; others only as a count", async () => {
    const w = await standardWorld();
    await w.ok("alice", "invite", { project: "shop", name: "bob" });
    await w.ok("carol", "claim", { resource: "deploy:shop:prod", reason: "shop release" });
    await w.ok("alice", "claim", { resource: "deploy:billing:prod" });
    const ctx = ((await (await w.request("/api/hook?event=SessionStart&project=billing-api&session=lp1", { as: "bob" })).json()) as {
      hookSpecificOutput: { additionalContext: string };
    }).hookSpecificOutput.additionalContext;
    assert.match(ctx, /Locks on #billing:\n.*deploy:billing:prod held by alice/);
    assert.doesNotMatch(ctx, /🔒 deploy:shop:prod/); // only the #shop feed line mentions it, not the lock list
    assert.match(ctx, /1 more in your other projects/);
  });
});

describe("delivery marks", () => {
  test("agent-to-agent DMs show in the agent's thread with ✓ / ⏳ / ⚠; teammates see only delivered or not", async () => {
    const w = await standardWorld();
    const hook = (event: string, sid: string, as = "bob", extra = "") => w.request(`/api/hook?event=${event}&project=billing-api&session=${sid}${extra}`, { as });
    await hook("SessionStart", "d1", "bob", "&client=codex&name=alder");
    await hook("SessionStart", "d2", "bob", "&name=core");
    await w.ok("bob", "post", { to: "bob/alder", message: "handoff: abc123, gates green" }, { id: "d2", project: "billing-api" });
    await w.ok("bob", "post", { to: "bob/ghost", message: "anyone?" }, { id: "d2", project: "billing-api" });
    await w.ok("alice", "post", { to: "bob/alder", message: "please hold the deploy" });
    const view = async (as: string, path: string) => (await w.request(path, { as, cookie: true })).text();

    let page = await view("bob", "/dashboard?view=agents&agent=bob/alder");
    assert.match(page, /class="bubble md relay"[^>]*><span class="rhd"><span class="an"[^>]*>bob\/core<\/span> → <span class="an"[^>]*>bob\/alder<\/span><\/span>/);
    assert.match(page, /bob\/core<\/span> → <span class="an"[^>]*>bob\/alder[\s\S]*?class="dlv wait"/);
    assert.match(page, /alice → <span class="an"[^>]*>bob\/alder/);
    assert.match(await view("bob", "/dashboard?view=agents&agent=bob/core"), /bob\/core<\/span> → <span class="an"[^>]*>bob\/ghost[\s\S]*?⚠ not connected/);
    const DM = /→ <span class="an"[^>]*>bob\/alder<\/span><\/span><span class="meta"><time[^>]*>[^<]*<\/time>(<span class="dlv[^"]*"[^>]*>[^<]*<\/span>)/;
    assert.match((await view("alice", "/dashboard")).match(DM)![1]!, /dlv wait/);

    // alder's next turn takes both messages into its context.
    await hook("UserPromptSubmit", "d1");
    page = await view("bob", "/dashboard?view=agents&agent=bob/alder");
    assert.match(page, /handoff: abc123[\s\S]*?class="dlv ok" title="Delivered to alder[^"]*">✓ alder/);
    const alice = await view("alice", "/dashboard");
    assert.equal(alice.match(DM)![1], '<span class="dlv ok" title="Delivered to an agent">✓</span>');
    assert.doesNotMatch(alice, /✓ alder/);
    // alice doesn't see bob's agents talking to each other.
    assert.doesNotMatch(await view("alice", "/dashboard?view=agents&agent=bob/alder"), /handoff: abc123/);
  });
});

describe("decision log and handoffs", () => {
  test("handoff → integrated notifies the author, lands in the log, and shows at session start; others' projects stay private", async () => {
    const w = await standardWorld();
    const hook = async (event: string, sid: string, extra = "") => {
      const t = await (await w.request(`/api/hook?event=${event}&project=billing-api&session=${sid}${extra}`, { as: "bob" })).text();
      return t.startsWith("{") ? ((JSON.parse(t) as { hookSpecificOutput?: { additionalContext?: string } }).hookSpecificOutput?.additionalContext ?? t) : t;
    };
    await hook("SessionStart", "h1", "&client=codex&name=alder");
    await hook("SessionStart", "h2", "&name=core");
    const alder = { id: "h1", project: "billing-api" };
    const core = { id: "h2", project: "billing-api" };
    await w.ok("bob", "set_name", { name: "alder", role: "works in isolated worktrees, hands over commits", remember: true }, alder);

    assert.match(
      await w.ok("bob", "handoff", { ref: "5df5034 on /tmp/alder-3", summary: "cache builtin descriptors", evidence: "bench/out.json", gates: "unit, corpus-lite: green", to: "bob/core" }, alder),
      /Recorded handoff H1 and sent it to bob\/core/,
    );
    // core gets it in context, with the id to settle it.
    assert.match(await hook("UserPromptSubmit", "h2"), /handed off H1: 5df5034 on \/tmp\/alder-3 — cache builtin descriptors[\s\S]*evidence: bench\/out\.json/);
    assert.match(await w.ok("alice", "handoffs", { channel: "billing" }), /H1 PENDING · 5df5034/);

    const settled = await w.ok("bob", "update_handoff", { id: 1, status: "integrated", result: "a91c2e0", note: "cherry-picked with -x" }, core);
    assert.match(settled, /H1 \[#billing\] INTEGRATED as a91c2e0/);
    assert.match(settled, /Logged D1/);
    assert.match(await hook("UserPromptSubmit", "h1"), /Your handoff H1 \(5df5034 on \/tmp\/alder-3\) is now integrated as a91c2e0: cherry-picked with -x/);

    await w.ok("bob", "decide", { subject: "FnCell 1cb2e05", verdict: "rejected", reason: "+34.9% CPU", refs: "1cb2e05" }, core);
    assert.match(await w.ok("alice", "decisions", { query: "1cb2e05" }), /D2 \[#billing\] REJECTED · FnCell 1cb2e05 — \+34\.9% CPU · refs 1cb2e05 · bob\/core/);
    assert.match(await w.ok("alice", "decisions", { query: "a91c2e0" }), /D1 .*APPROVED · H1 5df5034/);
    // Replacing a decision hides the old one unless asked.
    await w.ok("bob", "decide", { subject: "FnCell 1cb2e05", verdict: "approved", reason: "CPU fixed in 2f00aa1", supersedes: 2 }, core);
    assert.doesNotMatch(await w.ok("alice", "decisions", { channel: "billing" }), /D2 /);
    assert.match(await w.ok("alice", "decisions", { channel: "billing", include_superseded: true }), /D2 .*superseded by D3/);

    // carol isn't in #billing.
    assert.match(await w.ok("carol", "decisions", {}), /No decisions/);
    assert.match((await w.tool("carol", "update_handoff", { id: 1, status: "rejected" })).text, /No handoff H1/);

    // A new session sees the crew's roles and the latest decisions.
    const ctx = await hook("SessionStart", "h3");
    assert.match(ctx, /Crew roles in #billing:\n- bob\/alder \(Codex\): works in isolated worktrees/);
    assert.match(ctx, /Latest decisions in #billing[^\n]*\n.*D3 APPROVED · FnCell 1cb2e05/);
    assert.match(await w.ok("alice", "projects"), /crew roles:\n\s+- bob\/alder \(Codex\)/);

    const page = await (await w.request("/dashboard?channel=billing&q=1cb2e05", { as: "alice", cookie: true })).text();
    assert.match(page, /id="handoffs"[\s\S]*5df5034 on \/tmp\/alder-3[\s\S]*integrated as a91c2e0/);
    assert.match(page, /id="decisionlog"[\s\S]*FnCell 1cb2e05/);
  });
});

describe("choosing an agent's project from the dashboard", () => {
  test("pin for one session, follow the repo again, or link the repo; only your own sessions", async () => {
    const w = await standardWorld();
    const hook = async (as: string, event: string, sid: string, repo: string) => {
      const t = await (await w.request(`/api/hook?event=${event}&project=${repo}&session=${sid}`, { as })).text();
      return t.startsWith("{") ? ((JSON.parse(t) as { hookSpecificOutput?: { additionalContext?: string }; decision?: string; reason?: string }).hookSpecificOutput?.additionalContext ?? t) : t;
    };
    await hook("bob", "SessionStart", "p1", "scratch-tool");
    await hook("bob", "SessionStart", "p2", "scratch-tool");
    const move = async (as: string, fields: Record<string, string>) => new URL((await w.form("/agent/project", as, { back: "/dashboard?view=agents", ...fields })).headers.get("location")!, ORIGIN).searchParams;

    assert.match((await move("bob", { session: "p1", project: "billing", scope: "session" })).get("ok")!, /moved to #billing \(this session only\)/);
    const told = await hook("bob", "UserPromptSubmit", "p1", "scratch-tool");
    assert.match(told, /YOUR USER, a dashboard notice; no reply needed\) → bob\/session-p1[^:]*: • moved this session to #billing\. From now on you work in #billing: follow its rules:\nProd deploys only Tue\/Thu/);
    // The pin beats the repo, for this session only; a notice doesn't keep the agent going like a dashboard prompt does.
    assert.match(await hook("bob", "SessionStart", "p1", "scratch-tool"), /Current project: #billing/);
    assert.doesNotMatch(await hook("bob", "SessionStart", "p2", "scratch-tool"), /Current project/);
    assert.doesNotMatch(await hook("bob", "Stop", "p1", "scratch-tool"), /"decision":"block"/);
    assert.match(await (await w.request("/dashboard?view=agents&agent=bob/session-p1", { as: "bob", cookie: true })).text(), /#billing <span class="badge"[^>]*>pinned/);

    assert.match((await move("bob", { session: "p1", project: "" })).get("ok")!, /follows its repo again/);
    assert.doesNotMatch(await hook("bob", "SessionStart", "p1", "scratch-tool"), /Current project/);

    // Always for the repo: future sessions there join too.
    assert.match((await move("bob", { session: "p2", project: "billing", scope: "repo" })).get("ok")!, /scratch-tool now belongs to #billing/);
    assert.match(await hook("bob", "SessionStart", "p3", "scratch-tool"), /Current project: #billing/);

    // A repo that belongs to another project isn't taken over; someone else's session can't be moved.
    await w.ok("alice", "configure_project", { name: "ops" });
    await hook("alice", "SessionStart", "a1", "billing-api");
    assert.match((await move("alice", { session: "a1", project: "ops", scope: "repo" })).get("err")!, /billing-api already belongs to #billing/);
    assert.match((await move("alice", { session: "p1", project: "ops" })).get("err")!, /No such session/);
    assert.match((await move("bob", { session: "p1", project: "ops" })).get("err")!, /not a member of a project named #ops/);
  });
});

describe("activity mirror", () => {
  test("a dashboard message handed to the agent as a prompt isn't shown twice", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=e1&name=video", { as: "bob" });
    const msg = "Andreas noted that the brand selector looks noisy. What does Gravity offer us here?";
    await w.form("/action/post", "bob", { to: "bob/video", message: msg, back: "/dashboard?view=agents" });
    const post = (items: unknown[]) =>
      w.request("/api/activity?session=e1", { as: "bob", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
    await post([
      { at: Date.now(), kind: "prompt", text: `The intercom-ui plugin sent a message: ${msg.slice(0, 60)}…` },
      { at: Date.now(), kind: "prompt", text: "yes, go ahead with the favicon variant" },
      { at: Date.now(), kind: "cmd", text: "grep -rl brand web/src" },
      // Short ones too, by the mod's wrapper.
      { at: Date.now(), kind: "prompt", text: 'The intercom-ui plugin sent a message:\nShip it\n\n(Sent by you from the intercom dashboard. Reply there with the intercom post tool, to: "bob".)' },
    ]);
    const page = await (await w.request("/dashboard?view=agents&agent=bob/video", { as: "bob", cookie: true })).text();
    assert.equal(page.split("Andreas noted that").length - 1, 1);
    assert.match(page, /class="bubble md mine"[^>]*><p>Andreas noted that/);
    assert.match(page, /typed in the terminal:<\/span> yes, go ahead/);
    assert.match(page, /grep -rl brand web\/src/);
    assert.doesNotMatch(page, /Ship it/);
  });
});

describe("folded tool steps", () => {
  test("consecutive tool steps fold into one line; text and single steps stay as they are", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=f1&name=folder", { as: "bob" });
    const t = Date.now();
    await w.request("/api/activity?session=f1", {
      as: "bob",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [
          { at: t, kind: "cmd", text: "npm test" },
          { at: t + 1, kind: "cmd", text: "git status" },
          { at: t + 2, kind: "read", text: "src/app.ts" },
          { at: t + 3, kind: "tool", text: "ToolSearch" },
          { at: t + 4, kind: "text", text: "All green; now the docs." },
          { at: t + 5, kind: "edit", text: "src/web.ts" },
          { at: t + 6, kind: "text", text: "Deploying now." },
          { at: t + 7, kind: "cmd", text: "Deploy, commit, wait until live\nnpx wrangler deploy && git push" },
        ],
      }),
    });
    const page = await (await w.request("/dashboard?view=agents&agent=bob/folder", { as: "bob", cookie: true })).text();
    assert.match(page, /<details class="actgroup" data-gid="g\d+"><summary>.*Ran 2 commands, read 1 file, 1 tool call<span class="alast"> · ToolSearch/);
    assert.match(page, /<\/details><div class="act act-text"[^>]*>.*All green/);
    assert.match(page, /All green[\s\S]*<div class="act act-edit"/); // one step alone isn't folded
    assert.match(page, /<span class="adesc">Deploy, commit, wait until live<\/span><span class="acmd">npx wrangler deploy &amp;&amp; git push<\/span>/);
  });
});

describe("per-session delivery", () => {
  test("a session gets its own project's posts and its DMs, not other projects' chatter", async () => {
    const w = await standardWorld();
    await w.ok("alice", "invite", { project: "shop", name: "bob" });
    const hook = async (event: string, sid: string, repo: string) => {
      const t = await (await w.request(`/api/hook?event=${event}&project=${repo}&session=${sid}`, { as: "bob" })).text();
      return t.startsWith("{") ? ((JSON.parse(t) as { hookSpecificOutput?: { additionalContext?: string } }).hookSpecificOutput?.additionalContext ?? t) : t;
    };
    await hook("SessionStart", "s-bill", "billing-api");
    await hook("SessionStart", "s-shop", "shop");
    await w.ok("alice", "post", { channel: "billing", message: "billing migration starts at 14:00" });
    await w.ok("carol", "post", { channel: "shop", message: "shop freeze until Friday" });
    await w.ok("carol", "claim", { resource: "deploy:shop:prod" });
    await w.ok("alice", "post", { to: "bob", message: "lunch?" });

    const bill = await hook("UserPromptSubmit", "s-bill", "billing-api");
    assert.match(bill, /billing migration starts/);
    assert.match(bill, /lunch\?/);
    assert.doesNotMatch(bill, /shop freeze|deploy:shop:prod/);
    const shop = await hook("UserPromptSubmit", "s-shop", "shop");
    assert.match(shop, /shop freeze until Friday/);
    assert.match(shop, /claimed lock deploy:shop:prod/);
    assert.doesNotMatch(shop, /billing migration/);
    // The dashboard (the person) still sees everything.
    const feed = await (await w.request("/dashboard", { as: "bob", cookie: true })).text();
    assert.match(feed, /billing migration starts/);
    assert.match(feed, /shop freeze until Friday/);
  });
});

describe("status line", () => {
  test("per session: its name, unread, and only its project's locks", async () => {
    const w = await standardWorld();
    await w.ok("alice", "invite", { project: "shop", name: "bob" });
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=sl1&name=alder", { as: "bob" });
    await w.ok("alice", "claim", { resource: "deploy:billing:prod" });
    await w.ok("carol", "claim", { resource: "deploy:shop:prod" });
    const line = await (await w.request("/api/statusline?session=sl1&project=billing-api", { as: "bob" })).text();
    assert.match(line, /^📻 bob\/alder · #billing · \d+ unread · 🔒 deploy:billing:prod \(alice\)$/);
  });
});

describe("locks between one person's agents", () => {
  test("a sibling agent's lock is not 'yours': named in full, not renewable, not releasable without force, and guarded", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=la&name=alder", { as: "bob" });
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=lb&name=browser", { as: "bob" });
    const alder = { id: "la", project: "billing-api" };
    const browser = { id: "lb", project: "billing-api" };
    await w.ok("bob", "claim", { resource: "benchmark:billing:local", reason: "timings" }, alder);

    assert.match(await w.ok("bob", "locks", {}, alder), /held by this session \(bob\/alder\)/);
    const seen = await w.ok("bob", "locks", {}, browser);
    assert.match(seen, /held by bob\/alder, another of your user's sessions, NOT this one/);
    assert.doesNotMatch(seen, /held by you/);
    assert.match(await w.ok("alice", "locks"), /held by bob\/alder/);

    assert.match((await w.tool("bob", "claim", { resource: "benchmark:billing:local" }, browser)).text, /NOT claimed\. .*held by bob\/alder, another of your user's sessions/);
    assert.match((await w.tool("bob", "release", { resource: "benchmark:billing:local" }, browser)).text, /held by bob\/alder, another of your user's sessions.*force=true/);
    assert.match(await w.ok("bob", "claim", { resource: "benchmark:billing:local" }, alder), /^Extended/);

    // The guard treats a sibling's deploy lock like anyone else's, and stays quiet for the holder.
    await w.ok("bob", "claim", { resource: "deploy:billing:prod" }, alder);
    const guard = (sid: string) =>
      w.request("/api/guard?project=billing-api", { as: "bob", method: "POST", body: JSON.stringify({ session_id: sid, tool_input: { command: "helm upgrade billing chart -f values-prod.yaml" } }) }).then((r) => r.text());
    assert.match(await guard("lb"), /"permissionDecision":"ask".*deploy:billing:prod is held by bob\/alder, another of your user's sessions, NOT this one/);
    assert.doesNotMatch(await guard("la"), /permissionDecision/);
    await w.ok("bob", "release", { resource: "deploy:billing:prod" }, alder);

    // Status line and mod snapshot: only the holder session says "you hold".
    const line = (sid: string) => w.request(`/api/statusline?session=${sid}&project=billing-api`, { as: "bob" }).then((r) => r.text());
    assert.match(await line("la"), /🔐 you hold benchmark:billing:local/);
    assert.match(await line("lb"), /🔒 benchmark:billing:local \(bob\/alder\)/);

    // From the dashboard bob (the person) can still release his agent's lock without breaking it.
    const res = await w.form("/action/release", "bob", { resource: "benchmark:billing:local", back: "/dashboard" });
    assert.doesNotMatch(new URL(res.headers.get("location")!, ORIGIN).search, /err=/);
    assert.match(await w.ok("alice", "locks"), /No active locks/);
  });
});

describe("loops", () => {
  test("an agent's loops show for its owner, start/stop lines land in activity, stale ones drop off", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=lp&name=looper", { as: "bob" });
    const post = (items: unknown[]) =>
      w.request("/api/activity?session=lp", { as: "bob", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
    const ev = (o: object, at = Date.now()) => ({ at, kind: "loop", text: JSON.stringify(o) });
    await post([ev({ op: "cron", id: "job7", cron: "*/20 * * * *", prompt: "/babysit-prs", recurring: true })]);
    await post([ev({ op: "wakeup", delay: 1200, prompt: "check the deploy" }), ev({ op: "wakeup", delay: 1200, prompt: "check the deploy" })]);
    const view = (as: string) => w.request("/dashboard?view=agents&agent=bob/looper", { as, cookie: true }).then((r) => r.text());

    let page = await view("bob");
    assert.match(page, /🔁 loop every 20m: \/babysit-prs/);
    assert.match(page, /🔁 self-paced loop, next in 20m: check the deploy/);
    assert.match(page, /<span title="running a loop">🔁<\/span>/); // marked in the tree
    assert.match(page, /data-chip="Stop your loop\."/);
    assert.equal((page.match(/started a self-paced loop: check the deploy/g) ?? []).length, 1); // re-arming isn't news
    assert.doesNotMatch(await view("alice"), /babysit-prs/); // only the owner

    await post([ev({ op: "cron_delete", id: "job7" }), ev({ op: "wakeup_stop" })]);
    page = await view("bob");
    assert.doesNotMatch(page, /🔁 loop every 20m/);
    assert.match(page, /stopped loop every 20m: \/babysit-prs/);
    assert.match(page, /stopped its self-paced loop/);
    assert.doesNotMatch(page, /data-chip="Stop your loop\."/);
  });

  test("describing schedules, and a self-paced loop that stopped re-arming expires", async () => {
    const { describeCron, activeLoops } = await import("../src/loops.ts");
    assert.equal(describeCron("*/5 * * * *"), "every 5m");
    assert.equal(describeCron("7 * * * *"), "hourly at :07");
    assert.equal(describeCron("57 8 * * 1-5"), "weekdays at 08:57");
    assert.equal(describeCron("3 9 * * *"), "daily at 09:03");
    const now = Date.now();
    assert.equal(activeLoops([{ kind: "wakeup", id: "wakeup", prompt: "x", next: now - 20 * 60_000, at: now - 40 * 60_000 }], now).length, 0);
    assert.equal(activeLoops([{ kind: "cron", id: "a", prompt: "x", cron: "*/5 * * * *", recurring: true, at: now - 8 * 86400_000 }], now).length, 0);
  });
});

describe("agent identity", () => {
  test("initials and hue are stable by full address", async () => {
    const { initials, agentHue } = await import("../src/ui.ts");
    assert.equal(initials("loxodon-core"), "LC");
    assert.equal(initials("alder"), "AL");
    assert.equal(initials("billing-core-336f"), "BC");
    assert.equal(initials("session-b5d3"), "SE");
    assert.equal(agentHue("edvin", "alder"), agentHue("edvin", "alder"));
    assert.notEqual(agentHue("edvin", "alder"), agentHue("anna", "alder"));
  });
});

describe("images with messages", () => {
  test("text and images in one message: stored, named for agents, viewable by those who can read the message", async () => {
    const w = await standardWorld();
    const hook = async (event: string, sid: string) => {
      const t = await (await w.request(`/api/hook?event=${event}&project=billing-api&session=${sid}`, { as: "bob" })).text();
      return t.startsWith("{") ? ((JSON.parse(t) as { hookSpecificOutput?: { additionalContext?: string } }).hookSpecificOutput?.additionalContext ?? t) : t;
    };
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=im1&name=core", { as: "bob" });
    await hook("UserPromptSubmit", "im1");

    // alice pastes a screenshot into a DM to bob's agent, with text.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const form = new FormData();
    form.set("message", "The brand selector looks noisy, see:");
    form.set("to", "bob/core");
    form.set("back", "/dashboard");
    form.append("image", new File([png], "selector.png", { type: "image/png" }));
    const res = await w.request("/action/post", { method: "POST", as: "alice", cookie: true, headers: { origin: ORIGIN }, body: form, redirect: "manual" });
    assert.doesNotMatch(res.headers.get("location") ?? "", /err=/);

    // The agent gets text and the marker in one message, and can open the image.
    assert.match(await hook("UserPromptSubmit", "im1"), /The brand selector looks noisy, see:\n\[📎 image #1: selector\.png\]/);
    const r = (await (await w.request("/mcp", {
      method: "POST", as: "bob",
      headers: { "content-type": "application/json", "x-intercom-session": "im1", "x-intercom-project": "billing-api" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "attachment", arguments: { id: 1 } } }),
    })).json()) as { result: { content: { type: string; data?: string; mimeType?: string; text?: string }[] } };
    const img = r.result.content.find((c) => c.type === "image")!;
    assert.equal(img.mimeType, "image/png");
    assert.deepEqual([...Buffer.from(img.data!, "base64")], [...png]);

    // The dashboard shows a thumbnail; the image is served to the sender and recipient only.
    assert.match(await (await w.request("/dashboard", { as: "bob", cookie: true })).text(), /<a class="att" href="\/attachment\/1"[^>]*><img src="\/attachment\/1"/);
    assert.equal((await w.request("/attachment/1", { as: "alice", cookie: true })).status, 200);
    assert.equal((await w.request("/attachment/1", { as: "bob", cookie: true })).headers.get("content-type"), "image/png");
    assert.equal((await w.request("/attachment/1", { as: "carol", cookie: true })).status, 404);
    assert.match((await w.tool("carol", "attachment", { id: 1 })).text, /No image #1/);

    // Only images are accepted.
    const bad = new FormData();
    bad.set("message", "x"); bad.set("channel", "billing"); bad.set("back", "/dashboard");
    bad.append("image", new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));
    const r2 = await w.request("/action/post", { method: "POST", as: "alice", cookie: true, headers: { origin: ORIGIN }, body: bad, redirect: "manual" });
    assert.match(new URL(r2.headers.get("location")!, ORIGIN).searchParams.get("err")!, /x\.svg isn't an image/);
  });
});

describe("share_file", () => {
  test("an agent shares a file from its machine: it lands in its user's dashboard; images preview, other files only download", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=sf1&name=core", { as: "bob" });
    const s = { id: "sf1", project: "billing-api" };
    const b64 = (t: string) => Buffer.from(t).toString("base64");

    // Without the local server's file data (an old plugin), it says what to do.
    assert.match((await w.tool("bob", "share_file", { path: "/tmp/x.log" }, s)).text, /needs the intercom's local server/);

    // A log, to bob himself (the default): a DM to the dashboard with a file marker.
    const out = await w.ok("bob", "share_file", { path: "/work/build.log", message: "The failing build:", _file: { name: "build.log", mime: "text/plain", data: b64("step 3 failed\n") } }, s);
    assert.match(out, /Sent DM \[\d+\] to bob\. It carries \[📎 file #1: build\.log · 14 B\]/);
    const page = await (await w.request("/dashboard", { as: "bob", cookie: true })).text();
    assert.match(page, /<a class="attf" href="\/attachment\/1" download="build\.log"[^>]*>.*build\.log.*14 B/);
    const dl = await w.request("/attachment/1", { as: "bob", cookie: true });
    assert.equal(dl.headers.get("content-type"), "application/octet-stream");
    assert.match(dl.headers.get("content-disposition")!, /attachment; filename="build\.log"/);
    assert.equal(await dl.text(), "step 3 failed\n");
    // Agents read text files with the attachment tool; outsiders get nothing.
    assert.match(await w.ok("bob", "attachment", { id: 1 }, s), /File #1 \(build\.log, 14 B\)[\s\S]*step 3 failed/);
    assert.equal((await w.request("/attachment/1", { as: "alice", cookie: true })).status, 404);

    // An HTML file never renders on our origin; a screenshot previews like a pasted image.
    await w.ok("bob", "share_file", { path: "x.html", _file: { name: "x.html", mime: "text/html", data: b64("<script>alert(1)</script>") }, to: "alice" }, s);
    assert.equal((await w.request("/attachment/2", { as: "alice", cookie: true })).headers.get("content-type"), "application/octet-stream");
    await w.ok("bob", "share_file", { path: "shot.png", _file: { name: "shot.png", mime: "image/png", data: b64("png") }, channel: "billing" }, s);
    assert.match(await (await w.request("/dashboard?channel=billing", { as: "alice", cookie: true })).text(), /<a class="att" href="\/attachment\/3"/);
    assert.equal((await w.request("/attachment/3", { as: "alice", cookie: true })).headers.get("content-type"), "image/png");
    assert.match((await w.request("/attachment/3", { as: "alice", cookie: true })).headers.get("content-disposition")!, /inline; filename="shot\.png"/);
  });

  test("agent to agent: a file shared to another agent's address reaches it, and its local server fetches the bytes to save them", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=sf2&name=core", { as: "bob" });
    const s = { id: "sf2", project: "billing-api" };
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
    await w.ok("bob", "share_file", { path: "dist.zip", message: "The build:", _file: { name: "dist.zip", mime: "application/zip", data: zip.toString("base64") }, to: "alice/billing" }, s);
    assert.match((await w.tool("alice", "inbox", {})).text, /The build:[\s\S]*\[📎 file #1: dist\.zip · 6 B\]/);
    // Binary, so the attachment tool doesn't show it; save_attachment does (the local server fetches it with the agent's token).
    assert.match(await w.ok("alice", "attachment", { id: 1 }), /isn't text or an image/);
    assert.match((await w.tool("alice", "save_attachment", { id: 1, path: "/tmp/" })).text, /needs the intercom's local server/);
    const dl = await w.request("/attachment/1", { as: "alice" });
    assert.match(dl.headers.get("content-disposition")!, /filename="dist\.zip"/);
    assert.deepEqual(Buffer.from(await dl.arrayBuffer()), zip);
    assert.equal((await w.request("/attachment/1", { as: "carol" })).status, 404);
  });
});


describe("invite-only (the default)", () => {
  test("only admins invite; owners' old links stop working; admin links create accounts, with or without a project", async () => {
    const w = await standardWorld(); // alice is admin, carol owns #shop
    // A link carol made while owners could still invite.
    await w.db.prepare("INSERT INTO settings (key, value) VALUES ('open_signup', '1')").run();
    const ownerCode = (await w.ok("carol", "invite", { project: "shop" })).match(/\/join\/([0-9a-f]+)/)![1];
    await w.db.prepare("DELETE FROM settings WHERE key = 'open_signup'").run(); // back to the default

    assert.match((await w.tool("carol", "invite", { project: "shop" })).text, /invite-only: only admins invite people \(alice\)/);
    assert.match((await w.tool("carol", "invite", { project: "shop", name: "bob" })).text, /invite-only/);
    assert.equal((await w.request(`/join/${ownerCode}`)).status, 404);

    // alice invites into a project she isn't in, and to the intercom only.
    const shopCode = (await w.ok("alice", "invite", { project: "shop" })).match(/\/join\/([0-9a-f]+)/)![1];
    const plain = await w.ok("alice", "invite", {});
    assert.match(plain, /Invite link for the intercom \(an account, no project/);
    const plainCode = plain.match(/\/join\/([0-9a-f]+)/)![1];

    const join = (code: string, handle: string) =>
      w.request(`/join/${code}`, { method: "POST", headers: { origin: ORIGIN }, body: new URLSearchParams({ handle }), redirect: "manual" });
    assert.equal((await join(shopCode, "dana")).status, 200);
    assert.ok(await w.db.prepare("SELECT 1 FROM project_members WHERE project = 'shop' AND member = 'dana'").first());
    assert.equal((await join(plainCode, "eve")).status, 200);
    assert.ok(await w.db.prepare("SELECT 1 FROM members WHERE name = 'eve'").first());
    assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM project_members WHERE member = 'eve'").first<{ n: number }>())!.n, 0);

    // Discover is closed: no join requests, no repo-access joins.
    assert.match(await (await w.request("/discover", { as: "carol", cookie: true })).text(), /Invite-only/);
  });
});
describe("background jobs", () => {
  test("running jobs show for the owner; an ended one leaves a finished/failed line", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=bj&name=runner", { as: "bob" });
    const post = (items: unknown[]) =>
      w.request("/api/activity?session=bj", { as: "bob", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
    const ev = (o: object) => ({ at: Date.now(), kind: "job", text: JSON.stringify(o) });
    await post([
      ev({ op: "start", id: "b1", description: "Run the dev server", command: "npx wrangler dev" }),
      ev({ op: "start", id: "b2", description: "Deploy and wait until live", command: "npx wrangler deploy" }),
    ]);
    const view = (as: string) => w.request("/dashboard?view=agents&agent=bob/runner", { as, cookie: true }).then((r) => r.text());
    let page = await view("bob");
    assert.match(page, /⧗ Run the dev server <span class="muted">· running/);
    assert.match(page, /<span title="background jobs">⧗<\/span>/); // marked in the tree
    assert.doesNotMatch(await view("alice"), /Run the dev server/);

    await post([
      ev({ op: "end", id: "b2", status: "completed", summary: 'Background command "Deploy and wait until live" completed (exit code 0)' }),
      ev({ op: "end", id: "b1", status: "failed", summary: 'Background command "Run the dev server" failed with exit code 1' }),
    ]);
    page = await view("bob");
    assert.doesNotMatch(page, /⧗ Run the dev server <span class="muted">· running/);
    assert.match(page, /✓ finished: Deploy and wait until live after/);
    assert.match(page, /✗ failed: Run the dev server \(exit 1\) after/);

    // One the agent stops itself (TaskStop): no notice from Claude Code, the mirror ends it with "stopped".
    await post([ev({ op: "start", id: "b3", description: "Tail the logs", command: "npx wrangler tail" })]);
    await post([ev({ op: "end", id: "b3", status: "stopped" })]);
    page = await view("bob");
    assert.doesNotMatch(page, /⧗ Tail the logs/);
    assert.match(page, /■ stopped: Tail the logs after/);
  });
});

describe("mod toasts", () => {
  test("a DM from your own other agent is toasted once: 'latest' covers it", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=t1&name=core", { as: "bob" });
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=t2&name=perf", { as: "bob" });
    await w.ok("bob", "post", { to: "bob/core", message: "preflight sees your runlib" }, { id: "t2", project: "billing-api" });
    const s = (await (await w.request("/api/ui?project=billing-api&session=t1", { as: "bob" })).json()) as { latest: number; recent: { id: number; body: string }[] };
    const dm = s.recent.find((m) => m.body.includes("preflight"))!;
    assert.ok(dm, "the sibling's DM is in recent");
    assert.ok(s.latest >= dm.id, "latest covers it, so the mod won't toast it again");
  });
});

describe("side questions (btw)", () => {
  test("asked from the dashboard, answered by the mod's fork, never in the agent's context; follow-ups carry the thread", async () => {
    const w = await standardWorld();
    const hook = async (event: string, sid: string) => {
      const t = await (await w.request(`/api/hook?event=${event}&project=billing-api&session=${sid}`, { as: "bob" })).text();
      return t.startsWith("{") ? ((JSON.parse(t) as { hookSpecificOutput?: { additionalContext?: string } }).hookSpecificOutput?.additionalContext ?? t) : t;
    };
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=bw1&name=core", { as: "bob" });
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=bw2&name=alder&client=codex", { as: "bob" });
    await hook("UserPromptSubmit", "bw1");
    const ask = (as: string, fields: Record<string, string>) =>
      w.form("/action/post", as, { back: "/dashboard?view=agents", to: "bob/core", session: "bw1", mode: "btw", ...fields }).then((r) => new URL(r.headers.get("location")!, ORIGIN).searchParams);
    const snap = async () => (await (await w.request("/api/ui?project=billing-api&session=bw1", { as: "bob" })).json()) as { btw: { id: number; prompt: string }[] };
    const answer = (id: number, text: string) => w.request(`/api/btw/${id}`, { as: "bob", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: text }) });

    // Without the mod polling for that session nothing could answer: refused at once, with what to do.
    assert.match((await ask("bob", { message: "anyone there?" })).get("err")!, /core isn't running the intercom-ui mod[\s\S]*claude plugin install intercom-ui@intercom/);
    assert.match(await (await w.request("/dashboard?view=agents&agent=bob/core", { as: "bob", cookie: true })).text(), /class="btn ghost btwbtn"[^>]*disabled title="core isn&#39;t running|class="btn ghost btwbtn"[^>]*disabled/);
    await snap(); // the mod polls

    assert.equal((await ask("bob", { message: "what's your plan?" })).get("ok"), "Asked on the side");
    // Not a message: nothing reaches the agent through hooks or its inbox.
    assert.doesNotMatch(await hook("UserPromptSubmit", "bw1"), /what's your plan/);
    assert.doesNotMatch(await w.ok("bob", "inbox", {}, { id: "bw1", project: "billing-api" }), /what's your plan/);

    let s = await snap();
    assert.equal(s.btw.length, 1);
    assert.match(s.btw[0]!.prompt, /side question from your user[\s\S]*Question: what's your plan\?$/);
    await answer(s.btw[0]!.id, "Invoices index first, then the API.");
    assert.equal((await snap()).btw.length, 0);

    // A follow-up carries the earlier exchange; "new thread" doesn't.
    await ask("bob", { message: "why that order?" });
    s = await snap();
    assert.match(s.btw[0]!.prompt, /Earlier side questions in this thread:\nQ: what's your plan\?\nA: Invoices index first, then the API\.\n\nQuestion: why that order\?/);
    await answer(s.btw[0]!.id, "The API reads the index.");
    await ask("bob", { message: "unrelated: are the tests green?", thread: "new" });
    assert.doesNotMatch((await snap()).btw[0]!.prompt, /Earlier side questions/);

    const page = await (await w.request("/dashboard?view=agents&agent=bob/core", { as: "bob", cookie: true })).text();
    assert.match(page, /<span class="btwtag">btw<\/span>why that order\?<\/div><div class="btwa md"><p>The API reads the index\.<\/p>/);
    assert.match(page, /data-btwtoggle title=/);

    // Owner-only; not for Codex.
    assert.match((await ask("alice", { message: "peek" })).get("err")!, /only ask your own agents/);
    assert.match((await ask("bob", { message: "hi", session: "bw2", to: "bob/alder" })).get("err")!, /need Claude Code/);
    assert.doesNotMatch(await (await w.request("/dashboard?view=agents&agent=bob/alder", { as: "bob", cookie: true })).text(), /data-btwtoggle title=/);
  });
});

describe("reference links", () => {
  test("origins normalise to web addresses; refs link to the writer's own repo", async () => {
    const { webBase, linkRefs } = await import("../src/refs.ts");
    assert.equal(webBase("git@gitlab.example.com:group/sub/billing.git"), "https://gitlab.example.com/group/sub/billing");
    assert.equal(webBase("ssh://git@gitlab.example.com:2222/group/billing.git"), "https://gitlab.example.com/group/billing");
    assert.equal(webBase("https://user:secret@github.com/acme/shop.git"), "https://github.com/acme/shop");
    assert.equal(webBase("/local/path/repo"), null);

    const gl = "https://gitlab.example.com/group/billing";
    const html = linkRefs("see !3742 and #12, fixed in a91c2e0 (and other/repo!5)", gl);
    assert.match(html, /<a class="ref" href="https:\/\/gitlab\.example\.com\/group\/billing\/-\/merge_requests\/3742"[^>]*>!3742<\/a>/);
    assert.match(html, /href="https:\/\/gitlab\.example\.com\/group\/billing\/-\/issues\/12"/);
    assert.match(html, /href="https:\/\/gitlab\.example\.com\/group\/billing\/-\/commit\/a91c2e0"/);
    assert.match(html, /href="https:\/\/gitlab\.example\.com\/other\/repo\/-\/merge_requests\/5"/);
    const gh = linkRefs("PR #88 and deadbeef and 1234567", "https://github.com/acme/shop");
    assert.match(gh, /href="https:\/\/github\.com\/acme\/shop\/issues\/88"/);
    assert.doesNotMatch(gh, /deadbeef<\/a>|1234567<\/a>/); // words and plain numbers aren't commits
    assert.equal(linkRefs("&#39;quoted&#39; hello!3", gl), "&#39;quoted&#39; hello!3"); // entities and mid-word ! untouched
  });

  test("an agent's message links its MR refs to its own GitLab", async () => {
    const w = await standardWorld();
    await w.request(`/api/hook?event=SessionStart&project=billing-api&session=rf1&name=core&origin=${encodeURIComponent("git@gitlab.example.com:group/billing-api.git")}`, { as: "bob" });
    await w.ok("bob", "post", { channel: "billing", message: "Opened !3742 for the ledger fix (`a91c2e0`)." }, { id: "rf1", project: "billing-api" });
    const feed = await (await w.request("/dashboard", { as: "alice", cookie: true })).text();
    assert.match(feed, /href="https:\/\/gitlab\.example\.com\/group\/billing-api\/-\/merge_requests\/3742"[^>]*>!3742<\/a>/);
    assert.match(feed, /href="https:\/\/gitlab\.example\.com\/group\/billing-api\/-\/commit\/a91c2e0"[^>]*><code>a91c2e0<\/code><\/a>/);
  });
});

describe("tree order", () => {
  test("agents that need you come first, then working, then by last activity, each with a quiet time", async () => {
    const w = await standardWorld();
    const hook = (sid: string, name: string, event = "SessionStart", extra = "") =>
      w.request(`/api/hook?event=${event}&project=billing-api&session=${sid}&name=${name}${extra}`, { as: "bob" });
    for (const [sid, name] of [["o1", "older"], ["o2", "newer"], ["o3", "busy"], ["o4", "asking"]]) await hook(sid, name);
    const ago = (sid: string, min: number) =>
      w.db.prepare("UPDATE sessions SET active_at = ?, state_at = ? WHERE session_id = ?").bind(Date.now() - min * 60_000, Date.now() - min * 60_000, sid).run();
    await hook("o3", "busy", "UserPromptSubmit");
    await hook("o4", "asking", "Notification", "&detail=needs%20approval");
    await ago("o1", 90);
    await ago("o2", 5);
    // Claude Code's idle reminder isn't activity: "older" keeps its time.
    await hook("o1", "older", "Notification", "&kind=idle_prompt");

    const page = await w.request("/dashboard", { as: "bob", cookie: true }).then((r) => r.text());
    const order = [...page.matchAll(/class="ta[^"]*" data-k="bob\/(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, ["asking", "busy", "newer", "older"]);
    assert.match(page, /data-k="bob\/older"[\s\S]*?<time class="tt"[^>]*>1h<\/time>/);
    assert.match(page, /data-k="bob\/newer"[\s\S]*?<time class="tt"[^>]*>5m<\/time>/);
    assert.doesNotMatch(page.match(/data-k="bob\/busy"[\s\S]*?<\/a>/)![0], /class="tt"/); // its dot says it's working
  });
});

describe("working directory", () => {
  test("the hooks report where a session works; only its owner sees it", async () => {
    const w = await standardWorld();
    await w.request("/api/hook?event=SessionStart&project=billing-api&session=wd1&name=core&cwd=~/work/billing-api", { as: "bob" });
    const view = (as: string) => w.request("/dashboard?view=agents&agent=bob/core", { as, cookie: true }).then((r) => r.text());
    assert.match(await view("bob"), /<span class="cwd" title="Working directory">.*~\/work\/billing-api<\/span>/);
    assert.doesNotMatch(await view("alice"), /work\/billing-api/);
  });
});

describe("dashboard script", () => {
  test("parses (a stray \\n in the template once broke every page's script)", async () => {
    const { SCRIPT } = await import("../src/ui.ts");
    assert.ok(SCRIPT.length > 1000);
    assert.doesNotThrow(() => new Function(SCRIPT));
  });
});
