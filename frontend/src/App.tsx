import { Link, Outlet } from "react-router-dom";

/** App shell: header nav + routed content. Auth-aware nav arrives in Phase 1. */
export function App() {
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="border-b border-gray-200 dark:border-gray-800">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            MeetScribe
          </Link>
          <div className="flex gap-4 text-sm">
            <Link to="/login" className="hover:underline">
              Log in
            </Link>
            <Link to="/register" className="hover:underline">
              Sign up
            </Link>
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
