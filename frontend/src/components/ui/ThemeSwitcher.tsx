import React from 'react';
import { Sun, Moon, Laptop, Palette as PaletteIcon, Check } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTheme, PALETTES, Theme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export interface ThemeSwitcherProps {
  variant?: 'compact' | 'full';
  className?: string;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ variant = 'compact', className }) => {
  const { theme, resolvedTheme, setTheme, palette, setPalette } = useTheme();

  if (variant === 'full') {
    return (
      <div className={cn('space-y-6', className)}>
        {/* Appearance Mode Selection */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-2.5">
            Appearance Mode
          </label>
          <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl glass-card-subtle bg-muted/30 border border-white/10 max-w-md">
            {(
              [
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon },
                { id: 'system', label: 'System', icon: Laptop },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = theme === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTheme(item.id as Theme)}
                  data-testid={`theme-mode-${item.id}`}
                  className={cn(
                    'flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-xs font-medium transition-all duration-200 select-none min-h-[44px]',
                    isActive
                      ? 'bg-background text-foreground shadow-sm font-semibold border border-white/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Color Palette Selection */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-2.5">
            Color Palette
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PALETTES.map((p) => {
              const isActive = palette === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPalette(p.id)}
                  data-testid={`palette-option-${p.id}`}
                  className={cn(
                    'flex items-center space-x-3.5 p-3.5 rounded-2xl text-left border transition-all duration-200 min-h-[56px]',
                    isActive
                      ? 'glass-card border-primary/60 ring-2 ring-primary/40 bg-primary/5 shadow-md'
                      : 'glass-card-subtle border-white/10 hover:border-white/25 hover:bg-white/10'
                  )}
                >
                  {/* Swatch gradient preview */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]}, ${p.colors[2]})`,
                    }}
                  >
                    {isActive && <Check className="w-5 h-5 text-white drop-shadow-md" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground truncate">{p.name}</span>
                      {isActive && (
                        <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Compact variant for header / navigation bar
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-testid="theme-switcher-trigger"
          aria-label="Customize theme & palette"
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-xl glass-card-subtle border border-white/20 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            className
          )}
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="w-4 h-4 transition-transform hover:scale-110" />
          ) : (
            <Sun className="w-4 h-4 transition-transform hover:scale-110" />
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[240px] p-2 rounded-2xl glass-panel shadow-2xl border border-white/20 animate-in fade-in-50 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 select-none"
        >
          {/* Appearance Mode Sub-row */}
          <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Appearance
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 mb-2 rounded-xl bg-muted/40 border border-white/10">
            {(
              [
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon },
                { id: 'system', label: 'Auto', icon: Laptop },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = theme === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTheme(item.id as Theme)}
                  className={cn(
                    'flex flex-col items-center justify-center py-1.5 px-2 rounded-lg text-[11px] font-medium transition-all min-h-[36px]',
                    isActive
                      ? 'bg-background text-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="w-3.5 h-3.5 mb-0.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <DropdownMenu.Separator className="h-px bg-white/10 my-1" />

          {/* Palette Switcher */}
          <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
            <span>Color Palette</span>
            <PaletteIcon className="w-3 h-3 opacity-60" />
          </div>

          <div className="space-y-1">
            {PALETTES.map((p) => {
              const isActive = palette === p.id;
              return (
                <DropdownMenu.Item
                  key={p.id}
                  onSelect={() => setPalette(p.id)}
                  className={cn(
                    'flex items-center space-x-2.5 px-2.5 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors outline-none',
                    isActive
                      ? 'bg-primary/15 text-primary font-semibold'
                      : 'text-foreground hover:bg-white/10'
                  )}
                >
                  <div
                    className="w-4 h-4 rounded-full shrink-0 shadow-sm"
                    style={{
                      background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`,
                    }}
                  />
                  <span className="flex-1 truncate">{p.name}</span>
                  {isActive && <Check className="w-3.5 h-3.5 text-primary" />}
                </DropdownMenu.Item>
              );
            })}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
