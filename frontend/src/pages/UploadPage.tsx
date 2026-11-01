import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  FileAudio,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  X,
  Sparkles,
  Mic,
  MicOff,
  Square,
  Play,
  Pause,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { WindowChrome } from '@/components/ui/WindowChrome';
import { useToast } from '@/components/ui/Toast';
import { getMeetingStatus, retryMeeting, uploadAudioFile, pasteTranscriptMeeting } from '@/api/meetings';
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

  // Tab mode: file | record | paste
  const [uploadMode, setUploadMode] = useState<'file' | 'record' | 'paste'>('file');

  // Audio Recorder State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Paste Transcript State
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteTranscript, setPasteTranscript] = useState('');
  const [isPasting, setIsPasting] = useState(false);

  // Clean up audio recorder on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const startRecording = async () => {
    setMicError(null);
    setRecordedBlob(null);
    setRecordSeconds(0);
    audioChunksRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Your browser does not support audio recording via MediaRecorder.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // Setup audio analyzer for live level meter
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : undefined;

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mime = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        setRecordedBlob(blob);
      };

      mediaRecorder.start(500);
      setIsRecording(true);
      setIsPaused(false);

      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone permission denied';
      setMicError(`Unable to access microphone: ${msg}. Please allow permissions in your browser.`);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);

      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      setAudioLevel(0);
    }
  };

  const discardRecording = () => {
    stopRecording();
    setRecordedBlob(null);
    setRecordSeconds(0);
    setMicError(null);
  };

  const useRecordingForPipeline = () => {
    if (!recordedBlob) return;
    const file = new File(
      [recordedBlob],
      `in-browser-recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`,
      { type: recordedBlob.type || 'audio/webm' }
    );
    setUploadMode('file');
    handleFiles([file]);
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteTitle.trim()) {
      toast({ type: 'error', title: 'Title required', description: 'Please provide a title for the meeting.' });
      return;
    }
    if (!pasteTranscript.trim()) {
      toast({ type: 'error', title: 'Transcript required', description: 'Please paste transcript text.' });
      return;
    }

    setIsPasting(true);
    try {
      const created = await pasteTranscriptMeeting({
        title: pasteTitle.trim(),
        transcript_text: pasteTranscript.trim(),
      });
      toast({
        type: 'success',
        title: 'Meeting Created!',
        description: 'Analyzing transcript with AI pipeline...',
      });
      navigate(`/meetings/${created.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create meeting from transcript';
      toast({ type: 'error', title: 'Error', description: msg });
    } finally {
      setIsPasting(false);
    }
  };

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
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('MeetScribe', {
                body: 'Meeting transcription and analysis complete.',
                icon: '/vite.svg',
              });
            } catch {
              // ignore
            }
          }
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

      {/* Mode switcher tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl glass-card-subtle border border-white/10 max-w-md">
        <button
          type="button"
          data-testid="tab-upload-file"
          onClick={() => setUploadMode('file')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all',
            uploadMode === 'file'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
          )}
        >
          <UploadCloud className="h-4 w-4" />
          <span>Upload File</span>
        </button>

        <button
          type="button"
          data-testid="tab-record-browser"
          onClick={() => setUploadMode('record')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all',
            uploadMode === 'record'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
          )}
        >
          <Mic className="h-4 w-4" />
          <span>Record Audio</span>
        </button>

        <button
          type="button"
          data-testid="tab-paste-transcript"
          onClick={() => setUploadMode('paste')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all',
            uploadMode === 'paste'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
          )}
        >
          <FileText className="h-4 w-4" />
          <span>Paste Notes</span>
        </button>
      </div>

      {/* Mode 1: File Dropzone */}
      {uploadMode === 'file' && (
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
      )}

      {/* Mode 2: In-Browser Audio Recorder */}
      {uploadMode === 'record' && (
        <div className="glass-card rounded-3xl border border-white/20 p-8 sm:p-12 shadow-2xl backdrop-blur-2xl text-center space-y-6">
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-2xl font-bold">In-Browser Recorder</h2>
            <p className="text-sm text-muted-foreground">
              Record a meeting or voice memo straight from your microphone without installing extra software.
            </p>
          </div>

          {micError && (
            <div className="p-4 rounded-2xl bg-destructive/15 border border-destructive/25 text-destructive text-sm flex items-center gap-3 text-left max-w-lg mx-auto">
              <MicOff className="h-5 w-5 shrink-0" />
              <span>{micError}</span>
            </div>
          )}

          {/* Timer & Pulsing Live Level Meter */}
          <div className="py-6 flex flex-col items-center justify-center space-y-4">
            <div className="font-mono text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums text-foreground">
              {Math.floor(recordSeconds / 60).toString().padStart(2, '0')}:
              {(recordSeconds % 60).toString().padStart(2, '0')}
            </div>

            {/* Live Audio Level Visualizer */}
            {isRecording && !isPaused && (
              <div className="flex items-center gap-1.5 h-12">
                {[...Array(12)].map((_, i) => {
                  const factor = Math.sin((i / 12) * Math.PI) * (audioLevel / 100);
                  const height = Math.max(8, Math.min(48, Math.round(factor * 48)));
                  return (
                    <motion.div
                      key={i}
                      className="w-2 rounded-full bg-primary"
                      animate={{ height }}
                      transition={{ duration: 0.1 }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {!isRecording && !recordedBlob && (
              <Button
                size="lg"
                onClick={startRecording}
                className="gap-2.5 rounded-2xl px-6 py-6 min-h-[48px] shadow-lg shadow-primary/25"
              >
                <Mic className="h-5 w-5" />
                <span>Start Recording</span>
              </Button>
            )}

            {isRecording && (
              <>
                {isPaused ? (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={resumeRecording}
                    className="gap-2 rounded-2xl min-h-[48px]"
                  >
                    <Play className="h-5 w-5" />
                    <span>Resume</span>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={pauseRecording}
                    className="gap-2 rounded-2xl min-h-[48px]"
                  >
                    <Pause className="h-5 w-5" />
                    <span>Pause</span>
                  </Button>
                )}

                <Button
                  variant="destructive"
                  size="lg"
                  onClick={stopRecording}
                  className="gap-2 rounded-2xl min-h-[48px]"
                >
                  <Square className="h-5 w-5" />
                  <span>Stop Recording</span>
                </Button>
              </>
            )}

            {recordedBlob && (
              <>
                <Button
                  size="lg"
                  onClick={useRecordingForPipeline}
                  className="gap-2 rounded-2xl min-h-[48px] shadow-lg shadow-primary/25"
                >
                  <Sparkles className="h-5 w-5" />
                  <span>Transcribe This Recording</span>
                </Button>

                <Button
                  variant="ghost"
                  size="lg"
                  onClick={discardRecording}
                  className="gap-2 rounded-2xl min-h-[48px]"
                >
                  <RotateCcw className="h-5 w-5" />
                  <span>Discard & Re-record</span>
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mode 3: Paste Transcript */}
      {uploadMode === 'paste' && (
        <div className="glass-card rounded-3xl border border-white/20 p-6 sm:p-10 shadow-2xl backdrop-blur-2xl space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Paste Transcript</h2>
            <p className="text-sm text-muted-foreground">
              Have existing text notes or a transcript from Zoom, Teams, or Otter? Run it through our AI synthesis pipeline directly.
            </p>
          </div>

          <form onSubmit={handlePasteSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Meeting Title
              </label>
              <Input
                placeholder="e.g. Q3 Roadmap Review"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Transcript / Meeting Notes
              </label>
              <textarea
                placeholder="Paste the full conversation text, speaker dialog, or raw notes here..."
                value={pasteTranscript}
                onChange={(e) => setPasteTranscript(e.target.value)}
                rows={10}
                required
                className="w-full p-4 rounded-2xl border border-white/20 bg-background/60 backdrop-blur-md text-sm text-foreground focus:ring-2 focus:ring-primary outline-none transition-all resize-y"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                size="lg"
                disabled={isPasting}
                className="gap-2 rounded-2xl px-6 py-6 min-h-[48px] shadow-lg shadow-primary/25"
              >
                {isPasting ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Processing Notes...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <span>Generate AI Notes</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      )}

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
                  {activeItem.status === 'uploading'
                    ? '1. Uploading Audio to Storage'
                    : '2. AI Transcription & Processing Pipeline'}
                </span>
                <span className="font-mono tabular-nums text-foreground">
                  {activeItem.status === 'uploading'
                    ? `${activeItem.progress}% (Upload)`
                    : `${currentPercent}% (AI Processing)`}
                </span>
              </div>
              <ProgressBar value={currentPercent} />

              {/* Contextual Status Sub-label */}
              <div className="text-xs text-muted-foreground flex items-center justify-between pt-1">
                <span>
                  {activeItem.status === 'uploading'
                    ? 'Transferring file directly to cloud storage...'
                    : currentPercent <= 25
                    ? 'Audio received. Normalizing audio with ffmpeg...'
                    : currentPercent <= 70
                    ? 'Transcribing speech to text with Whisper AI (this takes 1-2 minutes on first run)...'
                    : currentPercent <= 90
                    ? 'Extracting summary, decisions, and action items with Gemini AI...'
                    : 'Finalizing meeting notes and indexing for search...'}
                </span>
              </div>
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
