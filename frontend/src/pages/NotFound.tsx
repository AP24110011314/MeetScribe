import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        The page you requested does not exist.{" "}
        <Link to="/" className="text-blue-600 hover:underline dark:text-blue-400">
          Go home
        </Link>
      </p>
    </main>
  );
}
