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
    const m = /^\s*([›❯])?\s*(\d+)\.\s+(.+?)\s*$/.exec(ls[i]!); // Codex's cursor, or Claude Code's
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
export function choose(text: string, re: RegExp | ((label: string) => boolean)): string[] | null {
  const opts = menu(text);
  const want = opts.findIndex((o) => (typeof re === "function" ? re(o.label) : re.test(o.label)));
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

/** A reasoning level as Codex's /model menu names it. */
const LEVEL_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max", ultra: "Ultra" };
/** A model as the menu lists it ("GPT-6.1 Terra (current)  Efficient model…") → its id's form (gpt-6.1-terra). */
export const menuModel = (label: string) =>
  label.split(/\s{2,}/)[0]!.replace(/\s*\(current\)\s*$/i, "").trim().toLowerCase().replace(/\s+/g, "-");

export type Switched = { model: string; effort: string } | "busy" | `failed: ${string}`;

/**
 * Switch a Codex session's model and reasoning level with /model, for this session only: its model (`model`, an id
 * such as gpt-6.1-sol; the current one when left out), then its level ("auto": the one marked default; max and ultra
 * sit under "More reasoning…"), picked with "s" (Enter would make it the default for every session on the machine).
 * Answers with what Codex says it changed to.
 */
export async function switchModel(term: Term, want: { model?: string; effort: string }): Promise<Switched> {
  const s = await keepModel(term, await term({ op: "capture" }));
  if (busy(s.text)) return "busy";
  const back = async (why: string): Promise<Switched> => {
    await term({ op: "keys", keys: ["esc", "esc"] });
    return `failed: ${why}`;
  };
  const picker = await waitFor(term, await typeLine(term, "/model"), /Select Model and Effort/, 3);
  if (!picker) return back("its /model menu didn't open");
  const pickModel = choose(picker.text, want.model ? (l) => menuModel(l) === want.model!.toLowerCase() : /\(current\)/i);
  if (!pickModel) return back(`${want.model ?? "its model"} isn't in its /model menu`);
  let levels = await waitFor(term, await term({ op: "keys", keys: pickModel }), /Select Reasoning Level/, 3);
  if (!levels) return back("the reasoning levels didn't show");
  let re: RegExp = /\(default\)/i;
  if (want.effort !== "auto") {
    const label = LEVEL_LABEL[want.effort];
    if (!label) return back(`${want.effort} isn't a reasoning level`);
    if (want.effort === "max" || want.effort === "ultra") {
      const more = choose(levels.text, /^More reasoning/i);
      if (!more) return back(`${label} isn't offered for this model`);
      levels = await waitFor(term, await term({ op: "keys", keys: more }), /Advanced Reasoning/, 3);
      if (!levels) return back("the advanced reasoning levels didn't show");
    }
    re = new RegExp(`^${label}\\b`, "i");
  }
  const pick = choose(levels.text, re);
  if (!pick) return back(`${LEVEL_LABEL[want.effort] ?? "Its default level"} isn't offered for this model`);
  // The cursor moves there; "s" then picks it for this session only.
  if (pick.length > 1) await term({ op: "keys", keys: pick.slice(0, -1) });
  // What Codex says it changed to: a line that wasn't on the screen before (an earlier switch's may still show).
  const changes = (text: string) => [...plainScreen(text).matchAll(/Model changed to (\S+)(?: (\S+))? for this session/g)];
  const before = changes(s.text).length;
  let now = await term({ op: "keys", text: "s" });
  for (let i = 0; changes(now.text).length <= before && i < 3; i++) {
    await pause();
    now = await term({ op: "capture" });
  }
  const said = changes(now.text).length > before ? changes(now.text).pop() : null;
  if (!said) return back("Codex didn't say it changed");
  return { model: said[1]!, effort: said[2] ?? "auto" };
}

export const CARRY_ON ="Your usage limit was reset: carry on with your work.";

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
