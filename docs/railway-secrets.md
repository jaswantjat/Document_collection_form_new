# Railway Secrets

Do not commit Railway credentials or production secrets to this repository, even
while it is private. Removing a secret later does not remove it from git history.

Use the Railway project settings for real values. Keep only placeholder examples in
`backend/.env.example` and `app/.env.example`.

## Required Backend Variables

- `OPENROUTER_API_KEY`
- `DASHBOARD_PASSWORD`

## Optional Backend Variables

- `OPENROUTER_MODEL`
- `ELTEX_DOCFLOW_WEBHOOK_URL`
- `ELTEX_DOCFLOW_WEBHOOK_SECRET`
- `STIRLING_PDF_URL`
- `STIRLING_PDF_API_KEY`
- `AUTOCROPPER_URL`
- `DATA_DIR`
- `SEED_SAMPLE_DATA`
- `TRUST_PROXY`
- `PORT`

## Frontend Variables

Only public `VITE_*` values belong in frontend env files.

- `VITE_FINANCING_URL`

## Railway Credentials

Railway account, project, and API tokens belong in the Railway CLI auth store, the
Railway dashboard, or a CI secret store. They must not be added to `.env`,
`.env.production`, source files, docs, screenshots, or issue comments.

For issue #29 release proof, verify the real Railway staging deployment with:

- staging deployment ID or public staging app URL
- commit SHA under test
- evidence that staging and production use separate persistent storage or volumes
- live staging screenshots or videos for the required acceptance flows

If the Railway CLI says `Unauthorized`, run `railway login` locally and repeat the
verification without printing tokens.
