import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileAudio, CheckCircle2, AlertCircle, RefreshCw, ArrowRight, X, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { WindowChrome } from '@/components/ui/WindowChrome';
import { useToast } from '@/components/ui/Toast';
import { getMeetingStatus, retryMeeting, uploadAudioFile } from '@/api/meetings';
import { MeetingStatusData } from '@/types/meeting';
import { cn } from '@/lib/utils';

interface QueueItem {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'processing' | 'done' | 'failed' | 'cancelled';
  meetingId?: string;
  error?: string;
  statusData?: MeetingStatusData;
}

const ALLOWED_EXTENSIONS = ['mp3', 'wav', 'm4a', 'mp4', 'webm', 'ogg'];
const MAX_UPLOAD_MB = 500;

export function UploadPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeItem, setActiveItem] = useState<QueueItem | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Poll status for active processing item every 2.5s
  useEffect(() => {
    if (!activeItem?.meetingId || activeItem.status !== 'processing') return;

    const interval = setInterval(async () => {
      try {
        const data = await getMeetingStatus(activeItem.meetingId!);
        setActiveItem((prev) => (prev ? { ...prev, statusData: data } : null));

        if (data.status === 'done') {
          setActiveItem((prev) => (prev ? { ...prev, status: 'done', statusData: data } : null));
          toast({
            type: 'success',
            title: 'Meeting Ready!',
            description: 'Transcription and analysis complete.',
          });
        } else if (data.status === 'failed') {
          setActiveItem((prev) => (prev ? { ...prev, status: 'failed', error: data.error_message || 'Processing failed' } : null));
          toast({
            type: 'error',
            title: 'Processing failed',
            description: data.error_message || 'Pipeline encountered an error',
          });
        }
      } catch {
        // error polling
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeItem?.meetingId, activeItem?.status, toast]);

  const validateFile = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported format .${ext}. Allowed formats: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }
    const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return `File exceeds ${MAX_UPLOAD_MB} MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
    }
    return null;
  };

  const handleFiles = (files: FileList | File[]) => {
    const newItems: QueueItem[] = [];

    Array.from(files).forEach((file) => {
      const err = validateFile(file);
      if (err) {
        toast({ type: 'error', title: 'Invalid File', description: err });
        return;
      }

      newItems.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        progress: 0,
        status: 'uploading',
      });
    });

    if (newItems.length > 0) {
      setQueue((prev) => [...prev, ...newItems]);
      if (!activeItem) {
        startUpload(newItems[0]);
      }
    }
  };

  const startUpload = async (item: QueueItem) => {
    setActiveItem(item);

    try {
      const meetingId = await uploadAudioFile(item.file, (pct) => {
        setActiveItem((prev) => (prev?.id === item.id ? { ...prev, progress: pct } : prev));
      });

      setActiveItem((prev) =>
        prev?.id === item.id
          ? {
              ...prev,
              meetingId,
              status: 'processing',
              progress: 100,
            }
          : prev
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setActiveItem((prev) =>
        prev?.id === item.id ? { ...prev, status: 'failed', error: msg } : prev
      );
      toast({ type: 'error', title: 'Upload failed', description: msg });
    }
  };

  const handleRetry = async () => {
    if (!activeItem?.meetingId) return;
    try {
      const data = await retryMeeting(activeItem.meetingId);
      setActiveItem((prev) =>
        prev ? { ...prev, status: 'processing', error: undefined, statusData: data } : null
      );
      toast({ type: 'info', title: 'Retrying', description: 'Re-queued for processing' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Retry failed';
      toast({ type: 'error', title: 'Retry Error', description: msg });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const getStepStatus = (stepName: 'uploaded' | 'preparing' | 'transcribing' | 'analyzing' | 'done') => {
    const stage = activeItem?.statusData?.stage || '';
    const status = activeItem?.statusData?.status || activeItem?.status || '';

    if (status === 'done') return 'completed';
    if (status === 'failed') return 'failed';

    const order = ['uploaded', 'preparing', 'transcribing', 'analyzing', 'done'];
    const currentStep =
      stage === 'analyze' || stage === 'reduce'
        ? 'analyzing'
        : stage === 'transcribe'
        ? 'transcribing'
        : stage === 'normalize' || stage === 'chunk'
        ? 'preparing'
        : status === 'queued'
        ? 'uploaded'
        : 'uploaded';

    const currentIndex = order.indexOf(currentStep);
    const stepIndex = order.indexOf(stepName);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const currentPercent =
    activeItem?.status === 'uploading'
      ? activeItem.progress
      : Math.round(activeItem?.statusData?.progress_pct || (activeItem?.status === 'done' ? 100 : 0));

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold glass-card-subtle text-primary border border-primary/20 mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Whisper Speech Pipeline</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Upload Recording</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drop meeting audio or video to transcribe and extract summaries, decisions, and action items.
        </p>
      </div>

      {/* Large macOS Glass Dropzone with Animated Border */}
      <motion.div
        data-testid="upload-dropzone"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center p-10 sm:p-14 border-2 border-dashed rounded-3xl cursor-pointer transition-all duration-200 glass-card text-center',
          isDragging
            ? 'border-primary ring-4 ring-primary/25 bg-primary/10 shadow-2xl scale-[1.01]'
            : 'border-white/20 hover:border-primary/60 hover:shadow-xl'
        )}
      >
        <input
          ref={fileInputRef}
          data-testid="upload-file-input"
          type="file"
          accept=".mp3,.wav,.m4a,.mp4,.webm,.ogg,audio/*,video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
          }}
        />

        {/* Central Glowing Icon / Progress Ring Container */}
        <div className="relative mb-5">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15 text-primary border border-primary/25 shadow-lg group-hover:scale-105 transition-transform">
            <UploadCloud className="h-10 w-10 drop-shadow-sm" />
          </div>
        </div>

        <h3 className="text-xl font-bold text-foreground">Click to upload or drag & drop</h3>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-md">
          Direct presigned transfer for MP3, WAV, M4A, MP4, WebM, or OGG up to {MAX_UPLOAD_MB} MB.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-[11px] font-medium px-3 py-1 rounded-full glass-card-subtle text-muted-foreground border border-white/10">
            Audio & Video Supported
          </span>
          <span className="text-[11px] font-medium px-3 py-1 rounded-full glass-card-subtle text-muted-foreground border border-white/10">
            16 kHz Mono Normalization
          </span>
        </div>
      </motion.div>

      {/* Active Processing Step Tracker */}
      {activeItem && (
        <div className="glass-card rounded-3xl border border-white/20 shadow-2xl overflow-hidden backdrop-blur-2xl">
          <WindowChrome
            title={activeItem.file.name}
            subtitle={`${(activeItem.file.size / (1024 * 1024)).toFixed(2)} MB`}
            actions={
              activeItem.status === 'done' ? (
                <Badge variant="success" className="gap-1 shadow-sm">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Completed</span>
                </Badge>
              ) : activeItem.status === 'failed' ? (
                <Badge variant="destructive" className="gap-1 shadow-sm">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Failed</span>
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 animate-pulse">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Processing</span>
                </Badge>
              )
            }
          />

          <div className="p-6 sm:p-8 space-y-6">
            {/* Progress Bar & Header */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-2">
                  <FileAudio className="h-4 w-4 text-primary" />
                  Pipeline Progress
                </span>
                <span className="font-mono tabular-nums text-foreground">
                  {activeItem.status === 'uploading'
                    ? `${activeItem.progress}% (Uploading)`
                    : `${currentPercent}%`}
                </span>
              </div>
              <ProgressBar value={currentPercent} />
            </div>

            {/* Glowing Active Step Tracker (U06) */}
            <div data-testid="step-tracker" className="pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center text-xs">
                {/* Uploaded */}
                <div
                  data-testid="step-uploaded"
                  className={cn(
                    'p-3 rounded-2xl border font-semibold transition-all duration-300 min-h-[44px] flex items-center justify-center',
                    getStepStatus('uploaded') === 'completed'
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shadow-sm'
                      : 'border-white/10 glass-card-subtle text-muted-foreground'
                  )}
                >
                  Uploaded
                </div>

                {/* Preparing */}
                <div
                  data-testid="step-preparing"
                  className={cn(
                    'p-3 rounded-2xl border font-semibold transition-all duration-300 min-h-[44px] flex items-center justify-center',
                    getStepStatus('preparing') === 'completed'
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shadow-sm'
                      : getStepStatus('preparing') === 'active'
                      ? 'border-primary ring-2 ring-primary/40 bg-primary/20 text-primary shadow-lg animate-pulse'
                      : 'border-white/10 glass-card-subtle text-muted-foreground'
                  )}
                >
                  Preparing
                </div>

                {/* Transcribing */}
                <div
                  data-testid="step-transcribing"
                  className={cn(
                    'p-3 rounded-2xl border font-semibold transition-all duration-300 min-h-[44px] flex items-center justify-center',
                    getStepStatus('transcribing') === 'completed'
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shadow-sm'
                      : getStepStatus('transcribing') === 'active'
                      ? 'border-primary ring-2 ring-primary/40 bg-primary/20 text-primary shadow-lg animate-pulse'
                      : 'border-white/10 glass-card-subtle text-muted-foreground'
                  )}
                >
                  Transcribing
                </div>

                {/* Analyzing */}
                <div
                  data-testid="step-analyzing"
                  className={cn(
                    'p-3 rounded-2xl border font-semibold transition-all duration-300 min-h-[44px] flex items-center justify-center',
                    getStepStatus('analyzing') === 'completed'
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shadow-sm'
                      : getStepStatus('analyzing') === 'active'
                      ? 'border-primary ring-2 ring-primary/40 bg-primary/20 text-primary shadow-lg animate-pulse'
                      : 'border-white/10 glass-card-subtle text-muted-foreground'
                  )}
                >
                  Analyzing
                </div>

                {/* Done */}
                <div
                  data-testid="step-done"
                  className={cn(
                    'p-3 rounded-2xl border font-semibold transition-all duration-300 min-h-[44px] flex items-center justify-center col-span-2 sm:col-span-1',
                    getStepStatus('done') === 'completed'
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shadow-sm'
                      : 'border-white/10 glass-card-subtle text-muted-foreground'
                  )}
                >
                  Done
                </div>
              </div>
            </div>

            {/* Error & Retry state */}
            {activeItem.status === 'failed' && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-destructive/15 border border-destructive/25 text-destructive">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p className="text-sm font-semibold">{activeItem.error || 'Pipeline error'}</p>
                </div>
                <Button
                  data-testid="retry-button"
                  variant="destructive"
                  size="sm"
                  onClick={handleRetry}
                  className="gap-2 shrink-0 shadow-md"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry Processing</span>
                </Button>
              </div>
            )}

            {/* Success Action */}
            {activeItem.status === 'done' && (
              <div className="flex justify-end pt-2">
                <Button
                  size="lg"
                  onClick={() => navigate(`/meetings/${activeItem.meetingId}`)}
                  className="gap-2 shadow-xl shadow-primary/20"
                >
                  <span>View Meeting Notes</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-bold">Upload Queue ({queue.length})</h2>
          <div className="space-y-2">
            {queue.map((item) => (
              <div
                key={item.id}
                data-testid="upload-queue-item"
                className="flex items-center justify-between p-3.5 rounded-2xl glass-card-subtle border border-white/15 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileAudio className="h-5 w-5 text-primary shrink-0" />
                  <div className="truncate">
                    <p className="text-sm font-medium truncate">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      item.status === 'done'
                        ? 'success'
                        : item.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {item.status}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setQueue((prev) => prev.filter((q) => q.id !== item.id))}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
