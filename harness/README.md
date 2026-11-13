# Flipper agent harness

The harness lets a series of Claude Code sessions build Flipper one feature at a time without a human in the loop. It stops where your judgement matters: after planning, and whenever a milestone is complete.

It follows the pattern Anthropic describes in [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents). A planning session expands the design into a detailed feature list. Every later session starts fresh: it reads the notes and the git history to get its bearings, works on exactly one feature, verifies it end to end, and leaves a clean, committed state for the next session. On top of that pattern:

- a separate **reviewer** session checks each feature before it counts as done;
- a **maintainer** session cleans up every few features;
- the harness **enforces the rules itself** between sessions instead of trusting each agent to follow them.

## How it works

```
                docs/GAME_DESIGN.md (you)
                          │
                    ┌─────▼─────┐
                    │  planner  │  writes harness/state/feature_list.json
                    └─────┬─────┘  ── run stops: you review the plan
                          │
        ┌─────────────────▼──────────────────┐
        │ builder: one feature               │◄─────────────┐
        │ implement → test → snap → commit   │              │ fail: review_feedback
        └─────────────────┬──────────────────┘              │
             harness gate: npm run verify                   │
                          │ needs_review                    │
                    ┌─────▼─────┐                           │
                    │ reviewer  │───────────────────────────┘
                    └─────┬─────┘
                          │ done
          every 8 done features: maintainer (cleanup, no behavior change)
                          │
          milestone complete ── run stops: you play it
```

Each session is a fresh `claude -p` process with no memory of earlier sessions. Everything it knows comes from these files:

| File | Purpose | Written by |
| --- | --- | --- |
| `docs/GAME_DESIGN.md` | What to build | You |
| `CLAUDE.md` | Rules for every session (Claude Code loads it automatically) | You |
| `harness/prompts/*.md` | The procedure for each role | You |
| `harness/state/feature_list.json` | The plan: every feature, its acceptance criteria and status | The planner creates it; builders and reviewers change statuses; the harness counts attempts |
| `harness/state/progress.md` | Append-only session log, read at the start of every session | Every session, plus a `[harness]` line per session |
| `harness/state/run_state.json` | Harness bookkeeping: session counter, last gate result | The harness only |
| git history | One commit per unit of work | Agents and the harness |

### Roles

| Role | Runs when | Does | May change |
| --- | --- | --- | --- |
| planner | there is no plan yet, or you pass `--plan` | turns the design into features with acceptance criteria, grouped into milestones | the feature list, the progress log, `docs/ARCHITECTURE.md` |
| builder | the next `todo` feature whose dependencies are done | implements it with tests, checks it visually, commits, marks it `needs_review` | code, tests, docs, and its feature's `status` and `notes` |
| reviewer | a feature is `needs_review` | verifies it independently: passes it (`done`) or sends it back (`todo` with `review_feedback`) | its feature's `status`, `notes` and `review_feedback`, and the progress log |
| maintainer | every `maintenanceEvery` completed features | behavior-preserving cleanup and doc updates | code, tests, docs |

A feature moves `todo → needs_review → done`, or back to `todo` with feedback. After `maxAttemptsPerFeature` builder attempts, the harness marks it `blocked` and continues with features that don't depend on it.

### Guard rails (enforced by the harness, not just asked for in prompts)

After every session the harness:

1. Commits anything left uncommitted as WIP, so no work is lost.
2. Stops the run if git history was rewritten.
3. Restores protected files: harness code, prompts and config, `CLAUDE.md`, `docs/GAME_DESIGN.md`, `.claude/`, `.github/`. Reviewers may only touch the two state files; the planner may also edit `docs/ARCHITECTURE.md`.
4. Restores the package.json scripts that make up the gate (`verify`, `test` and so on), so an agent can't loosen them.
5. Keeps `progress.md` append-only.
6. Checks `feature_list.json` field by field. A session may only change what its role allows, and only for its own feature; anything else is reverted, and the next session is told what was corrected.
7. After builder and maintainer sessions, runs the gate itself: `npm run format`, then `npm run verify`. If it fails, the feature goes back to `todo` with the output as feedback, and the next session is told the build is red.
8. Counts attempts, and stops the run after `maxConsecutiveFailures` sessions in a row without progress.

Claude Code's own permission rules (`harness/claude-settings.json`) are a first line of defense. Agents can edit files in the repo and run npm, node, git (read, add, commit, restore) and common shell tools. `git push`, `reset`, `rebase`, `checkout`, `curl`, and edits to protected files are denied. Anything not on the allow list is refused automatically, because sessions run with `--permission-prompts none` and nobody is there to approve a prompt.

Treat this as guard rails, not a security sandbox: agents can run Node scripts on your machine. For strong isolation, run the harness in a container, a VM, or a separate Windows user account.

## Running it

```bash
npm run agents -- --smoke     # once: check headless Claude Code works and the permission rules load
npm run agents -- --plan      # planner session (requires "status: ready" in docs/GAME_DESIGN.md)
npm run agents                # build: builder ⇄ reviewer until a milestone completes
npm run agents:status         # progress at any time
```

| Flag | Effect |
| --- | --- |
| `--plan` | Run the planner: the first plan, or extend the plan after you change the design doc |
| `--once` | Run a single session, then stop |
| `--max-sessions <n>` | Session limit for this run (default from the config) |
| `--feature <id>` | Build (or review) this feature next |
| `--no-review` | Builders mark features `done` directly: faster, but nothing double-checks them |
| `--no-milestone-stop` | Keep going when a milestone completes |
| `--model <name>` | Use this model for every role: `sonnet`, `opus`, `fable`, or a full model name |
| `--dry-run` | Show the next session and its full prompt without running it |
| `--smoke` | Quick check of headless Claude Code and the permission rules |

