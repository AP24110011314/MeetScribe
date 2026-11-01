/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type Palette = 'aurora' | 'sunset' | 'ocean' | 'forest' | 'midnight';

export interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'meetscribe_theme';
const PALETTE_STORAGE_KEY = 'meetscribe_palette';

export const PALETTES: { id: Palette; name: string; description: string; colors: string[] }[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Violet to blue to cyan',
    colors: ['#8b5cf6', '#3b82f6', '#06b6d4'],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Pink to orange to amber',
    colors: ['#f43f5e', '#f97316', '#f59e0b'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Teal to blue to indigo',
    colors: ['#14b8a6', '#0ea5e9', '#6366f1'],
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Emerald to lime to teal',
    colors: ['#10b981', '#84cc16', '#14b8a6'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep navy with electric purple',
    colors: ['#9333ea', '#6366f1', '#ec4899'],
  },
];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {
      // fallback
    }
    return 'system';
  });

  const [palette, setPaletteState] = useState<Palette>(() => {
    try {
      const saved = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(PALETTE_STORAGE_KEY) : null;
      if (saved === 'aurora' || saved === 'sunset' || saved === 'ocean' || saved === 'forest' || saved === 'midnight') {
        return saved;
      }
    } catch {
      // fallback
    }
    return 'aurora';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = () => {
      let active: 'light' | 'dark';
      if (theme === 'system') {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        active = systemPrefersDark ? 'dark' : 'light';
      } else {
        active = theme;
      }

      setResolvedTheme(active);
      if (active === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-palette', palette);
  }, [palette]);

  const setTheme = (newTheme: Theme) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      }
    } catch {
      // fallback
    }
    setThemeState(newTheme);
  };

  const setPalette = (newPalette: Palette) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(PALETTE_STORAGE_KEY, newPalette);
      }
    } catch {
      // fallback
    }
    setPaletteState(newPalette);
  };

  const toggleTheme = () => {
    if (resolvedTheme === 'dark') {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme, palette, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}

const defaultThemeContext: ThemeContextType = {
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
  palette: 'aurora',
  setPalette: () => {},
};

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  return context ?? defaultThemeContext;
}
