import React, { useEffect, useState, lazy, Suspense, startTransition, useRef, useCallback } from "react";
import { LazyMotion, domAnimation } from "framer-motion";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { NotesProvider } from "@/contexts/NotesContext";
import { GoogleAuthProvider } from "@/contexts/GoogleAuthContext";
import { useGoogleDriveSync } from "@/hooks/useGoogleDriveSync";
const PremiumPaywall = lazy(() => import("@/components/PremiumPaywall").then(m => ({ default: m.PremiumPaywall })));
const OnboardingFlow = lazy(() => import("@/components/OnboardingFlow").then(m => ({ default: m.OnboardingFlow })));


import { NavigationLoader } from "@/components/NavigationLoader";

import { NavigationBackProvider } from "@/components/NavigationBackProvider";
import { getSetting, setSetting } from "@/utils/settingsStorage";
import { shouldAppBeLocked, updateLastUnlockTime } from "@/utils/appLockStorage";
import { useJourneyAdvancement } from "@/hooks/useJourneyAdvancement";

import { useAchievementToasts } from "@/hooks/useAchievementToasts";

import { useCertificateToasts } from "@/hooks/useCertificateToasts";
import { useSubscriptionExpiry } from "@/hooks/useSubscriptionExpiry";
const AppLockScreen = lazy(() => import("@/components/AppLockScreen").then(m => ({ default: m.AppLockScreen })));
import { useNotificationListener } from "@/hooks/useNotificationListener";

const StreakMilestoneCelebration = lazy(() => import("@/components/StreakMilestoneCelebration").then(m => ({ default: m.StreakMilestoneCelebration })));
const StreakTierCelebration = lazy(() => import("@/components/StreakTierCelebration").then(m => ({ default: m.StreakTierCelebration })));
const SmartReviewPrompt = lazy(() => import("@/components/SmartReviewPrompt").then(m => ({ default: m.SmartReviewPrompt })));

const ComboOverlay = lazy(() => import("@/components/ComboOverlay").then(m => ({ default: m.ComboOverlay })));
const EncouragementOverlay = lazy(() => import("@/components/EncouragementOverlay").then(m => ({ default: m.EncouragementOverlay })));
const UrgentReminderOverlay = lazy(() => import("@/components/UrgentReminderOverlay").then(m => ({ default: m.UrgentReminderOverlay })));
const SyncConflictSheet = lazy(() => import("@/components/SyncConflictSheet").then(m => ({ default: m.SyncConflictSheet })));
const SyncProgressSheet = lazy(() => import("@/components/SyncProgressSheet").then(m => ({ default: m.SyncProgressSheet })));
const preloadTodayPage = () => import("./pages/todo/Today");
const preloadNotesDashboardPage = () => import("./pages/Index");
const Today = lazy(preloadTodayPage);

const Index = lazy(preloadNotesDashboardPage);
void preloadTodayPage();

