import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import Lenis from 'lenis';
import { MotionConfig } from 'motion/react';

interface ScrollToOptions {
  offset?: number;
  duration?: number;
  immediate?: boolean;
}

interface AntigravityScrollContextValue {
  scrollTo: (
    target: string | number | HTMLElement,
    options?: ScrollToOptions
  ) => void;
  pauseScroll: () => void;
  resumeScroll: () => void;
}

type SmoothScrollElement = HTMLElement & { __lenis?: Lenis };

interface RefreshScrollProfile {
  lerp: number;
  wheelMultiplier: number;
  byLerp: number;
  programmaticDurationScale: number;
}

const HIGH_REFRESH_PROFILE: RefreshScrollProfile = {
  lerp: 0.078,
  wheelMultiplier: 0.94,
  byLerp: 0.095,
  programmaticDurationScale: 1,
};

const STANDARD_60HZ_PROFILE: RefreshScrollProfile = {
  // Higher exponential damping lambda at 60Hz avoids <1px/frame deceleration tail judder
  // and ensures instant frame-1 wheel response at 16.67ms frame intervals.
  lerp: 0.118,
  wheelMultiplier: 1,
  byLerp: 0.135,
  programmaticDurationScale: 0.85,
};

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function computeProfileForFps(fps: number): RefreshScrollProfile {
  // Smooth blend between 60Hz (<=75Hz -> t=0) and high-refresh (>=105Hz -> t=1)
  const t = Math.max(0, Math.min(1, (fps - 75) / 30));
  return {
    lerp: Number(mix(STANDARD_60HZ_PROFILE.lerp, HIGH_REFRESH_PROFILE.lerp, t).toFixed(4)),
    wheelMultiplier: Number(
      mix(
        STANDARD_60HZ_PROFILE.wheelMultiplier,
        HIGH_REFRESH_PROFILE.wheelMultiplier,
        t
      ).toFixed(3)
    ),
    byLerp: Number(
      mix(STANDARD_60HZ_PROFILE.byLerp, HIGH_REFRESH_PROFILE.byLerp, t).toFixed(4)
    ),
    programmaticDurationScale: Number(
      mix(
        STANDARD_60HZ_PROFILE.programmaticDurationScale,
        HIGH_REFRESH_PROFILE.programmaticDurationScale,
        t
      ).toFixed(3)
    ),
  };
}

/**
 * Shared single-RAF virtual clock and live display refresh-rate calibrator.
 * - Drives all Lenis instances (window + SmoothScrollArea) from one RAF tick.
 * - Clamps delta spikes (GC/tab switch/render hitch <= 33.34ms) so scroll never jumps.
 * - Measures real vsync cadence so 60Hz, 75Hz, 90Hz, 120Hz, and 144Hz monitors
 *   each receive calibrated exponential damping without tail micro-judder.
 */
class AdaptiveScrollClock {
  private instances = new Set<Lenis>();
  private rafId = 0;
  private lastRawTime = 0;
  private virtualTime = 0;
  private deltaSamples: number[] = [];
  // Default conservatively to 60Hz until high-refresh frames are observed
  private currentProfile: RefreshScrollProfile = { ...STANDARD_60HZ_PROFILE };
  private visibilityListenerAttached = false;

  getProfile(): RefreshScrollProfile {
    return this.currentProfile;
  }

  register(instance: Lenis): () => void {
    this.instances.add(instance);
    this.applyProfileToInstance(instance, this.currentProfile);
    this.ensureRunning();

    return () => {
      this.instances.delete(instance);
      if (this.instances.size === 0) {
        this.stop();
      }
    };
  }

