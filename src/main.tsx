import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Add platform class to body for platform-specific CSS
if (Capacitor.isNativePlatform()) {
  document.body.classList.add('native-app');
  if (Capacitor.getPlatform() === 'android') {
    document.body.classList.add('android-app');
    // Add stretch class to html for edge-to-edge height fix
    document.documentElement.classList.add('android-stretch');
  } else if (Capacitor.getPlatform() === 'ios') {
    document.body.classList.add('ios-app');
  }
}

// Prevent PWA service worker in preview/iframe contexts
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}
import { migrateLocalStorageToIndexedDB, getSetting, warmSettingsCache } from "./utils/settingsStorage";
import { migrateNotesToIndexedDB } from "./utils/noteStorage";
import { initializeProtectionSettings } from "./utils/noteProtection";
import { configureStatusBar } from "./utils/statusBar";
import { initializeTaskOrder } from "./utils/taskOrderStorage";

// One-time cache clear
const CACHE_CLEAR_KEY = 'nota_cache_cleared_v3';
const CACHE_CLEAR_DONE_VALUE = 'true';

const hasCacheBeenCleared = (() => {
  try {
    return localStorage.getItem(CACHE_CLEAR_KEY) === CACHE_CLEAR_DONE_VALUE;
  } catch {
    return true;
  }
})();

if (!hasCacheBeenCleared) {
  // Write flag first so a crash/reload won't re-trigger the wipe.
  try { localStorage.setItem(CACHE_CLEAR_KEY, CACHE_CLEAR_DONE_VALUE); } catch {}

  const dbNames = [
    'nota-settings-db', 'nota-notes-db', 'nota-task-db', 'nota-task-media-db',
    'nota-media-db', 'nota-tags-db', 'nota-habits-db', 'nota-receipts-db'
  ];

  // Wait for all database deletions to complete before reloading
  const deletePromises = dbNames.map(name => new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // resolve even on error
      req.onblocked = () => resolve(); // resolve even if blocked
      // Safety timeout in case callbacks never fire (Android WebView edge case)
      setTimeout(resolve, 2000);
    } catch {
      resolve();
    }
  }));

  // Preserve the clear-marker key only.
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key !== CACHE_CLEAR_KEY) {
        try { localStorage.removeItem(key); } catch {}
      }
    });
  } catch {}

  Promise.all(deletePromises).then(() => {
    window.location.reload();
  }).catch(() => {
    window.location.reload();
  });
}

// No spinner, but keep the root painted so mobile/web never looks like a crashed white page.
const EmptyFallback = () => <div className="min-h-screen bg-background" aria-hidden="true" />;

// Catch uncaught synchronous errors that escape React's error boundary
window.addEventListener('error', (event) => {
  // Prevent white screen from extension-injected script errors
  if (event.filename && !event.filename.includes(window.location.origin)) {
    event.preventDefault();
    return;
  }
  // Suppress Firebase/network errors
  const msg = String(event?.message || '');
  if (msg.includes('Firebase') || msg.includes('PERMISSION_DENIED') || msg.includes('network') || msg.includes('timeout') || msg.includes('Failed to fetch')) {
    event.preventDefault();
    console.warn('Suppressed error:', msg);
    return;
  }
});

// Catch unhandled promise rejections silently
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event?.reason?.message || event?.reason || '');
  if (
    msg.includes('QuotaExceededError') || msg.includes('quota') || msg.includes('storage') ||
    msg.includes('Firebase') || msg.includes('PERMISSION_DENIED') ||
    msg.includes('network') || msg.includes('timeout') || msg.includes('Failed to fetch') ||
    msg.includes('Loading chunk') || msg.includes('dynamically imported module') ||
    msg.includes('AbortError') || msg.includes('The operation was aborted') ||
    msg.includes('ResizeObserver') || msg.includes('removeChild') || msg.includes('insertBefore')
  ) {
    event.preventDefault();
    console.warn('Suppressed rejection:', msg.slice(0, 100));
  }
});

// Schedule non-critical work after first paint
const scheduleDeferred = (fn: () => void) => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(fn, { timeout: 3000 });
  } else {
    setTimeout(fn, 100);
  }
};

// Start warming settings cache but DON'T block render on it.
// On native (SQLite) this is instant; on web (IndexedDB) it can take seconds.
// Race: render as soon as cache is warm OR after 150ms max.
// Patch DOM methods on root to prevent "removeChild" crashes from browser
// extensions or third-party scripts that modify React-managed DOM nodes.
const patchRootContainer = (container: HTMLElement) => {
  if ((container as HTMLElement & { __flowistPatched?: boolean }).__flowistPatched) {
    return;
  }

  const origRemoveChild = container.removeChild.bind(container);
  const origInsertBefore = container.insertBefore.bind(container);

  container.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== container) {
      console.warn('Suppressed removeChild on non-child node');
      return child;
    }
    return origRemoveChild(child);
  };

  container.insertBefore = function <T extends Node>(newNode: T, refNode: Node | null): T {
    if (refNode && refNode.parentNode !== container) {
      console.warn('Suppressed insertBefore on non-child ref node');
      return newNode;
    }
    return origInsertBefore(newNode, refNode);
  };

  (container as HTMLElement & { __flowistPatched?: boolean }).__flowistPatched = true;
};

const rootCache = globalThis as typeof globalThis & {
  __flowistAppRoot?: ReturnType<typeof createRoot>;
};

const renderApp = () => {
  const rootEl = document.getElementById("root")!;
  patchRootContainer(rootEl);
  const appRoot = rootCache.__flowistAppRoot ?? createRoot(rootEl);
  rootCache.__flowistAppRoot = appRoot;
  appRoot.render(
    <React.StrictMode>
      <Suspense fallback={<EmptyFallback />}>
        <App />
      </Suspense>
    </React.StrictMode>
  );
};

// Render immediately — don't block on cache warming
renderApp();

// Warm settings cache in background (non-blocking)
warmSettingsCache().catch(() => {});

// Defer ALL non-critical initialization until after first paint
scheduleDeferred(async () => {
  try {
    const [
      { startBackgroundScheduler },
      { initializeReminders },
      { initializeStreakNotifications },
      { initializeSmartNotifications },
      { initializeSmartNudges },
    ] = await Promise.all([
      import("./utils/backgroundScheduler"),
      import("./utils/reminderScheduler"),
      import("./utils/streakNotifications"),
      import("./utils/smartNotifications"),
      import("./utils/smartNudges"),
    ]);

    // Run migrations in parallel
    await Promise.all([
      migrateLocalStorageToIndexedDB(),
      migrateNotesToIndexedDB(),
      initializeTaskOrder(),
      initializeProtectionSettings(),
    ]);

    // Start background scheduler
    startBackgroundScheduler();

    // Fire-and-forget notification initializations
    initializeReminders().catch(console.warn);
    initializeStreakNotifications().catch(console.warn);
    initializeSmartNotifications().catch(console.warn);
    initializeSmartNudges().catch(console.warn);
    

    // Configure status bar
    const theme = await getSetting<string>('theme', 'light');
    await configureStatusBar(theme !== 'light', theme || 'light');
  } catch (error) {
    console.error('Deferred initialization error:', error);
  }
});
