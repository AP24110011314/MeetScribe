import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Search,
  LayoutGrid,
  List,
  Clock,
  Trash2,
  Edit2,
  Download,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { deleteMeeting, exportMeetingNotes, getMeetings, renameMeeting } from '@/api/meetings';
import { MeetingListItem } from '@/types/meeting';

export function MeetingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const pageSize = 9;

  // View state: 'grid' or 'table'
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    return (localStorage.getItem('meetscribe_default_view') as 'grid' | 'table') || 'grid';
  });

  // Rename dialog state
  const [renameTarget, setRenameTarget] = useState<MeetingListItem | null>(null);
  const [newTitle, setNewTitle] = useState('');

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<MeetingListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch meetings
  useEffect(() => {
    async function fetchList() {
      setIsLoading(true);
      try {
        const res = await getMeetings({
          q: debouncedSearch || undefined,
          status: statusFilter || undefined,
          sort: sortBy,
          order,
          page,
          page_size: pageSize,
        });
        setMeetings(res.items);
        setTotal(res.total);
      } catch {
        // error loading meetings
      } finally {
        setIsLoading(false);
      }
    }
    fetchList();
  }, [debouncedSearch, statusFilter, sortBy, order, page]);

  const toggleView = () => {
    const next = viewMode === 'grid' ? 'table' : 'grid';
    setViewMode(next);
    localStorage.setItem('meetscribe_default_view', next);
  };

  const handleConfirmRename = async () => {
    if (!renameTarget || !newTitle.trim()) return;
    try {
      await renameMeeting(renameTarget.id, newTitle.trim());
      setMeetings((prev) =>
        prev.map((m) => (m.id === renameTarget.id ? { ...m, title: newTitle.trim() } : m))
      );
      toast({ type: 'success', title: 'Renamed', description: 'Meeting title updated' });
      setRenameTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rename failed';
      toast({ type: 'error', title: 'Error', description: msg });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteMeeting(deleteTarget.id);
      setMeetings((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      setTotal((prev) => Math.max(0, prev - 1));
      toast({ type: 'success', title: 'Deleted', description: 'Meeting removed' });
      setDeleteTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      toast({ type: 'error', title: 'Error', description: msg });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async (e: React.MouseEvent, m: MeetingListItem, format: 'md' | 'pdf') => {
    e.stopPropagation();
    try {
      await exportMeetingNotes(m.id, format);
      toast({ type: 'success', title: 'Exported', description: `Saved as ${format.toUpperCase()}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      toast({ type: 'error', title: 'Export Error', description: msg });
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meetings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search, filter, and review all your recorded meeting sessions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <button
            data-testid="view-toggle"
            onClick={toggleView}
            className="flex items-center gap-1.5 p-2 rounded-lg border border-input bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
            title={`Switch to ${viewMode === 'grid' ? 'Table' : 'Grid'} view`}
          >
            {viewMode === 'grid' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            <span className="hidden sm:inline">{viewMode === 'grid' ? 'Table' : 'Grid'}</span>
          </button>

          <Button onClick={() => navigate('/upload')} className="gap-2 shadow">
            <Plus className="h-4 w-4" />
            <span>New Upload</span>
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-card p-3 rounded-xl border shadow-sm">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="search-input"
            placeholder="Search meetings and transcripts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm font-medium outline-none"
        >
          <option value="">All Statuses</option>
          <option value="done">Done</option>
          <option value="processing">Processing</option>
          <option value="queued">Queued</option>
          <option value="failed">Failed</option>
        </select>

        {/* Sort select */}
        <select
          value={`${sortBy}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(':');
            setSortBy(s);
            setOrder(o);
          }}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm font-medium outline-none"
        >
          <option value="created_at:desc">Newest First</option>
          <option value="created_at:asc">Oldest First</option>
          <option value="title:asc">Title A-Z</option>
          <option value="title:desc">Title Z-A</option>
          <option value="duration:desc">Longest First</option>
        </select>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No meetings found"
          description={
            search || statusFilter
              ? 'No meeting sessions match your search or filter criteria.'
              : 'You have not uploaded any meeting audio yet.'
          }
          actionLabel="Upload Audio"
          onAction={() => navigate('/upload')}
        />
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {meetings.map((m) => (
            <Card
              key={m.id}
              data-testid="meeting-card"
              onClick={() => navigate(`/meetings/${m.id}`)}
              className="group cursor-pointer hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">
                    {m.title}
                  </h3>
                  <Badge
                    data-testid="status-badge"
                    variant={
                      m.status === 'done'
                        ? 'success'
                        : m.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {m.status}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      {m.duration_sec ? `${Math.round(m.duration_sec / 60)} mins` : 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{new Date(m.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
                  <span className="text-muted-foreground">
                    {m.action_items_count} action item{m.action_items_count === 1 ? '' : 's'}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTarget(m);
                        setNewTitle(m.title);
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground rounded"
                      title="Rename"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    {m.status === 'done' && (
                      <button
                        onClick={(e) => handleExport(e, m, 'md')}
                        className="p-1 text-muted-foreground hover:text-foreground rounded"
                        title="Export Markdown"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      data-testid="delete-meeting"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(m);
                      }}
                      className="p-1 text-muted-foreground hover:text-destructive rounded"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-xs font-semibold uppercase text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Action Items</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {meetings.map((m) => (
                  <tr
                    key={m.id}
                    data-testid="meeting-row"
                    onClick={() => navigate(`/meetings/${m.id}`)}
                    className="hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-foreground max-w-xs truncate">
                      {m.title}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        data-testid="status-badge"
                        variant={
                          m.status === 'done'
                            ? 'success'
                            : m.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {m.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {m.duration_sec ? `${Math.round(m.duration_sec / 60)}m` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {m.action_items_count}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setRenameTarget(m);
                          setNewTitle(m.title);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                        title="Rename"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        data-testid="delete-meeting"
                        onClick={() => setDeleteTarget(m)}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
          <span>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} meetings
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="font-medium text-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Meeting</DialogTitle>
            <DialogDescription>Enter a new descriptive title for this meeting session.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Meeting title"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmRename}>Save Title</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Meeting?</DialogTitle>
            <DialogDescription>
              This will permanently delete "{deleteTarget?.title}" including its transcript,
              summary, action items, and original audio file. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              data-testid="confirm-delete"
              variant="destructive"
              onClick={handleConfirmDelete}
              isLoading={isDeleting}
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
