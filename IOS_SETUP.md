# iOS Setup Guide for Flowist

Complete setup guide for building Flowist on **Xcode 14.2 / macOS 12** with Capacitor 5.

- **Bundle ID:** `com.flowist.app`
- **App Name:** Flowist
- **Google iOS Web Client ID:** `425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i.apps.googleusercontent.com`
- **Apple Sign In Services ID:** `com.flowist.app.signin`

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
   - ✅ **Associated Domains** (optional, for universal links)

### 2.2 Deployment Target

Set **iOS Deployment Target** to **13.0** (minimum for Sign in with Apple).

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
4. **Create a Key:**
   - **Keys → + → Sign In with Apple** → enable, choose primary App ID
   - Download the `.p8` file (one-time only!) and note the **Key ID** + **Team ID**

### 4.2 Configure in Lovable Cloud (Backend)

In your backend dashboard → **Users → Authentication Settings → Sign In Methods → Apple**:

- Select **Use your own credentials**
- Fill: Team ID, Key ID, Services ID (`com.flowist.app.signin`), paste `.p8` contents
- Click **Generate Secret** → save

### 4.3 Native Code (already wired)

The app uses `lovable.auth.signInWithOAuth("apple", ...)` which works out of the box.
On iOS, Capacitor opens the system Safari view for OAuth — no extra Swift code needed.

---

## 5. Sign in with Google — Full Setup

### 5.1 Google Cloud Console

1. Go to **https://console.cloud.google.com/apis/credentials**
2. Create an **iOS OAuth Client** (if not yet created):
   - Application type: **iOS**
   - Bundle ID: `com.flowist.app`
3. Your **Web Client ID** is already set:
   `425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i.apps.googleusercontent.com`
4. **Authorized redirect URIs** (Web client):
   - `https://mdrppadworepxgdlhybu.supabase.co/auth/v1/callback`
   - `https://flowist.me`
   - `https://flowistapp.lovable.app`

### 5.2 capacitor.config.ts (already configured)

```ts
plugins: {
  SocialLogin: {
    google: {
      webClientId: '425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i.apps.googleusercontent.com',
    },
  },
}
```

> Note: On Capacitor 5 the native `SocialLogin` plugin is removed in our setup.
> Google sign-in on iOS falls back to the in-app Safari OAuth flow handled by
> `lovable.auth.signInWithOAuth("google", ...)` — which works without any extra Swift code.

### 5.3 URL Scheme

Already included in the `Info.plist` block above:
```
com.googleusercontent.apps.425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i
```

---

## 6. AppDelegate.swift — Handle OAuth Callbacks

Open `ios/App/App/AppDelegate.swift` and ensure it handles incoming URLs:

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

    // Handle OAuth callbacks (Google / Apple / Supabase)
    func application(_ app: UIApplication,
                     open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    // Universal links
    func application(_ application: UIApplication,
                     continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application,
                                                            continue: userActivity,
                                                            restorationHandler: restorationHandler)
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}
}
```

---

## 7. RevenueCat (In-App Purchases)

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

## 8. Push Notifications

1. Apple Developer → **Keys → +** → enable Apple Push Notifications service (APNs)
2. Download `.p8` and note Key ID + Team ID
3. Upload to your push provider (e.g., RevenueCat / OneSignal / your backend)

---

## 9. Build & Run

```bash
npm run build && npx cap sync ios
npx cap open ios
```

In Xcode:
1. Select a device or simulator (iOS 13+)
2. Press ⌘R

---

## 10. Common Issues

| Issue | Fix |
|------|-----|
| `pod install` fails | Ensure CocoaPods ≥ 1.11: `sudo gem install cocoapods` |
| Sign in with Apple shows "Invalid client" | Re-check Services ID = `com.flowist.app.signin` and JWT secret in backend |
| Google sign-in opens but redirects fail | Check Reversed Client ID in `CFBundleURLSchemes` matches Web Client ID exactly |
| Location reminders don't fire in background | Settings → Flowist → Location → **Always** |
| Build error "Xcode 16 required" | Confirm `@capacitor/*` packages are `^5.7.8` (Capacitor 5 supports Xcode 14) |
| Push notifications silent on simulator | APNs only works on physical devices |

---

## 11. Quick Reference

```
Bundle ID:           com.flowist.app
Apple Services ID:   com.flowist.app.signin
Google Web Client:   425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i.apps.googleusercontent.com
Reversed Google:     com.googleusercontent.apps.425291387152-hg7uajqc20bd8t3qfb760gngbl2pd20i
Supabase Callback:   https://mdrppadworepxgdlhybu.supabase.co/auth/v1/callback
Min iOS:             13.0
Capacitor:           5.7.8
Xcode tested:        14.2 (macOS 12)
```
