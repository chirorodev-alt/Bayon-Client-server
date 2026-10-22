import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type VersionProfile = { id: string; name: string; version: string; loader: 'Fabric' };

type ProfileState = {
  profiles: VersionProfile[];
  activeProfileId: string | null;
  createProfile: (name: string, version: string) => VersionProfile;
  updateProfile: (id: string, updates: Partial<Pick<VersionProfile, 'name' | 'version'>>) => void;
  removeProfile: (id: string) => void;
  selectProfile: (id: string) => void;
};

function loadUserProfiles(): VersionProfile[] {
  try {
    const saved = localStorage.getItem('bayon-version-profiles');
    if (!saved) return [];
    localStorage.removeItem('bayon-version-profiles');
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is VersionProfile => Boolean(
      item && typeof item.id === 'string' && item.id !== 'default' &&
      typeof item.name === 'string' && !/^demo(?:\s|$)/i.test(item.name) &&
      typeof item.version === 'string'
    )).map((item) => ({ id: item.id, name: item.name, version: '26.3', loader: 'Fabric' }));
  } catch { return []; }
}

export const useProfileStore = create<ProfileState>()(persist((set, get) => ({
  profiles: loadUserProfiles(),
  activeProfileId: null,
  createProfile: (name, version) => {
    const profile = { id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, version, loader: 'Fabric' as const };
    set((state) => ({ profiles: [...state.profiles, profile], activeProfileId: state.activeProfileId ?? profile.id }));
    return profile;
  },
  updateProfile: (id, updates) => set((state) => ({ profiles: state.profiles.map((profile) => profile.id === id ? { ...profile, ...updates } : profile) })),
  removeProfile: (id) => set((state) => {
    const profiles = state.profiles.filter((profile) => profile.id !== id);
    return { profiles, activeProfileId: state.activeProfileId === id ? (profiles[0]?.id ?? null) : state.activeProfileId };
  }),
  selectProfile: (id) => {
    if (get().profiles.some((profile) => profile.id === id)) set({ activeProfileId: id });
  },
}), { name: 'bayon-launch-profiles' }));
