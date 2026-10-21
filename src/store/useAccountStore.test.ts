// Runtime validation coverage for local offline-account management.
import { beforeEach, describe, expect, it } from 'vitest';
import { useAccountStore } from './useAccountStore';

describe('offline account management', () => {
  beforeEach(() => {
    useAccountStore.setState({ accounts: [], activeAccountId: null });
  });

  it('creates a trimmed account and selects it as active', () => {
    const account = useAccountStore.getState().createOfflineAccount('  Bayon_User  ');

    expect(account.username).toBe('Bayon_User');
    expect(useAccountStore.getState().accounts).toEqual([account]);
    expect(useAccountStore.getState().activeAccountId).toBe(account.id);
  });

  it('rejects invalid and duplicate usernames without changing accounts', () => {
    const create = useAccountStore.getState().createOfflineAccount;
    create('Player_1');

    expect(() => create('ab')).toThrow('Use 3–16 letters, numbers, or underscores.');
    expect(() => create('player_1')).toThrow('An offline account with that username already exists.');
    expect(useAccountStore.getState().accounts).toHaveLength(1);
  });

  it('switches active accounts and selects a remaining account when removing the active one', () => {
    const store = useAccountStore.getState();
    const first = store.createOfflineAccount('FirstPlayer');
    const second = useAccountStore.getState().createOfflineAccount('SecondPlayer');

    useAccountStore.getState().selectAccount(first.id);
    expect(useAccountStore.getState().activeAccountId).toBe(first.id);

    useAccountStore.getState().removeAccount(first.id);
    expect(useAccountStore.getState().accounts).toEqual([second]);
    expect(useAccountStore.getState().activeAccountId).toBe(second.id);
  });
});
