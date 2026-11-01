import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Globe,
  Copy,
  Lock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { WindowChrome } from '@/components/ui/WindowChrome';
import { useToast } from '@/components/ui/Toast';
import { getPublicShare, unlockPublicShare } from '@/api/meetings';
import { PublicShareResponse } from '@/types/meeting';

export const PublicSharePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [meeting, setMeeting] = useState<PublicShareResponse | null>(null);

  useEffect(() => {
    if (!token) return;

    async function loadPublicData() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getPublicShare(token!);
        setMeeting(data);
        setRequiresPassword(false);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
          setRequiresPassword(true);
        } else {
          const msg = err instanceof Error ? err.message : 'Unable to view this meeting note';
          setError(msg);
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadPublicData();
  }, [token]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password) return;

    setIsUnlocking(true);
    try {
      const data = await unlockPublicShare(token, password);
      setMeeting(data);
      setRequiresPassword(false);
      toast({ type: 'success', title: 'Unlocked', description: 'Access granted' });
    } catch {
      toast({ type: 'error', title: 'Unlock failed', description: 'Incorrect password' });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleCopySummary = () => {
    if (!meeting?.summary) return;
    const text = [
      `# ${meeting.title}`,
      `Executive Summary:\n${meeting.summary.summary}`,
      meeting.summary.key_points.length > 0 ? `\nKey Points:\n- ${meeting.summary.key_points.join('\n- ')}` : '',
      meeting.summary.decisions.length > 0 ? `\nDecisions:\n- ${meeting.summary.decisions.join('\n- ')}` : '',
    ].filter(Boolean).join('\n\n');

    navigator.clipboard.writeText(text);
    toast({ type: 'success', title: 'Copied notes to clipboard' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="glass-card p-8 rounded-3xl border border-white/20 text-center space-y-4 max-w-sm w-full animate-pulse">
          <div className="h-10 w-10 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="h-4 bg-white/10 rounded w-3/4 mx-auto" />
          <div className="h-3 bg-white/5 rounded w-1/2 mx-auto" />
        </div>
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 sm:p-6">
        <Card className="max-w-md w-full glass-card border border-white/20 shadow-2xl p-6 sm:p-8 rounded-3xl space-y-6">
          <WindowChrome />
          <div className="text-center space-y-2">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold">Password Protected Note</h1>
            <p className="text-xs text-muted-foreground">
              This meeting summary is protected. Please enter the access password to view.
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Password</label>
              <Input
                data-testid="share-password-input"
                type="password"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="h-10 text-sm"
              />
            </div>
            <Button
              data-testid="share-unlock-btn"
              type="submit"
              disabled={isUnlocking || !password}
              className="w-full h-10 gap-2"
            >
              <Lock className="h-4 w-4" />
              <span>{isUnlocking ? 'Unlocking...' : 'Unlock Notes'}</span>
            </Button>
          </form>

          <div className="text-center pt-2">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Powered by MeetScribe
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <Card className="max-w-md w-full glass-card border border-white/20 p-8 rounded-3xl text-center space-y-4">
          <div className="h-12 w-12 mx-auto rounded-full bg-destructive/20 text-destructive flex items-center justify-center border border-destructive/30">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold">Note Unavailable</h1>
          <p className="text-xs text-muted-foreground">
            {error || 'This link may have expired or been revoked by the owner.'}
          </p>
          <Link to="/" className="mt-4 inline-block">
            <Button variant="glass">Go to MeetScribe</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-sm">
          <div className="h-7 w-7 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <span>MeetScribe</span>
          <Badge variant="secondary" className="text-[10px] uppercase ml-1">Shared</Badge>
        </Link>
        <Button variant="glass" size="sm" onClick={handleCopySummary} className="gap-1.5 text-xs">
          <Copy className="h-3.5 w-3.5" />
          <span>Copy Summary</span>
        </Button>
      </div>

      {/* Header Card */}
      <Card className="glass-card border border-white/20 p-6 sm:p-8 rounded-3xl space-y-4 shadow-xl">
        <WindowChrome title={meeting.title} />
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {meeting.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 pt-3 text-xs text-muted-foreground">
            {meeting.created_at && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-card border border-white/10">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>{new Date(meeting.created_at).toLocaleDateString()}</span>
              </div>
            )}
            {meeting.duration_sec && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-card border border-white/10">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>{Math.round(meeting.duration_sec / 60)} mins</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-card border border-white/10">
              <Globe className="h-3.5 w-3.5 text-primary" />
              <span>{meeting.language || 'en'}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Summary and Decisions */}
      {meeting.summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 glass-card border border-white/20 rounded-3xl shadow-lg p-6 space-y-4">
            <CardHeader className="p-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Executive Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {meeting.summary.summary}
            </CardContent>

            {meeting.summary.key_points?.length > 0 && (
              <div className="pt-4 border-t border-white/10 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Key Discussion Points
                </div>
                <ul className="space-y-1.5 text-xs text-foreground/90 list-disc list-inside">
                  {meeting.summary.key_points.map((kp, i) => (
                    <li key={i}>{kp}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="glass-card border border-white/20 rounded-3xl shadow-lg p-6 space-y-4">
            <CardHeader className="p-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Key Decisions</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 space-y-2">
              {meeting.summary.decisions?.length > 0 ? (
                <ul className="space-y-2 text-xs text-foreground/90">
                  {meeting.summary.decisions.map((d, i) => (
                    <li key={i} className="p-2.5 rounded-xl glass-card border border-white/10 flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-muted-foreground italic">No specific decisions noted.</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action Items */}
      {meeting.action_items?.length > 0 && (
        <Card className="glass-card border border-white/20 rounded-3xl shadow-lg p-6 space-y-4">
          <CardHeader className="p-0 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span>Action Items ({meeting.action_items.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {meeting.action_items.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl glass-card border border-white/10 space-y-2 text-xs"
                >
                  <div className="font-medium text-foreground">{item.description}</div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground pt-1 border-t border-white/5">
                    {item.owner && <span>Owner: <strong className="text-foreground">{item.owner}</strong></span>}
                    {item.due_date && <span>Due: {item.due_date}</span>}
                    <Badge variant={item.priority === 'high' ? 'destructive' : 'secondary'} className="text-[10px] capitalize">
                      {item.priority}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcript (if allowed) */}
      {!meeting.hide_transcript && meeting.transcript && (
        <Card className="glass-card border border-white/20 rounded-3xl shadow-lg p-6 space-y-4">
          <CardHeader className="p-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span>Full Transcript</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-96 overflow-y-auto space-y-3 pt-2 text-xs">
            {meeting.transcript.segments?.map((seg) => (
              <div key={seg.id} className="p-2.5 rounded-xl glass-card-subtle border border-white/5 flex gap-3">
                <span className="font-mono text-[10px] text-muted-foreground shrink-0 pt-0.5">
                  {Math.floor(seg.start / 60)}:{Math.floor(seg.start % 60).toString().padStart(2, '0')}
                </span>
                <span className="text-foreground/90">{seg.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
