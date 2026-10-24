# Bayon Client

Bayon Client is a premium monochrome Minecraft launcher concept built with React, TypeScript, Vite, Electron, Tailwind CSS, Zustand, and Framer Motion.

## Features

- Compact frameless Electron window with rounded corners, tray controls, and real minimize/maximize behavior
- Fixed sidebar navigation with page routing
- Home, Play, Mods, Skins, and Settings screens
- Dark gaming UI with white-glow premium styling
- Local Minecraft skin PNG upload and texture preview
- Staged launch-preparation progress without starting Minecraft
- Local offline-account creation, selection, and removal
- Live mod catalog search through Modrinth and optional CurseForge APIs
- Discord Rich Presence for Bayon Client activity
- Optional background launch at sign-in and minimize-to-tray behavior
- In-client feedback form for bug reports or positive notes, with optional screenshot upload
- Friends panel integration with a local authenticated backend API
- No fabricated partner-server listings or friend presence
- Fixed application viewport; long pages scroll within their own content area

## Prerequisites

- Node.js 20+
- npm 10+

## Install

```bash
npm install
```

## Run in development

```bash
npm run dev
```

This launches Vite and Electron together so the desktop client loads in a frameless window.

## Local friends API

The Friends panel requests `GET {VITE_API_BASE_URL}/api/friends` and includes same-origin/session cookies. Create `.env.local` from `.env.example` and set the base URL for your local backend. The response contract is:

```json
{
  "friends": [
    {
      "id": "player-123",
      "username": "PlayerName",
      "status": "online",
      "avatarUrl": "https://example.invalid/avatar.png"
    }
  ]
}
```

`status` must be `online`, `offline`, or `in_game`; `avatarUrl` is optional. The UI displays a connection/response error rather than sample entries if the API is unavailable or returns an invalid response. For cookie authentication, configure the local API to allow credentialed requests from the Vite/Electron origin. Configure the hosted API base URL through the build environment when deploying.

Partner servers on the Home page come from the backend directory and show live server status. Administrators can add, edit, and remove partner listings from the private admin panel. Latest News is populated by admin-published posts; View All opens a dedicated page with the full published history, and new posts also appear in the client's notification center.

Use the feedback button in the client title bar to send a bug report or positive feedback to the Bayon team. You may attach one PNG, JPEG, or WebP screenshot up to 3 MB. Feedback is visible only in the authenticated admin panel's Feedback inbox.

## Discord Rich Presence

On the Home page, choose **Discord Rich Presence → Set up**. Create an application named **Bayon Client** in the [Discord Developer Portal](https://discord.com/developers/applications), copy its Application ID, and paste it into the launcher. Alternatively, set `$env:DISCORD_CLIENT_ID = "your-app-id"` in your terminal before launching. The ID is saved in local Electron user settings.

Keep the Discord desktop app running; Bayon Client will show:
- Real-time elapsed session time (e.g., `04:12 elapsed`)
- Active player profile (e.g., `Playing as Player123`)
- Current launcher activity & selected Minecraft version / loader
- Clickable button (`Get Bayon Client`) linking to the project repository
- Rich presence art assets (`bayon_logo` / `minecraft`)

No Discord password, token, or account credentials are ever collected.

## Skin upload

Use **Skins → Upload skin** to select a PNG skin image (64 × 64, or legacy 64 × 32, up to 5 MB). The selected Minecraft texture is mapped onto an interactive 3D player model, including the outer skin layer for modern skins; drag the preview to rotate it. Classic and slim arm proportions are selectable. The selected image is kept in the page session; this does not upload it to a Minecraft account.

## Accounts

Use **Accounts → Create offline account** to make a local profile with a 3–16 character Minecraft-style username. Profiles are stored in local browser storage and can be selected or removed. An offline profile does not verify Microsoft ownership or authenticate to online Minecraft services.

Use **Accounts → Microsoft Minecraft account** to authenticate with Microsoft for Minecraft Java ownership and online servers. To sync Bacoins, use **Connect Bayon account** and sign in with the same Microsoft identity used on the website. Authentication opens Microsoft's sign-in page in your browser; if Microsoft asks for a verification code, enter it there. Bayon does not request or store Microsoft passwords or verification codes. The backend must have `MICROSOFT_CLIENT_ID` configured for sign-in to work.

## Mod catalogs & installation

Use **Mods → Add mod** to search the live Modrinth catalog and install mods directly with a single click:
- **Direct Modrinth Installation**: Clicking **Install Mod** queries the official Modrinth API for the latest compatible release for your chosen loader and game version, downloads the `.jar` package, and saves it into your launcher's local `mods/` directory.
- **Local Mod Management**: Installed mods appear in your Mods list where you can toggle them enabled/disabled (renaming to `.jar.disabled`), remove them from disk, or click **Open mods folder** to inspect them in Windows Explorer.
- **CurseForge Discovery**: CurseForge search additionally requires a CurseForge API key in the Electron process environment (`$env:CURSEFORGE_API_KEY`). Opening a CurseForge result visits its official project page.

## Production build

```bash
npm run build
```

## Notes

- Mod installation connects directly to Modrinth's API to download and manage real .jar mod files in your local userData directory.
- The launch button runs a preparation/progress sequence only. It does not authenticate, download files, or start Minecraft.
- Actual Minecraft authentication, version downloads, and game launching are intentionally kept behind a separate integration layer and are not claimed as implemented.
- Preference settings are stored locally in the browser state layer.
