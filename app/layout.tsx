import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ClientLayout } from "@/components/layout/ClientLayout";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Spinoscopy Dashboard",
  description: "AI Agent Dashboard for Dr. Woon Tak Yuh",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className={`${geistSans.variable} antialiased bg-zinc-950 text-white`}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
