import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DiNo — Nghe theo cách của bạn",
  description: "Không gian âm nhạc và sách nói của riêng bạn."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
