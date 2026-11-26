/**
 * SITE CONFIG — brand, contact details and every piece of copy that carries a
 * number or a claim. Edit here; the pages follow.
 *
 * Anything not yet confirmed is marked [VERIFY]. While a group below is
 * `false` in VERIFIED, the site shows a visible [VERIFY] tag next to that
 * content. Confirm the content, flip the flag to `true`, and the tag goes away.
 */

export const VERIFIED = {
  /** Phone, email, mailing address. */
  contact: false,
  /** Minimum credit score / time in business / revenue / documents. */
  qualification: false,
  /** Product descriptions and example funded amounts. */
  products: false,
  /** Client testimonials. */
  testimonials: false,
  /** Any decision or response time ("24 hours"). */
  timing: false,
  /** Multipliers, factor rates and terms in lib/calculator.ts. */
  calculator: false,
  /** Company story on /about. */
  about: false,
} as const;

export type VerifyKey = keyof typeof VERIFIED;

export const BRAND = {
  name: "Delta Capital Group",
  shortName: "Delta Capital",
  tagline: "Straight answers on business funding.",
  /** Used in the ID customers see, e.g. DCG-7K2M9QXP. */
  idPrefix: "DCG",
} as const;

export const CONTACT = {
  /** [VERIFY] Shown in the header menu, footer and thank-you screen. */
  phoneDisplay: "[VERIFY — Phone]",
  /** [VERIFY] Digits only, with country code, for the tel: link. Leave "" until confirmed. */
  phoneHref: "",
  /** [VERIFY] */
  email: "[VERIFY — Email]",
  /** [VERIFY] Set to the real address to turn the footer email into a mailto: link. */
  emailHref: "",
  /** [VERIFY] Physical mailing address. */
  addressLines: ["[VERIFY — Street address]", "[VERIFY — City, State ZIP]"],
  /** [VERIFY] */
  hours: "[VERIFY — Business hours]",
} as const;

/** [VERIFY] How fast a specialist follows up, and how fast a decision usually comes. */
export const TIMING = {
  specialistResponse: "within 24 hours",
  decision: "24 hours",
} as const;

/** [VERIFY] Minimum criteria shown in the qualification grid. */
export const QUALIFICATION = [
  { value: "550+", label: "Credit score", note: "Lower scores can still be reviewed." },
  { value: "6+ months", label: "Time in business", note: "Open and taking deposits." },
  { value: "$15K+", label: "Monthly revenue", note: "Deposited into a business bank account." },
  { value: "3 months", label: "Business bank statements", note: "Most recent. Nothing else to start." },
] as const;

export type ProductId = "working-capital" | "term-loan" | "line-of-credit";

export interface Product {
  id: ProductId;
  tab: string;
  headline: string;
  description: string;
  bullets: string[];
  /** [VERIFY] Example only. Not a client result and not an offer. */
  exampleAmount: string;
  exampleLabel: string;
  finePrint: string;
}

/** [VERIFY] Confirm each product is offered, the wording, and the example amounts. */
export const PRODUCTS: readonly Product[] = [
  {
    id: "working-capital",
    tab: "Working Capital",
    headline: "Cash now, against sales you haven't made yet.",
    description:
      "A merchant cash advance. We purchase a portion of your future receivables at a discount and you get a lump sum up front. You remit a set share of sales, daily or weekly, until the purchased amount is delivered.",
    bullets: [
      "Priced with a factor rate you see up front",
      "Remittance comes out of your sales, daily or weekly",
      "Use it for payroll, inventory, repairs or a slow month",
    ],
    exampleAmount: "$50,000",
    exampleLabel: "Example advance",
    finePrint:
      "A merchant cash advance is a purchase of future receivables. It is not a loan and has no interest rate or APR.",
  },
  {
    id: "term-loan",
    tab: "Term Loan",
    headline: "A fixed amount, a fixed schedule.",
    description:
      "A business loan made through our lending partners. You borrow a set amount and pay it back on a set schedule. A fit when you know the cost of the project and want a clear end date.",
    bullets: [
      "Offered through third-party lending partners",
      "Fixed payment schedule",
      "Good for equipment, build-outs and expansion",
    ],
    exampleAmount: "$150,000",
    exampleLabel: "Example loan amount",
    finePrint:
      "Term loans are made by third-party lenders. Rates, terms and approval are set by the lender after underwriting.",
  },
  {
    id: "line-of-credit",
    tab: "Line of Credit",
    headline: "Draw what you need, when you need it.",
    description:
      "A revolving line through our lending partners. Draw up to your limit, pay it down and draw again. You only pay on what you use.",
    bullets: [
      "Offered through third-party lending partners",
      "Draw, repay and reuse",
      "Good for uneven cash flow and short gaps",
    ],
    exampleAmount: "$75,000",
    exampleLabel: "Example credit limit",
    finePrint:
      "Lines of credit are made by third-party lenders. Limits, rates and approval are set by the lender after underwriting.",
  },
];

