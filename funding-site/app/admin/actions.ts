"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, issueSessionToken, passwordMatches } from "@/lib/admin-auth";
import { clientIp, isRateLimited } from "@/lib/rate-limit";

export interface LoginState {
  error: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = clientIp(await headers());
  if (isRateLimited(`admin-login:${ip}`, 8, 15 * 60 * 1000)) {
    return { error: "Too many attempts. Wait 15 minutes and try again." };
  }

  const password = formData.get("password");
  const token = issueSessionToken();
  if (typeof password !== "string" || !token || !passwordMatches(password)) {
    return { error: "Wrong password." };
  }

  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: ADMIN_SESSION_SECONDS,
  });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, "", { path: "/admin", maxAge: 0 });
  redirect("/admin");
}
