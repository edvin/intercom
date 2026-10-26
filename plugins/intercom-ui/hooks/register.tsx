// Intercom inside Claude Code. Reads the same config as the intercom plugin (~/.claude/intercom/config) and
// shows what concerns you without a model turn:
//  - a band above the prompt: locks on this project held by others, and votes waiting for you
//  - /ic: a live panel with locks, votes, unread messages and who's working on what
//  - toasts for DMs, lock activity and new votes, and a status line entry
// Messages from others never become prompts by themselves: a DM only proposes a dim suggestion you can take with Tab.

import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Lock, Note, Snapshot, Vote } from '../types'

const PANE = 'intercom'
const snap = atom({ plugin: 'intercom-ui', key: 'snap' } as const, null)
const error = atom({ plugin: 'intercom-ui', key: 'error' } as const, null)
const hidden = atom({ plugin: 'intercom-ui', key: 'hidden' } as const, [])

const POLL_MS = 8_000

type Conf = { url: string; token: string }

const ago = (ts: number, now: number) => {
  const s = Math.round((now - ts) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
const left = (ts: number, now: number) => {
  const m = Math.max(0, Math.round((ts - now) / 60000))
  return m < 60 ? `${m}m left` : `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ''} left`
}
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Module state; a reload starts it over (the snapshot itself lives in $.state). */
const ctx = { conf: null as Conf | null, repo: '', sessionId: '', seen: -1, busy: false, turning: false, submitted: new Set<number>() }

async function loadConf($: Engine): Promise<Conf | null> {
  const home = await $.env.get('HOME')
  if (!home) return null
  let text = ''
  try {
    text = await $.fs.read(`${home}/.claude/intercom/config`)
  } catch {
    return null
  }
  const vars: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m?.[1] && m[2] !== undefined) vars[m[1]] = m[2].trim()
  }
  return vars.INTERCOM_URL && vars.INTERCOM_TOKEN ? { url: vars.INTERCOM_URL, token: vars.INTERCOM_TOKEN } : null
}

// The repo name the hooks use: origin's last path segment, else the folder name.
async function detectRepo($: Engine): Promise<string> {
  const root: string = await $.session.root()
  try {
    const git: string = await $.fs.read(`${root}/.git/config`)
    const m = git.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/)
    if (m?.[1]) return m[1].replace(/\.git$/, '').replace(/.*[/:]/, '')
  } catch {}
  return root.replace(/\/+$/, '').replace(/.*\//, '')
}

async function call($: Engine, tool: string, args: Record<string, unknown>): Promise<string> {
  if (!ctx.conf) return 'Intercom is not set up.'
  const res = await $.http.fetch(`${ctx.conf.url}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ctx.conf.token}`,
      'content-type': 'application/json',
      'x-intercom-session': ctx.sessionId,
      'x-intercom-project': ctx.repo,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } }),
  })
  if (!res.ok) return `Intercom returned HTTP ${res.status}`
  const body = JSON.parse(res.text) as { result?: { content?: { text: string }[] } }
  return body.result?.content?.[0]?.text ?? 'Done.'
}

async function refresh($: Engine): Promise<void> {
  if (!ctx.conf || ctx.busy) return
  ctx.busy = true
  try {
    const res = await $.http.fetch(`${ctx.conf.url}/api/ui?project=${encodeURIComponent(ctx.repo)}&session=${encodeURIComponent(ctx.sessionId)}`, {
      headers: { authorization: `Bearer ${ctx.conf.token}` },
    })
    if (!res.ok) {
      await update($, error, () => (res.status === 401 ? 'token rejected: run the intercom setup again' : `hub returned ${res.status}`))
      $.ui.status('📻 intercom: offline')
      return
    }
    const s = JSON.parse(res.text) as Snapshot
    await update($, error, () => null)
    await update($, snap, () => s)
    announce($, s)
    await wake($, s)
    // Lead with this session's name on the intercom (e.g. "alder"), which is what others address it by.
    const parts = [`📻 ${s.label ?? s.me}`, `${s.unread} unread`]
    const others = s.locks.filter(l => !l.mine)
    const mine = s.locks.filter(l => l.mine)
    if (others.length) parts.push(`🔒 ${others.map(l => `${l.resource} (${l.holder})`).join(', ')}`)
    if (mine.length) parts.push(`🔐 you hold ${mine.map(l => l.resource).join(', ')}`)
    if (s.votes.length) parts.push(`🗳 ${s.votes.length} vote${s.votes.length > 1 ? 's' : ''} for you`)
    $.ui.status(parts.join(' · '))
  } catch {
    await update($, error, () => "can't reach the intercom hub")
    $.ui.status('📻 intercom: offline')
  } finally {
    ctx.busy = false
  }
}

