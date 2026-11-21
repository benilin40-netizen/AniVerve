import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AdminSessionInfo, UserProfile } from '../types/anime.ts';
import { authService } from '../services/authService.ts';
import { adminAuthService } from '../services/adminAuthService.ts';
import { useTheme } from './ThemeContext.tsx';

interface AuthContextValue {
  user: UserProfile | null;
  adminSession: AdminSessionInfo | null;
  isAdminAuthenticated: boolean;
  isAuthenticated: boolean;
  hasAdmin: boolean;
  loading: boolean;
  refreshUser: () => Promise<void>;
  refreshAdminSession: () => Promise<AdminSessionInfo | null>;
  setUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  logout: () => Promise<void>;
  logoutAdmin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { hydrateRemotePreferences } = useTheme();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSessionInfo | null>(null);
  const [hasAdmin, setHasAdmin] = useState(true);
  const [loading, setLoading] = useState(true);

  const refreshAdminSession = useCallback(async () => {
    try {
      const s = await adminAuthService.getSession();
      setAdminSession(s);
      if (s.authenticated) {
        void hydrateRemotePreferences();
      }
      return s;
    } catch {
      setAdminSession(null);
      return null;
    }
  }, [hydrateRemotePreferences]);

  const refreshUser = useCallback(async () => {
    try {
      const [res, adminRes] = await Promise.all([
        authService.getCurrentUser(),
        adminAuthService.getSession().catch(() => null),
      ]);
      if (res) {
        setUser(res.user);
        setHasAdmin(res.hasAdmin);
      } else {
        setUser(null);
      }
      setAdminSession(adminRes);
      if (res?.user || adminRes?.authenticated) {
        void hydrateRemotePreferences();
      }
    } finally {
      setLoading(false);
    }
  }, [hydrateRemotePreferences]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const logoutAdmin = useCallback(async () => {
    await adminAuthService.logout();
    setAdminSession({ authenticated: false, mustChangePassword: false, authMode: 'backend-password' });
  }, []);

  const isAdminAuthenticated = Boolean(adminSession?.authenticated);
  const isAuthenticated = Boolean(user || isAdminAuthenticated);

  return (
    <AuthContext.Provider
      value={{
        user,
        adminSession,
        isAdminAuthenticated,
        isAuthenticated,
        hasAdmin,
        loading,
        refreshUser,
        refreshAdminSession,
        setUser,
        logout,
        logoutAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
