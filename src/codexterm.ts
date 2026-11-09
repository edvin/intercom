// Driving a Codex terminal (through screen.ts): reading what its TUI shows (the input box, a menu, the goal in its
// footer, a turn running) and typing into it so that it lands. Codex takes text that arrives in one burst as a paste,
// and an Enter inside a paste doesn't send it (nor does the Enter that picks a slash command from its popup), so a
// line is typed, then Enter sent on its own, then Enter again while the line still sits in the input box.

import { type ScreenData, type ScreenQuery, plainScreen } from "./screen";

export type Term = (q: ScreenQuery) => Promise<ScreenData>;

/** How long to give the TUI between looks (tests make it short). */
export const timing = { step: 1200 };
export const pause = (n = 1) => new Promise((r) => setTimeout(r, timing.step * n));

const lines = (text: string) => plainScreen(text).replace(/\s+$/, "").split("\n");

/** What's in the input box: the last "›" line that isn't a menu option (null when no input box shows). */
export function composer(text: string): string | null {
  const ls = lines(text);
  for (let i = ls.length - 1; i >= 0; i--) {
    const m = /^\s*›\s?(.*)$/.exec(ls[i]!);
    if (m && !/^\s*\d+\.\s/.test(m[1]!)) return m[1]!.trim();
  }
  return null;
}

/** A turn is running ("Working (1m 05s • esc to interrupt)"). */
export const busy = (text: string) => /esc to interrupt/i.test(plainScreen(text));

/** The goal, as Codex's footer shows it. */
export function goal(text: string): "pursuing" | "paused" | null {
  const t = lines(text).slice(-4).join("\n");
  return /Pursuing goal/i.test(t) ? "pursuing" : /Goal paused/i.test(t) ? "paused" : null;
}

/** The menu at the bottom of the screen: its numbered options, and which one the cursor (›) is on. */
export function menu(text: string): { label: string; on: boolean }[] {
  const ls = lines(text);
  const out: { label: string; on: boolean; n: number }[] = [];
  for (let i = ls.length - 1; i >= 0; i--) {
    const m = /^\s*(›)?\s*(\d+)\.\s+(.+?)\s*$/.exec(ls[i]!);
    if (!m) {
      if (out.length) break;
      continue;
    }
    const n = Number(m[2]);
    if (out.length && n !== out[0]!.n - 1) break;
    out.unshift({ label: m[3]!, on: !!m[1], n });
    if (n === 1) break;
  }
  return out.map(({ label, on }) => ({ label, on }));
}

/** The keys that pick the option matching `re` in the menu on screen (null when there's no such option). */
export function choose(text: string, re: RegExp): string[] | null {
  const opts = menu(text);
  const want = opts.findIndex((o) => re.test(o.label));
  if (want < 0) return null;
  const at = Math.max(0, opts.findIndex((o) => o.on));
  const d = want - at;
  return [...Array(Math.abs(d)).fill(d > 0 ? "down" : "up"), "enter"];
}

/** Look again until the screen shows `re` (null if it doesn't within `tries` looks). */
export async function waitFor(term: Term, s: ScreenData, re: RegExp, tries = 4): Promise<ScreenData | null> {
  for (let i = 0; ; i++) {
    if (re.test(plainScreen(s.text))) return s;
    if (i >= tries) return null;
    await pause();
    s = await term({ op: "capture" });
  }
}

/** Type a line and send it, pressing Enter again while it still sits in the input box. */
export async function typeLine(term: Term, text: string): Promise<ScreenData> {
  await term({ op: "keys", text });
  let s = await term({ op: "keys", keys: ["enter"] });
  const start = text.slice(0, 24);
  for (let i = 0; i < 2 && composer(s.text)?.includes(start); i++) s = await term({ op: "keys", keys: ["enter"] });
  return s;
}

/** Codex's offer to switch to a cheaper model near a limit: answered with "Keep current model". */
export async function keepModel(term: Term, s: ScreenData): Promise<ScreenData> {
  const k = /Keep current model/.test(plainScreen(s.text)) ? choose(s.text, /^Keep current model(?!\s*\(never)/) : null;
  return k ? term({ op: "keys", keys: k }) : s;
}

export type Redeemed = "redeemed" | "none" | "busy" | `failed: ${string}`;

/**
 * Redeem a usage-limit reset: /usage → Redeem reset → Full reset → Yes. "none" when the account has none left.
 * Whatever it opened is closed again if a step isn't there.
 */
export async function redeemReset(term: Term): Promise<Redeemed> {
  let s = await keepModel(term, await term({ op: "capture" }));
  if (busy(s.text)) return "busy";
  const back = async (why: string): Promise<Redeemed> => {
    await term({ op: "keys", keys: ["esc", "esc"] });
    return `failed: ${why}`;
  };
  const opened = await waitFor(term, await typeLine(term, "/usage"), /Redeem reset/, 3);
  if (!opened) return back("the /usage menu didn't open");
  s = await term({ op: "keys", keys: choose(opened.text, /^Redeem reset/)! });
  const offer = await waitFor(term, s, /don't have any usage limit resets|Full reset/i, 5);
  if (!offer) return back("Codex didn't say which resets are available");
  if (/don't have any usage limit resets/i.test(plainScreen(offer.text))) {
    await term({ op: "keys", keys: choose(offer.text, /^Close/) ?? ["esc"] });
    return "none";
  }
  s = await term({ op: "keys", keys: choose(offer.text, /Full reset/)! });
  const confirm = await waitFor(term, s, /^\s*(›\s*)?\d+\.\s+Yes/m, 3);
  if (!confirm) return back("no confirmation was offered for the full reset");
  await term({ op: "keys", keys: choose(confirm.text, /^Yes/)! });
  await pause(2);
  await keepModel(term, await term({ op: "capture" }));
  return "redeemed";
}

export const CARRY_ON = "Your usage limit was reset: carry on with your work.";

/** After a reset, or a restart that paused its goal: the goal resumed, or the agent told to carry on. */
export async function carryOn(term: Term, opts: { tell?: boolean } = {}): Promise<string> {
  let s = await keepModel(term, await term({ op: "capture" }));
  const pick = choose(s.text, /^Resume goal/i);
  if (pick) {
    await term({ op: "keys", keys: pick });
    return "goal resumed";
  }
  if (busy(s.text)) return "working";
  if (goal(s.text) === "paused") {
    s = await typeLine(term, "/goal resume");
    const again = choose(s.text, /^Resume goal/i);
    if (again) await term({ op: "keys", keys: again });
    return "goal resumed (/goal resume)";
  }
  if (opts.tell === false) return "nothing to resume";
  await typeLine(term, CARRY_ON);
  return "told to carry on";
}
