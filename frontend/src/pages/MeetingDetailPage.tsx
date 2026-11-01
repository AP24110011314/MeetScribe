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
  Star,
  Bookmark,
  Edit2,
  Undo2,
  Trash2,
  Tag as TagIcon,
  X,
  MessageSquare,
  Mail,
  BarChart2,
  Send,
  Bot,
  User as UserIcon,
  Share2,
  Link as LinkIcon,
  Lock,
  ChevronDown,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import {
  createMeetingActionItem,
  exportMeetingNotes,
  getMeetingAudioUrl,
  getMeetingDetail,
  getMeetingTranscript,
  renameMeeting,
  getBookmarks,
  createBookmark,
  deleteBookmark,
  editTranscriptSegment,
  revertTranscript,
  organizeMeeting,
  getTags,
  updateMeetingTags,
  streamMeetingChat,
  getMeetingChatHistory,
  regenerateMeeting,
  getMeetingChapters,
  generateFollowUpEmail,
  translateMeetingNotes,
  getMeetingInsights,
  createShareLink,
  listShareLinks,
  revokeShareLink,
} from '@/api/meetings';
import { updateActionItem } from '@/api/actionItems';
import {
  ActionItemData,
  BookmarkData,
  ChapterItemData,
  ChatMessageData,
  FollowUpEmailData,
  MeetingDetailData,
  MeetingInsightsData,
  ShareLinkData,
  TagData,
  TranscriptData,
  TranslatedNotesData,
} from '@/types/meeting';
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

  // Moments (Bookmarks) state
  const [bookmarks, setBookmarks] = useState<BookmarkData[]>([]);
  const [newBookmarkNote, setNewBookmarkNote] = useState('');
  const [isCreatingBookmark, setIsCreatingBookmark] = useState(false);

  // Transcript editing state
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [editingSegmentText, setEditingSegmentText] = useState('');

  // Available tags state
  const [allTags, setAllTags] = useState<TagData[]>([]);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);

  // Phase B: AI Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [streamingBuffer, setStreamingBuffer] = useState('');
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Phase B: Email draft state
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailTone, setEmailTone] = useState<'formal' | 'friendly' | 'brief'>('friendly');
  const [emailData, setEmailData] = useState<FollowUpEmailData | null>(null);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);

  // Phase B: Translation state
  const [activeLanguage, setActiveLanguage] = useState('en');
  const [translatedNotes, setTranslatedNotes] = useState<TranslatedNotesData | null>(null);
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false);

  // Phase B: Chapters state
  const [chapters, setChapters] = useState<ChapterItemData[]>([]);

  // Phase B: Insights state
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [insightsData, setInsightsData] = useState<MeetingInsightsData | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);

  // Phase B: Template regeneration state
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Phase C: Share Modal state
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLinkData[]>([]);
  const [shareExpiresInDays, setShareExpiresInDays] = useState<number | null>(null);
  const [sharePassword, setSharePassword] = useState('');
  const [shareHideTranscript, setShareHideTranscript] = useState(false);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [newlyCreatedUrl, setNewlyCreatedUrl] = useState<string | null>(null);

  // Phase C: Export Formats Dropdown state
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

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

        try {
          const bms = await getBookmarks(id!);
          setBookmarks(bms);
        } catch {
          // bookmarks load error
        }

        try {
          const tags = await getTags();
          setAllTags(tags);
        } catch {
          // tags load error
        }

        try {
          const ch = await getMeetingChapters(id!);
          setChapters(ch.chapters || []);
        } catch {
          // chapters load error
        }

        try {
          const hist = await getMeetingChatHistory(id!);
          setChatMessages(hist.messages || []);
        } catch {
          // history load error
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

  const handleExport = async (format: string) => {
    if (!id) return;
    try {
      await exportMeetingNotes(id, format);
      setIsExportMenuOpen(false);
      toast({ type: 'success', title: 'Exported', description: `Saved as ${format.toUpperCase()}` });
    } catch {
      toast({ type: 'error', title: 'Export failed' });
    }
  };

  const handleOpenShare = async () => {
    setIsShareOpen(true);
    if (!id) return;
    try {
      const links = await listShareLinks(id);
      setShareLinks(links);
    } catch {
      // ignore
    }
  };

  const handleCreateShareLink = async () => {
    if (!id) return;
    setIsCreatingShare(true);
    try {
      const created = await createShareLink(id, {
        expires_in_days: shareExpiresInDays,
        password: sharePassword.trim() || null,
        hide_transcript: shareHideTranscript,
      });
      const fullUrl = `${window.location.origin}${created.share_url}`;
      setNewlyCreatedUrl(fullUrl);
      setShareLinks((prev) => [created, ...prev]);
      setSharePassword('');
      toast({ type: 'success', title: 'Share link created', description: 'Link copied to clipboard!' });
      navigator.clipboard.writeText(fullUrl);
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to create share link' });
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleRevokeShareLink = async (linkId: string) => {
    if (!id) return;
    try {
      await revokeShareLink(id, linkId);
      setShareLinks((prev) => prev.filter((l) => l.id !== linkId));
      if (newlyCreatedUrl && newlyCreatedUrl.includes(linkId)) {
        setNewlyCreatedUrl(null);
      }
      toast({ type: 'success', title: 'Revoked', description: 'Public share link was revoked' });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to revoke link' });
    }
  };

  const handleToggleStar = async () => {
    if (!meeting) return;
    const nextStar = !meeting.is_starred;
    try {
      const updated = await organizeMeeting(meeting.id, { is_starred: nextStar });
      setMeeting((prev) => (prev ? { ...prev, is_starred: updated.is_starred } : null));
      toast({
        type: 'success',
        title: nextStar ? 'Starred' : 'Unstarred',
        description: nextStar ? 'Added to starred meetings' : 'Removed from starred meetings',
      });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to update star' });
    }
  };

  const handleToggleTag = async (tag: TagData) => {
    if (!meeting) return;
    const currentTags = meeting.tags || [];
    const exists = currentTags.some((t) => t.id === tag.id);
    const nextTagIds = exists
      ? currentTags.filter((t) => t.id !== tag.id).map((t) => t.id)
      : [...currentTags.map((t) => t.id), tag.id];

    try {
      const updatedTags = await updateMeetingTags(meeting.id, nextTagIds);
      setMeeting((prev) => (prev ? { ...prev, tags: updatedTags } : null));
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to update tags' });
    }
  };

  const handleSaveSegment = async (index: number) => {
    if (!id || !editingSegmentText.trim()) return;
    try {
      const updated = await editTranscriptSegment(id, index, editingSegmentText.trim());
      setTranscript(updated);
      setEditingSegmentIndex(null);
      setEditingSegmentText('');
      toast({ type: 'success', title: 'Transcript updated', description: 'Segment text saved' });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to save segment edit' });
    }
  };

  const handleRevertTranscript = async () => {
    if (!id) return;
    try {
      const reverted = await revertTranscript(id);
      setTranscript(reverted);
      toast({ type: 'success', title: 'Transcript reverted', description: 'Original text restored' });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to revert transcript' });
    }
  };

  const handleAddBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setIsCreatingBookmark(true);
    try {
      const bm = await createBookmark(id, {
        timestamp_sec: Math.floor(currentTime),
        note: newBookmarkNote.trim() || 'Moment',
      });
      setBookmarks((prev) => [...prev, bm].sort((a, b) => a.timestamp_sec - b.timestamp_sec));
      setNewBookmarkNote('');
      toast({ type: 'success', title: 'Moment added', description: `Saved at ${Math.floor(currentTime / 60)}:${Math.floor(currentTime % 60).toString().padStart(2, '0')}` });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to add moment' });
    } finally {
      setIsCreatingBookmark(false);
    }
  };

  const handleDeleteBookmark = async (bmId: string) => {
    if (!id) return;
    try {
      await deleteBookmark(id, bmId);
      setBookmarks((prev) => prev.filter((b) => b.id !== bmId));
      toast({ type: 'success', title: 'Moment removed' });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to delete moment' });
    }
  };

  const handleTemplateChange = async (template: string) => {
    if (!id) return;
    setIsRegenerating(true);
    try {
      const updated = await regenerateMeeting(id, template);
      setMeeting(updated);
      toast({
        type: 'success',
        title: 'Notes regenerated',
        description: `Refreshed using ${template} template`,
      });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to regenerate notes' });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!id || !chatInput.trim() || isChatStreaming) return;

    const userText = chatInput.trim();
    setChatInput('');
    const tempUserMsg: ChatMessageData = {
      id: Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: userText,
      citations: [],
      created_at: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, tempUserMsg]);
    setIsChatStreaming(true);
    setStreamingBuffer('');

    let buffer = '';
    try {
      await streamMeetingChat(
        id,
        userText,
        (token) => {
          buffer += token;
          setStreamingBuffer(buffer);
        },
        (citations) => {
          const assistantMsg: ChatMessageData = {
            id: Math.random().toString(36).substring(2, 9),
            role: 'assistant',
            content: buffer,
            citations,
            created_at: new Date().toISOString(),
          };
          setChatMessages((prev) => [...prev, assistantMsg]);
          setStreamingBuffer('');
          setIsChatStreaming(false);
        }
      );
    } catch {
      setIsChatStreaming(false);
      toast({ type: 'error', title: 'Chat failed', description: 'Could not stream response' });
    }
  };

  const handleOpenEmailModal = async (tone = emailTone) => {
    if (!id) return;
    setIsEmailModalOpen(true);
    setIsLoadingEmail(true);
    try {
      const data = await generateFollowUpEmail(id, tone);
      setEmailData(data);
    } catch {
      toast({ type: 'error', title: 'Email generation failed' });
    } finally {
      setIsLoadingEmail(false);
    }
  };

  const handleToneChange = async (tone: 'formal' | 'friendly' | 'brief') => {
    setEmailTone(tone);
    await handleOpenEmailModal(tone);
  };

  const handleTranslate = async (lang: string) => {
    setActiveLanguage(lang);
    if (!id || lang === 'en') {
      setTranslatedNotes(null);
      return;
    }
    setIsLoadingTranslation(true);
    try {
      const res = await translateMeetingNotes(id, lang);
      setTranslatedNotes(res);
      toast({ type: 'success', title: `Translated to ${res.language}` });
    } catch {
      toast({ type: 'error', title: 'Translation failed' });
    } finally {
      setIsLoadingTranslation(false);
    }
  };

  const handleOpenInsights = async () => {
    if (!id) return;
    setIsInsightsOpen(true);
    if (!insightsData) {
      setIsLoadingInsights(true);
      try {
        const res = await getMeetingInsights(id);
        setInsightsData(res);
      } catch {
        toast({ type: 'error', title: 'Failed to load insights' });
      } finally {
        setIsLoadingInsights(false);
      }
    }
  };

  const renderTextWithCitations = (text: string) => {
    const parts = text.split(/(\[\[(?:(?:\d+:)?\d+:)?\d+\]\])/g);
    return parts.map((part, idx) => {
      const match = part.match(/^\[\[(?:(?:(\d+):)?(\d+):)?(\d+)\]\]$/);
      if (match) {
        const [, h, m, s] = match;
        const totalSec = (h ? parseInt(h) * 3600 : 0) + (m ? parseInt(m) * 60 : 0) + parseInt(s);
        return (
          <button
            key={idx}
            type="button"
            data-testid="citation-chip"
            onClick={() => seekTo(totalSec)}
            className="inline-flex items-center gap-0.5 mx-1 px-2 py-0.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-xs font-mono font-bold border border-primary/30 transition-all cursor-pointer"
            title={`Jump to audio at ${part}`}
          >
            {part}
          </button>
        );
      }
      return <span key={idx}>{part}</span>;
    });
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
          <div className="space-y-3">
            <div className="flex items-center gap-3 w-full min-w-0">
              <button
                type="button"
                onClick={handleToggleStar}
                className={cn(
                  'p-2 rounded-2xl transition-all shrink-0',
                  meeting.is_starred
                    ? 'text-amber-400 bg-amber-400/15 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
                )}
                title={meeting.is_starred ? 'Starred' : 'Star meeting'}
              >
                <Star className={cn('h-5 w-5', meeting.is_starred && 'fill-current')} />
              </button>

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
                    className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground hover:text-primary cursor-pointer transition-colors truncate"
                    title="Click to rename"
                  >
                    {meeting.title}
                  </h1>
                )}
              </div>
            </div>

            {/* AI and Export Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/5">
              <select
                data-testid="template-select"
                value={meeting.template || 'general'}
                onChange={(e) => handleTemplateChange(e.target.value)}
                disabled={isRegenerating}
                className="h-8 px-2.5 text-xs font-semibold rounded-xl border border-white/20 bg-background/60 backdrop-blur-sm cursor-pointer outline-none focus:ring-1 focus:ring-primary"
                title="Change note template"
              >
                <option value="general">Template: General</option>
                <option value="standup">Template: Daily Standup</option>
                <option value="one_on_one">Template: 1:1 Review</option>
                <option value="sales">Template: Sales Discovery</option>
                <option value="interview">Template: Interview</option>
                <option value="lecture">Template: Lecture / Study</option>
              </select>

              <select
                data-testid="translate-select"
                value={activeLanguage}
                onChange={(e) => handleTranslate(e.target.value)}
                disabled={isLoadingTranslation}
                className="h-8 px-2.5 text-xs font-semibold rounded-xl border border-white/20 bg-background/60 backdrop-blur-sm cursor-pointer outline-none focus:ring-1 focus:ring-primary"
                title="Translate notes"
              >
                <option value="en">Translate: English</option>
                <option value="es">Translate: Español</option>
                <option value="fr">Translate: Français</option>
                <option value="de">Translate: Deutsch</option>
                <option value="hi">Translate: हिन्दी</option>
                <option value="ja">Translate: 日本語</option>
              </select>

              <Button
                data-testid="email-draft-btn"
                variant="glass"
                size="sm"
                onClick={() => handleOpenEmailModal()}
                className="gap-1.5 text-xs"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Email</span>
              </Button>

              <Button
                variant="glass"
                size="sm"
                onClick={handleOpenInsights}
                className="gap-1.5 text-xs"
              >
                <BarChart2 className="h-3.5 w-3.5" />
                <span>Insights</span>
              </Button>

              <Button
                data-testid="ask-ai-btn"
                variant="default"
                size="sm"
                onClick={() => setIsChatOpen(true)}
                className="gap-1.5 text-xs shadow-md shadow-primary/20"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Ask AI</span>
              </Button>

              <Button variant="glass" size="sm" onClick={handleCopyAllMarkdown} className="gap-1.5 text-xs">
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </Button>
              <Button
                data-testid="export-md"
                variant="glass"
                size="sm"
                onClick={() => handleExport('md')}
                className="gap-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>MD</span>
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

              {/* More Export Formats Dropdown */}
              <div className="relative">
                <Button
                  data-testid="export-more-btn"
                  variant="glass"
                  size="sm"
                  onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                  className="gap-1 text-xs"
                >
                  <span>More</span>
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </Button>
                {isExportMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-36 py-1.5 rounded-xl glass-card border border-white/20 shadow-xl z-50 flex flex-col">
                    <button
                      data-testid="export-docx"
                      onClick={() => handleExport('docx')}
                      className="px-3 py-1.5 text-left text-xs hover:bg-white/10 flex items-center justify-between"
                    >
                      Word (.docx)
                    </button>
                    <button
                      data-testid="export-txt"
                      onClick={() => handleExport('txt')}
                      className="px-3 py-1.5 text-left text-xs hover:bg-white/10 flex items-center justify-between"
                    >
                      Text (.txt)
                    </button>
                    <button
                      data-testid="export-json"
                      onClick={() => handleExport('json')}
                      className="px-3 py-1.5 text-left text-xs hover:bg-white/10 flex items-center justify-between"
                    >
                      JSON (.json)
                    </button>
                    <button
                      data-testid="export-srt"
                      onClick={() => handleExport('srt')}
                      className="px-3 py-1.5 text-left text-xs hover:bg-white/10 flex items-center justify-between"
                    >
                      Subtitles (.srt)
                    </button>
                    <button
                      data-testid="export-vtt"
                      onClick={() => handleExport('vtt')}
                      className="px-3 py-1.5 text-left text-xs hover:bg-white/10 flex items-center justify-between"
                    >
                      WebVTT (.vtt)
                    </button>
                    <button
                      data-testid="export-ics"
                      onClick={() => handleExport('ics')}
                      className="px-3 py-1.5 text-left text-xs hover:bg-white/10 flex items-center justify-between"
                    >
                      Calendar (.ics)
                    </button>
                  </div>
                )}
              </div>

              {/* Share Button */}
              <Button
                data-testid="share-btn"
                variant="glass"
                size="sm"
                onClick={handleOpenShare}
                className="gap-1.5 text-xs border border-primary/30"
              >
                <Share2 className="h-3.5 w-3.5 text-primary" />
                <span>Share</span>
              </Button>
            </div>
          </div>

          {/* Metadata Chips & Tags */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground pt-1">
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

            {/* Meeting Tags */}
            {meeting.tags && meeting.tags.map((tag) => (
              <span
                key={tag.id}
                data-testid="tag-chip"
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border"
                style={{
                  backgroundColor: `${tag.color}20`,
                  borderColor: `${tag.color}50`,
                  color: tag.color,
                }}
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => handleToggleTag(tag)}
                  className="hover:opacity-75 p-0.5 rounded-full"
                  title="Remove tag"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}

            {/* Tag selector popover toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full glass-card-subtle border border-dashed border-white/30 text-xs font-medium hover:border-primary hover:text-foreground transition-all"
              >
                <TagIcon className="h-3 w-3" />
                <span>+ Tag</span>
              </button>

              {isTagDropdownOpen && (
                <div className="absolute top-8 left-0 z-50 w-48 p-2 rounded-2xl glass-card shadow-2xl border border-white/20 backdrop-blur-2xl animate-in fade-in-50 zoom-in-95 space-y-1">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">Attach Tag</div>
                  {allTags.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-2 text-center">No tags yet</div>
                  ) : (
                    allTags.map((tag) => {
                      const isAttached = (meeting.tags || []).some((t) => t.id === tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => handleToggleTag(tag)}
                          className={cn(
                            'w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors',
                            isAttached ? 'bg-primary/15 text-primary font-semibold' : 'hover:bg-white/10 text-foreground'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                            <span>{tag.name}</span>
                          </div>
                          {isAttached && <Check className="h-3.5 w-3.5" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
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
            <TabsTrigger data-testid="tab-chapters" value="chapters" className="rounded-xl min-h-[36px]">
              Chapters ({chapters.length})
            </TabsTrigger>
            <TabsTrigger data-testid="tab-moments" value="moments" className="rounded-xl min-h-[36px]">
              Moments ({bookmarks.length})
            </TabsTrigger>
            <TabsTrigger data-testid="tab-actions" value="actions" className="rounded-xl min-h-[36px]">
              Action Items ({meeting.action_items.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-6 pt-4">
          {translatedNotes && (
            <Card className="rounded-3xl border border-primary/30 bg-primary/10 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Translated Version ({translatedNotes.language})
                </span>
                <Button size="sm" variant="ghost" onClick={() => handleTranslate('en')} className="text-xs">
                  Close Translation
                </Button>
              </div>
              <h3 className="text-lg font-bold">{translatedNotes.title}</h3>
              <p className="text-sm leading-relaxed whitespace-pre-line">{translatedNotes.summary}</p>
              {translatedNotes.key_points?.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Puntos Clave / Key Points
                  </h4>
                  <ul className="space-y-1 text-sm list-disc list-inside">
                    {translatedNotes.key_points.map((pt, i) => (
                      <li key={i}>{pt}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
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
            <div className="flex items-center gap-3">
              {transcript?.segments?.some((s) => s.original_text && s.original_text !== s.text) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRevertTranscript}
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>Revert Edits</span>
                </Button>
              )}
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
          </div>

          <Card className="rounded-3xl border border-white/15 shadow-xl overflow-hidden">
            <CardContent className="p-4 sm:p-6 divide-y divide-white/10 max-h-[550px] overflow-y-auto">
              {filteredSegments.length === 0 ? (
                <p className="text-center py-12 text-sm text-muted-foreground">
                  {transcriptSearch ? 'No matching segments found.' : 'No transcript available.'}
                </p>
              ) : (
                filteredSegments.map((seg, segIdx) => {
                  const isActive = currentTime >= seg.start && currentTime <= seg.end;
                  const isEditing = editingSegmentIndex === segIdx;
                  const isEdited = seg.original_text && seg.original_text !== seg.text;

                  return (
                    <div
                      key={seg.id || segIdx}
                      ref={(el) => {
                        segmentRefs.current[seg.id || segIdx] = el;
                      }}
                      data-testid="transcript-segment"
                      onClick={() => !isEditing && seekTo(seg.start)}
                      className={cn(
                        'group py-3.5 px-3.5 rounded-2xl cursor-pointer transition-all',
                        isActive
                          ? 'glass-card bg-primary/15 border-primary/30 text-foreground font-medium shadow-sm'
                          : 'hover:bg-white/10 text-foreground/90'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                            {Math.floor(seg.start / 60)}:
                            {Math.floor(seg.start % 60).toString().padStart(2, '0')}
                          </span>
                          {isEdited && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                              edited
                            </Badge>
                          )}
                        </div>

                        {!isEditing && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSegmentIndex(segIdx);
                              setEditingSegmentText(seg.text);
                            }}
                            className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-foreground transition-opacity"
                            title="Edit segment text"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="space-y-2 mt-2" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={editingSegmentText}
                            onChange={(e) => setEditingSegmentText(e.target.value)}
                            className="w-full p-2.5 rounded-xl border border-white/20 bg-background/80 text-sm focus:ring-2 focus:ring-primary outline-none"
                            rows={3}
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => handleSaveSegment(segIdx)}>
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingSegmentIndex(null);
                                setEditingSegmentText('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed">{seg.text}</p>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Moments (Bookmarks) */}
        <TabsContent value="moments" className="space-y-4 pt-4">
          <Card className="rounded-3xl border border-white/15 p-5 shadow-xl">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-primary" />
              <span>Add Moment at Current Time</span>
            </h3>
            <form onSubmit={handleAddBookmark} className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex items-center px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-xs font-mono font-bold text-primary shrink-0">
                @{Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}
              </div>
              <Input
                placeholder="What happened at this moment? (e.g. Budget agreed, key quote...)"
                value={newBookmarkNote}
                onChange={(e) => setNewBookmarkNote(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={isCreatingBookmark} className="shrink-0 gap-1.5">
                <Plus className="h-4 w-4" />
                <span>Save Moment</span>
              </Button>
            </form>
          </Card>

          <div className="space-y-2.5">
            {bookmarks.length === 0 ? (
              <div className="text-center py-12 glass-card rounded-3xl border border-white/15 p-6 text-sm text-muted-foreground">
                No moments bookmarked yet. Pause or seek in the audio player, then add a note above to bookmark key points.
              </div>
            ) : (
              bookmarks.map((bm) => (
                <div
                  key={bm.id}
                  className="glass-card p-3.5 rounded-2xl border border-white/15 flex items-center justify-between gap-3 hover:border-white/30 transition-all"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => seekTo(bm.timestamp_sec)}
                      className="px-2.5 py-1 rounded-xl bg-primary/15 text-primary text-xs font-mono font-bold hover:bg-primary/25 transition-colors border border-primary/20 shrink-0"
                      title="Jump to audio"
                    >
                      @{Math.floor(bm.timestamp_sec / 60)}:{Math.floor(bm.timestamp_sec % 60).toString().padStart(2, '0')}
                    </button>
                    <span className="text-sm text-foreground font-medium truncate">{bm.note}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteBookmark(bm.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-colors shrink-0"
                    title="Delete moment"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
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

        {/* Tab: Chapters */}
        <TabsContent value="chapters" className="space-y-4 pt-4">
          <div className="space-y-3">
            {chapters.length === 0 ? (
              <div className="text-center py-12 glass-card rounded-3xl border border-white/15 p-6 text-sm text-muted-foreground">
                No chapter markers found for this meeting.
              </div>
            ) : (
              chapters.map((ch, idx) => (
                <div
                  key={idx}
                  data-testid="chapter-item"
                  className="glass-card p-4 rounded-2xl border border-white/15 flex items-start justify-between gap-4 hover:border-white/30 transition-all cursor-pointer"
                  onClick={() => seekTo(ch.start_sec)}
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-mono font-bold border border-primary/20">
                        {Math.floor(ch.start_sec / 60)}:{Math.floor(ch.start_sec % 60).toString().padStart(2, '0')} - {Math.floor(ch.end_sec / 60)}:{Math.floor(ch.end_sec % 60).toString().padStart(2, '0')}
                      </span>
                      <h4 className="text-sm font-bold text-foreground truncate">{ch.title}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{ch.summary}</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 text-xs gap-1">
                    <Play className="h-3 w-3" />
                    <span>Seek</span>
                  </Button>
                </div>
              ))
            )}
          </div>
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

            {/* Scrubber slider and Chapter markers */}
            <div className="w-full sm:flex-1 mx-2 sm:mx-4 flex flex-col gap-1">
              {chapters.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px] no-scrollbar">
                  {chapters.map((ch, idx) => (
                    <button
                      key={idx}
                      type="button"
                      data-testid="chapter-item"
                      onClick={() => seekTo(ch.start_sec)}
                      className="px-2 py-0.5 rounded-md glass-card-subtle hover:bg-primary/25 hover:text-primary transition-all text-muted-foreground whitespace-nowrap text-[10px]"
                      title={`${ch.title} (@${Math.floor(ch.start_sec / 60)}:${Math.floor(ch.start_sec % 60).toString().padStart(2, '0')})`}
                    >
                      {ch.title}
                    </button>
                  ))}
                </div>
              )}
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

      {/* Ask Meeting Chat Drawer / Dialog (U15) */}
      <Dialog open={isChatOpen} onOpenChange={setIsChatOpen}>
        <DialogContent data-testid="chat-drawer" className="max-w-xl h-[85vh] max-h-[700px] flex flex-col glass-card border border-white/20 p-0 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-bold">Ask this Meeting</h3>
                <p className="text-[11px] text-muted-foreground">Answers grounded in meeting transcript with timestamp citations</p>
              </div>
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && !isChatStreaming && (
              <div className="text-center py-12 space-y-3">
                <Bot className="h-10 w-10 text-primary/60 mx-auto" />
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Ask any question about what was discussed, decisions made, or specific speaker commitments.
                </p>
                <div className="flex flex-wrap gap-2 justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => { setChatInput('What were the key decisions made in this meeting?'); }}
                    className="text-[11px] px-2.5 py-1 rounded-xl glass-card-subtle hover:bg-white/10 text-muted-foreground hover:text-foreground border border-white/10"
                  >
                    What were the key decisions?
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChatInput('Who has action items and what are the deadlines?'); }}
                    className="text-[11px] px-2.5 py-1 rounded-xl glass-card-subtle hover:bg-white/10 text-muted-foreground hover:text-foreground border border-white/10"
                  >
                    Who has action items?
                  </button>
                </div>
              </div>
            )}

            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-2.5',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={cn(
                    'p-3.5 rounded-2xl max-w-[80%] text-sm leading-relaxed shadow-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'glass-card border border-white/15 text-foreground'
                  )}
                >
                  {renderTextWithCitations(msg.content)}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-xs text-muted-foreground">
                    <UserIcon className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {isChatStreaming && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs">
                  <Bot className="h-4 w-4 animate-spin" />
                </div>
                <div className="glass-card border border-white/15 text-foreground p-3.5 rounded-2xl max-w-[80%] text-sm leading-relaxed">
                  {renderTextWithCitations(streamingBuffer)}
                  <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat input */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-white/10 flex items-center gap-2 bg-background/50">
            <Input
              data-testid="chat-input"
              placeholder="Ask a question about this meeting..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={isChatStreaming}
              className="flex-1"
            />
            <Button
              type="submit"
              data-testid="chat-send-btn"
              disabled={!chatInput.trim() || isChatStreaming}
              size="sm"
              className="gap-1 px-3"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Follow-Up Email Modal (U18) */}
      <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
        <DialogContent className="max-w-lg glass-card border border-white/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <span>Follow-Up Email Draft</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Tone:</span>
              {(['formal', 'friendly', 'brief'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleToneChange(t)}
                  className={cn(
                    'px-3 py-1 rounded-xl text-xs font-medium capitalize transition-all border',
                    emailTone === t
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'glass-card-subtle text-muted-foreground border-white/10 hover:text-foreground'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {isLoadingEmail ? (
              <div className="p-12 text-center text-xs text-muted-foreground">Generating email draft...</div>
            ) : emailData ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl glass-card-subtle border border-white/10 text-xs">
                  <span className="font-bold text-muted-foreground">Subject: </span>
                  <span className="text-foreground">{emailData.subject}</span>
                </div>
                <div className="p-4 rounded-xl glass-card border border-white/10 text-xs whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                  {emailData.body}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`Subject: ${emailData.subject}\n\n${emailData.body}`);
                      toast({ type: 'success', title: 'Copied email to clipboard' });
                    }}
                    className="gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Draft</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">No email generated.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Meeting Insights Modal */}
      <Dialog open={isInsightsOpen} onOpenChange={setIsInsightsOpen}>
        <DialogContent className="max-w-lg glass-card border border-white/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-primary" />
              <span>Meeting Analytics & Insights</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {isLoadingInsights ? (
              <div className="p-12 text-center text-xs text-muted-foreground">Computing conversation insights...</div>
            ) : insightsData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl glass-card border border-white/10 text-center">
                    <div className="text-[11px] text-muted-foreground font-semibold uppercase">Overall Sentiment</div>
                    <div className="text-lg font-extrabold capitalize text-primary mt-1">{insightsData.sentiment}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl glass-card border border-white/10 text-center">
                    <div className="text-[11px] text-muted-foreground font-semibold uppercase">Speaking Pace</div>
                    <div className="text-lg font-extrabold text-foreground mt-1">
                      {insightsData.pace_wpm} <span className="text-xs font-normal text-muted-foreground">WPM</span>
                    </div>
                  </div>
                </div>

                {insightsData.top_keywords?.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Keywords & Topics</div>
                    <div className="flex flex-wrap gap-1.5">
                      {insightsData.top_keywords.map((kw, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium glass-card border border-white/10 text-foreground">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {insightsData.unanswered_questions?.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unanswered Questions</div>
                    <ul className="space-y-1.5 text-xs text-foreground/90 list-disc list-inside">
                      {insightsData.unanswered_questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      {/* Public Share Modal */}
      <Dialog open={isShareOpen} onOpenChange={setIsShareOpen}>
        <DialogContent className="max-w-md glass-card border border-white/20 p-6 space-y-4" data-testid="share-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Share2 className="h-5 w-5 text-primary" />
              <span>Public Share Links</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Create Share Link Card */}
            <div className="p-4 rounded-xl glass-card-subtle border border-white/10 space-y-3">
              <div className="text-xs font-semibold text-foreground/90">Create New Share Link</div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Expiration</label>
                  <select
                    value={shareExpiresInDays ?? ''}
                    onChange={(e) => setShareExpiresInDays(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-2.5 py-1.5 rounded-lg glass-card text-xs border border-white/15 bg-transparent text-foreground focus:outline-none"
                  >
                    <option value="" className="bg-slate-900 text-white">Never</option>
                    <option value="7" className="bg-slate-900 text-white">7 Days</option>
                    <option value="30" className="bg-slate-900 text-white">30 Days</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Password (Optional)</label>
                  <Input
                    type="password"
                    placeholder="None"
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={shareHideTranscript}
                  onChange={(e) => setShareHideTranscript(e.target.checked)}
                  className="rounded border-white/20 bg-transparent text-primary"
                />
                <span>Hide transcript (summary and action items only)</span>
              </label>

              <Button
                data-testid="share-create-btn"
                onClick={handleCreateShareLink}
                disabled={isCreatingShare}
                className="w-full text-xs h-8 gap-1.5"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                <span>{isCreatingShare ? 'Generating...' : 'Generate Share Link'}</span>
              </Button>
            </div>

            {/* Generated / Active Links */}
            {newlyCreatedUrl && (
              <div className="space-y-1.5 p-3 rounded-xl bg-primary/10 border border-primary/20">
                <div className="text-[11px] font-semibold text-primary">New Link Ready</div>
                <div className="flex gap-2">
                  <Input
                    data-testid="share-url-input"
                    readOnly
                    value={newlyCreatedUrl}
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    variant="glass"
                    onClick={() => {
                      navigator.clipboard.writeText(newlyCreatedUrl);
                      toast({ type: 'success', title: 'Copied link to clipboard' });
                    }}
                    className="h-8 text-xs shrink-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}

            {/* Existing Active Links */}
            {shareLinks.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Active Links ({shareLinks.length})
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {shareLinks.map((link) => (
                    <div
                      key={link.id}
                      className="p-2.5 rounded-xl glass-card border border-white/10 flex items-center justify-between text-xs gap-2"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 font-mono text-[11px] truncate text-foreground/90">
                          {link.has_password && <Lock className="h-3 w-3 text-amber-400 shrink-0" />}
                          <span className="truncate">/share/{link.token?.slice(0, 16)}...</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {link.view_count} views • {link.expires_at ? `Expires ${new Date(link.expires_at).toLocaleDateString()}` : 'Never expires'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="glass"
                          onClick={() => {
                            const url = `${window.location.origin}/share/${link.token}`;
                            navigator.clipboard.writeText(url);
                            toast({ type: 'success', title: 'Copied link' });
                          }}
                          className="h-7 px-2 text-xs"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          data-testid="share-revoke-btn"
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRevokeShareLink(link.id)}
                          className="h-7 px-2 text-xs"
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
