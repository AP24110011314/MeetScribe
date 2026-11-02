import { Link, useNavigate } from 'react-router-dom';
import { Mic, FileText, CheckCircle, ArrowRight, Sparkles, Cpu, Lock, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { GradientMeshBackground } from '@/components/ui/GradientMeshBackground';
import { LiveProductPreview } from '@/components/LiveProductPreview';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] w-full relative overflow-x-hidden overflow-y-auto flex flex-col justify-between text-foreground overscroll-contain">
      {/* Dynamic Animated Mesh */}
      <GradientMeshBackground />

      {/* Navigation */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-xl border-b border-white/10 glass-panel bg-background/60">
        <div className="max-w-7xl mx-auto px-3 sm:px-8 h-14 sm:h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-base sm:text-lg tracking-tight group shrink-0 min-h-[44px]">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl sm:rounded-2xl bg-primary text-primary-foreground font-black text-xs sm:text-sm shadow-md group-hover:scale-105 transition-transform">
              MS
            </div>
            <span className="truncate">MeetScribe</span>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Extended palette switcher on tablet/desktop */}
            <div className="hidden sm:inline-flex">
              <ThemeSwitcher variant="compact" />
            </div>

            {/* Testid theme toggle */}
            <button
              data-testid="theme-toggle"
              onClick={toggleTheme}
              className="p-2 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center"
              title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle dark/light mode"
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {isAuthenticated ? (
              <Button onClick={() => navigate('/dashboard')} size="sm" className="shadow-md h-9 px-3 sm:px-4 text-xs sm:text-sm">
                Dashboard
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="h-9 px-2.5 sm:px-4 text-xs sm:text-sm font-medium">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="sm" className="shadow-md h-9 px-3 sm:px-4 text-xs sm:text-sm font-semibold">
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-20 z-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Hero Text */}
          <div className="lg:col-span-6 space-y-5 sm:space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold glass-card-subtle text-primary border border-primary/25 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Whisper Speech AI + Google Gemini</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15]">
              Turn meeting recordings into{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-pink-500">
                structured clarity
              </span>
            </h1>

            <p className="text-sm sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0">
              Upload any meeting audio or video. MeetScribe transcribes using faster-whisper and synthesizes executive summaries, verified decisions, and assigned action items automatically.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 pt-2 w-full max-w-xs sm:max-w-none mx-auto sm:mx-0">
              <Link to={isAuthenticated ? '/dashboard' : '/register'} className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto gap-2.5 shadow-xl shadow-primary/20 min-h-[44px]">
                  <span>Start Free</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login" className="w-full sm:w-auto">
                <Button size="lg" variant="glass" className="w-full sm:w-auto min-h-[44px]">
                  Sign In to Account
                </Button>
              </Link>
            </div>
          </div>

          {/* Right Hero Product Preview */}
          <div className="lg:col-span-6 w-full max-w-lg mx-auto pt-2 lg:pt-0">
            <LiveProductPreview />
          </div>
        </div>

        {/* 3-Step Process Glass Section */}
        <section className="mt-16 sm:mt-24 pt-8 sm:pt-12 border-t border-white/10">
          <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">How MeetScribe Works</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2">
              From unorganized speech to complete accountability in three autonomous steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="glass-card p-5 sm:p-6 border border-white/15 space-y-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl glass-card-subtle flex items-center justify-center text-primary border border-white/20 shadow-sm">
                <Mic className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">1. Upload Audio or Video</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Direct presigned S3 upload for MP3, WAV, M4A, and MP4. Audio streams are isolated and normalized to 16 kHz mono.
              </p>
            </div>

            <div className="glass-card p-5 sm:p-6 border border-white/15 space-y-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl glass-card-subtle flex items-center justify-center text-primary border border-white/20 shadow-sm">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">2. Whisper Speech-to-Text</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Asynchronous Celery pipeline with faster-whisper int8 inference delivers millisecond timestamped transcripts.
              </p>
            </div>

            <div className="glass-card p-5 sm:p-6 border border-white/15 space-y-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl glass-card-subtle flex items-center justify-center text-primary border border-white/20 shadow-sm">
                <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">3. Gemini Synthesis</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Executive notes, key decisions, and tracked action items complete with assigned owners, priorities, and deadlines.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-white/10 glass-panel py-4 sm:py-6 px-4 sm:px-8 mt-8 sm:mt-12 z-20 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-3 sm:gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">MeetScribe Platform</span>
            <span>•</span>
            <span>macOS Glass Edition</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <Lock className="w-3 h-3" /> Zero Server Relay
            </span>
            <span className="inline-flex items-center gap-1">
              <Cpu className="w-3 h-3" /> Apple Silicon Optimized
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
