import { BACKEND_BASE_URL } from './backendConfig';

const TOKEN_KEY = 'bayon-bacoins-token';

export type BacoinsUser = { id: string; username: string; bacoins: number; ownedCosmetics: string[]; equippedCosmetic: string | null };
export type Cosmetic = { id: string; name: string; description: string; category: string; price: number; accent: string };

export function getBacoinsToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearBacoinsToken() {
  localStorage.removeItem(TOKEN_KEY);
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

export async function authenticateBacoins(path: '/api/auth/register' | '/api/auth/login', username: string, password: string) {
  const result = await request<{ token: string; user: BacoinsUser }>(path, {
    method: 'POST', body: JSON.stringify({ username, password }),
  }, false);
  localStorage.setItem(TOKEN_KEY, result.token);
  return result.user;
}

export function fetchBacoinsMe() {
  return request<{ user: BacoinsUser }>('/api/bacoins/me').then((result) => result.user);
}

export function fetchCosmetics() {
  return request<{ cosmetics: Cosmetic[] }>('/api/cosmetics', {}, false).then((result) => result.cosmetics);
}

export function redeemBacoinsCode(code: string) {
  return request<{ user: BacoinsUser; credited: number }>('/api/bacoins/redeem', {
    method: 'POST', body: JSON.stringify({ code }),
  });
}

export function purchaseCosmetic(id: string) {
  return request<{ user: BacoinsUser; cosmetic: Cosmetic }>(`/api/cosmetics/${encodeURIComponent(id)}/purchase`, { method: 'POST' });
}

export function equipCosmetic(id: string | null) {
  return request<{ user: BacoinsUser }>('/api/cosmetics/equip', { method: 'POST', body: JSON.stringify({ id }) });
}
