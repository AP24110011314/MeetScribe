export function App() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-brand-600 dark:text-brand-400">
        MeetScribe
      </h1>
      <p className="mt-2 text-lg text-gray-600 dark:text-gray-300">
        AI-Powered Meeting Notes, Summaries & Action Items
      </p>
      <div className="mt-6 p-4 rounded-lg bg-white dark:bg-gray-800 shadow border border-gray-200 dark:border-gray-700 max-w-md w-full">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Backend API Status: <span className="text-green-600 font-medium">Ready on :8000</span>
        </p>
      </div>
    </div>
  );
}

export default App;

