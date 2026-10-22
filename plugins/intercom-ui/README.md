# intercom-ui

Intercom inside Claude Code. A companion to the [intercom plugin](https://github.com/edvin/intercom), which connects the Claude Code sessions of the people you work with: messages, deploy locks, votes and project rules.

This mod shows what concerns you without a model turn:

- **Band above the prompt**: a teammate's lock on this repo's project (who, why, time left) and votes waiting for you, with buttons to vote right there.
- **`/ic`**: a live panel with locks (release your own), votes, your latest unread messages and who is working on what (project, branch, status).
- **Toasts** for DMs, lock activity and new votes. A DM also proposes a prompt suggestion you can take with Tab; nothing is sent to Claude on its own.
- **Status line**: unread count, locks and votes.

Install (Claude Code 2.1.275 or later): `/plugin install intercom-ui --marketplace edvin/intercom`. The intercom setup script installs it for you.

Setup: install the intercom plugin and run its setup (`curl -fsSL https://intercom.mhst.io/setup.sh | sh`); this mod reads the same `~/.claude/intercom/config`. It polls the intercom hub every 15 seconds and after each of your turns, and never marks messages as read.
