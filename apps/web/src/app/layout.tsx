import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "NOLT HR | Form library",
  description: "NOLT Finance employee lifecycle workspace",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
