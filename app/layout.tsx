import type { Metadata } from "next";
import "./globals.css";
import NavShell from "./NavShell";

export const metadata: Metadata = {
  title: "SU's Image Creator",
  description:
    "Generate character art and scene keyframes from text",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <NavShell />
        <main>{children}</main>
      </body>
    </html>
  );
}
