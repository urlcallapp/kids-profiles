/* sync.js - OPTIONAL cloud sync layer for Kids+ (proposal draft v6, NOT yet
 * wired into index.html). Security-reviewed on the Firebase Emulator Suite;
 * see TESTING.md / test-sync.mjs.
 *
 * v6 changes (browser-E2E findings):
 *  - Pairing is persisted (kidsProfiles.owner = {deviceUid, ownerUid}) so a
 *    TV keeps its pairing across restarts; restored only when the signed-in
 *    user is the same device. A revoke during downtime is caught on the
 *    next listen (permission-denied) and the persisted pairing + on-disk
 *    cloud cache are both wiped - a revoked device retains no local copy.
 *  - unpairThisDevice() also wipes the persisted pairing and cloud cache.
 *
 * v5 changes (from security review, revocation hardening):
 *  - Every profile doc carries devices[] (owner-maintained replica of the
 *    parent list), and a paired device's reads use a QUERY CONSTRAINT
 *    where('devices','array-contains', deviceUid): Firestore rules are not
 *    filters, so a data-dependent rule on a plain collection LIST is
 *    unprovable and denied (emulator-verified). With the constraint, access
 *    is provable AND revocation is doubly hard server-side: revoked docs
 *    leave the query result set (listener emits empty, fresh reads return
 *    nothing) and the settings doc listener errors permission-denied the
 *    moment the revoke batch lands (emulator-verified). Separately, the
 *    client ALSO clears itself on permission-denied (unsubscribe, drop
 *    rendered cloud state, onRemoteState(null)) - cooperative UI removal,
 *    NOT the security boundary.
 *  - Photo restricted to base64 png/jpeg/webp data URLs (no SVG); web URLs
 *    restricted to a conservative charset (untrusted-input/XSS hardening).
 *
 * v4 changes (from security review):
 *  - Profiles live in a per-profile subcollection so firestore.rules can
 *    validate EVERY profile field server-side (rules cannot iterate list
 *    items, so the old single-doc model could not). Per-profile docs also
 *    mean per-profile last-write-wins instead of whole-doc.
 *  - Remote state is NEVER written to the base localStorage keys. The base
 *    keys (kidsProfiles.v2/.gallery/.lang) stay the device's own signed-out
 *    data; signed-in state is cached per-account (kidsProfiles.cloud.<uid>).
 *    Sign-out or account switch therefore cannot leak or overwrite the local
 *    data or the previous account's profiles.
 *  - First sign-in with existing cloud data: cloud wins for the UI, but the
 *    device's local profiles are first backed up (kidsProfiles.localBackup)
 *    and api.useLocalInstead() lets the UI offer "keep this device's
 *    profiles" - no silent overwrite in either direction.
 *
 * Reversibility: signed out (or empty firebaseConfig in the integration
 * bootstrap) = today's localStorage behavior, byte-for-byte.
 *
 * No build step: Firebase v10+ modular SDK from CDN, matching the repo's
 * single-file style. Pin the exact SDK version at integration time.
 *
 * Data model:
 *   users/{uid}                    { gallery, lang, devices:[deviceUid,...], updatedAt }
 *   users/{uid}/profiles/{pid}     { id:int, name, emoji, color, photo|null,
 *                                    web|null, wo|null, wz|null, updatedAt }
 *   pairCodes/{code}               { deviceUid, ownerUid:null|uid, createdAt, expiresAt }
 *   deviceRegistrations/{deviceUid} { code, ownerUid, createdAt, label }
 *
 * TV pairing (why: Google blocks OAuth inside embedded WebViews with
 * disallowed_useragent, and Android TV has no system browser for Custom Tabs,
 * so the TV cannot do a normal Google sign-in. Firebase has no automatic
 * device-code product - this flow is custom but fully client-side, no Cloud
 * Functions, fits the free Spark plan):
 *   1. TV: signInAnonymously -> deviceUid; shows 6-char code; creates
 *      pairCodes/{code} and watches it.
 *   2. Phone (owner): types the code; approveTvCode() does a BLIND write of
 *      ownerUid (rules let the phone update but not read codes - no
 *      enumeration oracle). Rules enforce: unexpired, unused, ownerUid==self.
 *   3. TV sees ownerUid, registers deviceRegistrations/{deviceUid} (rules
 *      verify via the pairCode), waits for access.
 *   4. Phone's pending-device listener surfaces "Approve this TV?"; owner
 *      confirms -> confirmPairedDevice() adds deviceUid to devices[].
 *   Revocation: revokeTvDevice() removes deviceUid; the TV's anonymous
 *   credential remains but rules grant it nothing.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  signInAnonymously, signOut as fbSignOut,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot,
  collection, query, where, writeBatch, updateDoc, arrayUnion, arrayRemove,
  serverTimestamp, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const LS = {
  profiles: "kidsProfiles.v2",
  gallery: "kidsProfiles.gallery",
  lang: "kidsProfiles.lang",
  backup: "kidsProfiles.localBackup",
  owner: "kidsProfiles.owner", // persisted pairing: {deviceUid, ownerUid}
};
const PAIR_TTL_MS = 10 * 60 * 1000;
const ACCESS_POLL_MS = 5000;

let app, auth, db, uid = null, ownerUid = null;
let unsubSettings = null, unsubProfiles = null, onRemoteState = null;
let curSettings = null, curProfiles = null; // latest cloud snapshots

export function initSync(firebaseConfig, { onRemoteState: cb, appName } = {}) {
  app = appName ? initializeApp(firebaseConfig, appName) : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  onRemoteState = cb || null;
  // Local emulator for development/testing (see TESTING.md):
  // Dev only: plain-http local servers. The Android WebView serves assets
  // from https://localhost, so protocol gates the emulator (not hostname).
  if (location.protocol === "http:" && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
  }
  onAuthStateChanged(auth, (u) => {
    const newUid = u ? u.uid : null;
    if (newUid === uid) return;
    uid = newUid;
    ownerUid = null;
    curSettings = curProfiles = null;
    // Restore a persisted pairing (TV restart): only when the signed-in
    // user IS the device that paired. If the owner revoked meanwhile, the
    // resubscribe below errors permission-denied and clears it.
    if (uid) {
      try {
        const saved = JSON.parse(localStorage.getItem(LS.owner) || "null");
        if (saved && saved.deviceUid === uid && saved.ownerUid) ownerUid = saved.ownerUid;
      } catch (e) {}
    }
    resubscribe();
    if (!uid && onRemoteState) onRemoteState(null); // signed out: app falls back to base localStorage
  });
  return api;
}

/* ---------- local state bridge ---------- */

