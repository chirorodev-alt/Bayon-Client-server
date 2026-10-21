import { useCallback, useEffect, useState } from 'react';
import { fetchPartnerServers, type PartnerServer } from '../services/serversApi';

type ServersState = {
  servers: PartnerServer[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useServers(): ServersState {
  const [servers, setServers] = useState<PartnerServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((v) => v + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchPartnerServers(controller.signal)
      .then((items) => {
        setServers(items);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setServers([]);
        setError(err instanceof Error ? err.message : 'Unable to load partner servers.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [refreshToken]);

  return { servers, loading, error, refresh };
}

