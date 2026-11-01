import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { SettingsPage } from '@/pages/SettingsPage';
import * as meetingApi from '@/api/meetings';
import * as authContext from '@/context/AuthContext';

vi.mock('@/api/meetings', async () => {
  const actual = await vi.importActual<typeof import('@/api/meetings')>('@/api/meetings');
  return {
    ...actual,
    getNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    exportAccountData: vi.fn(),
    deleteAccount: vi.fn(),
    listWebhooks: vi.fn().mockResolvedValue([]),
  };
});

describe('Phase D: Account & Notifications (U24, U25)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 'u1', email: 'test@example.com', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
  });

  it('renders settings Account tab, allows export and triggers account delete modal', async () => {
    vi.mocked(meetingApi.exportAccountData).mockResolvedValue(undefined);
    vi.mocked(meetingApi.deleteAccount).mockResolvedValue(undefined);

    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter>
            <SettingsPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    // 1. Switch to Account & Data tab
    const accountTab = screen.getByRole('tab', { name: /Account/i });
    fireEvent.pointerDown(accountTab);
    fireEvent.click(accountTab);
    fireEvent.keyDown(accountTab, { key: ' ' });

    // 2. Export button
    await waitFor(() => {
      expect(screen.getByTestId('account-export-btn')).toBeInTheDocument();
    });
    const exportBtn = screen.getByTestId('account-export-btn');
    fireEvent.click(exportBtn);
    expect(meetingApi.exportAccountData).toHaveBeenCalledTimes(1);

    // 3. Delete Account modal trigger
    const deleteBtn = screen.getByTestId('account-delete-btn');
    expect(deleteBtn).toBeInTheDocument();
    fireEvent.click(deleteBtn);

    // 4. Confirm modal appears
    await waitFor(() => {
      expect(screen.getByText('Confirm Account Deletion')).toBeInTheDocument();
    });

    const confirmBtn = screen.getByTestId('account-delete-confirm-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(meetingApi.deleteAccount).toHaveBeenCalledTimes(1);
    });
  });

  it('renders notification bell in AppShell, opens dropdown and marks all read', async () => {
    vi.mocked(meetingApi.getNotifications).mockResolvedValue({
      items: [
        {
          id: 'n-1',
          type: 'meeting_completed',
          title: 'Meeting Ready: All-Hands',
          message: 'Summary is generated',
          link_url: '/meetings/123',
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ],
      unread_count: 1,
      total: 1,
    });
    vi.mocked(meetingApi.markAllNotificationsRead).mockResolvedValue({ status: 'ok', marked_count: 1 });

    const { AppShell } = await import('@/components/layout/AppShell');

    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter>
            <AppShell />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    // 1. Notification bell is present
    const bellBtn = await screen.findByTestId('notification-bell');
    expect(bellBtn).toBeInTheDocument();

    // 2. Click to open dropdown
    fireEvent.click(bellBtn);

    // 3. Notification item visible
    await waitFor(() => {
      expect(screen.getByText('Meeting Ready: All-Hands')).toBeInTheDocument();
    });

    // 4. Mark all read
    const markAllBtn = screen.getByTestId('notification-read-all');
    fireEvent.click(markAllBtn);

    expect(meetingApi.markAllNotificationsRead).toHaveBeenCalledTimes(1);

    // 5. Close notifications with close button
    const closeBtn = screen.getByTestId('notification-close');
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('notifications-popover')).not.toBeInTheDocument();

    // 6. Open again and close with Escape key
    fireEvent.click(bellBtn);
    expect(screen.getByTestId('notifications-popover')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('notifications-popover')).not.toBeInTheDocument();
  });
});
