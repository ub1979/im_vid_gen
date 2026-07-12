"use client";

// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// ProjectsPage : grid view of saved scene projects with rename and delete
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProjectManifest } from "@/lib/types";
// =============================================================================

// =============================================================================
// Function renders the projects listing page -> void to JSX
// =============================================================================
export default function ProjectsPage() {
  /*
      ProjectsPage : displays all saved scene projects in a card grid
  */

  // =====================================
  // State
  // =====================================
  const [projects, setProjects] = useState<ProjectManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // =====================================
  // Fetch projects on mount
  // =====================================
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: ProjectManifest[]) => {
        const sorted = data
          .filter((p) => p.scenes && p.scenes.length > 0)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setProjects(sorted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // =============================================================================
  // Function deletes a project after confirmation -> MouseEvent, ProjectManifest to void
  // =============================================================================
  async function handleDelete(e: React.MouseEvent, project: ProjectManifest) {
    /*
        handleDelete : deletes the given project after user confirms
        e variable : click event to prevent link navigation
        project variable : the project manifest to delete
    */
    e.preventDefault();
    e.stopPropagation();
    // ==================================
    if (!window.confirm(`Delete project '${project.name}'? This cannot be undone.`)) return;
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    // ==================================
    if (res.ok) {
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    }
  }

  // =============================================================================
  // Function enters rename mode for a project -> MouseEvent, ProjectManifest to void
  // =============================================================================
  function startRename(e: React.MouseEvent, project: ProjectManifest) {
    /*
        startRename : activates the inline rename input for a project card
        e variable : click event to prevent link navigation
        project variable : the project manifest to rename
    */
    e.preventDefault();
    e.stopPropagation();
    setRenamingId(project.id);
    setRenameValue(project.name);
  }

  // =============================================================================
  // Function submits the new name for a project -> string to void
  // =============================================================================
  async function submitRename(oldId: string) {
    /*
        submitRename : PATCHes the project with the new name
        oldId variable : the project id to rename
    */
    const trimmed = renameValue.trim();
    // ==================================
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    const res = await fetch(`/api/projects/${oldId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    // ==================================
    if (res.ok) {
      const updated: ProjectManifest = await res.json();
      setProjects((prev) =>
        prev.map((p) => (p.id === oldId ? updated : p)),
      );
    }
    setRenamingId(null);
  }

  // =============================================================================
  // Function cancels an active rename -> void to void
  // =============================================================================
  function cancelRename() {
    /*
        cancelRename : exits rename mode without saving
    */
    setRenamingId(null);
  }

  // =====================================
  // Shared icon button styles
  // =====================================
  const iconBtn: React.CSSProperties = {
    position: "absolute",
    zIndex: 2,
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.5)",
    color: "white",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.15s",
  };

  // ==================================
  // Loading state
  // ==================================
  // ==================================
  if (loading) {
    return (
      <div className="page page-center" style={{ padding: "60px 0" }}>
        <div className="spinner" />
      </div>
    );
  }

  // =====================================
  // Render
  // =====================================
  return (
    <div className="page">
      <h1>Projects</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Load a previous scene project to view, edit prompts, and regenerate images.
      </p>

      {/* ================================== */}
      {projects.length === 0 ? (
        <div className="page-center" style={{ padding: "40px 0" }}>
          <p className="muted">
            No scene projects yet. <Link href="/scene">Create one</Link>.
          </p>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => {
            const doneCount = p.scenes.filter((s) => s.status === "done").length;
            const firstDone = p.scenes.find((s) => s.status === "done" && s.imagePath);
            const isRenaming = renamingId === p.id;

            return (
              <Link
                key={p.id}
                href={`/scene?load=${p.id}`}
                className="project-card"
                style={{ position: "relative" }}
                onClick={(e) => { if (isRenaming) e.preventDefault(); }}
              >
                <button
                  onClick={(e) => startRename(e, p)}
                  title="Rename project"
                  style={{ ...iconBtn, top: 6, right: 36 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.5)")}
                >
                  ✎
                </button>
                <button
                  onClick={(e) => handleDelete(e, p)}
                  title="Delete project"
                  style={{ ...iconBtn, top: 6, right: 6 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--danger)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.5)")}
                >
                  ✕
                </button>
                {/* ================================== */}
                {firstDone ? (
                  <img
                    src={`/api/projects/${p.id}/keyframes/${firstDone.index}`}
                    alt={p.name}
                    className="project-card-img"
                  />
                ) : (
                  <div className="project-card-img project-card-placeholder">
                    No images
                  </div>
                )}
                <div className="project-card-info">
                  {/* ================================== */}
                  {isRenaming ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); submitRename(p.id); }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: "flex", gap: 4 }}
                    >
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") cancelRename(); }}
                        autoFocus
                        style={{ flex: 1, fontSize: 13, padding: "2px 6px" }}
                      />
                      <button type="submit" className="btn" style={{ fontSize: 11, padding: "2px 8px" }}>
                        OK
                      </button>
                    </form>
                  ) : (
                    <strong>{p.name}</strong>
                  )}
                  <span className="muted">
                    {doneCount}/{p.scenes.length} scenes
                  </span>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// =============================================================================
