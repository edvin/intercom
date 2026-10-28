export type Lock = {
  resource: string
  holder: string
  reason: string
  channel: string
  created_at: number
  expires_at: number
  mine: boolean
  here: boolean
}

export type Vote = {
  id: number
  channel: string
  author: string
  question: string
  options: string[]
  closes_at: number | null
}

export type Note = {
  id: number
  from: string
  sender: string
  channel: string
  dm: boolean
  kind: string
  body: string
  at: number
}

export type Mate = { member: string; project: string; note: string; branch: string; updated_at: number }

export type Snapshot = {
  me: string
  /** This session's intercom name, e.g. alder (null until the session is known to the hub). */
  label: string | null
  /** What the user typed to this session in the dashboard, not read yet: submitted as prompts when idle. */
  prompts: { id: number; body: string }[]
  /** How the session answers them (it depends on its intercom plugin version); added to the submitted prompt. */
  reply?: string
  /** Side questions (/btw) from the dashboard: answered with a fork of this session's context, then posted back. */
  btw?: { id: number; prompt: string }[]
  project: string | null
  origin: string
  unread: number
  latest: number
  recent: Note[]
  locks: Lock[]
  votes: Vote[]
  team: Mate[]
}

declare module 'claude-code' {
  interface PluginState {
    'intercom-ui': { snap: Snapshot | null; error: string | null; hidden: string[] }
  }
}
