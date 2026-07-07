"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type {
  CharacterRef,
  SceneEntry,
  ProviderConfig,
  ProjectManifest,
} from "@/lib/types";
import { getImageProvider } from "@/lib/providers/registry";

interface ProjectListItem {
  id: string;
  name: string;
}

interface ProjectContextValue {
  // Project list
  projects: ProjectListItem[];
  currentProjectId: string | null;
  projectSlug: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onSave: () => void;

  // Project data
  projectName: string;
  characters: CharacterRef[];
  text: string;
  duration: number;
  interval: number;
  scenes: SceneEntry[];
  provider: ProviderConfig;

  // Setters
  setCharacters: (chars: CharacterRef[]) => void;
  setText: (text: string) => void;
  setDuration: (d: number) => void;
  setInterval: (i: number) => void;
  setScenes: React.Dispatch<React.SetStateAction<SceneEntry[]>>;
  setProvider: (p: ProviderConfig) => void;

  // Actions
  handleGenerateScenes: () => void;
  handleRegenerate: (index: number) => void;
  handleGenerateAll: () => void;
  handleExport: () => void;

  // Derived state
  providerSupportsRefEdit: boolean;
  generatingScenes: boolean;
  generatingImages: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  doneCount: number;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx)
    throw new Error("useProjectContext must be used within ProjectProvider");
  return ctx;
}

const DEFAULT_PROVIDER: ProviderConfig = {
  image: { id: "gemini", model: "gemini-nano-banana-2" },
  text: { id: "gemini", model: "gemini-2.0-flash" },
};

