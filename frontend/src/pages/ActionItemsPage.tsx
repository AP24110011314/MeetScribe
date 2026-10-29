import { useState, useEffect } from 'react';
import {
  CheckSquare,
  LayoutList,
  Columns3,
  Check,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { deleteActionItem, getActionItems, updateActionItem } from '@/api/actionItems';
import { ActionItemData } from '@/types/meeting';

export function ActionItemsPage() {
  const { toast } = useToast();

  const [items, setItems] = useState<ActionItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // View mode: 'list' or 'board'
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');

  useEffect(() => {
    async function fetchItems() {
      setIsLoading(true);
      try {
        const res = await getActionItems({
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          owner: ownerFilter || undefined,
          page_size: 100,
        });
        setItems(res.items);
      } catch {
        // error loading items
      } finally {
        setIsLoading(false);
      }
    }
    fetchItems();
  }, [statusFilter, priorityFilter, ownerFilter]);

  const handleToggleStatus = async (item: ActionItemData) => {
    const nextStatus = item.status === 'completed' ? 'open' : 'completed';
    try {
      await updateActionItem(item.id, { status: nextStatus });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: nextStatus } : i))
      );
      toast({
        type: 'success',
        title: nextStatus === 'completed' ? 'Completed' : 'Reopened',
        description: item.description,
      });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to update item' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteActionItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast({ type: 'success', title: 'Deleted', description: 'Action item removed' });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to delete item' });
    }
  };

  // Group items into Open and Done
  const openItems = items.filter((i) => i.status !== 'completed' && i.status !== 'cancelled');
  const completedItems = items.filter((i) => i.status === 'completed');

  // Overdue detection
  const todayStr = new Date().toISOString().split('T')[0];
  const overdueItems = openItems.filter((i) => i.due_date && i.due_date < todayStr);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Action Items</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track commitments, assignments, and deliverables across all your meetings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Board view toggle */}
          <button
            data-testid="board-view-toggle"
            onClick={() => setViewMode(viewMode === 'list' ? 'board' : 'list')}
            className="flex items-center gap-1.5 p-2 rounded-lg border border-input bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
            title={`Switch to ${viewMode === 'list' ? 'Kanban Board' : 'List'} view`}
          >
            {viewMode === 'list' ? <Columns3 className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
            <span className="hidden sm:inline">{viewMode === 'list' ? 'Board View' : 'List View'}</span>
          </button>
        </div>
      </div>

      {/* Overdue alert banner if any */}
      {overdueItems.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Attention: </span>
            <span>
              You have {overdueItems.length} overdue action item{overdueItems.length === 1 ? '' : 's'}.
            </span>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-card p-3 rounded-xl border shadow-sm">
        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm font-medium outline-none"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm font-medium outline-none"
        >
          <option value="">All Priorities</option>
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="low">Low Priority</option>
        </select>

        {/* Owner filter input */}
        <Input
          placeholder="Filter by owner..."
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="h-9 w-44"
        />
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No action items found"
          description="Action items extracted from your recorded meetings will appear here."
        />
      ) : viewMode === 'list' ? (
        /* List View */
        <div className="space-y-6">
          {/* Open Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              To Do & In Progress ({openItems.length})
            </h3>
            <div className="space-y-2">
              {openItems.map((item) => (
                <div
                  key={item.id}
                  data-testid="action-item-row"
                  className="flex items-center justify-between gap-3 p-3.5 rounded-xl border bg-card shadow-sm hover:border-primary/50 transition-all"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      data-testid="action-checkbox"
                      onClick={() => handleToggleStatus(item)}
                      className="h-5 w-5 rounded-md border border-input hover:border-primary flex items-center justify-center transition-colors shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.description}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge
                          variant={
                            item.priority === 'high'
                              ? 'destructive'
                              : item.priority === 'medium'
                              ? 'warning'
                              : 'secondary'
                          }
                        >
                          {item.priority}
                        </Badge>
                        {item.owner && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Avatar name={item.owner} size="sm" />
                            <span>{item.owner}</span>
                          </div>
                        )}
                        {item.due_date && (
                          <span
                            className={`text-xs ${
                              item.due_date < todayStr
                                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                : 'text-muted-foreground'
                            }`}
                          >
                            📅 {item.due_date} {item.due_date < todayStr && '(Overdue)'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1 text-muted-foreground hover:text-destructive rounded"
                    title="Delete item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Completed Section */}
          {completedItems.length > 0 && (
            <div className="space-y-2 pt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Completed ({completedItems.length})
              </h3>
              <div className="space-y-2">
                {completedItems.map((item) => (
                  <div
                    key={item.id}
                    data-testid="action-item-row"
                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl border bg-card/60 opacity-60 transition-all"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        data-testid="action-checkbox"
                        onClick={() => handleToggleStatus(item)}
                        className="h-5 w-5 rounded-md bg-primary border-primary text-primary-foreground flex items-center justify-center shrink-0"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-through text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1 text-muted-foreground hover:text-destructive rounded"
                      title="Delete item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Kanban Board View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Open Column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b">
              <h3 className="font-semibold text-sm">To Do / In Progress</h3>
              <Badge variant="secondary">{openItems.length}</Badge>
            </div>
            <div className="space-y-3 min-h-[300px] p-2 rounded-xl bg-muted/20 border border-dashed">
              {openItems.map((item) => (
                <Card key={item.id} data-testid="action-item-row" className="p-4 shadow-sm space-y-2">
                  <p className="text-sm font-medium">{item.description}</p>
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant={item.priority === 'high' ? 'destructive' : 'secondary'}>
                      {item.priority}
                    </Badge>
                    {item.owner && <Avatar name={item.owner} size="sm" />}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t text-xs">
                    <span className="text-muted-foreground">{item.due_date || 'No due date'}</span>
                    <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(item)}>
                      Mark Done
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Completed Column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b">
              <h3 className="font-semibold text-sm">Completed</h3>
              <Badge variant="success">{completedItems.length}</Badge>
            </div>
            <div className="space-y-3 min-h-[300px] p-2 rounded-xl bg-muted/20 border border-dashed">
              {completedItems.map((item) => (
                <Card key={item.id} data-testid="action-item-row" className="p-4 shadow-sm opacity-60 space-y-2">
                  <p className="text-sm font-medium line-through text-muted-foreground">
                    {item.description}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t text-xs">
                    <span className="text-muted-foreground">Completed</span>
                    <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(item)}>
                      Reopen
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
