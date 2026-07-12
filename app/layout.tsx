// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// RootLayout : app shell with sidebar navigation and content area
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import type { Metadata } from "next";
import "./globals.css";
import NavShell from "./NavShell";
// =============================================================================

// =====================================
// Metadata
// =====================================
export const metadata: Metadata = {
  title: "SU's Image Creator",
  description: "Generate character art and scene keyframes from text",
};

// =============================================================================
// Function renders root HTML layout with sidebar -> props to JSX
// =============================================================================
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /*
      RootLayout : app shell wrapping content with sidebar navigation
      children variable : page content rendered in the main area
  */
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <div className="app-shell">
          <NavShell />
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}

// =============================================================================
// =============================================================================
