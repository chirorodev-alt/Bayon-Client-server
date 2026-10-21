import { useCallback, useEffect, useState } from 'react';
import { fetchFriends, addFriend as apiAddFriend, removeFriend as apiRemoveFriend, type Friend } from '../services/friendsApi';

type FriendsState = {
  friends: Friend[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  addFriend: (username: string) => Promise<Friend>;
  removeFriend: (id: string) => Promise<void>;
};

export function useFriends(): FriendsState {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  const addFriend = useCallback(async (username: string) => {
    const newFriend = await apiAddFriend(username);
    setFriends((prev) => {
      const idx = prev.findIndex((f) => f.username.toLowerCase() === newFriend.username.toLowerCase());
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = newFriend;
        return next;
      }
      return [...prev, newFriend];
    });
    return newFriend;
  }, []);

  const removeFriend = useCallback(async (id: string) => {
    await apiRemoveFriend(id);
    setFriends((prev) => prev.filter((f) => f.id !== id));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
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

  return { friends, loading, error, refresh, addFriend, removeFriend };
}
