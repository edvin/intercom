import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Snapshot } from '../types'

const later = Date.now() + 30 * 60_000

const SNAP: Snapshot = {
  me: 'edvin',
  label: 'loxodon-core',
  project: 'billing',
  origin: 'https://hub.example',
  unread: 2,
  latest: 10,
  recent: [],
  locks: [
    { resource: 'deploy:billing:prod', holder: 'anna', reason: 'releasing v2.14', channel: 'billing', created_at: 1, expires_at: later, mine: false, here: true },
    { resource: 'deploy:shop:prod', holder: 'jonas', reason: '', channel: 'shop', created_at: 1, expires_at: later, mine: false, here: false },
  ],
  votes: [{ id: 7, channel: 'billing', author: 'anna', question: 'Hold deploys until 0042 ran?', options: ['yes', 'no'], closes_at: null }],
  team: [],
}

/** The machine and the hub beneath the mod: a config file, a git checkout, and /api/ui answering `snap`. */
function world(on: On, snap: Snapshot, seen: string[] = []) {
  mock.env(on, { HOME: '/home/t' })
  const clock = mock.clock(on, { now: Date.now() })
  on('fs.read', async (_$, e) => {
    if (e.path === '/home/t/.claude/intercom/config') return { value: 'INTERCOM_URL=https://hub.example\nINTERCOM_TOKEN=tok\n' }
    if (e.path === '/work/billing-api/.git/config') return { value: '[remote "origin"]\n\turl = git@github.com:acme/billing-api.git\n' }
    return { deny: 'missing' }
  })
  on('session.start', async (_$, e) => e)
  on('ui.status', async () => ({ value: undefined }))
  // The engine's own drawing beneath the band: nothing.
  on('ui.render', async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('command.register', async () => ({ value: {} }))
  on('session.root', async () => ({ value: '/work/billing-api' }))
  on('session.id', async () => ({ value: 'sess-1' }))
  on('http.fetch', async (_$, e) => {
    seen.push(e.url)
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(snap) } }
  })
  return clock
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`band shows a teammate's lock on this project and a vote (${surface})`, async ($, on) => {
    const urls: string[] = []
    const clock = world(on, SNAP, urls)
    await $.session.start({ cwd: '/work/billing-api', surface } as never)
    await clock.advance(1) // the first snapshot loads in the background
    expect(urls[0]).toBe('https://hub.example/api/ui?project=billing-api&session=sess-1')
    const ui = await $.ui.mount({ plugin: 'intercom-ui', surface, component: 'AbovePrompt', props: { hasSurvey: false } as never })
    expect(await ui.findAll({ type: 'Text', text: /deploy:billing:prod/ })).toHaveLength(1)
    // A lock on another project stays out of the band.
    expect(await ui.findAll({ type: 'Text', text: /deploy:shop:prod/ })).toHaveLength(0)
    expect(await ui.findAll({ type: 'Button', text: 'yes' })).toHaveLength(1)
  })

  test(`band stays out of the way when nothing concerns this session (${surface})`, async ($, on) => {
    const clock = world(on, { ...SNAP, votes: [], locks: [{ ...SNAP.locks[0]!, holder: 'edvin', mine: true }] })
    await $.session.start({ cwd: '/work/billing-api', surface } as never)
    await clock.advance(1)
    const ui = await $.ui.mount({ plugin: 'intercom-ui', surface, component: 'AbovePrompt', props: { hasSurvey: false } as never })
    expect(await ui.findAll({ type: 'Text', text: /deploy:billing:prod/ })).toHaveLength(0)
  })
}
