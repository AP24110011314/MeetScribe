import { useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

export function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Meeting Details</h1>
      <Card>
        <CardHeader>
          <CardTitle>Session {id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Meeting overview, player, and transcript appear in Phase 8.</p>
        </CardContent>
      </Card>
    </div>
  );
}
