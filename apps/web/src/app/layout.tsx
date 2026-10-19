import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { brand } from "@/lib/brand";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth-provider";
import { WorkspaceQueryProvider } from "@/components/workspace-query-provider";
export const metadata: Metadata = {
  title: `${brand.name} ${brand.productName} | Employee workspace`,
  description: brand.description,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ "--primary": brand.primary } as CSSProperties}>
      <body className="min-h-screen antialiased">
        <WorkspaceQueryProvider><AuthProvider>{children}</AuthProvider></WorkspaceQueryProvider>
        <Toaster />
      </body>
    </html>
  );
}
