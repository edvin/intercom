// Deploy guard: a PreToolUse hook sends shell commands that look risky; if a teammate holds a matching lock,
// Claude Code asks the user before running it. Warn-only by design: it never denies, it only makes the user confirm.

import { type Env, type Lock, activeLocks, ago, myProjects, until } from "./lib";

export interface RiskyCommand {
  action: string; // deploy | migrate | release | infra
  env: string | null; // prod | staging | dev | test, when the command says
}

// Tools whose subcommands change running systems. The value lists the risky subcommands.
const TOOLS: Record<string, { action: string; sub: RegExp }> = {
  helm: { action: "deploy", sub: /^(upgrade|install|rollback|uninstall|delete)$/ },
  kubectl: { action: "deploy", sub: /^(apply|create|delete|replace|patch|rollout|scale|set|edit|drain|cordon)$/ },
  flux: { action: "deploy", sub: /^(reconcile|suspend|resume|delete|bootstrap)$/ },
  argocd: { action: "deploy", sub: /^(app)$/ },
  terraform: { action: "infra", sub: /^(apply|destroy|import|taint)$/ },
  tofu: { action: "infra", sub: /^(apply|destroy|import|taint)$/ },
  terragrunt: { action: "infra", sub: /^(apply|destroy|run-all)$/ },
  pulumi: { action: "infra", sub: /^(up|update|destroy)$/ },
  wrangler: { action: "deploy", sub: /^(deploy|publish|rollback|d1|versions)$/ },
  fly: { action: "deploy", sub: /^(deploy|scale|machine|secrets)$/ },
  flyctl: { action: "deploy", sub: /^(deploy|scale|machine|secrets)$/ },
  vercel: { action: "deploy", sub: /^(deploy|--prod|promote|rollback)$/ },
  netlify: { action: "deploy", sub: /^(deploy)$/ },
  kamal: { action: "deploy", sub: /^(deploy|rollback|redeploy|setup)$/ },
  heroku: { action: "deploy", sub: /^(releases:rollback|pg:reset|run)$/ },
  "ansible-playbook": { action: "deploy", sub: /./ },
  cap: { action: "deploy", sub: /deploy/ },
  gcloud: { action: "deploy", sub: /^(app|run|functions|deploy)$/ },
  alembic: { action: "migrate", sub: /^(upgrade|downgrade)$/ },
  flyway: { action: "migrate", sub: /^(migrate|clean|repair|undo)$/ },
  liquibase: { action: "migrate", sub: /^(update|rollback|drop-all)$/ },
  prisma: { action: "migrate", sub: /^(migrate|db)$/ },
};

