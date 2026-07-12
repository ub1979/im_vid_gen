// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Workspace : three-panel layout container for left, center, right sections
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import type { ReactNode } from "react";
// =============================================================================

// =============================================================================
/*
    WorkspaceProps : props for the workspace layout component
*/
// =============================================================================
interface WorkspaceProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

// =============================================================================
// Function renders three-panel workspace layout -> props to JSX
// =============================================================================
export default function Workspace({ left, center, right }: WorkspaceProps) {
  /*
      Workspace : three-column grid layout for panels
      left variable : left panel content
      center variable : center panel content
      right variable : right panel content
  */
  return (
    <div className="layout">
      <div className="panel">{left}</div>
      <div className="panel">{center}</div>
      <div className="panel">{right}</div>
    </div>
  );
}

// =============================================================================
// =============================================================================
