import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

function ThemeConsumer() {
  const { theme, resolvedTheme, setTheme, toggleTheme, palette, setPalette } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <span data-testid="current-palette">{palette}</span>
      <button data-testid="toggle-btn" onClick={toggleTheme}>
        Toggle
      </button>
      <button data-testid="set-dark-btn" onClick={() => setTheme('dark')}>
        Set Dark
      </button>
      <button data-testid="set-light-btn" onClick={() => setTheme('light')}>
        Set Light
      </button>
      <button data-testid="set-system-btn" onClick={() => setTheme('system')}>
        Set System
      </button>
      <button data-testid="set-sunset-btn" onClick={() => setPalette('sunset')}>
        Set Sunset
      </button>
      <button data-testid="set-ocean-btn" onClick={() => setPalette('ocean')}>
        Set Ocean
      </button>
    </div>
  );
}

describe('Theme System (U01)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to system theme and applies light when system is light', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('sets dark theme explicitly and updates class and localStorage', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId('set-dark-btn'));

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('meetscribe_theme')).toBe('dark');
  });

  it('toggles theme between light and dark', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    // Initial is light -> toggle to dark
    fireEvent.click(screen.getByTestId('toggle-btn'));
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Toggle back to light
    fireEvent.click(screen.getByTestId('toggle-btn'));
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists and restores saved theme from localStorage', () => {
    localStorage.setItem('meetscribe_theme', 'dark');

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('defaults to aurora palette and updates on change', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-palette')).toHaveTextContent('aurora');
    expect(document.documentElement.getAttribute('data-palette')).toBe('aurora');

    fireEvent.click(screen.getByTestId('set-sunset-btn'));
    expect(screen.getByTestId('current-palette')).toHaveTextContent('sunset');
    expect(document.documentElement.getAttribute('data-palette')).toBe('sunset');
    expect(localStorage.getItem('meetscribe_palette')).toBe('sunset');
  });

  it('restores saved palette from localStorage', () => {
    localStorage.setItem('meetscribe_palette', 'ocean');

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-palette')).toHaveTextContent('ocean');
    expect(document.documentElement.getAttribute('data-palette')).toBe('ocean');
  });
});
