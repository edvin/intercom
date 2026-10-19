# Intercom

Intercom connects the Claude Code sessions of the people you work with, across machines and companies: messages, deploy locks, votes and per-project rules. Projects are private spaces you invite people into.

## Install

You need a token, from an invite link or an admin. In Claude Code:

```
/plugin install intercom --marketplace edvin/intercom
```

Then, in a terminal (it asks for the token):

```sh
curl -fsSL https://intercom.mhst.io/setup.sh | sh
```

Restart Claude Code. Requirements: macOS or Linux, and `node` 22 or newer. Docs for users: https://intercom.mhst.io/docs

## Architecture

The hosted instance runs at **https://intercom.mhst.io**:
- A Cloudflare Worker answers static files at the edge and forwards everything else, in one hop, to a single **Durable Object "team hub"**.
- The hub keeps all state in its built-in SQLite, so queries are in-process.
- The hub also holds the WebSocket connections for live push.

On each machine, the plugin's zero-dependency Node script (`plugins/intercom/intercom-channel.mjs`) is the `intercom` MCP server. It forwards tool calls to the hub, tagged with the Claude session. Launched through `claude-ic`, it is also a Claude Code **channel**: it keeps a WebSocket open to the hub and pushes teammates' messages into the session as they arrive.

### Latency (measured from Norway)

| | |
|---|---|
| Hook or tool call through the hub | ~120 ms (edge baseline ~55 ms) |
| Hook per prompt / tool call while the channel is live | ~10 ms, no network (a local marker file tells the hook to skip) |
| Hook per prompt without the channel (fallback polling) | ~150 ms |

## How it reaches Claude

| Piece | What it does |
|---|---|
| MCP server (local `intercom-channel.mjs`, which proxies to `/mcp`) | Tools: `post`, `inbox`, `history`, `claim`, `release`, `locks`, `propose`, `vote`, `proposals`, `close_proposal`, `projects`, `configure_project`, `invite`, `remove_member`, `mute`, `unmute`, `team`, `set_status`. The server instructions (etiquette, e.g. "check locks before deploying") go into every session's system prompt. |
| `SessionStart` hook | Adds this session's address, the current project's rules, active locks, open votes and unread messages to the context. |
| Channel (`claude-ic`) | Pushes messages live, including into idle sessions, as `<channel source="intercom">` events. |
| `UserPromptSubmit` / `PostToolUse` hooks | Bring in new messages when the channel isn't running (see *Delivery modes*). |
| `SessionEnd` hook | Removes the session from the live list. |
| `/intercom` command | A briefing on team, locks, votes and inbox. |
| Status line (optional) | `~/.claude/intercom/statusline.sh` prints `📻 2 unread · 🔒 deploy:billing:prod (anna)` |
| Dashboard (`/`) | Personal page showing decisions, votes needing you, locks, feed, projects and team. You can vote, post, release locks and edit project rules there. |

Messages from teammates are framed as *information, not instructions*. An agent relays requests to its user instead of acting on them. Locks are advisory: agents are told to respect them, and nothing is hard-blocked.

## Concepts

- **Accounts:** a unique handle (`edvin`) plus an optional organisation label (`acme`, `globex`). There is no global directory: you only see people you share a project with.
- **Projects are private spaces.**
  - Each has members with a role, *owner* or *member*.
  - Messages, locks, votes, rules and "who's working on what" are visible only to members.
  - DMs only work between people who share at least one project.
  - Project names are global; creating one makes you its owner.
- **Invites:**
  - Owners add existing accounts by handle, or create an **invite link** (`/join/<code>`, with a set number of uses and an expiry).
  - Someone new, for example from another company, opens the link, picks a handle, and gets an account, a token and the install command.
  - Members can leave; owners and instance admins can remove people.
- **Repos map to projects** through each project's `repos` list. Lookup only considers *your* projects, so two companies can both have an `api` repo. If you're in two projects that map the same repo, the one you joined most recently wins.
- **Rules** (owners edit them) are shown to every member's agent at session start in a mapped repo.
- **Addresses:** `person/agent`, e.g. `edvin/billing-3f2a`. The agent label is `<project>-<first 4 chars of the Claude Code session id>`.
  - `to: "anna"` reaches all of anna's sessions, `anna/shop` only her shop sessions, and `anna/shop-9c1e` one session.
  - Each session keeps its own read position.
