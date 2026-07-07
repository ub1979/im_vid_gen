"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { LibraryCharacter } from "@/lib/types";

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  characters: LibraryCharacter[];
  onMention?: (char: LibraryCharacter) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
}

export default function MentionTextarea({
  value,
  onChange,
  characters,
  onMention,
  placeholder,
  style,
  className,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState("");
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [selectedIdx, setSelectedIdx] = useState(0);
  const mentionStartRef = useRef<number | null>(null);

  const filtered = characters.filter((c) =>
    c.label.toLowerCase().includes(filter.toLowerCase()),
  );

  const insertMention = useCallback(
    (char: LibraryCharacter) => {
      const ta = textareaRef.current;
      if (!ta || mentionStartRef.current === null) return;

      const before = value.slice(0, mentionStartRef.current);
      const after = value.slice(ta.selectionStart);
      const mention = `@${char.label} `;
      const newValue = before + mention + after;
      onChange(newValue);
      onMention?.(char);

      setShowDropdown(false);
      setFilter("");
      mentionStartRef.current = null;

      requestAnimationFrame(() => {
        const pos = before.length + mention.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    },
    [value, onChange, onMention],
  );

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newVal = e.target.value;
    onChange(newVal);

    const cursorPos = e.target.selectionStart;
    const textBefore = newVal.slice(0, cursorPos);

    // Find the last @ that isn't preceded by a word char
    const atMatch = textBefore.match(/(^|[\s\n])@([^\s]*)$/);
    if (atMatch) {
      mentionStartRef.current = textBefore.lastIndexOf("@");
      const query = atMatch[2];
      setFilter(query);
      setSelectedIdx(0);
      setShowDropdown(true);
      updateDropdownPosition(e.target);
    } else {
      setShowDropdown(false);
      mentionStartRef.current = null;
    }
  }

  function updateDropdownPosition(ta: HTMLTextAreaElement) {
    const rect = ta.getBoundingClientRect();
    // Approximate position — place below the textarea at cursor line
    const lineHeight = 20;
    const textBefore = ta.value.slice(0, ta.selectionStart);
    const lines = textBefore.split("\n").length;
    const scrollTop = ta.scrollTop;

    setDropdownPos({
      top: Math.min(lines * lineHeight - scrollTop + 4, rect.height - 10),
      left: 8,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showDropdown || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filtered[selectedIdx]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      mentionStartRef.current = null;
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="mention-wrap">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={style}
        className={className}
      />
      {showDropdown && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="mention-dropdown"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {filtered.map((char, i) => (
            <div
              key={char.id}
              className={`mention-item ${i === selectedIdx ? "mention-active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(char);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              {char.imagePath ? (
                <img
                  src={`/api/library/${char.id}/image`}
                  alt={char.label}
                  className="mention-thumb"
                />
              ) : (
                <div className="mention-thumb mention-thumb-empty" />
              )}
              <div className="mention-info">
                <span className="mention-name">{char.label}</span>
                {char.description && (
                  <span className="mention-desc">{char.description}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!showDropdown && characters.length > 0 && (
        <div className="mention-hint">Type @ to insert a character from library</div>
      )}
    </div>
  );
}
