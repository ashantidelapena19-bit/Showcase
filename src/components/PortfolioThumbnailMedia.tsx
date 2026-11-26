import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { motion, MotionValue, useReducedMotion } from 'motion/react';
import type { PortfolioThumbnailMode } from '../data/portfolios';
import { injectCardPreviewHelpers } from '../lib/portfolioBundle';
import {
  isBlockedMixedContentUrl,
  isSameOriginPortfolioUrl,
  sanitizePortfolioUrl,
} from '../lib/portfolioUrl';

interface PortfolioThumbnailMediaProps {
  portfolioId: string;
  mode?: PortfolioThumbnailMode;
  title: string;
  studentName: string;
  username?: string;
  discipline?: string;
  projectSummary?: string;
  skills?: string[];
  avatarUrl?: string;
  avatarColor?: string;
  initials?: string;
  thumbnail?: string;
  fallbackGradient: string;
  portfolioHtml?: string;
  portfolioUrl?: string;
  lazy?: boolean;
  interactive?: boolean;
  parallaxY?: MotionValue<number>;
}

const VIRTUAL_WIDTH = 1280;
const VIRTUAL_HEIGHT = 960;

export const PortfolioThumbnailMedia: React.FC<PortfolioThumbnailMediaProps> = ({
  portfolioId,
  mode,
  title,
  studentName,
  username,
  discipline = 'Full-Stack',
  projectSummary,
  skills = [],
  avatarUrl,
  avatarColor = '#1E293B',
  initials = 'SE',
  thumbnail,
  fallbackGradient,
  portfolioHtml,
  portfolioUrl,
  lazy = true,
  interactive = false,
  parallaxY,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const [imgError, setImgError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(380);
  const [hasEnteredViewport, setHasEnteredViewport] = useState<boolean>(!lazy);

  const safeLiveUrl = useMemo(
    () => sanitizePortfolioUrl(portfolioUrl),
    [portfolioUrl]
  );
  const hasUploadedHtml = Boolean(portfolioHtml?.trim());
  const hasLiveUrl = Boolean(safeLiveUrl) && !hasUploadedHtml;
  const isSameOriginUrl = hasLiveUrl && isSameOriginPortfolioUrl(safeLiveUrl);
  const isMixedContentBlocked =
    hasLiveUrl && !isSameOriginUrl && isBlockedMixedContentUrl(safeLiveUrl);

  const effectiveMode: PortfolioThumbnailMode = useMemo(() => {
    if (mode === 'homepage' || mode === 'image' || mode === 'live') {
      return mode;
    }
    if (thumbnail?.trim()) return 'image';
    if (hasUploadedHtml || hasLiveUrl) return 'homepage';
    return 'image';
  }, [mode, thumbnail, hasUploadedHtml, hasLiveUrl]);

  // Reset image/iframe loading states when media inputs change
  useEffect(() => {
    setImgError(false);
  }, [thumbnail]);

  useEffect(() => {
    setIframeLoaded(false);
  }, [portfolioId, effectiveMode, portfolioHtml, safeLiveUrl]);

  // Track exact container width for crisp 1280x960 -> card aspect scaling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };
    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Lazy-mount offscreen live/homepage iframes until near viewport
  useEffect(() => {
    if (!lazy || hasEnteredViewport) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setHasEnteredViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasEnteredViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '360px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lazy, hasEnteredViewport]);

  const preparedHtml = useMemo(() => {
    if (!hasUploadedHtml || !portfolioHtml) return '';
    if (effectiveMode !== 'homepage' && effectiveMode !== 'live') return '';
    return injectCardPreviewHelpers(portfolioHtml, {
      freezeAnimations: effectiveMode === 'homepage',
    });
  }, [hasUploadedHtml, portfolioHtml, effectiveMode]);

  const handleIframeLoad = () => {
    setIframeLoaded(true);
    if (
      effectiveMode === 'homepage' &&
      hasLiveUrl &&
      isSameOriginUrl &&
      iframeRef.current
    ) {
      const iframe = iframeRef.current;
      window.setTimeout(() => {
        try {
          const doc = iframe.contentDocument;
          const win = iframe.contentWindow;
          if (!doc) return;
          win?.scrollTo(0, 0);
          if (!doc.getElementById('se-card-freeze-style')) {
            const styleEl = doc.createElement('style');
            styleEl.id = 'se-card-freeze-style';
            styleEl.textContent = `
              html, body { overflow: hidden !important; }
              *, *::before, *::after {
                animation-play-state: paused !important;
                transition: none !important;
                scroll-behavior: auto !important;
              }
            `;
            doc.head?.appendChild(styleEl);
          }
        } catch {
          // Ignore cross-origin frame restrictions
        }
      }, 650);
    }
  };

  const renderGradientFallback = () => (
    <div
      className={`w-full h-full bg-gradient-to-br ${fallbackGradient} flex flex-col items-center justify-center p-6 text-center`}
    >
      <Layers className="w-8 h-8 text-white/80 mb-2" />
      <span className="text-sm font-semibold text-white line-clamp-2">
        {title}
      </span>
      {username && (
        <span className="text-[11px] text-white/70 mt-1">@{username}</span>
      )}
    </div>
  );

  const renderImageOrFallback = () => {
    if (thumbnail?.trim() && !imgError) {
      if (parallaxY && !shouldReduceMotion) {
        return (
          <motion.div
            key={thumbnail}
            style={{ y: parallaxY }}
            className="w-full h-full scale-[1.06] will-change-transform"
          >
            <img
              key={thumbnail}
              src={thumbnail}
              alt={`${title} by ${studentName}`}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </motion.div>
        );
      }
      return (
        <img
          key={thumbnail}
          src={thumbnail}
          alt={`${title} by ${studentName}`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      );
    }
    return renderGradientFallback();
  };

  const scale = containerWidth / VIRTUAL_WIDTH;

  const renderShowcaseHeroFrame = (animated: boolean) => (
    <div
      style={{
        width: `${VIRTUAL_WIDTH}px`,
        height: `${VIRTUAL_HEIGHT}px`,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
      className="pointer-events-none select-none bg-[var(--p-bg)] text-[var(--p-ink)] p-14 flex flex-col justify-between relative overflow-hidden"
    >
      {animated && !shouldReduceMotion && (
        <motion.div
          aria-hidden="true"
          animate={{ x: [-24, 24, -24], y: [-14, 18, -14], scale: [1, 1.08, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-24 -right-24 w-[520px] h-[520px] rounded-full bg-[var(--p-accent)]/12 blur-3xl pointer-events-none"
        />
      )}

      <div className="flex items-center justify-between border-b border-[var(--p-border)] pb-6 relative z-10">
        <div className="flex items-center gap-4">
          <span
            className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-base font-bold text-white shrink-0"
            style={{ backgroundColor: avatarColor }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={studentName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </span>
          <div>
            <div className="text-[20px] font-bold text-[var(--p-ink)]">
              {studentName}
            </div>
            <div className="text-[15px] text-[var(--p-muted)]">
              {username ? `@${username} · ` : ''}
              {discipline}
            </div>
          </div>
        </div>
        <span className="text-[15px] font-semibold text-[var(--p-accent)]">
          Software Engineering Class A
        </span>
      </div>

      <div className="grid grid-cols-12 gap-12 items-center my-auto py-8 relative z-10">
        <div className="col-span-7 space-y-6">
          <p className="text-[16px] font-semibold uppercase tracking-wider text-[var(--p-accent)]">
            {discipline} Portfolio
          </p>
          <h3 className="text-[54px] font-bold tracking-tight leading-[1.06] text-[var(--p-ink)] line-clamp-3">
            {title}
          </h3>
          {projectSummary && (
            <p className="text-[22px] text-[var(--p-ink-secondary)] leading-relaxed line-clamp-3">
              {projectSummary}
            </p>
          )}
        </div>
        <div className="col-span-5 aspect-[4/3] rounded-3xl overflow-hidden border border-[var(--p-border)] bg-[var(--p-surface)] shadow-xl">
          {thumbnail?.trim() && !imgError ? (
            <img
              src={thumbnail}
              alt={title}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className={`w-full h-full bg-gradient-to-br ${fallbackGradient} flex flex-col items-center justify-center p-8 text-center`}
            >
              <Layers className="w-16 h-16 text-white/80 mb-4" />
              <span className="text-[24px] font-bold text-white line-clamp-2">
                {title}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6 text-[17px] font-medium text-[var(--p-muted)] border-t border-[var(--p-border)] pt-6 relative z-10">
        {(skills.length > 0 ? skills : ['TypeScript', 'React']).slice(0, 5).map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <span aria-hidden="true">·</span>}
            <span>{s}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  // Mode: Custom Image
  if (effectiveMode === 'image') {
    return (
      <div ref={containerRef} className="w-full h-full relative overflow-hidden">
        {renderImageOrFallback()}
      </div>
    );
  }

  // Modes: Portfolio Home Page ('homepage') or Live Animated View ('live')
  const canRenderUploadedHtml = hasUploadedHtml && Boolean(preparedHtml);
  const canRenderLiveUrl = hasLiveUrl && !isMixedContentBlocked;

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-[var(--p-surface)]"
    >
      {canRenderUploadedHtml ? (
        <>
          <div className="absolute inset-0 z-0">{renderImageOrFallback()}</div>
          {hasEnteredViewport && (
            <iframe
              key={`${portfolioId}-${effectiveMode}-html`}
              ref={iframeRef}
              sandbox="allow-scripts allow-forms allow-popups"
              srcDoc={preparedHtml}
              scrolling="no"
              tabIndex={interactive ? 0 : -1}
              aria-hidden={!interactive}
              onLoad={() => setIframeLoaded(true)}
              title={`${title} ${effectiveMode === 'live' ? 'live website preview' : 'home page preview'}`}
              style={{
                width: `${VIRTUAL_WIDTH}px`,
                height: `${VIRTUAL_HEIGHT}px`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
              className={`absolute top-0 left-0 z-10 border-0 bg-white transition-opacity duration-200 ${
                iframeLoaded ? 'opacity-100' : 'opacity-0'
              } ${interactive ? 'pointer-events-auto' : 'pointer-events-none select-none'}`}
            />
          )}
        </>
      ) : canRenderLiveUrl ? (
        <>
          <div className="absolute inset-0 z-0">{renderImageOrFallback()}</div>
          {hasEnteredViewport && (
            <iframe
              key={`${portfolioId}-${effectiveMode}-url-${safeLiveUrl}`}
              ref={iframeRef}
              src={safeLiveUrl}
              sandbox={
                !isSameOriginUrl
                  ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox'
                  : effectiveMode === 'homepage'
                    ? 'allow-scripts allow-same-origin allow-forms'
                    : 'allow-scripts allow-forms'
              }
              referrerPolicy="no-referrer"
              scrolling="no"
              loading={lazy ? 'lazy' : 'eager'}
              tabIndex={interactive ? 0 : -1}
              aria-hidden={!interactive}
              onLoad={handleIframeLoad}
              title={`${title} ${effectiveMode === 'live' ? 'live website preview' : 'home page preview'}`}
              style={{
                width: `${VIRTUAL_WIDTH}px`,
                height: `${VIRTUAL_HEIGHT}px`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
              className={`absolute top-0 left-0 z-10 border-0 bg-white transition-opacity duration-200 ${
                iframeLoaded ? 'opacity-100' : 'opacity-0'
              } ${interactive ? 'pointer-events-auto' : 'pointer-events-none select-none'}`}
            />
          )}
        </>
      ) : isMixedContentBlocked ? (
        renderImageOrFallback()
      ) : (
        renderShowcaseHeroFrame(effectiveMode === 'live')
      )}
    </div>
  );
};