  private applyProfileToInstance(
    instance: Lenis,
    profile: RefreshScrollProfile
  ): void {
    instance.options.lerp = profile.lerp;
    instance.options.wheelMultiplier = profile.wheelMultiplier;
    const virtualScroll = Reflect.get(instance, 'virtualScroll') as
      | { options?: { wheelMultiplier: number } }
      | undefined;
    if (virtualScroll?.options) {
      virtualScroll.options.wheelMultiplier = profile.wheelMultiplier;
    }
  }

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.lastRawTime = 0;
    }
  };

  private ensureRunning(): void {
    if (!this.visibilityListenerAttached && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListenerAttached = true;
    }
    if (!this.rafId && typeof window !== 'undefined') {
      this.lastRawTime = 0;
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private stop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.lastRawTime = 0;
  }

  private updateRefreshRateEstimate(rawDeltaMs: number): void {
    // Only sample clean vsync frame intervals (40Hz..285Hz)
    if (rawDeltaMs < 3.5 || rawDeltaMs > 25) return;

    this.deltaSamples.push(rawDeltaMs);
    if (this.deltaSamples.length > 18) {
      this.deltaSamples.shift();
    }
    if (this.deltaSamples.length < 8) return;

    const sorted = [...this.deltaSamples].sort((a, b) => a - b);
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    const estimatedFps = 1000 / medianMs;
    const next = computeProfileForFps(estimatedFps);

    if (
      Math.abs(next.lerp - this.currentProfile.lerp) > 0.002 ||
      Math.abs(next.wheelMultiplier - this.currentProfile.wheelMultiplier) > 0.005
    ) {
      this.currentProfile = next;
      this.instances.forEach((inst) => this.applyProfileToInstance(inst, next));
    }
  }

  private tick = (now: number): void => {
    if (this.instances.size === 0) {
      this.rafId = 0;
      return;
    }

    if (this.lastRawTime === 0) {
      this.lastRawTime = now;
      this.virtualTime = now;
    } else {
      const rawDelta = now - this.lastRawTime;
      this.lastRawTime = now;
      this.updateRefreshRateEstimate(rawDelta);
      // Cap frame delta at 2x 60Hz frame (33.34ms) so momentary stalls stay smooth
      const clampedDelta = Math.min(Math.max(rawDelta, 1), 33.34);
      this.virtualTime += clampedDelta;
    }

    const vt = this.virtualTime;
    this.instances.forEach((instance) => {
      instance.raf(vt);
    });

    this.rafId = requestAnimationFrame(this.tick);
  };
}

const sharedScrollClock = new AdaptiveScrollClock();

const AntigravityScrollContext = createContext<AntigravityScrollContextValue>({
  scrollTo: () => {},
  pauseScroll: () => {},
  resumeScroll: () => {},
});

export const useAntigravityScroll = () => useContext(AntigravityScrollContext);

// Smooth exponential deceleration curve used only for explicit programmatic jumps
export const antigravityEase = (t: number) =>
  t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

export function smoothScrollElementTo(
  el: HTMLElement | null | undefined,
  top: number,
  options?: { immediate?: boolean; duration?: number }
) {
  if (!el) return;
  const lenis = (el as SmoothScrollElement).__lenis;
  if (lenis) {
    const scale = sharedScrollClock.getProfile().programmaticDurationScale;
    lenis.scrollTo(top, {
      duration: (options?.duration ?? 1.1) * scale,
      immediate: options?.immediate ?? false,
      easing: antigravityEase,
    });
    return;
  }
  el.scrollTo({
    top,
    behavior: options?.immediate ? 'auto' : 'smooth',
  });
}

export function smoothScrollElementBy(
  el: HTMLElement | null | undefined,
  deltaTop: number,
  deltaLeft = 0
) {
  if (!el) return;
  if (deltaLeft !== 0) {
    el.scrollBy({ left: deltaLeft, behavior: 'auto' });
  }
  if (deltaTop === 0) return;

  const lenis = (el as SmoothScrollElement).__lenis;
  if (lenis) {
    const nextTarget = Math.max(
      0,
      Math.min(lenis.limit, lenis.targetScroll + deltaTop)
    );
    // Omit easing/duration so Lenis keeps continuous exponential damp() without kinks
    lenis.scrollTo(nextTarget, {
      lerp: sharedScrollClock.getProfile().byLerp,
    });
    return;
  }
  el.scrollBy({ top: deltaTop, behavior: 'auto' });
}

interface SmoothScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  contentClassName?: string;
  overscroll?: boolean;
  resetKey?: string | number | null;
}

/**
 * Reusable Lenis-powered scrollable container for modals, drawers, inspector panels,
 * showcase stages, and scrollable lists. Isolates wheel events from the outer window
 * Lenis instance while preserving native textarea and horizontal trackpad scrolling.
 */
