import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Radio,
  FileImage,
  FolderOpen,
  Globe,
  HardDrive,
  ImagePlus,
  KeyRound,
  Layers3,
  Minus,
  Monitor,
  MoonStar,
  Play,
  Plus,
  Search,
  ShoppingCart,
  Settings,
  Shirt,
  Square,
  Trash2,
  UserRound,
  UsersRound,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useFriends } from './hooks/useFriends';
import { useServers } from './hooks/useServers';
import { searchModCatalog, type ModCatalogResult, type ModCatalogSource } from './services/modCatalog';
import { useAccountStore } from './store/useAccountStore';
import { useSettingsStore } from './store/useSettingsStore';
import type { DiscordPresenceStatus, InstalledMod } from './types/electron';

const SkinModelPreview = lazy(() => import('./components/SkinModelPreview').then((module) => ({ default: module.SkinModelPreview })));

type WindowState = 'maximized' | 'restored';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

type SkinItem = {
  id: number;
  name: string;
  type: 'Default' | 'Custom';
  accent: string;
  imageUrl?: string;
};

const navItems: NavItem[] = [
  { to: '/home', label: 'Play', icon: Play },
  { to: '/profiles', label: 'Profiles', icon: UserRound },
  { to: '/accounts', label: 'Accounts', icon: UsersRound },
  { to: '/store', label: 'Store', icon: ShoppingCart },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/mods', label: 'Mods', icon: Layers3 },
  { to: '/skins', label: 'Skins', icon: Shirt },
];

const skinGallery: SkinItem[] = [
  { id: 1, name: 'Default', type: 'Default', accent: 'from-zinc-200 to-zinc-500' },
  { id: 2, name: 'Volcanic', type: 'Custom', accent: 'from-zinc-400 to-stone-600' },
  { id: 3, name: 'Nightfall', type: 'Custom', accent: 'from-neutral-300 to-slate-600' },
  { id: 4, name: 'Ashen', type: 'Custom', accent: 'from-white to-neutral-400' },
];

const versions = ['1.21.1', '1.20.6', '1.19.4', '1.18.2', '1.17.1'];

function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}

