import { useSettingsStore } from '../store/useSettingsStore';

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
  const storeUrl = useSettingsStore.getState().backendUrl?.trim();
  const baseUrl = storeUrl || import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000';
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/servers`, {
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
