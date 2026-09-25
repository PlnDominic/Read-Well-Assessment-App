import type { Metadata, Viewport } from "next";
import { Quicksand, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { SplashScreen } from "@/components/SplashScreen";

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
  title: "Read Well Assessment App",
  description: "Grade 1 Reading Assessment",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Read Well",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
};

// Applies a stored light/dark override (see ThemeToggle) before first paint,
// so switching themes doesn't flash the other theme on the next load. Runs
// inline rather than as a hydrated component because it has to execute
// before the CSS in globals.css takes effect.
const themeInitScript = `
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${quicksand.variable} ${nunitoSans.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegistrar />
        <SplashScreen />
      </body>
    </html>
  );
}