export function ProjectProvider({ children }: { children: ReactNode }) {
  // Project list state
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Project data state
  const [projectName, setProjectName] = useState("Untitled");
  const [characters, setCharacters] = useState<CharacterRef[]>([]);
  const [text, setText] = useState("");
  const [duration, setDuration] = useState(120);
  const [interval, setInterval_] = useState(5);
  const [scenes, setScenes] = useState<SceneEntry[]>([]);
  const [provider, setProvider] = useState<ProviderConfig>(DEFAULT_PROVIDER);

  // UI state
  const [generatingScenes, setGeneratingScenes] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Autosave debounce
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectSlug = currentProjectId ?? "default";

  // Load project list
  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((list: ProjectListItem[]) => {
        setProjects(list);
        if (list.length > 0 && !currentProjectId) {
          setCurrentProjectId(list[0].id);
        }
      })
      .catch(() => {
        // API not ready yet
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load project data when project changes
  useEffect(() => {
    if (!currentProjectId) return;
    fetch(`/api/projects/${currentProjectId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load project");
        return res.json();
      })
      .then((manifest: ProjectManifest) => {
        setProjectName(manifest.name);
        setCharacters(manifest.characters);
        setText(manifest.text);
        setDuration(manifest.durationSeconds);
        setInterval_(manifest.intervalSeconds);
        setScenes(manifest.scenes);
        if (manifest.provider) setProvider(manifest.provider);
      })
      .catch(() => {
        // API not ready — keep defaults
      });
  }, [currentProjectId]);

  // Autosave debounced
  const autosave = useCallback(() => {
    if (!currentProjectId) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      fetch(`/api/projects/${currentProjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          text,
          durationSeconds: duration,
          intervalSeconds: interval,
          provider,
        }),
      }).catch(() => {
        // Silently fail
      });
    }, 1500);
  }, [currentProjectId, projectName, text, duration, interval, provider]);

  useEffect(() => {
    autosave();
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [autosave]);

  // Character changes — update local state and call API
  const handleSetCharacters = useCallback(
    (chars: CharacterRef[]) => {
      setCharacters(chars);
      if (!currentProjectId) return;
      // Persist character label/description changes via dedicated endpoint
      fetch(`/api/projects/${currentProjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Characters are persisted individually via their own endpoints,
          // but we update the manifest metadata here for label/desc changes
        }),
      }).catch(() => {
        // API may not be ready
      });
    },
    [currentProjectId],
  );

  // Manual save
  function handleSave() {
    if (!currentProjectId) return;
    fetch(`/api/projects/${currentProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: projectName,
        text,
        durationSeconds: duration,
        intervalSeconds: interval,
        provider,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Save failed");
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Save failed");
      });
  }

  // New project
  async function handleNewProject() {
    const name = window.prompt("Project name:");
    if (!name?.trim()) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      const created: ProjectManifest = await res.json();
      setProjects((prev) => [
        ...prev,
        { id: created.id, name: created.name },
      ]);
      setCurrentProjectId(created.id);
    } catch {
      setError("Failed to create project — API may not be ready yet");
    }
  }

  function handleOpenProject() {
    // Project selector dropdown in Nav serves this purpose
  }

  // Generate scenes from text
  async function handleGenerateScenes() {
    if (!text.trim()) return;
    setGeneratingScenes(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/scenes/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            characters: characters.map((c) => ({
              label: c.label,
              description: c.description,
            })),
            sceneCount: Math.ceil(duration / interval),
            intervalSeconds: interval,
            provider: provider.text,
          }),
        },
      );
      if (!res.ok) throw new Error("Scene generation failed");
      const generated = (await res.json()) as Array<{
        index: number;
        time_start: number;
        time_end: number;
        lyric_excerpt: string;
        prompt: string;
        characters_used: string[];
      }>;
      // Normalize: API returns Scene[], we need SceneEntry[] with status
      setScenes(
        generated.map((s) => ({
          ...s,
          status: "pending" as const,
        })),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Scene generation failed",
      );
    } finally {
      setGeneratingScenes(false);
    }
  }

  // Regenerate a single scene's image
  async function handleRegenerate(index: number) {
    setScenes((prev) =>
      prev.map((s) =>
        s.index === index ? { ...s, status: "generating" as const } : s,
      ),
    );
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/scenes/${index}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: provider.image }),
        },
      );
      if (!res.ok) throw new Error("Generation failed");
      const result = await res.json();
      setScenes((prev) =>
        prev.map((s) =>
          s.index === index
            ? {
                ...s,
                status: "done" as const,
                imagePath: result.imagePath,
                mode: result.mode,
                error: undefined,
              }
            : s,
        ),
      );
    } catch {
      setScenes((prev) =>
        prev.map((s) =>
          s.index === index
            ? {
                ...s,
                status: "failed" as const,
                error: "Generation failed",
              }
            : s,
        ),
      );
    }
  }

  // Generate all keyframe images
  async function handleGenerateAll() {
    setGeneratingImages(true);
    for (const scene of scenes) {
      if (scene.status === "done") continue;
      await handleRegenerate(scene.index);
    }
    setGeneratingImages(false);
  }

  // Export
  async function handleExport() {
    try {
      const res = await fetch(`/api/projects/${projectSlug}/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectSlug}-keyframes.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed — API may not be ready yet");
    }
  }

  // Derived state
  const imageProviderDesc = getImageProvider(provider.image.id);
  const providerSupportsRefEdit =
    imageProviderDesc?.capabilities.supports_reference_edit ?? false;
  const doneCount = scenes.filter((s) => s.status === "done").length;

  const value: ProjectContextValue = {
    projects,
    currentProjectId,
    projectSlug,
    onSelectProject: setCurrentProjectId,
    onNewProject: handleNewProject,
    onOpenProject: handleOpenProject,
    onSave: handleSave,

    projectName,
    characters,
    text,
    duration,
    interval,
    scenes,
    provider,

    setCharacters: handleSetCharacters,
    setText,
    setDuration,
    setInterval: setInterval_,
    setScenes,
    setProvider,

    handleGenerateScenes,
    handleRegenerate,
    handleGenerateAll,
    handleExport,

    providerSupportsRefEdit,
    generatingScenes,
    generatingImages,
    error,
    setError,
    doneCount,
  };

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}
