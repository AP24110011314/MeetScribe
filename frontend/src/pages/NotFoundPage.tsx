import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { WindowChrome } from '@/components/ui/WindowChrome';
import { GradientMeshBackground } from '@/components/ui/GradientMeshBackground';

export function NotFoundPage() {
  return (
    <div
      data-testid="not-found"
      className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-6 text-center select-none"
    >
      <GradientMeshBackground />

      <div className="w-full max-w-md glass-card rounded-3xl border border-white/20 shadow-2xl overflow-hidden backdrop-blur-2xl">
        <WindowChrome
          title="Error 404"
          subtitle="Resource Not Found"
        />

        <div className="p-8 sm:p-10 space-y-6 flex flex-col items-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15 text-primary border border-primary/25 shadow-lg">
            <FileQuestion className="h-10 w-10" />
          </div>

          <div className="space-y-2">
            <h1 className="text-5xl font-black tracking-tight text-foreground">404</h1>
            <h2 className="text-xl font-bold text-foreground">Page Not Found</h2>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              The page or meeting document you are searching for does not exist or has been relocated.
            </p>
          </div>

          <div className="pt-2 w-full">
            <Link to="/dashboard" className="w-full">
              <Button size="lg" className="w-full gap-2 shadow-lg shadow-primary/20">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Dashboard</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
