# Kids+ sync - testing path (no paid services, no production backend)

All testing happens locally until Ron approves creating a Firebase project.
Nothing here provisions an account or incurs cost.

## 1. Local emulation (zero setup decisions needed)
- Install Firebase CLI, then in a scratch dir (NOT the repo): `firebase init emulators`
  selecting **Authentication** and **Firestore**, then `firebase emulators:start`.
- `sync.js` auto-detects localhost and connects to the emulators
  (Auth :9099, Firestore :8080) - no config change in app code.
- Serve the app locally (`python3 -m http.server`) and test:
  - email-link + Google sign-in flows against the Auth emulator
  - multi-tab sync: open two browser tabs as the same user, edit a profile in
    one, watch the other update via the realtime listener (simulates phone->TV)
  - TV pairing: tab A runs `beginTvPairing()` (anonymous), tab B runs
    `approveTvCode(code)`; confirm tab A starts receiving the owner's state
- Security rules: run `firestore.rules` in the emulator; add rules unit tests
  (`@firebase/rules-unit-testing`) for: stranger cannot read users/{uid},
  paired device can, phone cannot approve a code as another user.

## 2. Android TV app shell (after sync works in emulation)
- Wrap the static site with Capacitor (`webDir` = repo root, no build step).
- TV manifest additions: `android.software.leanback` feature,
  touchscreen `required="false"`, TV launcher intent-filter, 320x180 banner.
- UI work: D-pad/arrow-key focus navigation + landscape layout (the app is
  portrait-only today; this is the bulk of TV work).
- Test in Android Studio's Android TV emulator; then `adb install` the APK on
  Ron's real TV (sideloading - free, no Play account needed at this stage).

## 3. The one user-owned setup step (main chooses when to ask)
Creating the real Firebase project needs Ron's Google account (console or
`firebase login` device code), enabling Google + email-link + anonymous
providers, and pasting the web config into the app. Free Spark plan; no billing
account. Phone/SMS login deliberately excluded (pay-per-SMS only).

## Results v5.1 - emulator run 2026-11-07 (45/45 PASS)
v5: devices[] replicated into every profile doc so revocation changes the
listened docs themselves. v5.1: paired-device profile reads use a QUERY
CONSTRAINT where('devices','array-contains', deviceUid) - required because
Firestore rules are not filters (a data-dependent rule on an unconstrained
collection LIST is unprovable and the whole query is denied).

IMPORTANT CORRECTION to an intermediate experiment: an early test
(debug-t6c.mjs) seemed to show in-doc revoke cutting a live listener; that
listener had actually been denied from the start (unconstrained list), so its
verdict was invalid. The final verified enforcement chain (debug-iso2.mjs +
suite T6): on the owner's revoke batch, (a) the paired TV's settings document
listener errors permission-denied immediately, (b) its profiles listener
emits an EMPTY snapshot (docs left the constrained result set - data flow
stops server-side regardless of rule re-evaluation semantics), (c) fresh
unconstrained reads are denied, (d) fresh constrained reads return zero docs,
(e) writes are denied, (f) sync.js cooperatively unsubscribes and clears
rendered cloud state via onRemoteState(null) - UX hygiene, not the boundary.
This closes the soft-revocation gap found in v4 without Cloud Functions.

