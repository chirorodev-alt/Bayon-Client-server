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

For beta testing in Bayon Client, select an offline profile, open **Bacoins Beta**, and enable beta Bacoins. The client creates/reuses an account based on that offline profile without email verification or a verification code. That beta identity is intended for testing and can be disabled on the server with `BACOIN_BETA_MODE=false`.

### Supabase setup

1. Create a Supabase project and enable email authentication.
2. In **Authentication → SMTP Settings**, configure Brevo as the custom SMTP provider using the SMTP host, port, username, and SMTP key shown in your Brevo SMTP settings. Use Brevo's SMTP credentials here; the Brevo REST API key is not an SMTP password. Supabase's default mail service is restricted to project team addresses and is intended for testing; use custom SMTP for real users. See [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
3. In **Authentication → Emails → Templates**, keep the **Magic Link** and **Confirm signup** templates using `{{ .ConfirmationURL }}` so Supabase sends a clickable verification link. Do not replace it with `{{ .Token }}`; Bayon does not ask users to type a code.
4. In **Authentication → URL Configuration**, add `http://127.0.0.1:*/auth/callback` to the allowed Redirect URLs. Bayon uses a temporary local callback port to receive the verified session. See [Supabase URL Configuration](https://supabase.com/docs/guides/auth/redirect-urls) and [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
5. Set these values in the backend environment (for example, Render):
   - `SUPABASE_URL`: Project URL, such as `https://<project-ref>.supabase.co`.
   - `SUPABASE_ANON_KEY`: Supabase anon/publishable key. Never use the `service_role` key here.

The web store reads the project URL and public anon key from the Bayon backend config endpoint. Keep the Supabase service-role key private and do not put it in the client. Supabase email verification remains enabled for the web store; Bayon Client beta sign-in does not use it.

Google OAuth endpoints remain available as an optional account-linking alternative.
The hosted store is served from the backend root URL. It uses the same verified email identity and Bacoins balance as Bayon Client. The store accepts redeem codes and sells configured cosmetics; card payments are intentionally left for a later setup.

### Hosted store and private admin panel

Render creates `BACOIN_ADMIN_KEY` and `ADMIN_PANEL_SECRET` automatically from `render.yaml`. It enables `BACOIN_BETA_MODE` for this beta. The store lives at `https://<your-service-name>.onrender.com/`. The private admin page path is `/admin-panel-<ADMIN_PANEL_SECRET>`; Render logs print the route on startup. Admin APIs also require a short-lived admin session created by entering `BACOIN_ADMIN_KEY`, so knowing the route alone does not grant access.

In Supabase **Authentication → URL Configuration → Redirect URLs**, allow the store host (for example `https://<your-service-name>.onrender.com/**`). The app no longer needs the local Supabase callback. Keep the email templates on `{{ .ConfirmationURL }}` for verified sign-in links on the web store.

The admin panel can create/delete cosmetics, set Bacoins prices, upload `.glb` 3D previews, and generate redeem codes. Uploaded assets and balances use the backend's `server/data` directory. Configure persistent storage for that directory on the host before relying on production purchases and uploaded models; ephemeral deployments can lose local files during restarts or redeploys.

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

