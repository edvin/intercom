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
    assert.match(team, /bob\/billing-aaaa: #billing · branch feat\/ledger-4\.2 · “migrating invoices index”/);
    // carol shares no project with bob: she can't even see him.
    assert.doesNotMatch(await w.ok("carol", "team"), /bob/);
    // A project alice isn't in stays hidden from her, even though she shares #billing with bob.
    await w.ok("carol", "invite", { project: "shop", name: "bob" });
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
    await w.ok("carol", "invite", { project: "shop", name: "bob" });
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
    assert.match(start.systemMessage!, /📻 intercom · bob\/billing-s1 in #billing/);
    await w.ok("alice", "post", { to: "bob", message: "can you hold the deploy?" });
    const next = await get("event=UserPromptSubmit&project=billing-api&session=s1");
    assert.match(next.systemMessage!, /1 new — alice \(DM\): can you hold the deploy\?/);
    await w.ok("alice", "post", { to: "bob", message: "thanks" });
    const quiet = await get("event=UserPromptSubmit&project=billing-api&session=s1&show=0");
    assert.equal(quiet.systemMessage, undefined);
  });
});
