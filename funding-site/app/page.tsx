import { CalculatorSection } from "@/components/CalculatorSection";
import { Hero } from "@/components/Hero";
import { ProductTabs } from "@/components/ProductTabs";
import { Qualification } from "@/components/Qualification";
import { Steps } from "@/components/Steps";
import { Testimonials } from "@/components/Testimonials";
import { ValueProps } from "@/components/ValueProps";

export default function HomePage() {
  return (
    <>
      <Hero />
      <ValueProps />
      <Qualification />
      <CalculatorSection />
      <div className="border-t border-ink-100" />
      <ProductTabs />
      <Testimonials />
      <Steps />
    </>
  );
}
