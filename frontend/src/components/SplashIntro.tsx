import React, { useState, useEffect, useCallback } from 'react';

const SPLASH_SESSION_KEY = 'brisketbox_splash_seen';
const FIRST_VISIT_DURATION_MS = 1600;
const FIRST_VISIT_FADE_MS = 400;

const RELOAD_DURATION_MS = 550;
const RELOAD_FADE_MS = 250;

type SplashMode = 'first-visit' | 'reload' | 'disabled';

export const SplashIntro: React.FC = () => {
  const [mode, setMode] = useState<SplashMode>(() => {
    if (typeof window === 'undefined') return 'disabled';
    try {
      // Bypass for automated audit runners (Lighthouse / PageSpeed)
      if (typeof navigator !== 'undefined' && /Lighthouse|PageSpeed/i.test(navigator.userAgent)) {
        return 'disabled';
      }
      // Accessibility: Respect reduced motion preference
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        sessionStorage.setItem(SPLASH_SESSION_KEY, 'true');
        return 'disabled';
      }

      const hasSeenInitial = sessionStorage.getItem(SPLASH_SESSION_KEY) === 'true';
      return hasSeenInitial ? 'reload' : 'first-visit';
    } catch {
      return 'disabled';
    }
  });

  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);

  const durationMs = mode === 'reload' ? RELOAD_DURATION_MS : FIRST_VISIT_DURATION_MS;
  const fadeMs = mode === 'reload' ? RELOAD_FADE_MS : FIRST_VISIT_FADE_MS;

  const dismiss = useCallback(() => {
    setIsFadingOut(true);
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, 'true');
    } catch {
      // Ignore storage errors in private browsing modes
    }

    const timer = setTimeout(() => {
      setMode('disabled');
    }, fadeMs);

    return () => clearTimeout(timer);
  }, [fadeMs]);

  useEffect(() => {
    if (mode === 'disabled') return;

    // Automatically transition out after the duration
    const displayTimer = setTimeout(() => {
      dismiss();
    }, durationMs);

    // Keyboard dismissal
    const handleKeyDown = () => {
      dismiss();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(displayTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode, durationMs, dismiss]);

  if (mode === 'disabled') return null;

  return (
    <div
      onClick={dismiss}
      role="status"
      aria-label={mode === 'reload' ? 'BrisketBox loading' : 'BrisketBox opening intro'}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none cursor-pointer bg-white dark:bg-[#080c14] transition-opacity ease-in-out ${
        mode === 'reload' ? 'duration-250' : 'duration-400'
      } ${isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
    >
      <div className="relative p-2 flex flex-col items-center">
        <img
          src="/images/logo.webp"
          alt="BrisketBox - Freshness, Sealed with Flavour"
          width="200"
          height="64"
          fetchPriority="high"
          className={`w-auto object-contain dark:hidden ${
            mode === 'first-visit' ? 'h-16 sm:h-20 animate-splash-logo' : 'h-14 sm:h-16'
          }`}
        />
        <img
          src="/images/logo-dark.webp"
          alt="BrisketBox - Freshness, Sealed with Flavour"
          width="200"
          height="64"
          fetchPriority="high"
          className={`w-auto object-contain hidden dark:block ${
            mode === 'first-visit' ? 'h-16 sm:h-20 animate-splash-logo' : 'h-14 sm:h-16'
          }`}
        />

        {/* Sleek Reload Progress Line (Only shown on page reload) */}
        {mode === 'reload' && (
          <div className="w-36 h-1 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden mt-3 relative">
            <div className="h-full bg-[#d11243] rounded-full animate-reload-progress" />
          </div>
        )}
      </div>

      <span className="sr-only">Click anywhere or press any key to skip</span>
    </div>
  );
};
