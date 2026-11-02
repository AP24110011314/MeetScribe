import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';

// Code-split all page components to reduce initial bundle size from >1MB to <100KB
const LandingPage = React.lazy(() =>
  import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const LoginPage = React.lazy(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = React.lazy(() =>
  import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const DashboardPage = React.lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const MeetingsPage = React.lazy(() =>
  import('@/pages/MeetingsPage').then((m) => ({ default: m.MeetingsPage })),
);
const MeetingDetailPage = React.lazy(() =>
  import('@/pages/MeetingDetailPage').then((m) => ({ default: m.MeetingDetailPage })),
);
const ActionItemsPage = React.lazy(() =>
  import('@/pages/ActionItemsPage').then((m) => ({ default: m.ActionItemsPage })),
);
const SettingsPage = React.lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const UploadPage = React.lazy(() =>
  import('@/pages/UploadPage').then((m) => ({ default: m.UploadPage })),
);
const TrashPage = React.lazy(() =>
  import('@/pages/TrashPage').then((m) => ({ default: m.TrashPage })),
);
const PublicSharePage = React.lazy(() =>
  import('@/pages/PublicSharePage').then((m) => ({ default: m.PublicSharePage })),
);
const NotFoundPage = React.lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span className="text-xs font-medium text-muted-foreground animate-pulse">Loading...</span>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/share/:token" element={<PublicSharePage />} />

                  {/* Protected routes */}
                  <Route
                    element={
                      <ProtectedRoute>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/meetings" element={<MeetingsPage />} />
                    <Route path="/meetings/:id" element={<MeetingDetailPage />} />
                    <Route path="/action-items" element={<ActionItemsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/upload" element={<UploadPage />} />
                    <Route path="/trash" element={<TrashPage />} />
                  </Route>

                  {/* 404 handler */}
                  <Route path="/404" element={<NotFoundPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
