/* profile-entry.mock.js - mock streaming-feel profile entry (additive).
 *
 * User-verified concept (Ron's WhatsApp voice note 2026-11-07 00:08 IST):
 * entering a profile plays a cute, random visual that can FEEL like entering
 * a streaming app - "feel with, but be without": deliberately NOTHING behind
 * it (no playable series/videos). So this module provides the entry moment
 * plus a content-less placeholder "home" (gradient tiles, no real posters,
 * no third-party branding or trade dress). The composition is still shown
 * to Ron for taste sign-off via screenshots before release.
 *
 * Pure CSS/DOM, no dependencies. Drop-in: window.KPentry(profile, onDone).
 * Respects prefers-reduced-motion and TV (tiles are D-pad focusable).
 */

const ENTRY_EFFECTS = ["zoomPop", "slideCurtain", "confettiBurst", "rainbowWipe"];

/* Mirror the app's paintAv(), including the masked-head hero layer and the
 * never-blank fallback to the profile's bundled emoji art when a remote
 * image fails. Data is untouched - fallback is display-only. */
function paintMockAvatar(el, profile) {
  const iso = window.isIso && profile.web && window.isIso(profile.web) ? window.heroOf(profile.web) : null;
  if (profile.photo) el.style.backgroundImage = `url(${profile.photo})`;
  else if (iso) {
    window.heroLayer(el, iso);
    try {
      const im = new Image();
      im.onerror = () => {
        el.style.cssText = ""; el.innerHTML = "";
        el.style.background = profile.color || "#242428"; el.style.position = "relative";
        const s = document.createElement("span");
        s.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:42%;font-weight:700;color:#ffffff9c";
        s.textContent = (profile.name || "?").trim().charAt(0) || "?";
        el.appendChild(s);
      };
      im.src = iso.u;
    } catch (e) {}
  } else if (profile.web) {
    el.style.backgroundImage = `url("${profile.web}")`;
    el.style.backgroundPosition = profile.wo || "center 22%";
    if (profile.wz) el.style.backgroundSize = profile.wz + "%";
  } else {
    el.style.backgroundColor = profile.color || "#242428";
    el.style.backgroundImage = `url('avatars/${profile.emoji}.webp?v=2')`;
  }
}

export function playProfileEntry(profile, onDone) {
  const effect = ENTRY_EFFECTS[Math.floor(Math.random() * ENTRY_EFFECTS.length)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { onDone && onDone(); return; }

  const overlay = document.createElement("div");
  overlay.className = "kp-entry kp-entry-" + effect;
  overlay.style.setProperty("--kp-color", profile.color || "#242428");
  overlay.setAttribute("role", "presentation");

  const bubble = document.createElement("div");
  bubble.className = "kp-entry-avatar";
  paintMockAvatar(bubble, profile);
  overlay.appendChild(bubble);

  const label = document.createElement("div");
  label.className = "kp-entry-name";
  label.textContent = profile.name || "";
  overlay.appendChild(label);

  document.body.appendChild(overlay);
  overlay.addEventListener("animationend", () => {
    overlay.remove();
    onDone && onDone();
  }, { once: true });
}

/* Companion CSS (kp-entry.css, to be written once the effect set is approved):
 * .kp-entry        fixed inset-0 overlay in --kp-color, ~1.2s
 * .kp-entry-avatar profile avatar scales/spins in per effect
 * .kp-entry-name   profile name fades in below the avatar
 * Each ENTRY_EFFECTS value = one keyframe set. ~60 lines total.
 */

/* Mock home: placeholder rows only. Tiles show no real content and do
 * nothing when activated - the point is the FEELING of a streaming home. */
const MOCK_ROWS = {
  he: ["החברים שלך", "עוד דמויות"],
  en: ["Your friends", "More characters"],
};
/* Decorative tiles use the app's OWN bundled avatar art - recognizable and
 * playful, but they are not content: activating a tile does nothing. */
const TILE_ART = ["lion","unicorn","robot","bunny","dino","astrocat","fairy","fox","octopus","herogirl","knight","dragon"];

export function showMockHome(profile, onBack) {
  const lang = document.documentElement.lang === "en" ? "en" : "he";
  const home = document.createElement("div");
  home.className = "kp-home";
  const hero = document.createElement("div");
  hero.className = "kp-hero";
  hero.style.setProperty("--kp-color", profile.color || "#242428");
  const hav = document.createElement("div");
  hav.className = "kp-hero-av";
  paintMockAvatar(hav, profile);
  const h2 = document.createElement("h2");
  h2.textContent = (lang === "he" ? "שלום " : "Hi ") + (profile.name || "") + "!";
  hero.append(hav, h2);
  home.appendChild(hero);
  const sub = document.createElement("div");
  sub.className = "kp-home-sub";
  sub.textContent = lang === "he" ? "אין כאן תוכן אמיתי - רק הדמיה" : "No real content here - just a mock";
  home.appendChild(sub);
  MOCK_ROWS[lang].forEach((title, ri) => {
    const h = document.createElement("h3");
    h.textContent = title;
    home.appendChild(h);
    const row = document.createElement("div");
    row.className = "kp-row";
    for (let i = 0; i < 6; i++) {
      const tile = document.createElement("button");
      tile.className = "kp-tile";
      tile.style.backgroundImage = `url('avatars/${TILE_ART[(ri * 6 + i) % TILE_ART.length]}.webp?v=2')`;
      tile.onclick = () => {}; // intentionally inert: there is nothing to play
      row.appendChild(tile);
    }
    home.appendChild(row);
  });
  const back = document.createElement("button");
  back.className = "kp-back";
  back.textContent = lang === "he" ? "חזרה לפרופילים" : "Back to profiles";
  back.onclick = () => { home.remove(); onBack && onBack(); };
  home.appendChild(back);
  document.body.appendChild(home);
  return home;
}
