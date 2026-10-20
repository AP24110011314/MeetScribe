import { useAuth } from "../lib/authContext";

/** Placeholder list page; Phase 2 adds upload + real data. */
export function Meetings() {
  const { user } = useAuth();
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-bold">Your meetings</h1>
      <p className="mt-4 text-gray-600 dark:text-gray-300">
        Signed in as {user?.email}. Uploading and listing arrive in Phase 2.
      </p>
    </main>
  );
}
