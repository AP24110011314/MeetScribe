import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useToast } from '@/components/ui/Toast';
import { Sparkles, Sliders, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsPage() {
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
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold glass-card-subtle text-primary border border-primary/20 mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>System & Workspace Preferences</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customize your appearance palette, layout density, and default workspace views.
        </p>
      </div>

      {/* Theme & Palette Setting Card */}
      <Card className="rounded-3xl border border-white/15 shadow-xl overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl">macOS Glass Themes</CardTitle>
          <CardDescription>Select your appearance mode and accent color palette</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSwitcher variant="full" />
        </CardContent>
      </Card>

      {/* Display & Density Preferences */}
      <Card className="rounded-3xl border border-white/15 shadow-xl overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            <span>Display & Density</span>
          </CardTitle>
          <CardDescription>Adjust how information is laid out in lists and tables</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Density */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Row Density
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDensity('comfortable')}
                className={cn(
                  'p-4 rounded-2xl border text-left text-sm transition-all min-h-[56px]',
                  density === 'comfortable'
                    ? 'glass-card border-primary ring-2 ring-primary/40 bg-primary/10 font-semibold'
                    : 'glass-card-subtle border-white/10 hover:border-white/20'
                )}
              >
                <p className="font-semibold text-foreground">Comfortable</p>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">Spacious paddings and line height</p>
              </button>
              <button
                type="button"
                onClick={() => setDensity('compact')}
                className={cn(
                  'p-4 rounded-2xl border text-left text-sm transition-all min-h-[56px]',
                  density === 'compact'
                    ? 'glass-card border-primary ring-2 ring-primary/40 bg-primary/10 font-semibold'
                    : 'glass-card-subtle border-white/10 hover:border-white/20'
                )}
              >
                <p className="font-semibold text-foreground">Compact</p>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">High information density</p>
              </button>
            </div>
          </div>

          {/* Default View */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Default Meetings View
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDefaultView('grid')}
                className={cn(
                  'p-4 rounded-2xl border text-left text-sm transition-all min-h-[56px]',
                  defaultView === 'grid'
                    ? 'glass-card border-primary ring-2 ring-primary/40 bg-primary/10 font-semibold'
                    : 'glass-card-subtle border-white/10 hover:border-white/20'
                )}
              >
                <p className="font-semibold text-foreground">Grid Card View</p>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">Visual cards with key metadata</p>
              </button>
              <button
                type="button"
                onClick={() => setDefaultView('table')}
                className={cn(
                  'p-4 rounded-2xl border text-left text-sm transition-all min-h-[56px]',
                  defaultView === 'table'
                    ? 'glass-card border-primary ring-2 ring-primary/40 bg-primary/10 font-semibold'
                    : 'glass-card-subtle border-white/10 hover:border-white/20'
                )}
              >
                <p className="font-semibold text-foreground">Table Row View</p>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">Tabular layout with quick actions</p>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shortcuts Reference */}
      <Card className="rounded-3xl border border-white/15 shadow-xl overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-primary" />
            <span>Keyboard Shortcuts</span>
          </CardTitle>
          <CardDescription>Global hotkeys to navigate at lightning speed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-white/10">
            {shortcuts.map((s, idx) => (
              <div key={idx} className="flex items-center justify-between py-3">
                <span className="text-sm text-foreground">{s.description}</span>
                <kbd className="px-2.5 py-1 rounded-lg border border-white/15 bg-background/60 backdrop-blur-sm text-xs font-mono font-semibold text-muted-foreground">
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
