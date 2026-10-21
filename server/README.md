# Bayon Client Backend Server

A lightweight, production-ready Node.js & Express backend for **Bayon Client** featuring:
- **Friends & Presence API** (`GET /api/friends`, `POST /api/friends`, `PATCH /api/friends/:id/presence`, `DELETE /api/friends/:id`)
- **Authentication & Accounts** (`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`)
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
4. Click **Create Web Service**.

---

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

