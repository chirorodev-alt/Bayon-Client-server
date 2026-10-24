import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModLoader = 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt' | 'Vanilla' | string;

export type VersionProfile = {
  id: string;
  name: string;
  version: string;
  loader: ModLoader;
  background?: string;
};

export const PROFILE_BACKGROUND_PRESETS = [
  { id: 'hero', name: 'Lush Caves & Steve', url: '/minecraft-hero-background.png' },
  { id: 'nether', name: 'Nether Fortress', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80' },
  { id: 'mountains', name: 'Misty Mountains', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80' },
  { id: 'forest', name: 'Midnight Forest', url: 'https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?auto=format&fit=crop&w=1200&q=80' },
  { id: 'aurora', name: 'Northern Aurora', url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=1200&q=80' },
];

type ProfileState = {
  profiles: VersionProfile[];
  activeProfileId: string | null;
  createProfile: (name: string, version: string, loader?: string, background?: string) => VersionProfile;
  updateProfile: (id: string, updates: Partial<Pick<VersionProfile, 'name' | 'version' | 'loader' | 'background'>>) => void;
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
    )).map((item) => ({
      id: item.id,
      name: item.name,
      version: item.version || '1.21.4',
      loader: item.loader || 'Fabric',
      background: item.background || '/minecraft-hero-background.png',
    }));
  } catch { return []; }
}

export const useProfileStore = create<ProfileState>()(persist((set, get) => ({
  profiles: loadUserProfiles(),
  activeProfileId: null,
  createProfile: (name, version, loader = 'Fabric', background = '/minecraft-hero-background.png') => {
    const profile: VersionProfile = {
      id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      version,
      loader,
      background,
    };
    set((state) => ({ profiles: [...state.profiles, profile], activeProfileId: state.activeProfileId ?? profile.id }));
    return profile;
  },
  updateProfile: (id, updates) => set((state) => ({
    profiles: state.profiles.map((profile) => profile.id === id ? { ...profile, ...updates } : profile),
  })),
  removeProfile: (id) => set((state) => {
    const profiles = state.profiles.filter((profile) => profile.id !== id);
    return { profiles, activeProfileId: state.activeProfileId === id ? (profiles[0]?.id ?? null) : state.activeProfileId };
  }),
  selectProfile: (id) => {
    if (get().profiles.some((profile) => profile.id === id)) set({ activeProfileId: id });
  },
}), { name: 'bayon-launch-profiles' }));
