/* tv-mode.js - D-pad (arrow key) navigation for Kids+ (additive).
 * Android TV WebViews deliver DPAD keys as Arrow and Enter keydown events.
 * Spatial nav: nearest visible candidate in the pressed direction, inside
 * the topmost active layer (sync panel > gear menu > current screen).
 * Enter/OK clicks. No change to pointer/touch behavior. */
(function () {
  "use strict";
  const RING = "kp-focus";
  let current = null;

  function layerRoot() {
    const home = document.querySelector(".kp-home");
    if (home) return home;
    const sp = document.getElementById("syncPanel");
    if (sp && !sp.hidden) return sp;
    const gm = document.getElementById("gearMenu");
    if (gm && !gm.hidden) return gm;
    const pin = document.getElementById("pin");
    if (pin && !pin.hidden) return pin;
    return document.body;
  }
  function candidates(root) {
    return [...root.querySelectorAll("button, input, a[href]")].filter((e) => {
      if (e.disabled || e.hidden) return false;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      let n = e;
      while (n) { if (n.hidden) return false; n = n.parentElement; }
      const cs = getComputedStyle(e);
      return cs.visibility !== "hidden" && cs.display !== "none";
    });
  }
  function center(r) { return [r.left + r.width / 2, r.top + r.height / 2]; }
  function setFocus(e) {
    if (current) current.classList.remove(RING);
    current = e;
    if (e) { e.classList.add(RING); e.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }
  function move(dir) {
    const root = layerRoot();
    const list = candidates(root);
    if (!list.length) return;
    if (!current || !list.includes(current)) {
      // On the profile picker, land on the first profile tile, not the topbar.
      const pref = list.find((e) => e.classList && e.classList.contains("p"));
      setFocus(pref || list[0]);
      return;
    }
    const cr = current.getBoundingClientRect();
    const [cx, cy] = center(cr);
    let best = null, bestScore = Infinity;
    for (const e of list) {
      if (e === current) continue;
      const r = e.getBoundingClientRect();
      const [ex, ey] = center(r);
      const dx = ex - cx, dy = ey - cy;
      let primary = 0, off = 0;
      if (dir === "left")  { if (dx >= -4) continue; primary = -dx; off = Math.abs(dy); }
      if (dir === "right") { if (dx <= 4)  continue; primary = dx;  off = Math.abs(dy); }
      if (dir === "up")    { if (dy >= -4) continue; primary = -dy; off = Math.abs(dx); }
      if (dir === "down")  { if (dy <= 4)  continue; primary = dy;  off = Math.abs(dx); }
      const score = primary + off * 2.2; // prefer aligned elements
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) setFocus(best);
  }
  const KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
  document.addEventListener("keydown", (e) => {
    if (KEYS[e.key]) {
      // let text inputs keep Left/Right for caret movement
      const a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
      e.preventDefault();
      move(KEYS[e.key]);
    } else if ((e.key === "Enter" || e.key === " ") && current && layerRoot().contains(current)) {
      e.preventDefault();
      current.click();
    } else if (e.key === "Escape" || e.key === "Backspace" || e.key === "GoBack" || e.keyCode === 461 /* TV back */) {
      const sp = document.getElementById("syncPanel");
      // A blocking sync panel (first-sync conflict chooser) must not be
      // dismissed by Back - the owner picks an option explicitly.
      if (sp && !sp.hidden && !sp.classList.contains("blocking")) { sp.hidden = true; e.preventDefault(); return; }
      if (sp && !sp.hidden) { e.preventDefault(); return; }
      const gm = document.getElementById("gearMenu");
      if (gm && !gm.hidden) { gm.hidden = true; e.preventDefault(); return; }
      const home = document.querySelector(".kp-home");
      if (home) { const b = home.querySelector(".kp-back"); if (b) b.click(); e.preventDefault(); return; }
      const bb = document.getElementById("backBtn");
      const pick = document.getElementById("scrPick");
      if (bb && pick && pick.hidden) { bb.click(); e.preventDefault(); }
    }
  }, true);
  // pointer use clears the ring
  document.addEventListener("pointerdown", () => setFocus(null), true);
})();
