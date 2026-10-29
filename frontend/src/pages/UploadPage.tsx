import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

export function UploadPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Upload Recording</h1>
      <Card>
        <CardHeader>
          <CardTitle>Meeting Audio</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Upload dropzone and step tracker will appear in Phase 8.</p>
        </CardContent>
      </Card>
    </div>
  );
}
