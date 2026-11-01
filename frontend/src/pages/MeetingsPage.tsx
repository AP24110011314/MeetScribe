import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  Star,
  Pin,
  X,
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
} from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import {
  deleteMeeting,
  exportMeetingNotes,
  getMeetings,
  renameMeeting,
  getTags,
  getFolders,
  organizeMeeting,
  bulkMeetings,
} from '@/api/meetings';
import { MeetingListItem } from '@/types/meeting';
import { cn } from '@/lib/utils';

export function MeetingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const folderIdParam = searchParams.get('folder_id') || undefined;
  const isStarredParam = searchParams.get('is_starred') === 'true';

  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const pageSize = 9;

  // Multi-select bulk state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Fetch tags and folders
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: getTags });
  const { data: foldersData } = useQuery({ queryKey: ['folders'], queryFn: getFolders });
  const folders = foldersData?.items || [];

  // Active folder name if folder_id is set
  const activeFolder = folders.find((f) => f.id === folderIdParam);

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
          folder_id: folderIdParam,
          tag_id: selectedTagId,
          is_starred: isStarredParam || undefined,
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
  }, [debouncedSearch, statusFilter, folderIdParam, selectedTagId, isStarredParam, sortBy, order, page]);

  const toggleView = () => {
    const next = viewMode === 'grid' ? 'table' : 'grid';
    setViewMode(next);
    localStorage.setItem('meetscribe_default_view', next);
  };

  const handleToggleStar = async (e: React.MouseEvent, m: MeetingListItem) => {
    e.stopPropagation();
    const nextStarred = !m.is_starred;
    try {
      await organizeMeeting(m.id, { is_starred: nextStarred });
      setMeetings((prev) =>
        prev.map((item) => (item.id === m.id ? { ...item, is_starred: nextStarred } : item))
      );
      toast({
        type: 'success',
        title: nextStarred ? 'Starred' : 'Unstarred',
        description: nextStarred ? 'Added to starred meetings' : 'Removed from starred',
      });
    } catch {
      toast({ type: 'error', title: 'Action failed' });
    }
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
    const targetId = deleteTarget.id;
    try {
      await deleteMeeting(targetId);
      setMeetings((prev) => prev.filter((m) => m.id !== targetId));
      setTotal((prev) => Math.max(0, prev - 1));
      toast({
        type: 'success',
        title: 'Moved to Trash',
        description: 'Meeting has been moved to trash (auto-purged in 30 days)',
      });
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

  // Bulk actions
  const toggleSelectAll = () => {
    if (selectedIds.size === meetings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(meetings.map((m) => m.id)));
    }
  };

  const toggleSelectOne = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkAction = async (action: 'star' | 'unstar' | 'trash' | 'move', folderId?: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await bulkMeetings({
        meeting_ids: ids,
        action,
        folder_id: folderId,
      });

      if (action === 'trash') {
        setMeetings((prev) => prev.filter((m) => !selectedIds.has(m.id)));
        setTotal((prev) => Math.max(0, prev - ids.length));
        toast({
          type: 'success',
          title: 'Moved to Trash',
          description: `${ids.length} meetings moved to trash.`,
        });
      } else if (action === 'star') {
        setMeetings((prev) =>
          prev.map((m) => (selectedIds.has(m.id) ? { ...m, is_starred: true } : m))
        );
        toast({ type: 'success', title: 'Starred', description: `${ids.length} meetings starred.` });
      } else if (action === 'unstar') {
        setMeetings((prev) =>
          prev.map((m) => (selectedIds.has(m.id) ? { ...m, is_starred: false } : m))
        );
        toast({ type: 'success', title: 'Unstarred', description: `${ids.length} meetings unstarred.` });
      } else if (action === 'move') {
        setMeetings((prev) =>
          prev.map((m) => (selectedIds.has(m.id) ? { ...m, folder_id: folderId } : m))
        );
        toast({ type: 'success', title: 'Moved', description: `${ids.length} meetings moved.` });
      }

      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    } catch {
      toast({ type: 'error', title: 'Bulk action failed' });
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-2 sm:px-0">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold glass-card-subtle text-primary border border-primary/20 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Recorded Library</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {activeFolder ? activeFolder.name : isStarredParam ? 'Starred Meetings' : 'Meetings'}
          </h1>
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

      {/* Tag Cloud & Quick Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const p = new URLSearchParams(searchParams);
            p.delete('is_starred');
            p.delete('folder_id');
            setSearchParams(p);
            setSelectedTagId(undefined);
          }}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-medium transition-all glass-panel border',
            !isStarredParam && !folderIdParam && !selectedTagId
              ? 'bg-primary/20 text-primary border-primary/30 shadow-xs'
              : 'border-white/10 text-muted-foreground hover:bg-white/10'
          )}
        >
          All Notes
        </button>

        <button
          type="button"
          onClick={() => {
            const p = new URLSearchParams(searchParams);
            if (isStarredParam) p.delete('is_starred');
            else p.set('is_starred', 'true');
            setSearchParams(p);
          }}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-medium transition-all glass-panel border inline-flex items-center gap-1.5',
            isStarredParam
              ? 'bg-amber-500/20 text-amber-500 border-amber-500/30 shadow-xs'
              : 'border-white/10 text-muted-foreground hover:bg-white/10'
          )}
        >
          <Star className={cn('w-3.5 h-3.5', isStarredParam && 'fill-amber-500')} />
          Starred
        </button>

        {tags.map((tag) => (
          <button
            key={tag.id}
            data-testid="tag-chip"
            type="button"
            onClick={() => setSelectedTagId(selectedTagId === tag.id ? undefined : tag.id)}
            className={cn(
              'px-2.5 py-1 rounded-xl text-xs font-medium transition-all glass-panel border inline-flex items-center gap-1.5',
              selectedTagId === tag.id
                ? 'border-primary/40 bg-primary/20 text-primary'
                : 'border-white/10 text-muted-foreground hover:bg-white/10'
            )}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
            <span>{tag.name}</span>
          </button>
        ))}
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
            search || statusFilter || selectedTagId || isStarredParam || folderIdParam
              ? 'No meeting sessions match your search or filter criteria.'
              : 'You have not uploaded any meeting audio yet.'
          }
          actionLabel="Upload Audio"
          onAction={() => navigate('/upload')}
        />
      ) : viewMode === 'grid' ? (
        /* Glass Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {meetings.map((m) => {
            const isSelected = selectedIds.has(m.id);
            return (
              <div
                key={m.id}
                data-testid="meeting-card"
                onClick={() => navigate(`/meetings/${m.id}`)}
                className={cn(
                  'glass-card p-5 border rounded-3xl cursor-pointer hover:-translate-y-1 hover:shadow-xl transition-all duration-200 flex flex-col justify-between group relative overflow-hidden',
                  isSelected
                    ? 'border-primary/50 bg-primary/10 ring-2 ring-primary/30'
                    : 'border-white/15 hover:border-white/25'
                )}
              >
                {/* Selection checkbox overlay */}
                <div
                  className="absolute top-4 left-4 z-10"
                  onClick={(e) => toggleSelectOne(e, m.id)}
                >
                  <input
                    type="checkbox"
                    data-testid="meeting-select-checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="w-4 h-4 rounded border-white/20 text-primary focus:ring-primary cursor-pointer"
                  />
                </div>

                <div className="space-y-3 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-base line-clamp-1 group-hover:text-primary transition-colors text-foreground">
                      {m.title}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {m.is_pinned && (
                        <span title="Pinned">
                          <Pin className="w-3.5 h-3.5 text-primary rotate-45" />
                        </span>
                      )}
                      <button
                        type="button"
                        data-testid="star-meeting-btn"
                        onClick={(e) => handleToggleStar(e, m)}
                        className="p-1 rounded text-muted-foreground hover:text-amber-500 transition-colors"
                        title={m.is_starred ? 'Unstar' : 'Star'}
                      >
                        <Star
                          className={cn(
                            'w-4 h-4',
                            m.is_starred && 'fill-amber-500 text-amber-500'
                          )}
                        />
                      </button>
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
                  </div>

                  {/* Tags on card */}
                  {m.tags && m.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {m.tags.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium border"
                          style={{
                            backgroundColor: `${t.color}15`,
                            color: t.color,
                            borderColor: `${t.color}30`,
                          }}
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1 text-xs text-muted-foreground">
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
            );
          })}
        </div>
      ) : (
        /* Glass Table View */
        <div className="glass-card rounded-3xl border border-white/15 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="glass-card-subtle text-xs font-semibold uppercase text-muted-foreground border-b border-white/10">
                <tr>
                  <th className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === meetings.length && meetings.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-white/20 text-primary cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3.5">Title</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Duration</th>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Action Items</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {meetings.map((m) => {
                  const isSelected = selectedIds.has(m.id);
                  return (
                    <tr
                      key={m.id}
                      data-testid="meeting-row"
                      onClick={() => navigate(`/meetings/${m.id}`)}
                      className={cn(
                        'hover:bg-white/10 cursor-pointer transition-colors',
                        isSelected && 'bg-primary/10'
                      )}
                    >
                      <td className="px-4 py-4" onClick={(e) => toggleSelectOne(e, m.id)}>
                        <input
                          type="checkbox"
                          data-testid="meeting-select-checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 rounded border-white/20 text-primary cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            data-testid="star-meeting-btn"
                            onClick={(e) => handleToggleStar(e, m)}
                            className="text-muted-foreground hover:text-amber-500"
                          >
                            <Star
                              className={cn(
                                'w-4 h-4',
                                m.is_starred && 'fill-amber-500 text-amber-500'
                              )}
                            />
                          </button>
                          <span>{m.title}</span>
                          {m.is_pinned && <Pin className="w-3 h-3 text-primary rotate-45" />}
                        </div>
                      </td>
                      <td className="px-4 py-4">
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
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        {m.duration_sec ? `${Math.round(m.duration_sec / 60)} mins` : 'Unknown'}
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        {m.action_items_count}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Floating macOS Glass Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div
          data-testid="bulk-action-bar"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl glass-card backdrop-blur-2xl border border-white/20 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <span className="text-xs font-semibold text-foreground">
            {selectedIds.size} selected
          </span>
          <div className="h-4 w-px bg-white/20" />

          <Button
            size="sm"
            variant="glass"
            className="h-8 px-2.5 text-xs gap-1"
            onClick={() => handleBulkAction('star')}
          >
            <Star className="w-3.5 h-3.5 text-amber-500" />
            Star
          </Button>

          {/* Move to folder dropdown */}
          <select
            onChange={(e) => {
              if (e.target.value) handleBulkAction('move', e.target.value);
            }}
            defaultValue=""
            className="h-8 px-2.5 rounded-xl border border-white/15 bg-background/80 text-xs font-medium outline-none cursor-pointer"
          >
            <option value="" disabled>Move to Folder...</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          <Button
            size="sm"
            variant="destructive"
            className="h-8 px-2.5 text-xs gap-1 glass"
            onClick={() => handleBulkAction('trash')}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Move to Trash
          </Button>

          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
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
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      >
        <DialogContent className="max-w-md glass-card border border-white/20">
          <DialogHeader>
            <DialogTitle>Rename Meeting</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Enter meeting title"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameTarget(null)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmRename}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-md glass-card border border-white/20">
          <DialogHeader>
            <DialogTitle>Move to Trash?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;? It will be moved to the Trash bin and can be restored anytime within 30 days.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                data-testid="confirm-delete"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
              >
                {isDeleting ? 'Moving...' : 'Move to Trash'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
