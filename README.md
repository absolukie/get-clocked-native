# get-clocked-native — Capacitor wrapper for GET CLOCKED

Native iOS + Android wrapper for the GET CLOCKED web app. The web app
(`web/`, synced from the website repo) talks to native code through
`window.BoyGamesNative` — the bridge contract is documented in the website
repo's `STORE.md` and implemented here as a Capacitor plugin:

- **store** — StoreKit 2 (iOS) / Play Billing v7 (Android) for the
  non-consumable **Remove Ads** product
  (`boygames.getclocked.remove_ads`, $2.99)
- **haptics** — tap/impact + success/error feedback (this is the app's
  native value-add for Apple Guideline 4.2, alongside offline play)
- **ads** — stubs delegating to AdMob (IDs still to be created — see below)

Public repo destination: `absolukie/get-clocked-native`.

## What was verified vs. what wasn't

- ✅ Web side: `js/haptics.js` + haptic hooks + `sw.js` offline shell live in
  the website repo; all JS syntax-checked with `node --check`.
- ✅ `sync-web.sh` runs; `web/` snapshot builds and the bridge `<script>` tag
  is injected before `js/app.js`.
- ❌ **No native build was produced.** This VM has no Xcode, no Android
  SDK/Gradle, and no Capacitor installed. The Swift and Kotlin plugin code
  was written against the StoreKit 2 / Play Billing v7 APIs from
  documentation — treat the first build on your Mac as the real check.
  Known risk areas are flagged inline in the plugin files.

## Setup (on your Mac)

Prerequisites: Node 18+, Xcode 15+ with your Apple Developer account signed
in (Individual enrollment, $99/yr), and Android Studio for the Android side.

```bash
cd get-clocked-native
npm install

# refresh the web snapshot from the website repo (re-run after every web deploy)
./sync-web.sh

npx cap add ios
npx cap add android
npx cap sync
```

### iOS — add the plugin files to Xcode

1. `npx cap open ios`
2. In Xcode: **File > Add Files to "App…"**, add to the **App** target:
   - `plugins/ios/BoyGamesNativePlugin.swift`
   - `plugins/native-bridge-shim.js` (lands in Copy Bundle Resources —
     the plugin injects it into the WKWebView at document-start)
3. **Signing & Capabilities** → select your Team; verify the Bundle
   Identifier is `com.butterworks.getclocked` (matches
   `capacitor.config.ts` → `appId`).
4. Build & run on a device (StoreKit needs a real device or a
   StoreKit Configuration file — see below).

### Android — add the plugin files

1. Copy `plugins/android/BoyGamesNativePlugin.kt` to
   `android/app/src/main/java/com/butterworks/getclocked/BoyGamesNativePlugin.kt`
   (the `package` line must match the `appId` in `capacitor.config.ts`).
2. In `android/app/src/main/java/.../MainActivity.java` (or `.kt`):
   ```java
   import com.butterworks.getclocked.BoyGamesNativePlugin;
   // ...
   @Override
   public void onCreate(Bundle savedInstanceState) {
       registerPlugin(BoyGamesNativePlugin.class);
       super.onCreate(savedInstanceState);
   }
   ```
3. In `android/app/build.gradle` add:
   ```gradle
   implementation("com.android.billingclient:billing:7.1.1")
   ```
4. Optional: copy `plugins/native-bridge-shim.js` to
   `android/app/src/main/assets/` (best-effort runtime injection; the
   static `web/js/native-bridge.js` copy is the primary path).

### If you change the bundle ID

Change it in **all three places together**: `capacitor.config.ts`
(`appId`), the Xcode Bundle Identifier, and the Android package / Kotlin
`package` line. The Store product ID (`boygames.getclocked.remove_ads`)
is independent — do **not** change it.

## Manual steps — store products

Do these in the consoles; nothing here is automated.

### App Store Connect (iOS)

