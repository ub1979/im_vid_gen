"use client";
// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Nav : horizontal navigation bar with project controls (legacy component)
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
// =============================================================================

// =============================================================================
/*
    NavProps : props for the navigation bar component
*/
// =============================================================================
interface NavProps {
  themeToggle: ReactNode;
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onSave?: () => void;
  projectList?: { id: string; name: string }[];
  currentProjectId?: string;
  onSelectProject?: (id: string) => void;
  showProjectControls?: boolean;
}

// =============================================================================
// Function renders horizontal navigation bar -> props to JSX
// =============================================================================
export default function Nav({
  themeToggle,
  onNewProject,
  onOpenProject,
  onSave,
  projectList,
  currentProjectId,
  onSelectProject,
  showProjectControls = true,
}: NavProps) {
  /*
      Nav : horizontal nav bar with links and project controls
      themeToggle variable : theme toggle button element
      onNewProject variable : callback to create new project
      onOpenProject variable : callback to open existing project
      onSave variable : callback to save current project
      projectList variable : list of available projects
      currentProjectId variable : currently selected project id
      onSelectProject variable : callback when project selection changes
      showProjectControls variable : whether to show project controls
  */
  const pathname = usePathname();

  // =====================================
  // Render
  // =====================================
  return (
    <nav className="nav">
      <span className="brand">image_creator</span>
      <Link href="/" className={pathname === "/" ? "active" : ""}>
        Workspace
      </Link>
      <Link
        href="/settings"
        className={pathname === "/settings" ? "active" : ""}
      >
        Settings
      </Link>
      <span className="spacer" />

      {/* ==================================
          Project selector dropdown
          ================================== */}
      {showProjectControls && projectList && projectList.length > 0 && (
        <select
          value={currentProjectId ?? ""}
          onChange={(e) => onSelectProject?.(e.target.value)}
          style={{
            background: "var(--s2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: "8px",
            padding: "5px 10px",
            fontSize: "12px",
          }}
        >
          {projectList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {/* ==================================
          Project action buttons
          ================================== */}
      {showProjectControls && (
        <>
          <button className="btn btn-sm btn-ghost" onClick={onNewProject}>
            New project
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onOpenProject}>
            Open project
          </button>
          <button className="btn btn-sm btn-primary" onClick={onSave}>
            Save
          </button>
        </>
      )}

      {themeToggle}
    </nav>
  );
}

// =============================================================================
// =============================================================================
