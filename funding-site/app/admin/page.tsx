import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Container, pillClass } from "@/components/ui";
import { ADMIN_COOKIE, adminEnabled, isValidSession } from "@/lib/admin-auth";
import { getTier } from "@/lib/calculator";
import { formatPhone, formatUSD } from "@/lib/format";
import { feedbackByApplication, listApplications, storageInfo } from "@/lib/storage";
import { logout } from "./actions";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

async function AdminContent() {
  // Reading the cookie makes this part render per request, never from cache.
  const session = (await cookies()).get(ADMIN_COOKIE)?.value;

  if (!adminEnabled()) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border-2 border-ink-100 bg-white p-7">
        <h1 className="text-2xl font-extrabold text-ink-950">Admin is turned off</h1>
        <p className="mt-2 text-ink-600">
          Set the <code className="rounded bg-ink-100 px-1.5 py-0.5 text-sm">ADMIN_PASSWORD</code> environment variable
          and restart the site to turn this page on.
        </p>
      </div>
    );
  }

  if (!isValidSession(session)) return <LoginForm />;

  let applications: Awaited<ReturnType<typeof listApplications>> = [];
  let feedback: Awaited<ReturnType<typeof feedbackByApplication>> = new Map();
  let loadError = false;
  try {
    [applications, feedback] = await Promise.all([listApplications(), feedbackByApplication()]);
  } catch {
    loadError = true;
  }

  const rated = applications.filter((a) => feedback.has(a.id));
  const average = rated.length
    ? (rated.reduce((sum, a) => sum + (feedback.get(a.id)?.rating ?? 0), 0) / rated.length).toFixed(1)
    : null;
  const storage = storageInfo();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink-950">Applications</h1>
          <p className="mt-1 text-ink-600" data-testid="admin-summary">
            {applications.length} submitted · {rated.length} rated
            {average ? ` · average ${average} / 5` : ""}
          </p>
        </div>
        <form action={logout}>
          <button type="submit" className={pillClass("outline", "sm")}>Sign out</button>
        </form>
      </div>

      {!storage.durable && (
        <p role="alert" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <strong>Storage on this host is temporary.</strong> Records here can disappear at any time. Connect a
          Redis / KV store (see the README) so this list is permanent. Email and webhook alerts are not affected.
        </p>
      )}
      {loadError && (
        <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Could not read from storage. Check the storage settings and reload.
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-3xl border-2 border-ink-100 bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-600">
            <tr>
              {["Submitted (ET)", "ID", "Business", "Contact", "Time in business", "Annual sales", "Requested", "Use of funds", "Rating", "Comment"].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-bold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {applications.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-ink-500">No applications yet.</td>
              </tr>
            )}
            {applications.map((a) => {
              const fb = feedback.get(a.id);
              return (
                <tr key={a.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-ink-600">{dateFormat.format(new Date(a.createdAt))}</td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{a.id}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-ink-950">{a.businessName}</span>
                    <span className="block text-ink-500">{a.industry}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-ink-950">{a.fullName}</span>
                    <a href={`tel:+1${a.phone}`} className="block whitespace-nowrap text-brand-800 hover:underline">{formatPhone(a.phone)}</a>
                    <a href={`mailto:${a.email}`} className="block text-brand-800 hover:underline">{a.email}</a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{getTier(a.timeInBusiness).label}</td>
                  <td className="px-4 py-3 tabular-nums">{formatUSD(a.annualSales)}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{formatUSD(a.requestedAmount)}</td>
                  <td className="px-4 py-3">{a.useOfFunds}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {fb ? (
                      <span aria-label={`${fb.rating} out of 5`}>
                        <span className="text-amber-500" aria-hidden="true">{"★".repeat(fb.rating)}</span>
                        <span className="text-ink-200" aria-hidden="true">{"★".repeat(5 - fb.rating)}</span>
                        <span className="ml-1.5 text-ink-600">{fb.rating}/5</span>
                      </span>
                    ) : (
                      <span className="text-ink-400">Not rated</span>
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-ink-700">{fb?.comment || <span className="text-ink-400">None</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <section className="bg-ink-50 py-10 sm:py-14">
      <Container className="max-w-7xl">
        <Suspense fallback={<p className="text-ink-600">Loading…</p>}>
          <AdminContent />
        </Suspense>
      </Container>
    </section>
  );
}
