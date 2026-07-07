import type { ReactNode } from "react";

interface WorkspaceProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

export default function Workspace({ left, center, right }: WorkspaceProps) {
  return (
    <div className="layout">
      <div className="panel">{left}</div>
      <div className="panel">{center}</div>
      <div className="panel">{right}</div>
    </div>
  );
}
