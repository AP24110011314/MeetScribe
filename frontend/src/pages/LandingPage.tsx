import { Link, useNavigate } from 'react-router-dom';
import { Mic, FileText, CheckCircle, ArrowRight, Shield, Zap, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navigation */}
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-30 px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-lg text-primary tracking-tight">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-extrabold text-sm shadow">
            MS
          </div>
          <span>MeetScribe</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            data-testid="theme-toggle"
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {isAuthenticated ? (
            <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link to="/register">
                <Button>Get Started</Button>
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden py-20 sm:py-32 px-6 text-center max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-8">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI-Powered Meeting Notes on macOS</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground max-w-3xl mx-auto leading-tight">
            Turn meeting recordings into{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-500">
              actionable summaries
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            Upload any meeting audio. MeetScribe transcribes with Whisper and synthesizes executive
            summaries, decisions, and tracked action items automatically.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to={isAuthenticated ? '/dashboard' : '/register'} className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto gap-2">
                <span>Start Free</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Sign In to Account
              </Button>
            </Link>
          </div>
        </section>

        {/* 3-Step Explainer */}
        <section className="py-16 bg-muted/30 border-y border-border px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">How MeetScribe Works</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Three simple steps from recorded audio to structured accountability.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Step 1 */}
              <div className="flex flex-col items-center text-center p-6 rounded-xl bg-card border border-border shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <Mic className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">1. Upload Recording</h3>
                <p className="text-sm text-muted-foreground">
                  Drop MP3, WAV, M4A, or MP4 audio. Presigned direct uploads ensure speed and privacy.
                </p>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center text-center p-6 rounded-xl bg-card border border-border shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">2. Whisper Transcription</h3>
                <p className="text-sm text-muted-foreground">
                  Normalized to 16 kHz mono and transcribed with accurate timestamps and full-text search.
                </p>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center p-6 rounded-xl bg-card border border-border shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">3. Extract Decisions & Items</h3>
                <p className="text-sm text-muted-foreground">
                  Our LLM pipeline extracts executive takeaways, assigned owners, due dates, and priorities.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights */}
        <section className="py-20 px-6 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex items-start gap-4 p-5 rounded-lg border bg-card">
              <Zap className="h-6 w-6 text-primary shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-sm">Background Workers</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Async pipeline powered by Celery & Redis with real-time status progression.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-5 rounded-lg border bg-card">
              <Shield className="h-6 w-6 text-primary shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-sm">Strict Isolation</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Argon2 password hashing, JWT authentication, and strict multi-tenant ownership enforcement.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-5 rounded-lg border bg-card">
              <FileText className="h-6 w-6 text-primary shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-sm">Export Anytime</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  One-click export to GitHub-style Markdown or formatted PDF reports.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 px-6 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} MeetScribe. Built for macOS Apple Silicon.</p>
      </footer>
    </div>
  );
}
