import { useState, useEffect } from 'react';
import {
  CheckSquare,
  LayoutList,
  Columns3,
  Check,
  AlertCircle,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { deleteActionItem, getActionItems, updateActionItem } from '@/api/actionItems';
import { ActionItemData } from '@/types/meeting';
import { cn } from '@/lib/utils';

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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold glass-card-subtle text-primary border border-primary/20 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Accountability Tracker</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Action Items</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track commitments, assignments, and deliverables across all your meetings ({items.length} total).
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Board view toggle */}
          <button
            type="button"
            data-testid="board-view-toggle"
            onClick={() => setViewMode(viewMode === 'list' ? 'board' : 'list')}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl glass-card-subtle border border-white/20 hover:bg-white/10 text-xs font-semibold transition-all min-h-[44px]"
            title={`Switch to ${viewMode === 'list' ? 'Kanban Board' : 'List'} view`}
          >
            {viewMode === 'list' ? <Columns3 className="h-4 w-4 text-primary" /> : <LayoutList className="h-4 w-4 text-primary" />}
            <span>{viewMode === 'list' ? 'Board View' : 'List View'}</span>
          </button>
        </div>
      </div>

      {/* Overdue alert banner if any */}
      {overdueItems.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-destructive/15 border border-destructive/25 text-destructive text-sm shadow-md">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <span className="font-bold">Attention: </span>
            <span>
              You have {overdueItems.length} overdue action item{overdueItems.length === 1 ? '' : 's'}.
            </span>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="glass-card p-3 rounded-2xl border border-white/15 flex flex-wrap items-center gap-3">
        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-white/15 bg-background/60 backdrop-blur-md text-xs font-medium outline-none focus:ring-2 focus:ring-primary min-w-[120px]"
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
          className="h-10 px-3 rounded-xl border border-white/15 bg-background/60 backdrop-blur-md text-xs font-medium outline-none focus:ring-2 focus:ring-primary min-w-[120px]"
        >
          <option value="">All Priorities</option>
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="low">Low Priority</option>
        </select>

        {/* Owner filter */}
        <input
          type="text"
          placeholder="Filter by owner..."
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="h-10 px-3.5 rounded-xl border border-white/15 bg-background/60 backdrop-blur-md text-xs font-medium outline-none placeholder:text-muted-foreground w-44"
        />
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No action items found"
          description={
            statusFilter || priorityFilter || ownerFilter
              ? 'No items match your filter criteria.'
              : 'You have not added or generated any action items yet.'
          }
        />
      ) : viewMode === 'list' ? (
        /* List View */
        <div className="space-y-2.5">
          {items.map((item) => {
            const isOverdue =
              item.status !== 'completed' && item.due_date && item.due_date < todayStr;

            return (
              <div
                key={item.id}
                data-testid="action-item-row"
                className={cn(
                  'flex items-start sm:items-center justify-between gap-3 p-4 rounded-2xl border transition-all duration-200',
                  item.status === 'completed'
                    ? 'glass-card-subtle opacity-60 border-white/10'
                    : isOverdue
                    ? 'glass-card border-destructive/40 bg-destructive/5 shadow-md'
                    : 'glass-card border-white/15 shadow-sm hover:shadow-md'
                )}
              >
                <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
                  <button
                    data-testid="action-checkbox"
                    type="button"
                    onClick={() => handleToggleStatus(item)}
                    className={cn(
                      'h-6 w-6 rounded-lg border flex items-center justify-center transition-colors shrink-0 mt-0.5 sm:mt-0',
                      item.status === 'completed'
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-white/30 hover:border-primary glass-card-subtle'
                    )}
                  >
                    {item.status === 'completed' && <Check className="h-4 w-4" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        item.status === 'completed'
                          ? 'line-through text-muted-foreground'
                          : 'text-foreground'
                      )}
                    >
                      {item.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
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
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Avatar name={item.owner} size="sm" />
                          <span>{item.owner}</span>
                        </div>
                      )}

                      {item.due_date && (
                        <span
                          className={cn(
                            'text-xs',
                            isOverdue
                              ? 'text-destructive font-bold'
                              : 'text-muted-foreground'
                          )}
                        >
                          📅 {item.due_date} {isOverdue && '(Overdue)'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-white/10 transition-colors shrink-0"
                  title="Delete Item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* Kanban Board View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Column 1: To Do / In Progress */}
          <div className="glass-card rounded-3xl border border-white/15 p-5 shadow-xl flex flex-col space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="font-bold text-base text-foreground">To Do / In Progress</h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                {openItems.length}
              </span>
            </div>

            <div className="space-y-3 flex-1">
              {openItems.length === 0 ? (
                <p className="text-xs text-muted-foreground py-10 text-center">No active tasks</p>
              ) : (
                openItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl glass-card-subtle border border-white/15 shadow-sm space-y-2.5"
                  >
                    <p className="text-sm font-semibold text-foreground">{item.description}</p>
                    <div className="flex items-center justify-between pt-1">
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
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(item)}
                        className="text-xs text-primary font-semibold hover:underline"
                      >
                        Mark Done
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: Completed */}
          <div className="glass-card rounded-3xl border border-white/15 p-5 shadow-xl flex flex-col space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="font-bold text-base text-foreground">Completed</h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold">
                {completedItems.length}
              </span>
            </div>

            <div className="space-y-3 flex-1">
              {completedItems.length === 0 ? (
                <p className="text-xs text-muted-foreground py-10 text-center">No completed tasks yet</p>
              ) : (
                completedItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl glass-card-subtle border border-white/10 opacity-70 space-y-2.5"
                  >
                    <p className="text-sm line-through text-muted-foreground font-medium">{item.description}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Done</span>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(item)}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Reopen
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
