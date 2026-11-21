import type { UserProfile, UserSessionInfo } from '../types/anime.ts';
import { apiFetch, setAuthToken } from './apiClient.ts';

export const authService = {
  async getCurrentUser(): Promise<{ user: UserProfile; hasAdmin: boolean } | null> {
    try {
      return await apiFetch<{ user: UserProfile; hasAdmin: boolean }>('/api/auth/me');
    } catch {
      return null;
    }
  },

  async register(input: { email: string; username: string; password: string }) {
    const res = await apiFetch<{
      user: UserProfile;
      token: string;
      verificationPending: boolean;
      verificationToken: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setAuthToken(res.token);
    return res;
  },

  async login(input: { email: string; password: string }) {
    const res = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setAuthToken(res.token);
    return res;
  },

  async logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },

  async updateProfile(input: { username?: string; avatarUrl?: string; bio?: string }) {
    return apiFetch<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return apiFetch<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async listSessions(): Promise<UserSessionInfo[]> {
    const res = await apiFetch<{ sessions: UserSessionInfo[] }>('/api/auth/sessions');
    return res.sessions || [];
  },

  async revokeSession(sessionId: string): Promise<{ ok: boolean; revokedCount: number }> {
    return apiFetch<{ ok: boolean; revokedCount: number }>(
      `/api/auth/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' }
    );
  },

  async verifyEmail(token: string) {
    return apiFetch<{ user: UserProfile; verified: boolean }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  async requestPasswordReset(email: string) {
    return apiFetch<{ ok: boolean; message: string; resetToken?: string }>(
      '/api/auth/forgot-password',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      }
    );
  },

  async resetPassword(token: string, newPassword: string) {
    return apiFetch<{ ok: boolean }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },
};
