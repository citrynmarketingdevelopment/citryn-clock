"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const EMOJIS = [
  "✅",
  "📅",
  "⏱️",
  "🏠",
  "📌",
  "✨",
  "🔥",
  "💡",
  "🎯",
  "📎",
  "🧾",
  "🍋",
  "🍇",
  "🍽️",
  "🧑‍🍳",
  "🛠️",
  "📦",
  "🚀",
  "💬",
  "⭐",
  "🌙",
  "☀️",
  "🧩",
  "📊",
];

const ICONS = ["✓", "□", "○", "◇", "⌂", "⌘", "∞", "＋", "↗", "≡", "⌁", "✦", "◐", "◌", "◈", "☰"];

function readStoredIcon(storageKey) {
  if (typeof window === "undefined" || !storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredIcon(storageKey, value) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    if (value) window.localStorage.setItem(storageKey, JSON.stringify(value));
    else window.localStorage.removeItem(storageKey);
  } catch {
    // localStorage can be unavailable in private modes; the picker still works for this session.
  }
}

function renderIcon(icon, fallback) {
  if (icon?.kind === "image" && icon.value) {
    return <span className="page-icon-image" style={{ backgroundImage: `url(${icon.value})` }} />;
  }
  return icon?.value || fallback || "◇";
}

export function PageIconBadge({ storageKey, fallback = "◇", className = "" }) {
  const [icon, setIcon] = useState(null);

  useEffect(() => {
    setIcon(readStoredIcon(storageKey));
    function onStorage(event) {
      if (event.key === storageKey) setIcon(readStoredIcon(storageKey));
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("citryn-page-icon", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("citryn-page-icon", onStorage);
    };
  }, [storageKey]);

  return <span className={`page-icon-badge ${className}`}>{renderIcon(icon, fallback)}</span>;
}

export default function PageIconPicker({ storageKey, fallback = "◇", label = "Page icon" }) {
  const [icon, setIcon] = useState(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("emojis");
  const fileInputRef = useRef(null);

  useEffect(() => {
    setIcon(readStoredIcon(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!event.target.closest?.(".page-icon-wrap")) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const tabs = useMemo(
    () => [
      { key: "emojis", label: "Emojis" },
      { key: "icons", label: "Icons" },
      { key: "upload", label: "Upload" },
    ],
    [],
  );

  function choose(next) {
    setIcon(next);
    saveStoredIcon(storageKey, next);
    window.dispatchEvent(new StorageEvent("citryn-page-icon", { key: storageKey }));
    setOpen(false);
  }

  function remove() {
    setIcon(null);
    saveStoredIcon(storageKey, null);
    window.dispatchEvent(new StorageEvent("citryn-page-icon", { key: storageKey }));
    setOpen(false);
  }

  function onUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => choose({ kind: "image", value: String(reader.result || "") });
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  return (
    <span className="page-icon-wrap">
      <button
        type="button"
        className="page-icon-trigger"
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        {renderIcon(icon, fallback)}
      </button>

      {open ? (
        <section className="page-icon-popover" aria-label="Choose page icon">
          <header className="page-icon-tabs">
            {tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                className={tab === item.key ? "active" : ""}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
            <button type="button" className="page-icon-remove" onClick={remove}>
              Remove
            </button>
          </header>

          {tab === "emojis" ? (
            <div className="page-icon-grid">
              {EMOJIS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => choose({ kind: "emoji", value: emoji })}>
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}

          {tab === "icons" ? (
            <div className="page-icon-grid page-icon-symbol-grid">
              {ICONS.map((symbol) => (
                <button key={symbol} type="button" onClick={() => choose({ kind: "icon", value: symbol })}>
                  {symbol}
                </button>
              ))}
            </div>
          ) : null}

          {tab === "upload" ? (
            <div className="page-icon-upload">
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                Choose image
              </button>
              <p>Use a small square image for the cleanest page icon.</p>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={onUpload} />
            </div>
          ) : null}
        </section>
      ) : null}
    </span>
  );
}
