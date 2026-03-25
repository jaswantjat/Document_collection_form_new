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

3. **Add environment variables**
   - Go to your project's "Variables" tab
   - Add `OPENROUTER_API_KEY` with your actual API key
   - Add `PORT` = `3001` (Railway may set this automatically)

4. **Deploy**
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
- `PORT` - Port number (default: 3001)

## Railway-Specific Considerations

- Railway provides automatic HTTPS
- Persistent disk storage may be needed for file uploads
- Database: Currently uses JSON file storage, consider upgrading to Railway's PostgreSQL for production

## Troubleshooting

### Build fails
- Make sure Railway is deploying the repository root, not a missing or stale subdirectory
- Check that the root `nixpacks.toml` is present in the deployed commit
- Verify all environment variables are set

### API calls fail
- Ensure `OPENROUTER_API_KEY` is set correctly
- Check Railway logs for error messages

### File upload issues
- Railway's filesystem is ephemeral - consider using Railway's volume storage or external storage (S3, etc.)

## Monitoring

- Check Railway logs for real-time error tracking
- Set up Railway's health checks for monitoring
- Configure alerts for deployment failures
