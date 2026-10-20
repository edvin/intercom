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
    const dash = await (await w.request("/", { as: "carol", cookie: true })).text();
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
    const res = await w.request("/", { as: "alice", cookie: true });
    const page = await res.text();
    assert.doesNotMatch(page, /<img src=x|<script>alert/);
    assert.match(page, /&lt;script&gt;alert\(2\)/);
    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  });

  test("dashboard requires sign-in", async () => {
    const w = await standardWorld();
    const res = await w.request("/", { redirect: "manual" });
    assert.equal(res.status, 303);
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
