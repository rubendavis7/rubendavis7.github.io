import type { Metadata } from "next";
import { Suspense } from "react";
import { ApplyForm } from "@/components/apply/ApplyForm";
import { Container } from "@/components/ui";
import { MAX_ANNUAL_SALES, isTibId } from "@/lib/calculator";

export const metadata: Metadata = {
  title: "Apply",
  description: "Apply for business funding in three short steps. Documents can come later.",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads ?sales= and ?tib= from the calculator hand-off and pre-fills the form. */
async function PrefilledForm({ searchParams }: Pick<PageProps<"/apply">, "searchParams">) {
  const params = await searchParams;
  const tib = first(params.tib);
  const salesText = first(params.sales);
  const sales = salesText && /^\d{1,9}$/.test(salesText) ? Math.min(Number(salesText), MAX_ANNUAL_SALES) : undefined;
  return <ApplyForm initialTib={isTibId(tib) ? tib : undefined} initialSales={sales} />;
}

function FormSkeleton() {
  return (
    <div className="mx-auto max-w-xl" aria-busy="true" aria-label="Loading application">
      <div className="h-1.5 rounded-full bg-ink-100" />
      <div className="mt-12 h-[420px] animate-pulse rounded-3xl bg-ink-50" />
    </div>
  );
}

export default function ApplyPage({ searchParams }: PageProps<"/apply">) {
  return (
    <section className="py-10 sm:py-16">
      <Container>
        <Suspense fallback={<FormSkeleton />}>
          <PrefilledForm searchParams={searchParams} />
        </Suspense>
      </Container>
    </section>
  );
}