// Task runners and package scripts: risky when the target names a deploy/migration.
const RUNNERS = /^(make|just|task|npm|pnpm|yarn|bun|npx|rake|bundle|php|python|python3|rails|mix|cargo|gradle|\.\/gradlew|mvn|sbt|dotnet|go|deno|composer)$/;
const RISKY_WORD = /(^|[:._/-])(deploy|deployment|release|rollout|rollback|migrate|migrations?|publish|promote|db:migrate|db:rollback|db:push)($|[:._/-])/i;
const READ_ONLY = /^(cat|less|more|head|tail|grep|egrep|rg|ag|ls|ll|tree|find|fd|echo|printf|wc|diff|bat|code|vim|nvim|vi|nano|open|man|which|type|stat|file|jq|yq|sed|awk|sort|uniq|cut|tr|cd|pwd|test|\[)$/;
const WRAPPERS = /^(sudo|time|nice|nohup|env|exec|command|caffeinate|xargs|watch|timeout)$/;

const ENVS: [RegExp, string][] = [
  [/^(prod|production|prd|live)$/i, "prod"],
  [/^(staging|stage|stg|preprod|pre-prod|uat)$/i, "staging"],
  [/^(dev|development|sandbox)$/i, "dev"],
  [/^(test|testing|qa)$/i, "test"],
];

export function normEnv(word: string): string | null {
  for (const [re, name] of ENVS) if (re.test(word)) return name;
  return null;
}

function detectEnv(command: string): string | null {
  // --env=prod, -e production, ENV=staging, deploy:prod, values-prod.yaml, prod-cluster …
  for (const w of command.replace(/\/dev\/(null|stdout|stderr|tty)\b/g, " ").split(/[\s=:,"'/._-]+/)) {
    const e = normEnv(w);
    if (e) return e;
  }
  return null;
}

/** Does this shell command look like it deploys, migrates or changes infrastructure? Conservative on purpose. */
export function riskyCommand(command: string): RiskyCommand | null {
  const segments = command.split(/&&|\|\||[;|\n]|\$\(|`/);
  for (const seg of segments) {
    const words = seg.trim().split(/\s+/).filter(Boolean);
    while (words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]) || WRAPPERS.test(words[0]))) words.shift();
    if (!words.length) continue;
    const bin = words[0].replace(/^.*\//, "");
    if (READ_ONLY.test(bin) || (bin === "git" && words[1] !== "push")) continue;
    const args = words.slice(1).filter((w) => !w.startsWith("-") || w === "--prod");
    const tool = TOOLS[bin];
    if (tool && args.some((a) => tool.sub.test(a))) return { action: tool.action, env: detectEnv(seg) };
    // ./deploy.sh, scripts/release-prod, bin/migrate
    if (RISKY_WORD.test(bin) && (words[0].includes("/") || /\.(sh|py|rb|js|ts|mjs)$/.test(bin) || bin.startsWith("deploy"))) {
      return { action: actionOf(bin), env: detectEnv(seg) };
    }
    if (RUNNERS.test(bin)) {
      const target = args.slice(0, 3).find((a) => RISKY_WORD.test(a) || /^(migrate|deploy|release|publish)$/i.test(a));
      if (target) return { action: actionOf(target), env: detectEnv(seg) };
    }
  }
  return null;
}

const actionOf = (word: string) => (/migrat|db:/i.test(word) ? "migrate" : /release|publish|promote/i.test(word) ? "release" : "deploy");

/** Locks held by someone else that this command could collide with. */
export function conflicting(locks: Lock[], me: string, project: string | null, command: string, risky: RiskyCommand): Lock[] {
  const words = new Set(command.toLowerCase().split(/[^a-z0-9._-]+/));
  return locks.filter((l) => {
    if (l.holder === me) return false;
    const [, lockProject = l.channel, lockEnv] = l.resource.split(":");
    const sameProject = lockProject === project || l.channel === project || words.has(lockProject);
    if (!sameProject) return false;
    const e = lockEnv ? normEnv(lockEnv) ?? lockEnv : null;
    return !e || !risky.env || e === risky.env;
  });
}

/** Hook JSON for the PreToolUse guard, or null to stay silent. */
/** Prefix a command with this to run it anyway after the user decided to (Codex can't ask; it can only refuse). */
export const OVERRIDE = "INTERCOM_LOCK_OK=1";

export async function guard(env: Env, me: string, project: string | null, command: string, client = "claude"): Promise<object | null> {
  const risky = riskyCommand(command);
  if (!risky) return null;
  if (client === "codex" && command.includes(OVERRIDE)) return null;
  const mine = await myProjects(env, me);
  const current = project && mine.includes(project) ? project : null;
  const locks = await activeLocks(env, me);
  const hits = conflicting(locks, me, current, command, risky);
  if (hits.length) {
    const lines = hits.map((l) => `🔒 ${l.resource} is held by ${l.holder} (since ${ago(l.created_at)}, ${until(l.expires_at)} left)${l.reason ? ` — "${l.reason}"` : ""}`);
    if (client === "codex") {
      // Codex hooks can refuse but not ask: refuse with the reason, and let the user decide to go ahead.
      return {
        systemMessage: `🔒 intercom stopped a ${risky.action}: ${hits.map((l) => `${l.resource} is held by ${l.holder}`).join(", ")}. Tell your agent to go ahead if you still want it.`,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            `Intercom: ${lines.join("; ")}. Don't retry on your own: tell your user who holds the lock and why, and offer to message ${hits[0].holder} on the intercom. ` +
            `Only if your user explicitly says to go ahead anyway, run the same command prefixed with ${OVERRIDE} (e.g. \`${OVERRIDE} ${command.slice(0, 80)}\`).`,
        },
      };
    }
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `Intercom: ${lines.join("; ")}. Run this anyway?`,
        additionalContext:
          `<intercom>This command looks like a ${risky.action}${risky.env ? ` to ${risky.env}` : ""} while a teammate holds a lock:\n${lines.join("\n")}\n` +
          `Your user is being asked to confirm. If they decline, don't retry: offer to message ${hits[0].holder} via the intercom post tool instead.</intercom>`,
      },
    };
  }
  if (!current) return null;
  const held = locks.some((l) => l.holder === me && (l.channel === current || l.resource.split(":")[1] === current));
  if (held) return null;
  const name = `${risky.action}:${current}:${risky.env ?? "<env>"}`;
  return {
    systemMessage: `📻 intercom: no lock held for this ${risky.action} of #${current}${risky.env ? ` (${risky.env})` : ""}; reminded the agent to claim one.`,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: `<intercom>This looks like a ${risky.action} for #${current}${risky.env ? ` (${risky.env})` : ""} and nobody holds a lock for it. If it affects shared or production systems, claim \`${name}\` with the intercom claim tool first, and release it afterwards.</intercom>`,
    },
  };
}
