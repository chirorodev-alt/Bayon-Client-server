import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense } from 'react';
import {
  Bell,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Coffee,
  Coins,
  Gem,
  Radio,
  Download,
  FileImage,
  FileText,
  FolderOpen,
  Gamepad2,
  Globe,
  HardDrive,
  ImagePlus,
  KeyRound,
  Layers3,
  Mail,
  MessageSquarePlus,
  Minus,
  Monitor,
  MoreHorizontal,
  MoonStar,
  Play,
  Plus,
  Search,
  Sparkles,
  Ticket,
  RefreshCw,
  ShoppingCart,
  Settings,
  Shirt,
  Square,
  Trash2,
  Terminal,
  UserRound,
  UsersRound,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useFriends } from './hooks/useFriends';
import { useServers } from './hooks/useServers';
import { searchModCatalog, type ModCatalogResult, type ModCatalogSource, type ModrinthProjectType } from './services/modCatalog';
import { clearBacoinsToken, equipCosmetic, fetchBacoinsMe, fetchCosmetics, getBacoinsIdentity, getBacoinsToken, purchaseCosmetic, redeemBacoinsCode, signInWithMicrosoft, type BacoinsUser, type Cosmetic } from './services/bacoinsApi';
import { useAccountStore } from './store/useAccountStore';
import { useSettingsStore } from './store/useSettingsStore';
import { useProfileStore, type VersionProfile } from './store/useProfileStore';
import type { AppUpdateState, BayonModStatus, ClientDirectories, DiscordPresenceStatus, InstalledMod, JavaRuntimeProgress, ManagedJavaRuntime } from './types/electron';
import bayonIcon from './assets/bayon-icon.png';
import { BACKEND_BASE_URL } from './services/backendConfig';
import { localizeApp } from './services/uiTranslations';

const SkinModelPreview = lazy(() => import('./components/SkinModelPreview').then((module) => ({ default: module.SkinModelPreview })));

type WindowState = 'maximized' | 'restored';
type ClientNotification = { id: string; title: string; message: string; createdAt: string; level: 'info' | 'success' | 'warning' };

const NOTIFICATION_CACHE_KEY = 'bayon-client-notifications-v1';
const NOTIFICATION_READ_KEY = 'bayon-client-read-notifications-v1';
const NOTIFICATION_DISMISSED_KEY = 'bayon-client-dismissed-notifications-v1';

function loadDismissedNotificationIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_DISMISSED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

function loadStoredNotifications(): ClientNotification[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_CACHE_KEY) || '[]');
    const dismissed = new Set(loadDismissedNotificationIds());
    return Array.isArray(parsed) ? parsed.filter((item): item is ClientNotification => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.message === 'string' && !dismissed.has(item.id)) : [];
  } catch { return []; }
}

function loadReadNotificationIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_READ_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
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

const navigationLabels = {
  English: ['Play', 'Profiles', 'Accounts', 'Store', 'Settings', 'Mods', 'Skins'],
  Khmer: ['\u179B\u17C1\u1784', '\u1794\u17D2\u179A\u17BC\u17A0\u17D2\u179C\u17B6\u179B\u17CB', '\u1782\u178E\u1793\u17B8', '\u17A0\u17B6\u1784', '\u1780\u17B6\u179A\u1780\u17C6\u178E\u178F\u17CB', '\u1798\u17C9\u17BC\u178A', '\u179F\u17D2\u1794\u17C2\u1780'],
} as const;

const versions = ['26.3', '26.2'];
const modContentTabs: { id: ModrinthProjectType; label: string }[] = [
  { id: 'mod', label: 'Mods' },
  { id: 'modpack', label: 'Modpacks' },
  { id: 'resourcepack', label: 'Resource Packs' },
  { id: 'shader', label: 'Shaders' },
  { id: 'datapack', label: 'Data Packs' },
];
let minecraftVersionsRequest: Promise<string[]> | null = null;

function useMinecraftVersions() {
  const [availableVersions, setAvailableVersions] = useState(versions);
  useEffect(() => {
    let active = true;
    if (!minecraftVersionsRequest) {
      const request = window.electronAPI?.getMinecraftVersions
        ? window.electronAPI.getMinecraftVersions()
        : fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json').then(async (response) => {
          if (!response.ok) throw new Error('Minecraft version list unavailable.');
          const manifest = await response.json() as { versions?: { id: string; type: string }[] };
          return (manifest.versions ?? []).filter((version) => version.type === 'release').map((version) => version.id);
        });
      minecraftVersionsRequest = request
        .then((items) => ['26.3', '26.2', ...items].filter((item, index, list) => list.indexOf(item) === index))
        .catch(() => versions);
    }
    void minecraftVersionsRequest.then((items) => { if (active) setAvailableVersions(items); });
    return () => { active = false; };
  }, []);

  return availableVersions;
}

