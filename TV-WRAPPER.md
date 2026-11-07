# Kids+ Android TV wrapper - proven build recipe

A debug APK builds in this environment. Proven 2026-11-07: `kids-plus-tv-debug.apk`
(1.5 MB, package `app.urlcall.kidsprofiles`, minSdk 24 / targetSdk 34, LEANBACK
launcher entry, 37 web assets bundled). Not yet run on a physical TV/emulator.

## Toolchain (fresh machine)
1. JDK 21 (AGP 8.x requires it; system Java 11 fails).
2. Android cmdline-tools -> sdkmanager: `platforms;android-34`, `build-tools;34.0.0`.
3. Gradle 8.5 binary zip (no wrapper jar needed).
Total download ~450 MB. Build after install: ~25 s.

## Wrapper design (plain WebView, no Capacitor needed)
The app is fully static, so a single-Activity WebView wrapper suffices;
capacitor.config.json remains as an option if native plugins are wanted later.
- `MainActivity.java`: full-screen WebView, `javaScriptEnabled` + `domStorageEnabled`
  (localStorage is required), loads `file:///android_asset/index.html`.
- Manifest: `INTERNET`, landscape, touchscreen + leanback both optional
  (`required=false`) so the same APK installs on TV and phone.
- Assets: index.html + sync.js/sync-ui.js + tv-mode.* + kp-entry.css +
  profile-entry.mock.js + avatars/ + icons, copied verbatim from the web build.
- D-pad works through tv-mode.js (WebView delivers DPAD as arrow keys + Enter).

## Build
    # in the project root (settings.gradle / build.gradle / app/...)
    echo "sdk.dir=<ANDROID_SDK>" > local.properties
    gradle assembleDebug   # -> app/build/outputs/apk/debug/app-debug.apk

## WebView origin & security (revised after review)
Assets are served through WebViewAssetLoader at
`https://appassets.androidplatform.net/assets/index.html`, NOT file://:
- ES-module scripts and fetch() are CORS-blocked from file:// in WebView, so
  the sync module would not load there at all - the https origin is required
  for the app to work, not just nice to have.
- localStorage/IndexedDB get a proper origin partition.
- Locked settings: allowFileAccess/allowContentAccess off, no
  file-origin universal access, MIXED_CONTENT_NEVER_ALLOW, safe browsing on.
- Firebase Auth note: Google popup sign-in will not work inside the WebView
  (Google blocks embedded agents); the phone app should use the system browser
  flow or email link, and the TV uses pairing - consistent with the design.

## Runtime verification status
APK builds and passes aapt manifest checks, but has NOT run on Android yet:
this sandbox has no /dev/kvm, no CPU virtualization flags, 2 cores and 1 GB
RAM - the Android emulator is not practical here. First runtime pass must
happen on Ron's TV (sideload) or an emulator on a dev machine.

## Known gaps before release (not blockers for the debug APK)
- Release signing (debug key only now), unique app icon/banner art for TV launcher.
- sw.js service worker does not run from file:// assets (offline caching is moot -
  all assets are bundled); no impact observed.
- Runtime check on a real Android TV / emulator image not yet done.
