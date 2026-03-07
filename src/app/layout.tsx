import type { Metadata, Viewport } from "next";
import { Nunito, Plus_Jakarta_Sans } from "next/font/google";

import { AppProviders } from "@/app/providers/AppProviders";
import { APP_NAME } from "@/utils/constants";

import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Track shifts, holidays, and leave in weekly, monthly, and list views.",
  icons: {
    icon: "/main-logo.png",
    shortcut: "/main-logo.png",
    apple: "/main-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="theme-dark">
      <body className={`${plusJakarta.variable} ${nunito.variable} bg-slate-50 font-body text-slate-900 antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
