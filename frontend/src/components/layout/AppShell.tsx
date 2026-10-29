import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Avatar } from '@/components/ui/Avatar';
import { CommandPalette } from '@/components/CommandPalette';
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal';

export function AppShell() {
  const { user, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Global keyboard shortcuts
  useEffect(() => {
    let keyBuffer = '';
    let bufferTimer: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable;

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
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out shrink-0 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Brand header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-border">
          {!isCollapsed && (
            <div className="flex items-center gap-2 font-bold text-lg text-primary tracking-tight">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-extrabold text-sm shadow">
                MS
              </div>
              <span>MeetScribe</span>
            </div>
          )}
          {isCollapsed && (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-extrabold text-sm shadow">
              MS
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground hidden md:block"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Upload Action */}
        <div className="p-4">
          <button
            onClick={() => navigate('/upload')}
            className={`flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-2.5 font-medium shadow hover:bg-primary/90 transition-colors w-full ${
              isCollapsed ? 'px-0' : 'px-4'
            }`}
          >
            <Upload className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>New Upload</span>}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1.5 px-3 py-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary dark:bg-primary/20'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  } ${isCollapsed ? 'justify-center' : ''}`
                }
                title={isCollapsed ? link.label : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!isCollapsed && <span>{link.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Shortcuts button */}
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => setShortcutsOpen(true)}
            className={`flex items-center gap-3 w-full rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground ${
              isCollapsed ? 'justify-center' : ''
            }`}
            title="Keyboard Shortcuts (?)"
          >
            <Keyboard className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Shortcuts (?)</span>}
          </button>
        </div>

        {/* User profile footer */}
        <div className="flex items-center gap-3 border-t border-border p-4">
          <Avatar name={user?.email || 'User'} size="sm" />
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">{user?.email}</p>
            </div>
          )}
          {!isCollapsed && (
            <button
              onClick={logout}
              title="Sign out"
              className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top Navbar */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6 shrink-0 gap-4">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-muted-foreground hover:bg-muted md:hidden"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Quick search button */}
            <button
              onClick={() => setCmdOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-input bg-background/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-44 sm:w-64"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left truncate">Search or commands...</span>
              <kbd className="hidden sm:inline-block rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              data-testid="theme-toggle"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {/* Mobile user signout icon */}
            <button
              onClick={logout}
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive md:hidden"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Mobile slide-over navigation drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-16 z-40 bg-black/50 md:hidden animate-in fade-in-0">
            <div className="h-full w-64 bg-card border-r border-border p-4 flex flex-col justify-between animate-in slide-in-from-left duration-200">
              <div className="space-y-4">
                <button
                  onClick={() => {
                    navigate('/upload');
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-2.5 font-medium shadow w-full"
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
                          `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-primary/10 text-primary dark:bg-primary/20'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`
                        }
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span>{link.label}</span>
                      </NavLink>
                    );
                  })}
                </nav>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar name={user?.email || 'User'} size="sm" />
                  <p className="truncate text-xs font-semibold text-foreground">{user?.email}</p>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-2 w-full text-xs text-destructive hover:underline"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Global Modals */}
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
