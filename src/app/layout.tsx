import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CVhelp",
  description: "A private workspace for tailored job applications."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
