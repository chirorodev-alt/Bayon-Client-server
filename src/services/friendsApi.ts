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
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000';
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
