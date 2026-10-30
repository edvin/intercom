// The newest intercom plugin version (kept in step with plugins/intercom/.claude-plugin/plugin.json by a test).
export const PLUGIN_VERSION = "0.12.30";
/** From this version the local server downloads new releases itself, so a restart is all a session needs. */
export const AUTO_UPDATE_SINCE = "0.12.25";

/** True when `v` (e.g. "0.10.0") is older than `than` (the newest plugin). Unknown versions count as outdated. */
export function outdated(v: string | null | undefined, than = PLUGIN_VERSION): boolean {
  if (!v) return true;
  const a = v.split(".").map(Number);
  const b = than.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  return false;
}

/** The first plugin version whose Stop hook sends the agent's final message, which then becomes its dashboard reply. */
export const TERMINAL_REPLY_SINCE = "0.12.17";

/** How an agent answers what its user writes from the dashboard, for its plugin version. */
export function replyHow(version: string | null | undefined, me: string): string {
  return outdated(version, TERMINAL_REPLY_SINCE)
    ? `Answer them with the intercom post tool to your user's handle (no session part, to: "${me}"), which reaches the dashboard. The dashboard also shows what you write in the terminal, so don't repeat that reply there: end with one short line.`
    : "Answer in this terminal as you would a typed prompt: when your turn ends, your final message goes to the dashboard as your reply, so make it the complete answer, and don't also send it with the post tool.";
}