function readLocal() {
  let profiles = null;
  try { profiles = JSON.parse(localStorage.getItem(LS.profiles) || "null"); } catch (e) {}
  return {
    profiles,
    gallery: localStorage.getItem(LS.gallery),
    lang: localStorage.getItem(LS.lang),
  };
}

/* Signed-in state cache is PER ACCOUNT, never the base keys. */
function cacheKey() { return "kidsProfiles.cloud." + (ownerUid || uid); }
function writeCache(state) {
  try { localStorage.setItem(cacheKey(), JSON.stringify(state)); } catch (e) {}
}

function settingsRef() { return doc(db, "users", ownerUid || uid); }
function profilesRef() { return collection(db, "users", ownerUid || uid, "profiles"); }
/* Rules are not filters: a paired device must CONSTRAIN its profile reads to
 * docs listing its uid, or the data-dependent rule is unprovable and the
 * whole query is denied. The owner reads unconstrained (isOwner is provable
 * from the path). The constraint is also what makes revocation cut the
 * stream server-side: revoked docs simply leave the result set. */
function profilesQuery() {
  return ownerUid
    ? query(profilesRef(), where("devices", "array-contains", uid))
    : profilesRef();
}

function emit() {
  if (curSettings === null && curProfiles === null) return;
  const state = {
    profiles: curProfiles || [],
    gallery: curSettings ? curSettings.gallery : null,
    lang: curSettings ? curSettings.lang : null,
    // complete = both snapshots arrived; the app holds the local view until
    // then, so cloud data never flashes/replaces the picker half-loaded.
    complete: curSettings !== null && curProfiles !== null,
  };
  writeCache(state);
  // Reconcile the local backup BEFORE notifying the app: the hold-and-ask
  // check in onRemoteState keys off hasLocalBackup(), so it must already
  // reflect this cloud state when the callback runs.
  if (curSettings !== null && curProfiles !== null) reconcileLocalBackup();
  if (onRemoteState) onRemoteState(state);
}

/* Keep kidsProfiles.localBackup an accurate answer to "does this device's
 * signed-out data differ from the cloud?". Evaluated only once BOTH cloud
 * snapshots have arrived (backing up against a not-yet-loaded cloud would
 * stash a bogus duplicate of identical data, and the old once-only backup
 * then went stale forever). While they differ the backup mirrors CURRENT
 * local data; once they match again the backup is dropped. Base keys are
 * never touched, so the device's data survives regardless. */