To stop a run, press Ctrl+C: the current session is stopped and its work committed as WIP. Or create a file named `harness/STOP` to stop after the current session finishes; delete it before the next run.

The working tree must be clean when a run starts, so every change can be traced to a session. Commit your own edits first.

### Typical workflow

1. Write `docs/GAME_DESIGN.md`, set `status: ready`, and commit.
2. Run `npm run agents -- --plan`. Read `harness/state/feature_list.json`: are the M1 features right? Edit freely, check with `npm run agents:check`, and commit.
3. Run `npm run agents`. It runs until M1 is complete or a limit is reached.
4. Play it with `npm run dev`. Change the design doc if needed, commit, and run `npm run agents -- --plan` to add features. Or edit the plan directly.
5. Run `npm run agents` again for the next milestone.

To send a finished feature back, set its `status` to `todo` and write what's wrong in `review_feedback`. To unblock a `blocked` feature, clarify the feature or the design, then set `status` to `todo` and `attempts` to `0`.

## Configuration: `harness/config.json`

| Key | Default | Meaning |
| --- | --- | --- |
| `models.<role>` | `null` | Model per role; `null` uses your Claude Code default |
| `effort.<role>` | `null` | Effort per role (`low`, `medium`, `high`, `xhigh`, `max`); `null` uses the default |
| `permissionMode` | `acceptEdits` | Claude Code permission mode for sessions |
| `review` | `true` | Use reviewer sessions |
| `stopAtMilestones` | `true` | Pause the run when a milestone completes |
| `maintenanceEvery` | `8` | Run a maintainer session after this many newly completed features (0 = never) |
| `maxSessions` | `20` | Sessions per run |
| `maxAttemptsPerFeature` | `3` | Builder attempts before a feature is blocked |
| `maxConsecutiveFailures` | `3` | Stop after this many sessions in a row without progress |
| `sessionTimeoutMinutes` | `75` | Hard limit per session |
| `gateTimeoutMinutes` | `20` | Limit for the harness's own `npm run verify` |
| `maxBudgetUsdPerSession` | `null` | Passed to `claude --max-budget-usd` when set (mostly useful with an API key) |
| `pauseAtUsagePercent` | `85` | If the last session started with the 5-hour (or weekly) usage at or above this %, wait for the reset before the next session instead of letting the limit cut it off midway; `null` = never wait early |
| `usageLimitWaitMinutes` | `30` | How long to wait after a usage limit when no reset time is reported |
| `maxUsageLimitWaits` | `16` | Give up after this many usage-limit waits in a row |
| `pauseBetweenSessionsSeconds` | `5` | Pause between sessions |

## Usage limits and cost

Sessions run on whatever account Claude Code is signed into. With a Claude subscription they count against its usage limits, the same limits your own interactive use draws from. Claude Code reports the current usage at the start of every session, and the harness prints it ("5-hour window 36% · week 5%"). When usage is high (`pauseAtUsagePercent`) or a session hits the limit, the harness waits for the reset and carries on by itself. If the reset is more than 12 hours away (a weekly limit), it stops instead; run it again later. If `ANTHROPIC_API_KEY` is set in the environment, sessions are billed to that key instead, and the harness warns about this when it starts.

The dollar figure after each session is Claude Code's estimate of what the session would cost at API prices. On a subscription it is not billed; it is still a useful measure of how expensive each session was.

To get more done per usage window:

- keep features small (the planner is told to);
- give builders a lighter model, e.g. set `models.builder` to `"sonnet"` while keeping reviews on a stronger one;
- turn off review (`--no-review`) for low-risk stretches.

## Logs and debugging

- `harness/logs/<session>.jsonl`: the full event stream of each session (every message and tool call).
- `harness/logs/ledger.jsonl`: one line per session with role, feature, outcome, duration and cost.
- `harness/state/progress.md`: what each agent says it did, plus the harness's line for each session.
- Claude Code saves each session under its name (e.g. `flipper-s012-builder-F012`). Open one with `claude --resume` to see exactly what happened.
- `npm run agents -- --dry-run` prints the exact prompt the next session would get.

### Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Logs contain `Ignoring … permissions.allow entries from .claude/settings.json: this workspace has not been trusted` | Harmless: sessions get their permissions from `harness/claude-settings.json`. To silence it, run `claude` once from `C:\Projects\Game-flipper` (capital C) and accept the trust prompt. |
| Every Vitest test fails with "Vitest failed to find the current suite" | Vitest was started from a `c:\` (lowercase) path. Use `npm test`, which starts it from the canonical path. |
| `The working tree has uncommitted changes` | The harness needs a clean tree to attribute changes. Commit or stash your edits. |
| `Another harness run is active` | A run is still going, or one crashed. If no harness is running, delete `harness/.lock`. |
| Sessions keep failing the same feature | Read its `review_feedback` and the latest `progress.md` entries; clarify the feature or the design doc, then reset `status`/`attempts`. |

## Changing the harness

The prompts in `harness/prompts/` are plain Markdown with `{{PLACEHOLDERS}}` that `harness/run.ts` fills in. Improving them is the most effective way to change how the agents behave. The rules for picking the next action and guarding the feature list live in `harness/lib/features.ts`, with tests in `tests/harness/`. Agents can't change any of this; you can, interactively, and commit it.
