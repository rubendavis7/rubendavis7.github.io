import type { Metadata } from "next";
import { CalculatorSection } from "@/components/CalculatorSection";

export const metadata: Metadata = {
  title: "Funding calculator",
  description: "Estimate a funding amount and payment from your annual sales and time in business.",
};

export default function CalculatorPage() {
  return <CalculatorSection as="h1" />;
}