function reconcileLocalBackup() {
  try {
    const local = readLocal();
    // Compare only the synced fields: a device-local lock never leaves the
    // device (normalizeProfile drops it), so it must not count as a diff.
    const norm = (p) => ({ id: p.id, name: p.name, emoji: p.emoji, color: p.color, photo: p.photo || null, web: p.web || null, wo: p.wo || null, wz: p.wz || null });
    const same = (a, b) => a.name === b.name && a.emoji === b.emoji && a.color === b.color && a.photo === b.photo && a.web === b.web && a.wo === b.wo && a.wz === b.wz;
    const lp = local.profiles && local.profiles.length ? local.profiles.map(norm) : null;
    if (!lp) { localStorage.removeItem(LS.backup); return; }
    // A conflict exists only while some device profile is NOT already in the
    // cloud. After a merge/replace every local profile is, so the backup
    // clears itself instead of prompting again on the next sign-in.
    const cp = (curProfiles || []).map(norm);
    const missing = lp.some((l) => !cp.some((c) => same(l, c)));
    if (!missing) {
      localStorage.removeItem(LS.backup);
      return;
    }
    const s = JSON.stringify(local);
    if (localStorage.getItem(LS.backup) !== s) localStorage.setItem(LS.backup, s);
  } catch (e) {}
}

function resubscribe() {
  if (unsubSettings) { unsubSettings(); unsubSettings = null; }
  if (unsubProfiles) { unsubProfiles(); unsubProfiles = null; }
  if (!uid) return;
  let seeded = false;
  unsubSettings = onSnapshot(settingsRef(), (snap) => {
    if (!snap.exists() && !ownerUid) {
      // First ever sign-in on this account: seed cloud from THIS device's
      // local state. (Only the owner seeds; a paired TV never does.)
      if (!seeded) { seeded = true; pushState(readLocal()).catch((e) => console.warn("sync seed failed", e)); }
      return;
    }
    curSettings = snap.exists() ? snap.data() : null;
    emit();
  }, handleListenerError); // permission-denied: awaiting confirm / revoked
  unsubProfiles = onSnapshot(profilesQuery(), (snap) => {
    curProfiles = snap.docs.map((d) => {
      const p = d.data();
      return { id: p.id, name: p.name, emoji: p.emoji, color: p.color, photo: p.photo, web: p.web, wo: p.wo, wz: p.wz };
    });
    emit();
  }, handleListenerError);
}

/* Cooperative removal on revoked access: unsubscribe, drop cloud state from
 * the screen, hand the app back to local data. This is UX hygiene, NOT the
 * security boundary - the server-side rule cut (devices[] inside the docs)
 * is what actually stops the data flow. */
function handleListenerError(err) {
  if (!err || err.code !== "permission-denied") return;
  if (unsubSettings) { unsubSettings(); unsubSettings = null; }
  if (unsubProfiles) { unsubProfiles(); unsubProfiles = null; }
  // Revoked while paired: forget the pairing AND drop the on-disk cloud
  // cache, so a revoked device keeps no copy of the owner's data.
  try { localStorage.removeItem(LS.owner); localStorage.removeItem(cacheKey()); } catch (e) {}
  ownerUid = null;
  curSettings = curProfiles = null;
  if (onRemoteState) onRemoteState(null);
}



/* Rules require the full normalized key set on every profile write,
 * including the devices[] replica (must equal the parent's current list). */
function currentDevices() { return (curSettings && curSettings.devices) || []; }
function normalizeProfile(p) {
  return {
    id: p.id, name: String(p.name || "").slice(0, 40), emoji: p.emoji || "lion",
    color: p.color || "#242428",
    photo: p.photo || null, web: p.web || null, wo: p.wo || null, wz: p.wz || null,
    devices: currentDevices(),
    updatedAt: serverTimestamp(),
  };
}

/* Replace the app's save() path with: save(); pushState({profiles: ps, gallery, lang}) */
export async function pushState(state) {
  if (!uid) return; // signed out: localStorage only, today's behavior
  // settings first: profile-create rules require the parent doc to exist
  await setDoc(settingsRef(), {
    gallery: state.gallery || "builtin",
    lang: state.lang || "he",
    updatedAt: serverTimestamp(),
  }, { merge: true }); // merge: never touches devices[]
  const batch = writeBatch(db);
  const profiles = Array.isArray(state.profiles) ? state.profiles.slice(0, 50) : [];
  const incoming = new Set(profiles.map((p) => String(p.id)));
  const existing = await getDocs(profilesQuery());
  existing.forEach((d) => { if (!incoming.has(d.id)) batch.delete(d.ref); });
  profiles.forEach((p) => batch.set(doc(profilesRef(), String(p.id)), normalizeProfile(p)));
  await batch.commit();
}

