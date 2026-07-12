"use client";

// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// SettingsPage : redirect stub. Settings are now in the sidebar drawer.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { useEffect } from "react";
import { useRouter } from "next/navigation";
// =============================================================================

// =============================================================================
// Function renders the settings redirect page -> void to JSX
// =============================================================================
export default function SettingsPage() {
  /*
      SettingsPage : redirects to dashboard since settings moved to sidebar drawer
  */

  const router = useRouter();

  // =====================================
  // Redirect to dashboard on mount
  // =====================================
  useEffect(() => {
    router.replace("/");
  }, [router]);

  // =====================================
  // Render
  // =====================================
  return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)" }}>
      <p>Settings have moved to the sidebar gear icon.</p>
      <p style={{ fontSize: 12, marginTop: 8 }}>Redirecting to dashboard...</p>
    </div>
  );
}

// =============================================================================
// =============================================================================
