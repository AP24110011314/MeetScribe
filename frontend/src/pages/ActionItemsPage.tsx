import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

export function ActionItemsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Action Items</h1>
      <Card>
        <CardHeader>
          <CardTitle>My Action Items</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Action items board and list view appear in Phase 8.</p>
        </CardContent>
      </Card>
    </div>
  );
}
