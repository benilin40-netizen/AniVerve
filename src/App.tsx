import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LibraryProvider } from './context/LibraryContext.tsx';
import { NotificationProvider } from './context/NotificationContext.tsx';
import { QuickViewProvider } from './context/QuickViewContext.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { AppShell } from './components/layout/AppShell.tsx';
import {
  AdminLoginPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  VerifyEmailPage,
} from './pages/Auth/AuthPages.tsx';

const HomePage = lazy(() =>
  import('./pages/Home/HomePage.tsx').then((m) => ({ default: m.HomePage }))
);
const ExplorePage = lazy(() =>
  import('./pages/Explore/ExplorePage.tsx').then((m) => ({ default: m.ExplorePage }))
);
const AnimeDetailsPage = lazy(() =>
  import('./pages/AnimeDetails/AnimeDetailsPage.tsx').then((m) => ({
    default: m.AnimeDetailsPage,
  }))
);
const WatchPage = lazy(() =>
  import('./pages/Watch/WatchPage.tsx').then((m) => ({ default: m.WatchPage }))
);
const SchedulePage = lazy(() =>
  import('./pages/Schedule/SchedulePage.tsx').then((m) => ({ default: m.SchedulePage }))
);
const WatchlistPage = lazy(() =>
  import('./pages/Watchlist/WatchlistPage.tsx').then((m) => ({ default: m.WatchlistPage }))
);
const ProfilePage = lazy(() =>
  import('./pages/Profile/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage }))
);
const AdminPage = lazy(() =>
  import('./pages/Admin/AdminPage.tsx').then((m) => ({ default: m.AdminPage }))
);

function RouteLoadingFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#9B87FF] border-t-transparent" />
        <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">Loading view...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090F] text-[#F5F3FF]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#9B87FF] border-t-transparent" />
          <p className="text-xs text-[#A5A1B5]">Loading AniVerve...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <LibraryProvider>
              <NotificationProvider>
                <QuickViewProvider>
                  <BrowserRouter>
                  <AppShell>
                    <ErrorBoundary>
                      <Suspense fallback={<RouteLoadingFallback />}>
                        <Routes>
                    <Route
                      path="/"
                      element={
                        <ProtectedRoute>
                          <HomePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/explore"
                      element={
                        <ProtectedRoute>
                          <ExplorePage mode="explore" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/genres"
                      element={
                        <ProtectedRoute>
                          <ExplorePage mode="genres" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/seasonal"
                      element={
                        <ProtectedRoute>
                          <ExplorePage mode="seasonal" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/movies"
                      element={
                        <ProtectedRoute>
                          <ExplorePage mode="movies" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/popular"
                      element={
                        <ProtectedRoute>
                          <ExplorePage mode="popular" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/schedule"
                      element={
                        <ProtectedRoute>
                          <SchedulePage />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/anime/:slug"
                      element={
                        <ProtectedRoute>
                          <AnimeDetailsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/watch/:slug/:episode"
                      element={
                        <ProtectedRoute>
                          <WatchPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/watch/:slug"
                      element={
                        <ProtectedRoute>
                          <WatchPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/watchlist"
                      element={
                        <ProtectedRoute>
                          <WatchlistPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/profile"
                      element={
                        <ProtectedRoute>
                          <ProfilePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/admin/login" element={<AdminLoginPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/verify-email" element={<VerifyEmailPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                      </Suspense>
                    </ErrorBoundary>
                  </AppShell>
                  </BrowserRouter>
                </QuickViewProvider>
              </NotificationProvider>
            </LibraryProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
