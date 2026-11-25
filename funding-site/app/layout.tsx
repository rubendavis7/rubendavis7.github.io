import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import { BRAND } from "@/lib/site-config";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} | Business funding`,
    template: `%s | ${BRAND.name}`,
  },
  description:
    "Working capital, term loans and lines of credit for small businesses. Estimate what you may qualify for and apply in three short steps.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#060d1a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-ink-950 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <Providers>
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
