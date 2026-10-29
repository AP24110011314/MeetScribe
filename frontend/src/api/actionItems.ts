import { apiFetch } from './client';
import { ActionItemData, ActionItemListResponse } from '@/types/meeting';

export async function getActionItems(params: {
  status?: string;
  owner?: string;
  priority?: string;
  due_before?: string;
  meeting_id?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<ActionItemListResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.owner) query.set('owner', params.owner);
  if (params.priority) query.set('priority', params.priority);
  if (params.due_before) query.set('due_before', params.due_before);
  if (params.meeting_id) query.set('meeting_id', params.meeting_id);
  if (params.page) query.set('page', params.page.toString());
  if (params.page_size) query.set('page_size', params.page_size.toString());

  const qs = query.toString();
  return apiFetch<ActionItemListResponse>(`/action-items${qs ? `?${qs}` : ''}`);
}

export async function updateActionItem(
  id: string,
  data: Partial<Pick<ActionItemData, 'description' | 'owner' | 'due_date' | 'priority' | 'status'>>
): Promise<ActionItemData> {
  return apiFetch<ActionItemData>(`/action-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteActionItem(id: string): Promise<void> {
  await apiFetch<void>(`/action-items/${id}`, {
    method: 'DELETE',
  });
}