export interface Testimonial {
  quote: string;
  name: string;
  detail: string;
}

/**
 * [VERIFY — replace before launch]
 * These are placeholders, not real clients. Replace each one with a real quote
 * you have written permission to publish, then set VERIFIED.testimonials = true.
 */
export const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote: "[VERIFY — replace before launch] Placeholder for a real client quote about how simple the application was.",
    name: "[Client name]",
    detail: "[Business type, City ST]",
  },
  {
    quote: "[VERIFY — replace before launch] Placeholder for a real client quote about talking to a real person.",
    name: "[Client name]",
    detail: "[Business type, City ST]",
  },
  {
    quote: "[VERIFY — replace before launch] Placeholder for a real client quote about seeing the full cost up front.",
    name: "[Client name]",
    detail: "[Business type, City ST]",
  },
];

export const INDUSTRIES = [
  "Restaurant / Food service",
  "Retail",
  "Construction / Trades",
  "Trucking / Logistics",
  "Auto repair / Dealership",
  "Health / Medical practice",
  "Beauty / Personal care",
  "Professional services",
  "Manufacturing / Wholesale",
  "E-commerce",
  "Hospitality / Lodging",
  "Other",
] as const;

export const USES_OF_FUNDS = [
  "Working capital / Cash flow",
  "Payroll",
  "Inventory",
  "Equipment",
  "Expansion / Renovation",
  "Marketing",
  "Taxes",
  "Pay off other balances",
  "Other",
] as const;

/** Limits for the "requested funding amount" field on the application. */
export const REQUEST_LIMITS = { min: 1_000, max: 5_000_000 } as const;

/**
 * TCPA consent wording. Bump the version whenever the text changes: the version
 * and the exact text are stored with every application as the consent record.
 * [VERIFY] Have counsel review this language before launch.
 */
export const CONSENT = {
  version: "2026-11-v1",
  text: `By checking this box, I agree that ${BRAND.name} and its funding partners may call and text me at the number I provided about my funding request, including with an automatic telephone dialing system or prerecorded voice. Consent is not a condition of applying or of any purchase. Message and data rates may apply. Reply STOP to opt out of texts.`,
} as const;

export const NAV_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/products", label: "Products" },
  { href: "/calculator", label: "Funding calculator" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact" },
  { href: "/apply", label: "Apply now" },
] as const;

/**
 * [VERIFY] About-page facts. Replace each placeholder with the real thing.
 * Don't publish this page with the placeholders still in it.
 */
export const ABOUT = {
  story: [
    "[VERIFY — Company story: when Delta Capital Group started, where you're based and who runs it.]",
    "[VERIFY — Who you fund: the kinds of businesses and industries you work with most.]",
  ],
} as const;

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
  { href: "/disclosures", label: "Disclosures" },
] as const;

/** Shown in the footer and on /disclosures. [VERIFY] Have counsel review. */
export const DISCLAIMERS = [
  `${BRAND.name} is not a bank. Working capital is provided as a merchant cash advance, which is a purchase of future receivables and not a loan. It does not carry an interest rate or APR.`,
  "Term loans and lines of credit are offered through third-party lending partners. The lender sets all rates, terms and approval decisions.",
  "Calculator results are estimates for illustration only. They are not an offer, an approval or a commitment to fund. Any amount, factor rate, payment and timing are set only after underwriting review of a complete application.",
  "Not all applicants will qualify. Products may not be available in all states.",
] as const;
