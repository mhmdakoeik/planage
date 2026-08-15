/** @odoo-module **/

const STORAGE_KEY = "planage-dark-theme";

/**
 * Single place that knows how to apply the dark/light theme: toggles the
 * body class, persists the choice, and updates the shared reactive state so
 * every component reads the same source of truth instead of each caller
 * juggling localStorage/classList/state independently.
 */
export function applyTheme(state, isDark) {
    document.body.classList.toggle("dark-theme", isDark);
    localStorage.setItem(STORAGE_KEY, isDark ? "true" : "false");
    state.isDark = isDark;
}

export function getStoredTheme() {
    return localStorage.getItem(STORAGE_KEY) === "true";
}
