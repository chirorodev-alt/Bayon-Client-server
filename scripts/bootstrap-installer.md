# Bayon Client bootstrapper plan

This project already contains a working Electron app and an existing Windows NSIS package. The next practical step is to separate the small bootstrapper from the full launcher payload.

## What stays in this repository
- Current Electron app code in `electron/`, `src/`, `public/`, and `server/`
- Existing `electron-builder` configuration in `package.json`
- The generated installer release files under `release/`
- The bootstrap manifest script at `scripts/generate-bootstrap-manifest.mjs`

## What goes to Render
- Large launcher archives such as `BayonLauncher.zip`
- Hash manifests and release metadata
- Installer assets and static files needed for the download page
- Immutable versioned release files on a public hosting endpoint

## Required Render config
Configure a real Render URL through environment variables before publishing. The release URL hostname must be explicitly allowed in `BAYON_TRUSTED_HOSTS`:

```bash
BAYON_RELEASE_URL=https://<your-render-service>.onrender.com/releases/stable/windows/BayonLauncher.zip
BAYON_TRUSTED_HOSTS=<your-render-service>.onrender.com
BAYON_RELEASE_CHANNEL=stable
BAYON_MINIMUM_LAUNCHER_VERSION=1.0.0
BAYON_PRODUCT_NAME="Bayon Client"
```

Do not hardcode a fake URL. Use your real Render-hosted service URL once it is available.

## First practical implementation
The repository now includes a manifest generator that:
- validates an HTTPS download URL against exact hostnames in `BAYON_TRUSTED_HOSTS`
- accepts a local `.exe` or `.zip` file from the `release/` directory and hashes that same file
- records its actual filename, format, size, and SHA-256
- optionally signs the manifest with an Ed25519 PEM private key

First place the exact payload that will be hosted in `release/`. Then run from the project root, substituting your actual Render hostname and filename:

```bash
npm run generate:bootstrap-manifest -- --file "release/BayonLauncher-1.1.6.zip" --url "https://<your-render-service>.onrender.com/releases/stable/windows/BayonLauncher-1.1.6.zip"
```

For production, generate an Ed25519 key pair, keep the private key offline or in CI secrets, and configure `BAYON_MANIFEST_PRIVATE_KEY` to the private PEM file path. The bootstrapper must embed or securely obtain the matching public key and verify the signature before trusting manifest fields. A SHA-256 checksum alone only detects payload corruption; it does not authenticate the release.

## Expected result
A `release/bootstrap-manifest.json` file is written with metadata for the exact release payload. This script only generates metadata; it does not build the slim bootstrapper or upload files to Render. The installer remains the same app package until the separate bootstrapper is implemented.
