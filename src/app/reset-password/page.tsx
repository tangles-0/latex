"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function isValidPassword(value: string): boolean {
  return value.length > 6 && /[a-zA-Z]/.test(value) && /[0-9]/.test(value);
}

function getFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const token = useMemo(() => params.get("token")?.trim() ?? "", [params]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token) {
      setError("Reset token is missing. Use the full link from your email.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const password = getFormString(formData, "password");
    const confirmPassword = getFormString(formData, "confirmPassword");

    if (!isValidPassword(password)) {
      setError("Password must be >6 chars and include letters and numbers.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Unable to reset password.");
        return;
      }
      setSuccess("Password updated. Redirecting to login...");
      setTimeout(() => {
        router.push("/");
      }, 1200);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-6 py-6 text-sm sm:py-10">
      <section className="space-y-3 rounded-md border border-neutral-200 p-4">
        <h1 className="text-lg font-medium">reset ur password</h1>
        <p className="text-xs text-neutral-600">
          enter a new password with letters and numbers. minimum length is 7.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            name="password"
            type="password"
            placeholder="new password"
            autoComplete="new-password"
            className="w-full rounded border px-2 py-1"
            disabled={isSubmitting}
          />
          <input
            name="confirmPassword"
            type="password"
            placeholder="confirm new password"
            autoComplete="new-password"
            className="w-full rounded border px-2 py-1"
            disabled={isSubmitting}
          />
          <button
            className="rounded bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "updating..." : "set new password"}
          </button>
        </form>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {success ? <p className="text-xs text-emerald-600">{success}</p> : null}
        <Link href="/" className="inline-block text-xs text-neutral-600 underline">
          back to login
        </Link>
      </section>
    </main>
  );
}
