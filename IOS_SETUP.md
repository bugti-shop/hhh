# iOS Setup Guide for Flowist

> ## ⚠️ CRITICAL UPDATE (April 2026 — Apple SDK Mandate)
>
> Apple now **rejects** any IPA built with an SDK older than **iOS 26 (Xcode 26)**.
> Error: `SDK version issue. This app was built with the iOS 16.2 SDK. All iOS and
> iPadOS apps must be built with the iOS 26 SDK or later.`
>
> **This project is now configured for Xcode 26 builds via Codemagic CI** (see
> `codemagic.yaml` at repo root). Your local Mac with Xcode 14.2 / macOS 12 can
> still run the **simulator for testing**, but it **cannot produce an
> App-Store-eligible archive**.
>
> Native stack has been upgraded:
> - `@capacitor/*` **v5 → v7**
> - `@revenuecat/purchases-capacitor` **7.x → 13.x**  (fixes `SubscriptionPeriod is ambiguous` build error)
> - `@capacitor-community/apple-sign-in` **5 → 7**
> - `@codetrix-studio/capacitor-google-auth` **3.3.6 → 3.4.0-rc.4**
>
> ### To release to App Store:
> 1. Push this repo to GitHub.
> 2. Connect the repo to [Codemagic](https://codemagic.io).
> 3. Add the **App Store Connect API integration** in Codemagic team settings
>    (Teams → Integrations → App Store Connect → upload `.p8` key + Key ID + Issuer ID).
> 4. In Codemagic → your app → Settings → Code signing identities → add an iOS
>    Distribution certificate (Codemagic can auto-create it).
> 5. Trigger the `ios-release` workflow. The IPA is built with Xcode 26 and
>    auto-uploaded to TestFlight.
>
> ### Local testing on Xcode 14.2 (simulator only):
> After every `git pull`, run:
> ```bash
> rm -rf node_modules ios/App/Pods ios/App/Podfile.lock
> npm install
> npm run build
> npx cap sync ios
> cd ios/App && pod install
> ```
> Then run from Xcode. You'll see CocoaPods warnings about deployment target —
> ignore them; this build is for simulator testing only, not for archive.

---

## Project Identifiers

- **Bundle ID:** `com.flowist.app`
- **App Name:** Flowist
- **Google iOS Web Client ID:** `425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i.apps.googleusercontent.com`
- **Apple Sign In Services ID:** `com.flowist.app.signin`
- **OAuth Return URL:** `https://flowist.me/~oauth/callback`

---


## 1. First-Time Setup on Your Mac

After pulling the repo:

```bash
# Clean install
rm -rf node_modules ios/App/Pods ios/App/Podfile.lock package-lock.json bun.lockb
npm install

# Build web bundle
npm run build

# Add iOS platform (only first time)
npx cap add ios

# Sync native code & plugins
npx cap sync ios

# Install CocoaPods
cd ios/App
pod install
cd ../..

# Open in Xcode
npx cap open ios
```

After every code change:
```bash
npm run build && npx cap sync ios
```

---

## 2. Xcode Project Configuration

### 2.1 Signing & Capabilities

In Xcode → select **App** target → **Signing & Capabilities** tab:

1. **Team:** Select your Apple Developer team
2. **Bundle Identifier:** `com.flowist.app`
3. Click **+ Capability** and add:
   - ✅ **Sign in with Apple**
   - ✅ **Push Notifications**
   - ✅ **Background Modes** → enable:
     - Remote notifications
     - Background fetch
     - Location updates
     - Background processing
   - ✅ **In-App Purchase** (for RevenueCat)
   - ✅ **Associated Domains** (optional, for universal links — `applinks:flowist.me`)

### 2.2 Deployment Target

Set **iOS Deployment Target** to **13.0** (minimum for Sign in with Apple).

### 2.3 Where to Update Version & Build Number (Version Code)

iOS has **two** version fields. Both live on the **App target → General → Identity** tab:

| Field | Xcode label | Info.plist key | Example | When to bump |
|------|-------------|----------------|---------|--------------|
| Marketing version | **Version** | `CFBundleShortVersionString` | `1.0.0` | Every public release |
| Build number | **Build** | `CFBundleVersion` | `1`, `2`, `3` | **Every** upload to App Store Connect (must always be higher than the previous one — even for the same Version) |

You can also edit them directly in `ios/App/App/Info.plist`:

```xml
<key>CFBundleShortVersionString</key>
<string>1.0.0</string>
<key>CFBundleVersion</key>
<string>1</string>
```

> Android equivalent: `versionName` (marketing) + `versionCode` (integer). iOS `Build` is the equivalent of `versionCode`, but it can be a string like `1.0.0.5`.

---

## 3. Complete `Info.plist`

Open `ios/App/App/Info.plist` and add these keys inside the root `<dict>`:

```xml
<!-- ============ Google Sign-In ============ -->
<key>GIDClientID</key>
<string>425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i.apps.googleusercontent.com</string>

<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <!-- REVERSED Google Client ID -->
            <string>com.googleusercontent.apps.425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i</string>
            <!-- App's own scheme for OAuth callbacks -->
            <string>com.flowist.app</string>
        </array>
    </dict>
</array>

<!-- Allow OAuth browsers to open -->
<key>LSApplicationQueriesSchemes</key>
<array>
    <string>https</string>
    <string>http</string>
</array>

<!-- ============ Permissions ============ -->
<key>NSMicrophoneUsageDescription</key>
<string>Flowist needs access to your microphone to record voice notes.</string>

<key>NSCameraUsageDescription</key>
<string>Flowist needs access to your camera to attach photos to your notes and tasks.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Flowist needs access to your photo library to attach images to notes and tasks.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>Flowist needs permission to save exported notes and sketches to your photo library.</string>

<key>NSCalendarsFullAccessUsageDescription</key>
<string>Flowist needs access to your calendar to sync your tasks and events.</string>

<key>NSCalendarsWriteOnlyAccessUsageDescription</key>
<string>Flowist needs access to add tasks and events to your calendar.</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>Flowist uses your location to remind you of tasks when you arrive at or leave places.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Flowist uses background location to deliver location-based reminders even when the app is closed.</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>Flowist uses background location to deliver location-based reminders.</string>

<key>NSFaceIDUsageDescription</key>
<string>Flowist uses Face ID to unlock your private notes and protected content.</string>

<key>NSContactsUsageDescription</key>
<string>Flowist may access contacts to share tasks and notes with people you choose.</string>

<key>NSUserTrackingUsageDescription</key>
<string>Flowist does not track you across apps. This permission is only used for analytics if you opt in.</string>

<!-- ============ Background Modes ============ -->
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
    <string>location</string>
    <string>fetch</string>
    <string>processing</string>
    <string>audio</string>
</array>

<!-- ============ App Transport Security ============ -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>

<!-- ============ Status bar ============ -->
<key>UIStatusBarStyle</key>
<string>UIStatusBarStyleDefault</string>
<key>UIViewControllerBasedStatusBarAppearance</key>
<true/>
```

---

## 4. Sign in with Apple — Full Setup

### 4.1 Apple Developer Console

1. Go to **https://developer.apple.com/account/resources/identifiers**
2. **Your App ID** (`com.flowist.app`):
   - Edit → enable **Sign In with Apple** capability → Save
3. **Create Services ID** for web/OAuth callback:
   - **+ → Services IDs** → Identifier: `com.flowist.app.signin`
   - Description: `Flowist Sign In`
   - Enable **Sign In with Apple** → Configure:
     - Primary App ID: `com.flowist.app`
     - **Domains:**
       - `mdrppadworepxgdlhybu.supabase.co`
       - `flowist.me`
       - `flowistapp.lovable.app`
     - **Return URLs:**
       - `https://mdrppadworepxgdlhybu.supabase.co/auth/v1/callback`
       - `https://flowist.me/~oauth/callback`
4. **Create a Key:**
   - **Keys → + → Sign In with Apple** → enable, choose primary App ID
   - Download the `.p8` file (one-time only!) and note the **Key ID** + **Team ID**

### 4.2 Configure in Lovable Cloud (Backend)

In your backend dashboard → **Users → Authentication Settings → Sign In Methods → Apple**:

- Select **Use your own credentials**
- Fill: Team ID, Key ID, Services ID (`com.flowist.app.signin`), paste `.p8` contents
- Click **Generate Secret** → save

### 4.3 OAuth Return URL (used by the app)

The app calls:

```ts
lovable.auth.signInWithOAuth("apple", {
  redirect_uri: "https://flowist.me/~oauth/callback",
});
```

Make sure **`https://flowist.me/~oauth/callback`** is added in BOTH:
- Apple Services ID → Return URLs
- Lovable Cloud → Users → Auth Settings → **URL Configuration → Redirect URLs**

---

## 5. Sign in with Google — Full Setup

### 5.1 Google Cloud Console

1. Go to **https://console.cloud.google.com/apis/credentials**
2. Create an **iOS OAuth Client** (if not yet created):
   - Application type: **iOS**
   - Bundle ID: `com.flowist.app`
3. **Web Client ID** (already in code):
   `425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i.apps.googleusercontent.com`
4. **Authorized redirect URIs** (Web client):
   - `https://mdrppadworepxgdlhybu.supabase.co/auth/v1/callback`
   - `https://flowist.me/~oauth/callback`
   - `https://flowistapp.lovable.app/~oauth/callback`

### 5.2 URL Scheme

Already included in the `Info.plist` block above:
```
com.googleusercontent.apps.425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i
```

> On Capacitor 5, the native `SocialLogin` plugin is removed.
> Google sign-in on iOS uses the in-app Safari OAuth flow via
> `lovable.auth.signInWithOAuth("google", { redirect_uri: "https://flowist.me/~oauth/callback" })`.

---

## 6. AppDelegate.swift — Handle OAuth Callbacks

Open `ios/App/App/AppDelegate.swift` and make sure it handles incoming URLs:

```swift
import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ app: UIApplication, open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication,
                     continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application,
            continue: userActivity, restorationHandler: restorationHandler)
    }
}
```

---

## 7. App Icon (Logo) — How to Add

### Option A — Manual (Xcode Asset Catalog)

1. Prepare a single **1024×1024 PNG** of your logo, **no transparency**, no rounded corners (iOS rounds automatically).
2. In Xcode: open `App/App/Assets.xcassets/AppIcon.appiconset` in the project navigator.
3. Drag your 1024×1024 PNG into the **App Store iOS 1024pt** slot. Xcode 14 auto-generates the smaller sizes.
4. If Xcode does not auto-generate, use **https://www.appicon.co/** to produce the full set (20×20 → 1024×1024) and drop into `AppIcon.appiconset`.

### Option B — CLI (recommended, repeatable)

```bash
npm install --save-dev @capacitor/assets

# Put your source files here:
#   resources/icon.png      (1024x1024, square, no transparency)
#   resources/splash.png    (2732x2732, logo centered, brand bg)

npx capacitor-assets generate --ios
```

This writes the full `AppIcon.appiconset` and `Splash.imageset` automatically. Then `npx cap sync ios`.

---

## 8. Splash Screen

### 8.1 Image

Add `resources/splash.png` (2732×2732, centered logo on solid brand color), then:

```bash
npx capacitor-assets generate --ios
```

### 8.2 Behavior (already configured in `capacitor.config.ts`)

```ts
plugins: {
  SplashScreen: {
    launchAutoHide: false,
    launchShowDuration: 0,
    showSpinner: false,
    backgroundColor: "#3b78ed",
  },
}
```

### 8.3 Storyboard (manual control)

Open `ios/App/App/Splash.storyboard` to change the background color or add a logo image view. Set the background color to your brand `#3b78ed`.

---

## 9. RevenueCat (In-App Purchases)

### Product IDs (already in code):
- `com.flowist.app.weekly` — $1.99
- `com.flowist.app.monthly` — $3.99
- `com.flowist.app.yearly` — $39.99

### App Store Connect
1. **My Apps → Flowist → Subscriptions** → create a subscription group `flowist_premium`
2. Add the 3 auto-renewable subscriptions above
3. Fill in pricing, localized descriptions, review screenshot

### RevenueCat Dashboard
1. Add iOS app → Bundle ID `com.flowist.app`
2. Upload your **App Store Connect API key** (.p8)
3. Create entitlement `premium` and attach all 3 products
4. Copy the **iOS API Key** and set it as the env var `VITE_REVENUECAT_IOS_API_KEY`

---

## 10. Push Notifications

1. Apple Developer → **Keys → +** → enable Apple Push Notifications service (APNs)
2. Download `.p8` and note Key ID + Team ID
3. Upload to your push provider (e.g., RevenueCat / OneSignal / your backend)

---

## 11. Where to Add Package Dependencies

There are **three** dependency layers in a Capacitor iOS app. Don't mix them up.

### 11.1 JavaScript / Capacitor plugins → `package.json`

```bash
npm install @capacitor/haptics @capacitor/filesystem
npx cap sync ios     # copies the pod into ios/App/Podfile
cd ios/App && pod install && cd ../..
```

Capacitor plugins are auto-added to `ios/App/Podfile` by `npx cap sync ios`. **Never edit the Podfile by hand to add a Capacitor plugin.**

### 11.2 Native iOS-only pods → `ios/App/Podfile`

For pods that are not Capacitor plugins (e.g. `Firebase/Analytics`):

```ruby
target 'App' do
  capacitor_pods
  # Your own native pods:
  pod 'Firebase/Analytics'
end
```

Then:
```bash
cd ios/App && pod install && cd ../..
```

### 11.3 Swift Package Manager (SPM)

In Xcode: **File → Add Packages…** → paste the package URL → choose **App** target. Use this for libraries that publish SPM but no CocoaPods.

> **Comparison with Android:** iOS Podfile ≈ Android `app/build.gradle` `dependencies { … }`. SPM ≈ Gradle's `mavenCentral()` entries.

---

## 12. Build & Run on Simulator (Where You Are Now ✅)

```bash
npm run build && npx cap sync ios
npx cap open ios
```

In Xcode:
1. Top bar: pick a simulator (iPhone 14 / iOS 16+)
2. Press **⌘R** to run

---

## 13. 🚀 Simulator → App Store Connect (Comprehensive Release Guide)

You are running on the simulator. Here is **every step** to ship Flowist to the App Store.

### 13.1 Apple Developer Account ($99/year)

- Enroll: https://developer.apple.com/programs/
- Wait 24–48h for approval

### 13.2 Create the App Record in App Store Connect

1. Go to **https://appstoreconnect.apple.com → My Apps → + → New App**
2. Fill in:
   - **Platform:** iOS
   - **Name:** Flowist
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** `com.flowist.app` (must match Xcode)
   - **SKU:** `flowist-ios-001` (any unique string)
   - **User Access:** Full Access

### 13.3 Fill App Store Listing (required before submission)

In your new app record → **App Store** tab:

- **Name** (30 chars), **Subtitle** (30 chars)
- **Promotional Text** (170 chars)
- **Description** (4000 chars)
- **Keywords** (100 chars, comma-separated)
- **Support URL:** e.g. `https://flowist.me/support`
- **Marketing URL** (optional)
- **Privacy Policy URL:** `https://flowist.me/privacy` ← **MUST be live**
- **Screenshots** (use simulator: **File → New Screen Shot** ⌘S):
  - **6.7"** (iPhone 14 Pro Max) — required — at least 3
  - **6.5"** (iPhone 11 Pro Max) — required
  - **5.5"** (iPhone 8 Plus) — required if you support older devices
  - **iPad 12.9"** — required if iPad supported
- **App Icon:** 1024×1024 PNG, no alpha, no rounded corners
- **App Category:** Productivity (primary), Lifestyle (secondary)
- **Content Rating:** answer the questionnaire (4+)
- **Pricing:** Free with In-App Purchases
- **In-App Purchases:** attach the 3 RevenueCat products (Weekly, Monthly, Yearly)
- **App Privacy:** declare what data you collect (analytics, email, etc.)
- **Sign In with Apple:** required since you offer Google sign-in
- **Encryption:** "Uses standard encryption" (HTTPS only)

### 13.4 Prepare the Build in Xcode

1. **Bump the Build Number** (every upload — App Store Connect rejects duplicates):
   - App target → General → Identity → **Build** = `2` (next integer)
2. **Select build target:** top bar → **Any iOS Device (arm64)** (NOT a simulator)
3. **Scheme:** App target → Edit Scheme → **Run → Build Configuration → Release**
4. **Signing:** Signing & Capabilities → ✅ **Automatically manage signing** → Team selected
5. Clean: **Product → Clean Build Folder** (⇧⌘K)

### 13.5 Archive

1. **Product → Archive** (this can take 3–10 min)
2. Xcode opens the **Organizer** window when done
3. If you see "No matching profiles" → click **Manage Signing Certificates** and let Xcode regenerate

### 13.6 Validate & Upload

In the Organizer:

1. Select your archive → **Validate App**
   - Choose **App Store Connect** → Next
   - Pick your team → automatic signing → Next
   - Fix any errors (missing icon size, missing privacy strings, etc.)
2. After validation passes → **Distribute App**
   - **App Store Connect** → Next
   - **Upload** → Next
   - Automatic signing → Next
   - **Upload**
3. Wait 10–30 min — your build appears in App Store Connect under **TestFlight → Builds**
   - You'll get an email: "build processed" or "build invalid"

### 13.7 TestFlight (Internal Testing — Highly Recommended)

1. App Store Connect → your app → **TestFlight** tab
2. Add **Internal Testers** (up to 100 people on your team) — instant access, no Apple review
3. They install **TestFlight app** from App Store, accept invite, install Flowist
4. Test on real device for at least 24h

### 13.8 Submit for App Store Review

1. App Store tab → **+ Version or Platform** if needed → set Version `1.0.0`
2. Scroll to **Build** section → click **+** → pick the uploaded build
3. **Export Compliance** → "No" or "Uses exempt encryption"
4. **Content Rights** → "Does not contain third-party content"
5. **Advertising Identifier (IDFA)** → No (unless you use ads)
6. **App Review Information:**
   - **Demo account:** create a test login (`reviewer@flowist.me` / `Test1234!`) — Apple WILL log in
   - **Notes:** "Productivity app. To test premium features use sandbox account."
   - **Contact info**
7. **Version Release:**
   - Manual (you press a button after approval) — recommended
   - Automatic (releases the moment Apple approves)
8. Click **Add for Review** → **Submit to App Review**

### 13.9 Review Timeline

- Typical: **24–48 hours** (sometimes <24h, sometimes a week)
- Status email: **In Review → Approved / Rejected**
- If rejected → read reasons in **Resolution Center** → fix → bump Build number → re-upload → reply to reviewer → resubmit

### 13.10 Common Rejection Reasons (avoid these!)

| Reason | Fix |
|--------|-----|
| Missing privacy policy | Make `https://flowist.me/privacy` reachable BEFORE submitting |
| Missing demo account | Always provide working credentials in App Review notes |
| "Sign in with Apple required" | Already added — confirm it works |
| In-App Purchase metadata | Each subscription needs review screenshot + localized description |
| Permissions explanation too generic | Be specific in `Info.plist` usage strings |
| App crashes on launch | Always TestFlight on a real device first |
| Uses private API | Don't use private Swift symbols |

### 13.11 Updating the App (Future Releases)

```bash
# 1. Update web code, then:
npm run build && npx cap sync ios

# 2. In Xcode: bump Version (e.g. 1.0.1) AND Build (e.g. 3)
# 3. Product → Archive → Validate → Distribute → Upload
# 4. In App Store Connect → + Version → attach build → Submit
```

---

## 14. Common Issues

| Issue | Fix |
|------|-----|
| `pod install` fails | `sudo gem install cocoapods` (≥ 1.11) |
| "Invalid client" on Sign in with Apple | Re-check Services ID = `com.flowist.app.signin` and JWT in backend |
| Google sign-in redirects fail | Reversed Client ID in `CFBundleURLSchemes` must match Web Client ID exactly |
| Location reminders silent | Settings → Flowist → Location → **Always** |
| Build error "Xcode 16 required" | Confirm `@capacitor/*` are `^5.7.8` (Capacitor 5 supports Xcode 14) |
| Push silent on simulator | APNs only works on physical devices |
| "ITMS-90809: Deprecated API" on upload | Update the offending Cocoapod or remove plugin |
| "Build number must be higher" | Bump **CFBundleVersion** in Info.plist before re-archiving |
| Archive option grayed out | Switch destination from a simulator to **Any iOS Device (arm64)** |

---

## 15. Quick Reference

```
Bundle ID:           com.flowist.app
Apple Services ID:   com.flowist.app.signin
Google Web Client:   425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i.apps.googleusercontent.com
Reversed Google:     com.googleusercontent.apps.425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i
OAuth Return URL:    https://flowist.me/~oauth/callback
Supabase Callback:   https://mdrppadworepxgdlhybu.supabase.co/auth/v1/callback
Min iOS:             13.0
Capacitor:           5.7.8
Xcode tested:        14.2 (macOS 12)
```

---

## 16. iOS vs Android — Setup Comparison

Side-by-side reference between this guide and `ANDROID_SETUP.md`.

| Concern | iOS | Android |
|---------|-----|---------|
| **Native project folder** | `ios/App/` | `android/` |
| **Native IDE** | Xcode 14.2 | Android Studio |
| **Open command** | `npx cap open ios` | `npx cap open android` |
| **App identifier** | Bundle ID `com.flowist.app` | applicationId `com.flowist.app` (in `android/app/build.gradle`) |
| **Manifest of permissions** | `Info.plist` keys (`NS…UsageDescription`) | `AndroidManifest.xml` `<uses-permission>` |
| **Marketing version** | `CFBundleShortVersionString` (Xcode → Version) | `versionName` (`build.gradle`) |
| **Build version code** | `CFBundleVersion` (Xcode → Build) — must increment per upload | `versionCode` (integer) — must increment per upload |
| **JS deps** | `package.json` → `npx cap sync ios` | `package.json` → `npx cap sync android` |
| **Native lib manager** | CocoaPods (`ios/App/Podfile`) or SPM | Gradle (`android/app/build.gradle` `dependencies {}`) |
| **Install native deps** | `cd ios/App && pod install` | Auto on `./gradlew` build / IDE sync |
| **Google sign-in identity** | Reversed Client ID in `Info.plist` `CFBundleURLSchemes` | `google-services.json` in `android/app/` + `server_client_id` in `strings.xml` |
| **Apple sign-in** | ✅ Required (capability + Services ID) | ❌ Not applicable |
| **App icon** | `Assets.xcassets/AppIcon.appiconset` (1024×1024) | `android/app/src/main/res/mipmap-*/ic_launcher.*` |
| **Splash screen** | `Splash.storyboard` + `SplashScreen` plugin | `res/values/styles.xml` `Theme.SplashScreen` |
| **Splash bg color** | `capacitor.config.ts` → `backgroundColor: "#3b78ed"` | `windowSplashScreenBackground` in `styles.xml` |
| **Asset CLI (logo+splash)** | `npx capacitor-assets generate --ios` | `npx capacitor-assets generate --android` |
| **Push notifications** | APNs key (.p8) in Apple Developer | FCM (Firebase) `google-services.json` |
| **In-App Purchases** | StoreKit / RevenueCat — App Store Connect Subscriptions | Google Play Billing — Play Console subscriptions |
| **OAuth deep link** | `CFBundleURLSchemes` + Universal Link `applinks:flowist.me` | `<intent-filter>` `<data android:scheme="https" android:host="flowist.me">` |
| **OAuth return URL** | `https://flowist.me/~oauth/callback` | `https://flowist.me/~oauth/callback` |
| **Min OS version** | iOS 13.0 | Android 7.0 (API 24) |
| **Distribution archive** | `.ipa` via Xcode → Organizer → App Store Connect | `.aab` (App Bundle) via Android Studio → Google Play Console |
| **Signing** | Automatic via Apple Developer team | Upload keystore (`*.jks`) — keep safe FOREVER |
| **Store review time** | 24–48h typical | A few hours – 7 days |
| **Account cost** | $99/year (Apple Developer Program) | $25 one-time (Google Play) |
| **TestFlight equivalent** | TestFlight (built-in) | Google Play **Internal Testing** track |

> **Rule of thumb:** what you put in `Info.plist` on iOS, you put in `AndroidManifest.xml` on Android. What you sign with `.p8` for Apple, you sign with a `.jks` keystore for Google Play.
