import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OfflineAccount = {
  id: string;
  username: string;
  type: 'offline';
  createdAt: string;
  skin?: { name: string; imageUrl: string; legacy?: boolean };
};

type AccountState = {
  accounts: OfflineAccount[];
  activeAccountId: string | null;
  createOfflineAccount: (username: string) => OfflineAccount;
  selectAccount: (id: string) => void;
  updateAccountSkin: (id: string, skin: OfflineAccount['skin'] | null) => void;
  removeAccount: (id: string) => void;
};

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountId: null,
      createOfflineAccount: (username) => {
        const normalized = username.trim();
        if (!/^[A-Za-z0-9_]{3,16}$/.test(normalized)) {
          throw new Error('Use 3–16 letters, numbers, or underscores.');
        }
        if (get().accounts.some((account) => account.username.toLowerCase() === normalized.toLowerCase())) {
          throw new Error('An offline account with that username already exists.');
        }

        const account: OfflineAccount = {
          id: crypto.randomUUID(),
          username: normalized,
          type: 'offline',
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ accounts: [...state.accounts, account], activeAccountId: account.id }));
        return account;
      },
      selectAccount: (id) => {
        if (get().accounts.some((account) => account.id === id)) set({ activeAccountId: id });
      },
      updateAccountSkin: (id, skin) => set((state) => ({
        accounts: state.accounts.map((account) => account.id === id
          ? { ...account, skin: skin ?? undefined }
          : account),
      })),
      removeAccount: (id) => set((state) => {
        const accounts = state.accounts.filter((account) => account.id !== id);
        const activeAccountId = state.activeAccountId === id ? accounts[0]?.id ?? null : state.activeAccountId;
        return { accounts, activeAccountId };
      }),
    }),
    { name: 'bayon-client-accounts' },
  ),
);
