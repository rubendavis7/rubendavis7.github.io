import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { BRAND, CONTACT } from "@/lib/site-config";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>By using this website you agree to these terms. If you do not agree, please do not use the site.</p>

      <h2>What this site is</h2>
      <p>
        This site describes funding products available through {BRAND.name} and its funding partners, and lets you
        send us a funding request. Nothing on this site is an offer, an approval or a commitment to fund.
      </p>

      <h2>The calculator</h2>
      <p>
        Calculator results are rough estimates for illustration. They are based only on the two figures you enter.
        Any real amount, factor rate, payment and timing are set after underwriting review of a complete
        application.
      </p>

      <h2>Your application</h2>
      <ul>
        <li>You confirm the details you submit are true and that you are authorized to act for the business.</li>
        <li>Submitting an application does not obligate you to accept funding, or us to provide it.</li>
        <li>We may share your application with funding partners and lenders to find you an offer.</li>
      </ul>

      <h2>No professional advice</h2>
      <p>
        Content on this site is general information, not financial, legal or tax advice. Talk to your own advisors
        before you sign a funding agreement.
      </p>

      <h2>Limits</h2>
      <p>
        This site is provided as is. To the extent the law allows, we are not liable for losses that come from
        using the site or relying on its estimates.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. The version posted here is the one in effect.</p>

      <h2>Contact</h2>
      <p>
        {BRAND.name} · {CONTACT.addressLines.join(", ")} · {CONTACT.phoneDisplay} · {CONTACT.email}
      </p>
    </LegalPage>
  );
}
