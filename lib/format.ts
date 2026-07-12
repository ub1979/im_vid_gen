// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Format : utility functions for formatting values (time, etc.)
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Function formats seconds as M:SS -> number to string
// =============================================================================
export function formatTime(seconds: number): string {
  /*
      formatTime : converts total seconds into M:SS display format
      seconds variable : total seconds to format (e.g. 65 -> "1:05")
  */
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// =============================================================================
// =============================================================================