function MinecraftVersionDropdown({ value, onChange, availableVersions, compact = false }: { value: string; onChange: (version: string) => void; availableVersions: string[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const filteredVersions = availableVersions.filter((version) => version.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => { if (!dropdownRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('mousedown', closeOnOutsideClick); document.removeEventListener('keydown', closeOnEscape); };
  }, [open]);
  return <div ref={dropdownRef} className={`relative ${compact ? 'w-24 shrink-0' : 'w-full'}`}>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen((current) => !current); setQuery(''); }} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#111820] px-3 py-2.5 text-left text-sm text-white/85 transition hover:border-sky-400/40 hover:bg-[#15202b] focus:outline-none focus:ring-2 focus:ring-sky-400/30">
      <span>{value}</span><ChevronDown className={`h-4 w-4 text-sky-200/70 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className={`absolute top-full z-40 mt-2 overflow-hidden rounded-xl border border-sky-300/20 bg-[#0b121a] shadow-[0_18px_45px_rgba(0,0,0,.65)] ring-1 ring-white/5 ${compact ? 'left-0 w-64' : 'left-0 right-0'}`}>
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5"><Search className="h-4 w-4 shrink-0 text-sky-200/55" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Minecraft versions" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/35" /></div>
      <div role="listbox" aria-label="Minecraft releases" className="max-h-64 overflow-y-auto p-1.5">{filteredVersions.map((version) => <button type="button" role="option" aria-selected={value === version} key={version} onClick={() => { onChange(version); setOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition ${value === version ? 'bg-sky-400/15 text-sky-100' : 'text-white/70 hover:bg-white/7 hover:text-white'}`}><span>Minecraft {version}</span>{value === version && <span className="text-[9px] font-semibold uppercase tracking-wider text-sky-200">Selected</span>}</button>)}{filteredVersions.length === 0 && <div className="px-3 py-5 text-center text-xs text-white/40">No matching releases</div>}</div>
      <div className="border-t border-white/8 px-3 py-2 text-[10px] text-white/35">Official Minecraft releases · {availableVersions.length} versions</div>
    </div>}
  </div>;
}

function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}

function AppShell() {
  const [windowState, setWindowState] = useState<WindowState>('restored');
  const [appUpdate, setAppUpdate] = useState<AppUpdateState>({ status: 'idle' });
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [startupSettingsError, setStartupSettingsError] = useState<string | null>(null);
  const location = useLocation();
  const language = useSettingsStore((state) => state.language === 'Khmer' ? 'Khmer' : 'English');
  const launchOnStartup = useSettingsStore((state) => state.launchOnStartup);
  const minimizeToTray = useSettingsStore((state) => state.minimizeToTray);
  const activeAccount = useAccountStore((state) => state.accounts.find((account) => account.id === state.activeAccountId));
  const discordPresence = useSettingsStore((state) => state.discordPresence);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.app-shell');
    if (!root) return;
    const applyTranslations = () => localizeApp(root, language);
    applyTranslations();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyTranslations();
      });
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder'] });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [language]);

  useEffect(() => {
    const api = (window as Window & { electronAPI?: { onWindowStateChange: (cb: (state: WindowState) => void) => void } }).electronAPI;
    api?.onWindowStateChange((state) => setWindowState(state));
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const unsubscribe = api.onAppUpdateState(setAppUpdate);
    api.getAppUpdateState().then(setAppUpdate).catch(() => {});
    return unsubscribe;
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    let active = true;
    Promise.all([
      api.setLaunchOnStartup(launchOnStartup),
      api.setMinimizeToTray(minimizeToTray),
    ]).then(() => {
      if (active) setStartupSettingsError(null);
    }).catch((cause: unknown) => {
      if (active) setStartupSettingsError(cause instanceof Error ? cause.message : 'Could not apply startup and tray settings.');
    });
    return () => { active = false; };
  }, [launchOnStartup, minimizeToTray]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    if (discordPresence) {
      void api.configureDiscordPresence().catch(() => {});
    } else {
      void api.disableDiscordPresence().catch(() => {});
    }
  }, [discordPresence]);

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

  const updateDismissKey = appUpdate.version || 'error';
  const updateDialogVisible = ['available', 'downloading', 'downloaded', 'error'].includes(appUpdate.status)
    && (appUpdate.status === 'downloaded' || dismissedUpdate !== updateDismissKey);

  return (
    <div className="app-shell bg-[#080a0d] text-white selection:bg-white/20" lang={language === 'Khmer' ? 'km' : 'en'}>
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
                <Route path="/settings" element={<SettingsPage startupSettingsError={startupSettingsError} />} />
                <Route path="/profiles" element={<ProfilesPage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/store" element={<StorePage />} />
              </Routes>
            </AnimatePresence>
          </main>
        </div>
      </div>
      {updateDialogVisible && <Modal title={appUpdate.status === 'downloaded' ? 'Update ready to install' : appUpdate.status === 'error' ? 'Update check failed' : 'Bayon Client update found'} onClose={() => setDismissedUpdate(updateDismissKey)}>
        {appUpdate.status === 'downloaded' ? <>
          <p className="settings-clear-warning">Bayon Client {appUpdate.version ? `v${appUpdate.version} ` : ''}has downloaded and is ready. Restart the client to finish updating.</p>
          <div className="offline-form-actions"><button type="button" onClick={() => setDismissedUpdate(updateDismissKey)}>Later</button><button type="button" className="account-select-button" disabled={installingUpdate} onClick={() => { setInstallingUpdate(true); void window.electronAPI?.installAppUpdate().catch(() => setInstallingUpdate(false)); }}>{installingUpdate ? 'Restarting…' : 'Restart and update'}</button></div>
        </> : appUpdate.status === 'error' ? <>
          <p className="settings-clear-warning">{appUpdate.message || 'Could not check for a new version.'}</p>
          <div className="offline-form-actions"><button type="button" onClick={() => setDismissedUpdate(updateDismissKey)}>Dismiss</button><button type="button" className="account-select-button" onClick={() => { setDismissedUpdate(null); void window.electronAPI?.checkForAppUpdate().then(setAppUpdate); }}>Try again</button></div>
        </> : <>
          <p className="settings-clear-warning">{appUpdate.version ? `Bayon Client v${appUpdate.version} is available.` : 'A new Bayon Client version is available.'} The update downloads in the background and installs inside the app.</p>
          {appUpdate.status === 'downloading' && <div className="java-runtime-progress update-download-progress"><span style={{ width: `${Math.max(0, Math.min(100, appUpdate.percent ?? 0))}%` }} /></div>}
          <p className="update-download-caption">{appUpdate.status === 'downloading' ? `${Math.round(appUpdate.percent ?? 0)}% downloaded` : appUpdate.message || 'Preparing update download…'}</p>
          <div className="offline-form-actions"><button type="button" onClick={() => setDismissedUpdate(updateDismissKey)}>Later</button></div>
        </>}
      </Modal>}
    </div>
  );
}

function TitleBar({ windowState }: { windowState: WindowState }) {
  const data = (window as Window & { electronAPI?: { minimize: () => void; maximize: () => void; close: () => void } }).electronAPI;
  const [accountOpen, setAccountOpen] = useState(false);
  const [editionOpen, setEditionOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [betaBusy, setBetaBusy] = useState(false);
  const [betaNotice, setBetaNotice] = useState('');
  const [bacoinsIdentity, setBacoinsIdentity] = useState(getBacoinsIdentity);
  const [onlineUsers, setOnlineUsers] = useState<number | null>(null);
  const [clientNotifications, setClientNotifications] = useState<ClientNotification[]>(loadStoredNotifications);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(loadReadNotificationIds);
  const [activeAnnouncement, setActiveAnnouncement] = useState<ClientNotification | null>(() => {
    const cached = loadStoredNotifications();
    const read = new Set(loadReadNotificationIds());
    return cached.find((item) => !read.has(item.id)) ?? null;
  });
  const knownNotificationIds = useRef(new Set(clientNotifications.map((item) => item.id)));
  const readNotificationIdsRef = useRef(new Set(readNotificationIds));
  const dismissedNotificationIds = useRef(new Set(loadDismissedNotificationIds()));
  const shownAnnouncementIds = useRef(new Set(activeAnnouncement ? [activeAnnouncement.id] : []));
  const activeAccount = useAccountStore((state) => state.accounts.find((account) => account.id === state.activeAccountId));
  const language = useSettingsStore((state) => state.language === 'Khmer' ? 'Khmer' : 'English');
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  useEffect(() => {
    let stopped = false;
    const storageKey = 'bayon-client-presence-id';
    let clientId = localStorage.getItem(storageKey);
    if (!clientId) {
      clientId = crypto.randomUUID();
      localStorage.setItem(storageKey, clientId);
    }
    const heartbeat = async () => {
      try {
        const response = await fetch(`${BACKEND_BASE_URL}/api/client-presence`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId }),
        });
        if (!response.ok) throw new Error('Presence unavailable');
        const data = await response.json() as { onlineUsers: number };
        if (!stopped) setOnlineUsers(data.onlineUsers);
      } catch { if (!stopped) setOnlineUsers(null); }
    };
    void heartbeat();
    const interval = window.setInterval(() => void heartbeat(), 30_000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    let stopped = false;
    let requestInFlight = false;
    const refreshNotifications = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(`${BACKEND_BASE_URL}/api/client-notifications`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json() as { notifications?: ClientNotification[] };
        if (stopped) return;
        const incoming = Array.isArray(result.notifications) ? result.notifications.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.message === 'string') : [];
        const newUnread = incoming.find((item) => !knownNotificationIds.current.has(item.id) && !readNotificationIdsRef.current.has(item.id));
        const serverIds = new Set(incoming.map((item) => item.id));
        const next = incoming.filter((item) => !dismissedNotificationIds.current.has(item.id)).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 100);
        knownNotificationIds.current = serverIds;
        const retainedDismissed = [...dismissedNotificationIds.current].filter((id) => serverIds.has(id));
        dismissedNotificationIds.current = new Set(retainedDismissed);
        try { localStorage.setItem(NOTIFICATION_DISMISSED_KEY, JSON.stringify(retainedDismissed)); } catch { /* Keep dismissals in memory for this session. */ }
        setClientNotifications(next);
        try { localStorage.setItem(NOTIFICATION_CACHE_KEY, JSON.stringify(next)); } catch { /* The live list still works if storage is unavailable. */ }
        setReadNotificationIds((current) => {
          const retained = current.filter((id) => serverIds.has(id));
          readNotificationIdsRef.current = new Set(retained);
          try { localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(retained)); } catch { /* The session remains usable if storage is unavailable. */ }
          return retained;
        });
        setActiveAnnouncement((current) => current && !serverIds.has(current.id) ? null : current);
        if (newUnread && !shownAnnouncementIds.current.has(newUnread.id)) {
          shownAnnouncementIds.current.add(newUnread.id);
          setActiveAnnouncement(newUnread);
        }
      } catch { /* Keep cached notices available while offline or the server wakes. */ }
      finally { window.clearTimeout(timeout); requestInFlight = false; }
    };
    void refreshNotifications();
    const interval = window.setInterval(() => void refreshNotifications(), 5_000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, []);

  const markNotificationsRead = () => {
    const next = [...new Set([...readNotificationIdsRef.current, ...clientNotifications.map((item) => item.id)])];
    readNotificationIdsRef.current = new Set(next);
    setReadNotificationIds(next);
    try { localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(next)); } catch { /* The current session remains marked read in memory. */ }
    setActiveAnnouncement(null);
  };

  const dismissNotification = (id: string) => {
    const nextDismissed = new Set(dismissedNotificationIds.current);
    nextDismissed.add(id);
    dismissedNotificationIds.current = nextDismissed;
    try { localStorage.setItem(NOTIFICATION_DISMISSED_KEY, JSON.stringify([...nextDismissed])); } catch { /* Keep the dismissal for this session. */ }
    const nextNotifications = clientNotifications.filter((item) => item.id !== id);
    setClientNotifications(nextNotifications);
    try { localStorage.setItem(NOTIFICATION_CACHE_KEY, JSON.stringify(nextNotifications)); } catch { /* The visible list still updates. */ }
    const nextRead = [...new Set([...readNotificationIdsRef.current, id])];
    readNotificationIdsRef.current = new Set(nextRead);
    setReadNotificationIds(nextRead);
    try { localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(nextRead)); } catch { /* Keep read state for this session. */ }
    setActiveAnnouncement((current) => current?.id === id ? null : current);
  };

  useEffect(() => {
    const refreshIdentity = () => {
      const identity = getBacoinsIdentity();
      setBacoinsIdentity(identity);
    };
    const openBacoinsMenu = () => { setEditionOpen(true); setBetaNotice(''); };
    window.addEventListener('bayon:bacoins-auth-changed', refreshIdentity);
    window.addEventListener('bayon:open-bacoins-menu', openBacoinsMenu);
    return () => {
      window.removeEventListener('bayon:bacoins-auth-changed', refreshIdentity);
      window.removeEventListener('bayon:open-bacoins-menu', openBacoinsMenu);
    };
  }, []);

  const signInBacoins = async () => {
    setBetaBusy(true); setBetaNotice('');
    try {
      await signInWithMicrosoft(activeAccount ? { id: activeAccount.id, username: activeAccount.username } : undefined);
      setBacoinsIdentity(getBacoinsIdentity());
      setBetaNotice('Microsoft account connected. Your Bayon balance is ready to sync.');
    } catch (cause) { setBetaNotice(cause instanceof Error ? cause.message : 'Could not sign in with Microsoft.'); }
    finally { setBetaBusy(false); }
  };

  const unreadNotificationCount = clientNotifications.reduce((count, item) => count + (readNotificationIds.includes(item.id) ? 0 : 1), 0);

  return (
    <>
    <div className="title-bar">
      <div className="title-brand">
        <LogoMark />
        <div>
          <div className="title-wordmark">BAYON CLIENT</div>
          <div className="title-tagline">{language === 'Khmer' ? 'លេង / កែសម្រួល / ប្លែកពីគេ' : 'PLAY / CUSTOMIZE / BE DIFFERENT'}</div>
        </div>
      </div>

      <div className="title-actions">
        <div className="title-dropdown-wrap">
          <button type="button" className="title-select" onClick={() => setAccountOpen(!accountOpen)}>
            <MinecraftAvatar username={activeAccount?.username ?? 'Steve'} skin={activeAccount?.skin} className="avatar-mini" />
            <span className="title-select-copy"><strong>{activeAccount?.username ?? 'No account'}</strong><small>{activeAccount ? 'Offline account' : 'Not signed in'}</small></span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {accountOpen && <div className="title-popover"><strong>{activeAccount?.username ?? 'No account selected'}</strong><span>{activeAccount ? 'Offline account' : 'Create an offline account to continue'}</span><NavLink to="/accounts" onClick={() => setAccountOpen(false)}>Manage accounts</NavLink></div>}
        </div>
        <div className="client-online-count" title="Bayon Client sessions active in the last 90 seconds" aria-label={`${onlineUsers ?? '—'} Bayon Client users online`}>
          <span className="client-online-indicator" />{onlineUsers === null ? '—' : onlineUsers.toLocaleString()} <small>{language === 'Khmer' ? 'កំពុងប្រើ' : 'online'}</small>
        </div>
        <div className="title-dropdown-wrap">
          <button type="button" className="title-select language-select" onClick={() => setLanguageOpen(!languageOpen)} aria-label="Choose language" aria-expanded={languageOpen}>
            <span className="language-flag" aria-hidden="true">{language === 'Khmer' ? '🇰🇭' : '🇬🇧'}</span>
            <span className="language-select-label">{language === 'Khmer' ? 'ខ្មែរ' : 'English'}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {languageOpen && <div className="title-popover language-popover" role="menu" aria-label="Language">
            <strong>Language / ភាសា</strong>
            <button type="button" role="menuitemradio" aria-checked={language === 'English'} className={language === 'English' ? 'language-option-active' : ''} onClick={() => { setLanguage('English'); setLanguageOpen(false); }}><span aria-hidden="true">🇬🇧</span> English {language === 'English' && <Check className="h-3.5 w-3.5" />}</button>
            <button type="button" role="menuitemradio" aria-checked={language === 'Khmer'} className={language === 'Khmer' ? 'language-option-active' : ''} onClick={() => { setLanguage('Khmer'); setLanguageOpen(false); }}><span aria-hidden="true">🇰🇭</span> ខ្មែរ (Khmer) {language === 'Khmer' && <Check className="h-3.5 w-3.5" />}</button>
          </div>}
        </div>
        <div className="title-dropdown-wrap">
          <button type="button" className="title-select edition-select" onClick={() => setEditionOpen(!editionOpen)}>
            <span className="edition-cube"><KeyRound className="h-3.5 w-3.5" /></span>
            <span className="title-select-copy"><strong>{bacoinsIdentity?.email ? 'Microsoft account' : 'Bayon account'}</strong><small>{bacoinsIdentity?.email || 'Bacoins sign-in'}</small></span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {editionOpen && <div className="title-popover email-auth-popover">
            <strong>Bayon account</strong>
            {bacoinsIdentity ? <>
              <span>Signed in as {bacoinsIdentity.email || bacoinsIdentity.username}</span>
              <span>Your Microsoft identity is used to sync Bacoins with the website.</span>
              {betaNotice && <span className="email-auth-notice" role="status">{betaNotice}</span>}
              <button type="button" onClick={() => { clearBacoinsToken(); setBacoinsIdentity(null); setBetaNotice(''); }}>Sign out</button>
            </> : <>
              <span>Sign in with Microsoft to sync Bacoins{activeAccount ? <> for <strong>{activeAccount.username}</strong></> : ''}.</span>
              <button type="button" onClick={() => void signInBacoins()} disabled={betaBusy}>{betaBusy ? 'Connecting…' : 'Continue with Microsoft'}</button>
              {betaNotice && <span className="email-auth-notice" role="status">{betaNotice}</span>}
              <small>Email-only offline profiles remain local. Add a contact email in Accounts; Microsoft sign-in secures your synced balance.</small>
            </>}
          </div>}
        </div>
        <div className="title-dropdown-wrap">
          <button type="button" onClick={() => { const opening = !notificationOpen; setNotificationOpen(opening); if (opening) markNotificationsRead(); }} className={`window-control notification-trigger ${unreadNotificationCount ? 'has-unread' : ''}`} aria-label={unreadNotificationCount ? `Notifications, ${unreadNotificationCount} unread` : 'Notifications'} aria-expanded={notificationOpen}>
            <Bell className="h-4 w-4" />{unreadNotificationCount > 0 && <span className="notification-unread-dot" aria-label="Unread notifications" />}
          </button>
          {notificationOpen && <div className="title-popover notification-popover" role="region" aria-label="Notifications">
            <strong>{language === 'Khmer' ? 'ការជូនដំណឹង' : 'Notifications'}{unreadNotificationCount > 0 && <span className="notification-unread-count">{unreadNotificationCount} new</span>}</strong>
            {clientNotifications.length ? clientNotifications.map((item) => <article className={`client-notification-item notification-level-${item.level} ${readNotificationIds.includes(item.id) ? '' : 'is-unread'}`} key={item.id}><div className="client-notification-heading"><strong>{item.title}</strong><button type="button" className="client-notification-delete" onClick={() => dismissNotification(item.id)} aria-label={`Delete notification: ${item.title}`}><Trash2 className="h-3 w-3" /><span>Delete</span></button></div><span>{item.message}</span><small>{new Date(item.createdAt).toLocaleString()}</small></article>) : <span>{language === 'Khmer' ? 'មិនមានការជូនដំណឹងថ្មីទេ។' : 'You’re all caught up.'}</span>}
          </div>}
        </div>
        <button type="button" className="window-control feedback-trigger" onClick={() => setFeedbackOpen(true)} aria-label="Send feedback" title="Send feedback"><MessageSquarePlus className="h-4 w-4" /><span>Feedback</span></button>
        <div className="window-controls">
          <button type="button" onClick={() => data?.minimize?.()} className="window-control" aria-label="Minimize"><Minus className="h-4 w-4" /></button>
          <button type="button" onClick={() => data?.maximize?.()} className="window-control" aria-label={windowState === 'maximized' ? 'Restore' : 'Maximize'}>{windowState === 'maximized' ? <Square className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}</button>
          <button type="button" onClick={() => data?.close?.()} className="window-control close-control" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
    {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    {activeAnnouncement && <Modal title={activeAnnouncement.level === 'warning' ? 'Important announcement' : 'New Bayon announcement'} onClose={() => setActiveAnnouncement(null)} className={`notification-announcement-modal notification-level-${activeAnnouncement.level}`}>
      <div className="notification-announcement-content">
        <span className="notification-announcement-kicker"><Bell className="h-4 w-4" /> BAYON CLIENT NOTICE</span>
        <h2>{activeAnnouncement.title}</h2>
        <p>{activeAnnouncement.message}</p>
        <small>{new Date(activeAnnouncement.createdAt).toLocaleString()}</small>
        <div className="notification-announcement-actions">
          <button type="button" onClick={() => setActiveAnnouncement(null)}>Dismiss</button>
          <button type="button" className="notification-center-button" onClick={() => { markNotificationsRead(); setNotificationOpen(true); }}>Open notifications</button>
        </div>
      </div>
    </Modal>}
    </>
  );
}

function Sidebar() {
  const activeAccount = useAccountStore((state) => state.accounts.find((account) => account.id === state.activeAccountId));
  const language = useSettingsStore((state) => state.language === 'Khmer' ? 'Khmer' : 'English');
  const [appVersion, setAppVersion] = useState('1.1.5');
  useEffect(() => { void window.electronAPI?.getAppVersion().then(setAppVersion).catch(() => {}); }, []);
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
                <span>{navigationLabels[language][index] ?? label}</span>
              </>
            )}
          </NavLink>
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-profile">
          <MinecraftAvatar username={activeAccount?.username ?? 'Steve'} skin={activeAccount?.skin} className="avatar-large" />
          <div><strong>{activeAccount?.username ?? 'Local Player'}</strong><small>{activeAccount ? 'Offline account' : 'No account selected'}</small></div>
        </div>
        <div className="client-version">
          <LogoMark />
          <span><strong>BAYON CLIENT</strong><small>v{appVersion}</small></span>
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
  const profiles = useProfileStore((state) => state.profiles);
  const activeProfileId = useProfileStore((state) => state.activeProfileId);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
  const selectProfile = useProfileStore((state) => state.selectProfile);
  const selectedVersion = activeProfile?.version ?? '26.3';
  const selectedLoader = 'Fabric';
  const [loaderMenu, setLoaderMenu] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);
  const [launchStatus, setLaunchStatus] = useState('Ready');
  const [launching, setLaunching] = useState(false);
  const [showAllNews, setShowAllNews] = useState(false);
  const [clientNews, setClientNews] = useState<ClientNotification[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [friendAdding, setFriendAdding] = useState(false);
  const [friendAddError, setFriendAddError] = useState<string | null>(null);
  const settings = useSettingsStore();

  const refreshNews = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/client-notifications`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`News service returned HTTP ${response.status}.`);
      const result = await response.json() as { notifications?: ClientNotification[] };
      const items = Array.isArray(result.notifications) ? result.notifications.filter((item) =>
        item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.message === 'string' && typeof item.createdAt === 'string',
      ) : [];
      setClientNews(items);
      setNewsError(null);
    } catch (cause) {
      setNewsError(cause instanceof Error ? cause.message : 'Could not load the latest news.');
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refreshNews);
    const interval = window.setInterval(() => void refreshNews(), 30_000);
    return () => window.clearInterval(interval);
  }, [refreshNews]);

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
  const startLaunchProcess = async (profileToLaunch = activeProfile) => {
    if (launching) return;
    if (!profileToLaunch) {
      setLaunchStatus('Create a profile before launching.');
      navigate('/profiles?create=1');
      return;
    }
    const launchVersion = profileToLaunch.version;
    setLaunching(true);
    setLaunchProgress(5);
    setLaunchStatus('Initialising launchâ€¦');
    void window.electronAPI?.updateDiscordActivity({
      state: `Launching ${selectedLoader} ${launchVersion}`,
      version: launchVersion,
      loader: selectedLoader,
    });

    const unsubscribe = window.electronAPI?.onLaunchProgress?.((data) => {
      setLaunchProgress(data.progress);
      setLaunchStatus(data.status);
      if (data.progress === 0 || data.progress === 100) {
        setLaunching(false);
        void window.electronAPI?.updateDiscordActivity({
          state: data.progress === 100 ? `Playing ${launchVersion}` : undefined,
          version: launchVersion,
          loader: selectedLoader,
        });
      }
    });

    try {
      await window.electronAPI?.launchMinecraft({
        version: launchVersion,
        loader: selectedLoader,
        profileName: profileToLaunch.name,
        profileId: profileToLaunch.id,
        username: activeAccount?.username ?? 'Player',
        memory: settings.selectedRam ?? 4,
        javaPath: settings.javaPath,
        customArgs: settings.customArgs,
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
              <button type="button" onClick={() => void startLaunchProcess()} className="launch-button" disabled={launching}>
                {launching ? <span className="launch-spinner" /> : <Play className="h-6 w-6 fill-current" />}
                <span><strong>{launching ? `PREPARING ${launchProgress}%` : 'LAUNCH GAME'}</strong><small>{selectedVersion} - {selectedLoader}</small></span>
              </button>
              <button type="button" onClick={() => setLoaderMenu(!loaderMenu)} className="launch-caret" aria-label="Select loader"><ChevronDown className="h-5 w-5" /></button>
              {loaderMenu && <div className="hero-dropdown loader-dropdown"><button type="button" onClick={() => setLoaderMenu(false)}>Fabric</button></div>}
            </div>
            <div className="hero-status">
              <span>{launchStatus === 'Ready' ? 'Ready to prepare â€” launching the game is not connected.' : launchStatus}</span>
              <button type="button" onClick={() => navigate('/play')}>Launch settings <ChevronRight className="h-3 w-3" /></button>
            </div>
            {launchProgress > 0 && <div className="home-launch-progress" role="progressbar" aria-valuenow={launchProgress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${launchProgress}%` }} /></div>}
          </div>
          <div className="home-profile-strip" aria-label="Game profiles">
            {profiles.map((profile) => <div key={profile.id} className={`home-profile-card ${profile.id === activeProfileId ? 'home-profile-card-active' : ''}`}>
              <button type="button" className="home-profile-select" onClick={() => selectProfile(profile.id)} aria-pressed={profile.id === activeProfileId}>
                <span className="home-profile-icon"><Layers3 className="h-5 w-5" /></span><span className="home-profile-copy"><strong>{profile.name}</strong><small>Fabric {profile.version}</small></span>
              </button>
              <button type="button" className="home-profile-play" aria-label={`Launch ${profile.name}`} disabled={launching} onClick={() => { selectProfile(profile.id); void startLaunchProcess(profile); }}><Play className="h-4 w-4 fill-current" /></button>
            </div>)}
            <button type="button" className="home-profile-add" onClick={() => navigate('/profiles?create=1')}><Plus className="h-5 w-5" /><span>Add a Profile</span></button>
          </div>
          <div className="dashboard-avatar" aria-label={`${activeAccount?.username ?? 'Steve'} Minecraft skin`}>
            <div className="skin-aura skin-aura-back" />
            <div className="skin-aura skin-aura-flame" />
            <div className="skin-aura skin-aura-orbit" />
            <div className="skin-aura skin-aura-core" />
            <div className="home-skin-preview">
              <Suspense fallback={<MinecraftAvatar username={activeAccount?.username ?? 'Steve'} skin={activeAccount?.skin} className="home-skin-fallback" />}>
                <SkinModelPreview imageUrl={activeAccount?.skin?.imageUrl} skinName={activeAccount?.skin?.name ?? 'Default'} rotation={0} slimArms={false} onRotationChange={() => {}} autoRotate flightPose />
              </Suspense>
            </div>
          </div>
        </div>

        <section className="news-section">
          <div className="section-heading"><h2><span className="news-icon"><Bell className="h-3 w-3" /></span> Latest News</h2><button type="button" onClick={() => setShowAllNews((current) => !current)}>{showAllNews ? 'Show Less' : 'View All'} <ChevronRight className="h-3.5 w-3.5" /></button></div>
          <div className="news-grid">
            {clientNews.slice(0, showAllNews ? 6 : 2).map((item, index) => (
              <article className={`news-card ${index % 2 === 0 ? 'news-world' : 'news-void'}`} key={item.id}>
                <div className="news-art"><span>{item.level === 'warning' ? 'IMPORTANT' : item.level === 'success' ? 'UPDATE' : 'NEWS'}</span></div>
                <div className="news-copy"><h3>{item.title}</h3><p>{item.message}</p><footer><span>{new Date(item.createdAt).toLocaleDateString()}</span><i /> <span>Bayon Client</span></footer></div>
              </article>
            ))}
            {!clientNews.length && <div className="news-empty-state" role={newsError ? 'alert' : 'status'}>
              <span>{newsError || (newsLoading ? 'Loading the latest news…' : 'No news yet. Check back for updates from Bayon.')}</span>
              {newsError && <button type="button" onClick={() => void refreshNews()}>Retry</button>}
            </div>}
          </div>
        </section>
      </section>

      <aside className="dashboard-rail">
        <button type="button" className="rail-panel store-panel" onClick={() => navigate('/store')}><ShoppingCart className="h-6 w-6" /><span><strong>Store</strong><small>Bacoins &amp; Cosmetics</small></span><ChevronRight className="ml-auto h-4 w-4" /></button>
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
                    <img
                      src={server.icon}
                      alt={server.name}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = `https://eu.mc-api.net/v3/server/favicon/${encodeURIComponent(server.address)}`;
                      }}
                    />
                  ) : (
                    <img
                      src={`https://eu.mc-api.net/v3/server/favicon/${encodeURIComponent(server.address)}`}
                      alt={server.name}
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
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

function StorePage() {
  const activeAccount = useAccountStore((state) => state.accounts.find((account) => account.id === state.activeAccountId));
  const [user, setUser] = useState<BacoinsUser | null>(null);
  const [cosmetics, setCosmetics] = useState<Cosmetic[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [signedIn, setSignedIn] = useState(Boolean(getBacoinsToken()));

  useEffect(() => {
    void fetchCosmetics().then(setCosmetics).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load the cosmetic shop.'));
  }, []);

  useEffect(() => {
    if (!getBacoinsToken() || !activeAccount) { setSignedIn(false); setUser(null); return; }
    let active = true;
    void fetchBacoinsMe(activeAccount.id).then((account) => {
      if (!active) return;
      setUser(account); setSignedIn(true); setError('');
    }).catch((cause: unknown) => {
      if (!active) return;
      const message = cause instanceof Error ? cause.message : 'Could not load your Bayon account.';
      if (message.includes('Connect this offline profile')) {
        setSignedIn(false); setUser(null); setError('');
      } else {
        setSignedIn(false); setUser(null); setError(message);
      }
    });
    return () => { active = false; };
  }, [activeAccount?.id]);

  useEffect(() => {
    const refresh = () => {
      if (!getBacoinsToken() || !activeAccount) { setSignedIn(false); setUser(null); return; }
      void fetchBacoinsMe(activeAccount.id).then((account) => { setUser(account); setSignedIn(true); }).catch(() => { setSignedIn(false); setUser(null); });
    };
    window.addEventListener('bayon:bacoins-auth-changed', refresh);
    return () => window.removeEventListener('bayon:bacoins-auth-changed', refresh);
  }, [activeAccount?.id]);

  const redeem = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy('redeem'); setError(''); setNotice('');
    try {
      if (!activeAccount) throw new Error('Select an offline profile first.');
      const result = await redeemBacoinsCode(code, activeAccount.id); setUser(result.user); setCode(''); setNotice(`${result.credited} Bacoins added to your balance.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not redeem code.'); }
    finally { setBusy(''); }
  };

  const buy = async (item: Cosmetic) => {
    setBusy(item.id); setError(''); setNotice('');
    try {
      if (!activeAccount) throw new Error('Select an offline profile first.');
      const result = await purchaseCosmetic(item.id, activeAccount.id); setUser(result.user); setNotice(`${item.name} added to your cosmetics.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not purchase cosmetic.'); }
    finally { setBusy(''); }
  };

  const equip = async (id: string | null) => {
    setBusy('equip'); setError(''); setNotice('');
    try { if (!activeAccount) throw new Error('Select an offline profile first.'); const result = await equipCosmetic(id, activeAccount.id); setUser(result.user); setNotice(id ? 'Cosmetic equipped on your Bayon profile.' : 'Profile cosmetic removed.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update your profile cosmetic.'); }
    finally { setBusy(''); }
  };

  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="page-scroll p-6">
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><PageHeader title="Bacoins Store" subtitle="Redeem Bacoins and customize your Bayon profile." />
        {user && <div className="flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3"><Coins className="h-5 w-5 text-amber-200" /><div><small className="block text-[10px] uppercase tracking-widest text-white/45">Your balance</small><strong className="text-lg">{user.bacoins.toLocaleString()} Bacoins</strong></div></div>}
      </div>

      {error && <div role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

      {!signedIn ? <GlassCard className="mb-5 flex flex-wrap items-center justify-between gap-5 p-5">
        <div><h2 className="font-semibold">Connect Bayon Client</h2><p className="mt-1 text-xs text-white/45">Sign in with the same Microsoft account in Bayon Client and the website to sync Bacoins and cosmetics.</p></div>
        <button type="button" onClick={() => window.dispatchEvent(new Event('bayon:open-bacoins-menu'))} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10">Open beta Bacoins</button>
      </GlassCard> : <div className="mb-5 grid gap-4 md:grid-cols-[1fr_auto]">
        <GlassCard className="p-5"><div className="mb-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-300/10"><Ticket className="h-5 w-5 text-amber-200" /></div><div><h2 className="font-semibold">Redeem a code</h2><p className="mt-1 text-xs text-white/45">Each code can be claimed once per account, up to its claim limit.</p></div></div><form onSubmit={(event) => void redeem(event)} className="flex flex-wrap gap-2"><input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter Bacoins code" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#111820] px-3 py-2.5 text-sm uppercase outline-none focus:border-amber-200/40" /><button type="submit" disabled={Boolean(busy)} className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-100 disabled:opacity-50">{busy === 'redeem' ? 'Redeeming…' : 'Redeem'}</button></form></GlassCard>
        <GlassCard className="flex flex-wrap items-center justify-between gap-5 p-5"><div><strong className="block">Signed in as {user?.email ?? getBacoinsIdentity()?.email ?? user?.username}</strong><span className="mt-1 block text-xs text-white/45">Connected to Minecraft profile {activeAccount?.username ?? ''}. Manage sign-in in the Minecraft Java Edition menu.</span></div></GlassCard>
      </div>}

      <div className="mb-4 flex items-center gap-2"><Sparkles className="h-4 w-4 text-sky-200" /><h2 className="text-base font-semibold">Cosmetics</h2><span className="text-xs text-white/40">{cosmetics.length} items</span></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cosmetics.map((item) => {
        const owned = Boolean(user?.ownedCosmetics.includes(item.id));
        const equipped = user?.equippedCosmetic === item.id;
        return <GlassCard key={item.id} className="overflow-hidden p-0"><div className="relative grid h-36 place-items-center border-b border-white/5 bg-gradient-to-br from-white/[0.04] to-transparent"><div className="grid h-20 w-20 place-items-center rounded-2xl border border-white/10 bg-black/20 shadow-xl" style={{ color: item.accent }}><Gem className="h-10 w-10" /></div><span className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white/55">{item.category}</span></div><div className="p-4"><h3 className="font-semibold">{item.name}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-white/45">{item.description}</p><div className="mt-4 flex items-center justify-between gap-3"><strong className="flex items-center gap-1.5 text-sm"><Coins className="h-4 w-4 text-amber-200" />{item.price.toLocaleString()}</strong>{owned ? <button type="button" disabled={Boolean(busy)} onClick={() => void equip(equipped ? null : item.id)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition disabled:opacity-50 ${equipped ? 'border-emerald-300/20 bg-emerald-300/5 text-emerald-100' : 'border-white/10 text-white/75 hover:bg-white/5'}`}>{equipped ? <><Check className="h-3.5 w-3.5" />Equipped</> : 'Equip'}</button> : <button type="button" disabled={!user || Boolean(busy)} onClick={() => void buy(item)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">{busy === item.id ? 'Buying…' : user ? 'Buy cosmetic' : 'Sign in to buy'}</button>}</div></div></GlassCard>;
      })}</div>
      <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.02] p-4 text-xs text-white/45"><strong className="text-white/65">Payments are coming later.</strong> Bacoins can currently be added only with a redeem code. No payment is collected in this Store.</div>
    </div>
  </motion.div>;
}

function ProfilesPage() {
  const location = useLocation();
  const availableVersions = useMinecraftVersions();
  const profiles = useProfileStore((state) => state.profiles);
  const activeProfileId = useProfileStore((state) => state.activeProfileId);
  const createProfileInStore = useProfileStore((state) => state.createProfile);
  const updateProfile = useProfileStore((state) => state.updateProfile);
  const removeProfile = useProfileStore((state) => state.removeProfile);
  const selectProfile = useProfileStore((state) => state.selectProfile);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('26.3');

  useEffect(() => { if (new URLSearchParams(location.search).get('create') === '1') setCreating(true); }, [location.search]);

  const createProfile = (event: React.FormEvent) => {
    event.preventDefault();
    const profileName = name.trim() || `Minecraft ${version}`;
    const profile = createProfileInStore(profileName, version);
    selectProfile(profile.id);
    setName('');
    setCreating(false);
  };

  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="page-scroll p-6">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-4"><PageHeader title="Profiles" subtitle="Create and configure Minecraft versions and launch modes." /><PrimaryButton onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create version</PrimaryButton></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {profiles.map((profile) => <VersionProfileCard key={profile.id} profile={profile} availableVersions={availableVersions} active={profile.id === activeProfileId} onSelect={() => selectProfile(profile.id)} onUpdate={(updates) => updateProfile(profile.id, updates)} onRemove={() => removeProfile(profile.id)} />)}
        <button type="button" onClick={() => setCreating(true)} className="profile-create-card group">
          <span className="profile-create-icon"><Plus className="h-7 w-7 transition-transform duration-200 group-hover:rotate-90" /></span>
          <strong>Create profile</strong>
          <small>Add another isolated Minecraft version</small>
        </button>
      </div>
      {creating && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}><form onSubmit={createProfile} className="w-full max-w-md rounded-xl border border-white/10 bg-[#0e141b] p-5 shadow-2xl"><h3 className="text-lg font-semibold">Create version</h3><p className="mb-5 mt-1 text-xs text-white/45">Create a Fabric profile for Minecraft {version}.</p><div className="grid gap-4"><label className="grid gap-2 text-xs text-white/55">Profile name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={`Minecraft ${version}`} className="rounded-lg border border-white/10 bg-[#121820] px-3 py-2.5 text-sm text-white outline-none" /></label><label className="grid gap-2 text-xs text-white/55">Minecraft version<MinecraftVersionDropdown value={version} onChange={setVersion} availableVersions={availableVersions} /></label><label className="grid gap-2 text-xs text-white/55">Loader<div className="rounded-lg border border-white/10 bg-[#121820] px-3 py-2.5 text-sm text-white">Fabric</div></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-white/65">Cancel</button><button type="submit" className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black">Create version</button></div></form></div>}
    </div>
  </motion.div>;
}

function VersionProfileCard({ profile, availableVersions, active, onSelect, onUpdate, onRemove }: { profile: VersionProfile; availableVersions: string[]; active: boolean; onSelect: () => void; onUpdate: (updates: Partial<Pick<VersionProfile, 'name' | 'version'>>) => void; onRemove: () => void }) {
  const [mods, setMods] = useState<InstalledMod[]>([]);
  const [addModOpen, setAddModOpen] = useState(false);
  const [addResourcePackOpen, setAddResourcePackOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { void window.electronAPI?.getInstalledMods(profile.id).then(setMods).catch(() => {}); }, [profile.id]);
  return <GlassCard className={`profile-card overflow-visible p-0 ${active ? 'profile-card-active' : ''}`}>
    <div className="profile-card-cover">
      <div className="profile-card-heading">
        <div className="profile-card-icon"><Layers3 className="h-6 w-6" /></div>
        <div className="min-w-0 flex-1">
          <input aria-label="Profile name" value={profile.name} onChange={(event) => onUpdate({ name: event.target.value })} className="w-full truncate bg-transparent text-base font-bold outline-none focus:text-sky-100" />
          <p className="mt-1 truncate text-sm text-white/60">Bayon Client + Fabric {profile.version}</p>
        </div>
        {active && <span className="profile-active-mark" title="Selected for launch"><Check className="h-4 w-4" /></span>}
      </div>
      <div className="profile-card-version">
        <label className="grid min-w-0 flex-1 gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white/45">Minecraft version<MinecraftVersionDropdown value={profile.version} onChange={(value) => onUpdate({ version: value })} availableVersions={availableVersions} /></label>
        <div className="grid min-w-0 flex-1 gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white/45">Mod loader<div className="profile-loader-value">Fabric</div></div>
      </div>
    </div>
    <div className="profile-card-actions">
      <button type="button" onClick={onSelect} className="profile-action profile-action-primary"><Check className="h-4 w-4" />Use on Home</button>
      <button type="button" onClick={() => setAddModOpen(true)} className="profile-action"><Layers3 className="h-4 w-4" />Mods <span className="profile-action-count">{mods.length}</span></button>
      <button type="button" onClick={() => setAddResourcePackOpen(true)} className="profile-action"><FileImage className="h-4 w-4" />Resource Packs</button>
      <div className="relative">
        <button type="button" aria-label="More profile actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="profile-action profile-action-menu"><MoreHorizontal className="h-5 w-5" /></button>
        {menuOpen && <><button type="button" aria-label="Close profile actions" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} /><div className="profile-card-menu">
          <button type="button" onClick={() => { onSelect(); setMenuOpen(false); }}>Set as active profile</button>
          <button type="button" className="profile-card-menu-danger" onClick={() => { onRemove(); setMenuOpen(false); }}>Remove profile</button>
        </div></>}
      </div>
    </div>
    {addModOpen && <AddModModal onClose={() => setAddModOpen(false)} installedMods={mods} onModsChange={setMods} profileId={profile.id} gameVersion={profile.version} loader={profile.loader} />}
    {addResourcePackOpen && <AddModModal onClose={() => setAddResourcePackOpen(false)} installedMods={mods} onModsChange={setMods} profileId={profile.id} gameVersion={profile.version} loader={profile.loader} projectType="resourcepack" />}
  </GlassCard>;
}

function AccountsPage() {
  const navigate = useNavigate();
  const accounts = useAccountStore((state) => state.accounts);
  const activeAccountId = useAccountStore((state) => state.activeAccountId);
  const createOfflineAccount = useAccountStore((state) => state.createOfflineAccount);
  const selectAccount = useAccountStore((state) => state.selectAccount);
  const removeAccount = useAccountStore((state) => state.removeAccount);
  const updateAccountEmail = useAccountStore((state) => state.updateAccountEmail);
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [emailAccountId, setEmailAccountId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [microsoftIdentity, setMicrosoftIdentity] = useState(getBacoinsIdentity);
  const [microsoftBusy, setMicrosoftBusy] = useState(false);
  const [microsoftNotice, setMicrosoftNotice] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);
  const [accountMenuId, setAccountMenuId] = useState<string | null>(null);
  const [accountChoiceOpen, setAccountChoiceOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setMicrosoftIdentity(getBacoinsIdentity());
    window.addEventListener('bayon:bacoins-auth-changed', refresh);
    return () => window.removeEventListener('bayon:bacoins-auth-changed', refresh);
  }, []);

  const connectMicrosoft = async () => {
    setMicrosoftBusy(true);
    setMicrosoftNotice('');
    try {
      const selected = accounts.find((account) => account.id === activeAccountId);
      await signInWithMicrosoft(selected ? { id: selected.id, username: selected.username } : undefined);
      setMicrosoftIdentity(getBacoinsIdentity());
      setMicrosoftNotice('Microsoft account connected. Bacoins will sync with the Store.');
    } catch (cause) {
      setMicrosoftNotice(cause instanceof Error ? cause.message : 'Could not connect the Microsoft account.');
    } finally {
      setMicrosoftBusy(false);
    }
  };

  const saveOfflineEmail = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = accounts.find((item) => item.id === emailAccountId);
    if (!account) return;
    const email = emailDraft.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    updateAccountEmail(account.id, email || null);
    setEmailAccountId(null);
    setEmailDraft('');
  };

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

  const visibleAccounts = [...accounts]
    .filter((account) => account.username.toLowerCase().includes(accountQuery.trim().toLowerCase()))
    .sort((a, b) => (newestFirst ? 1 : -1) * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="page-scroll p-6">
      <div className="account-page">
        <div className="account-page-heading">
          <PageHeader title="Accounts" subtitle="Manage your Minecraft profiles and secure Bayon account connections." />
          <button type="button" className="launch-process-button" onClick={() => setAccountChoiceOpen(true)}><Plus className="h-4 w-4" /> Add Account</button>
        </div>
        {microsoftNotice && <div className="account-auth-notice" role="status"><KeyRound className="h-4 w-4" /><span>{microsoftNotice}{microsoftIdentity?.email && <> <strong>{microsoftIdentity.email}</strong></>}</span></div>}
        <section className="account-list-section">
          <div className="account-list-heading"><div><h2>Your Accounts</h2><p>{accounts.length} local {accounts.length === 1 ? 'account' : 'accounts'} saved on this device</p></div></div>
          <div className="account-toolbar">
            <label className="account-search"><Search className="h-4 w-4" /><input value={accountQuery} onChange={(event) => setAccountQuery(event.target.value)} placeholder="Search accounts..." aria-label="Search accounts" /></label>
            <button type="button" className="account-sort-button" onClick={() => setNewestFirst((value) => !value)}><ChevronDown className={`h-4 w-4 transition-transform ${newestFirst ? '' : 'rotate-180'}`} />Date added</button>
          </div>
          {accounts.length === 0 ? (
            <div className="account-empty"><UserRound className="h-6 w-6" /><strong>No accounts yet</strong><span>Create an account to get started. It will be saved on this device.</span><button type="button" onClick={() => setAccountChoiceOpen(true)}>Add account</button></div>
          ) : (
            <div className="account-card-grid">
              {visibleAccounts.map((account) => (
                <article className={`account-profile-card ${activeAccountId === account.id ? 'account-profile-card-active' : ''}`} key={account.id}>
                  <button type="button" className="account-profile-main" onClick={() => selectAccount(account.id)} aria-pressed={activeAccountId === account.id}>
                    <MinecraftAvatar username={account.username} skin={account.skin} className="avatar-large account-profile-avatar" />
                    <span className="account-profile-copy"><strong>{account.username}</strong><small>Local account / Added {new Date(account.createdAt).toLocaleDateString()}</small></span>
                    {activeAccountId === account.id && <span className="account-profile-check" title="Active account"><Check className="h-4 w-4" /></span>}
                  </button>
                  <div className="account-profile-actions">
                    <button type="button" className="account-profile-skins" onClick={() => { selectAccount(account.id); navigate('/skins'); }}><FileImage className="h-3.5 w-3.5" />Skins</button>
                    <div className="relative">
                      <button type="button" className="account-profile-more" aria-label={`More actions for ${account.username}`} aria-expanded={accountMenuId === account.id} onClick={() => setAccountMenuId((current) => current === account.id ? null : account.id)}><MoreHorizontal className="h-5 w-5" /></button>
                      {accountMenuId === account.id && <><button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Close account menu" onClick={() => setAccountMenuId(null)} /><div className="account-profile-menu">
                        {activeAccountId !== account.id && <button type="button" onClick={() => { selectAccount(account.id); setAccountMenuId(null); }}>Use account</button>}
                        <button type="button" onClick={() => { setEmailAccountId(account.id); setEmailDraft(account.email ?? ''); setAccountMenuId(null); }}><Mail className="h-3.5 w-3.5" />{account.email ? 'Edit email' : 'Add email'}</button>
                        <button type="button" onClick={() => { selectAccount(account.id); navigate('/store'); setAccountMenuId(null); }}><ShoppingCart className="h-3.5 w-3.5" />Open Store</button>
                        <button type="button" className="account-profile-remove" onClick={() => { setConfirmRemove(account.id); setAccountMenuId(null); }}>Remove account</button>
                      </div></>}
                    </div>
                  </div>
                </article>
              ))}
              <button type="button" className="account-add-card" onClick={() => setAccountChoiceOpen(true)}><Plus className="h-9 w-9" /><strong>Add account</strong></button>
              {visibleAccounts.length === 0 && <div className="account-search-empty">No accounts match: {accountQuery}.</div>}
            </div>
          )}
        </section>
      </div>
      {accountChoiceOpen && <Modal title="Add Account" onClose={() => setAccountChoiceOpen(false)}>
        <div className="account-choice-list">
          <button type="button" className="account-choice-option" onClick={() => { setAccountChoiceOpen(false); setError(''); setCreateOpen(true); }}>
            <span className="account-choice-icon"><UserRound className="h-5 w-5" /></span>
            <span><strong>Offline account</strong><small>Create a local Minecraft profile with a username. No Microsoft sign-in required.</small></span>
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" className="account-choice-option" disabled={microsoftBusy} onClick={() => { setAccountChoiceOpen(false); void connectMicrosoft(); }}>
            <span className="account-choice-icon"><KeyRound className="h-5 w-5" /></span>
            <span><strong>{microsoftBusy ? 'Connecting…' : 'Online account'}</strong><small>Continue with Microsoft for Bayon account, Bacoins, and cosmetic sync. Minecraft sign-in is not available yet.</small></span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </Modal>}
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
      {emailAccountId && (
        <Modal title="Offline profile contact email" onClose={() => { setEmailAccountId(null); setEmailDraft(''); }}>
          <form className="offline-account-form" onSubmit={saveOfflineEmail}>
            <p>This optional email is saved on this device without verification. It is contact information only; Microsoft sign-in protects Bacoins and account sync.</p>
            <label htmlFor="offline-contact-email">Email address</label>
            <input id="offline-contact-email" type="email" autoComplete="email" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} placeholder="you@example.com" />
            <small>Leave blank and save to remove it from this offline profile.</small>
            <div className="offline-form-actions"><button type="button" onClick={() => { setEmailAccountId(null); setEmailDraft(''); }}>Cancel</button><button type="submit">Save email</button></div>
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
  const availableVersions = useMinecraftVersions();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Ready to prepare launch options.');
  const [launching, setLaunching] = useState(false);
  const settings = useSettingsStore();
  const activeProfile = useProfileStore((state) => state.profiles.find((profile) => profile.id === state.activeProfileId));
  const updateProfile = useProfileStore((state) => state.updateProfile);
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
        version: activeProfile?.version ?? '26.3',
        loader: 'Fabric',
        profileName: activeProfile?.name,
        profileId: activeProfile?.id,
        username: activeAccount?.username ?? 'Player',
                memory: settings.selectedRam,
        javaPath: settings.javaPath,
        customArgs: settings.customArgs,
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
              <MinecraftVersionDropdown value={activeProfile?.version ?? '26.3'} onChange={(value) => { if (activeProfile) updateProfile(activeProfile.id, { version: value }); }} availableVersions={availableVersions} />
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
                <span className="truncate text-sm text-white/80">{settings.javaPath || 'Auto-detected Java'}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm text-white/70"><span>Memory Allocation</span><span>{settings.selectedRam} GB</span></div>
              <input type="range" min={4} max={16} step={1} value={settings.selectedRam} onChange={(e) => settings.setSelectedRam(Number(e.target.value))} className="slider w-full" aria-label="Minecraft memory allocation" />
            </div>
            <div>
              <Label>Resolution</Label>
              <Select value={settings.resolution} onChange={settings.setResolution} options={['1920x1080', '2560x1440', '3840x2160']} />
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
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
              <span>{activeProfile?.version ?? '26.3'}</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm text-white/70">
              <span>Java</span>
              <span>21</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm text-white/70">
              <span>Memory</span>
              <span>{settings.selectedRam} GB</span>
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
  const activeProfileId = useProfileStore((state) => state.activeProfileId);
  const activeProfile = useProfileStore((state) => state.profiles.find((profile) => profile.id === state.activeProfileId));
  const [mods, setMods] = useState<InstalledMod[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [projectType, setProjectType] = useState<ModrinthProjectType>('mod');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [addModOpen, setAddModOpen] = useState(false);
  const [bayonModStatus, setBayonModStatus] = useState<BayonModStatus | null>(null);
  const [bayonModBusy, setBayonModBusy] = useState(false);
  const [bayonModError, setBayonModError] = useState('');

  useEffect(() => {
    if (window.electronAPI?.getInstalledMods) {
      window.electronAPI.getInstalledMods(activeProfileId ?? undefined).then(setMods).catch(() => {});
    }
  }, [activeProfileId]);

  useEffect(() => {
    setBayonModStatus(null);
    if (window.electronAPI?.getBayonModStatus) {
      window.electronAPI.getBayonModStatus(activeProfileId ?? undefined).then(setBayonModStatus).catch((cause: unknown) => {
        setBayonModStatus({ available: false, installed: false, version: null, error: cause instanceof Error ? cause.message : 'Could not check the Bayon mod.' });
      });
    }
  }, [activeProfileId]);

  const contentLabel = modContentTabs.find((tab) => tab.id === projectType)?.label ?? 'Mods';
  const contentItems = mods.filter((mod) => (mod.projectType || 'mod') === projectType);
  const categories = useMemo(() => ['All', ...new Set(contentItems.map((mod) => mod.category || 'Utility'))], [contentItems]);
  const filteredMods = contentItems.filter((mod) => (category === 'All' || mod.category === category) && `${mod.name} ${mod.description}`.toLowerCase().includes(search.toLowerCase()));

  const toggleMod = async (id: string, currentEnabled: boolean) => {
    if (window.electronAPI?.toggleMod) {
      try {
        const updated = await window.electronAPI.toggleMod(id, !currentEnabled, activeProfileId ?? undefined);
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
        const updated = await window.electronAPI.uninstallMod(removeId, activeProfileId ?? undefined);
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
    void window.electronAPI?.openModsFolder(activeProfileId ?? undefined, projectType);
  };

  const installBayonMod = async () => {
    if (!window.electronAPI?.installBayonMod || !activeProfile) return;
    setBayonModBusy(true);
    setBayonModError('');
    try {
      const status = await window.electronAPI.installBayonMod(activeProfile.id);
      setBayonModStatus(status);
    } catch (cause) {
      setBayonModError(cause instanceof Error ? cause.message : 'Could not install Bayon Client into this profile.');
    } finally {
      setBayonModBusy(false);
    }
  };

  const removeBayonMod = async () => {
    if (!window.electronAPI?.uninstallBayonMod || !activeProfile) return;
    setBayonModBusy(true);
    setBayonModError('');
    try {
      setBayonModStatus(await window.electronAPI.uninstallBayonMod(activeProfile.id));
    } catch (cause) {
      setBayonModError(cause instanceof Error ? cause.message : 'Could not remove Bayon Client from this profile.');
    } finally {
      setBayonModBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="page-scroll p-5">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <PageHeader title="Content Library" subtitle={activeProfile ? `${contentLabel} for ${activeProfile.name} · Minecraft ${activeProfile.version}` : 'Select a profile to manage its content'} />
          <div className="flex items-center gap-3">
            <button type="button" onClick={openFolder} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white/80 transition hover:bg-white/8">
              <FolderOpen className="h-4 w-4" /> Open folder
            </button>
            <PrimaryButton onClick={() => activeProfile && setAddModOpen(true)}><Plus className="h-4 w-4" /> Browse {contentLabel}</PrimaryButton>
          </div>
        </div>

        <GlassCard className="flex flex-col gap-4 border-white/10 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5"><Layers3 className="h-5 w-5 text-white/80" /></span>
            <div>
              <h2 className="font-semibold">Bayon Client Fabric HUD</h2>
              <p className="mt-1 text-xs text-white/50">FPS, keystrokes, CPS, coordinates, ping, direction, armor and effects · Minecraft 26.2 · Fabric</p>
              {bayonModStatus?.installed && <p className="mt-2 text-xs text-emerald-300">Installed in this profile · v{bayonModStatus.installedVersion}</p>}
              {!bayonModStatus?.available && bayonModStatus?.error && <p className="mt-2 text-xs text-amber-200/80">{bayonModStatus.error}</p>}
              {bayonModError && <p role="alert" className="mt-2 text-xs text-red-300">{bayonModError}</p>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {bayonModStatus?.installed && <button type="button" disabled={bayonModBusy} onClick={() => void removeBayonMod()} className="rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-xs text-white/70 transition hover:bg-white/8 disabled:opacity-50">Remove from profile</button>}
            <button type="button" disabled={!activeProfile || activeProfile.version !== '26.2' || bayonModBusy || !bayonModStatus?.available} onClick={() => void installBayonMod()} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-45">
              {bayonModBusy ? <span className="java-spinner" /> : <Download className="h-4 w-4" />}
              {bayonModBusy ? 'Installing…' : bayonModStatus?.installed ? 'Update Bayon mod' : 'Install Bayon mod'}
            </button>
          </div>
          {activeProfile && activeProfile.version !== '26.2' && <p className="text-xs text-amber-200/75 md:basis-full">Select a Minecraft 26.2 profile to install this build. Other game versions are not claimed as compatible.</p>}
        </GlassCard>

        <div className="flex gap-2 overflow-x-auto rounded-xl border border-white/8 bg-[#0d1218] p-1.5" role="tablist" aria-label="Minecraft content type">
          {modContentTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={projectType === tab.id} onClick={() => { setProjectType(tab.id); setCategory('All'); setSearch(''); }} className={`shrink-0 rounded-lg px-4 py-2 text-xs font-medium transition ${projectType === tab.id ? 'border border-white/10 bg-[#202a34] text-white shadow' : 'text-white/50 hover:bg-white/5 hover:text-white/85'}`}>{tab.label}</button>)}
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
          <EmptyState title={`No ${contentLabel.toLowerCase()} installed`} text={`Browse ${contentLabel.toLowerCase()} on Modrinth to add them to this profile.`} />
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
                      <div className="text-xs uppercase tracking-[0.12em] text-white/40">{projectType === 'modpack' ? 'Modpack' : mod.category || contentLabel.replace(/s$/, '')}</div>
                    </div>
                  </div>
                  {projectType === 'mod'
                    ? <Toggle checked={mod.enabled} onChange={() => void toggleMod(mod.id, mod.enabled)} />
                    : <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">Downloaded</span>}
                </div>
                <div className="p-4">
                  <p className="line-clamp-2 text-xs text-white/60">{mod.description || 'Installed via Modrinth'}</p>
                  <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.12em] text-white/45">
                    <span>{mod.version}</span>
                    <span>{projectType === 'datapack' && mod.worldName ? `World: ${mod.worldName}` : projectType === 'modpack' ? 'Modrinth pack file' : mod.loader}</span>
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
        <Modal title={`Remove ${contentLabel.toLowerCase().replace(/s$/, '')}`} onClose={() => setRemoveId(null)}>
          <div className="space-y-4 text-sm text-white/65">
            <p>Remove this {contentLabel.toLowerCase().replace(/s$/, '')} from {activeProfile?.name ?? 'this profile'}?</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRemoveId(null)} className="rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-white/80">Cancel</button>
              <button type="button" onClick={removeMod} className="rounded-xl bg-red-500/15 px-3 py-2 text-red-200">Remove</button>
            </div>
          </div>
        </Modal>
      )}
      {addModOpen && activeProfile && <AddModModal onClose={() => setAddModOpen(false)} installedMods={mods} onModsChange={setMods} profileId={activeProfile.id} gameVersion={activeProfile.version} loader={activeProfile.loader} projectType={projectType} />}
    </motion.div>
  );
}

function AddModModal({ onClose, installedMods, onModsChange, profileId = 'default', gameVersion: initialGameVersion = '26.3', loader: initialLoader = 'Fabric', projectType: initialProjectType = 'mod' }: { onClose: () => void; installedMods: InstalledMod[]; onModsChange: (mods: InstalledMod[]) => void; profileId?: string; gameVersion?: string; loader?: string; projectType?: ModrinthProjectType }) {
  const availableVersions = useMinecraftVersions();
  const [source, setSource] = useState<ModCatalogSource>('modrinth');
  const [projectType, setProjectType] = useState<ModrinthProjectType>(initialProjectType);
  const [query, setQuery] = useState('');
  const [gameVersion, setGameVersion] = useState(initialGameVersion);
  const [loader, setLoader] = useState(initialLoader);
  const [results, setResults] = useState<ModCatalogResult[]>([]);
  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [hasCurseForgeKey, setHasCurseForgeKey] = useState(false);
  const [keyStatusError, setKeyStatusError] = useState('');
  const [openError, setOpenError] = useState('');
  const [installingIds, setInstallingIds] = useState<Record<string, boolean>>({});
  const [worlds, setWorlds] = useState<string[]>([]);
  const [worldName, setWorldName] = useState('');
  const contentLabel = modContentTabs.find((tab) => tab.id === projectType)?.label ?? 'Mods';

  useEffect(() => {
    if (projectType !== 'datapack' || !window.electronAPI?.getMinecraftWorlds) return;
    window.electronAPI.getMinecraftWorlds(profileId).then(setWorlds).catch(() => setWorlds([]));
  }, [profileId, projectType]);

  useEffect(() => {
    if (!window.electronAPI) {
      setKeyStatusError('CurseForge key status is only available in the desktop app.');
      return;
    }
    window.electronAPI.hasCurseForgeKey()
      .then(setHasCurseForgeKey)
      .catch((cause: unknown) => setKeyStatusError(cause instanceof Error ? cause.message : 'Could not check CurseForge API key status.'));
  }, []);

  const pageSize = source === 'curseforge' ? 20 : 25;

  const performSearch = async (targetQuery: string, targetPage: number) => {
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const matches = await searchModCatalog({ source, query: targetQuery.trim(), gameVersion, loader, projectType, offset: targetPage * pageSize });
      setResults(matches);
      setHasNextPage(matches.length === pageSize);
    } catch (cause) {
      setResults([]);
      setHasNextPage(false);
      setError(cause instanceof Error ? cause.message : 'Could not search this mod catalog.');
    } finally {
      setLoading(false);
    }
  };

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (page === 0) void performSearch(query, 0);
    else setPage(0);
  };

  useEffect(() => {
    void performSearch(query, page);
  }, [source, gameVersion, loader, projectType, page]);

  const installMod = async (result: ModCatalogResult) => {
    if (!window.electronAPI?.installModrinthMod) return;
    setInstallingIds((prev) => ({ ...prev, [result.id]: true }));
    setError('');
    try {
      const updated = await window.electronAPI.installModrinthMod({
        projectId: result.id,
        gameVersion,
        loader,
        profileId,
        projectType,
        worldName: projectType === 'datapack' ? worldName || undefined : undefined,
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
    <Modal title={`Browse ${contentLabel}`} onClose={onClose} className="mod-catalog-modal">
      <div className="mod-catalog">
        <p className="mod-catalog-note">Search {contentLabel.toLowerCase()} on Modrinth and add them to this profile.</p>
        <div className="mod-content-tabs" role="tablist" aria-label="Modrinth content type">
          {modContentTabs.map((tab) => <button type="button" role="tab" aria-selected={projectType === tab.id} key={tab.id} className={projectType === tab.id ? 'mod-content-tab-active' : ''} onClick={() => { setPage(0); setProjectType(tab.id); if (tab.id !== 'mod') setSource('modrinth'); setResults([]); setHasNextPage(false); setError(''); setSearched(false); }}>{tab.label}</button>)}
        </div>
        <div className="mod-source-tabs" role="tablist" aria-label="Mod catalog">
          <button type="button" role="tab" aria-selected={source === 'modrinth'} className={source === 'modrinth' ? 'mod-source-active' : ''} onClick={() => { setPage(0); setSource('modrinth'); setResults([]); setHasNextPage(false); setError(''); setSearched(false); }}>Modrinth</button>
          {projectType === 'mod' && <button type="button" role="tab" aria-selected={source === 'curseforge'} className={source === 'curseforge' ? 'mod-source-active' : ''} onClick={() => { setPage(0); setSource('curseforge'); setResults([]); setHasNextPage(false); setError(''); setSearched(false); }}>CurseForge {hasCurseForgeKey ? <span className="source-ready">API ready</span> : <span className="source-key-needed">API key needed</span>}</button>}
        </div>
        {keyStatusError && <p className="mod-catalog-subtle" role="status">{keyStatusError}</p>}
        <form className="mod-search-form" onSubmit={search}>
          <label className="mod-search-field">
            <Search className="h-4 w-4" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${contentLabel.toLowerCase()}`} autoFocus />
          </label>
          <div className="mod-search-filters">
            <label><span>Version</span><MinecraftVersionDropdown value={gameVersion} onChange={(value) => { setPage(0); setGameVersion(value); }} availableVersions={availableVersions} /></label>
            {(projectType === 'mod' || projectType === 'modpack') && <label><span>Loader</span><select value={loader} onChange={(event) => { setPage(0); setLoader(event.target.value); }}>{['Fabric', 'Forge', 'NeoForge', 'Quilt'].map((value) => <option key={value}>{value}</option>)}</select></label>}
            <button type="submit" disabled={loading}>{loading ? 'Searchingâ€¦' : 'Search'}</button>
          </div>
        </form>
        {projectType === 'datapack' && <label className="mod-world-select"><span>Install to world (optional)</span><select value={worldName} onChange={(event) => setWorldName(event.target.value)}><option value="">Save to Data Packs folder for later</option>{worlds.map((world) => <option key={world}>{world}</option>)}</select><small>If no world is selected, move the downloaded pack into a world's datapacks folder to use it.</small></label>}
        {error && <p className="mod-catalog-error" role="alert">{error}</p>}
        {openError && <p className="mod-catalog-error" role="alert">{openError}</p>}
        <div className="mod-catalog-results" aria-live="polite">
          {loading && <div className="mod-catalog-empty">Searching {source === 'modrinth' ? 'Modrinth' : 'CurseForge'}â€¦</div>}
          {!loading && results.map((result) => {
            const isInstalled = installedMods.some((m) => m.id === result.id && (m.projectType || 'mod') === projectType);
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
                          : 'border border-white/20 bg-[#202a34] text-white hover:bg-[#2b3948] active:scale-95',
                      ].join(' ')}
                    >
                      {isInstalled ? 'Added ?' : installingIds[result.id] ? 'Downloading?' : projectType === 'modpack' ? 'Download pack' : `Add ${contentLabel.replace(/s$/, '')}`}
                    </button>
                  )}
                  <button type="button" className="mod-project-button" onClick={() => openProject(result)}>Open project <Globe className="h-3.5 w-3.5" /></button>
                </div>
              </article>
            );
          })}
          {!loading && !error && searched && results.length === 0 && <div className="mod-catalog-empty">No matching {contentLabel.toLowerCase()} for Minecraft {gameVersion}{projectType === 'mod' || projectType === 'modpack' ? ` ? ${loader}` : ''}.</div>}
          {!loading && !searched && <div className="mod-catalog-empty">Search Modrinth for {contentLabel.toLowerCase()}.</div>}
          {!loading && searched && !error && (page > 0 || hasNextPage) && <nav className="mod-catalog-pagination" aria-label="Catalog pages">
            <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>Previous</button>
            <span>Page {page + 1}</span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={!hasNextPage}>Next</button>
          </nav>}
        </div>
      </div>
    </Modal>
  );
}

function SkinsPage() {
  const [rotation, setRotation] = useState(22);
  const [armModel, setArmModel] = useState('Classic');
  const [uploadError, setUploadError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const activeAccount = useAccountStore((state) => state.accounts.find((account) => account.id === state.activeAccountId));
  const updateAccountSkin = useAccountStore((state) => state.updateAccountSkin);
  const activeSkin = activeAccount?.skin;

  const uploadSkin = (file?: File) => {
    setUploadError('');
    if (!file) return;
    if (!activeAccount) {
      setUploadError('Create or select an offline account before assigning a skin.');
      return;
    }
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

      const normalized = document.createElement('canvas');
      normalized.width = 64;
      normalized.height = image.height;
      const context = normalized.getContext('2d');
      if (!context) {
        setUploadError('The selected skin could not be processed.');
        return;
      }
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, 64, image.height);
      updateAccountSkin(activeAccount.id, {
        name: file.name.replace(/\.png$/i, '') || activeAccount.username,
        imageUrl: normalized.toDataURL('image/png'),
        legacy: image.height === 32,
      });
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
          <PageHeader title="Skins" subtitle={activeAccount ? `Skin saved to ${activeAccount.username}'s offline profile` : 'Select an offline account to assign a skin'} />
          <div className="mt-5 rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,#0f0f0f,#090909)] p-6">
            <div className="flex items-center justify-between">
              <div><div className="text-xs uppercase tracking-[0.18em] text-white/45">Skin preview</div><div className="mt-1 text-sm text-white/75">{activeSkin?.name ?? 'Default'}</div></div>
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
                <SkinModelPreview imageUrl={activeSkin?.imageUrl} skinName={activeSkin?.name ?? 'Default'} rotation={rotation} slimArms={armModel === 'Slim'} onRotationChange={setRotation} />
              </Suspense>
            </div>
            {activeSkin?.imageUrl && <div className="uploaded-texture"><FileImage className="h-4 w-4" /><span>Profile skin texture</span><img src={activeSkin.imageUrl} alt={`${activeSkin.name} skin texture`} /></div>}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-medium text-white/80">Profile Skin</div>
            <input ref={fileInput} type="file" accept="image/png,.png" hidden onChange={(event) => { uploadSkin(event.target.files?.[0]); event.currentTarget.value = ''; }} />
            <button type="button" disabled={!activeAccount} onClick={() => fileInput.current?.click()} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-xs uppercase tracking-[0.14em] text-white/70 disabled:cursor-not-allowed disabled:opacity-40"><ImagePlus className="h-4 w-4" /> Upload skin</button>
          </div>
          <div className="space-y-3">
            <button type="button" disabled={!activeAccount} onClick={() => activeAccount && updateAccountSkin(activeAccount.id, null)} className={['flex w-full items-center justify-between rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40', !activeSkin ? 'border-white/20 bg-white/8' : 'border-white/10 bg-[#111111]'].join(' ')}>
              <div className="flex items-center gap-3"><MinecraftAvatar username={activeAccount?.username ?? 'Steve'} className="skin-gallery-avatar" /><div><div className="font-medium text-white/86">Default</div><div className="text-xs uppercase tracking-[0.1em] text-white/40">Minecraft default</div></div></div>
              {!activeSkin && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
            </button>
            {activeSkin && <div className="flex items-center justify-between rounded-xl border border-white/20 bg-white/8 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <img className="skin-gallery-avatar rounded-xl border border-white/10 object-contain [image-rendering:pixelated]" src={activeSkin.imageUrl} alt="" />
                <div className="min-w-0"><div className="truncate font-medium text-white/86">{activeSkin.name}</div><div className="text-xs uppercase tracking-[0.1em] text-white/40">Active profile skin</div></div>
              </div>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white" />
            </div>}
          </div>
          {uploadError && <p role="alert" className="mt-3 text-xs text-red-300">{uploadError}</p>}
          <div className="mt-5 flex gap-3">
            <SecondaryButton onClick={() => { if (activeAccount) updateAccountSkin(activeAccount.id, null); setUploadError(''); if (fileInput.current) fileInput.current.value = ''; }}>
              <RefreshIcon />
              Reset Skin
            </SecondaryButton>
          </div>
        </GlassCard>
      </div>
    </motion.div>
  );
}

function DiscordPresenceSettings({ enabled, onEnabledChange }: { enabled: boolean; onEnabledChange: (enabled: boolean) => void }) {
  const [status, setStatus] = useState<DiscordPresenceStatus>({ state: 'not-configured', message: 'Discord Rich Presence is turned off.', configured: false });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const unsubscribe = api.onDiscordPresenceStatus(setStatus);
    void api.getDiscordPresenceStatus().then(setStatus).catch(() => {});
    return unsubscribe;
  }, []);

  return <section className="discord-settings-card md:col-span-2">
    <div className="discord-settings-heading"><span className="discord-settings-icon"><Radio className="h-5 w-5" /></span><div><strong>Discord Rich Presence</strong><small>Automatically connect to Discord and show Bayon Client activity.</small></div><Toggle checked={enabled} onChange={onEnabledChange} /></div>
    <div className={'discord-settings-connection'}><span className={'discord-status-dot discord-status-' + status.state} /><div><strong>{status.state === 'connected' ? 'Connected' : status.state === 'connecting' ? 'Connecting' : status.state === 'discord-not-running' ? 'Discord is not running' : status.state === 'error' ? 'Connection error' : enabled ? 'Starting connection' : 'Turned off'}</strong><small>{status.message}</small></div></div>
    <p className="discord-settings-help">Keep the Discord desktop app open and enable <strong>User Settings ? Activity Privacy ? Share your activity status</strong>.</p>
  </section>;
}

function SettingsPage({ startupSettingsError }: { startupSettingsError: string | null }) {
  const availableVersions = useMinecraftVersions();
  const settings = useSettingsStore();
  const activeProfile = useProfileStore((state) => state.profiles.find((profile) => profile.id === state.activeProfileId));
  const updateProfile = useProfileStore((state) => state.updateProfile);
  const [javaRuntimes, setJavaRuntimes] = useState<ManagedJavaRuntime[]>([]);
  const [installingJava, setInstallingJava] = useState<Record<number, boolean>>({});
  const [javaProgress, setJavaProgress] = useState<Record<number, JavaRuntimeProgress>>({});
  const [javaError, setJavaError] = useState('');
  const [argumentsDraft, setArgumentsDraft] = useState(settings.customArgs);
  const [argumentsSaved, setArgumentsSaved] = useState(false);
  const [directories, setDirectories] = useState<ClientDirectories | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    let active = true;
    const api = window.electronAPI;
    if (!api) return;
    api.getClientDirectories().then((value) => { if (active) setDirectories(value); }).catch(() => {});
    api.getManagedJavaRuntimes(settings.javaPath).then((runtimes) => { if (active) setJavaRuntimes(runtimes); }).catch((cause: unknown) => {
      if (active) setJavaError(cause instanceof Error ? cause.message : 'Could not load managed Java runtimes.');
    });
    const unsubscribe = api.onJavaRuntimeProgress((progress) => {
      setJavaProgress((current) => ({ ...current, [progress.major]: progress }));
      if (progress.progress === 0 || progress.progress === 100) {
        setInstallingJava((current) => ({ ...current, [progress.major]: false }));
      }
      if (progress.progress === 0) setJavaError(progress.status);
    });
    return () => { active = false; unsubscribe(); };
  }, [settings.javaPath]);

  useEffect(() => { setArgumentsDraft(settings.customArgs); }, [settings.customArgs]);

  const installJava = async (major: number) => {
    setJavaError('');
    setInstallingJava((current) => ({ ...current, [major]: true }));
    setJavaProgress((current) => ({ ...current, [major]: { major, progress: 0, status: `Preparing Java ${major}…` } }));
    try {
      if (!window.electronAPI) throw new Error('Java runtime installation is available in the desktop app.');
      setJavaRuntimes(await window.electronAPI.installManagedJavaRuntime(major));
    } catch (cause) {
      setJavaError(cause instanceof Error ? cause.message : `Could not install Java ${major}.`);
    } finally {
      setInstallingJava((current) => ({ ...current, [major]: false }));
    }
  };

  const browseJavaPath = async () => {
    try {
      const selectedPath = await window.electronAPI?.selectJavaExecutable();
      if (selectedPath) settings.setJavaPath(selectedPath);
      setJavaError('');
    } catch (cause) {
      setJavaError(cause instanceof Error ? cause.message : 'Could not select the Java executable.');
    }
  };

  const saveArguments = () => {
    settings.setCustomArgs(argumentsDraft.trim());
    setArgumentsSaved(true);
    window.setTimeout(() => setArgumentsSaved(false), 1800);
  };

  const openDirectory = async (key: 'gameData' | 'install' | 'configuration' | 'java' | 'logs') => {
    try { await window.electronAPI?.openClientDirectory(key); }
    catch (cause) { setRecoveryMessage(cause instanceof Error ? cause.message : 'Could not open that directory.'); }
  };

  const chooseGameDirectory = async () => {
    try {
      const selected = await window.electronAPI?.chooseGameDataDirectory();
      if (selected) { setDirectories(selected); setRecoveryMessage('Game data directory updated.'); }
    } catch (cause) { setRecoveryMessage(cause instanceof Error ? cause.message : 'Could not change the game data directory.'); }
  };

  const runJavaTest = async () => {
    setRecoveryBusy('java'); setRecoveryMessage('');
    try {
      if (!window.electronAPI) throw new Error('Java testing is available in the desktop app.');
      const result = await window.electronAPI.testJavaRuntime({ javaPath: settings.javaPath, gameVersion: activeProfile?.version ?? '26.3' });
      setRecoveryMessage(`Java is ready: ${result.output}`);
    } catch (cause) { setRecoveryMessage(cause instanceof Error ? cause.message : 'Java could not start.'); }
    finally { setRecoveryBusy(''); }
  };

  const createDiagnostic = async () => {
    setRecoveryBusy('diagnostic'); setRecoveryMessage('');
    try {
      if (!window.electronAPI) throw new Error('Diagnostic reports are available in the desktop app.');
      const result = await window.electronAPI.createDiagnosticReport();
      setRecoveryMessage(`Redacted report saved locally: ${result.path}`);
    } catch (cause) { setRecoveryMessage(cause instanceof Error ? cause.message : 'Could not create the diagnostic report.'); }
    finally { setRecoveryBusy(''); }
  };

  const clearClientData = async () => {
    setRecoveryBusy('clear'); setRecoveryMessage('');
    try {
      if (!window.electronAPI) throw new Error('Clear Data is available in the desktop app.');
      await window.electronAPI.clearClientData();
      window.localStorage.clear();
      window.location.reload();
    } catch (cause) { setRecoveryMessage(cause instanceof Error ? cause.message : 'Could not clear launcher data.'); setRecoveryBusy(''); setShowClearConfirm(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="page-scroll p-5">
      <div className="settings-page">
        <GlassCard className="p-5">
          <div className="settings-page-heading"><PageHeader title="Settings" subtitle="Tune the launcher and your gameplay profile" /><span className="settings-heading-icon"><Settings className="h-5 w-5" /></span></div>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <SettingRow label="Launch on startup" icon={Radio}><Toggle checked={settings.launchOnStartup} onChange={settings.setLaunchOnStartup} /></SettingRow>
            <SettingRow label="Minimize to tray" icon={Minus}><Toggle checked={settings.minimizeToTray} onChange={settings.setMinimizeToTray} /></SettingRow>
            <p className="md:col-span-2 text-[10px] leading-relaxed text-white/45">When startup is enabled, Bayon opens hidden in the system tray after you sign in. With minimize-to-tray enabled, minimizing or closing the window keeps Bayon running; choose Quit from the tray menu to exit.</p>
            {startupSettingsError && <p className="md:col-span-2 text-[10px] text-rose-300" role="alert">{startupSettingsError}</p>}
            <DiscordPresenceSettings enabled={settings.discordPresence} onEnabledChange={settings.setDiscordPresence} />
            <div>
              <SettingLabel icon={Globe}>Language</SettingLabel>
              <Select value={settings.language === 'Khmer' ? 'Khmer' : 'English'} onChange={settings.setLanguage} options={['English', 'Khmer']} />
            </div>
            <div>
              <SettingLabel icon={Layers3}>Active profile version</SettingLabel>
              <MinecraftVersionDropdown value={activeProfile?.version ?? '26.3'} onChange={(value) => { if (activeProfile) updateProfile(activeProfile.id, { version: value }); }} availableVersions={availableVersions} />
            </div>
            <div>
              <SettingLabel icon={HardDrive}>RAM allocation</SettingLabel>
              <div className="ram-setting-control">
                <div className="ram-setting-range-labels"><span>4 GB</span><strong>{settings.selectedRam} GB</strong><span>16 GB</span></div>
                <input type="range" min={4} max={16} step={1} value={settings.selectedRam} onChange={(event) => settings.setSelectedRam(Number(event.target.value))} className="slider ram-setting-slider" aria-label="RAM allocation" />
                <small>Memory reserved for Minecraft when you launch a profile.</small>
              </div>
            </div>
            <div>
              <SettingLabel icon={Monitor}>Resolution</SettingLabel>
              <Select value={settings.resolution} onChange={settings.setResolution} options={['1920x1080', '2560x1440', '3840x2160']} />
            </div>
            <section className="settings-java-panel md:col-span-2">
              <div className="settings-java-heading"><Download className="h-5 w-5" /><div><strong>Bayon Client Runtime</strong><p>Bayon checks for Java already installed on your device and automatically uses a compatible runtime for each profile.</p></div></div>
              <div className="java-runtime-grid">
                {[8, 11, 17, 21, 25].map((major) => {
                  const runtime = javaRuntimes.find((item) => item.major === major);
                  const progress = javaProgress[major];
                  const busy = Boolean(installingJava[major]);
                  return <article className="java-runtime-card" key={major}>
                    <div className="java-runtime-copy"><div><strong>Java {major}</strong><span>{major <= 17 ? 'JRE' : 'JDK'}</span>{major === 25 && <em>Recommended</em>}</div><small>{busy ? progress?.status ?? `Preparing Java ${major}…` : runtime?.installed ? runtime.packageVersion || 'Managed runtime installed' : runtime?.systemJavaPath ? `Detected on device · ${runtime.systemPackageVersion}` : 'Not detected'}</small>{busy && <div className="java-runtime-progress"><span style={{ width: `${progress?.progress ?? 0}%` }} /></div>}</div>
                    {runtime?.installed ? <button type="button" className="java-runtime-button" disabled={busy} onClick={() => void installJava(major)}>{busy ? <span className="java-spinner" /> : <RefreshCw className="h-4 w-4" />}{busy ? 'Installing…' : 'Reinstall'}</button> : runtime?.systemJavaPath ? <button type="button" className="java-runtime-button" onClick={() => settings.setJavaPath(runtime.systemJavaPath!)}>Use detected</button> : <button type="button" className="java-runtime-button" disabled={busy} onClick={() => void installJava(major)}>{busy ? <span className="java-spinner" /> : <Download className="h-4 w-4" />}{busy ? 'Installing…' : 'Install'}</button>}
                  </article>;
                })}
              </div>
            </section>
            <section className="settings-tools-section md:col-span-2">
              <div className="settings-tools-title">DIRECTORIES</div>
              {([
                ['gameData', 'Game Data Directory', directories?.gameDataDirectory, Gamepad2, true],
                ['install', 'Install Directory', directories?.installDirectory, HardDrive, false],
                ['configuration', 'Configuration Directory', directories?.configurationDirectory, Settings, false],
                ['java', 'Java Directory', directories?.javaDirectory, Coffee, false],
                ['logs', 'Logs Directory', directories?.logsDirectory, FileText, false],
              ] as const).map(([key, label, location, Icon, canChange]) => <div className="settings-tool-row" key={key}>
                <div className="settings-tool-info"><Icon className="h-5 w-5" /><div><strong>{label}</strong><span title={location || ''}>{location || 'Loading directory…'}</span></div></div>
                <div className="settings-tool-actions">{canChange && <button type="button" className="settings-tool-button" onClick={() => void chooseGameDirectory()}>Change</button>}<button type="button" className="settings-tool-button" onClick={() => void openDirectory(key)}> <FolderOpen className="h-4 w-4" />Open</button></div>
              </div>)}
            </section>
            <section className="settings-tools-section md:col-span-2">
              <div className="settings-tools-title">RECOVERY</div>
              <div className="settings-tool-row"><div className="settings-tool-info"><Terminal className="h-5 w-5" /><div><strong>Create Diagnostic Report</strong><span>Creates a redacted diagnostic file on this device. Nothing is uploaded.</span></div></div><button type="button" disabled={Boolean(recoveryBusy)} className="settings-tool-button" onClick={() => void createDiagnostic()}><Terminal className="h-4 w-4" />{recoveryBusy === 'diagnostic' ? 'Creating…' : 'Create Report'}</button></div>
              <div className="settings-tool-row"><div className="settings-tool-info"><Coffee className="h-5 w-5" /><div><strong>Test Java Launch</strong><span>Check that the selected or automatically detected Java runtime starts.</span></div></div><button type="button" disabled={Boolean(recoveryBusy)} className="settings-tool-button" onClick={() => void runJavaTest()}><Coffee className="h-4 w-4" />{recoveryBusy === 'java' ? 'Testing…' : 'Test Java'}</button></div>
              <div className="settings-tool-row settings-tool-row-danger"><div className="settings-tool-info"><AlertTriangle className="h-5 w-5" /><div><strong>Clear Data</strong><span>Remove local profiles, saves, downloaded game files, managed Java runtimes, and launcher preferences.</span></div></div><button type="button" disabled={Boolean(recoveryBusy)} className="settings-tool-button settings-tool-danger" onClick={() => setShowClearConfirm(true)}><Trash2 className="h-4 w-4" />Clear All Data</button></div>
              {recoveryMessage && <p className="settings-recovery-status" role="status">{recoveryMessage}</p>}
            </section>
            <section className="settings-java-panel md:col-span-2">
              <div className="settings-java-heading"><Coffee className="h-5 w-5" /><div><strong>Custom Java Path</strong><p>Choose your own Java executable instead of the automatically selected managed runtime.</p></div></div>
              <div className="java-custom-path-row"><div className="java-custom-path-value">{settings.javaPath || 'Using auto-detected Java'}</div><button type="button" className="java-runtime-button" onClick={() => void browseJavaPath()}><FolderOpen className="h-4 w-4" />Browse</button>{settings.javaPath && <button type="button" className="java-auto-button" onClick={() => settings.setJavaPath('')}>Use automatic</button>}</div>
            </section>
            <section className="settings-java-panel md:col-span-2">
              <div className="settings-java-heading"><FileText className="h-5 w-5" /><div><strong>Extra JVM Arguments</strong><p>Additional flags passed directly to Java when launching Minecraft. Each argument must start with a dash.</p></div></div>
              <textarea value={argumentsDraft} onChange={(event) => { setArgumentsDraft(event.target.value); setArgumentsSaved(false); }} placeholder="-XX:+UseG1GC  -XX:MaxGCPauseMillis=50" className="java-arguments-input" rows={3} />
              <button type="button" className="java-runtime-button java-save-button" onClick={saveArguments}><FileText className="h-4 w-4" />{argumentsSaved ? 'Arguments Saved' : 'Save Arguments'}</button>
            </section>
            {javaError && <p className="java-runtime-error md:col-span-2" role="alert">{javaError}</p>}
            <div>
              <SettingLabel icon={Volume2}>Animation</SettingLabel>
              <Select value={settings.animationLevel} onChange={settings.setAnimationLevel} options={['Smooth', 'Balanced', 'Minimal']} />
            </div>
            <SettingRow label="Reduce motion" icon={MoonStar}><Toggle checked={settings.reduceMotion} onChange={settings.setReduceMotion} /></SettingRow>
          </div>

          <div className="mt-6 flex justify-end">
            <button type="button" onClick={settings.resetDefaults} className="rounded-xl border border-white/10 bg-white/3 px-4 py-2 text-sm text-white/80 transition hover:bg-white/8">Restore defaults</button>
          </div>
        </GlassCard>
      </div>
      {showClearConfirm && <Modal title="Clear all Bayon Client data?" onClose={() => setShowClearConfirm(false)}>
        <p className="settings-clear-warning">This removes profiles and their saves, downloaded Minecraft files, managed Java runtimes, launcher preferences, and local accounts from this device. This cannot be undone.</p>
        <p className="settings-clear-warning">Game data directory: <strong>{directories?.gameDataDirectory || 'Loading…'}</strong></p>
        <div className="offline-form-actions"><button type="button" onClick={() => setShowClearConfirm(false)}>Cancel</button><button type="button" className="remove-confirm" disabled={Boolean(recoveryBusy)} onClick={() => void clearClientData()}>{recoveryBusy === 'clear' ? 'Clearing…' : 'Clear all data'}</button></div>
      </Modal>}
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
  const [open, setOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => { if (!selectRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={selectRef} className="settings-select-wrap">
      <button type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="settings-select-button">
        <span>{value}</span><ChevronDown className={`h-4 w-4 text-sky-200/70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="settings-select-menu" role="listbox">
        {options.map((option) => <button key={option} type="button" role="option" aria-selected={value === option} onClick={() => { onChange(option); setOpen(false); }} className={value === option ? 'settings-select-option settings-select-option-active' : 'settings-select-option'}>
          <span>{option}</span>{value === option && <span className="settings-select-selected">Selected</span>}
        </button>)}
      </div>}
    </div>
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

function MinecraftAvatar({ username, skin, className }: { username: string; skin?: { imageUrl: string; legacy?: boolean }; className: string }) {
  const palettes = [
    { skin: '#d2a17d', hair: '#493025', eyes: '#5579b8', beard: '#603c2d' },
    { skin: '#edc69f', hair: '#342820', eyes: '#5579b8', beard: '#493329' },
    { skin: '#a86f4f', hair: '#211c1b', eyes: '#6688c5', beard: '#34221d' },
    { skin: '#f0c6a4', hair: '#9a6335', eyes: '#6282bd', beard: '#7a4b2d' },
    { skin: '#c58c69', hair: '#201a18', eyes: '#566fa7', beard: '#34231e' },
  ];
  const paletteIndex = Array.from(username).reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7) % palettes.length;
  const palette = palettes[paletteIndex];

  return (
    <span className={`minecraft-avatar ${className}`} role="img" aria-label={`${username}'s Minecraft profile`}>
      <svg viewBox={skin ? '8 8 8 8' : '0 0 8 8'} aria-hidden="true" shapeRendering="crispEdges" preserveAspectRatio="none">
        {skin ? <>
          <image href={skin.imageUrl} x="0" y="0" width="64" height={skin.legacy ? 32 : 64} />
          <image href={skin.imageUrl} x="-32" y="0" width="64" height={skin.legacy ? 32 : 64} />
        </> : <>
          <rect x="1" y="0" width="6" height="1" fill={palette.hair} />
          <rect x="0" y="1" width="1" height="6" fill={palette.hair} />
          <rect x="1" y="1" width="6" height="6" fill={palette.skin} />
          <rect x="7" y="1" width="1" height="6" fill={palette.hair} />
          <rect x="1" y="1" width="6" height="1" fill={palette.hair} />
          <rect x="1" y="2" width="1" height="1" fill={palette.hair} />
          <rect x="6" y="2" width="1" height="1" fill={palette.hair} />
          <rect x="2" y="3" width="2" height="1" fill="#f1eee8" />
          <rect x="5" y="3" width="2" height="1" fill="#f1eee8" />
          <rect x="3" y="3" width="1" height="1" fill={palette.eyes} />
          <rect x="6" y="3" width="1" height="1" fill={palette.eyes} />
          <rect x="4" y="4" width="1" height="1" fill="#ad7559" />
          <rect x="2" y="5" width="4" height="1" fill={palette.beard} />
          <rect x="3" y="6" width="2" height="1" fill={palette.beard} />
        </>}
      </svg>
    </span>
  );
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<'bug' | 'positive'>('bug');
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitFeedback = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const imageData = image ? await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read the selected image.'));
        reader.onload = () => {
          if (typeof reader.result !== 'string') {
            reject(new Error('Could not read the selected image.'));
            return;
          }
          resolve(reader.result.slice(reader.result.indexOf(',') + 1));
        };
        reader.readAsDataURL(image);
      }) : undefined;
      const response = await fetch(`${BACKEND_BASE_URL}/api/client-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          category,
          message: message.trim(),
          ...(image && imageData ? { image: { mimeType: image.type, data: imageData } } : {}),
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || `Feedback service returned HTTP ${response.status}.`);
      setSuccess('Your feedback was sent to the Bayon team. Thank you!');
      setMessage('');
      setImage(null);
      setCategory('bug');
      formRef.current?.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your feedback.');
    } finally {
      setSending(false);
    }
  };

  const selectImage = (file: File | undefined) => {
    setError(null);
    setImage(null);
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('Choose a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('The image must be 3 MB or smaller.');
      return;
    }
    setImage(file);
  };

  return <Modal title="Send feedback" onClose={onClose}>
    <form ref={formRef} onSubmit={(event) => void submitFeedback(event)} className="feedback-form">
      <p className="feedback-help">Report a bug or send the team a positive note. Your message and optional image will be shared with Bayon administrators.</p>
      <label className="feedback-field">What would you like to send?
        <select value={category} onChange={(event) => setCategory(event.target.value as 'bug' | 'positive')}>
          <option value="bug">Report a bug</option>
          <option value="positive">Good news / appreciation</option>
        </select>
      </label>
      <label className="feedback-field">Your message
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={5} required placeholder="Tell us what happened or what you like…" />
      </label>
      <label className="feedback-field">Attach a screenshot (optional)
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectImage(event.currentTarget.files?.[0])} />
        <small>PNG, JPEG, or WebP · up to 3 MB. Please remove passwords and private information from screenshots.</small>
      </label>
      {image && <p className="feedback-file-name"><FileImage className="h-4 w-4" /> {image.name} · {(image.size / 1024).toFixed(0)} KB</p>}
      {error && <p className="feedback-error" role="alert">{error}</p>}
      {success && <p className="feedback-success" role="status">{success}</p>}
      <div className="feedback-actions">
        <button type="button" onClick={onClose} disabled={sending}>Cancel</button>
        <button type="submit" disabled={sending || !message.trim()}>{sending ? 'Sending…' : 'Send feedback'}</button>
      </div>
    </form>
  </Modal>;
}

function Modal({ title, children, onClose, className = '' }: { title: string; children: React.ReactNode; onClose: () => void; className?: string }) {
  const isFullScreen = className.includes('mod-catalog-modal');
  return createPortal((
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px] ${isFullScreen ? 'modal-fullscreen-backdrop' : ''}`}>
      <div className={`w-full max-w-md rounded-[24px] border border-white/10 bg-[#0d0d0d] p-4 shadow-[0_0_80px_rgba(0,0,0,0.55)] ${className}`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold text-white">{title}</div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 p-2 text-white/60 hover:bg-white/5"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  ), document.body);
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-sm text-white/70">{children}</label>;
}

function SettingLabel({ children, icon: Icon }: { children: React.ReactNode; icon: LucideIcon }) {
  return <Label><span className="settings-label"><Icon className="h-4 w-4" />{children}</span></Label>;
}

function SettingRow({ label, children, icon: Icon }: { label: string; children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#121212] px-3 py-3">
      <span className="settings-row-label">{Icon && <Icon className="h-4 w-4" />}<span className="text-sm text-white/75">{label}</span></span>
      {children}
    </div>
  );
}

function LogoMark() {
  return <img className="bayon-logo" src={bayonIcon} alt="Bayon Client logo" draggable={false} />;
}

function RefreshIcon() {
  return <Globe className="h-4 w-4" />;
}

export default App;
