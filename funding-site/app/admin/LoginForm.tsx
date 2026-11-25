"use client";

import { useActionState } from "react";
import { pillClass } from "@/components/ui";
import { login, type LoginState } from "./actions";

const initial: LoginState = { error: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <form action={action} className="mx-auto max-w-sm rounded-3xl border-2 border-ink-100 bg-white p-7">
      <h1 className="text-2xl font-extrabold text-ink-950">Admin sign in</h1>
      <label htmlFor="password" className="mt-5 block text-sm font-bold text-ink-900">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        aria-describedby={state.error ? "login-error" : undefined}
        className="mt-1.5 h-12 w-full rounded-2xl border-2 border-ink-200 px-3.5 text-base outline-none focus:border-brand-600"
      />
      {state.error && (
        <p id="login-error" role="alert" className="mt-2 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={pillClass("primary", "md", "mt-5 w-full")}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
