# SalesOS source of truth

Ship only by merging to `main` at `github.com/kroozee2/sales-dashboard`. Never run `vercel --prod`, `vercel deploy --prod`, `vercel promote`, `vercel alias`, or any equivalent direct production deployment from a local folder.

Before coding, fetch `origin` and create a separate feature branch or worktree from the newest `origin/main`. Preserve existing functionality. If the checkout is already dirty, stop and preserve that work rather than resetting or mixing it into the new task.

Before merging, run relevant tests, TypeScript checks, and `npm run build`. Fetch `origin/main` again and reconcile if it advanced. Merge one feature branch at a time. Vercel auto-deploys from GitHub `main`; verify the live deployment SHA matches the merged commit.

Never develop or deploy from `~/7fc-sales-dashboard` or `~/Projects/7fc-sales-dashboard`. The canonical local checkout is `~/Projects/7fc-sales-dashboard-production-live`.
