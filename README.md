# 7-Figure CEO SalesOS

This GitHub repository is the shared source of truth for SalesOS development across Jarvis, ChatGPT/Codex, and Claude Code.

## Canonical workflow

- **Production branch:** `main`
- **Feature work:** branch from the latest `origin/main`
- **Deployment:** merge/push through GitHub to the connected Vercel project
- **Do not use:** old chat exports, downloaded ZIPs, stale local folders, or direct production deployments

```bash
git fetch origin
git switch -c feature/your-change origin/main
npm ci
npm test
npm run typecheck
npm run build
```

Read `AGENTS.md` before making or deploying changes. Both Codex/Jarvis and Claude Code load project rules from the repository.

## Local development

```bash
npm ci
npm run dev
```

Open http://localhost:3000.
