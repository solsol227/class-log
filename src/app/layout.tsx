import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "클래스로그 | 수업 운영을 한곳에서",
  description:
    "일정, 출석, 보강, 피드백을 한곳에서 관리하는 모바일 우선 수업 운영 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
