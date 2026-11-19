// Logging a machine's Claude Code into another Anthropic account from the dashboard, the way it's done by hand: /login
// typed into one of its agents' terminals, "Claude account with subscription" picked, the sign-in link read off its
// screen (the terminal wraps it over several lines) and opened in your own browser, and the code that page gives you
// typed back in. Claude Code keeps one login per machine, so every Claude Code agent there moves to that account.

import { type Term, choose, pause, waitFor } from "./codexterm";
import { type Env, UserError } from "./lib";
import { plainScreen } from "./screen";
import { type Row, myRows, termFor } from "./upkeep";

const hostOf = (r: Pick<Row, "host">) => r.host || "its machine";

const BY = "from the dashboard (logging in to another account)";

/** The agent, its terminal, and the other Claude Code agents on its machine (they move with it). */
async function target(env: Env, me: string, sessionId: string, secret?: string): Promise<{ t: Row; term: Term; others: Row[] }> {
  const { rows, live } = await myRows(env, me);
  const t = rows.find((r) => r.session_id === sessionId);
  if (!t) throw new UserError("No such agent of yours.");
  if (t.client === "codex") throw new UserError(`${t.label} is a Codex agent; this logs in Claude Code.`);
  const term = await termFor(env, me, t, rows, live, BY, secret);
  if (!term) throw new UserError(`${t.label}'s terminal can't be reached (it isn't in tmux, or keys aren't allowed on its machine).`);
  const others = rows.filter((r) => r.session_id !== t.session_id && live(r) && r.client !== "codex" && r.host && r.host === t.host);
  return { t, term, others };
}

/** The sign-in link on screen: from "https://…/oauth/authorize" through the lines the terminal wrapped it onto. */
export function loginUrl(text: string): string | null {
  const ls = plainScreen(text).split("\n");
  const i = ls.findIndex((l) => /https:\/\/\S+\/oauth\/authorize\?/.test(l));
  if (i < 0) return null;
  let url = ls[i]!.slice(ls[i]!.indexOf("https://")).trimEnd();
  // A wrapped part starts at the line's first column and has no spaces; the text after it is indented.
  for (let j = i + 1; j < ls.length && /^\S+\s*$/.test(ls[j]!); j++) url += ls[j]!.trim();
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !/(^|\.)(claude\.com|claude\.ai|anthropic\.com)$/.test(u.hostname) || !u.pathname.endsWith("/oauth/authorize")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Machine-wide: which agents move with it, said in the dialog. */
export async function loginInfo(env: Env, me: string, sessionId: string): Promise<{ host: string; others: string[] }> {
  const { rows, live } = await myRows(env, me);
  const t = rows.find((r) => r.session_id === sessionId);
  if (!t) throw new UserError("No such agent of yours.");
  return { host: hostOf(t), others: rows.filter((r) => r.session_id !== t.session_id && live(r) && r.client !== "codex" && r.host && r.host === t.host).map((r) => r.label) };
}

/** Step 1: /login, the subscription login picked; the sign-in link to open. */
export async function loginStart(env: Env, me: string, sessionId: string): Promise<{ url: string; label: string; others: string[] }> {
  const { t, term, others } = await target(env, me, sessionId);
  let s = await term({ op: "capture" });
  if (/esc to interrupt/i.test(plainScreen(s.text))) throw new UserError(`${t.label} is working; log in when it's idle (or from another agent on that machine).`);
  // A login already open (an earlier try): back to its start.
  if (/Paste code here|Select login method/i.test(plainScreen(s.text))) {
    await term({ op: "keys", keys: ["esc"] });
    await pause();
  }
  await term({ op: "keys", text: "/login" });
  await pause(0.5);
  s = await term({ op: "keys", keys: ["enter"] });
  const menu = await waitFor(term, s, /Select login method/i, 4);
  if (!menu) {
    await term({ op: "keys", keys: ["esc"] });
    throw new UserError(`/login didn't open its menu in ${t.label}'s terminal. Look at its screen.`);
  }
  const pick = choose(menu.text, /^Claude account with subscription/i);
  if (!pick) {
    await term({ op: "keys", keys: ["esc"] });
    throw new UserError("Claude Code's login menu has no “Claude account with subscription” option.");
  }
  const page = await waitFor(term, await term({ op: "keys", keys: pick }), /Paste code here/i, 5);
  const url = page ? loginUrl(page.text) : null;
  if (!url) {
    await term({ op: "keys", keys: ["esc"] });
    throw new UserError(`The sign-in link didn't show in ${t.label}'s terminal. Look at its screen.`);
  }
  return { url, label: t.label, others: others.map((o) => o.label) };
}

/** Step 2: the code from the sign-in page typed in (kept out of its activity); what Claude Code says to it. */
export async function loginCode(env: Env, me: string, sessionId: string, raw: string): Promise<string> {
  const code = raw.trim();
  if (!/^[A-Za-z0-9_\-#.~]{10,600}$/.test(code)) throw new UserError("That doesn't look like the code the sign-in page gave you: copy it whole and paste it here.");
  const { t, term, others } = await target(env, me, sessionId, "the sign-in code");
  let s = await term({ op: "capture" });
  if (!/Paste code here/i.test(plainScreen(s.text))) throw new UserError(`${t.label} isn't waiting for a sign-in code any more. Start again.`);
  await term({ op: "keys", text: code });
  await pause(0.5);
  s = await term({ op: "keys", keys: ["enter"] });
  // Only what the login dialog says (from its "Login" title down), not the conversation above it.
  const dialog = (text: string) => {
    const ls = plainScreen(text).split("\n");
    let i = ls.length - 1;
    while (i > 0 && !/^\s*Login\s*$/.test(ls[i]!)) i--;
    return ls.slice(i > 0 ? i : Math.max(0, ls.length - 15)).join("\n");
  };
  let said = "";
  for (let i = 0; i < 9; i++) {
    said = dialog(s.text);
    if (/Login successful|Logged in|successfully|invalid|error|failed|expired/i.test(said)) break;
    await pause();
    s = await term({ op: "capture" });
  }
  const done = /Login successful|Logged in|successfully|invalid|error|failed|expired/i.test(said);
  if (!done || /invalid|error|failed|expired/i.test(said) && !/Login successful|Logged in/i.test(said)) {
    const why = said.split("\n").map((l) => l.trim()).filter((l) => /invalid|error|failed|expired/i.test(l)).pop();
    throw new UserError(why ? `Claude Code said: ${why.slice(0, 200)}` : `Claude Code didn't say the login worked. Look at ${t.label}'s screen.`);
  }
  // "Press Enter to continue", when it asks.
  if (/Press Enter/i.test(said)) await term({ op: "keys", keys: ["enter"] });
  const email = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/.exec(said)?.[1];
  const moved = others.length ? ` ${others.map((o) => o.label).join(", ")} on the same machine ${others.length === 1 ? "uses" : "use"} it too.` : "";
  return `Logged in${email ? ` as ${email}` : ""}.${moved}`;
}

/** Called off: Esc out of the login. */
export async function loginCancel(env: Env, me: string, sessionId: string): Promise<void> {
  const { term } = await target(env, me, sessionId);
  const s = await term({ op: "capture" });
  if (/Paste code here|Select login method/i.test(plainScreen(s.text))) await term({ op: "keys", keys: ["esc"] });
}
