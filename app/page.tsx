"use client";

// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Dashboard : home page with quick actions and recent projects grid
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectManifest } from "@/lib/types";
// =============================================================================

// =============================================================================
// Function renders the dashboard page -> void to JSX
// =============================================================================
export default function Dashboard() {
  /*
      Dashboard : main landing page with quick-action cards and recent projects
  */

  // =====================================
  // State
  // =====================================
  const [projects, setProjects] = useState<ProjectManifest[]>([]);

  // =====================================
  // Fetch recent projects on mount
  // =====================================
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: ProjectManifest[]) => {
        const sorted = data
          .filter((p) => p.scenes && p.scenes.length > 0)
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
        setProjects(sorted.slice(0, 4));
      })
      .catch(() => {});
  }, []);

  // =====================================
  // Render
  // =====================================
  return (
    <div className="dash-view">
      <h1 className="dash-greeting">
        <em>SU&apos;s Image Creator</em>
      </h1>
      <p className="dash-sub">
        Generate characters, scenes, and videos from text
      </p>

      {/* ── Quick actions ── */}
      <div className="dash-section">
        <div className="dash-section-head">Quick Actions</div>
        <div className="quick-actions">
          <Link href="/generate-video" className="qa-card">
            <div className="qa-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
            <h3>Generate Video</h3>
            <p>Animate frames with AI video models</p>
          </Link>

          <Link href="/scene" className="qa-card">
            <div className="qa-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </div>
            <h3>Generate Scene</h3>
            <p>Create keyframes from stories or lyrics</p>
          </Link>

          <Link href="/generate-character" className="qa-card">
            <div className="qa-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" />
                <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
              </svg>
            </div>
            <h3>New Character</h3>
            <p>Describe or extract from an image</p>
          </Link>

          <Link href="/reimagine" className="qa-card">
            <div className="qa-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2" />
              </svg>
            </div>
            <h3>Reimagine</h3>
            <p>Transfer styles between images</p>
          </Link>
        </div>
      </div>

      {/* ── Recent projects ── */}
      {/* ==================================  */}
      {projects.length > 0 && (
        <div className="dash-section">
          <div className="dash-section-head">Recent Projects</div>
          <div className="recent-grid">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/scene?load=${p.id}`}
                className="recent-card"
              >
                {/* ================================== */}
                {p.scenes?.find((s) => s.imagePath) ? (
                  <img
                    src={`/api/projects/${p.id}/keyframes/${p.scenes.findIndex((s) => s.imagePath)}`}
                    alt={p.name}
                    className="recent-card-img"
                  />
                ) : (
                  <div className="recent-card-img recent-card-placeholder">
                    No preview
                  </div>
                )}
                <div className="recent-card-info">
                  <strong>{p.name}</strong>
                  <span>
                    {p.scenes?.length || 0} scene
                    {(p.scenes?.length || 0) !== 1 ? "s" : ""}
                    {" · "}
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// =============================================================================
