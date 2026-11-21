import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { adminAuthService } from '../../services/adminAuthService.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';

interface AdminSignInPanelProps {
  onSuccess?: () => void;
}

export function AdminSignInPanel({ onSuccess }: AdminSignInPanelProps) {
  const { refreshAdminSession } = useAuth();
  const { showToast } = useToast();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Enter the administrator access password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await adminAuthService.login(password);
      await refreshAdminSession();
      setPassword('');
      showToast('Administrator session unlocked.', 'success');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Administrator authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto my-8 sm:my-12 animate-av-enter">
      <div className="grid grid-cols-1 md:grid-cols-5 overflow-hidden rounded-2xl border border-zinc-200 dark:border-amber-500/25 bg-white dark:bg-[#171722] shadow-2xl">
        {/* Left Security Clearance Panel */}
        <div className="md:col-span-2 bg-[#09090F] text-[#F5F3FF] p-6 sm:p-7 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/[0.08]">
          <div className="space-y-4">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-amber-400">
                Independent Operator Auth
              </p>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#F5F3FF]">
                Admin Security Gate
              </h1>
              <p className="mt-2 text-xs text-[#A5A1B5] leading-relaxed">
                Dedicated backend-verified password access for homepage layout management, Yenime /
                AniEmbed monitoring, user controls, and system diagnostics.
              </p>
            </div>

            <div className="pt-2 space-y-2 border-t border-white/[0.08] font-mono text-[11px] text-[#A5A1B5]">
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>MODE: BACKEND SESSION + CSRF</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>COOKIE: HTTPONLY · INDEPENDENT</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center justify-between text-xs">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-[#A5A1B5] hover:text-[#F5F3FF] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Public Site
            </Link>
            <Link to="/login" className="text-[#A5A1B5] hover:text-amber-300 transition-colors">
              Member Sign In
            </Link>
          </div>
        </div>

        {/* Right Password-Only Form Panel */}
        <div className="md:col-span-3 p-6 sm:p-8 flex flex-col justify-center bg-white dark:bg-[#171722]">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
              Unlock Administration Center
            </h2>
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] mt-0.5">
              Enter the administrator access password configured for this server.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-400"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700 dark:text-[#A5A1B5]">
                Administrator Password
              </span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  autoComplete="current-password"
                  autoFocus
                  required
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] pl-9 pr-10 py-2.5 text-sm font-mono text-zinc-900 dark:text-[#F5F3FF] placeholder:font-sans placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-[#F5F3FF]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Unlock Admin Console
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
