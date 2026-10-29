import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { useTheme } from '@/context/ThemeContext';
import { Sun, Moon, Laptop } from 'lucide-react';

export function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your appearance and workspace preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Select how MeetScribe looks to you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                theme === 'light'
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border hover:bg-muted text-foreground'
              }`}
            >
              <Sun className="h-5 w-5" />
              <div>
                <p className="text-sm">Light</p>
                <p className="text-xs text-muted-foreground font-normal">Clean bright theme</p>
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
              <Moon className="h-5 w-5" />
              <div>
                <p className="text-sm">Dark</p>
                <p className="text-xs text-muted-foreground font-normal">Easy on the eyes</p>
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
              <Laptop className="h-5 w-5" />
              <div>
                <p className="text-sm">System</p>
                <p className="text-xs text-muted-foreground font-normal">Follows OS setting</p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
