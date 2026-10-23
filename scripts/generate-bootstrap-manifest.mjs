import fs from 'node:fs';
import path from 'node:path';
import { createHash, sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

function parseArgs(argv) {
  const args = {
    url: process.env.BAYON_RELEASE_URL || '',
    file: '',
    channel: process.env.BAYON_RELEASE_CHANNEL || 'stable',
    minimumLauncherVersion: process.env.BAYON_MINIMUM_LAUNCHER_VERSION || '1.0.0',
    productName: process.env.BAYON_PRODUCT_NAME || packageJson.productName || 'Bayon Client',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--url') args.url = argv[index + 1] || args.url;
    if (value === '--file') args.file = argv[index + 1] || args.file;
    if (value === '--channel') args.channel = argv[index + 1] || args.channel;
    if (value === '--minimum-version') args.minimumLauncherVersion = argv[index + 1] || args.minimumLauncherVersion;
    if (value === '--product-name') args.productName = argv[index + 1] || args.productName;
  }

  return args;
}

function validateHttpsUrl(urlString) {
  if (!urlString) {
    throw new Error('No release URL provided. Set BAYON_RELEASE_URL or pass --url <https://...>.');
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid release URL: ${urlString}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Only HTTPS release URLs are allowed. Received: ${parsed.protocol}`);
  }

  const trustedHosts = (process.env.BAYON_TRUSTED_HOSTS || 'bayon-backend.onrender.com')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const hostMatchesTrusted = trustedHosts.includes(parsed.hostname.toLowerCase());

  if (!hostMatchesTrusted) {
    throw new Error(`Untrusted release host: ${parsed.hostname}. Add the exact hostname to BAYON_TRUSTED_HOSTS.`);
  }

  return parsed.toString();
}

function getReleasePath(file) {
  if (!file) {
    throw new Error('No local release file provided. Pass --file <path-to-payload>.');
  }

  const releasePath = path.resolve(rootDir, file);
  const releaseDir = path.resolve(rootDir, 'release');
  if (releasePath !== releaseDir && !releasePath.startsWith(`${releaseDir}${path.sep}`)) {
    throw new Error('The release file must be inside the project release directory.');
  }

  if (!fs.existsSync(releasePath) || !fs.statSync(releasePath).isFile()) {
    throw new Error(`Release file does not exist or is not a file: ${releasePath}`);
  }

  return releasePath;
}

function inferFormat(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const formats = {
    '.exe': 'exe',
    '.zip': 'zip',
  };
  const format = formats[extension];
  if (!format) {
    throw new Error(`Unsupported release file type: ${extension || '(no extension)'}. Use .exe or .zip.`);
  }

  return format;
}

function getReleaseFilename(filePath) {
  const filename = path.basename(filePath);
  if (!filename || filename === '.' || filename === '..') {
    throw new Error('Release file must have a valid filename.');
  }

  return filename;
}

function sha256(filePath) {
  const hash = createHash('sha256');
  const contents = fs.readFileSync(filePath);
  return hash.update(contents).digest('hex');
}

function buildManifest({ productName, version, channel, minimumLauncherVersion, fileName, format, fileSizeBytes, sha256Hex, downloadUrl, os, arch }) {
  const payload = {
    product: productName,
    version,
    releaseChannel: channel,
    operatingSystem: os,
    architecture: arch,
    fileName,
    downloadUrl,
    fileSizeBytes,
    sha256: sha256Hex,
    minimumLauncherVersion,
    checksumAlgorithm: 'SHA-256',
    releaseDate: new Date().toISOString(),
    updateStrategy: 'bootstrap-download',
    format,
  };

  const privateKeyPath = process.env.BAYON_MANIFEST_PRIVATE_KEY;
  if (privateKeyPath) {
    const privateKey = fs.readFileSync(path.resolve(rootDir, privateKeyPath), 'utf8');
    const signature = sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString('base64');
    return { ...payload, signature, signatureAlgorithm: 'Ed25519' };
  }

  return payload;
}

const args = parseArgs(process.argv.slice(2));
const version = packageJson.version;
const downloadUrl = validateHttpsUrl(args.url);
const releasePath = getReleasePath(args.file);
const stats = fs.statSync(releasePath);
const manifest = buildManifest({
  productName: args.productName,
  version,
  channel: args.channel,
  minimumLauncherVersion: args.minimumLauncherVersion,
  fileName: getReleaseFilename(releasePath),
  format: inferFormat(releasePath),
  fileSizeBytes: stats.size,
  sha256Hex: sha256(releasePath),
  downloadUrl,
  os: 'windows',
  arch: 'x64',
});

const manifestPath = path.join(rootDir, 'release', 'bootstrap-manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Bootstrap manifest written to ${manifestPath}`);
console.log(`Release version: ${version}`);
console.log(`Release file: ${manifest.fileName}`);
console.log(`Download URL: ${downloadUrl}`);
console.log(`Release size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
console.log(`SHA-256: ${manifest.sha256}`);
if (!manifest.signature) {
  console.warn('Manifest is unsigned. Set BAYON_MANIFEST_PRIVATE_KEY to a private Ed25519 PEM key before production release.');
}
