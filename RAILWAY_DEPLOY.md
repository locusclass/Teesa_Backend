# Deploying Teesa Backend to Railway

## 1. Create Railway Project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo** → select your `Teesa_Backend` repository
3. Railway will detect the `Dockerfile` and use it automatically

## 2. Add PostgreSQL

1. In your project → **+ New** → **Database** → **Add PostgreSQL**
2. Railway injects `DATABASE_URL` into your service automatically — no manual copy needed

## 3. Set Environment Variables

In your service → **Variables** tab, add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | *(random 48+ char string — generate below)* |
| `JWT_REFRESH_SECRET` | *(different random 48+ char string)* |
| `CORS_ORIGINS` | `*` *(or your specific domains once live)* |

**Generate secrets** (run locally):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Run twice — once for each secret.

**Optional variables** (add when you have the credentials):

| Variable | Purpose |
|---|---|
| `GOOGLE_MAPS_API_KEY` | Distance calculation (falls back to Haversine without it) |
| `GCS_BUCKET` + `GCP_PROJECT_ID` | File uploads (falls back to local disk without them) |
| `AT_API_KEY` + `AT_USERNAME` | Africa's Talking SMS (logs OTPs to console without it) |
| `SMS_PROVIDER` | Set to `africas_talking` when AT keys are added |

> **Do NOT set `PORT`** — Railway injects it automatically.

## 4. Deploy

Railway deploys automatically on every push to your connected branch. The first deploy will:
1. Build the Docker image (`prisma generate` + `tsc`)
2. Run `prisma migrate deploy` (creates all tables)
3. Start `node dist/server.js`

Watch the deploy logs in Railway's dashboard.

## 5. Seed the Database (first time only)

After the first successful deploy, open a **Railway shell** for your service:

```bash
# In Railway dashboard: service → ... → Open Shell
node -e "require('./dist/db/seed.js')"
```

Or run it via Railway CLI:
```bash
railway run npm run db:seed
```

This creates the default admin, test users, transport categories, and pricing rules.

## 6. Verify

Your API will be live at:
```
https://<your-project>.up.railway.app/health
https://<your-project>.up.railway.app/docs
```

The `/health` endpoint returns `{"status":"ok"}` when everything is running.

## 7. Connect Flutter Apps

Update your Flutter apps' `API_BASE_URL`:
```
https://<your-project>.up.railway.app/api/v1
```

Pass it at build time:
```bash
flutter build apk --dart-define=API_BASE_URL=https://<your-project>.up.railway.app/api/v1
flutter run --dart-define=API_BASE_URL=https://<your-project>.up.railway.app/api/v1
```

## 8. Custom Domain (optional)

In Railway: service → **Settings** → **Domains** → **+ Custom Domain**

After adding your domain, update `CORS_ORIGINS` to include it:
```
https://yourdomain.com,https://admin.yourdomain.com
```

## Scaling

Railway runs a single instance by default. If you need horizontal scaling:
1. Add Railway Redis plugin → `REDIS_URL` is injected automatically
2. Install `@socket.io/redis-adapter` and wire it up in `socketServer.ts`
3. Increase Railway's instance count in **Settings → Scaling**

## Useful Railway CLI Commands

```bash
# Install CLI
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# View logs
railway logs

# Run a one-off command (e.g. seed)
railway run npm run db:seed

# Open a shell
railway shell

# Check service status
railway status
```
