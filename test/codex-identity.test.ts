// Codex runs all of a machine's sessions in one app-server daemon, which starts every SessionStart hook and every
// intercom server: the hook notes all carry the daemon's pid. Each server must still find its own session (by its
// folder and when it started), never a stale note, and never one another running server has claimed.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

const SRV = new URL("../plugins/intercom/intercom-channel.mjs", import.meta.url).pathname;
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

test("Codex servers sharing one parent each find their own session", { timeout: 60_000 }, async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "intercom-codex-")));
  const home = path.join(root, "home");
  const D = path.join(home, ".claude/intercom");
  fs.mkdirSync(path.join(D, "codex-sessions"), { recursive: true });
  for (const d of ["fab", "lox"]) fs.mkdirSync(path.join(root, d));
  // A hub that turns everything away: the servers only need somewhere to try connecting to.
  const askedAs: string[] = [];
  const hub = http.createServer((q, r) => {
    if (q.headers["x-intercom-session"]) askedAs.push(String(q.headers["x-intercom-session"]));
    r.end("{}");
  });
  const connectedAs: string[] = [];
  hub.on("upgrade", (q, sock) => {
    connectedAs.push(String(q.headers["x-intercom-session"]));
    sock.destroy();
  });
  await new Promise<void>((ok) => hub.listen(0, "127.0.0.1", ok));
  fs.writeFileSync(path.join(D, "config"), `INTERCOM_URL=http://127.0.0.1:${(hub.address() as { port: number }).port}\nINTERCOM_TOKEN=x\n`);
  const now = () => Math.floor(Date.now() / 1000);
  // All notes carry the same pid (ours, standing in for the daemon), like on a machine with Codex's app-server.
  const note = (id: string, dir: string, at = now()) => fs.writeFileSync(path.join(D, "codex-sessions", id), `${process.pid}\n${path.join(root, dir)}\n${at}\n`);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|INTERCOM|CODEX)/.test(k))), HOME: home };
  const kids: ChildProcess[] = [];
  const logs = new Map<number, string>();
  const start = (dir: string) => {
    const c = spawn(process.execPath, [SRV], { cwd: path.join(root, dir), env, stdio: ["pipe", "ignore", "pipe"] });
    logs.set(c.pid!, "");
    c.stderr!.on("data", (b) => logs.set(c.pid!, logs.get(c.pid!) + String(b)));
    c.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "codex-mcp-client", version: "0.167.0" } } })}\n`);
    kids.push(c);
    return c.pid!;
  };
  try {
    note("stale-lox", "lox", now() - 86400); // a session that ended yesterday, its note left behind
    const lox = start("lox");
    await sleep(800);
    note("lox-live", "lox");
    const fab1 = start("fab");
    await sleep(1200);
    note("fab-one", "fab");
    await sleep(4000);
    const fab2 = start("fab");
    await sleep(1200);
    note("fab-two", "fab");
    await sleep(8000);
    const found = (pid: number) => logs.get(pid)!.match(/codex session (\S+)/)?.[1];
    assert.equal(found(lox), "lox-live");
    assert.equal(found(fab1), "fab-one");
    assert.equal(found(fab2), "fab-two");
    assert.equal(fs.readFileSync(path.join(D, "codex-claims", "fab-one"), "utf8"), String(fab1));
    // Never connected under a placeholder (it would take the agent's name and mail), only as its session.
    assert.ok(connectedAs.length > 0 && connectedAs.every((id) => !id.startsWith("pid-")), connectedAs.join(","));
    assert.ok(askedAs.every((id) => !id.startsWith("pid-")), askedAs.join(","));
  } finally {
    for (const c of kids) c.kill();
    hub.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
