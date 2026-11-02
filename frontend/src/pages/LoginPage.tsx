import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Mail, Lock, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { WindowChrome } from '@/components/ui/WindowChrome';
import { GradientMeshBackground } from '@/components/ui/GradientMeshBackground';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { LiveProductPreview } from '@/components/LiveProductPreview';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/dashboard';

  const validate = (): boolean => {
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Please enter a valid email address';
    }

    if (!password) {
      errs.password = 'Password is required';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!validate()) {
      setShakeKey((k) => k + 1);
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      toast({
        type: 'success',
        title: 'Welcome back!',
        description: 'You have successfully signed in.',
      });
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid email or password';
      setFormError(msg);
      setShakeKey((k) => k + 1);
      toast({
        type: 'error',
        title: 'Sign in failed',
        description: msg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full relative overflow-x-hidden overflow-y-auto flex flex-col justify-between px-3 py-3 sm:px-8 sm:py-6 overscroll-contain">
      {/* Mesh background */}
      <GradientMeshBackground />

      {/* Top Header / Switcher */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between z-20 shrink-0 py-1">
        <Link to="/" className="inline-flex items-center gap-2 font-bold text-lg sm:text-xl tracking-tight text-foreground group min-h-[44px]">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black text-sm sm:text-base shadow-lg shadow-primary/25 group-hover:scale-105 transition-transform">
            MS
          </div>
          <span className="font-semibold text-base sm:text-lg">MeetScribe</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeSwitcher variant="compact" />
        </div>
      </header>

      {/* Main Split Layout */}
      <main className="w-full max-w-7xl mx-auto my-auto py-3 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center z-10">
        {/* Left column (Desktop Live Product Preview) */}
        <div className="hidden lg:flex lg:col-span-7 flex-col justify-center space-y-8 pr-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold glass-card-subtle text-primary border border-primary/20">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Intelligent Meeting Synthesis</span>
            </div>
            <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight text-foreground leading-[1.15]">
              Experience meeting notes designed for clarity and speed.
            </h1>
            <p className="text-base text-muted-foreground max-w-xl leading-relaxed">
              Automatic 16 kHz Whisper speech recognition paired with Gemini structured extraction. Review decisions, audio waveforms, and prioritized action items in seconds.
            </p>
          </div>

          <LiveProductPreview />
        </div>

        {/* Right column: macOS Glass Auth Window */}
        <div className="w-full max-w-md mx-auto lg:col-span-5">
          <motion.div
            key={shakeKey}
            initial={{ opacity: 0, y: 16 }}
            animate={shakeKey > 0 ? { x: [-8, 8, -6, 6, -3, 3, 0], opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
            transition={{ duration: shakeKey > 0 ? 0.4 : 0.3 }}
            className="glass-card shadow-2xl border border-white/20 rounded-2xl sm:rounded-3xl overflow-hidden backdrop-blur-2xl"
          >
            <WindowChrome
              title="Sign In"
              subtitle="MeetScribe Account"
            />

            <div className="p-5 sm:p-8 space-y-5 sm:space-y-6">
              <div className="space-y-1 text-center sm:text-left">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Welcome back</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">Enter your credentials to access your notes</p>
              </div>

              <form data-testid="login-form" onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-3 text-xs rounded-xl bg-destructive/15 border border-destructive/25 text-destructive font-medium leading-relaxed"
                  >
                    {formError}
                  </motion.div>
                )}

                {/* Email field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1" htmlFor="email">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    error={errors.email}
                    autoComplete="email"
                    disabled={isLoading}
                    autoFocus={typeof window !== 'undefined' && window.innerWidth >= 768}
                    startIcon={<Mail className="w-4 h-4" />}
                  />
                </div>

                {/* Password field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="password">
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                      }}
                      error={errors.password}
                      autoComplete="current-password"
                      disabled={isLoading}
                      startIcon={<Lock className="w-4 h-4" />}
                      endIcon={
                        <button
                          type="button"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-muted-foreground hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 transition-colors focus:outline-none"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      }
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <Button type="submit" size="lg" className="w-full gap-2 shadow-lg min-h-[44px]" isLoading={isLoading}>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </form>

              <div className="pt-2 text-center border-t border-white/10">
                <p className="text-xs text-muted-foreground">
                  Don't have an account?{' '}
                  <Link to="/register" className="font-semibold text-primary hover:underline ml-1 min-h-[44px] inline-flex items-center">
                    Create account
                  </Link>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto py-2 sm:py-4 text-center text-[11px] sm:text-xs text-muted-foreground/75 z-20 shrink-0">
        MeetScribe • High Performance Local Meeting Intelligence
      </footer>
    </div>
  );
}
