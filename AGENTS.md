<!-- BEGIN:salesos-release-rules -->
# ⛔ Ship only by merging to `main`

**Never run `vercel --prod`, `vercel deploy --prod`, `vercel promote`,
`vercel alias`, or any other direct production deploy for this app — from any
folder, on any machine.**

Vercel auto-deploys from `main` at `github.com/kroozee2/sales-dashboard`. A CLI
deploy bypasses `main`, which is exactly how this app repeatedly reverted to old
builds: a local checkout that was behind `main` got pushed straight to
production and overwrote newer work.

## Workflow

1. `git fetch origin` and branch from the newest `origin/main`.
2. Make the change. Preserve existing functionality.
3. Run the relevant tests, `npx tsc --noEmit`, and `npm run build`.
4. Fetch `origin/main` again and reconcile if it advanced.
5. Merge to `main`, one feature branch at a time. Vercel deploys from there.
6. Verify the live deployment matches the merged commit.

If the checkout is already dirty, stop and preserve that work rather than
resetting it or mixing it into a new task.

## Canonical checkouts

| Where | Path |
|---|---|
| GitHub (source of truth) | `github.com/kroozee2/sales-dashboard`, branch `main` |
| Mac Mini | `~/Projects/7fc-sales-dashboard-production-live` |
| MacBook | `~/Projects/sales-dashboard` |

**Never develop or deploy from `~/7fc-sales-dashboard` or
`~/Projects/7fc-sales-dashboard`.** Both are stale copies.

## Working alongside another agent

Claude and Jarvis/ChatGPT both ship through `main`. Use separate feature
branches and merge one at a time so neither overwrites the other.

Full detail: `.claude/rules/salesos-source-of-truth.md`
<!-- END:salesos-release-rules -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
