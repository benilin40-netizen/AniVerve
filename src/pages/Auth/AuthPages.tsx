import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { authService } from '../../services/authService.ts';
import { adminAuthService } from '../../services/adminAuthService.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';
import { AdminSignInPanel } from '../../components/admin/AdminSignInPanel.tsx';
import { ONBOARDING_PENDING_KEY } from '../../components/onboarding/OnboardingModal.tsx';

export function LoginPage() {
  useDocumentMeta({ title: 'Sign In' });
  const navigate = useNavigate();
  const { refreshUser, isAdminAuthenticated } = useAuth();
  const { syncGuestToAccount } = useLibrary();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authService.login({ email, password });
      await refreshUser();
      const synced = await syncGuestToAccount().catch(() => 0);
      showToast(
        synced > 0
          ? `Signed in and synced ${synced} local library item(s).`
          : 'Signed in successfully.',
        'success'
      );
      navigate('/watchlist');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Sign in to AniVerve" subtitle="Access your watchlist, watch history, and preferences.">
      {isAdminAuthenticated && (
        <div className="mb-5 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-500">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Administrator session active</span>
          </div>
          <p className="text-[11px] text-zinc-600 dark:text-[#A5A1B5]">
            You can browse Home, Catalog, Watchlist, and Profile directly as Administrator without signing into a member account.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/"
              className="rounded-lg bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-colors"
            >
              Browse Site as Administrator
            </Link>
            <Link
              to="/admin"
              className="rounded-lg border border-amber-500/35 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-300 hover:bg-amber-500/10 transition-colors"
            >
              Admin Console
            </Link>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <AuthError message={error} />}
        <Field label="Email" type="email" value={email} onChange={setEmail} required />
        <Field label="Password" type="password" value={password} onChange={setPassword} required />

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs text-[#7C5CFF] dark:text-[#9B87FF] hover:underline">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign In
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-zinc-500 dark:text-[#A5A1B5]">
        New to AniVerve?{' '}
        <Link to="/register" className="font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-3 pt-3 border-t border-zinc-200 dark:border-white/[0.08] text-center text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
        Platform administrator?{' '}
        <Link to="/admin/login" className="font-medium text-amber-500 hover:underline">
          Open Admin Security Gate
        </Link>
      </p>
    </AuthCard>
  );
}

export function AdminLoginPage() {
  useDocumentMeta({ title: 'Admin Sign In' });
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  React.useEffect(() => {
    adminAuthService
      .getSession()
      .then((s) => setAuthenticated(s.authenticated))
      .finally(() => setChecked(true));
  }, []);

  if (checked && authenticated) {
    return <Navigate to="/admin" replace />;
  }

  return <AdminSignInPanel onSuccess={() => navigate('/admin')} />;
}

export function RegisterPage() {
  useDocumentMeta({ title: 'Create Account' });
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { syncGuestToAccount } = useLibrary();
  const { showToast } = useToast();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authService.register({ username, email, password });
      try {
        localStorage.setItem(ONBOARDING_PENDING_KEY, '1');
      } catch {
        // Ignore storage errors
      }
      await refreshUser();
      await syncGuestToAccount().catch(() => 0);
      showToast('Account created successfully.', 'success');
      if (res.verificationToken) {
        setVerificationToken(res.verificationToken);
      } else {
        navigate('/profile');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  if (verificationToken) {
    return (
      <AuthCard title="Verify your email" subtitle="Confirm your email address to complete account setup.">
        <div className="space-y-4 text-sm text-zinc-600 dark:text-[#A5A1B5]">
          <div className="flex items-center gap-3 rounded-xl bg-[#7C5CFF]/10 p-4 text-[#7C5CFF] dark:text-[#9B87FF]">
            <Mail className="h-5 w-5 shrink-0" />
            <p className="text-xs leading-relaxed">
              Your verification token is ready. Click below to verify your email address immediately.
            </p>
          </div>
          <Link
            to={`/verify-email?token=${encodeURIComponent(verificationToken)}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <ShieldCheck className="h-4 w-4" />
            Verify Email Address
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create an AniVerve account" subtitle="Track watched episodes, sync favorites, and rate series.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <AuthError message={error} />}
        <Field label="Username" type="text" value={username} onChange={setUsername} required />
        <Field label="Email" type="email" value={email} onChange={setEmail} required />
        <Field
          label="Password (min 8 chars)"
          type="password"
          value={password}
          onChange={setPassword}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Create Account
        </button>
      </form>
      <p className="mt-5 text-center text-xs text-zinc-500 dark:text-[#A5A1B5]">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

export function VerifyEmailPage() {
  useDocumentMeta({ title: 'Verify Email' });
  const [params] = useSearchParams();
  const { refreshUser } = useAuth();
  const [token, setToken] = useState(params.get('token') || '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      await authService.verifyEmail(token);
      await refreshUser();
      setStatus('done');
      setMessage('Your email address has been verified.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Verification failed.');
    }
  };

  return (
    <AuthCard title="Email Verification" subtitle="Enter or confirm your verification token.">
      {status === 'done' ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
          <p className="text-sm text-zinc-700 dark:text-[#F5F3FF]">{message}</p>
          <Link
            to="/profile"
            className="inline-flex rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            Go to Profile
          </Link>
        </div>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          {status === 'error' && <AuthError message={message} />}
          <Field label="Verification Token" type="text" value={token} onChange={setToken} required />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {status === 'loading' ? 'Verifying...' : 'Confirm Verification'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  useDocumentMeta({ title: 'Reset Password' });
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authService.requestPasswordReset(email);
      if (res.resetToken) setResetToken(res.resetToken);
      setStep('reset');
      showToast(res.message, 'info');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authService.resetPassword(resetToken, newPassword);
      showToast('Password updated. Please sign in.', 'success');
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Reset Password" subtitle="Recover access to your AniVerve account.">
      {error && <AuthError message={error} />}
      {step === 'request' ? (
        <form onSubmit={handleRequest} className="space-y-4">
          <Field label="Account Email" type="email" value={email} onChange={setEmail} required />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {loading ? 'Sending...' : 'Request Reset Token'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <Field label="Reset Token" type="text" value={resetToken} onChange={setResetToken} required />
          <Field
            label="New Password (min 8 chars)"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}

function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-md mx-auto my-8 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 sm:p-8 shadow-xl animate-av-enter">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-[#F5F3FF]">{title}</h1>
      <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] mt-1 mb-6">{subtitle}</p>
      {children}
    </div>
  );
}

function AuthError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500 mb-3">
      {message}
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-700 dark:text-[#A5A1B5]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
      />
    </label>
  );
}
