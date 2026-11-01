import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Globe,
  Copy,
  Download,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Search,
  Check,
  Plus,
  ArrowLeft,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Avatar } from '@/components/ui/Avatar';
import { WindowChrome } from '@/components/ui/WindowChrome';
import { useToast } from '@/components/ui/Toast';
import {
  createMeetingActionItem,
  exportMeetingNotes,
  getMeetingAudioUrl,
  getMeetingDetail,
  getMeetingTranscript,
  renameMeeting,
} from '@/api/meetings';
import { updateActionItem } from '@/api/actionItems';
import { ActionItemData, MeetingDetailData, TranscriptData } from '@/types/meeting';
import { cn } from '@/lib/utils';

export function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [meeting, setMeeting] = useState<MeetingDetailData | null>(null);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');

  // Audio Player State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Transcript tab state
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [followAlong, setFollowAlong] = useState(true);
  const segmentRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // New action item state
  const [newDesc, setNewDesc] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [isAddingItem, setIsAddingItem] = useState(false);

  useEffect(() => {
    if (!id) return;

    async function loadData() {
      setIsLoading(true);
      try {
        const m = await getMeetingDetail(id!);
        setMeeting(m);
        setTitleInput(m.title);

        if (m.has_transcript) {
          try {
            const tr = await getMeetingTranscript(id!);
            setTranscript(tr);
          } catch {
            // transcript load error
          }
        }

        try {
          const a = await getMeetingAudioUrl(id!);
          setAudioUrl(a.url);
        } catch {
          // audio url load error
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load meeting';
        toast({ type: 'error', title: 'Error', description: msg });
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [id, toast]);

  // Audio time update handler
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      setCurrentTime(cur);

      // Auto scroll active segment if follow along is enabled
      if (followAlong && transcript?.segments) {
        const activeSeg = transcript.segments.find(
          (s) => cur >= s.start && cur <= s.end
        );
        if (activeSeg && segmentRefs.current[activeSeg.id]) {
          segmentRefs.current[activeSeg.id]?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }
      }
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekRelative = (deltaSeconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(
      0,
      Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + deltaSeconds)
    );
  };

  const seekTo = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    if (!isPlaying) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleSaveTitle = async () => {
    if (!id || !titleInput.trim()) return;
    try {
      await renameMeeting(id, titleInput.trim());
      setMeeting((prev) => (prev ? { ...prev, title: titleInput.trim(), title_edited: true } : null));
      setIsEditingTitle(false);
      toast({ type: 'success', title: 'Saved', description: 'Meeting title updated' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rename failed';
      toast({ type: 'error', title: 'Error', description: msg });
    }
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ type: 'success', title: 'Copied', description: `${label} copied to clipboard` });
  };

  const handleCopyAllMarkdown = () => {
    if (!meeting) return;
    let md = `# ${meeting.title}\n\n`;
    if (meeting.summary) {
      md += `## Executive Summary\n\n${meeting.summary.summary}\n\n`;
      if (meeting.summary.key_points?.length) {
        md += `## Key Discussion Points\n\n` + meeting.summary.key_points.map((p) => `- ${p}`).join('\n') + '\n\n';
      }
      if (meeting.summary.decisions?.length) {
        md += `## Key Decisions\n\n` + meeting.summary.decisions.map((d) => `- [x] ${d}`).join('\n') + '\n\n';
      }
    }
    if (meeting.action_items?.length) {
      md += `## Action Items\n\n` + meeting.action_items.map((i) => `- [ ] **${i.description}** (${i.owner || 'Unassigned'}, Priority: ${i.priority})`).join('\n') + '\n\n';
    }
    navigator.clipboard.writeText(md);
    toast({ type: 'success', title: 'Copied All', description: 'Full meeting notes copied as Markdown' });
  };

  const handleToggleItemStatus = async (item: ActionItemData) => {
    const nextStatus = item.status === 'completed' ? 'open' : 'completed';
    try {
      await updateActionItem(item.id, { status: nextStatus });
      setMeeting((prev) =>
        prev
          ? {
              ...prev,
              action_items: prev.action_items.map((i) =>
                i.id === item.id ? { ...i, status: nextStatus } : i
              ),
            }
          : null
      );
      toast({
        type: 'success',
        title: nextStatus === 'completed' ? 'Action Item Completed' : 'Action Item Reopened',
      });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to update action item' });
    }
  };

  const handleCreateActionItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newDesc.trim()) return;

    try {
      const created = await createMeetingActionItem(id, {
        description: newDesc.trim(),
        owner: newOwner.trim() || null,
        priority: newPriority,
        status: 'open',
      });
      setMeeting((prev) =>
        prev ? { ...prev, action_items: [...prev.action_items, created] } : null
      );
      setNewDesc('');
      setNewOwner('');
      setIsAddingItem(false);
      toast({ type: 'success', title: 'Created', description: 'New action item added' });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to add action item' });
    }
  };

  const handleExport = async (format: 'md' | 'pdf') => {
    if (!id) return;
    try {
      await exportMeetingNotes(id, format);
      toast({ type: 'success', title: 'Exported', description: `Saved as ${format.toUpperCase()}` });
    } catch {
      toast({ type: 'error', title: 'Export failed' });
    }
  };

  // Filter transcript segments by search
  const filteredSegments =
    transcript?.segments.filter((s) =>
      !transcriptSearch ? true : s.text.toLowerCase().includes(transcriptSearch.toLowerCase())
    ) || [];

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-2/3 rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-3xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Meeting not found or you don't have access.</p>
        <Button onClick={() => navigate('/meetings')} className="mt-4">
          Back to Meetings
        </Button>
      </div>
    );
  }

  const completedCount = meeting.action_items.filter((i) => i.status === 'completed').length;
  const totalCount = meeting.action_items.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-36">
      {/* Back button & Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <button
          onClick={() => navigate('/meetings')}
          className="flex items-center gap-1 hover:text-foreground transition-colors p-1 rounded-md"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Meetings</span>
        </button>
        <span>/</span>
        <span className="truncate max-w-xs text-foreground font-medium">{meeting.title}</span>
      </div>

      {/* Glass Header Window */}
      <div className="glass-card rounded-3xl border border-white/20 shadow-xl overflow-hidden backdrop-blur-2xl">
        <WindowChrome
          title="Meeting Document"
          subtitle={meeting.duration_sec ? `${Math.round(meeting.duration_sec / 60)} mins` : 'Recorded Audio'}
          actions={
            <Badge
              variant={
                meeting.status === 'done'
                  ? 'success'
                  : meeting.status === 'failed'
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {meeting.status}
            </Badge>
          }
        />

        <div className="p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center gap-2 max-w-xl">
                  <Input
                    data-testid="meeting-title"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') setIsEditingTitle(false);
                    }}
                  />
                  <Button size="sm" onClick={handleSaveTitle}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsEditingTitle(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <h1
                  data-testid="meeting-title"
                  onClick={() => setIsEditingTitle(true)}
                  className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground hover:text-primary cursor-pointer transition-colors"
                  title="Click to rename"
                >
                  {meeting.title}
                </h1>
              )}
            </div>

            {/* Export & Markdown Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="glass" size="sm" onClick={handleCopyAllMarkdown} className="gap-1.5 text-xs">
                <Copy className="h-3.5 w-3.5" />
                <span>Copy All</span>
              </Button>
              <Button
                data-testid="export-md"
                variant="glass"
                size="sm"
                onClick={() => handleExport('md')}
                className="gap-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Markdown</span>
              </Button>
              <Button
                data-testid="export-pdf"
                variant="glass"
                size="sm"
                onClick={() => handleExport('pdf')}
                className="gap-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>PDF</span>
              </Button>
            </div>
          </div>

          {/* Metadata Chips */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-card-subtle border border-white/10">
              <Clock className="h-3.5 w-3.5 text-primary/70" />
              <span>{meeting.duration_sec ? `${Math.round(meeting.duration_sec / 60)} mins` : 'Unknown duration'}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-card-subtle border border-white/10">
              <Globe className="h-3.5 w-3.5 text-primary/70" />
              <span>{meeting.language || 'English'}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-card-subtle border border-white/10">
              <Calendar className="h-3.5 w-3.5 text-primary/70" />
              <span>{new Date(meeting.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Layout */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="border-b border-white/10 pb-3">
          <TabsList className="glass-card-subtle p-1 rounded-2xl border border-white/10">
            <TabsTrigger data-testid="tab-overview" value="overview" className="rounded-xl min-h-[36px]">
              Overview
            </TabsTrigger>
            <TabsTrigger data-testid="tab-transcript" value="transcript" className="rounded-xl min-h-[36px]">
              Transcript
            </TabsTrigger>
            <TabsTrigger data-testid="tab-actions" value="actions" className="rounded-xl min-h-[36px]">
              Action Items ({meeting.action_items.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-6 pt-4">
          {/* Executive Summary Glass Card */}
          <Card data-testid="summary-card" className="rounded-3xl border border-white/15 shadow-xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span>Executive Summary</span>
                </CardTitle>
                <CardDescription>Synthesized key takeaways and highlights</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopyText(meeting.summary?.summary || '', 'Summary')}
                className="gap-1.5 text-xs"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                {meeting.summary?.summary || 'Summary is being prepared...'}
              </p>

              {/* Key discussion points */}
              {meeting.summary?.key_points && meeting.summary.key_points.length > 0 && (
                <div className="mt-6 border-t border-white/10 pt-4">
                  <h4 className="text-sm font-bold mb-3 text-foreground">Key Discussion Points</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                    {meeting.summary.key_points.map((point, idx) => (
                      <li key={idx} className="leading-snug">{point}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Key Decisions Glass Card */}
          <Card data-testid="decisions-card" className="rounded-3xl border border-white/15 shadow-xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-xl">Key Decisions Made</CardTitle>
                <CardDescription>Explicit conclusions and agreements reached</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  handleCopyText((meeting.summary?.decisions || []).join('\n'), 'Decisions')
                }
                className="gap-1.5 text-xs"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </Button>
            </CardHeader>
            <CardContent>
              {meeting.summary?.decisions && meeting.summary.decisions.length > 0 ? (
                <div className="space-y-2.5">
                  {meeting.summary.decisions.map((dec, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3.5 rounded-2xl glass-card-subtle border border-primary/20 text-sm"
                    >
                      <span className="font-bold text-primary shrink-0">✓</span>
                      <span className="text-foreground leading-snug">{dec}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-4 text-center">No explicit decisions recorded.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Transcript */}
        <TabsContent value="transcript" className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Input
                data-testid="transcript-search"
                placeholder="Search transcript text..."
                value={transcriptSearch}
                onChange={(e) => setTranscriptSearch(e.target.value)}
                className="pl-10"
                startIcon={<Search className="h-4 w-4 text-muted-foreground" />}
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={followAlong}
                onChange={(e) => setFollowAlong(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary h-4 w-4"
              />
              <span>Auto-scroll (Follow Along)</span>
            </label>
          </div>

          <Card className="rounded-3xl border border-white/15 shadow-xl overflow-hidden">
            <CardContent className="p-4 sm:p-6 divide-y divide-white/10 max-h-[550px] overflow-y-auto">
              {filteredSegments.length === 0 ? (
                <p className="text-center py-12 text-sm text-muted-foreground">
                  {transcriptSearch ? 'No matching segments found.' : 'No transcript available.'}
                </p>
              ) : (
                filteredSegments.map((seg) => {
                  const isActive = currentTime >= seg.start && currentTime <= seg.end;
                  return (
                    <div
                      key={seg.id}
                      ref={(el) => (segmentRefs.current[seg.id] = el)}
                      data-testid="transcript-segment"
                      onClick={() => seekTo(seg.start)}
                      className={cn(
                        'py-3.5 px-3.5 rounded-2xl cursor-pointer transition-all',
                        isActive
                          ? 'glass-card bg-primary/15 border-primary/30 text-foreground font-medium shadow-sm'
                          : 'hover:bg-white/10 text-foreground/90'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-mono text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                          {Math.floor(seg.start / 60)}:
                          {Math.floor(seg.start % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed">{seg.text}</p>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Action Items */}
        <TabsContent value="actions" className="space-y-6 pt-4">
          <div className="glass-card p-4 rounded-2xl border border-white/15">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1.5">
              <span>
                {completedCount} of {totalCount} completed
              </span>
              <span className="font-mono tabular-nums">{completionPct}%</span>
            </div>
            <ProgressBar value={completionPct} />
          </div>

          {/* Action item rows */}
          <div className="space-y-2.5">
            {meeting.action_items.map((item) => (
              <div
                key={item.id}
                data-testid="action-item-row"
                className={cn(
                  'flex items-start sm:items-center justify-between gap-3 p-4 rounded-2xl border transition-all',
                  item.status === 'completed'
                    ? 'glass-card-subtle opacity-60 border-white/10'
                    : 'glass-card border-white/15 shadow-md'
                )}
              >
                <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
                  <button
                    data-testid="action-checkbox"
                    type="button"
                    onClick={() => handleToggleItemStatus(item)}
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
                        item.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'
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
                        <span className="text-xs text-muted-foreground">📅 {item.due_date}</span>
                      )}
                    </div>
                  </div>
                </div>

                {item.source_start_sec !== null && (
                  <button
                    type="button"
                    onClick={() => seekTo(item.source_start_sec!)}
                    className="text-xs font-mono text-primary hover:underline shrink-0 px-2 py-1 rounded-lg glass-card-subtle border border-primary/20"
                    title="Jump to audio segment"
                  >
                    @{Math.floor(item.source_start_sec! / 60)}:
                    {Math.floor(item.source_start_sec! % 60).toString().padStart(2, '0')}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add new action item */}
          {isAddingItem ? (
            <Card className="p-5 border-dashed border-white/25 rounded-3xl shadow-xl">
              <form onSubmit={handleCreateActionItem} className="space-y-3.5">
                <Input
                  placeholder="What needs to be done?"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  autoFocus
                  required
                />
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    placeholder="Owner (optional)"
                    value={newOwner}
                    onChange={(e) => setNewOwner(e.target.value)}
                    className="sm:w-1/2"
                  />
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as 'low' | 'medium' | 'high')}
                    className="h-11 px-3.5 rounded-xl border border-white/15 bg-background/60 backdrop-blur-md text-sm sm:w-1/2 outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2.5 pt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddingItem(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" className="shadow-md">
                    Save Item
                  </Button>
                </div>
              </form>
            </Card>
          ) : (
            <Button
              data-testid="action-add"
              variant="outline"
              size="lg"
              onClick={() => setIsAddingItem(true)}
              className="gap-2 w-full border-dashed rounded-2xl py-6 min-h-[48px]"
            >
              <Plus className="h-4 w-4" />
              <span>Add Action Item</span>
            </Button>
          )}
        </TabsContent>
      </Tabs>

      {/* Sticky macOS Glass Audio Player (U09) */}
      {audioUrl && (
        <div
          data-testid="audio-player"
          className="fixed bottom-20 md:bottom-3 left-3 right-3 md:left-64 md:right-4 z-40 max-w-4xl md:mx-auto rounded-3xl glass-dock shadow-2xl border border-white/20 p-3 sm:px-5 sm:py-3.5 backdrop-blur-3xl animate-in slide-in-from-bottom-4 duration-300"
        >
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
            onEnded={() => setIsPlaying(false)}
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Play controls */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => seekRelative(-10)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/10 transition-colors"
                title="Rewind 10 seconds"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={togglePlayPause}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5 fill-current" />}
              </button>

              <button
                type="button"
                onClick={() => seekRelative(10)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/10 transition-colors"
                title="Forward 10 seconds"
              >
                <RotateCw className="h-4 w-4" />
              </button>

              <span className="font-mono text-xs font-semibold tabular-nums text-foreground ml-1">
                {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} /{' '}
                {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
              </span>
            </div>

            {/* Scrubber slider */}
            <div className="w-full sm:flex-1 mx-2 sm:mx-4">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full h-2 bg-secondary/80 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Speed selector */}
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-muted-foreground hidden sm:inline-block" />
              <select
                data-testid="speed-select"
                value={playbackRate}
                onChange={(e) => changeSpeed(Number(e.target.value))}
                className="h-8 px-2.5 text-xs font-bold rounded-xl border border-white/20 bg-background/70 backdrop-blur-sm cursor-pointer"
              >
                <option value={0.75}>0.75x</option>
                <option value={1}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2.0x</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