function AppShell() {
  const [windowState, setWindowState] = useState<WindowState>('restored');
  const location = useLocation();
  const activeAccount = useAccountStore((state) => state.accounts.find((account) => account.id === state.activeAccountId));
  const discordPresence = useSettingsStore((state) => state.discordPresence);

  useEffect(() => {
    const api = (window as Window & { electronAPI?: { onWindowStateChange: (cb: (state: WindowState) => void) => void } }).electronAPI;
    api?.onWindowStateChange((state) => setWindowState(state));
  }, []);

  useEffect(() => {
    if (discordPresence) {
      void window.electronAPI?.updateDiscordActivity({
        page: location.pathname === '/' ? '/home' : location.pathname,
        username: activeAccount?.username,
        buttonLabel: 'Bayon Client',
        buttonUrl: 'https://github.com',
      });
    }
  }, [location.pathname, activeAccount?.username, discordPresence]);

  return (
    <div className="app-shell bg-[#080a0d] text-white selection:bg-white/20">
      <div className="app-frame border border-white/10 bg-[#080b0f]">
        <TitleBar windowState={windowState} />
        <div className="app-body">
          <Sidebar />
          <main className="app-main min-w-0">
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<Navigate to="/home" replace />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/play" element={<PlayPage />} />
                <Route path="/mods" element={<ModsPage />} />
                <Route path="/skins" element={<SkinsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/profiles" element={<PlaceholderPage title="Profiles" description="Manage your Minecraft versions, loaders, and launch configurations." />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/store" element={<PlaceholderPage title="Store" description="Cosmetics and profile upgrades are coming soon." />} />
              </Routes>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}

function TitleBar({ windowState }: { windowState: WindowState }) {
  const data = (window as Window & { electronAPI?: { minimize: () => void; maximize: () => void; close: () => void } }).electronAPI;
  const [accountOpen, setAccountOpen] = useState(false);
  const [editionOpen, setEditionOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const activeAccount = useAccountStore((state) => state.accounts.find((account) => account.id === state.activeAccountId));

  return (
    <div className="title-bar">
      <div className="title-brand">
        <LogoMark />
        <div>
          <div className="title-wordmark">BAYON CLIENT</div>
          <div className="title-tagline">PLAY / CUSTOMIZE / BE DIFFERENT</div>
        </div>
      </div>

      <div className="title-actions">
        <div className="title-dropdown-wrap">
          <button type="button" className="title-select" onClick={() => setAccountOpen(!accountOpen)}>
            <div className="avatar-mini">{activeAccount?.username.slice(0, 1).toUpperCase() ?? 'B'}</div>
            <span className="title-select-copy"><strong>{activeAccount?.username ?? 'No account'}</strong><small>{activeAccount ? 'Offline account' : 'Not signed in'}</small></span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {accountOpen && <div className="title-popover"><strong>{activeAccount?.username ?? 'No account selected'}</strong><span>{activeAccount ? 'Offline account' : 'Create an offline account to continue'}</span><NavLink to="/accounts" onClick={() => setAccountOpen(false)}>Manage accounts</NavLink></div>}
        </div>
        <div className="title-dropdown-wrap">
          <button type="button" className="title-select edition-select" onClick={() => setEditionOpen(!editionOpen)}>
            <span className="edition-cube">â–§</span>
            <span className="title-select-copy"><strong>Minecraft</strong><small>Java Edition</small></span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {editionOpen && <div className="title-popover"><strong>Game edition</strong><span>Java Edition</span><button type="button" onClick={() => setEditionOpen(false)}>Selected</button></div>}
        </div>
        <div className="title-dropdown-wrap">
          <button type="button" onClick={() => setNotificationOpen(!notificationOpen)} className="window-control" aria-label="Notifications"><Bell className="h-4 w-4" /></button>
          {notificationOpen && <div className="title-popover notification-popover"><strong>Notifications</strong><span>Youâ€™re all caught up.</span></div>}
        </div>
        <div className="window-controls">
          <button type="button" onClick={() => data?.minimize?.()} className="window-control" aria-label="Minimize"><Minus className="h-4 w-4" /></button>
          <button type="button" onClick={() => data?.maximize?.()} className="window-control" aria-label={windowState === 'maximized' ? 'Restore' : 'Maximize'}>{windowState === 'maximized' ? <Square className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}</button>
          <button type="button" onClick={() => data?.close?.()} className="window-control close-control" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  const activeAccount = useAccountStore((state) => state.accounts.find((account) => account.id === state.activeAccountId));
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {navItems.map(({ to, label, icon: Icon }, index) => (
          <div key={to} className={index === 6 ? 'sidebar-library' : ''}>
          <NavLink
            to={to}
            className={({ isActive }) =>
              ['sidebar-item', isActive ? 'sidebar-item-active' : ''].join(' ')
            }
          >
            {() => (
              <>
                <Icon className="h-[18px] w-[18px]" />
                <span>{label}</span>
              </>
            )}
          </NavLink>
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-profile">
          <div className="avatar-large">B</div>
          <div><strong>{activeAccount?.username ?? 'Local Player'}</strong><small>{activeAccount ? 'Offline account' : 'No account selected'}</small></div>
        </div>
        <div className="client-version">
          <LogoMark />
          <span><strong>BAYON CLIENT</strong><small>v1.0.0</small></span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </aside>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const friendsState = useFriends();
  const serversState = useServers();
  const activeAccount = useAccountStore((state) => state.accounts.find((account) => account.id === state.activeAccountId));
  const [selectedVersion, setSelectedVersion] = useState('1.21.1');
  const [selectedLoader, setSelectedLoader] = useState('Fabric');
  const [profileMenu, setProfileMenu] = useState(false);
  const [loaderMenu, setLoaderMenu] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);
  const [launchStatus, setLaunchStatus] = useState('Ready');
  const [launching, setLaunching] = useState(false);
  const [newsFilter, setNewsFilter] = useState('All');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [friendAdding, setFriendAdding] = useState(false);
  const [friendAddError, setFriendAddError] = useState<string | null>(null);
  const settings = useSettingsStore();

  const handleAddFriendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = friendSearchInput.trim();
    if (!name) return;
    setFriendAdding(true);
    setFriendAddError(null);
    try {
      await friendsState.addFriend(name);
      setFriendSearchInput('');
      setShowAddFriend(false);
    } catch (err) {
      setFriendAddError(err instanceof Error ? err.message : 'Failed to add friend.');
    } finally {
      setFriendAdding(false);
    }
  };
  const startLaunchProcess = async () => {
    if (launching) return;
    setLaunching(true);
    setLaunchProgress(5);
    setLaunchStatus('Initialising launchâ€¦');
    void window.electronAPI?.updateDiscordActivity({
      state: `Launching ${selectedLoader} ${selectedVersion}`,
      version: selectedVersion,
      loader: selectedLoader,
    });

    const unsubscribe = window.electronAPI?.onLaunchProgress?.((data) => {
      setLaunchProgress(data.progress);
      setLaunchStatus(data.status);
      if (data.progress === 0 || data.progress === 100) {
        setLaunching(false);
        void window.electronAPI?.updateDiscordActivity({
          state: data.progress === 100 ? `Playing ${selectedVersion}` : undefined,
          version: selectedVersion,
          loader: selectedLoader,
        });
      }
    });

    try {
      await window.electronAPI?.launchMinecraft({
        version: selectedVersion,
        loader: selectedLoader,
        username: activeAccount?.username ?? 'Player',
        memory: settings.selectedRam ?? 4,
      });
    } catch (err) {
      setLaunchProgress(0);
      setLaunchStatus(`Launch failed: ${(err as Error).message}`);
      setLaunching(false);
    } finally {
      unsubscribe?.();
    }
  };
  useEffect(() => undefined, []);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }} className="dashboard-layout">
      <section className="dashboard-main">
        <div className="dashboard-hero">
          <div className="hero-overlay" />
          <div className="hero-copy">
            <div className="eyebrow">{activeAccount ? 'OFFLINE PROFILE' : 'WELCOME BACK,'}</div>
            <h1>{activeAccount?.username ?? 'Welcome back'}</h1>
            <p className="hero-motto">Explore. Build. Survive.</p>
            <p className="hero-caption">The best Minecraft launcher for your journey.</p>
            <button type="button" className="change-skin-button" onClick={() => navigate('/skins')}><Shirt className="h-4 w-4" /> Change Skin <ChevronRight className="h-4 w-4" /></button>
            <div className="play-control-wrap">
              <button type="button" onClick={startLaunchProcess} className="launch-button" disabled={launching}>
                {launching ? <span className="launch-spinner" /> : <Play className="h-6 w-6 fill-current" />}
                <span><strong>{launching ? `PREPARING ${launchProgress}%` : 'LAUNCH GAME'}</strong><small>{selectedVersion} - {selectedLoader}</small></span>
              </button>
              <button type="button" onClick={() => setLoaderMenu(!loaderMenu)} className="launch-caret" aria-label="Select loader"><ChevronDown className="h-5 w-5" /></button>
              {loaderMenu && <div className="hero-dropdown loader-dropdown">{['Vanilla', 'Forge', 'Fabric', 'Quilt'].map((loader) => <button type="button" key={loader} onClick={() => { setSelectedLoader(loader); setLoaderMenu(false); }}>{loader}</button>)}</div>}
            </div>
            <div className="hero-status">
              <span>{launchStatus === 'Ready' ? 'Ready to prepare â€” launching the game is not connected.' : launchStatus}</span>
              <button type="button" onClick={() => navigate('/play')}>Launch settings <ChevronRight className="h-3 w-3" /></button>
            </div>
            {launchProgress > 0 && <div className="home-launch-progress" role="progressbar" aria-valuenow={launchProgress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${launchProgress}%` }} /></div>}
          </div>
          <div className="dashboard-avatar" aria-hidden="true"><div className="pixel-head" /><div className="pixel-body">B</div><div className="pixel-legs" /></div>
        </div>

        <div className="quick-settings">
          <div className="quick-setting">
            <span className="quick-setting-icon minecraft-grass">â–§</span>
            <div><small>Minecraft Version</small><strong>{selectedVersion}</strong></div>
            <select aria-label="Minecraft version" value={selectedVersion} onChange={(event) => setSelectedVersion(event.target.value)}>{['1.21.10', '1.21.1', '1.20.6', '1.19.4'].map((version) => <option key={version}>{version}</option>)}</select>
            <ChevronDown className="quick-chevron h-4 w-4" />
          </div>
          <div className="quick-setting profile-setting">
            <div className="quick-setting-icon profile-silhouette"><UserRound className="h-5 w-5" /></div>
            <div><small>Active Profile</small><strong>Default</strong></div>
            <button type="button" onClick={() => setProfileMenu(!profileMenu)} aria-label="Select profile"><ChevronDown className="h-4 w-4" /></button>
            {profileMenu && <div className="hero-dropdown profile-dropdown"><button type="button" onClick={() => setProfileMenu(false)}>Default profile</button><button type="button" onClick={() => { setProfileMenu(false); navigate('/profiles'); }}>Manage profiles</button></div>}
          </div>
          <div className="quick-setting loader-setting">
            <div className="quick-setting-icon loader-puzzle">âœ¦</div>
            <div><small>{selectedLoader}</small><strong>Mod Loader</strong></div>
            <ChevronDown className="quick-chevron h-4 w-4" />
          </div>
          <button type="button" className="add-profile" onClick={() => navigate('/profiles')}><span>+</span> Add Profile</button>
        </div>

        <section className="news-section">
          <div className="section-heading"><h2><span className="news-icon">â–¤</span> Latest News</h2><button type="button" onClick={() => setNewsFilter(newsFilter === 'All' ? 'Updates' : 'All')}>View {newsFilter === 'All' ? 'All' : 'Updates'} <ChevronRight className="h-3.5 w-3.5" /></button></div>
          <div className="news-grid">
            <article className="news-card news-world">
              <div className="news-art"><span>UPDATE</span></div>
              <div className="news-copy"><h3>Minecraft 1.21.10 Released!</h3><p>The latest update brings new features, bug fixes and performance improvements.</p><footer><span>Oct 6, 2025</span><i /> <span>12.4k views</span><ChevronRight className="ml-auto h-4 w-4" /></footer></div>
            </article>
            <article className="news-card news-void">
              <div className="news-art"><span>NEWS</span></div>
              <div className="news-copy"><h3>Bayon Client v1.0.0 Is Here!</h3><p>A brand new launcher experience with better performance and more features.</p><footer><span>Oct 4, 2025</span><i /> <span>8.7k views</span><ChevronRight className="ml-auto h-4 w-4" /></footer></div>
            </article>
          </div>
        </section>
      </section>

      <aside className="dashboard-rail">
        <section className="rail-panel discord-panel">
          <DiscordPresenceCard />
        </section>
        <button type="button" className="rail-panel store-panel" onClick={() => navigate('/store')}><ShoppingCart className="h-6 w-6" /><span><strong>Store</strong><small>Cosmetics, Ranks &amp; More</small></span><ChevronRight className="ml-auto h-4 w-4" /></button>
        <section className="rail-panel servers-panel">
          <div className="rail-heading"><h2>Partner Servers</h2></div>
          {serversState.loading ? (
            <div className="rail-empty-state"><strong>Loading serversâ€¦</strong><span>Fetching live partner directory.</span></div>
          ) : serversState.error ? (
            <div className="rail-empty-state">
              <strong>Servers unavailable</strong>
              <span>{serversState.error}</span>
              <button type="button" onClick={serversState.refresh}>Retry</button>
            </div>
          ) : serversState.servers.length === 0 ? (
            <div className="rail-empty-state"><strong>No servers listed</strong><span>Partner servers will appear here.</span></div>
          ) : (
            serversState.servers.map((server) => (
              <div className="server-row" key={server.id} title={`${server.name} â€” ${server.address}`}>
                <div className={`server-icon ${server.color || 'server-blue'}`}>
                  {server.icon && (server.icon.startsWith('data:') || server.icon.startsWith('http')) ? (
                    <img src={server.icon} alt={server.name} className="h-full w-full rounded-md object-contain" />
                  ) : (
                    server.icon || server.name.charAt(0)
                  )}
                </div>
                <div className="server-copy">
                  <strong>{server.name}</strong>
                  <small>{server.flag ? `${server.flag} â€¢ ${server.address}` : server.address}</small>
                </div>
                <div className="server-count">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <i style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: server.online ? '#4ade80' : '#ef4444',
                    }} />
                    {server.formattedCount || `${server.onlinePlayers ?? 0}`}
                  </span>
                </div>
              </div>
            ))
          )}
        </section>
        <section className="rail-panel friends-panel">
          <div className="rail-heading">
            <h2><UsersRound className="h-3.5 w-3.5" /> Friends</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setShowAddFriend((v) => !v);
                  setFriendAddError(null);
                }}
                className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/70 hover:border-white/25 hover:text-white"
                title="Add friend"
              >
                {showAddFriend ? 'Cancel' : '+ Add'}
              </button>
              <button type="button" onClick={() => navigate('/accounts')}>
                View All <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {showAddFriend && (
            <form onSubmit={handleAddFriendSubmit} className="mb-2 flex flex-col gap-1.5 rounded-lg border border-white/10 bg-[#121a24] p-2">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="Minecraft usernameâ€¦"
                  value={friendSearchInput}
                  onChange={(e) => {
                    setFriendSearchInput(e.target.value);
                    setFriendAddError(null);
                  }}
                  className="w-full rounded border border-white/15 bg-[#0d141b] px-2 py-1 text-[11px] text-white outline-none focus:border-white/40"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={friendAdding || !friendSearchInput.trim()}
                  className="rounded bg-white px-2 py-1 text-[10px] font-semibold text-black hover:bg-white/90 disabled:opacity-40"
                >
                  {friendAdding ? 'â€¦' : 'Add'}
                </button>
              </div>
              {friendAddError && <span className="text-[9px] text-red-400">{friendAddError}</span>}
            </form>
          )}

          {friendsState.loading ? (
            <div className="rail-empty-state"><strong>Loading friendsâ€¦</strong><span>Checking the local friends service.</span></div>
          ) : friendsState.error ? (
            <div className="rail-empty-state">
              <strong>Friends service unavailable</strong>
              <span>{friendsState.error}</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={friendsState.refresh}>Retry</button>
                <button type="button" onClick={() => navigate('/settings')}>Settings</button>
              </div>
            </div>
          ) : friendsState.friends.length === 0 ? (
            <div className="rail-empty-state">
              <strong>No friends yet</strong>
              <span>Add friends with the search button above.</span>
              <button type="button" onClick={() => setShowAddFriend(true)}>+ Add Friend</button>
            </div>
          ) : (
            friendsState.friends.slice(0, 5).map((friend) => (
              <div className="friend-row group relative" key={friend.id}>
                {friend.avatarUrl ? <img className="friend-avatar" src={friend.avatarUrl} alt="" /> : <div className="friend-avatar">{friend.username.slice(0, 1).toUpperCase()}</div>}
                <div className="friend-copy"><strong>{friend.username}</strong><small className={friend.status !== 'offline' ? 'friend-online' : ''}><i />{friend.status === 'in_game' ? 'In Game' : friend.status === 'online' ? 'Online' : 'Offline'}</small></div>
                <button
                  type="button"
                  onClick={() => void friendsState.removeFriend(friend.id)}
                  className="ml-auto opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 text-xs px-1 transition"
                  title="Remove friend"
                >
                  Ã—
                </button>
              </div>
            ))
          )}
        </section>
      </aside>
    </motion.div>
  );
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="page-scroll p-6"><GlassCard className="placeholder-panel"><div className="placeholder-logo"><LogoMark /></div><PageHeader title={title} subtitle={description} /><p className="placeholder-note">This area is not connected to an external service yet.</p></GlassCard></motion.div>;
}

function DiscordPresenceCard() {
  const [status, setStatus] = useState<DiscordPresenceStatus>({
    state: 'connected',
    message: 'Bayon Client activity is visible on Discord.',
    configured: true,
  });
  const settings = useSettingsStore();

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setStatus({ state: 'error', message: 'Discord Rich Presence requires the desktop app.', configured: false });
      return;
    }
    const unsubscribe = api.onDiscordPresenceStatus(setStatus);
    api.getDiscordPresenceStatus().then(setStatus).catch((cause: unknown) => {
      setStatus({
        state: 'error',
        message: cause instanceof Error ? cause.message : 'Could not read Discord Rich Presence status.',
        configured: false,
      });
    });
    return unsubscribe;
  }, []);

  const togglePresence = async (enabled: boolean) => {
    settings.setDiscordPresence(enabled);
    if (!window.electronAPI) return;
    try {
      if (enabled) {
        setStatus(await window.electronAPI.reconnectDiscordPresence());
      } else {
        setStatus(await window.electronAPI.disableDiscordPresence());
      }
    } catch {
      // Ignored
    }
  };

  return (
    <>
      <div className="discord-icon"><Radio className="h-5 w-5" /></div>
      <div className="rail-grow discord-presence-copy">
        <strong>Discord Rich Presence</strong>
        <small title={status.message} className={`discord-presence-state discord-state-${status.state}`}>
          {!settings.discordPresence
            ? 'Turned off'
            : status.state === 'connected'
            ? 'Activity is active'
            : status.state === 'connecting'
            ? 'Connecting to Discordâ€¦'
            : status.state === 'discord-not-running'
            ? 'Discord is not connected'
            : status.state === 'error'
            ? (status.message || 'Needs attention')
            : 'Turned off'}
        </small>
      </div>
      <Toggle checked={settings.discordPresence} onChange={togglePresence} />
    </>
  );
}

function AccountsPage() {
  const accounts = useAccountStore((state) => state.accounts);
  const activeAccountId = useAccountStore((state) => state.activeAccountId);
  const createOfflineAccount = useAccountStore((state) => state.createOfflineAccount);
  const selectAccount = useAccountStore((state) => state.selectAccount);
  const removeAccount = useAccountStore((state) => state.removeAccount);
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      createOfflineAccount(username);
      setUsername('');
      setCreateOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create offline account.');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="page-scroll p-6">
      <div className="account-page">
        <div className="account-page-heading">
          <PageHeader title="Accounts" subtitle="Create a local offline profile now. Microsoft sign-in is not available yet." />
          <button type="button" className="launch-process-button" onClick={() => { setError(''); setCreateOpen(true); }}><Plus className="h-4 w-4" /> Create offline account</button>
        </div>
        <div className="account-type-grid">
          <GlassCard className="account-type-card account-offline-card">
            <div className="account-type-icon"><UserRound className="h-5 w-5" /></div>
            <div><strong>Offline account</strong><p>Works locally in Bayon Client. No Microsoft sign-in required.</p></div>
            <button type="button" onClick={() => { setError(''); setCreateOpen(true); }}>Create</button>
          </GlassCard>
          <GlassCard className="account-type-card account-microsoft-card">
            <div className="account-type-icon"><KeyRound className="h-5 w-5" /></div>
            <div><strong>Microsoft account</strong><p>Microsoft / Xbox authentication has not been implemented yet.</p></div>
            <button type="button" disabled aria-disabled="true">Coming later</button>
          </GlassCard>
        </div>
        <GlassCard className="account-list-card">
          <div className="account-list-heading"><div><h2>Your accounts</h2><p>{accounts.length} offline {accounts.length === 1 ? 'profile' : 'profiles'} saved on this device</p></div></div>
          {accounts.length === 0 ? (
            <div className="account-empty"><UserRound className="h-6 w-6" /><strong>No accounts yet</strong><span>Create an offline account to get started. It will be saved on this device.</span><button type="button" onClick={() => setCreateOpen(true)}>Create offline account</button></div>
          ) : (
            <div className="account-list">{accounts.map((account) => (
              <div className="account-row" key={account.id}>
                <div className="avatar-large">{account.username.slice(0, 1).toUpperCase()}</div>
                <div className="account-row-copy"><strong>{account.username}</strong><small>Offline profile Â· created {new Date(account.createdAt).toLocaleDateString()}</small></div>
                {activeAccountId === account.id ? <span className="account-active-badge">Active</span> : <button type="button" className="account-select-button" onClick={() => selectAccount(account.id)}>Use account</button>}
                <button type="button" className="account-remove-button" onClick={() => setConfirmRemove(account.id)} aria-label={`Remove ${account.username}`}>Remove</button>
              </div>
            ))}</div>
          )}
        </GlassCard>
      </div>
      {createOpen && (
        <Modal title="Create offline account" onClose={() => setCreateOpen(false)}>
          <form className="offline-account-form" onSubmit={submit}>
            <p>This creates a local launcher profile only. It does not sign in to Microsoft or Minecraft services.</p>
            <label htmlFor="offline-username">Minecraft username</label>
            <input id="offline-username" value={username} onChange={(event) => setUsername(event.target.value)} autoFocus minLength={3} maxLength={16} pattern="[A-Za-z0-9_]{3,16}" placeholder="YourPlayerName" />
            <small>3â€“16 letters, numbers, or underscores.</small>
            {error && <p className="mod-catalog-error" role="alert">{error}</p>}
            <div className="offline-form-actions"><button type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button type="submit">Create account</button></div>
          </form>
        </Modal>
      )}
      {confirmRemove && (
        <Modal title="Remove offline account?" onClose={() => setConfirmRemove(null)}>
          <div className="offline-account-form">
            <p>This only removes the local profile from Bayon Client. This action cannot be undone.</p>
            <div className="offline-form-actions"><button type="button" onClick={() => setConfirmRemove(null)}>Cancel</button><button type="button" className="remove-confirm" onClick={() => { removeAccount(confirmRemove); setConfirmRemove(null); }}>Remove account</button></div>
          </div>
        </Modal>
      )}
    </motion.div>
  );
}

/* Existing launcher pages remain available from the sidebar and keep their local demo interactions. */

function PlayPage() {
  const [memory, setMemory] = useState(8);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Ready to prepare launch options.');
  const [launching, setLaunching] = useState(false);
  const settings = useSettingsStore();
  const activeAccount = useAccountStore((state) => state.accounts.find((a) => a.id === state.activeAccountId));

  const handleLaunchDemo = async () => {
    if (launching) return;
    setLaunching(true);
    setProgress(5);
    setStatus('Initialising launchâ€¦');

    const unsubscribe = window.electronAPI?.onLaunchProgress?.((data) => {
      setProgress(data.progress);
      setStatus(data.status);
      if (data.progress === 0 || data.progress === 100) {
        setLaunching(false);
      }
    });

    try {
      await window.electronAPI?.launchMinecraft({
        version: settings.defaultVersion ?? '1.21.1',
        loader: 'Fabric',
        username: activeAccount?.username ?? 'Player',
        memory: memory,
      });
    } catch (err) {
      setProgress(0);
      setStatus(`Launch failed: ${(err as Error).message}`);
      setLaunching(false);
    } finally {
      unsubscribe?.();
    }
  };
  useEffect(() => undefined, []);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="page-scroll p-5">
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <GlassCard className="p-5">
          <div className="flex items-center justify-between"> 
            <PageHeader title="Play" subtitle="Launch Minecraft with your preferred profile" />
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">Java Edition</div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <Label>Version</Label>
              <Select value={settings.defaultVersion} onChange={settings.setDefaultVersion} options={versions} />
            </div>
            <div>
              <Label>Build</Label>
              <div className="flex gap-2 rounded-xl border border-white/10 bg-[#121212] p-1">
                <button type="button" className="flex-1 rounded-lg bg-white/8 px-3 py-2 text-sm text-white/90">Release</button>
                <button type="button" className="flex-1 rounded-lg px-3 py-2 text-sm text-white/50">Snapshot</button>
              </div>
            </div>
            <div>
              <Label>Game Directory</Label>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#121212] px-3 py-2">
                <FolderOpen className="h-4 w-4 text-white/50" />
                <span className="truncate text-sm text-white/80">C:/Games/Bayon Client</span>
              </div>
            </div>
            <div>
              <Label>Java Executable</Label>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#121212] px-3 py-2">
                <HardDrive className="h-4 w-4 text-white/50" />
                <span className="truncate text-sm text-white/80">{settings.javaPath}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm text-white/70"><span>Memory Allocation</span><span>{memory} GB</span></div>
              <input type="range" min={4} max={16} step={1} value={memory} onChange={(e) => setMemory(Number(e.target.value))} className="slider w-full" />
            </div>
            <div>
              <Label>Resolution</Label>
              <Select value={settings.resolution} onChange={settings.setResolution} options={['1920x1080', '2560x1440', '3840x2160']} />
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <Label>FPS Cap</Label>
              <Select value={String(settings.fpsLimit)} onChange={(value) => settings.setFpsLimit(Number(value))} options={['60', '120', '144', '240']} />
            </div>
            <div>
              <Label>Launch Arguments</Label>
              <input value={settings.customArgs} onChange={(e) => settings.setCustomArgs(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#121212] px-3 py-2.5 text-sm text-white/80 outline-none transition focus:border-white/20" />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button type="button" className="rounded-xl border border-white/10 bg-[#0f0f0f] px-4 py-2 text-sm text-white/70 transition hover:bg-white/5">Cancel</button>
            <button type="button" onClick={handleLaunchDemo} disabled={launching} className="launch-process-button">
              {launching && <span className="launch-spinner" />}
              {launching ? `Preparing ${progress}%` : 'Prepare Launch'}
            </button>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="mb-4 flex items-center justify-between text-white/80"><span className="font-medium">Launch Status</span><span className="text-xs uppercase tracking-[0.18em] text-white/45">Prepare only</span></div>
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-4">
            <div className="mb-2 flex items-center justify-between text-sm text-white/70">
              <span>Selected version</span>
              <span>{settings.defaultVersion}</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm text-white/70">
              <span>Java</span>
              <span>21</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm text-white/70">
              <span>Memory</span>
              <span>{memory} GB</span>
            </div>
            <div className="mt-4">
              <ProgressBar value={progress} />
            </div>
            <div className="mt-3 text-sm text-white/60">{status}</div>
          </div>
        </GlassCard>
      </div>
    </motion.div>
  );
}

function ModsPage() {
  const [mods, setMods] = useState<InstalledMod[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [addModOpen, setAddModOpen] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.getInstalledMods) {
      window.electronAPI.getInstalledMods().then(setMods).catch(() => {});
    }
  }, []);

  const categories = useMemo(() => ['All', ...new Set(mods.map((mod) => mod.category || 'Utility'))], [mods]);
  const filteredMods = mods.filter((mod) => (category === 'All' || mod.category === category) && `${mod.name} ${mod.description}`.toLowerCase().includes(search.toLowerCase()));

  const toggleMod = async (id: string, currentEnabled: boolean) => {
    if (window.electronAPI?.toggleMod) {
      try {
        const updated = await window.electronAPI.toggleMod(id, !currentEnabled);
        setMods(updated);
      } catch {
        setMods((current) => current.map((mod) => (mod.id === id ? { ...mod, enabled: !currentEnabled } : mod)));
      }
    } else {
      setMods((current) => current.map((mod) => (mod.id === id ? { ...mod, enabled: !currentEnabled } : mod)));
    }
  };

  const removeMod = async () => {
    if (removeId === null) return;
    if (window.electronAPI?.uninstallMod) {
      try {
        const updated = await window.electronAPI.uninstallMod(removeId);
        setMods(updated);
      } catch {
        setMods((current) => current.filter((mod) => mod.id !== removeId));
      }
    } else {
      setMods((current) => current.filter((mod) => mod.id !== removeId));
    }
    setRemoveId(null);
  };

  const openFolder = () => {
    void window.electronAPI?.openModsFolder();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="page-scroll p-5">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <PageHeader title="Mods" subtitle="Manage performance and gameplay tweaks" />
          <div className="flex items-center gap-3">
            <button type="button" onClick={openFolder} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white/80 transition hover:bg-white/8">
              <FolderOpen className="h-4 w-4" /> Open mods folder
            </button>
            <PrimaryButton onClick={() => setAddModOpen(true)}> <Plus className="h-4 w-4" /> Add mod </PrimaryButton>
          </div>
        </div>

        <GlassCard className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchInput value={search} onChange={setSearch} placeholder="Search mods" />
            <div className="flex flex-wrap gap-2">
              {categories.map((name) => (
                <button key={name} type="button" onClick={() => setCategory(name)} className={['rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition', category === name ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 bg-[#111111] text-white/55'].join(' ')}>{name}</button>
              ))}
            </div>
          </div>
        </GlassCard>

        {filteredMods.length === 0 ? (
          <EmptyState title="No mods installed" text="Click 'Add mod' to search and install mods directly from Modrinth." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredMods.map((mod) => (
              <GlassCard key={mod.id} className="overflow-hidden p-0">
                <div className="flex h-24 items-center justify-between border-b border-white/8 bg-gradient-to-br from-white/10 to-white/2 px-5">
                  <div className="flex items-center gap-3">
                    {mod.iconUrl ? (
                      <img src={mod.iconUrl} alt="" className="h-12 w-12 rounded-xl border border-white/10 object-cover shadow" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                        <Layers3 className="h-6 w-6 text-white/70" />
                      </div>
                    )}
                    <div>
                      <div className="text-base font-semibold text-white">{mod.name}</div>
                      <div className="text-xs uppercase tracking-[0.12em] text-white/40">{mod.category || 'Mod'}</div>
                    </div>
                  </div>
                  <Toggle checked={mod.enabled} onChange={() => void toggleMod(mod.id, mod.enabled)} />
                </div>
                <div className="p-4">
                  <p className="line-clamp-2 text-xs text-white/60">{mod.description || 'Installed via Modrinth'}</p>
                  <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.12em] text-white/45">
                    <span>{mod.version}</span>
                    <span>{mod.loader}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3">
                    {mod.projectUrl ? (
                      <button type="button" onClick={() => void window.electronAPI?.openModProject(mod.source as any, mod.projectUrl!)} className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white">
                        <Globe className="h-3.5 w-3.5" /> Project
                      </button>
                    ) : <span />}
                    <button type="button" onClick={() => setRemoveId(mod.id)} className="flex items-center gap-1.5 text-xs text-red-300 hover:text-red-100">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {removeId !== null && (
        <Modal title="Remove mod" onClose={() => setRemoveId(null)}>
          <div className="space-y-4 text-sm text-white/65">
            <p>Are you sure you want to remove this mod from your current profile?</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRemoveId(null)} className="rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-white/80">Cancel</button>
              <button type="button" onClick={removeMod} className="rounded-xl bg-red-500/15 px-3 py-2 text-red-200">Remove</button>
            </div>
          </div>
        </Modal>
      )}
      {addModOpen && <AddModModal onClose={() => setAddModOpen(false)} installedMods={mods} onModsChange={setMods} />}
    </motion.div>
  );
}

function AddModModal({ onClose, installedMods, onModsChange }: { onClose: () => void; installedMods: InstalledMod[]; onModsChange: (mods: InstalledMod[]) => void }) {
  const [source, setSource] = useState<ModCatalogSource>('modrinth');
  const [query, setQuery] = useState('');
  const [gameVersion, setGameVersion] = useState('1.21.1');
  const [loader, setLoader] = useState('Fabric');
  const [results, setResults] = useState<ModCatalogResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [hasCurseForgeKey, setHasCurseForgeKey] = useState(false);
  const [keyStatusError, setKeyStatusError] = useState('');
  const [openError, setOpenError] = useState('');
  const [installingIds, setInstallingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!window.electronAPI) {
      setKeyStatusError('CurseForge key status is only available in the desktop app.');
      return;
    }
    window.electronAPI.hasCurseForgeKey()
      .then(setHasCurseForgeKey)
      .catch((cause: unknown) => setKeyStatusError(cause instanceof Error ? cause.message : 'Could not check CurseForge API key status.'));
  }, []);

  const performSearch = async (targetQuery: string) => {
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const matches = await searchModCatalog({ source, query: targetQuery.trim(), gameVersion, loader });
      setResults(matches);
    } catch (cause) {
      setResults([]);
      setError(cause instanceof Error ? cause.message : 'Could not search this mod catalog.');
    } finally {
      setLoading(false);
    }
  };

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void performSearch(query);
  };

  useEffect(() => {
    void performSearch(query);
  }, [source, gameVersion, loader]);

  const installMod = async (result: ModCatalogResult) => {
    if (!window.electronAPI?.installModrinthMod) return;
    setInstallingIds((prev) => ({ ...prev, [result.id]: true }));
    setError('');
    try {
      const updated = await window.electronAPI.installModrinthMod({
        projectId: result.id,
        gameVersion,
        loader,
        name: result.name,
        summary: result.summary,
        iconUrl: result.iconUrl,
        projectUrl: result.projectUrl,
        category: result.categories[0] || 'Utility',
      });
      onModsChange(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not install this mod.');
    } finally {
      setInstallingIds((prev) => ({ ...prev, [result.id]: false }));
    }
  };

  const openProject = async (result: ModCatalogResult) => {
    setOpenError('');
    try {
      if (!window.electronAPI) throw new Error('Opening mod projects is only available in the desktop app.');
      await window.electronAPI.openModProject(result.source, result.projectUrl);
    } catch (cause) {
      setOpenError(cause instanceof Error ? cause.message : 'Could not open the mod project.');
    }
  };

  return (
    <Modal title="Browse mod catalogs" onClose={onClose} className="mod-catalog-modal">
      <div className="mod-catalog">
        <p className="mod-catalog-note">Search and install real Modrinth mods directly into Bayon Client.</p>
        <div className="mod-source-tabs" role="tablist" aria-label="Mod catalog">
          <button type="button" role="tab" aria-selected={source === 'modrinth'} className={source === 'modrinth' ? 'mod-source-active' : ''} onClick={() => { setSource('modrinth'); setResults([]); setError(''); setSearched(false); }}>Modrinth</button>
          <button type="button" role="tab" aria-selected={source === 'curseforge'} className={source === 'curseforge' ? 'mod-source-active' : ''} onClick={() => { setSource('curseforge'); setResults([]); setError(''); setSearched(false); }}>CurseForge {hasCurseForgeKey ? <span className="source-ready">API ready</span> : <span className="source-key-needed">API key needed</span>}</button>
        </div>
        {keyStatusError && <p className="mod-catalog-subtle" role="status">{keyStatusError}</p>}
        <form className="mod-search-form" onSubmit={search}>
          <label className="mod-search-field">
            <Search className="h-4 w-4" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mods (e.g. Sodium, Iris, Lithium)" autoFocus />
          </label>
          <div className="mod-search-filters">
            <label><span>Version</span><select value={gameVersion} onChange={(event) => setGameVersion(event.target.value)}>{['1.21.1', '1.20.6', '1.19.4', '1.18.2', '1.17.1'].map((version) => <option key={version}>{version}</option>)}</select></label>
            <label><span>Loader</span><select value={loader} onChange={(event) => setLoader(event.target.value)}>{['Fabric', 'Forge', 'NeoForge', 'Quilt'].map((value) => <option key={value}>{value}</option>)}</select></label>
            <button type="submit" disabled={loading}>{loading ? 'Searchingâ€¦' : 'Search'}</button>
          </div>
        </form>
        {error && <p className="mod-catalog-error" role="alert">{error}</p>}
        {openError && <p className="mod-catalog-error" role="alert">{openError}</p>}
        <div className="mod-catalog-results" aria-live="polite">
          {loading && <div className="mod-catalog-empty">Searching {source === 'modrinth' ? 'Modrinth' : 'CurseForge'}â€¦</div>}
          {!loading && results.map((result) => {
            const isInstalled = installedMods.some((m) => m.id === result.id || m.name.toLowerCase() === result.name.toLowerCase());
            return (
              <article className="mod-result" key={`${result.source}-${result.id}`}>
                {result.iconUrl ? <img src={result.iconUrl} alt="" /> : <div className="mod-result-icon"><Layers3 className="h-5 w-5" /></div>}
                <div className="mod-result-copy">
                  <strong>{result.name}</strong>
                  <small>by {result.author} · {result.downloads.toLocaleString()} downloads</small>
                  <p>{result.summary}</p>
                  <div className="mod-result-tags">{result.categories.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {result.source === 'modrinth' && (
                    <button
                      type="button"
                      disabled={isInstalled || installingIds[result.id]}
                      onClick={() => void installMod(result)}
                      className={[
                        'rounded-xl px-4 py-2 text-xs font-semibold tracking-wide transition shadow-sm',
                        isInstalled
                          ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 cursor-default'
                          : installingIds[result.id]
                          ? 'border border-white/20 bg-white/10 text-white/60 cursor-wait'
                          : 'border border-white/40 bg-white text-black hover:bg-white/90 active:scale-95',
                      ].join(' ')}
                    >
                      {isInstalled ? 'Installed ✓' : installingIds[result.id] ? 'Installing…' : 'Install Mod'}
                    </button>
                  )}
                  <button type="button" className="mod-project-button" onClick={() => openProject(result)}>Open project <Globe className="h-3.5 w-3.5" /></button>
                </div>
              </article>
            );
          })}
          {!loading && !error && searched && results.length === 0 && <div className="mod-catalog-empty">No matching projects for {gameVersion} {loader}.</div>}
          {!loading && !searched && <div className="mod-catalog-empty">Choose a catalog and search for a mod.</div>}
        </div>
      </div>
    </Modal>
  );
}

function SkinsPage() {
  const [selected, setSelected] = useState(1);
  const [rotation, setRotation] = useState(22);
  const [armModel, setArmModel] = useState('Classic');
  const [uploadedSkin, setUploadedSkin] = useState<SkinItem | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const skins = uploadedSkin ? [uploadedSkin, ...skinGallery] : skinGallery;
  const activeSkin = skins.find((skin) => skin.id === selected) ?? skinGallery[0];

  const uploadSkin = (file?: File) => {
    setUploadError('');
    if (!file) return;
    if (file.type !== 'image/png' || file.size > 5 * 1024 * 1024) {
      setUploadError('Choose a PNG skin image smaller than 5 MB.');
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (image.width !== 64 || (image.height !== 64 && image.height !== 32)) {
        setUploadError('Minecraft skin images must be 64 Ã— 64 or legacy 64 Ã— 32 PNGs.');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          setUploadError('The selected skin could not be read.');
          return;
        }
        const skin: SkinItem = {
          id: 99,
          name: file.name.replace(/\.png$/i, ''),
          type: 'Custom',
          accent: 'from-zinc-200 to-zinc-600',
          imageUrl: reader.result,
        };
        setUploadedSkin(skin);
        setSelected(skin.id);
      };
      reader.onerror = () => setUploadError('The selected skin could not be read.');
      reader.readAsDataURL(file);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setUploadError('The selected file is not a readable PNG image.');
    };
    image.src = objectUrl;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="page-scroll p-5">
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.7fr]">
        <GlassCard className="p-5">
          <PageHeader title="Skins" subtitle="Browse and preview your character" />
          <div className="mt-5 rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,#0f0f0f,#090909)] p-6">
            <div className="flex items-center justify-between">
              <div><div className="text-xs uppercase tracking-[0.18em] text-white/45">Skin preview</div><div className="mt-1 text-sm text-white/75">{activeSkin.name}</div></div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setRotation((value) => value - 12)} className="rounded-lg border border-white/10 bg-white/3 px-2 py-1.5 text-white/75">-</button>
                <button type="button" onClick={() => setRotation((value) => value + 12)} className="rounded-lg border border-white/10 bg-white/3 px-2 py-1.5 text-white/75">+</button>
                <select aria-label="Arm model" value={armModel} onChange={(event) => setArmModel(event.target.value)} className="rounded-lg border border-white/10 bg-[#121212] px-2 py-1.5 text-xs text-white/75">
                  <option>Classic</option>
                  <option>Slim</option>
                </select>
              </div>
            </div>
            <div className="skin-preview-stage">
              <Suspense fallback={<div className="skin-preview-loading">Loading 3D skin previewâ€¦</div>}>
                <SkinModelPreview imageUrl={activeSkin.imageUrl} skinName={activeSkin.name} rotation={rotation} slimArms={armModel === 'Slim'} onRotationChange={setRotation} />
              </Suspense>
            </div>
            {activeSkin.imageUrl && <div className="uploaded-texture"><FileImage className="h-4 w-4" /><span>Uploaded texture</span><img src={activeSkin.imageUrl} alt={`${activeSkin.name} skin texture`} /></div>}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-medium text-white/80">Skin Gallery</div>
            <input ref={fileInput} type="file" accept="image/png,.png" hidden onChange={(event) => uploadSkin(event.target.files?.[0])} />
            <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-xs uppercase tracking-[0.14em] text-white/70"><ImagePlus className="h-4 w-4" /> Upload skin</button>
          </div>
          <div className="space-y-3">
            {skins.map((skin) => (
              <button key={skin.id} type="button" onClick={() => setSelected(skin.id)} className={['flex items-center justify-between rounded-xl border p-3 text-left transition', selected === skin.id ? 'border-white/20 bg-white/8' : 'border-white/10 bg-[#111111]'].join(' ')}>
                <div className="flex items-center gap-3">
                  {skin.imageUrl ? <img className="h-12 w-12 rounded-xl border border-white/10 object-contain [image-rendering:pixelated]" src={skin.imageUrl} alt="" /> : <div className={`h-12 w-12 rounded-xl border border-white/10 bg-gradient-to-br ${skin.accent}`} />}
                  <div>
                    <div className="font-medium text-white/86">{skin.name}</div>
                    <div className="text-xs uppercase tracking-[0.1em] text-white/40">{skin.type}</div>
                  </div>
                </div>
                {selected === skin.id && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
              </button>
            ))}
          </div>
          {uploadError && <p role="alert" className="mt-3 text-xs text-red-300">{uploadError}</p>}
          <div className="mt-5 flex gap-3">
            <SecondaryButton onClick={() => { setSelected(1); setUploadedSkin(null); setUploadError(''); if (fileInput.current) fileInput.current.value = ''; }}>
              <RefreshIcon />
              Reset Skin
            </SecondaryButton>
          </div>
        </GlassCard>
      </div>
    </motion.div>
  );
}

function SettingsPage() {
  const settings = useSettingsStore();
  const categories = ['General', 'Appearance', 'Game', 'Graphics', 'Memory', 'Account', 'Advanced'];
  const [active, setActive] = useState('General');

  const handleToggleDiscordPresence = async (enabled: boolean) => {
    settings.setDiscordPresence(enabled);
    if (!window.electronAPI) return;
    try {
      if (enabled) {
        await window.electronAPI.reconnectDiscordPresence();
      } else {
        await window.electronAPI.disableDiscordPresence();
      }
    } catch {
      // Ignored
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="page-scroll p-5">
      <div className="grid gap-5 xl:grid-cols-[260px_1fr]">
        <GlassCard className="p-3">
          <div className="mb-3 px-2 text-xs uppercase tracking-[0.18em] text-white/45">Categories</div>
          <div className="space-y-1">
            {categories.map((category) => (
              <button key={category} type="button" onClick={() => setActive(category)} className={['flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition', active === category ? 'bg-white/8 text-white' : 'text-white/55 hover:bg-white/4 hover:text-white/80'].join(' ')}>
                {category}
                <ChevronRight className="h-4 w-4" />
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <PageHeader title="Settings" subtitle="Tune the launcher and your default gameplay profile" />
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <SettingRow label="Launch on startup"><Toggle checked={settings.launchOnStartup} onChange={settings.setLaunchOnStartup} /></SettingRow>
            <SettingRow label="Minimize to tray"><Toggle checked={settings.minimizeToTray} onChange={settings.setMinimizeToTray} /></SettingRow>
            <SettingRow label="Discord Rich Presence"><Toggle checked={settings.discordPresence} onChange={handleToggleDiscordPresence} /></SettingRow>
            <div>
              <Label>Language</Label>
              <Select value={settings.language} onChange={settings.setLanguage} options={['English (US)', 'English (UK)', 'Deutsch', 'EspaÃ±ol']} />
            </div>
            <div>
              <Label>Default version</Label>
              <Select value={settings.defaultVersion} onChange={settings.setDefaultVersion} options={versions} />
            </div>
            <div>
              <Label>RAM allocation</Label>
              <Select value={String(settings.selectedRam)} onChange={(v) => settings.setSelectedRam(Number(v))} options={['4', '6', '8', '12', '16']} />
            </div>
            <div>
              <Label>FPS limit</Label>
              <Select value={String(settings.fpsLimit)} onChange={(v) => settings.setFpsLimit(Number(v))} options={['60', '120', '144', '240']} />
            </div>
            <div>
              <Label>Resolution</Label>
              <Select value={settings.resolution} onChange={settings.setResolution} options={['1920x1080', '2560x1440', '3840x2160']} />
            </div>
            <div>
              <Label>Render distance</Label>
              <Select value={settings.renderDistance} onChange={settings.setRenderDistance} options={['6 Chunks', '8 Chunks', '12 Chunks', '16 Chunks']} />
            </div>
            <div className="md:col-span-2">
              <Label>Java path</Label>
              <input value={settings.javaPath} onChange={(e) => settings.setJavaPath(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#121212] px-3 py-2.5 text-sm text-white/80 outline-none transition focus:border-white/20" />
            </div>
            <div className="md:col-span-2">
              <Label>Custom launch arguments</Label>
              <input value={settings.customArgs} onChange={(e) => settings.setCustomArgs(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#121212] px-3 py-2.5 text-sm text-white/80 outline-none transition focus:border-white/20" />
            </div>
            <div>
              <Label>Animation</Label>
              <Select value={settings.animationLevel} onChange={settings.setAnimationLevel} options={['Smooth', 'Balanced', 'Minimal']} />
            </div>
            <div className="md:col-span-2">
              <Label>Backend Server URL</Label>
              <input
                value={settings.backendUrl}
                onChange={(e) => settings.setBackendUrl(e.target.value)}
                placeholder="https://bayon-backend.onrender.com"
                className="w-full rounded-xl border border-white/10 bg-[#121212] px-3 py-2.5 text-sm text-white/80 outline-none transition focus:border-white/20"
              />
              <p className="mt-1 text-xs text-white/40">URL of your hosted backend on Render for Friends and Presence</p>
            </div>
            <SettingRow label="Reduce motion"><Toggle checked={settings.reduceMotion} onChange={settings.setReduceMotion} /></SettingRow>
          </div>

          <div className="mt-6 flex justify-end">
            <button type="button" onClick={settings.resetDefaults} className="rounded-xl border border-white/10 bg-white/3 px-4 py-2 text-sm text-white/80 transition hover:bg-white/8">Restore defaults</button>
          </div>
        </GlassCard>
      </div>
    </motion.div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/45">{subtitle}</p>
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white text-[#0d0d0d] px-4 py-2.5 text-sm font-semibold shadow-[0_0_24px_rgba(255,255,255,0.2)] transition hover:translate-y-[-1px] hover:shadow-[0_0_30px_rgba(255,255,255,0.35)]">
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/3 px-4 py-2.5 text-sm font-medium text-white/85 transition hover:border-white/15 hover:bg-white/8">
      {children}
    </button>
  );
}

function GlassCard({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-[22px] border border-white/10 bg-[#0d0d0d]/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] ${className}`}>{children}</div>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={['relative inline-flex h-7 w-12 items-center rounded-full border transition', checked ? 'border-white/30 bg-white/18' : 'border-white/10 bg-[#111111]'].join(' ')}>
      <span className={['absolute h-5 w-5 rounded-full bg-white transition', checked ? 'translate-x-6' : 'translate-x-1 bg-white/70'].join(' ')} />
    </button>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#121212] px-3 py-2.5 text-sm text-white/80 outline-none transition focus:border-white/20">
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111111] px-3 py-2.5 text-white/70">
      <Volume2 className="h-4 w-4 text-white/45" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm text-white/80 outline-none placeholder:text-white/30" />
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-white/8">
      <div className="h-full rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-all duration-300" style={{ width: `${value}%` }} />
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-white/10 bg-[#101010] p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60"><MoonStar className="h-5 w-5" /></div>
      <div className="mt-4 text-xl font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-white/55">{text}</div>
    </div>
  );
}

function Modal({ title, children, onClose, className = '' }: { title: string; children: React.ReactNode; onClose: () => void; className?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
      <div className={`w-full max-w-md rounded-[24px] border border-white/10 bg-[#0d0d0d] p-4 shadow-[0_0_80px_rgba(0,0,0,0.55)] ${className}`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold text-white">{title}</div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 p-2 text-white/60 hover:bg-white/5"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-sm text-white/70">{children}</label>;
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#121212] px-3 py-3">
      <span className="text-sm text-white/75">{label}</span>
      {children}
    </div>
  );
}

function LogoMark() {
  return <img className="bayon-logo" src="/bayon-icon.png" alt="Bayon Client logo" draggable={false} />;
}

function RefreshIcon() {
  return <Globe className="h-4 w-4" />;
}

export default App;
