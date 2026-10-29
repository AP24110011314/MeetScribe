import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <div
      data-testid="not-found"
      className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-6">
        <FileQuestion className="h-8 w-8" />
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight">404</h1>
      <h2 className="text-xl font-semibold mt-2">Page Not Found</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        The page you are looking for doesn't exist or has been moved.
      </p>
      <div className="mt-6">
        <Link to="/dashboard">
          <Button className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
