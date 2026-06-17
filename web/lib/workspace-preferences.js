"use client";

export const WORKSPACE_NAME_KEY = "citryn:workspace-name";
export const WORKSPACE_ICON_KEY = "citryn:workspace-icon";
export const APPEARANCE_THEME_KEY = "citryn:appearance-theme";

export const appearanceThemes = [
  { key: "midnight", label: "Midnight" },
  { key: "appflowy", label: "AppFlowy" },
];

function dispatchPreferenceEvent(key) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("citryn-preferences", { detail: { key } }));
}

export function readStoredValue(key, fallback = "") {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredValue(key, value) {
  if (typeof window === "undefined") return;
  try {
    if (value === null || value === undefined || value === "") {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, String(value));
    }
  } catch {
    return;
  }
  dispatchPreferenceEvent(key);
}

export function readWorkspaceName() {
  return readStoredValue(WORKSPACE_NAME_KEY, "My Workspace");
}

export function writeWorkspaceName(value) {
  writeStoredValue(WORKSPACE_NAME_KEY, value?.trim() || "My Workspace");
}

export function readAppearanceTheme() {
  const theme = readStoredValue(APPEARANCE_THEME_KEY, "midnight");
  return appearanceThemes.some((item) => item.key === theme) ? theme : "midnight";
}

export function applyAppearanceTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.citrynTheme = theme || "midnight";
}

export function writeAppearanceTheme(theme) {
  writeStoredValue(APPEARANCE_THEME_KEY, theme || "midnight");
  applyAppearanceTheme(theme || "midnight");
}