Also new since v4: T8m/T8n/T8o (SVG data URL photo rejected, quoted web URL
rejected, create with wrong devices replica rejected), T9b (paired TV cannot
rewrite a profile's devices), plus the full v4 matrix re-run.

Caveat that still stands: emulator-verified, not production-verified. Rules
and flows must be re-run against the real Firebase project after Ron approves
it. One behavior to re-check there: document-listener re-evaluation timing on
revoke (emulator shows immediate; production should match but must be
observed).

## Results v4 - emulator run 2026-11-07 (40/40 PASS)
v4 restructure: profiles moved to users/{uid}/profiles/{id} subcollection so
rules validate EVERY profile field server-side; remote state never touches the
base localStorage keys (per-account cache instead); local/cloud conflict keeps
a backup and offers explicit override.

New/changed coverage vs v3:
- T8 per-profile validation server-side: name length/empty, color format,
  photo must be data:image/* and <=400KB, web must be http(s), wz range, no
  extra fields, id must be int - all enforced by firestore.rules (two genuine
  bugs found and fixed: rules matches() is a FULL-string match, so prefix
  patterns needed re-anchoring; and a valid https web URL must be accepted -
  the app's web-gallery mode depends on it).
- T10 account switch/logout: sign-out notifies the app to fall back to local;
  base localStorage keys never overwritten while signed in; a second account
  on the same device seeds from device-local data and never sees account A's
  cloud profiles.
- T11 local->cloud conflict: cloud wins on sign-in, differing local state is
  backed up (kidsProfiles.localBackup), api.useLocalInstead() overwrites
  cloud only on explicit choice.
- Email-link sign-in now exercised headless via the Auth emulator's OOB-code
  endpoint (same account across two "devices" verified by identical uid).
- T7 upgraded: concurrent edits to different profiles BOTH survive
  (per-profile last-write-wins); settings remain whole-doc last-write-wins.

REVOCATION FINDING (verified, important): Firestore does NOT re-evaluate
get()/exists()-dependent rules for clients with an already-open listener - a
TV revoked while its listener is live keeps receiving profile updates (and,
in the emulator, even fresh getDocsFromServer succeeded after revoke - the
latter may be an emulator caching quirk; MUST be re-verified against a real
project before treating revocation as a hard boundary). Verified hard
guarantees: revoked device cannot read settings, cannot write profiles, and a
fresh client (no prior listener) is denied immediately. Model revocation as:
new sessions blocked at once; a live session is soft until it reconnects.
Grounding: firebase.google.com/docs/rules/rules-behavior + SO Q75982890,
plus debug-t6.mjs/debug-t6b.mjs reproductions.

## Results - emulator run 2026-11-07 (this environment)
20/20 PASS on Firebase Emulator Suite (firebase-tools latest, Auth+Firestore
emulators, JDK 21 - note firebase-tools now requires Java 21+, system Java 11
was too old). Harness: test-sync.mjs + firebase.json (nonstandard ports 9098/
8085 because 8080 was occupied here).

Security matrix (all PASS unless noted):
- T1 pairing happy path: code -> blind owner approval -> device registration ->
  owner confirm -> TV receives owner state via realtime listener
- T2 cross-account: stranger cannot read OR write users/{uid}; can still create
  their own doc (no over-blocking)
- T3 code reuse: an approved code cannot be re-approved by anyone
- T4 expiry: expired code rejected; TV cannot mint an eternal code; TV cannot
  create a code naming another device
- T5 race: two accounts approving one code concurrently - exactly one wins
- T6 revocation: revoked TV loses read AND write immediately
- T7 stale/conflicting updates: whole-doc last-write-wins, both devices
  converge (documented design decision; profile-level merge = later refinement)
- T8 validation: bad enums, extra fields, >50 profiles all rejected by rules;
  oversized photo docs rejected by Firestore itself (invalid-argument)
- T8e/f forgery: cannot approve a code as another uid; cannot register a
  device under an owner without a genuinely approved pairCode
- T9 privilege escalation: paired TV cannot modify devices[]

One real bug was FOUND AND FIXED by these tests: the first state write failed
because rules required devices[] present while pushState intentionally omits it
(devices is owner-managed, merge-only). Rules now accept devices absent.

Known limits (honest):
- Rules cannot iterate list items, so per-profile field validation is not
  expressible server-side. Mitigation: client downscales photos to <=512px
  data URLs before save; profile count capped at 50; Firestore's own 1 MiB doc
  limit is the hard backstop.
- Whole-doc last-write-wins: simultaneous edits on two devices can lose one
  edit. Acceptable at family scale; flagged for Ron if simultaneous editing
  matters.
- Google/email-link sign-in flows themselves are not exercised headless here
  (need a browser); the emulator's Auth endpoint is exercised via anonymous
  sign-in, which the TV flow uses.

## Toolchain availability in this environment
- Emulator testing: fully supported (done above, JDK 21 downloaded on demand).
- APK build: DONE (SDK platform-34 + build-tools 34.0.0 + gradle 8.5,
  JAVA_HOME=/tmp/jdk21). See TV-WRAPPER.md. Still not runtime-tested on a
  real TV/device.

## Live production verification (2026-11-07, project kids-plus-594c4)
The v5 rules and the full pairing lifecycle were re-verified against the LIVE
Firebase project (not the emulator) via the Firestore/Auth REST APIs with two
throwaway accounts (one email/password "owner", one anonymous "TV"), both
deleted afterwards. 20/20 checks passed:
- unauthenticated read denied; non-owner create denied
- owner create user doc + profile allowed; invalid profile (bad color) denied
  by server-side validation
- pair-code create (bounded expiry) / blind owner approval / device
  registration all allowed exactly as specified
- eternal pair code denied
- paired TV read allowed; after owner revokes, TV reads denied (user doc and
  profile doc) - server-enforced revocation confirmed in production
Console state: Spark plan ($0), Auth providers Google + Email/Password
(+ email link) + Anonymous enabled, Firestore (default) in eur3, rules
published 03:42 IST, authorized domains: localhost, *.firebaseapp.com,
*.web.app, urlcallapp.github.io.
Residual smoke docs (users/<deleted-uid>, one profile, one pairCode, one
deviceRegistration) reference deleted accounts and are inert; remove via
console Data tab if desired.

## Emulator note
sync.js falls back to the emulator only on plain-http localhost (dev servers).
The Android WebView origin is https://localhost, so the APK talks to the real
project - verified by inspecting the built assets. Emulator suite
(test-sync.mjs, 45/45) and browser E2E (sync/TV D-pad/entry/avatars) were all
re-run green on the final integrated build (2026-11-07 03:49 IST).
