"use client";

import { useEffect } from "react";

export default function GlobalAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message = error.message.toLowerCase();
  const isDbIssue =
    message.includes("database_url is not set") ||
    message.includes("getaddrinfo") ||
    message.includes("econnrefused") ||
    message.includes("connection terminated");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-6 py-10 text-sm">
      <h1 className="text-2xl font-semibold">Service temporarily unavailable</h1>
      <p className="text-neutral-600">
        {isDbIssue
          ? "The database is currently unavailable. Please try again in a minute."
          : "Something went wrong while loading this page."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded border border-neutral-200 px-3 py-1 text-xs"
      >
        Try again
      </button>
    </main>
  );
}


