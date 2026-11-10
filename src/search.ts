// Search (⌘K): words in your chats. Messages to and from you and your agents, posts in your projects, and what your
// own agents wrote in their terminals (their texts and the prompts typed there). Newest first, a short snippet each,
// and where it opens: the agent's chat (scrolled to it) or the project's feed.

import { type Env, LIVE, myProjects } from "./lib";

export interface Hit {
  kind: "message" | "text";
  title: string; // who: the agent, or a project
  snippet: string;
  href: string;
  at: number;
}

const snippet = (body: string, q: string) => {
  // Plain text: no Markdown marks (#, **, `, >) or table bars in the way.
  const t = body.replace(/^#{1,6}\s+|^>\s?|\*\*|__|`+|\|/gm, " ").replace(/\s+/g, " ").trim();
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  const from = Math.max(0, i - 50);
  return (from ? "…" : "") + t.slice(from, from + 160) + (from + 160 < t.length ? "…" : "");
};

export async function search(env: Env, me: string, raw: string): Promise<Hit[]> {
  const q = raw.trim().slice(0, 100);
  if (q.length < 3) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const mine = await myProjects(env, me);
  const ph = mine.map(() => "?").join(",") || "NULL";
  const { results: msgs } = await env.DB.prepare(
    `SELECT id, sender, sender_agent, recipient, recipient_agent, channel, body, created_at FROM messages
     WHERE kind != 'event' AND ${LIVE} AND body LIKE ? ESCAPE '\\'
       AND (recipient = ? OR sender = ? OR (recipient IS NULL AND channel IN (${ph})))
     ORDER BY id DESC LIMIT 25`,
  )
    .bind(like, me, me, ...mine)
    .all<{ id: number; sender: string; sender_agent: string | null; recipient: string | null; recipient_agent: string | null; channel: string; body: string; created_at: number }>();
  const { results: texts } = await env.DB.prepare(
    `SELECT a.id, a.at, a.kind, a.text, s.label FROM activity a JOIN sessions s ON s.member = a.member AND s.session_id = a.session_id
     WHERE a.member = ? AND a.kind IN ('text', 'prompt') AND a.text LIKE ? ESCAPE '\\' ORDER BY a.id DESC LIMIT 15`,
  )
    .bind(me, like)
    .all<{ id: number; at: number; kind: string; text: string; label: string }>();
  const chat = (member: string, label: string, mid: string) => `/dashboard?view=agents&agent=${encodeURIComponent(`${member}/${label}`)}&find=${mid}`;
  const hits: Hit[] = msgs.map((m) => {
    // The agent whose chat it's in: the one that sent it, or the one it went to.
    const agent = m.sender_agent ? [m.sender, m.sender_agent] : m.recipient_agent && m.recipient ? [m.recipient, m.recipient_agent] : null;
    return {
      kind: "message" as const,
      title: !m.recipient ? `#${m.channel}${m.sender_agent ? ` · ${m.sender_agent}` : ` · ${m.sender}`}` : agent ? (agent[0] === me ? agent[1]! : `${agent[0]}/${agent[1]}`) : m.sender === me ? m.recipient! : m.sender,
      snippet: snippet(m.body, q),
      href: !m.recipient ? `/dashboard?channel=${encodeURIComponent(m.channel)}` : agent ? chat(agent[0]!, agent[1]!, String(m.id)) : "/dashboard",
      at: m.created_at,
    };
  });
  for (const t of texts) hits.push({ kind: "text", title: `${t.label} · ${t.kind === "prompt" ? "typed in its terminal" : "in its terminal"}`, snippet: snippet(t.text, q), href: chat(me, t.label, `a${t.id}`), at: t.at });
  return hits.sort((a, b) => b.at - a.at).slice(0, 30);
}
