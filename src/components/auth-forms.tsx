"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

function getFormString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

export default function AuthForms({ signupsEnabled }: { signupsEnabled: boolean }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const router = useRouter();

  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSignUpError(null);

    const formData = new FormData(event.currentTarget);
    const username = getFormString(formData, "signupUsername")?.trim();
    const email = getFormString(formData, "signupEmail")?.trim();
    const password = getFormString(formData, "signupPassword") ?? undefined;
    const confirmPassword = getFormString(formData, "signupConfirmPassword") ?? undefined;

    if (!username || !email || !password || !confirmPassword) {
      setSignUpError("bruh");
      return;
    }

    const emailRegex =
      /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (!emailRegex.test(email)) {
      setSignUpError("ur email addy is invalid. idc if its real but have chars@chars.smth");
      return;
    }

    if (username.length < 3) {
      setSignUpError("ur handle must be at least 3 chars");
      return;
    }

    if (password.length <= 6 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setSignUpError("pw must be >6 chars and include letters and numbers. u didn't actually thing love sex secret god are valid passwords did u?");
      return;
    }

    if (password !== confirmPassword) {
      setSignUpError("pwz dont match.");
      return;
    }

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, confirmPassword }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setSignUpError(payload.error ?? "Unable to sign up.");
      return;
    }

    await signIn("credentials", {
      email,
      password,
      callbackUrl: "/gallery",
    });
  }

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSignInError(null);

    const formData = new FormData(event.currentTarget);
    const email = getFormString(formData, "email")?.trim();
    const password = getFormString(formData, "password") ?? undefined;

    if (!email || !password) {
      setSignInError("Email and password are required.");
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setSignInError("Invalid credentials.");
      return;
    }

    router.push("/gallery");
  }

  async function handleForgotPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotError(null);
    setForgotSuccess(null);

    const formData = new FormData(event.currentTarget);
    const email = getFormString(formData, "forgotEmail")?.trim();

    if (!email) {
      setForgotError("Email is required.");
      return;
    }

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setForgotError(payload.error ?? "Unable to process password reset request.");
      return;
    }

    const payload = (await response.json()) as { message?: string; emailSent?: boolean };
    const suffix =
      payload.emailSent === false
        ? " Resend is not configured, so for local dev check server logs for the reset link."
        : "";
    setForgotSuccess((payload.message ?? "If that account exists, a reset link has been sent.") + suffix);
  }

  return (
    <section className="space-y-4 rounded-md border border-neutral-200 p-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setSignUpError(null);
            setForgotError(null);
            setForgotSuccess(null);
          }}
          className={`rounded px-3 py-1 ${
            mode === "login" ? "bg-black text-white" : "border border-neutral-200"
          }`}
        >
          login
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setSignInError(null);
            setForgotError(null);
            setForgotSuccess(null);
          }}
          className={`rounded px-3 py-1 ${
            mode === "signup" ? "bg-black text-white" : "border border-neutral-200"
          }`}
          disabled={!signupsEnabled}
        >
          create acct
        </button>
      </div>

      {mode === "signup" ? (
        <div key="signup" className="space-y-3">
          <h2 className="text-lg font-medium">a newb has joined the party</h2>
          <form onSubmit={handleSignUp} className="space-y-3">
            <input
              name="signupUsername"
              type="text"
              placeholder="ur handle (min 3 chars) eg. zer0_c00l"
              autoComplete="off"
              className="w-full rounded border px-2 py-1"
              disabled={!signupsEnabled}
            />
            <input
              name="signupEmail"
              type="email"
              placeholder="ur email addy"
              autoComplete="off"
              className="w-full rounded border px-2 py-1"
              disabled={!signupsEnabled}
            />
            <input
              name="signupPassword"
              type="password"
              placeholder="ur pw (letters + numbers) eg. love, sex, secret, god"
              autoComplete="new-password"
              className="w-full rounded border px-2 py-1"
              disabled={!signupsEnabled}
            />
            <input
              name="signupConfirmPassword"
              type="password"
              placeholder="confirm ur pw"
              autoComplete="new-password"
              className="w-full rounded border px-2 py-1"
              disabled={!signupsEnabled}
            />
            <p className="text-xs text-neutral-500">
              ill never send emails or share them bcoz im not a creep. use a fake one if u want. i mite use the email for acct recovery if u forget ur pw.
            </p>
            <button
              className="rounded bg-black px-4 py-2 text-white"
              type="submit"
              disabled={!signupsEnabled}
            >
              speak friend and enter
            </button>
            {!signupsEnabled ? (
              <p className="text-xs text-neutral-500">
                Signups are currently disabled. Please check back later.
              </p>
            ) : null}
            {signUpError ? (
              <p className="text-xs text-red-600">{signUpError}</p>
            ) : null}
          </form>
        </div>
      ) : mode === "forgot" ? (
        <div key="forgot" className="space-y-3">
          <h2 className="text-lg font-medium">forgot ur password?</h2>
          <form onSubmit={handleForgotPassword} className="space-y-3">
            <input
              name="forgotEmail"
              type="email"
              placeholder="ur email addy"
              autoComplete="email"
              className="w-full rounded border px-2 py-1"
            />
            <button className="rounded bg-black px-4 py-2 text-white" type="submit">
              send reset link
            </button>
            <button
              type="button"
              className="block text-xs text-neutral-600 underline"
              onClick={() => {
                setMode("login");
                setForgotError(null);
                setForgotSuccess(null);
              }}
            >
              back to login
            </button>
            {forgotError ? <p className="text-xs text-red-600">{forgotError}</p> : null}
            {forgotSuccess ? <p className="text-xs text-emerald-600">{forgotSuccess}</p> : null}
          </form>
        </div>
      ) : (
        <div key="login" className="space-y-3">
          <h2 className="text-lg font-medium">the legend returns</h2>
          <form onSubmit={handleSignIn} className="space-y-3">
            <input
              name="email"
              type="email"
              placeholder="ur email addy"
              autoComplete="email"
              className="w-full rounded border px-2 py-1"
            />
            <input
              name="password"
              type="password"
              placeholder="ur pw"
              autoComplete="current-password"
              className="w-full rounded border px-2 py-1"
            />
            <button className="rounded bg-black px-4 py-2 text-white" type="submit">
              let me in already
            </button>
            <button
              type="button"
              className="block text-xs text-neutral-600 underline"
              onClick={() => {
                setMode("forgot");
                setSignInError(null);
              }}
            >
              forgot password?
            </button>
            {signInError ? (
              <p className="text-xs text-red-600">{signInError}</p>
            ) : null}
          </form>
        </div>
      )}
    </section>
  );
}

