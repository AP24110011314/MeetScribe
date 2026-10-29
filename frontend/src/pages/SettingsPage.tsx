import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/components/ui/Toast';
import { Sun, Moon, Laptop, LayoutGrid, List } from 'lucide-react';

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [density, setDensityState] = useState<'comfortable' | 'compact'>(() => {
    return (localStorage.getItem('meetscribe_density') as 'comfortable' | 'compact') || 'comfortable';
  });

  const [defaultView, setDefaultViewState] = useState<'grid' | 'table'>(() => {
    return (localStorage.getItem('meetscribe_default_view') as 'grid' | 'table') || 'grid';
  });

  const setDensity = (val: 'comfortable' | 'compact') => {
    localStorage.setItem('meetscribe_density', val);
    setDensityState(val);
    toast({ type: 'info', title: 'Density Updated', description: `Set to ${val}` });
  };

  const setDefaultView = (val: 'grid' | 'table') => {
    localStorage.setItem('meetscribe_default_view', val);
    setDefaultViewState(val);
    toast({ type: 'info', title: 'Default View Updated', description: `Meetings list will open in ${val} view` });
  };

  const shortcuts = [
    { key: 'Cmd / Ctrl + K', description: 'Open Command Palette' },
    { key: 'g d', description: 'Navigate to Dashboard' },
    { key: 'g m', description: 'Navigate to Meetings List' },
    { key: 'g a', description: 'Navigate to Action Items' },
    { key: 'n', description: 'Upload New Recording' },
    { key: '/', description: 'Focus Search' },
    { key: '?', description: 'Open Keyboard Shortcuts Dialog' },
  ];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customize your workspace appearance, density, and preferred views.
        </p>
      </div>

      {/* Theme Setting */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance Theme</CardTitle>
          <CardDescription>Select your interface theme</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                theme === 'light'
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border hover:bg-muted text-foreground'
              }`}
            >
              <Sun className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm">Light Mode</p>
                <p className="text-xs text-muted-foreground font-normal">Clean bright interface</p>
              </div>
            </button>

            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                theme === 'dark'
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border hover:bg-muted text-foreground'
              }`}
            >
              <Moon className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm">Dark Mode</p>
                <p className="text-xs text-muted-foreground font-normal">High contrast dark palette</p>
              </div>
            </button>

            <button
              onClick={() => setTheme('system')}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                theme === 'system'
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border hover:bg-muted text-foreground'
              }`}
            >
              <Laptop className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm">System</p>
                <p className="text-xs text-muted-foreground font-normal">Matches macOS appearance</p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Display Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Display & Density</CardTitle>
          <CardDescription>Adjust how information is laid out</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Density */}
          <div className="space-y-3">
            <label className="text-sm font-semibold">Row Density</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setDensity('comfortable')}
                className={`p-3.5 rounded-xl border text-left text-sm ${
                  density === 'comfortable'
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <p>Comfortable</p>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">Spacious paddings and line height</p>
              </button>
              <button
                onClick={() => setDensity('compact')}
                className={`p-3.5 rounded-xl border text-left text-sm ${
                  density === 'compact'
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <p>Compact</p>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">Condensed rows to fit more data</p>
              </button>
            </div>
          </div>

          {/* Default list view */}
          <div className="space-y-3 border-t border-border pt-4">
            <label className="text-sm font-semibold">Default Meetings View</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setDefaultView('grid')}
                className={`flex items-center gap-2 p-3.5 rounded-xl border text-left text-sm ${
                  defaultView === 'grid'
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
                <span>Card Grid View</span>
              </button>
              <button
                onClick={() => setDefaultView('table')}
                className={`flex items-center gap-2 p-3.5 rounded-xl border text-left text-sm ${
                  defaultView === 'table'
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <List className="h-4 w-4" />
                <span>Table Row View</span>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Keyboard Shortcuts Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Keyboard Shortcuts Reference</CardTitle>
          <CardDescription>Full cheat sheet of shortcuts active in MeetScribe</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {shortcuts.map((s, idx) => (
              <div key={idx} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">{s.description}</span>
                <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs font-semibold">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
