"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

const links = [
  { href: "/", label: "Home" },
  { href: "/library", label: "Library" },
  { href: "/generate-character", label: "Generate Character" },
  { href: "/scene", label: "Generate Scene" },
  { href: "/generate-video", label: "Generate Video" },
  { href: "/projects", label: "Projects" },
  { href: "/reimagine", label: "Reimagine" },
  { href: "/settings", label: "Settings" },
];

export default function NavShell() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      <Link href="/" className="brand">SU&apos;s Image Creator</Link>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={pathname === l.href ? "active" : ""}
        >
          {l.label}
        </Link>
      ))}
      <span className="spacer" />
      <ThemeToggle />
    </nav>
  );
}
