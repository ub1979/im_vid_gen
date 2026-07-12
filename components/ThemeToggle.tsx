"use client";
// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// ThemeToggle : sidebar-style dark/light theme toggle icon
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { useEffect, useState } from "react";
// =============================================================================

// =============================================================================
// Function toggles between dark and light themes -> void to JSX
// =============================================================================
export default function ThemeToggle() {
  /*
      ThemeToggle : sidebar icon button that switches dark/light theme
  */

  // =====================================
  // State
  // =====================================
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // =====================================
  // Initialize theme from localStorage
  // =====================================
  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    const initial = saved ?? "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  // =============================================================================
  // Function toggles the theme between dark and light -> void to void
  // =============================================================================
  function toggle() {
    /*
        toggle : switches theme and persists to localStorage
    */
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  // =====================================
  // Render
  // =====================================
  return (
    <button className="sb-item" onClick={toggle} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      {/* ==================================
          Theme icon
          ================================== */}
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
      <span className="sb-tip">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

// =============================================================================
// =============================================================================
