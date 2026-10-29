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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in-0">
      <div
        data-testid="command-palette"
        className="w-full max-w-lg rounded-xl border bg-card text-card-foreground shadow-2xl overflow-hidden animate-in zoom-in-95"
      >
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No results found.</p>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 font-medium">{item.label}</span>
                  <span
                    className={`text-xs ${
                      isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    }`}
                  >
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground bg-muted/40">
          <span>Navigate with arrows, Enter to select</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
