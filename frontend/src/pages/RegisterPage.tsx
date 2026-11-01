import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Mail, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { WindowChrome } from '@/components/ui/WindowChrome';
import { GradientMeshBackground } from '@/components/ui/GradientMeshBackground';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { LiveProductPreview } from '@/components/LiveProductPreview';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  // Password strength calculation
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: 'Empty', color: 'bg-muted' };
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    switch (score) {
      case 1:
        return { score: 1, label: 'Weak', color: 'bg-destructive' };
      case 2:
        return { score: 2, label: 'Fair', color: 'bg-amber-500' };
      case 3:
        return { score: 3, label: 'Good', color: 'bg-blue-500' };
      case 4:
        return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
      default:
        return { score: 0, label: 'Too short', color: 'bg-destructive' };
    }
  };

  const strength = getPasswordStrength(password);

  const validate = (): boolean => {
    const errs: { email?: string; password?: string; confirmPassword?: string } = {};

    if (!email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Please enter a valid email address';
    }

    if (!password) {
      errs.password = 'Password is required';
    } else if (password.length < 8) {
      errs.password = 'Password must be at least 8 characters long';
    }

    if (!confirmPassword) {
      errs.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
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
      await register(email, password);
      toast({
        type: 'success',
        title: 'Account created!',
        description: 'Welcome to MeetScribe.',
      });
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed. Email may already be in use.';
      setFormError(msg);
      setShakeKey((k) => k + 1);
      toast({
        type: 'error',
        title: 'Sign up failed',
        description: msg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col justify-between px-4 py-6 sm:px-8">
      {/* Mesh background */}
      <GradientMeshBackground />

      {/* Top Header / Switcher */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between z-20">
        <Link to="/" className="inline-flex items-center gap-2.5 font-bold text-xl tracking-tight text-foreground group">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black text-base shadow-lg shadow-primary/25 group-hover:scale-105 transition-transform">
            MS
          </div>
          <span className="font-semibold text-lg">MeetScribe</span>
        </Link>

        <div className="flex items-center gap-3">
          <ThemeSwitcher variant="compact" />
        </div>
      </header>

      {/* Main Split Layout */}
      <main className="w-full max-w-7xl mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center z-10">
        {/* Left column (Desktop Live Product Preview) */}
        <div className="hidden lg:flex lg:col-span-7 flex-col justify-center space-y-8 pr-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold glass-card-subtle text-primary border border-primary/20">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Instant AI-Generated Notes</span>
            </div>
            <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight text-foreground leading-[1.15]">
              Start organizing your team conversations effortlessly.
            </h1>
            <p className="text-base text-muted-foreground max-w-xl leading-relaxed">
              Create an account to upload recordings, automatically transcribe speeches, generate structured executive summaries, and keep teams aligned on deliverables.
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
            className="glass-card shadow-2xl border border-white/20 rounded-3xl overflow-hidden backdrop-blur-2xl"
          >
            <WindowChrome
              title="Create Account"
              subtitle="Get Started Free"
            />

            <div className="p-6 sm:p-8 space-y-6">
              <div className="space-y-1 text-center sm:text-left">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign up</h2>
                <p className="text-sm text-muted-foreground">Enter your email and create a password</p>
              </div>

              <form data-testid="register-form" onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-3 text-xs rounded-xl bg-destructive/15 border border-destructive/25 text-destructive font-medium leading-relaxed"
                  >
                    {formError}
                  </motion.div>
                )}

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1" htmlFor="reg-email">
                    Email
                  </label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    error={errors.email}
                    autoComplete="email"
                    disabled={isLoading}
                    autoFocus
                    startIcon={<Mail className="w-4 h-4" />}
                  />
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1" htmlFor="reg-password">
                    Password (min 8 characters)
                  </label>
                  <div className="relative">
                    <Input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                      }}
                      error={errors.password}
                      autoComplete="new-password"
                      disabled={isLoading}
                      startIcon={<Lock className="w-4 h-4" />}
                      endIcon={
                        <button
                          type="button"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      }
                    />
                  </div>

                  {/* Password Strength Meter */}
                  {password.length > 0 && (
                    <div className="pt-1.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Password strength:</span>
                        <span className="font-semibold text-foreground">{strength.label}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 h-1.5">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className={`rounded-full transition-colors duration-200 ${
                              strength.score >= step ? strength.color : 'bg-muted/60'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1" htmlFor="confirm-password">
                    Confirm Password
                  </label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                    }}
                    error={errors.confirmPassword}
                    autoComplete="new-password"
                    disabled={isLoading}
                    startIcon={<ShieldCheck className="w-4 h-4" />}
                  />
                </div>

                <div className="pt-2">
                  <Button type="submit" size="lg" className="w-full gap-2 shadow-lg" isLoading={isLoading}>
                    <span>Create account</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </form>

              <div className="pt-2 text-center border-t border-white/10">
                <p className="text-xs text-muted-foreground">
                  Already have an account?{' '}
                  <Link to="/login" className="font-semibold text-primary hover:underline ml-1">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto py-4 text-center text-xs text-muted-foreground/75 z-20">
        MeetScribe • High Performance Local Meeting Intelligence
      </footer>
    </div>
  );
}
