import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { ClientLayout } from "@/components/layout/ClientLayout";

// Claude.ai 의 UI 폰트 (Styrene B / Söhne) 는 라이선스 — 가장 가까운 free 대안인 Inter 사용.
// --font-geist-sans 변수명은 globals.css 에서 참조 중이라 유지.
const interSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dashboard",
  description: "AI Agent Dashboard for Tak, MD",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const demoMode = (await headers()).get("x-demo") === "1"
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light")return;document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}})()`,
          }}
        />
      </head>
      <body className={`${interSans.variable} antialiased bg-background text-foreground`}>
        <ClientLayout demoMode={demoMode}>{children}</ClientLayout>
      </body>
    </html>
  );
}