// Lazy load everything else - they load in background after first paint
const Notes = lazy(() => import("./pages/Notes"));
const NotesCalendar = lazy(() => import("./pages/NotesCalendar"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const Progress = lazy(() => import("./pages/todo/Progress"));
const JourneyHistory = lazy(() => import("./pages/todo/JourneyHistory"));
const JourneyBadges = lazy(() => import("./pages/todo/JourneyBadges"));
const TodoCalendar = lazy(() => import("./pages/todo/TodoCalendar"));
const TodoSettings = lazy(() => import("./pages/todo/TodoSettings"));
const WebClipper = lazy(() => import("./pages/WebClipper"));
const Reminders = lazy(() => import("./pages/Reminders"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminOnboarding = lazy(() => import("./pages/AdminOnboarding"));
const Landing = lazy(() => import("./pages/Landing"));

const queryClient = new QueryClient();

// IMPORTANT: Only decide the initial dashboard once per app session.
// This prevents slow async IndexedDB reads every time the user taps "Home".
let hasResolvedInitialDashboard = false;

// Minimal fallback — keeps layout stable during chunk load
const EmptyFallback = () => null;

// Branded fallback — silent (no spinner), but never leaves a blank white root.
const BrandedFallback = () => <div className="min-h-screen bg-background" aria-hidden="true" />;
// Detect stale chunk errors and auto-reload once
const isChunkError = (error: any): boolean => {
  const msg = String(error?.message || error || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk')
  );
};

const handleChunkError = () => {
  const key = 'chunk_reload_ts';
  const last = Number(sessionStorage.getItem(key) || 0);
  // Only auto-reload once per 30 seconds to avoid infinite loops
  if (Date.now() - last > 30_000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
    return true;
  }
  return false;
};

// Global error handler for unhandled errors (prevents white screen on mobile)
if (typeof window !== 'undefined') {
  // Show user-friendly toast for unhandled errors instead of silent crashes
  const showGlobalError = async (error: any) => {
    try {
      const { showErrorToast } = await import('@/lib/errorHandling');
      showErrorToast(error, { title: '⚠️ Error', log: false });
    } catch {
      // Fallback if errorHandling module fails
      console.error('Unhandled error:', error);
    }
  };

  window.onerror = (message, source, lineno, colno, error) => {
    if (isChunkError(error || message)) {
      if (handleChunkError()) return true;
    }
    console.error('Global error:', { message, source, lineno, colno, error });
    showGlobalError(error || message);
    return false;
  };
  
  window.onunhandledrejection = (event) => {
    // Auto-reload on stale chunk imports
    if (isChunkError(event?.reason)) {
      event.preventDefault();
      if (handleChunkError()) return;
    }
    // Suppress "not implemented" errors from Capacitor plugins (web + android + ios)
    const msg = String(event?.reason?.message || event?.reason || '');
    if (msg.includes('not implemented') || msg.includes('UNIMPLEMENTED') || msg.includes('not available')) {
      event.preventDefault();
      return;
    }
    console.error('Unhandled promise rejection:', event.reason);
    showGlobalError(event.reason);
  };
}

// Component to track and save last visited dashboard
const DashboardTracker = () => {
  const location = useLocation();
  
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/todo') || path === '/') {
      setSetting('lastDashboard', 'todo');
    } else if (path === '/notesdashboard' || path === '/calendar' || path === '/settings') {
      setSetting('lastDashboard', 'notes');
    }
  }, [location.pathname]);
  
  return null;
};

// Listen for tour navigation events and navigate accordingly
const TourNavigationListener = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    const handleTourNavigate = (e: CustomEvent<{ path: string }>) => {
      navigate(e.detail.path);
    };
    window.addEventListener('tourNavigate', handleTourNavigate as EventListener);
    return () => window.removeEventListener('tourNavigate', handleTourNavigate as EventListener);
  }, [navigate]);
  
  return null;
};

// Root redirect component that redirects to Todo dashboard by default
const RootRedirect = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    // If we've already resolved once, skip
    if (hasResolvedInitialDashboard) return;
    hasResolvedInitialDashboard = true;
    
    const checkLastDashboard = async () => {
      try {
        const lastDashboard = await getSetting<string>('lastDashboard', 'todo');
        if (lastDashboard === 'notes') {
          startTransition(() => {
            navigate('/notesdashboard', { replace: true });
          });
        }
      } catch (e) {
        console.warn('Failed to check last dashboard:', e);
      }
    };
    
    checkLastDashboard();
  }, [navigate]);
  
  // Always render Today (Todo) immediately - no loading screen
  return <Today />;
};

