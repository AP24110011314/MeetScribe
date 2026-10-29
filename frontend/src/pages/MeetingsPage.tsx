import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

export function MeetingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meetings</h1>
          <p className="text-sm text-muted-foreground mt-1">Browse, search, and manage your recorded sessions.</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Meetings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Meeting list will appear here in Phase 8.</p>
        </CardContent>
      </Card>
    </div>
  );
}
