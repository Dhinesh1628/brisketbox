import React, { useState, useEffect, useCallback } from 'react';

const SPLASH_SESSION_KEY = 'brisketbox_splash_seen';
const ANIMATION_DURATION_MS = 1600;
const FADE_OUT_DURATION_MS = 400;

export const SplashIntro: React.FC = () => {
  const [shouldRender, setShouldRender] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (sessionStorage.getItem(SPLASH_SESSION_KEY) === 'true') {
        return false;
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        sessionStorage.setItem(SPLASH_SESSION_KEY, 'true');
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });

  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);

  const dismiss = useCallback(() => {
    setIsFadingOut(true);
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, 'true');
    } catch {
      // Ignore storage errors in private browsing modes
    }

    const timer = setTimeout(() => {
      setShouldRender(false);
    }, FADE_OUT_DURATION_MS);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!shouldRender) return;

    // Automatically transition out after the animation duration
    const displayTimer = setTimeout(() => {
      dismiss();
    }, ANIMATION_DURATION_MS);

    // Keyboard dismissal
    const handleKeyDown = () => {
      dismiss();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(displayTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shouldRender, dismiss]);

  if (!shouldRender) return null;

  return (
    <div
      onClick={dismiss}
      role="status"
      aria-label="BrisketBox opening intro"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none cursor-pointer bg-white dark:bg-[#080c14] transition-opacity duration-400 ease-in-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
      }`}
    >
      <div className="relative p-2 flex flex-col items-center">
        <img
          src="/images/logo.webp"
          alt="BrisketBox - Freshness, Sealed with Flavour"
          className="h-16 sm:h-20 w-auto object-contain dark:hidden animate-splash-logo"
        />
        <img
          src="/images/logo-dark.webp"
          alt="BrisketBox - Freshness, Sealed with Flavour"
          className="h-16 sm:h-20 w-auto object-contain hidden dark:block animate-splash-logo"
        />
      </div>

      <div className="absolute bottom-5 text-[10px] text-gray-400 dark:text-gray-500 font-mono tracking-wider">
        Click anywhere to skip
      </div>
    </div>
  );
};
