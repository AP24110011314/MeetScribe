import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

function ToastTrigger() {
  const { toast } = useToast();
  return (
    <button
      onClick={() =>
        toast({
          type: 'success',
          title: 'Action Succeeded',
          description: 'Undo available',
        })
      }
    >
      Show Toast
    </button>
  );
}

describe('Settings & UI Polish (U13, U14)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists density and default view settings to localStorage', () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <SettingsPage />
        </ToastProvider>
      </ThemeProvider>
    );

    // Change density to compact
    const compactBtn = screen.getByText('Compact');
    fireEvent.click(compactBtn);
    expect(localStorage.getItem('meetscribe_density')).toBe('compact');

    // Change default view to table
    const tableBtn = screen.getByText('Table Row View');
    fireEvent.click(tableBtn);
    expect(localStorage.getItem('meetscribe_default_view')).toBe('table');
  });

  it('renders toasts with data-testid="toast"', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );

    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByText('Show Toast'));
    });

    expect(screen.getByTestId('toast')).toBeInTheDocument();
    expect(screen.getByText('Action Succeeded')).toBeInTheDocument();
  });

  it('renders custom 404 page with data-testid="not-found"', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('not-found')).toBeInTheDocument();
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });
});
