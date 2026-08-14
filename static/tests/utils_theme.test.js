import { applyTheme, getStoredTheme } from "@planage/js/utils/theme";
import { afterEach, describe, expect, test } from "@odoo/hoot";

describe("theme utils", () => {
    afterEach(() => {
        document.body.classList.remove("dark-theme");
        localStorage.removeItem("planage-dark-theme");
    });

    test("applyTheme(true) adds the dark-theme class, persists it, and updates state", () => {
        const state = { isDark: false };
        applyTheme(state, true);

        expect(document.body.classList.contains("dark-theme")).toBe(true);
        expect(localStorage.getItem("planage-dark-theme")).toBe("true");
        expect(state.isDark).toBe(true);
    });

    test("applyTheme(false) removes the dark-theme class, persists it, and updates state", () => {
        document.body.classList.add("dark-theme");
        const state = { isDark: true };
        applyTheme(state, false);

        expect(document.body.classList.contains("dark-theme")).toBe(false);
        expect(localStorage.getItem("planage-dark-theme")).toBe("false");
        expect(state.isDark).toBe(false);
    });

    test("getStoredTheme reflects what applyTheme persisted", () => {
        expect(getStoredTheme()).toBe(false);
        applyTheme({}, true);
        expect(getStoredTheme()).toBe(true);
        applyTheme({}, false);
        expect(getStoredTheme()).toBe(false);
    });
});