// Toasts for what arrived since the last look. The first snapshot only sets the baseline.
function announce($: Engine, s: Snapshot): void {
  if (ctx.seen < 0) {
    ctx.seen = s.latest
    return
  }
  const fresh = s.recent.filter(n => n.id > ctx.seen).reverse()
  ctx.seen = Math.max(ctx.seen, s.latest)
  for (const n of fresh) {
    if (n.dm) {
      $.ui.toast(`DM from ${n.from}: ${short(n.body, 120)}`)
      void $.prompt.suggest({ text: `Read ${n.sender}'s intercom message and help me answer it` })
    } else if (/lock|proposal/.test(n.body) && n.kind === 'event') {
      $.ui.toast(`#${n.channel} · ${n.sender} ${short(n.body, 120)}`)
    }
  }
}

/**
 * The user wrote to this session from the dashboard: when it's idle, submit that as a prompt, as if typed here.
 * A busy session gets it from its Stop hook instead, so it isn't submitted twice.
 */
async function wake($: Engine, s: Snapshot): Promise<void> {
  if (ctx.turning) return
  const fresh = (s.prompts ?? []).filter(p => !ctx.submitted.has(p.id))
  if (!fresh.length) return
  for (const p of fresh) ctx.submitted.add(p.id)
  const body = fresh.map(p => p.body).join('\n\n---\n\n')
  $.ui.toast(`📻 ${s.label ?? 'intercom'}: your message from the dashboard`)
  await $.prompt.submit({
    text: `${body}\n\n(Sent by you from the intercom dashboard. Reply there with the intercom post tool, to: "${s.me}".)`,
  })
}

async function vote($: Engine, v: Vote, choice: string): Promise<void> {
  $.ui.toast(short(await call($, 'vote', { proposal_id: v.id, choice }), 160))
  await refresh($)
}
async function release($: Engine, l: Lock): Promise<void> {
  $.ui.toast(await call($, 'release', { resource: l.resource }))
  await refresh($)
}


