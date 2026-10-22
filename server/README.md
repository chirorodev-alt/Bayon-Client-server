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

To connect an offline Minecraft profile, select it in **Accounts**, open the **Sign in Email** dropdown in the title bar, enter an email address, and request a verification code. Supabase Auth sends and verifies the OTP; Bayon's backend validates the resulting Supabase session before linking the selected profile. Bacoins balances and cosmetic purchases remain stored on the Bayon backend.

### Supabase setup

1. Create a Supabase project and enable email authentication.
2. In **Authentication → SMTP Settings**, configure Brevo as the custom SMTP provider using the SMTP host, port, username, and SMTP key shown in your Brevo SMTP settings. Use Brevo's SMTP credentials here; the Brevo REST API key is not an SMTP password. Supabase's default mail service is restricted to project team addresses and is intended for testing; use custom SMTP for real users. See [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
3. In **Authentication → Email Templates**, set the sign-in template to include `{{ .Token }}` so it delivers an OTP that users can type into the client. The client accepts the configured 6–8 digit code. See [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
4. Set these values in the backend environment (for example, Render):
   - `SUPABASE_URL`: Project URL, such as `https://<project-ref>.supabase.co`.
   - `SUPABASE_ANON_KEY`: Supabase anon/publishable key. Never use the `service_role` key here.

The launcher reads the project URL and public anon key from the Bayon backend config endpoint. Keep the Supabase service-role key private and do not put it in the client. Without both settings, email sign-in reports that Supabase is not configured.

Google OAuth endpoints remain available as an optional alternative. The app's Bacoins sign-in uses Supabase email OTP.
The Store currently accepts redeem codes and sells the configured cosmetics. Payment processing is not enabled.

Create codes from a trusted administrator machine. The key is read from `BACOIN_ADMIN_KEY`; never put it in the launcher or commit it to source control. Returned plaintext codes are shown once, so save them securely:

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

