import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Settings,
  Upload,
  Sun,
  Moon,
  Search,
  X,
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { WindowChrome } from '@/components/ui/WindowChrome';

interface CommandItem {
  id: string;
  label: string;
  category: string;
  icon: React.ElementType;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    {
      id: 'dashboard',
      label: 'Go to Dashboard',
      category: 'Navigation',
      icon: LayoutDashboard,
      action: () => {
        navigate('/dashboard');
        onClose();
      },
    },
    {
      id: 'meetings',
      label: 'Go to Meetings',
      category: 'Navigation',
      icon: Calendar,
      action: () => {
        navigate('/meetings');
        onClose();
      },
    },
    {
      id: 'action-items',
      label: 'Go to Action Items',
      category: 'Navigation',
      icon: CheckSquare,
      action: () => {
        navigate('/action-items');
        onClose();
      },
    },
    {
      id: 'settings',
      label: 'Go to Settings',
      category: 'Navigation',
      icon: Settings,
      action: () => {
        navigate('/settings');
        onClose();
      },
    },
    {
      id: 'upload',
      label: 'Upload New Recording',
      category: 'Actions',
      icon: Upload,
      action: () => {
        navigate('/upload');
        onClose();
      },
    },
    {
      id: 'theme',
      label: `Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`,
      category: 'Actions',
      icon: resolvedTheme === 'dark' ? Sun : Moon,
      action: () => {
        toggleTheme();
        onClose();
      },
    },
  ];

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      };
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 px-4 bg-black/60 backdrop-blur-md animate-in fade-in-0">
      <div
        data-testid="command-palette"
        className="w-full max-w-lg rounded-2xl glass-panel shadow-2xl border border-white/20 overflow-hidden animate-in zoom-in-95"
      >
        <WindowChrome
          title="Quick Actions & Search"
          onClose={onClose}
        />

        <div className="flex items-center border-b border-white/10 px-4 py-1">
          <Search className="mr-3 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex h-12 w-full rounded-md bg-transparent py-3 text-base sm:text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No matching commands found.</p>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                      : 'hover:bg-white/10 text-foreground font-medium'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full ${
                      isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'glass-card-subtle text-muted-foreground'
                    }`}
                  >
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2.5 text-xs text-muted-foreground glass-card-subtle">
          <span>Navigate with ↑↓, Enter to select</span>
          <kbd className="px-1.5 py-0.5 rounded border border-white/15 bg-background/50 font-mono text-[10px]">
            Esc
          </kbd>
        </div>
      </div>
    </div>
  );
}
