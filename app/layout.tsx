import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Port-MIS 출항 확인",
  description: "해양수산부 선박운항정보 OpenAPI 기반 출항 확인",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
