import { useState, useEffect } from 'react';
import { Palette, Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import type { UserRole } from '@/types';

interface AuthPageProps {
  navigate: (path: string) => void;
}

export function AuthPage({ navigate }: AuthPageProps) {
  const { signIn, signUp } = useAuth();
  const { showToast } = useToast();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('buyer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (mode === 'signin') {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError(signInError);
        setSubmitting(false);
      } else {
        showToast('Welcome back!', 'success');
        navigate('');
      }
    } else {
      if (displayName.trim().length < 2) {
        setError('Display name must be at least 2 characters.');
        setSubmitting(false);
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        setSubmitting(false);
        return;
      }
      const { error: signUpError } = await signUp(email, password, displayName, role);
      if (signUpError) {
        setError(signUpError);
        setSubmitting(false);
      } else {
        showToast('Account created! Welcome to Atelier.', 'success');
        navigate('');
      }
    }
  };

  const fillDemo = (demoEmail: string, demoPassword: string) => {
    setMode('signin');
    setEmail(demoEmail);
    setPassword(demoPassword);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 bg-ink-900 dark:bg-ink-50 flex items-center justify-center">
            <Palette className="w-5 h-5 text-ink-50 dark:text-ink-900" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-serif text-xl font-semibold tracking-tight">Atelier</span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-ink-500 mt-0.5">Human Art Only</span>
          </div>
        </div>

        <div className="card-surface p-8">
          <div className="flex gap-1 mb-6 border-b border-ink-200 dark:border-ink-800">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                mode === 'signin'
                  ? 'border-ink-900 dark:border-ink-50 text-ink-900 dark:text-ink-50'
                  : 'border-transparent text-ink-500 hover:text-ink-900 dark:hover:text-ink-100'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                mode === 'signup'
                  ? 'border-ink-900 dark:border-ink-50 text-ink-900 dark:text-ink-50'
                  : 'border-transparent text-ink-500 hover:text-ink-900 dark:hover:text-ink-100'
              }`}
            >
              Create Account
            </button>
          </div>

          <h2 className="font-serif text-2xl font-semibold mb-2">
            {mode === 'signin' ? 'Welcome back' : 'Join Atelier'}
          </h2>
          <p className="text-sm text-ink-500 mb-6">
            {mode === 'signin'
              ? 'Sign in to bid, track orders, and manage listings.'
              : 'Create an account as a buyer or artist.'}
          </p>

          {error && (
            <div className="px-4 py-3 mb-4 bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800 text-sm text-accent-700 dark:text-accent-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Display Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your public name"
                    className="input-field pl-10"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Account Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('buyer')}
                    className={`py-3 text-sm font-medium transition-all ${
                      role === 'buyer'
                        ? 'bg-ink-900 text-ink-50 dark:bg-ink-50 dark:text-ink-900'
                        : 'border border-ink-200 dark:border-ink-700 hover:border-ink-900 dark:hover:border-ink-400'
                    }`}
                  >
                    Collector
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('artist')}
                    className={`py-3 text-sm font-medium transition-all ${
                      role === 'artist'
                        ? 'bg-ink-900 text-ink-50 dark:bg-ink-50 dark:text-ink-900'
                        : 'border border-ink-200 dark:border-ink-700 hover:border-ink-900 dark:hover:border-ink-400'
                    }`}
                  >
                    Artist
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full"
            >
              <span className="flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {submitting ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
              </span>
            </button>
          </form>
        </div>

        {/* Demo accounts */}
        <div className="mt-6 p-4 bg-ink-100 dark:bg-ink-800/50">
          <p className="text-xs uppercase tracking-widest font-semibold text-ink-400 mb-3">Demo Accounts</p>
          <div className="space-y-2">
            <button
              onClick={() => fillDemo('elena@atelier.demo', 'password123')}
              className="w-full text-left text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 transition-colors"
            >
              <span className="font-mono">elena@atelier.demo</span> — Artist (Elena Marchetti)
            </button>
            <button
              onClick={() => fillDemo('collector@atelier.demo', 'password123')}
              className="w-full text-left text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 transition-colors"
            >
              <span className="font-mono">collector@atelier.demo</span> — Buyer / Collector
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
