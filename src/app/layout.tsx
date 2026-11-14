import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import { getNearPrice } from "@/lib/price";
import { PriceProvider } from "@/components/price";
import { MotionRoot } from "@/components/motion";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], axes: ["opsz", "wdth"] });

export const metadata: Metadata = {
  title: "COMMONS · Buy together, pay less",
  description: "AI agents pool small-business orders into bulk deals, check every buyer's budget, and lock the agreement on NEAR.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const price = await getNearPrice();
  return (
    <html lang="en" className={`${geist.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <PriceProvider initial={price}>
          <MotionRoot>{children}</MotionRoot>
        </PriceProvider>
      </body>
    </html>
  );
}
