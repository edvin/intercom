// Handover notes: per agent name in a project, what that agent was on, what's next and what to watch out for. The
// agent writes them (the notes tool) when it wraps up a piece of work or expects a restart, its person can edit them
// in the dashboard, and the next session that takes the name gets them at its start. A new session also hears which
// names in its project are free and what their notes say, so it can offer to take one over (set_name).

import type { Env } from "./lib";

export const NOTES_MAX = 4000;
const FREE_AFTER = 10 * 60_000; // a name whose last session was seen longer ago than this is free

export interface Note {
  name: string;
  body: string;
  updated_at: number;
  updated_by: string;
}

export async function getNote(env: Env, me: string, project: string, name: string): Promise<Note | null> {
  return (
    (await env.DB.prepare("SELECT name, body, updated_at, updated_by FROM agent_notes WHERE member = ? AND project = ? AND name = ?")
      .bind(me, project, name)
      .first<Note>()) ?? null
  );
}

/** Replaces the name's notes; an empty body removes them. */
export async function setNote(env: Env, me: string, project: string, name: string, body: string, by: string): Promise<void> {
  const text = body.replace(/\r\n?/g, "\n").trim().slice(0, NOTES_MAX);
  if (!text) {
    await env.DB.prepare("DELETE FROM agent_notes WHERE member = ? AND project = ? AND name = ?").bind(me, project, name).run();
    return;
  }
  await env.DB.prepare(
    "INSERT INTO agent_notes (member, project, name, body, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (member, project, name) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
  )
    .bind(me, project, name, text, Date.now(), by)
    .run();
}

/** Names in the project with notes that no live session of yours has, newest first, with when each was last active. */
export async function freeNotes(env: Env, me: string, project: string, except = ""): Promise<(Note & { last_seen: number | null })[]> {
  const { results } = await env.DB.prepare(
    `SELECT n.name, n.body, n.updated_at, n.updated_by, (SELECT MAX(last_seen) FROM sessions s WHERE s.member = n.member AND s.label = n.name) AS last_seen
     FROM agent_notes n WHERE n.member = ? AND n.project = ? AND n.name != ? ORDER BY n.updated_at DESC LIMIT 12`,
  )
    .bind(me, project, except)
    .all<Note & { last_seen: number | null }>();
  return results.filter((r) => !r.last_seen || Date.now() - r.last_seen > FREE_AFTER);
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 60 ? `${Math.max(1, m)}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/** The session-start part: this name's notes in full, then other free names with notes (first line each). */
export async function notesBrief(env: Env, me: string, project: string, label: string | null): Promise<string[]> {
  const out: string[] = [];
  const own = label ? await getNote(env, me, project, label) : null;
  if (own) {
    out.push(
      `Notes left for "${label}" in #${project} (updated ${ago(own.updated_at)}${own.updated_by ? ` by ${own.updated_by}` : ""}): you have this name now, so they're yours. Tell your user briefly what they say and ask whether to pick the work up.\n${own.body}`,
    );
  }
  const free = await freeNotes(env, me, project, label ?? "");
  if (free.length) {
    out.push(
      `Free names in #${project} with notes (no session has them now):\n${free
        .map((n) => `- ${n.name}${n.last_seen ? ` (last active ${ago(n.last_seen)})` : ""}: ${n.body.split("\n").find((l) => l.trim())!.trim().slice(0, 160)}`)
        .join("\n")}\nIf your user wants this session to take over one of them, call set_name with that name: you'll get its notes in full.`,
    );
  }
  return out;
}
