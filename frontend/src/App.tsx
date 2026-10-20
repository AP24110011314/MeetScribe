import { Link, Outlet } from "react-router-dom";

import { useAuth } from "./lib/authContext";

/** App shell: header nav (auth-aware) + routed content. */
export function App() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="border-b border-gray-200 dark:border-gray-800">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            MeetScribe
          </Link>
          <div className="flex items-center gap-4 text-sm">
            {user ? (
              <>
                <Link to="/meetings" className="hover:underline">
                  Meetings
                </Link>
                <span className="text-gray-500 dark:text-gray-400">{user.email}</span>
                <button type="button" onClick={logout} className="hover:underline">
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
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default App;
