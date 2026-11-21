import type { AdminSessionInfo } from '../types/anime.ts';
import { apiFetch, setAdminCsrfToken } from './apiClient.ts';

export const adminAuthService = {
  async getSession(): Promise<AdminSessionInfo> {
    try {
      const status = await apiFetch<AdminSessionInfo>('/api/admin/session');
      if (status.authenticated && status.csrfToken) {
        setAdminCsrfToken(status.csrfToken);
      } else {
        setAdminCsrfToken(null);
      }
      return status;
    } catch {
      setAdminCsrfToken(null);
      return {
        authenticated: false,
        mustChangePassword: false,
        authMode: 'backend-password',
      };
    }
  },

  async login(password: string): Promise<AdminSessionInfo> {
    const res = await apiFetch<AdminSessionInfo>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (res.csrfToken) {
      setAdminCsrfToken(res.csrfToken);
    }
    return res;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch('/api/admin/logout', { method: 'POST' });
    } finally {
      setAdminCsrfToken(null);
    }
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const res = await apiFetch<{
      ok: boolean;
      mustChangePassword: boolean;
      csrfToken: string;
      expiresAt: string;
      revokedSessions: number;
    }>('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.csrfToken) {
      setAdminCsrfToken(res.csrfToken);
    }
    return res;
  },
};
