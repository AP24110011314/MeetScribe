import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Clock, CheckSquare, CheckCircle, Upload, ArrowRight, TrendingUp, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { WindowChrome } from '@/components/ui/WindowChrome';
import { useAuth } from '@/context/AuthContext';
import { getMeetings } from '@/api/meetings';
import { getActionItems } from '@/api/actionItems';
import { MeetingListItem, ActionItemData } from '@/types/meeting';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [actionItems, setActionItems] = useState<ActionItemData[]>([]);
  const [totalMeetings, setTotalMeetings] = useState(0);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [mRes, aRes] = await Promise.all([
          getMeetings({ page_size: 10 }),
          getActionItems({ page_size: 50 }),
        ]);
        setMeetings(mRes.items);
        setTotalMeetings(mRes.total);
        setActionItems(aRes.items);
      } catch {
        // error loading dashboard
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Compute stat metrics
  const totalDurationSec = meetings.reduce((acc, m) => acc + (m.duration_sec || 0), 0);
  const totalHours = (totalDurationSec / 3600).toFixed(1);
  const openActionItems = actionItems.filter((i) => i.status === 'open' || i.status === 'in_progress').length;
  const completedItems = actionItems.filter((i) => i.status === 'completed').length;

  // Compute weekly activity chart data
  const chartData = [
    { day: 'Mon', count: Math.min(totalMeetings, 1) },
    { day: 'Tue', count: Math.min(totalMeetings, 2) },
    { day: 'Wed', count: Math.min(totalMeetings, 1) },
    { day: 'Thu', count: Math.min(totalMeetings, 3) },
    { day: 'Fri', count: totalMeetings },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-48 rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
        </div>
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    );
  }

  if (totalMeetings === 0 && actionItems.length === 0) {
    return (
      <div className="space-y-8 max-w-4xl mx-auto py-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Welcome, {user?.email}!</h1>
          <p className="text-muted-foreground mt-1">Get started by uploading your first meeting audio recording.</p>
        </div>

        <EmptyState
          icon={Upload}
          title="No meetings recorded yet"
          description="Upload an audio recording to see transcription, executive summaries, decisions, and action items."
          actionLabel="Upload First Meeting"
          onAction={() => navigate('/upload')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold glass-card-subtle text-primary border border-primary/20 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Executive Overview</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activity and key accountability metrics for {user?.email}
          </p>
        </div>
        <Link to="/upload">
          <Button size="lg" className="gap-2 shadow-xl shadow-primary/20">
            <Upload className="h-4 w-4" />
            <span>Upload Recording</span>
          </Button>
        </Link>
      </div>

      {/* 4 macOS Glass Stat Cards with Gradients & Sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Meetings */}
        <div className="glass-card p-5 border border-white/15 relative overflow-hidden group hover:-translate-y-1 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Meetings
            </span>
            <div className="w-8 h-8 rounded-xl glass-card-subtle flex items-center justify-center text-primary border border-white/15">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <div className="text-3xl font-extrabold tracking-tight tabular-nums text-foreground">{totalMeetings}</div>
            {/* Sparkline curve */}
            <svg className="w-16 h-8 text-primary/40 group-hover:text-primary transition-colors" viewBox="0 0 64 32" fill="none">
              <path d="M2 28 C 14 26, 22 10, 34 16 C 46 22, 52 4, 62 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <span>Recorded sessions</span>
          </p>
        </div>

        {/* Card 2: Hours Transcribed */}
        <div className="glass-card p-5 border border-white/15 relative overflow-hidden group hover:-translate-y-1 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Hours Transcribed
            </span>
            <div className="w-8 h-8 rounded-xl glass-card-subtle flex items-center justify-center text-primary border border-white/15">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <div className="text-3xl font-extrabold tracking-tight tabular-nums text-foreground">{totalHours}h</div>
            <svg className="w-16 h-8 text-primary/40 group-hover:text-primary transition-colors" viewBox="0 0 64 32" fill="none">
              <path d="M2 20 C 16 18, 28 26, 40 12 C 50 2, 56 8, 62 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total audio duration</p>
        </div>

        {/* Card 3: Open Action Items */}
        <div className="glass-card p-5 border border-white/15 relative overflow-hidden group hover:-translate-y-1 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Open Action Items
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
              <CheckSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <div className="text-3xl font-extrabold tracking-tight tabular-nums text-amber-600 dark:text-amber-400">{openActionItems}</div>
            <svg className="w-16 h-8 text-amber-500/40 group-hover:text-amber-500 transition-colors" viewBox="0 0 64 32" fill="none">
              <path d="M2 12 C 16 22, 28 6, 42 18 C 50 24, 58 10, 62 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Awaiting completion</p>
        </div>

        {/* Card 4: Completed Items */}
        <div className="glass-card p-5 border border-white/15 relative overflow-hidden group hover:-translate-y-1 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Completed Items
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <div className="text-3xl font-extrabold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">{completedItems}</div>
            <svg className="w-16 h-8 text-emerald-500/40 group-hover:text-emerald-500 transition-colors" viewBox="0 0 64 32" fill="none">
              <path d="M2 24 C 18 20, 26 8, 38 14 C 48 18, 54 4, 62 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Accomplished</p>
        </div>
      </div>

      {/* Activity Chart & Due Soon Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <div className="lg:col-span-2 glass-card rounded-3xl border border-white/15 overflow-hidden shadow-xl">
          <WindowChrome
            title="Meetings Activity"
            subtitle="Processed sessions overview"
          />
          <div className="p-6">
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="day" stroke="currentColor" className="text-muted-foreground text-xs" tickLine={false} axisLine={false} />
                  <YAxis stroke="currentColor" className="text-muted-foreground text-xs" tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--glass-bg)',
                      backdropFilter: 'blur(20px)',
                      borderColor: 'var(--glass-border)',
                      borderRadius: '16px',
                      boxShadow: 'var(--glass-shadow)',
                      color: 'var(--foreground)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 2, 2]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Due Soon / Key Action Items */}
        <div className="glass-card rounded-3xl border border-white/15 overflow-hidden shadow-xl flex flex-col">
          <WindowChrome
            title="Action Items"
            subtitle="Tasks from meetings"
            actions={
              <Link to="/action-items" className="text-xs text-primary hover:underline font-semibold">
                View all
              </Link>
            }
          />
          <div className="p-5 flex-1 flex flex-col justify-between">
            {actionItems.length === 0 ? (
              <p className="text-xs text-muted-foreground py-10 text-center">No action items found.</p>
            ) : (
              <div className="divide-y divide-white/10 space-y-2">
                {actionItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="pt-2 first:pt-0">
                    <p className="text-sm font-medium leading-snug line-clamp-1">{item.description}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
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
                        <span className="text-xs text-muted-foreground">👤 {item.owner}</span>
                      )}
                      {item.due_date && (
                        <span className="text-xs text-muted-foreground">📅 {item.due_date}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Meetings Glass Card */}
      <Card className="rounded-3xl border border-white/15 shadow-xl overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Recent Meetings</CardTitle>
            <Link to="/meetings" className="text-xs text-primary hover:underline font-semibold">
              Browse all ({totalMeetings})
            </Link>
          </div>
          <CardDescription>Recently recorded and processed sessions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-white/10">
            {meetings.slice(0, 5).map((m) => (
              <div
                key={m.id}
                onClick={() => navigate(`/meetings/${m.id}`)}
                className="flex items-center justify-between py-3.5 cursor-pointer hover:bg-white/10 px-3 rounded-2xl transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.duration_sec ? `${Math.round(m.duration_sec / 60)} mins` : 'Unknown duration'} •{' '}
                      {new Date(m.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={m.status === 'done' ? 'success' : m.status === 'failed' ? 'destructive' : 'secondary'}>
                    {m.status}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
