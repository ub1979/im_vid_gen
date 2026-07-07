"use client";

import Link from "next/link";

const actions = [
  {
    href: "/library",
    title: "Character Library",
    description: "Browse, add, or remove characters from your library",
    icon: "📚",
  },
  {
    href: "/generate-character",
    title: "Generate Character",
    description: "Describe a character and AI will create an image for it",
    icon: "✨",
  },
  {
    href: "/scene",
    title: "Generate Scene",
    description: "Create images from your story, lyrics, or poem",
    icon: "🎬",
  },
  {
    href: "/projects",
    title: "Projects",
    description: "Load and edit your previous scene generations",
    icon: "📁",
  },
  {
    href: "/reimagine",
    title: "Style Transfer",
    description: "Upload images and reimagine them in a new style",
    icon: "🎨",
  },
];

export default function HomePage() {
  return (
    <div className="home">
      <h1 className="home-title">SU&apos;s Image Creator</h1>
      <p className="home-subtitle">
        Generate character art and scene keyframes from text
      </p>

      <div className="home-grid">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className="home-card">
            <span className="home-card-icon">{a.icon}</span>
            <h2>{a.title}</h2>
            <p>{a.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
