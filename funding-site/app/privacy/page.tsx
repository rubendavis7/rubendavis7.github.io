import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { BRAND, CONTACT } from "@/lib/site-config";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what {BRAND.name} (&quot;we&quot;, &quot;us&quot;) collects through this website, why we
        collect it and who we share it with.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Details you enter in the application: business name, industry, time in business, annual sales, the amount you want and what it is for.</li>
        <li>Your contact details: name, email and phone number.</li>
        <li>A record of your consent to be called or texted, with the date, time, IP address and browser type.</li>
        <li>Any feedback rating or comment you choose to leave.</li>
        <li>Documents you send us later, such as business bank statements.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To review your funding request and contact you about it.</li>
        <li>To match your request with a funding product or funding partner.</li>
        <li>To meet our legal and record-keeping obligations.</li>
        <li>To improve the application process.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We share application details with funding partners and lenders when needed to get you an offer, and with
        service providers that help us run this website and send notifications. We do not sell your personal
        information.
      </p>

      <h2>Calls and texts</h2>
      <p>
        If you gave consent on the application, we may call or text the number you provided about your request.
        Consent is not a condition of applying. Reply STOP to any text to opt out, or contact us using the details
        below.
      </p>

      <h2>Keeping it safe</h2>
      <p>
        We limit access to application data to the people who need it to work your file. No website can promise
        perfect security, so please do not send bank statements or other sensitive documents by regular email unless
        your specialist asks you to.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us what we hold about you, ask us to correct it, or ask us to delete it, subject to records we
        are required to keep. Depending on your state, you may have additional rights.
      </p>

      <h2>Contact</h2>
      <p>
        {BRAND.name}
        <br />
        {CONTACT.addressLines.join(", ")}
        <br />
        {CONTACT.phoneDisplay} · {CONTACT.email}
      </p>
    </LegalPage>
  );
}
