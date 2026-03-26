# Railway Deployment Guide

This document collection form app is ready for deployment on Railway.com.

## Prerequisites

- Railway account ([railway.app](https://railway.app))
- OpenRouter API key for AI extraction features
- GitHub repository with this code

## Deployment Steps

### 1. Deploy the repo root on Railway

1. **Create a new project on Railway**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select this repository

2. **Configure the service**
   - Deploy from the repository root
   - Keep the default build settings
   - The repo now includes a root `nixpacks.toml` that:
     - installs `app/` and `backend/`
     - builds `app/`
     - starts `backend/server.js`

3. **Attach persistent storage**
   - Add a Railway volume mounted at `/data`
   - The app now stores uploads and `db.json` in `/data` automatically on Railway
   - Without a volume, uploaded files and saved form data will be lost on redeploy

4. **Add environment variables**
   - Go to your project's "Variables" tab
   - Add `OPENROUTER_API_KEY` with your actual API key
   - Add `DASHBOARD_PASSWORD` with a strong password
   - Add `PORT` = `3001` (Railway may set this automatically)
   - Optional: add `DATA_DIR=/data` explicitly if you want the path to be visible in config
   - Optional: add `SEED_SAMPLE_DATA=true` only for demo environments

5. **Deploy**
   - Click "Deploy" button
   - Railway will build and deploy your backend

### 2. Frontend handling

The backend already serves the built frontend from `app/dist` in production, so a separate frontend service is not required.

1. **Build the frontend**
   ```bash
   cd app
   npm install
   npm run build
   ```

2. **Optional separate frontend**
   - If you prefer a separate frontend service later, deploy `app/dist` to Vercel or Netlify
   - That is optional and not needed for the Railway root deployment

### 3. Backend serves frontend already

The current backend already serves the production frontend from `app/dist`, so no extra server changes are needed for Railway.

## Environment Variables

- `OPENROUTER_API_KEY` - Your OpenRouter API key for AI extraction
- `DASHBOARD_PASSWORD` - Required in production for dashboard access
- `DATA_DIR` - Optional custom data directory. Defaults to `/data` on Railway.
- `SEED_SAMPLE_DATA` - Optional. Set to `true` only if you want demo projects created.
- `PORT` - Port number (default: 3001)

## Railway-Specific Considerations

- Railway provides automatic HTTPS
- Attach a Railway volume so uploaded files and `db.json` survive restarts and redeploys
- Database: Currently uses JSON file storage on the mounted volume; consider Railway PostgreSQL for multi-instance production later

## Troubleshooting

### Build fails
- Make sure Railway is deploying the repository root, not a missing or stale subdirectory
- Check that the root `nixpacks.toml` is present in the deployed commit
- Verify all environment variables are set

### API calls fail
- Ensure `OPENROUTER_API_KEY` is set correctly
- Check Railway logs for error messages

### File upload issues
- Railway's root filesystem is ephemeral. Confirm the service has a volume mounted at `/data`.

## Monitoring

- Check Railway logs for real-time error tracking
- Set up Railway's health checks for monitoring
- Configure alerts for deployment failures
