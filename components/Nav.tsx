"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
  const pathname = usePathname();

  return (
    <nav className="nav">
      <span className="brand">🎬 image_creator</span>
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

      {showProjectControls && projectList && projectList.length > 0 && (
        <select
          value={currentProjectId ?? ""}
          onChange={(e) => onSelectProject?.(e.target.value)}
          style={{
            background: "var(--surface-2)",
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
