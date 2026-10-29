import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { AppShell } from '@/components/layout/AppShell';

function renderAppShell(initialRoute = '/dashboard') {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialRoute]}>
            <Routes>
              <Route path="/" element={<AppShell />}>
                <Route path="dashboard" element={<div>Dashboard Content</div>} />
                <Route path="meetings" element={<div>Meetings Content</div>} />
                <Route path="action-items" element={<div>Action Items Content</div>} />
                <Route path="settings" element={<div>Settings Content</div>} />
                <Route path="upload" element={<div>Upload Content</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

describe('App Shell & Navigation (U02)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders sidebar navigation links and brand', () => {
    renderAppShell();

    expect(screen.getByText('MeetScribe')).toBeInTheDocument();
    expect(screen.getAllByText('Dashboard')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Meetings')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Action Items')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Settings')[0]).toBeInTheDocument();
    expect(screen.getAllByText('New Upload')[0]).toBeInTheDocument();
  });

  it('renders theme toggle button with required data-testid', () => {
    renderAppShell();
    const toggle = screen.getByTestId('theme-toggle');
    expect(toggle).toBeInTheDocument();
  });

  it('opens and closes command palette on Cmd+K', () => {
    renderAppShell();

    // Command palette initially not visible
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();

    // Press Cmd+K
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();

    // Search and filter inside palette
    const searchInput = screen.getByPlaceholderText('Type a command or search...');
    fireEvent.change(searchInput, { target: { value: 'Meetings' } });

    expect(screen.getByText('Go to Meetings')).toBeInTheDocument();
    expect(screen.queryByText('Go to Dashboard')).not.toBeInTheDocument();

    // Close on Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });

  it('opens keyboard shortcuts modal when typing ?', () => {
    renderAppShell();

    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: '?' });

    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Cmd / Ctrl + K')).toBeInTheDocument();
  });
});
