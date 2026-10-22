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
