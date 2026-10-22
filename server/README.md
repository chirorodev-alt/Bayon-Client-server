# Bayon Client Backend Server

A lightweight, production-ready Node.js & Express backend for **Bayon Client** featuring:
- **Friends & Presence API** (`GET /api/friends`, `POST /api/friends`, `PATCH /api/friends/:id/presence`, `DELETE /api/friends/:id`)
- **Authentication & Accounts** (`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`)
- **Bacoins & Cosmetics** (authenticated balances, redeem claims, and server-checked purchases)
- **Health Check** (`GET /api/health`)
- **CORS Configured** for Electron and Vite desktop clients
- **Render Blueprint ready** configured for the **Singapore** region (`singapore`)

---

## Deploy to Render (Singapore)

### Option A: Using Render Blueprints (Recommended)
1. Push your repository to **GitHub**.
2. Go to the [Render Dashboard](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Connect your GitHub repository.
5. Render will automatically detect [`render.yaml`](../render.yaml) at the repository root and configure:
   - **Name**: `bayon-backend`
   - **Region**: `Singapore` (`singapore`)
   - **Root Directory**: `server`
   - **Plan**: `Free`
   - **Start Command**: `npm start`
6. Click **Apply**. Render will build and deploy your service.
7. Copy your assigned service URL (e.g. `https://bayon-backend.onrender.com`).

---

### Option B: Manual Web Service on Render
If you prefer creating a Web Service manually:
1. Go to **New +** → **Web Service**.
2. Connect your repo and fill in:
   - **Name**: `bayon-backend`
   - **Region**: **Singapore (Southeast Asia)**
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
3. Add Environment Variable:
   - `JWT_SECRET`: (Enter a random secret string)
   - `BACOIN_ADMIN_KEY`: (Use a separate random secret; keep it private)
4. Click **Create Web Service**.

---

## Bacoins and redeem codes

Bayon Client and the website now use Microsoft account sign-in for Bacoins. Configure `MICROSOFT_CLIENT_ID` on the backend and register both the hosted store as a Single-page application redirect and Bayon Client as a Mobile and desktop application. For desktop loopback sign-in, add `http://localhost` as the desktop redirect URI; Microsoft ignores the ephemeral port used by the local callback. The desktop performs authorization code with PKCE and does not use a client secret. The same Microsoft identity signs into the app and website; an optional email saved on an offline profile is local contact information only and cannot authenticate or recover the account.

The website and Bayon Client use the same Bayon account and Bacoins balance. No Supabase or email-provider configuration is required for this sign-in flow. The store accepts redeem codes and sells configured cosmetics; card payments are intentionally left for a later setup.

The web store supports Microsoft account sign-in when `MICROSOFT_CLIENT_ID` is configured. Register the exact hosted store origin (for example `https://<your-service-name>.onrender.com/`) as a SPA redirect URI and add a Mobile and desktop application platform with `http://localhost` for Bayon Client. Enable authorization code with PKCE. Set the application/client ID as `MICROSOFT_CLIENT_ID` on the backend. Email addresses saved to offline profiles are not used for sign-in.

### Hosted store and private admin panel

Render creates `BACOIN_ADMIN_KEY` and `ADMIN_PANEL_SECRET` automatically from `render.yaml`. The store lives at `https://<your-service-name>.onrender.com/`. The private admin page path is `/admin-panel-<ADMIN_PANEL_SECRET>`; Render logs print the route on startup. Configure `ADMIN_EMAIL` and `ADMIN_PASSWORD` as private Render environment variables to sign in with email/password. The generated `BACOIN_ADMIN_KEY` remains available as a fallback. Admin APIs require a short-lived admin session, so knowing the route alone does not grant access. Never put admin passwords in source control.

The private admin page supports separate routes under that secret path: `/create-codes`, `/redeem-manager`, `/account`, `/upload-3d-cosmetic`, `/client-updates`, and `/cosmetic` (for example, `/admin-panel-<ADMIN_PANEL_SECRET>/client-updates`). The legacy `/cosmatic` spelling also opens the cosmetics page.

The admin panel can create/delete cosmetics, set Bacoins prices, upload `.glb` 3D previews, generate and disable/re-enable redeem codes, inspect their claim status, and grant Bacoins to accounts. Redeem codes are shown only when generated; the manager does not reveal the plaintext for previously generated codes. Uploaded assets, balances, and adjustment history use the backend's `server/data` directory. Configure persistent storage for that directory on the host before relying on production purchases and uploaded models; ephemeral deployments can lose local files during restarts or redeploys.

### Private Bayon Client updates

Desktop updates use the backend's generic update feed (`/api/client-updates/latest.yml`); they are not published as GitHub releases. After setting a newer version in the root `package.json`, run `npm run dist` and upload the matching `release/Bayon-Client-Setup-<version>.exe` from the private admin page's **Client updates** section. The backend verifies the Windows executable, computes its SHA-512 checksum, publishes the update manifest, and serves the installer to packaged NSIS clients. Do not upload the portable `.exe`; the portable build does not self-update.

The installer and manifest are stored under `server/data/client-updates` by default. On Render, the filesystem is ephemeral unless a persistent disk is attached. Before publishing updates, attach persistent storage and set `CLIENT_UPDATE_STORAGE_DIR` to its mounted directory (for example `/var/data/client-updates`). Set `CLIENT_UPDATE_BASE_VERSION` to the version already installed on users' clients if it differs from `1.0.1`. Each uploaded release must have a version newer than the current release. Users' installed clients check the backend periodically and download updates automatically.

You can generate codes in the private admin panel, or from a trusted administrator machine. The key is read from `BACOIN_ADMIN_KEY`; never put it in the launcher or commit it to source control. Returned plaintext codes are shown once, so save them securely:

```powershell
$headers = @{ 'x-bayon-admin-key' = $env:BACOIN_ADMIN_KEY }
$body = @{ amount = 500; maxClaims = 1; count = 5 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://<your-service-name>.onrender.com/api/bacoins/admin/codes' -Headers $headers -ContentType 'application/json' -Body $body
```

`amount` is the Bacoins each code grants, `maxClaims` limits the total number of accounts that may claim each code, and `count` creates that many separate codes. The database stores only a SHA-256 hash of each code. The backend currently uses its existing JSON file database; deploy it with persistent storage before relying on balances or claims for long-term production use.

## Connecting Bayon Client to Your Backend

Once your Render server is live:

1. Open your project root `.env` or `.env.local`:
   ```env
   VITE_API_BASE_URL=https://<your-service-name>.onrender.com
   ```
2. Rebuild the launcher:
   ```bash
   npm run build
   ```
3. Launch the desktop app:
   ```bash
   npm start
   ```
The Friends panel and presence features in Bayon Client will now automatically communicate with your live server in Singapore!

---

## Running Locally

From the project root:
```bash
npm run server
```
Or for auto-reload during development:
```bash
npm run server:dev
```
Local URLs:
- API Base: `http://localhost:10000`
- Health check: `http://localhost:10000/api/health`
- Friends: `http://localhost:10000/api/friends`

