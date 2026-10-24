import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AccountBase = {
  id: string;
  username: string;
  createdAt: string;
  email?: string;
  skin?: { name: string; imageUrl: string; legacy?: boolean };
};
export type OfflineAccount = AccountBase & { type: 'offline' };
export type MicrosoftAccount = AccountBase & { type: 'microsoft' };
export type LauncherAccount = OfflineAccount | MicrosoftAccount;

type AccountState = {
  accounts: LauncherAccount[];
  activeAccountId: string | null;
  createOfflineAccount: (username: string) => OfflineAccount;
  createMicrosoftAccount: (id: string, username: string) => MicrosoftAccount;
  selectAccount: (id: string) => void;
  updateAccountSkin: (id: string, skin: LauncherAccount['skin'] | null) => void;
  updateAccountEmail: (id: string, email: string | null) => void;
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
      createMicrosoftAccount: (id, username) => {
        const normalizedId = id.trim().toLowerCase();
        const normalizedUsername = username.trim();
        if (!/^[a-f\d]{32}$/.test(normalizedId) || !/^[A-Za-z0-9_]{3,16}$/.test(normalizedUsername)) {
          throw new Error('Microsoft returned an invalid Minecraft profile.');
        }
        const existing = get().accounts.find((account) => account.id === normalizedId);
        if (existing) {
          if (existing.type !== 'microsoft') throw new Error('This Minecraft profile ID is already used by another account.');
          set({ activeAccountId: existing.id });
          return existing;
        }
        const account: MicrosoftAccount = {
          id: normalizedId,
          username: normalizedUsername,
          type: 'microsoft',
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
      updateAccountEmail: (id, email) => set((state) => ({
        accounts: state.accounts.map((account) => account.id === id
          ? { ...account, email: email?.trim().toLowerCase() || undefined }
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
