# Releasing Flipper

The game is published at https://slimsomania.github.io/game-flipper/ by GitHub Pages.

## Branches and tags

- `dev`: all work happens here. The harness and agent sessions commit and push to `dev`.
- `main`: stable code. It only changes when the human merges a pull request from `dev`. The "Protect main" ruleset (Settings → Rules) enforces it: no direct pushes, force pushes or deletion; a pull request whose `verify` check passed; merge commits only.
- `v*` tags on `main` (`v1.0.0`, `v1.1.0`, `v1.0.1`): releases. Pushing a tag deploys the game. The "Protect release tags" ruleset stops a published `v*` tag from being moved, deleted or force-pushed; creating a new one is allowed. GitHub has no rule for which branch a tag points at, so the deploy workflow refuses tags that are not on `main`.

## Workflows

| Workflow | Runs on | Does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | pull requests into `main` | `npm run verify` |
| `.github/workflows/deploy.yml` | `v*` tags, or by hand with a tag | checks the tag is on `main`, typecheck, unit tests, build, publishes `dist/` to Pages (about 2 min) |

Pushes to `dev` run nothing on GitHub: the harness runs `npm run verify` locally before every push.

## Steps

1. Human: on GitHub, open a pull request with base `main` and compare `dev`. Wait for the CI check to pass, then merge with **Create a merge commit** (not squash or rebase, so `dev` and `main` keep the same commits).
2. Human: ask an agent session to release.
3. Agent: `git fetch origin`, pick the next version (minor for new features, patch for fixes), and tag the tip of `main`: `git tag -a v1.1.0 origin/main -m "v1.1.0"`, then `git push origin v1.1.0`. Write the release notes from `git log --oneline <previous tag>..v1.1.0`. Publish them as a GitHub Release for that tag (title `Flipsy v1.1.0`, starting with the play link; Releases → Draft a new release, or `gh release create v1.1.0`), so the repo's Releases page and its Latest badge show the version.
4. GitHub runs Deploy. The game is live a few minutes after it turns green.

## Roll back

Actions → Deploy → Run workflow, and enter an older tag such as `v1.0.0`. That version goes live again.

## Rules

- Never push to `main` directly and never move or delete a published tag (both rulesets enforce this).
- A tag that is not on `main` is refused by the deploy workflow.