const AppRoutes = () => {
  return (
    <BrowserRouter>
      <NavigationBackProvider>
        <NavigationLoader />
        <DashboardTracker />
        <TourNavigationListener />
        <Suspense fallback={<BrandedFallback />}>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/notesdashboard" element={<Index />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/calendar" element={<NotesCalendar />} />
            <Route path="/clip" element={<WebClipper />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/todo/today" element={<Today />} />
            <Route path="/todo/calendar" element={<TodoCalendar />} />
            <Route path="/todo/settings" element={<TodoSettings />} />
            <Route path="/todo/progress" element={<Progress />} />
            <Route path="/todo/journey-history" element={<JourneyHistory />} />
            <Route path="/todo/journey-badges" element={<JourneyBadges />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            
            <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
            <Route path="/admin/onboarding" element={<AdminOnboarding />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </NavigationBackProvider>
    </BrowserRouter>
  );
};

const DriveSyncBootstrapInner = () => {
  useGoogleDriveSync();
  return null;
};

const DriveSyncBootstrap = () => (
  <ErrorBoundary fallback={null}>
    <DriveSyncBootstrapInner />
  </ErrorBoundary>
);

const AppContent = () => {
  const [isAppLocked, setIsAppLocked] = useState<boolean | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(() => {
    try {
      return localStorage.getItem('onboarding_completed_flag') === 'true' ? false : null;
    } catch {
      return null;
    }
  });
  
  // Web-only landing page gate. Native apps NEVER show landing.
  // Multi-signal native detection (Capacitor.isNativePlatform can be false during very early boot
  // before the bridge attaches; we also sniff the UA + window.Capacitor as belt-and-suspenders).
  const isNative = (() => {
    try {
      if (Capacitor.isNativePlatform()) return true;
      if (typeof window !== 'undefined') {
        const w: any = window;
        if (w.Capacitor?.isNativePlatform?.()) return true;
        if (w.Capacitor?.platform && w.Capacitor.platform !== 'web') return true;
        const ua = navigator?.userAgent || '';
        if (/CapacitorWebView|Capacitor\//i.test(ua)) return true;
      }
    } catch {}
    return false;
  })();
  const [showLanding, setShowLanding] = useState<boolean>(() => {
    if (isNative) return false;
    try {
      // If user previously engaged (signed in or paid) — never show landing again until logout/expiry
      if (localStorage.getItem('flowist_user_engaged') === 'true') return false;
      // If they already clicked "Get Started" (session OR persisted across reload), skip
      if (sessionStorage.getItem('flowist_landing_acknowledged') === 'true') return false;
      if (localStorage.getItem('flowist_landing_acknowledged') === 'true') return false;
      // If onboarding was already completed before, treat as engaged user — go straight to app
      if (localStorage.getItem('onboarding_completed_flag') === 'true') return false;
    } catch {}
    return true;
  });

  const { isPro, isLoading: subLoading, isVerifyingCheckout, localTrialExpired, graceExpired, isNewFreeUser } = useSubscription();
  const awaitingSubscriptionChoice = useRef(
    sessionStorage.getItem('awaitingSubscriptionChoice') === 'true'
  );

  // Check onboarding status
  useEffect(() => {
    const check = async () => {
      const completed = await getSetting<boolean>('onboarding_completed', false);
      setShowOnboarding(!completed);
    };
    check();

    // Listen for onboarding reset (e.g. sign out, subscription cancel)
    const handleReset = () => {
      awaitingSubscriptionChoice.current = false;
      sessionStorage.removeItem('awaitingSubscriptionChoice');
      setShowOnboarding(true);
      // Web: also send user back to landing page on sign-out / expiry
      if (!isNative) {
        try {
          localStorage.removeItem('flowist_user_engaged');
          localStorage.removeItem('flowist_landing_acknowledged');
          localStorage.removeItem('onboarding_completed_flag');
          sessionStorage.removeItem('flowist_landing_acknowledged');
        } catch {}
        setShowLanding(true);
      }
    };
    window.addEventListener('flowistOnboardingReset', handleReset);
    
    // Listen for landing dismissal (user clicked Get Started)
    const handleLandingDismissed = () => setShowLanding(false);
    window.addEventListener('flowistLandingDismissed', handleLandingDismissed);
    
    return () => {
      window.removeEventListener('flowistOnboardingReset', handleReset);
      window.removeEventListener('flowistLandingDismissed', handleLandingDismissed);
    };
  }, [isNative]);
  
  // Mark user as "engaged" once they're signed in or subscribed (web only)
  // This persists across refreshes so they skip landing on return visits
  useEffect(() => {
    if (isNative) return;
    if (isPro) {
      try { localStorage.setItem('flowist_user_engaged', 'true'); } catch {}
      setShowLanding(false);
      return;
    }
    // Also engage on sign-in (even without subscription)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        try { localStorage.setItem('flowist_user_engaged', 'true'); } catch {}
        setShowLanding(false);
      } else if (event === 'SIGNED_OUT') {
        try {
          localStorage.removeItem('flowist_user_engaged');
          localStorage.removeItem('flowist_landing_acknowledged');
          localStorage.removeItem('onboarding_completed_flag');
          sessionStorage.removeItem('flowist_landing_acknowledged');
        } catch {}
        setShowLanding(true);
      }
    });
    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        try { localStorage.setItem('flowist_user_engaged', 'true'); } catch {}
        setShowLanding(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [isPro, isNative]);

  // Track whether user was ever granted access this session to prevent white flash
  const wasEverPro = useRef(false);
  if (isPro) wasEverPro.current = true;

  // Handle subscription state
  useEffect(() => {
    if (subLoading || isVerifyingCheckout) return;
    
    if (isPro) {
      awaitingSubscriptionChoice.current = false;
      sessionStorage.removeItem('awaitingSubscriptionChoice');
      
      // If user is verified Pro but onboarding is still showing, auto-skip it
      // This handles: subscribed user on web who refreshes or returns after sign-out grace
      if (showOnboarding) {
        console.log('[App] Subscribed user detected — auto-skipping onboarding');
        setSetting('onboarding_completed', true).then(() => {
          startTransition(() => setShowOnboarding(false));
        });
      }
      return;
    }
    
    // Don't process non-pro logic while onboarding is active (user is going through it)
    if (showOnboarding) return;
    // Don't reset if onboarding just completed (trial/subscription state still propagating)
    if (onboardingJustCompleted.current) return;
    // Don't reset while the user is intentionally moving from onboarding to paywall/checkout
    if (awaitingSubscriptionChoice.current) return;
    // On native: if user was ever pro this session, don't reset — RC may just be slow
    if (wasEverPro.current) return;
    // Soft-paywall: brand-new free users get to use the app with limits — don't kick them back to onboarding
    if (isNewFreeUser) return;
    // No active subscription — redirect to language selection
    setSetting('onboarding_completed', false).then(() => {
      setShowOnboarding(true);
    });
  }, [isPro, subLoading, showOnboarding, isVerifyingCheckout, isNewFreeUser]);

  // Grace period after onboarding completes — prevents the subscription effect
  // from immediately resetting onboarding before trial/subscription state propagates
  const onboardingJustCompleted = useRef(false);

  const handleOnboardingComplete = useCallback(() => {
    onboardingJustCompleted.current = true;
    awaitingSubscriptionChoice.current = true;
    sessionStorage.setItem('awaitingSubscriptionChoice', 'true');
    // Persist engagement so refresh / cold start lands directly on the dashboard,
    // never the landing page again (until sign-out or subscription expiry).
    try {
      localStorage.setItem('flowist_user_engaged', 'true');
      localStorage.setItem('onboarding_completed_flag', 'true');
      sessionStorage.setItem('flowist_landing_acknowledged', 'true');
    } catch {}
    startTransition(() => {
      setShowLanding(false);
      setShowOnboarding(false);
    });
    // Ensure Notes dashboard reloads folders created during onboarding
    setTimeout(() => {
      window.dispatchEvent(new Event('foldersUpdated'));
    }, 300);
    // Clear the grace flag after subscription state has had time to update
    setTimeout(() => {
      onboardingJustCompleted.current = false;
    }, 5000);
  }, []);

  // Initialize keyboard height detection for mobile toolbar positioning
  useKeyboardHeight();
  
  // Global journey advancement - listens for task completions from any page
  useJourneyAdvancement();
  useAchievementToasts();
  useCertificateToasts();
  
  // Subscription expiry watcher — warnings + notifications
  useSubscriptionExpiry();
  
  // In-app notification listener — captures events from all sources
  useNotificationListener();

  // Listen for "secure your subscription" message (purchase without sign-up)
  useEffect(() => {
    const handler = async () => {
      try {
        const { toast: uiToast } = await import('@/components/ui/use-toast');
        uiToast({
          title: '🔒 Secure Your Subscription',
          description: 'If you want to secure your subscription, please sign up with your Google account in Profile.',
          duration: 15000,
        });
      } catch {}
    };
    window.addEventListener('showSecureSubscriptionMessage', handler);
    return () => window.removeEventListener('showSecureSubscriptionMessage', handler);
  }, []);

  // Defer non-critical sync hooks until after first paint
  const deferredInit = useRef(false);
  useEffect(() => {
    if (deferredInit.current) return;
    deferredInit.current = true;

    const init = async () => {
      const { widgetDataSync } = await import('@/utils/widgetDataSync');
      widgetDataSync.initialize().catch(console.error);
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => init(), { timeout: 2000 });
    } else {
      setTimeout(init, 200);
    }
  }, []);

  // App lock check
  useEffect(() => {
    const checkLock = async () => {
      const locked = await shouldAppBeLocked();
      setIsAppLocked(locked);
    };
    checkLock();
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Handle unlock
  const handleUnlock = async () => {
    await updateLastUnlockTime();
    setIsAppLocked(false);
  };

  // Show lock screen if locked (but not while checking)
  if (isAppLocked === true) {
    return (
      <>
        <Toaster />
        <Sonner />
        <AppLockScreen onUnlock={handleUnlock} />
      </>
    );
  }

  // Render the dashboard as soon as onboarding is complete. Free users stay in-app with
  // soft limits; don't unmount the app during subscription rechecks (causes white screen).
  const canRenderProtectedApp = showOnboarding === false;

  // Web-only: show landing page first for guests who haven't engaged yet.
  // HARD GUARD: never on native — even if state somehow became true, the platform check wins.
  if (showLanding && !isNative) {
    return (
      <>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<BrandedFallback />}>
            <Routes>
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
              <Route path="*" element={<Landing />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </>
    );
  }

  return (
    <>
      <Toaster />
      <Sonner />
      
      {showOnboarding && (
        <Suspense fallback={<BrandedFallback />}>
          <OnboardingFlow onComplete={handleOnboardingComplete} />
        </Suspense>
      )}

      
      <Suspense fallback={null}>
        <PremiumPaywall />
      </Suspense>
      

      {/* Only render app content after subscription access is fully verified */}
      {canRenderProtectedApp && (
        <>
          <Suspense fallback={null}>
            <StreakMilestoneCelebration />
            <StreakTierCelebration />
            <SmartReviewPrompt />
            <ComboOverlay />
            <EncouragementOverlay />
            <UrgentReminderOverlay />
            <SyncConflictSheet />
            <SyncProgressSheet />
          </Suspense>
          <DeferredSyncInit />
          <AppRoutes />
        </>
      )}
    </>
  );
};

// Deferred sync hooks - lazy loaded after first paint
const DeferredSyncInit = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = 'requestIdleCallback' in window
      ? requestIdleCallback(() => setReady(true), { timeout: 2000 })
      : setTimeout(() => setReady(true), 200);
    return () => {
      if ('requestIdleCallback' in window) cancelIdleCallback(id as number);
      else clearTimeout(id as ReturnType<typeof setTimeout>);
    };
  }, []);

  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <DeferredSyncHooks />
    </Suspense>
  );
};

const DeferredSyncHooks = lazy(async () => {
  const calSync = await import('@/hooks/useSystemCalendarSync');
  const SyncComponent = React.forwardRef<HTMLDivElement>(function SyncComponent(_props, _ref) {
    calSync.useSystemCalendarSync();
    return null;
  });
  return { default: SyncComponent as unknown as React.ComponentType };
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domAnimation}>
        <TooltipProvider>
          <GoogleAuthProvider>
            <DriveSyncBootstrap />
            <NotesProvider>
              <SubscriptionProvider>
                <AppContent />
              </SubscriptionProvider>
            </NotesProvider>
          </GoogleAuthProvider>
        </TooltipProvider>
      </LazyMotion>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;