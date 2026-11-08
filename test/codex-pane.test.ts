import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
// @ts-expect-error plain JS module
import { codexPane } from "../plugins/intercom/code.mjs";

// Codex 0.16x: the MCP servers' parent is the app-server daemon, so the pane is found from the Codex terminals instead.
test("a Codex server finds its own session's pane, not the daemon's", async () => {
  const lox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lox-")));
  const fab = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fab-")));
  // The "terminal" is this test process (its working folder is real), in pane %7; the daemon sits in %4.
  const me = process.pid;
  const here = process.cwd();
  const procs = (args: string) => [
    { pid: 1000, ppid: 1, args: "/x/bin/codex app-server --listen unix:// --managed-daemon" },
    { pid: 2000, ppid: 1, args: "bash" },
    { pid: me, ppid: 2000, args },
  ];
  const panes = new Map([[2000, "%7"], [1000, "%4"]]);
  try {
    process.chdir(fab);
    assert.deepEqual(await codexPane(fab, null, { procs: procs("/x/bin/codex --yolo resume fab-one"), panes }), { pane: "%7", launch: "/x/bin/codex --yolo resume fab-one", ours: false });
    assert.equal((await codexPane(fab, "fab-one", { procs: procs("/x/bin/codex --yolo resume fab-one"), panes }))?.ours, true);
    assert.equal(await codexPane(lox, null, { procs: procs("/x/bin/codex --yolo resume fab-one"), panes }), null, "another folder's terminal");
    assert.equal(await codexPane(fab, null, { procs: procs("/x/bin/codex app-server --listen stdio://"), panes }), null, "the daemon isn't a terminal");
  } finally {
    process.chdir(here);
  }
});
