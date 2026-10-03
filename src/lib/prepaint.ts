/*
 * Runs in <head> while the HTML is still parsing, before the first paint:
 * 1. a stored "light" theme is applied, so a light-mode reader never sees a dark flash;
 * 2. `data-motion` marks the page when the reader allows motion. Only then do
 *    count-up numbers start hidden (globals.css), so a full page load never shows
 *    "16%" → "0%" → "16%". Without this script (no JS) nothing is hidden.
 * 3. a stored "comfortable" density replaces the server's `data-density="compact"`,
 *    so the page never draws compact first and then jumps (decision 0020).
 */
export const PREPAINT_SCRIPT = `(function(){var d=document.documentElement;try{if(localStorage.getItem("theme")==="light")d.classList.remove("dark")}catch(e){}try{if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches)d.setAttribute("data-motion","")}catch(e){}try{var n=localStorage.getItem("density");if(n==="compact"||n==="comfortable")d.setAttribute("data-density",n)}catch(e){}})()`;
