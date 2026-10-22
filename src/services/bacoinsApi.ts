import { BACKEND_BASE_URL } from './backendConfig';

const TOKEN_KEY = 'bayon-bacoins-token';
const IDENTITY_KEY = 'bayon-bacoins-identity';

export type BacoinsUser = { id: string; username: string; email?: string; bacoins: number; ownedCosmetics: string[]; equippedCosmetic: string | null };
export type Cosmetic = { id: string; name: string; description: string; category: string; price: number; accent: string };

export function getBacoinsToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearBacoinsToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(IDENTITY_KEY);
  window.dispatchEvent(new Event('bayon:bacoins-auth-changed'));
}

export function getBacoinsIdentity() {
  try { return JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null') as { email?: string; username?: string } | null; }
  catch { return null; }
}

function saveBacoinsIdentity(user: BacoinsUser) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify({ email: user.email, username: user.username }));
  window.dispatchEvent(new Event('bayon:bacoins-auth-changed'));
}

async function request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const token = getBacoinsToken();
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

export function getGoogleClientId() {
  return request<{ clientId: string | null }>('/api/auth/google/config', {}, false).then((result) => result.clientId);
}

type SupabaseAuthConfig = { configured: boolean; url: string | null; anonKey: string | null };

async function getSupabaseAuthConfig() {
  const config = await request<SupabaseAuthConfig>('/api/auth/supabase/config', {}, false);
  if (!config.configured || !config.url || !config.anonKey) {
    throw new Error('Supabase Auth is not configured on the Bayon server yet.');
  }
  return { url: config.url, anonKey: config.anonKey };
}

async function supabaseAuthRequest<T>(path: string, email: string, body: Record<string, unknown>) {
  const config = await getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: config.anonKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, ...body }),
  });
  const result = await response.json().catch(() => ({})) as { message?: string; msg?: string; error_description?: string; error?: string } & T;
  if (!response.ok) throw new Error(result.message || result.msg || result.error_description || result.error || `Supabase request failed (${response.status}).`);
  return { config, result };
}

export async function requestEmailSignInCode(email: string) {
  await supabaseAuthRequest('/otp', email.trim().toLowerCase(), { create_user: true });
  return { success: true, message: 'Check your inbox for the Supabase verification code.' };
}

export async function verifyEmailSignInCode(email: string, code: string, profileId: string, profileUsername: string) {
  const { result: session } = await supabaseAuthRequest<{ access_token?: string; user?: { email?: string } }>('/verify', email.trim().toLowerCase(), { token: code.trim(), type: 'email' });
  if (!session.access_token) throw new Error('Supabase verified the code but did not return a sign-in session.');
  const result = await request<{ token: string; user: BacoinsUser }>('/api/auth/supabase/link', {
    method: 'POST', body: JSON.stringify({ supabaseAccessToken: session.access_token, offlineProfileId: profileId, offlineUsername: profileUsername }),
  }, false);
  localStorage.setItem(TOKEN_KEY, result.token);
  saveBacoinsIdentity(result.user);
  return result.user;
}

export async function authenticateBacoins(path: '/api/auth/register' | '/api/auth/login', username: string, password: string) {
  const result = await request<{ token: string; user: BacoinsUser }>(path, {
    method: 'POST', body: JSON.stringify({ username, password }),
  }, false);
  localStorage.setItem(TOKEN_KEY, result.token);
  saveBacoinsIdentity(result.user);
  return result.user;
}

export async function authenticateWithGoogle(clientId: string, profileId: string, profileUsername: string) {
  if (!window.electronAPI?.startGoogleOAuth) throw new Error('Google linking is available in the Bayon desktop app.');
  const authorization = await window.electronAPI.startGoogleOAuth(clientId);
  const result = await request<{ token: string; user: BacoinsUser }>('/api/auth/google/exchange', {
    method: 'POST', body: JSON.stringify({ ...authorization, offlineProfileId: profileId, offlineUsername: profileUsername }),
  }, false);
  localStorage.setItem(TOKEN_KEY, result.token);
  saveBacoinsIdentity(result.user);
  return result.user;
}

export async function linkGoogleToBayonAccount(clientId: string, profileId: string) {
  if (!window.electronAPI?.startGoogleOAuth) throw new Error('Google linking is available in the Bayon desktop app.');
  const authorization = await window.electronAPI.startGoogleOAuth(clientId);
  return request<{ user: BacoinsUser }>('/api/auth/google/link', {
    method: 'POST', body: JSON.stringify(authorization), headers: { 'X-Bayon-Offline-Profile': profileId },
  }).then((result) => result.user);
}

export function linkOfflineProfile(profileId: string, username: string) {
  return request<{ user: BacoinsUser }>('/api/auth/offline-profile', {
    method: 'POST', body: JSON.stringify({ profileId, username }),
  }).then((result) => result.user);
}

export function fetchBacoinsMe(profileId: string) {
  return request<{ user: BacoinsUser }>('/api/bacoins/me', { headers: { 'X-Bayon-Offline-Profile': profileId } }).then((result) => result.user);
}

export function fetchCosmetics() {
  return request<{ cosmetics: Cosmetic[] }>('/api/cosmetics', {}, false).then((result) => result.cosmetics);
}

export function redeemBacoinsCode(code: string, profileId: string) {
  return request<{ user: BacoinsUser; credited: number }>('/api/bacoins/redeem', {
    method: 'POST', body: JSON.stringify({ code }), headers: { 'X-Bayon-Offline-Profile': profileId },
  });
}

export function purchaseCosmetic(id: string, profileId: string) {
  return request<{ user: BacoinsUser; cosmetic: Cosmetic }>(`/api/cosmetics/${encodeURIComponent(id)}/purchase`, { method: 'POST', headers: { 'X-Bayon-Offline-Profile': profileId } });
}

export function equipCosmetic(id: string | null, profileId: string) {
  return request<{ user: BacoinsUser }>('/api/cosmetics/equip', { method: 'POST', body: JSON.stringify({ id }), headers: { 'X-Bayon-Offline-Profile': profileId } });
}
