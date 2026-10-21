import { useSettingsStore } from '../store/useSettingsStore';

export type FriendPresence = 'online' | 'offline' | 'in_game';

export type Friend = {
  id: string;
  username: string;
  status: FriendPresence;
  avatarUrl?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFriend(value: unknown): value is Friend {
  if (!isRecord(value)) return false;
  const validStatus = value.status === 'online' || value.status === 'offline' || value.status === 'in_game';
  return typeof value.id === 'string'
    && typeof value.username === 'string'
    && validStatus
    && (value.avatarUrl === undefined || typeof value.avatarUrl === 'string');
}

export async function fetchFriends(signal?: AbortSignal): Promise<Friend[]> {
  const storeUrl = useSettingsStore.getState().backendUrl?.trim();
  const baseUrl = storeUrl || import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000';
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/friends`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Friends service returned HTTP ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.friends) || !payload.friends.every(isFriend)) {
    throw new Error('Friends service returned an invalid response. Expected { "friends": [{ "id", "username", "status" }] }.');
  }

  return payload.friends;
}

export async function addFriend(username: string): Promise<Friend> {
  const storeUrl = useSettingsStore.getState().backendUrl?.trim();
  const baseUrl = storeUrl || import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000';
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/friends`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      username: username.trim(),
      status: 'offline',
      avatarUrl: `https://mc-heads.net/avatar/${encodeURIComponent(username.trim())}`,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Failed to add friend (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as { friend?: unknown };
  if (data?.friend && isFriend(data.friend)) {
    return data.friend;
  }
  throw new Error('Invalid response from friends service.');
}

export async function removeFriend(id: string): Promise<void> {
  const storeUrl = useSettingsStore.getState().backendUrl?.trim();
  const baseUrl = storeUrl || import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000';
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/friends/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to remove friend (HTTP ${response.status}).`);
  }
}

