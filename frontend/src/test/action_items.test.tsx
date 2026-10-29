import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { ActionItemsPage } from '@/pages/ActionItemsPage';

vi.mock('@/api/actionItems', () => ({
  getActionItems: vi.fn(),
  updateActionItem: vi.fn(),
  deleteActionItem: vi.fn(),
}));

import * as actionItemsApi from '@/api/actionItems';

function renderActionItems() {
  return render(
    <ToastProvider>
      <ActionItemsPage />
    </ToastProvider>
  );
}

describe('Action Items (U11, U12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockItems = [
    {
      id: 'item-1',
      meeting_id: 'm1',
      description: 'Implement Redis lock',
      owner: 'Ravi',
      due_date: '2026-11-10',
      priority: 'high' as const,
      status: 'open' as const,
      source_start_sec: 10.0,
      created_by_ai: true,
      created_at: '2026-10-29T10:00:00Z',
      updated_at: '2026-10-29T10:00:00Z',
    },
    {
      id: 'item-2',
      meeting_id: 'm1',
      description: 'Review PR on Monday',
      owner: 'Priya',
      due_date: '2025-01-01', // Overdue
      priority: 'medium' as const,
      status: 'open' as const,
      source_start_sec: 25.0,
      created_by_ai: false,
      created_at: '2026-10-29T10:00:00Z',
      updated_at: '2026-10-29T10:00:00Z',
    },
  ];

  it('renders action item rows with priority badges and owners', async () => {
    vi.mocked(actionItemsApi.getActionItems).mockResolvedValueOnce({
      items: mockItems,
      total: 2,
      page: 1,
      page_size: 100,
    });

    renderActionItems();

    expect(await screen.findByText('Implement Redis lock')).toBeInTheDocument();
    expect(screen.getByText('Review PR on Monday')).toBeInTheDocument();
    expect(screen.getByText('Ravi')).toBeInTheDocument();
    expect(screen.getByText('Priya')).toBeInTheDocument();
  });

  it('flags and highlights overdue items', async () => {
    vi.mocked(actionItemsApi.getActionItems).mockResolvedValueOnce({
      items: mockItems,
      total: 2,
      page: 1,
      page_size: 100,
    });

    renderActionItems();

    expect((await screen.findAllByText(/Overdue/i)).length).toBeGreaterThanOrEqual(1);
  });

  it('toggles action item completion using action-checkbox', async () => {
    vi.mocked(actionItemsApi.getActionItems).mockResolvedValueOnce({
      items: mockItems,
      total: 2,
      page: 1,
      page_size: 100,
    });
    vi.mocked(actionItemsApi.updateActionItem).mockResolvedValueOnce({
      ...mockItems[0],
      status: 'completed',
    });

    renderActionItems();

    const checkboxes = await screen.findAllByTestId('action-checkbox');
    fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(actionItemsApi.updateActionItem).toHaveBeenCalledWith('item-1', {
        status: 'completed',
      });
    });
  });

  it('toggles to board view with board-view-toggle', async () => {
    vi.mocked(actionItemsApi.getActionItems).mockResolvedValueOnce({
      items: mockItems,
      total: 2,
      page: 1,
      page_size: 100,
    });

    renderActionItems();

    await screen.findByText('Implement Redis lock');

    const toggle = screen.getByTestId('board-view-toggle');
    fireEvent.click(toggle);

    expect(await screen.findByText('To Do / In Progress')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Completed' })).toBeInTheDocument();
  });
});
