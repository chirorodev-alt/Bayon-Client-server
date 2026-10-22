import { BACKEND_BASE_URL } from './backendConfig';

export type PartnerServer = {
  id: string;
  name: string;
  address: string;
  icon?: string;
  color?: string;
  flag?: string;
  online?: boolean;
  onlinePlayers?: number;
  maxPlayers?: number;
  formattedCount?: string;
  motd?: string;
};

export async function fetchPartnerServers(signal?: AbortSignal): Promise<PartnerServer[]> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/servers`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Servers service returned HTTP ${response.status}.`);
  }

  const data = await response.json();
  if (Array.isArray(data?.servers)) {
    return data.servers;
  }
  return [];
}

