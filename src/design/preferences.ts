// Per-viewer display preferences (DS-9, DS-24). Stored in localStorage only as a convenience:
// the page renders correctly when storage is unavailable.
export type Theme = "system" | "light" | "dark" | "high-contrast";
export type Density = "compact" | "cozy" | "touch";

export interface DisplayPrefs {
  theme: Theme;
  density: Density;
  navCollapsed: boolean;
}

export const DEFAULT_PREFS: DisplayPrefs = { theme: "system", density: "cozy", navCollapsed: false };
const STORAGE_KEY = "erp.display";

export function readPrefs(): DisplayPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<DisplayPrefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(prefs: DisplayPrefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked or full: the choice still applies for this page view.
  }
}

// Applied to <html> before first paint by the inline script in app/layout.tsx.
export function applyTheme(theme: Theme, density: Density): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  root.setAttribute("data-density", density);
}

// Source for the pre-paint script. Must stay in sync with applyTheme and the storage key above.
export const PRE_PAINT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem("${STORAGE_KEY}")||"{}");var r=document.documentElement;if(p.theme&&p.theme!=="system")r.setAttribute("data-theme",p.theme);r.setAttribute("data-density",p.density||"${DEFAULT_PREFS.density}");}catch(e){document.documentElement.setAttribute("data-density","${DEFAULT_PREFS.density}");}})();`;
