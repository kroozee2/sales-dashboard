# SalesOS source of truth

The GitHub `main` branch is the single source of truth.

Before coding, fetch `origin` and branch from the newest `origin/main`. Never begin from an old chat export, ZIP, detached worktree, Vercel download, or remembered local copy. If the checkout is already dirty, stop and preserve that work rather than resetting or mixing it into the new task.

Before release, fetch again and reconcile any newer `main` commit. Run the tests, typecheck, and production build. Commit and push the exact reviewed tree to GitHub. Deploy only through the GitHub-connected Vercel project. Never deploy directly from a local or generated folder or force-push `main`.