export const SmoothScrollArea = forwardRef<HTMLDivElement, SmoothScrollAreaProps>(
  (
    {
      children,
      className = '',
      contentClassName = '',
      overscroll = false,
      resetKey,
      ...rest
    },
    forwardedRef
  ) => {
    const localWrapperRef = useRef<SmoothScrollElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const lenisInstanceRef = useRef<Lenis | null>(null);

    const assignRefs = useCallback(
      (node: HTMLDivElement | null) => {
        localWrapperRef.current = node as SmoothScrollElement | null;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    useEffect(() => {
      const wrapper = localWrapperRef.current;
      const content = contentRef.current;
      if (!wrapper || !content) return;

      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;
      if (prefersReducedMotion) return;

      const profile = sharedScrollClock.getProfile();
      // Do NOT set `easing` on the constructor: Lenis forces `duration = 1` when
      // `easing` is provided without `duration`, bypassing exponential `lerp` damping.
      const lenis = new Lenis({
        wrapper,
        content,
        eventsTarget: wrapper,
        lerp: profile.lerp,
        smoothWheel: true,
        wheelMultiplier: profile.wheelMultiplier,
        touchMultiplier: 1.4,
        autoRaf: false,
        autoToggle: true,
        overscroll,
        prevent: (node) =>
          node.tagName === 'TEXTAREA' ||
          node.hasAttribute('data-lenis-prevent-inner'),
        virtualScroll: (data) =>
          Math.abs(data.deltaY) >= Math.abs(data.deltaX),
      });

      wrapper.__lenis = lenis;
      lenisInstanceRef.current = lenis;
      const unregisterClock = sharedScrollClock.register(lenis);

      return () => {
        unregisterClock();
        lenisInstanceRef.current = null;
        if (wrapper.__lenis === lenis) {
          delete wrapper.__lenis;
        }
        lenis.destroy();
      };
    }, [overscroll]);

    useEffect(() => {
      if (resetKey === undefined) return;
      const wrapper = localWrapperRef.current;
      const lenis = lenisInstanceRef.current;
      if (lenis) {
        lenis.resize();
        lenis.scrollTo(0, { immediate: true });
      } else if (wrapper) {
        wrapper.scrollTo({ top: 0, behavior: 'auto' });
      }
    }, [resetKey]);

    return (
      <div
        ref={assignRefs}
        data-lenis-prevent
        className={className}
        {...rest}
      >
        <div ref={contentRef} className={contentClassName}>
          {children}
        </div>
      </div>
    );
  }
);

SmoothScrollArea.displayName = 'SmoothScrollArea';

export const AntigravityScrollProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const lenisRef = useRef<Lenis | null>(null);
  const pauseDepthRef = useRef(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) {
      return;
    }

    const profile = sharedScrollClock.getProfile();
    // Use pure `lerp` exponential damping for wheel scrolling (no constructor `easing`)
    const lenis = new Lenis({
      lerp: profile.lerp,
      smoothWheel: true,
      wheelMultiplier: profile.wheelMultiplier,
      touchMultiplier: 1.4,
      autoRaf: false,
    });

    lenisRef.current = lenis;
    const unregisterClock = sharedScrollClock.register(lenis);

    // Intercept internal anchor links for damped inertia anchor navigation
    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!anchor) return;

      const hash = anchor.getAttribute('href');
      if (!hash || hash === '#') return;

      const el =
        hash === '#top'
          ? (document.getElementById('top') ?? document.documentElement)
          : document.querySelector<HTMLElement>(hash);

      if (!el) return;
      event.preventDefault();

      const durationScale = sharedScrollClock.getProfile().programmaticDurationScale;
      lenis.scrollTo(hash === '#top' ? 0 : el, {
        offset: hash === '#top' ? 0 : -76,
        duration: 1.18 * durationScale,
        easing: antigravityEase,
      });
    };

    document.addEventListener('click', handleAnchorClick);

    return () => {
      document.removeEventListener('click', handleAnchorClick);
      unregisterClock();
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const scrollTo = useCallback(
    (target: string | number | HTMLElement, options?: ScrollToOptions) => {
      const lenis = lenisRef.current;
      if (lenis) {
        const durationScale = sharedScrollClock.getProfile().programmaticDurationScale;
        lenis.scrollTo(target, {
          offset: options?.offset ?? -76,
          duration: (options?.duration ?? 1.15) * durationScale,
          immediate: options?.immediate ?? false,
          easing: antigravityEase,
        });
        return;
      }

      // Reduced-motion / fallback path
      if (typeof target === 'number') {
        window.scrollTo({ top: target, behavior: 'auto' });
      } else if (typeof target === 'string') {
        const el = document.querySelector<HTMLElement>(target);
        el?.scrollIntoView({ behavior: 'auto' });
      } else {
        target.scrollIntoView({ behavior: 'auto' });
      }
    },
    []
  );

  const pauseScroll = useCallback(() => {
    pauseDepthRef.current += 1;
    lenisRef.current?.stop();
  }, []);

  const resumeScroll = useCallback(() => {
    pauseDepthRef.current = Math.max(0, pauseDepthRef.current - 1);
    if (pauseDepthRef.current === 0) {
      lenisRef.current?.start();
    }
  }, []);

  const value = useMemo(
    () => ({ scrollTo, pauseScroll, resumeScroll }),
    [scrollTo, pauseScroll, resumeScroll]
  );

  return (
    <AntigravityScrollContext.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </AntigravityScrollContext.Provider>
  );
};