/* Conflict escape hatch: overwrite cloud with this device's backed-up local
 * state (the UI offers this after first sign-in when both exist). */
export function hasLocalBackup() { return !!localStorage.getItem(LS.backup); }
export async function useLocalInstead() {
  const raw = localStorage.getItem(LS.backup);
  if (!raw) return false;
  let state;
  try { state = JSON.parse(raw); } catch (e) { return false; }
  await pushState(state);
  localStorage.removeItem(LS.backup);
  return true;
}

/* What the backup holds, for the chooser UI (names only; no data leaves the
 * device until the owner picks merge/replace). */
export function getLocalBackupInfo() {
  const raw = localStorage.getItem(LS.backup);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    const profiles = Array.isArray(s.profiles) ? s.profiles : [];
    return { count: profiles.length, names: profiles.map((p) => String(p.name || "?")).slice(0, 20) };
  } catch (e) { return null; }
}

/* Names currently in the cloud (null until the first snapshot arrives). */
export function cloudProfileNames() {
  return curProfiles ? curProfiles.map((p) => String(p.name || "?")) : null;
}

function sameSyncedProfile(a, b) {
  return a.name === b.name && a.emoji === b.emoji && a.color === b.color &&
    (a.photo || null) === (b.photo || null) && (a.web || null) === (b.web || null);
}

/* Merge the backed-up device profiles INTO the cloud: cloud profiles stay,
 * device-only profiles are added, and a profile whose id collides with a
 * different cloud profile is kept under a fresh id - nothing on either side
 * is lost. Reads use profilesQuery() so a paired TV (constrained reads) can
 * merge too. Fresh server reads, no reliance on listener timing. */
export async function mergeLocalInstead() {
  const raw = localStorage.getItem(LS.backup);
  if (!raw) return false;
  let local;
  try { local = JSON.parse(raw); } catch (e) { return false; }
  const localProfiles = Array.isArray(local.profiles) ? local.profiles : [];
  const snap = await getDocs(profilesQuery());
  const cloudProfiles = snap.docs.map((d) => d.data());
  const byId = new Map(cloudProfiles.map((p) => [String(p.id), p]));
  const merged = cloudProfiles.map((p) => ({
    id: p.id, name: p.name, emoji: p.emoji, color: p.color,
    photo: p.photo || null, web: p.web || null, wo: p.wo || null, wz: p.wz || null,
  }));
  let nextId = Math.max(Date.now(), 0, ...merged.map((p) => Number(p.id) || 0)) + 1;
  for (const lp of localProfiles) {
    const existing = byId.get(String(lp.id));
    if (!existing) { merged.push(lp); byId.set(String(lp.id), lp); continue; }
    if (sameSyncedProfile(existing, lp)) continue; // identical on both sides
    merged.push({ ...lp, id: nextId++ }); // id collision, different content: keep both
  }
  const sdoc = await getDoc(settingsRef());
  const cs = sdoc.exists() ? sdoc.data() : {};
  await pushState({ profiles: merged, gallery: cs.gallery ?? local.gallery, lang: cs.lang ?? local.lang });
  localStorage.removeItem(LS.backup);
  return true;
}

/* ---------- phone sign-in (Google or email link - both free on Spark) ---------- */

export async function signInWithGoogle() {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function sendEmailLink(email) {
  const actionCodeSettings = { url: location.href, handleCodeInApp: true };
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  localStorage.setItem("kidsProfiles.emailForSignIn", email);
}

export async function completeEmailLinkIfPresent() {
  if (!isSignInWithEmailLink(auth, location.href)) return false;
  const email = localStorage.getItem("kidsProfiles.emailForSignIn");
  if (!email) return false; // ask the user to re-enter email on this device
  await signInWithEmailLink(auth, email, location.href);
  localStorage.removeItem("kidsProfiles.emailForSignIn");
  return true;
}

export async function signOut() { await fbSignOut(auth); }

/* ---------- TV pairing ---------- */

function makeCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // unambiguous, easy to read aloud
  let c = "";
  for (let i = 0; i < 6; i++) c += A[Math.floor(Math.random() * A.length)];
  return c;
}

