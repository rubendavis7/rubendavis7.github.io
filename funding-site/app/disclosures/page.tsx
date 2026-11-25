import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { BRAND, CONSENT, DISCLAIMERS } from "@/lib/site-config";

export const metadata: Metadata = { title: "Disclosures" };

export default function DisclosuresPage() {
  return (
    <LegalPage title="Disclosures">
      <h2>About our products</h2>
      <ul>
        {DISCLAIMERS.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      <h2>Merchant cash advance</h2>
      <p>
        In a merchant cash advance, {BRAND.name} or a funding partner buys a set amount of your business&apos;s
        future receivables at a discount. You deliver that amount through a share of your sales, remitted daily or
        weekly. Because remittance follows your sales, there is no fixed term. The cost is expressed as a factor
        rate. It is not a loan and has no interest rate or APR.
      </p>

      <h2>Examples on this site</h2>
      <p>
        Dollar amounts, factor rates and timeframes shown on this site are examples. They are not typical results,
        client outcomes or offers. Your terms depend on underwriting.
      </p>

      <h2>Testimonials</h2>
      <p>Testimonials reflect individual experiences. They do not promise that you will qualify or get the same terms.</p>

      <h2>Call and text consent</h2>
      <p>The application asks for this consent:</p>
      <blockquote className="border-l-4 border-ink-200 pl-4 text-sm">{CONSENT.text}</blockquote>

      <h2>State notices</h2>
      <p>
        [VERIFY] Add any state-specific commercial financing disclosures and licensing statements that apply to
        where you do business.
      </p>
    </LegalPage>
  );
}
