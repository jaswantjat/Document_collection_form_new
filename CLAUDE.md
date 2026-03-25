# Eltex Document Collection Form

A document collection system for solar installations with region-specific workflows (Catalonia, Madrid, Valencia).

## Project Structure

- `app/` - React frontend (Vite + TypeScript)
- `backend/` - Express API server with AI extraction
- `scripts/` - Python scripts for document stamping

## Development

```bash
# Frontend
cd app && npm run dev

# Backend
cd backend && npm run dev
```

## gstack

This project uses [gstack](https://github.com/garrytan/gstack) - Garry Tan's Claude Code skills collection.

### Available Skills

- `/office-hours` - Product discovery and requirements gathering
- `/plan-ceo-review` - CEO-level product review
- `/plan-eng-review` - Engineering architecture review
- `/plan-design-review` - Design quality audit
- `/design-consultation` - Design system building
- `/review` - Code review with auto-fix
- `/investigate` - Root cause debugging
- `/design-review` - Design fixes with atomic commits
- `/qa` - Browser-based QA testing
- `/qa-only` - Bug reporting without code changes
- `/cso` - Security audit (OWASP + STRIDE)
- `/ship` - Release automation
- `/land-and-deploy` - Merge and deploy with verification
- `/canary` - Post-deploy monitoring
- `/benchmark` - Performance testing
- `/document-release` - Update project docs
- `/retro` - Team retrospectives
- `/browse` - Real browser automation
- `/setup-browser-cookies` - Import cookies for authenticated testing
- `/autoplan` - Automated CEO → design → eng review
- `/codex` - Second opinion from OpenAI Codex
- `/careful` - Safety guardrails for destructive commands
- `/freeze` - Edit lock to one directory
- `/guard` - Full safety mode
- `/unfreeze` - Remove edit lock
- `/setup-deploy` - Deploy configuration
- `/gstack-upgrade` - Update gstack to latest

### Important

- Use `/browse` from gstack for all web browsing
- Never use `mcp__claude-in-chrome__*` tools
- If skills aren't working, run `cd .claude/skills/gstack && ./setup`