/* TV side: returns {code, deviceUid, done:Promise}. done resolves once the
 * owner has approved AND confirmed this device (state access works). */
export async function beginTvPairing() {
  if (!auth.currentUser) await signInAnonymously(auth);
  const deviceUid = auth.currentUser.uid;
  let code = null, ref = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    code = makeCode();
    ref = doc(db, "pairCodes", code);
    try {
      await setDoc(ref, {
        deviceUid, ownerUid: null,
        createdAt: serverTimestamp(),
        expiresAt: Date.now() + PAIR_TTL_MS,
      });
      break; // create-only rule: throws if the code already exists
    } catch (e) {
      if (attempt === 2) throw new Error("could not allocate a pairing code, try again");
    }
  }

  const done = new Promise((resolve, reject) => {
    const un = onSnapshot(ref, async (snap) => {
      const d = snap.data();
      if (!d) return;
      if (Date.now() > d.expiresAt) { un(); reject(new Error("pairing code expired")); return; }
      if (!d.ownerUid) return;
      un();
      ownerUid = d.ownerUid;
      await setDoc(doc(db, "deviceRegistrations", deviceUid), {
        code, ownerUid, createdAt: serverTimestamp(), label: "TV",
      });
      const deadline = Date.now() + PAIR_TTL_MS;
      while (Date.now() < deadline) {
        try {
          await getDoc(settingsRef()); // succeeds once rules grant access
          try { localStorage.setItem(LS.owner, JSON.stringify({ deviceUid, ownerUid })); } catch (e) {}
          resubscribe();
          resolve({ ownerUid });
          return;
        } catch (e) {
          await new Promise((r) => setTimeout(r, ACCESS_POLL_MS));
        }
      }
      reject(new Error("owner did not confirm this TV in time"));
    });
  });
  return { code, deviceUid, done };
}

/* Phone side (owner): blind-approve the code shown on the TV. Throws
 * permission-denied if missing/expired/used - indistinguishable by design. */
export async function approveTvCode(code) {
  if (!uid) throw new Error("sign in first");
  await updateDoc(doc(db, "pairCodes", code.toUpperCase().trim()), { ownerUid: uid });
}

/* Phone side: watch for TVs awaiting confirmation. Returns an unsubscribe. */
export function watchPendingDevices(onPending) {
  if (!uid) throw new Error("sign in first");
  return onSnapshot(
    query(collection(db, "deviceRegistrations"), where("ownerUid", "==", uid)),
    (snap) => onPending(snap.docs.map((d) => ({ deviceUid: d.id, ...d.data() })))
  );
}

/* Phone side: confirm a pending TV (devices[] is owner-only in rules). */
export async function confirmPairedDevice(deviceUid) {
  if (!uid) throw new Error("sign in first");
  if (typeof deviceUid !== "string" || deviceUid.length < 10 || deviceUid.length > 40) {
    throw new Error("bad device id");
  }
  const batch = writeBatch(db);
  batch.update(settingsRef(), { devices: arrayUnion(deviceUid) });
  const profs = await getDocs(profilesRef()); // owner: unconstrained
  profs.forEach((d) => batch.update(d.ref, { devices: arrayUnion(deviceUid) }));
  await batch.commit();
}

/* Owner side: revoke a TV (sold device, etc.). */
export async function revokeTvDevice(deviceUid) {
  if (!uid) throw new Error("sign in first");
  const batch = writeBatch(db);
  batch.update(settingsRef(), { devices: arrayRemove(deviceUid) });
  const profs = await getDocs(profilesRef());
  profs.forEach((d) => batch.update(d.ref, { devices: arrayRemove(deviceUid) }));
  await batch.commit();
  try { await deleteDoc(doc(db, "deviceRegistrations", deviceUid)); } catch (e) {}
}

/* TV side (optional): forget the owner on this device. */
export async function unpairThisDevice() {
  try { localStorage.removeItem(LS.owner); localStorage.removeItem(cacheKey()); } catch (e) {}
  ownerUid = null;
  resubscribe();
}

const api = {
  pushState, hasLocalBackup, useLocalInstead, getLocalBackupInfo, cloudProfileNames, mergeLocalInstead,
  signInWithGoogle, sendEmailLink, completeEmailLinkIfPresent, signOut,
  beginTvPairing, approveTvCode, watchPendingDevices,
  confirmPairedDevice, revokeTvDevice, unpairThisDevice,
  get signedIn() { return !!uid; },
  get accountId() { return ownerUid || uid; },
  get pairedDeviceIds() { return currentDevices(); }, // owner-side confirmed list
};
