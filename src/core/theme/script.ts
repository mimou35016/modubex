/**
 * Runs synchronously in the document head before first paint so the persisted
 * theme is reflected on `<html>` without a light-mode flash. Kept as a string
 * in a testable module; next-themes reconciles after hydration.
 */
export const themeInitScript = `(function () {
  try {
    var stored = window.localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark" ? stored : "system";
    var isDark = theme === "dark";
    if (theme === "system") {
      isDark = !!(
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      );
    }
    var root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
  } catch (error) {
    // Storage or media queries may be blocked; leave the DOM untouched.
  }
})();`;
