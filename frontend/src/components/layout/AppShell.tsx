import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Settings,
  Upload,
  Sun,
  Moon,
  Search,
  Menu,
  X,
  LogOut,
  Keyboard,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Bell,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Avatar } from '@/components/ui/Avatar';
import { CommandPalette } from '@/components/CommandPalette';
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal';
import { GradientMeshBackground } from '@/components/ui/GradientMeshBackground';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { FoldersSidebarSection } from '@/components/layout/FoldersSidebarSection';
import { cn } from '@/lib/utils';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/api/meetings';
import { NotificationData } from '@/types/meeting';

export function AppShell() {
  const { user, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Phase D: Notifications state
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const loadNotifications = async () => {
    try {
      const data = await getNotifications();
      setNotifications(data.items);
      setUnreadNotifCount(data.unread_count);
    } catch {
      // ignore load errors
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkNotificationRead = async (notif: NotificationData) => {
    try {
      if (!notif.is_read) {
        await markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
        setUnreadNotifCount((prev) => Math.max(0, prev - 1));
      }
      if (notif.link_url) {
        setNotificationsOpen(false);
        navigate(notif.link_url);
      }
    } catch {
      // ignore
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadNotifCount(0);
    } catch {
      // ignore
    }
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Track scroll position for header condensing
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setIsScrolled(scrollTop > 15);
  };

  // Global keyboard shortcuts
  useEffect(() => {
    let keyBuffer = '';
    let bufferTimer: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isInput =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      // Cmd+K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
        return;
      }

      if (isInput) return;

      // Shortcuts modal on '?'
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      // Quick focus search on '/'
      if (e.key === '/') {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }

      // New upload on 'n'
      if (e.key === 'n') {
        e.preventDefault();
        navigate('/upload');
        return;
      }

      // Sequence shortcuts: g d, g m, g a
      keyBuffer += e.key.toLowerCase();
      if (bufferTimer) clearTimeout(bufferTimer);
      bufferTimer = setTimeout(() => {
        keyBuffer = '';
      }, 700);

      if (keyBuffer === 'gd') {
        navigate('/dashboard');
        keyBuffer = '';
      } else if (keyBuffer === 'gm') {
        navigate('/meetings');
        keyBuffer = '';
      } else if (keyBuffer === 'ga') {
        navigate('/action-items');
        keyBuffer = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (bufferTimer) clearTimeout(bufferTimer);
    };
  }, [navigate]);

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/meetings', label: 'Meetings', icon: Calendar },
    { to: '/action-items', label: 'Action Items', icon: CheckSquare },
    { to: '/trash', label: 'Trash', icon: Trash2 },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background/80 text-foreground relative select-none">
      {/* Background Animated Gradient Mesh */}
      <GradientMeshBackground />

      {/* Desktop macOS Finder Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-white/10 glass-panel backdrop-blur-2xl transition-all duration-300 ease-in-out shrink-0 z-30',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Window Chrome / Brand header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
          {!isCollapsed ? (
            <div className="flex items-center gap-2.5 font-bold text-lg text-primary tracking-tight">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-md">
                MS
              </div>
              <span className="text-foreground font-semibold">MeetScribe</span>
            </div>
          ) : (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-md">
              MS
            </div>
          )}

          <button
            type="button"
            data-testid="sidebar-toggle"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors hidden md:block"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Upload Action Button */}
        <div className="p-4">
          <button
            type="button"
            data-testid="nav-upload-btn"
            onClick={() => navigate('/upload')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-2.5 font-semibold text-sm shadow-md hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] transition-all w-full min-h-[44px]',
              isCollapsed ? 'px-0' : 'px-4'
            )}
          >
            <Upload className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>New Upload</span>}
          </button>
        </div>

        {/* Navigation Section */}
        <div className="px-4 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {!isCollapsed && 'Workspace'}
        </div>
        <nav className="flex-1 space-y-1 px-3 py-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 min-h-[44px]',
                    isActive
                      ? 'bg-primary/15 text-primary font-semibold shadow-sm border border-primary/20 backdrop-blur-sm'
                      : 'text-muted-foreground hover:bg-white/10 hover:text-foreground',
                    isCollapsed && 'justify-center'
                  )
                }
                title={isCollapsed ? link.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span>{link.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Folders Section */}
        <div className="border-t border-white/10">
          <FoldersSidebarSection isCollapsed={isCollapsed} />
        </div>

        {/* Shortcuts & Preferences */}
        <div className="px-3 py-2 border-t border-white/10 space-y-1">
          <button
            type="button"
            data-testid="keyboard-shortcuts-trigger"
            onClick={() => setShortcutsOpen(true)}
            className={cn(
              'flex items-center gap-3 w-full rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors min-h-[40px]',
              isCollapsed && 'justify-center'
            )}
            title="Keyboard Shortcuts (?)"
          >
            <Keyboard className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Shortcuts (?)</span>}
          </button>
        </div>

        {/* User profile footer */}
        <div className="flex items-center gap-3 border-t border-white/10 p-3.5">
          <Avatar name={user?.email || 'User'} size="sm" />
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">{user?.email}</p>
            </div>
          )}
          {!isCollapsed && (
            <button
              type="button"
              data-testid="logout-button"
              onClick={logout}
              title="Sign out"
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/10 hover:text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 z-20">
        {/* Dynamic Condensed Top Bar */}
        <header
          className={cn(
            'flex items-center justify-between border-b border-white/10 glass-panel px-4 sm:px-6 shrink-0 gap-4 transition-all duration-200 z-30',
            isScrolled ? 'h-14 backdrop-blur-xl bg-background/80 shadow-md' : 'h-16 bg-background/40 backdrop-blur-md'
          )}
        >
          <div className="flex items-center gap-3">
            {/* Mobile Brand Icon */}
            <div className="md:hidden flex items-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-xs shadow">
                MS
              </div>
            </div>

            {/* Quick search button */}
            <button
              type="button"
              data-testid="command-palette-trigger"
              onClick={() => setCmdOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-background/50 backdrop-blur-sm px-3.5 py-2 text-xs text-muted-foreground hover:bg-white/15 hover:text-foreground transition-all w-36 sm:w-64 min-h-[36px]"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left truncate">Search or commands...</span>
              <kbd className="hidden sm:inline-block rounded-md border border-white/20 bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Notification Bell (Phase D: F36, U24) */}
            <div className="relative">
              <button
                type="button"
                data-testid="notification-bell"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifCount > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background animate-pulse" />
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {notificationsOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl glass-card border border-white/20 shadow-2xl z-50 p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                      <Bell className="h-3.5 w-3.5 text-primary" />
                      <span>Notifications</span>
                      {unreadNotifCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-primary/20 text-primary font-bold">
                          {unreadNotifCount}
                        </span>
                      )}
                    </div>
                    {unreadNotifCount > 0 && (
                      <button
                        type="button"
                        data-testid="notification-read-all"
                        onClick={handleMarkAllNotificationsRead}
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-muted-foreground">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          data-testid="notification-item"
                          onClick={() => handleMarkNotificationRead(notif)}
                          className={cn(
                            'p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5',
                            notif.is_read
                              ? 'glass-card-subtle border-white/5 opacity-70 hover:opacity-100'
                              : 'glass-card border-primary/30 bg-primary/5 hover:border-primary/50'
                          )}
                        >
                          <div className="mt-0.5 shrink-0">
                            {notif.type === 'meeting_completed' ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            ) : notif.type === 'meeting_failed' ? (
                              <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                            ) : (
                              <Clock className="h-3.5 w-3.5 text-amber-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="font-semibold text-foreground truncate">{notif.title}</div>
                            <div className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
                              {notif.message}
                            </div>
                            <div className="text-[10px] text-muted-foreground/60 pt-0.5">
                              {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          {!notif.is_read && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theme & Palette Switcher */}
            <ThemeSwitcher variant="compact" />

            {/* Direct Theme Toggle button for test suite compatibility */}
            <button
              type="button"
              data-testid="theme-toggle"
              onClick={toggleTheme}
              className="p-2 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Mobile Hamburger menu */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-muted-foreground hover:bg-white/10 md:hidden min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Sign out button */}
            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-destructive md:hidden min-w-[40px] min-h-[40px] flex items-center justify-center"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Mobile Slide-Over Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-16 z-50 bg-black/60 backdrop-blur-md md:hidden animate-in fade-in-0">
            <div className="h-full w-72 glass-panel border-r border-white/20 p-5 flex flex-col justify-between animate-in slide-in-from-left duration-200">
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    navigate('/upload');
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 font-semibold shadow-lg w-full min-h-[44px]"
                >
                  <Upload className="h-4 w-4" />
                  <span>New Upload</span>
                </button>

                <nav className="space-y-1">
                  {navLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors min-h-[44px]',
                            isActive
                              ? 'bg-primary/15 text-primary font-semibold shadow-sm'
                              : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'
                          )
                        }
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span>{link.label}</span>
                      </NavLink>
                    );
                  })}
                </nav>
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar name={user?.email || 'User'} size="sm" />
                  <p className="truncate text-xs font-semibold text-foreground">{user?.email}</p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="flex items-center gap-2 w-full text-xs text-destructive hover:underline py-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main
          ref={contentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-28 md:pb-8"
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile Floating macOS Glass Dock */}
      <div className="md:hidden fixed bottom-3 left-3 right-3 z-40 max-w-sm mx-auto flex items-center justify-around py-1.5 px-3 rounded-3xl glass-dock shadow-2xl border border-white/25">
        <NavLink
          to="/dashboard"
          data-testid="nav-dashboard"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all',
              isActive ? 'text-primary scale-110 font-bold' : 'text-muted-foreground hover:text-foreground'
            )
          }
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Home</span>
        </NavLink>

        <NavLink
          to="/meetings"
          data-testid="nav-meetings"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all',
              isActive ? 'text-primary scale-110 font-bold' : 'text-muted-foreground hover:text-foreground'
            )
          }
        >
          <Calendar className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Notes</span>
        </NavLink>

        {/* Upload Action (Prominent Dock Center) */}
        <NavLink
          to="/upload"
          data-testid="nav-upload"
          className="flex items-center justify-center w-12 h-12 -mt-4 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6" />
        </NavLink>

        <NavLink
          to="/action-items"
          data-testid="nav-action-items"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all',
              isActive ? 'text-primary scale-110 font-bold' : 'text-muted-foreground hover:text-foreground'
            )
          }
        >
          <CheckSquare className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Tasks</span>
        </NavLink>

        <NavLink
          to="/settings"
          data-testid="nav-settings"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all',
              isActive ? 'text-primary scale-110 font-bold' : 'text-muted-foreground hover:text-foreground'
            )
          }
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Settings</span>
        </NavLink>
      </div>

      {/* Global Modals */}
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
