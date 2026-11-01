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
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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
      toast({ type: 'success', title: 'Deleted', description: 'Meeting permanently removed' });
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
    } catch {
      toast({ type: 'error', title: 'Export failed', description: 'Could not export notes' });
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold glass-card-subtle text-primary border border-primary/20 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Recorded Library</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Meetings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, search, and export transcribed meetings and summaries ({total} total)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            data-testid="view-toggle"
            variant="glass"
            size="icon"
            onClick={toggleView}
            title={`Switch to ${viewMode === 'grid' ? 'table' : 'grid'} view`}
          >
            {viewMode === 'grid' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>

          <Button onClick={() => navigate('/upload')} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" />
            <span>New Upload</span>
          </Button>
        </div>
      </div>

      {/* Glass Filter & Search Toolbar */}
      <div className="glass-card p-3 rounded-2xl border border-white/15 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex-1 relative">
          <Input
            data-testid="search-input"
            type="text"
            placeholder="Search meetings by title or text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-white/10"
            startIcon={<Search className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {/* Status select */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 px-3 rounded-xl border border-white/15 bg-background/60 backdrop-blur-md text-xs font-medium outline-none focus:ring-2 focus:ring-primary min-w-[110px]"
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
            className="h-10 px-3 rounded-xl border border-white/15 bg-background/60 backdrop-blur-md text-xs font-medium outline-none focus:ring-2 focus:ring-primary min-w-[130px]"
          >
            <option value="created_at:desc">Newest First</option>
            <option value="created_at:asc">Oldest First</option>
            <option value="title:asc">Title A-Z</option>
            <option value="title:desc">Title Z-A</option>
            <option value="duration:desc">Longest First</option>
          </select>
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-3xl" />
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
        /* Glass Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {meetings.map((m) => (
            <div
              key={m.id}
              data-testid="meeting-card"
              onClick={() => navigate(`/meetings/${m.id}`)}
              className="glass-card p-5 border border-white/15 rounded-3xl cursor-pointer hover:-translate-y-1 hover:shadow-xl transition-all duration-200 flex flex-col justify-between group"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-base line-clamp-1 group-hover:text-primary transition-colors text-foreground">
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
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                    <span>
                      {m.duration_sec ? `${Math.round(m.duration_sec / 60)} mins` : 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                    <span>{new Date(m.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-3.5 mt-4 text-xs">
                <span className="text-muted-foreground font-medium">
                  {m.action_items_count} action item{m.action_items_count === 1 ? '' : 's'}
                </span>

                {/* Card Action Icons */}
                <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenameTarget(m);
                      setNewTitle(m.title);
                    }}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/10 transition-colors"
                    title="Rename"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  {m.status === 'done' && (
                    <button
                      type="button"
                      onClick={(e) => handleExport(e, m, 'md')}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/10 transition-colors"
                      title="Export Markdown"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="delete-meeting"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(m);
                    }}
                    className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-white/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Glass Table View */
        <div className="glass-card rounded-3xl border border-white/15 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="glass-card-subtle text-xs font-semibold uppercase text-muted-foreground border-b border-white/10">
                <tr>
                  <th className="px-5 py-3.5">Title</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Duration</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Action Items</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {meetings.map((m) => (
                  <tr
                    key={m.id}
                    data-testid="meeting-row"
                    onClick={() => navigate(`/meetings/${m.id}`)}
                    className="hover:bg-white/10 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-4 font-semibold text-foreground">{m.title}</td>
                    <td className="px-5 py-4">
                      <Badge
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
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {m.duration_sec ? `${Math.round(m.duration_sec / 60)} mins` : 'Unknown'}
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {m.action_items_count}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setRenameTarget(m);
                            setNewTitle(m.title);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/10"
                          title="Rename"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {m.status === 'done' && (
                          <button
                            type="button"
                            onClick={(e) => handleExport(e, m, 'md')}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/10"
                            title="Export Markdown"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid="delete-meeting"
                          onClick={() => setDeleteTarget(m)}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-white/10"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="glass"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground px-2 font-mono">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="glass"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={() => setRenameTarget(null)}>
        <DialogContent className="glass-panel border-white/20 rounded-3xl">
          <DialogHeader>
            <DialogTitle>Rename Meeting</DialogTitle>
            <DialogDescription>Enter a new descriptive title for this meeting session.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Sprint Retrospective"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmRename}>Save Title</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="glass-panel border-white/20 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              <span>Delete Meeting</span>
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete "{deleteTarget?.title}"? All associated transcripts, summaries, and action items will be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              data-testid="confirm-delete"
              variant="destructive"
              onClick={handleConfirmDelete}
              isLoading={isDeleting}
            >
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