1. App Store Connect → **My Apps → +** → New App → iOS, name "Get Clocked",
   Bundle ID `com.butterworks.getclocked`, SKU anything (e.g.
   `getclocked-ios`).
2. **In-App Purchases → +** → **Non-Consumable** → Product ID exactly:
   `boygames.getclocked.remove_ads`
3. Price: **$2.99** (Tier 3). Display name "Remove Ads".
4. Add a **sandbox tester** account (Users and Access → Sandbox Testers) to
   test purchases without being charged.
5. For on-device testing without App Store review: in Xcode, create a
   `.storekit` configuration file (File > New > StoreKit Configuration)
   with the same product ID, and run the app with that configuration
   (Scheme > Edit Scheme > Run > StoreKit Configuration).

### Google Play Console (Android)

1. Play Console → **Create app** → name "Get Clocked", package
   `com.butterworks.getclocked`.
2. **Monetize → In-app products → Create product** → Product ID exactly:
   `boygames.getclocked.remove_ads` → one-time (non-consumable) →
   **$2.99**. Activate it.
3. Add **license testers** (Setup → License testing) with your Gmail to
   test purchases without being charged.

## Manual steps — AdMob (not yet done)

The `showBanner` / `hideBanner` / `showInterstitial` bridge methods are
**stubs that resolve immediately and show nothing**. To go live:

1. https://apps.admob.com → create account → **Apps → Add app** → iOS and
   Android versions of Get Clocked → note the two **App IDs**
   (`ca-app-pub-XXXX~YYYY`).
2. iOS: add to `ios/App/App/Info.plist`:
   ```xml
   <key>GADApplicationIdentifier</key>
   <string>ca-app-pub-XXXX~YYYY</string>
   ```
3. Android: add to `android/app/src/main/AndroidManifest.xml` inside
   `<application>`:
   ```xml
   <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID"
              android:value="ca-app-pub-XXXX~YYYY"/>
   ```
4. In AdMob: **Ad units → +** → create a **Banner** and an
   **Interstitial** ad unit per platform → note the ad unit IDs
   (`ca-app-pub-XXXX/YYYY`).
5. Implement the TODOs in `plugins/ios/BoyGamesNativePlugin.swift`
   (GADBannerView / GADInterstitialAd via Swift Package Manager) and
   `plugins/android/BoyGamesNativePlugin.kt`
   (`play-services-ads` + AdView / InterstitialAd). The web side already
   calls the right bridge methods with frequency capping for
   interstitials; native-side capping for `showInterstitial` is called out
   in the TODO.

Note the ads kill switch stays off by default (see website repo
`STORE.md`) — creating AdMob IDs doesn't turn ads on.

## File map

| Path | What |
|---|---|
| `capacitor.config.ts` | appId `com.butterworks.getclocked`, webDir `web` |
| `package.json` | Capacitor 7 deps, `sync-web` / `open-ios` / `open-android` scripts |
| `sync-web.sh` | Re-copies the site into `web/` + injects the bridge `<script>` tag |
| `web/` | Snapshot of the site (regenerated — don't hand-edit) |
| `plugins/native-bridge-shim.js` | Source of truth for `window.BoyGamesNative` |
| `plugins/ios/BoyGamesNativePlugin.swift` | StoreKit 2 + haptics + AdMob stubs |
| `plugins/android/BoyGamesNativePlugin.kt` | Play Billing v7 + haptics + AdMob stubs |

## Test checklist (first run on device)

- [ ] App launches to the Get Clocked home screen, no console errors
- [ ] Buttons buzz lightly (native haptics), round transitions buzz medium
- [ ] Airplane mode: full pass-and-play game works offline
- [ ] `?ads=1` → banner slot renders house ads; Remove Ads row hidden (ads
      kill switch off by default — row only shows when ads are enabled)
- [ ] `?dev=1` → demo purchase flips the entitlement (web fallback path)
- [ ] Sandbox/test purchase of `boygames.getclocked.remove_ads` → "✓ Ads
      removed", survives reinstall via Restore
