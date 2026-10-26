// The newest intercom plugin version (kept in step with plugins/intercom/.claude-plugin/plugin.json by a test).
export const PLUGIN_VERSION = "0.12.11";

/** True when `v` (e.g. "0.10.0") is older than the newest plugin. Unknown versions count as outdated. */
export function outdated(v: string | null | undefined): boolean {
  if (!v) return true;
  const a = v.split(".").map(Number);
  const b = PLUGIN_VERSION.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  return false;
}
