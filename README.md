# Document Collection Form

Web application for collecting customer documentation and processing project records for installation workflows.

## Stack

- `app/`: React + TypeScript + Vite frontend
- `backend/`: Node.js + Express API
- `railway.json` + `nixpacks.toml`: Railway deployment configuration

## Local Development

Frontend:

```bash
cd app
npm install
npm run dev
```

Backend:

```bash
cd backend
npm install
npm run dev
```

The backend runs on port `3001` locally and serves the built frontend in production.

## Deployment

The repository is configured for Railway from the repository root.

- Frontend build: `cd app && npm run build`
- Backend start: `cd backend && npm start`

Required environment variables depend on the deployed environment. See [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) for the deployment notes currently used in this project.