export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ic', description: 'Intercom: live panel with locks, votes, messages and who is on what' })
    ctx.conf = await loadConf($)
    if (!ctx.conf) {
      $.ui.status('📻 intercom: not set up (curl -fsSL https://intercom.mhst.io/setup.sh | sh)')
      return next(e)
    }
    ctx.sessionId = await $.session.id()
    ctx.repo = await detectRepo($)
    void refresh($)
    $.clock.every(POLL_MS, () => void refresh($))
    return next(e)
  })

  // Fresh numbers right after each of your turns (the main loop's, not subagents').
  on('turn.start', async ($, e, next) => {
    // Mid-turn, the Stop hook carries dashboard messages; a new prompt only goes to an idle session.
    if (e.agentId === undefined) ctx.turning = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId === undefined) {
      ctx.turning = false
      void refresh($)
    }
    return out
  })

  on('command.run', { command: 'ic' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Intercom' })
    return { text: 'Intercom panel opened.' }
  })

  // The band: only what concerns this session, and only while it does.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snap)
    if (!s || e.props.hasSurvey) return next(e)
    const dismissed = await read($, hidden)
    const now = await $.clock.now()
    const locks = s.locks.filter(l => l.here && !l.mine && !dismissed.includes(`lock:${l.resource}:${l.created_at}`))
    const votes = s.votes.filter(v => !dismissed.includes(`vote:${v.id}`)).slice(0, 2)
    if (!locks.length && !votes.length) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const hide = (key: string) => update($, hidden, list => [...list, key].slice(-100))
    return (
      <Box flexDirection="column">
        {locks.map(l => (
          <Box key={`l${l.resource}`} gap={1}>
            <Text color="warning">🔒 {l.resource}</Text>
            <Text dimColor>
              held by {l.holder} · {left(l.expires_at, now)}
              {l.reason ? ` · ${short(l.reason, 60)}` : ''}
            </Text>
            <Button key={`hide-l${l.resource}`} label="Hide" onPress={() => void hide(`lock:${l.resource}:${l.created_at}`)} />
          </Box>
        ))}
        {votes.map(v => (
          <Box key={`v${v.id}`} gap={1}>
            <Text color="suggestion">🗳 #{v.channel}</Text>
            <Text>{short(v.question, 70)}</Text>
            {v.options.slice(0, 4).map(o => (
              <Button key={`v${v.id}-${o}`} label={o} onPress={() => void vote($, v, o)} />
            ))}
            <Button key={`hide-v${v.id}`} label="Later" onPress={() => void hide(`vote:${v.id}`)} />
          </Box>
        ))}
      </Box>
    )
  })

  // The panel (/ic).
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, snap)
    const err = await read($, error)
    const now = await $.clock.now()
    if (!ctx.conf) return <Text dimColor>Intercom isn't set up on this machine. Run: curl -fsSL https://intercom.mhst.io/setup.sh | sh</Text>
    if (!s) return <Text dimColor>{err ?? 'Loading…'}</Text>
    const head = (t: string) => <Text weight="bold">{t}</Text>
    const note = (n: Note) => (
      <Text key={`n${n.id}`} dimColor={n.kind === 'event'}>
        {n.dm ? '✉ ' : `#${n.channel} `}
        {n.from} · {ago(n.at, now)}: {short(n.body.replace(/\s+/g, ' '), 110)}
      </Text>
    )
    return (
      <Box flexDirection="column" gap={1}>
        <Box gap={1}>
          <Text weight="bold">📻 {s.label ? `${s.me}/${s.label}` : s.me}</Text>
          <Text dimColor>{s.project ? `#${s.project}` : 'this repo is not linked to a project'}</Text>
          {err ? <Text color="error">{err}</Text> : null}
          <Button key="refresh" label="Refresh" onPress={() => void refresh($)} />
        </Box>

        <Box flexDirection="column">
          {head(`Locks (${s.locks.length})`)}
          {s.locks.length === 0 ? <Text dimColor>Nothing locked.</Text> : null}
          {s.locks.map(l => (
            <Box key={`pl${l.resource}`} gap={1}>
              <Text color={l.mine ? 'suggestion' : 'warning'}>🔒 {l.resource}</Text>
              <Text dimColor>
                {l.mine ? 'you' : l.holder} · {left(l.expires_at, now)}
                {l.reason ? ` · ${short(l.reason, 50)}` : ''}
              </Text>
              {l.mine ? <Button key={`rel${l.resource}`} label="Release" onPress={() => void release($, l)} /> : null}
            </Box>
          ))}
        </Box>

        <Box flexDirection="column">
          {head(`Votes waiting for you (${s.votes.length})`)}
          {s.votes.length === 0 ? <Text dimColor>None.</Text> : null}
          {s.votes.map(v => (
            <Box key={`pv${v.id}`} flexDirection="column">
              <Text>
                #{v.id} · #{v.channel} · {v.author}: {v.question}
              </Text>
              <Box gap={1}>
                {v.options.map(o => (
                  <Button key={`pv${v.id}-${o}`} label={o} onPress={() => void vote($, v, o)} />
                ))}
              </Box>
            </Box>
          ))}
        </Box>

        <Box flexDirection="column">
          {head(`Unread (${s.unread})`)}
          {s.recent.length === 0 ? <Text dimColor>All caught up.</Text> : s.recent.slice(0, 6).map(note)}
          {s.recent.length ? <Text dimColor>Your Claude picks these up on your next prompt.</Text> : null}
        </Box>

        <Box flexDirection="column">
          {head('Who is on what')}
          {s.team.length === 0 ? <Text dimColor>Nobody active in the last hours.</Text> : null}
          {s.team.map(t => (
            <Text key={`t${t.member}`}>
              {t.member}
              <Text dimColor>
                {' '}
                · {t.project ? `#${t.project}` : 'elsewhere'}
                {t.branch ? ` · ⎇ ${t.branch}` : ''}
                {t.note ? ` · “${short(t.note, 60)}”` : ''} · {ago(t.updated_at, now)}
              </Text>
            </Text>
          ))}
        </Box>

        <Text dimColor>Dashboard: {s.origin}/dashboard</Text>
      </Box>
    )
  })
}
