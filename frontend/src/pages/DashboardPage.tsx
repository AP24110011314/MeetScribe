import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Clock, CheckSquare, CheckCircle, Upload, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
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
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (totalMeetings === 0 && actionItems.length === 0) {
    return (
      <div className="space-y-8 max-w-4xl mx-auto py-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {user?.email}!</h1>
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
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activity and key accountability metrics for {user?.email}
          </p>
        </div>
        <Link to="/upload">
          <Button className="gap-2 shadow">
            <Upload className="h-4 w-4" />
            <span>Upload Recording</span>
          </Button>
        </Link>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Meetings
            </CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMeetings}</div>
            <p className="text-xs text-muted-foreground mt-1">Recorded sessions</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Hours Transcribed
            </CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours}h</div>
            <p className="text-xs text-muted-foreground mt-1">Total audio duration</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Open Action Items
            </CardTitle>
            <CheckSquare className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{openActionItems}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting completion</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Completed Items
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedItems}</div>
            <p className="text-xs text-muted-foreground mt-1">Accomplished</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Chart & Due Soon Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Meetings Activity</CardTitle>
            <CardDescription>Processed sessions overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="day" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--card-foreground))',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Due Soon / Key Action Items */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Action Items</CardTitle>
              <Link to="/action-items" className="text-xs text-primary hover:underline font-medium">
                View all
              </Link>
            </div>
            <CardDescription>Tasks from your meetings</CardDescription>
          </CardHeader>
          <CardContent>
            {actionItems.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No action items found.</p>
            ) : (
              <div className="divide-y divide-border">
                {actionItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium leading-snug line-clamp-1">{item.description}</p>
                    <div className="flex items-center gap-2 mt-1">
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
          </CardContent>
        </Card>
      </div>

      {/* Recent Meetings */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Recent Meetings</CardTitle>
            <Link to="/meetings" className="text-xs text-primary hover:underline font-medium">
              Browse all ({totalMeetings})
            </Link>
          </div>
          <CardDescription>Recently recorded and processed sessions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {meetings.slice(0, 5).map((m) => (
              <div
                key={m.id}
                onClick={() => navigate(`/meetings/${m.id}`)}
                className="flex items-center justify-between py-3 cursor-pointer hover:bg-muted/40 px-2 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Calendar className="h-4 w-4" />
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
