import { Link } from "react-router-dom";

export function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">MeetScribe</h1>
      <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
        Upload a meeting recording and get a transcript, a concise summary, key decisions,
        and a structured list of action items.
      </p>
      <p className="mt-6">
        <Link to="/register" className="text-blue-600 hover:underline dark:text-blue-400">
          Create an account
        </Link>{" "}
        to get started.
      </p>
    </main>
  );
}
