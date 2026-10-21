import { useCallback, useEffect, useState } from 'react';
import { fetchFriends, type Friend } from '../services/friendsApi';

type FriendsState = {
  friends: Friend[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useFriends(): FriendsState {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchFriends(controller.signal)
      .then((items) => {
        setFriends(items);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setFriends([]);
        setError(cause instanceof Error ? cause.message : 'Unable to load friends.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [refreshToken]);

  return { friends, loading, error, refresh };
}