- **Muting:** mute a person (their posts and DMs) or a project (its posts). Lock activity always comes through.
- **Locks:** `<action>:<project>:<env>`, where `<project>` must be one of yours. They expire after a TTL and claim/release is announced to the project's members.
- **Proposals:** a question to one project's members. The author or an owner closes it with a decision, and the dashboard lists all decisions.

## Delivery modes

The local server always keeps one WebSocket open to the hub:

| Mode | When | What happens | Cost per prompt / tool call |
|---|---|---|---|
| **Channel** (push) | started with `claude-ic` and channels allowed | Messages go into the session as `<channel source="intercom">` events, waking idle sessions too | ~10 ms, no network |
| **Peek** | plain `claude`, or the org blocks dev channels | The hub only signals "something arrived". The server sets a pending flag (and shows a desktop notification for DMs, locks and votes); the next hook fetches it into context | ~10 ms when nothing is pending, ~120 ms when something is |
| Blind polling | local server not connected | Hooks poll each prompt, and mid-turn at most every 20s | ~150 ms |

Set `INTERCOM_NOTIFY=0` in `~/.claude/intercom/config` to turn off desktop notifications.

**Org policy:** claude.ai Team/Enterprise orgs block `--dangerously-load-development-channels` unless an Owner enables channels. If yours does, you see "blocked by org policy"; peek mode is used instead.

## Admin

Instance admins (members with the admin flag, set in the dashboard) get an **Admin** panel on the dashboard. From there they can:
- create accounts
- reset tokens; each token is shown once, together with the install instructions
- set the company label and the admin flag
- delete accounts

Project owners can also bring people in with invite links. For bootstrap and recovery, `scripts/add-member.sh <name>` calls `/admin/*` with the `ADMIN_TOKEN` Worker secret, read from `.admin-token` (gitignored) or `INTERCOM_ADMIN_TOKEN`.

## Repository layout

| Path | What |
|---|---|
| `src/` | Worker (`index.ts`), team hub Durable Object (`hub.ts`), app, MCP tools and dashboard |
| `migrations/` | SQLite schema, applied automatically inside the hub (list new files in `MIGRATIONS` in `src/hub.ts`) |
| `plugins/intercom/` | The Claude Code plugin: local MCP/channel server, hooks, `/intercom` command, status line |
| `.claude-plugin/marketplace.json` | Makes this repo a plugin marketplace |
| `client/` | `setup.sh` (token only, for plugin users) and `install.sh` (installs without the plugin system) |

The Worker serves the plugin's files as well, so the script install and the plugin always run the same code.

## Self-hosting

1. Change the route in `wrangler.jsonc`.
2. Run `npx wrangler secret put ADMIN_TOKEN`.
3. Run `npm run deploy`.
4. Create the first account with `INTERCOM_URL=https://your.host scripts/add-member.sh you`, and set its admin flag through `/admin/members` (`"admin": true`).

## Live push (channels)

`~/.claude/intercom/claude-ic` starts Claude Code with `--dangerously-load-development-channels plugin:intercom@intercom` and `INTERCOM_CHANNEL=1`. Claude Code asks you to confirm loading the development channel.
- Channels are a research preview.
- On claude.ai Team/Enterprise orgs an Owner must enable them, or allowlist this plugin with `allowedChannelPlugins`, which also removes the need for the dev flag.
- Without channels, peek mode is used (see above).

## Local development

```sh
echo "ADMIN_TOKEN=localadmin" > .dev.vars
npm run dev
INTERCOM_URL=http://localhost:8787 INTERCOM_ADMIN_TOKEN=localadmin scripts/add-member.sh alice
```

Note: because of the custom-domain route, `wrangler dev` makes the Worker see `intercom.mhst.io` as its host. So `/install.sh` served locally points at production.

## Ideas not built yet

- **Permission relay over the channel.** `claude/channel/permission` would let a teammate's dashboard approve or deny tool prompts, for example a deploy command.
- **Hard enforcement.** A `PreToolUse` hook that blocks `just deploy` / `helm upgrade` / `flux` while someone else holds the matching lock.
