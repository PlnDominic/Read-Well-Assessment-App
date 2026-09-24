import type { Metadata, Viewport } from "next";
import { Quicksand, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Read Well",
  description: "Grade 1 Reading Assessment",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Read Well",
  },
};

export const viewport: Viewport = {
  themeColor: "#6b8f71",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${quicksand.variable} ${nunitoSans.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
