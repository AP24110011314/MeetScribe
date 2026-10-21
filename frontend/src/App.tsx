import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./lib/authContext";
import { useEffect } from "react";

/** App shell: header nav (auth-aware) + sidebar + routed content + bottom nav. */
export function App() {
  const { user, logout } = useAuth();
  const location = useLocation();

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("meetscribe-theme");
    if (stored) {
      document.documentElement.classList.add(stored);
      document.documentElement.classList.remove(stored === "dark" ? "light" : "dark");
    } else {
      // Respect system preference
      const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      } else {
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
      }
    }
  }, []);

  // Update page title based on route
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "MeetScribe - Home",
      "/meetings": "MeetScribe - Meetings",
      "/meetings/": "MeetScribe - Meetings",
      "/login": "MeetScribe - Log in",
      "/register": "MeetScribe - Sign up",
    };
    const path = location.pathname.split("?")[0];
const safePath = path || "/";
    document.title = titles[safePath] || "MeetScribe";
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 antialiased">
      {/* Theme toggle button in header */}
      <button
        onClick={() => {
          document.documentElement.classList.remove("light", "dark");
          const isDark = document.documentElement.classList.contains("dark");
          document.documentElement.classList.add(isDark ? "light" : "dark");
          localStorage.setItem("meetscribe-theme", isDark ? "light" : "dark");
        }}
        className="rounded-md p-2 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
        aria-label="Toggle theme"
      >
        <svg
          className="h-5 w-5 text-current"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M20.354 15.354A9 9 0 0 1 8.707 3.707a7.952 7.952 0 0 1 1.293 12.093zM5 10a5 5 0 1 0 10 0 5 5 0 0 0-10 0zm8 0a3 3 0 1 1 6 0 3 3 0 0 1-6 0z" />
        </svg>
      </button>

      <header className="border-b border-gray-200 dark:border-gray-800 py-3 shadow-sm">
        <div className="mx-auto max-w-7xl px-6 flex items-center justify-between flex-wrap gap-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
            MeetScribe
          </Link>

          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <Link to="/meetings" className="hover:underline">
                  Meetings
                </Link>
                <span className="text-gray-500 dark:text-gray-400">{user.email}</span>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:underline">
                  Log in
                </Link>
                <Link to="/register" className="hover:underline">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-6">
        <Outlet />
      </main>

      {/* Bottom navigation (mobile) */}
      {typeof window !== "undefined" && window.innerWidth < 768 && (
        <nav
          className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/80 backdrop-blur-sm fixed bottom-0 left-0 right-0 px-6 py-2 flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Link to="/" className="relative flex-1 flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors" aria-label="Home">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3 13h2l7 7h5v-2h3L12 20l-8-3-8 3z" />
              </svg>
              <span className="hidden md:block">Dashboard</span>
            </Link>
            <Link to="/meetings" className="relative flex-1 flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors" aria-label="Meetings">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3 13h2l7 7h5v-2h3L12 20l-8-3-8 3z" />
              </svg>
              <span className="hidden md:block">Meetings</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                document.documentElement.classList.remove("light", "dark");
                const isDark = document.documentElement.classList.contains("dark");
                document.documentElement.classList.add(isDark ? "light" : "dark");
                localStorage.setItem("meetscribe-theme", isDark ? "light" : "dark");
              }}
              className="rounded-md p-1.5 flex items-center gap-1.5 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
              aria-label="Toggle theme"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M12 2v2l3 3m6-6v14a2 2 0 0 1-2.353 1.647l-3.06 1.9l-1.321-2.875a2.83 2.83 0 0 0-2.969 1.5l-1.15 2.093L19.5 14l1.406-3.498a2.83 2.83 0 0 0-1.664-2.897l-2.905 1.45L15 2l1.093-.552a7.973 7.973 0 0 0-2.755-2.337c-.488-.18-1.08-.18-1.562 0ZM3 15l3.473 1.85a.5.5 0 0 1 .487.506l.13 2.328l.696-2.15a5.83 5.83 0 0 1 1.064-.25l1.321.63l1.321-.63a.5.5 0 0 1 .435.357l.153 2.037l2.554-1.188a3.5 3.5 0 0 1 1.038.838l-.261.536l-.557-1.957a5.83 5.83 0 0 1-.605-.263l-1.321-.63l-1.321.63a.5.5 0 0 1-.531.196l-.181 1.927L3 15Z"
                />
              </svg>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}