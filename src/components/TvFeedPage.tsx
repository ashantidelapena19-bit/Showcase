import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { StudentPortfolio } from '../data/portfolios';
import { injectReviewBridgeScript } from '../lib/portfolioBundle';
import {
  isBlockedMixedContentUrl,
  isSameOriginPortfolioUrl,
  sanitizePortfolioUrl,
} from '../lib/portfolioUrl';
import {
  loadLastTvFeedState,
  publishTvMessage,
  subscribeTvMessages,
  type TvFeedState,
} from '../lib/tvSync';
import {
  SmoothScrollArea,
  smoothScrollElementTo,
} from './AntigravityScrollProvider';
import { SocialLinksBar } from './SocialLinksBar';

interface TvFeedPageProps {
  initialPortfolio: StudentPortfolio;
  allPortfolios: StudentPortfolio[];
  onHydratePortfolioDetail?: (portfolioId: string) => void;
}

const TV_XRAY_STYLE_ID = 'se-tv-xray-style';

export const TvFeedPage: React.FC<TvFeedPageProps> = ({
  initialPortfolio,
  allPortfolios,
  onHydratePortfolioDetail,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const showcaseScrollRef = useRef<HTMLDivElement>(null);
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [feedState, setFeedState] = useState<TvFeedState>(() => {
    const saved = loadLastTvFeedState();
    if (saved) return saved;
    return {
      portfolioId: initialPortfolio.id,
      sectionIndex: 0,
      scrollTop: 0,
      scrollRatio: 0,
      viewport: 'desktop',
      tvWebsiteOnly: true,
      xrayEnabled: false,
      spotlightDim: false,
      laserPos: null,
      strokes: [],
      highlightedRect: null,
      updatedAt: Date.now(),
    };
  });

  const activePortfolio =
    allPortfolios.find((p) => p.id === feedState.portfolioId) ?? initialPortfolio;
  const safeLiveUrl = useMemo(
    () => sanitizePortfolioUrl(activePortfolio.portfolioUrl),
    [activePortfolio.portfolioUrl]
  );
  const hasUploadedHtml = Boolean(activePortfolio.portfolioHtml?.trim());
  const awaitingUploadedHtml = Boolean(
    activePortfolio.hasUploadedHtml && !hasUploadedHtml
  );
  const hasLiveUrl = Boolean(safeLiveUrl) && !hasUploadedHtml && !awaitingUploadedHtml;
  const isCrossOriginLiveUrl =
    hasLiveUrl && !isSameOriginPortfolioUrl(safeLiveUrl);
  const isMixedContentBlocked =
    isCrossOriginLiveUrl && isBlockedMixedContentUrl(safeLiveUrl);
  const shouldEmbedLiveUrl = hasLiveUrl && !isMixedContentBlocked;
  const tvBridgeChannelId = useMemo(
    () => `tv-${activePortfolio.id}`,
    [activePortfolio.id]
  );
  const bridgedHtml = useMemo(
    () =>
      hasUploadedHtml && activePortfolio.portfolioHtml
        ? injectReviewBridgeScript(activePortfolio.portfolioHtml, tvBridgeChannelId)
        : '',
    [hasUploadedHtml, activePortfolio.portfolioHtml, tvBridgeChannelId]
  );

  useEffect(() => {
    if (awaitingUploadedHtml) {
      onHydratePortfolioDetail?.(activePortfolio.id);
    }
  }, [awaitingUploadedHtml, activePortfolio.id, onHydratePortfolioDetail]);

  // Sync subscription & TV presence handshake
  useEffect(() => {
    publishTvMessage({ type: 'TV_CONNECTED' });
    publishTvMessage({ type: 'REQUEST_STATE' });

    const unsubscribe = subscribeTvMessages((msg) => {
      if (msg.type === 'STATE_UPDATE') {
        setFeedState(msg.payload);
      }
    });

    const handleBeforeUnload = () => {
      publishTvMessage({ type: 'TV_DISCONNECTED' });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      publishTvMessage({ type: 'TV_DISCONNECTED' });
      unsubscribe();
    };
  }, []);

  const applyScrollSync = useCallback(
    (state: TvFeedState) => {
      if (hasUploadedHtml) {
        iframeRef.current?.contentWindow?.postMessage(
          {
            target: 'se-review-bridge',
            channelId: tvBridgeChannelId,
            type: 'SCROLL_RATIO',
            ratio: state.scrollRatio,
          },
          '*'
        );
        return;
      }
      if (shouldEmbedLiveUrl) {
        if (isCrossOriginLiveUrl) return;
        const iframe = iframeRef.current;
        if (!iframe) return;
        try {
          const doc = iframe.contentDocument;
          const win = iframe.contentWindow;
          if (!doc || !win) return;

          const maxScroll = Math.max(
            0,
            doc.documentElement.scrollHeight - win.innerHeight
          );
          if (maxScroll > 0) {
            win.scrollTo({
              top: Math.round(state.scrollRatio * maxScroll),
              behavior: 'auto',
            });
          } else {
            win.scrollTo({ top: state.scrollTop, behavior: 'auto' });
          }
        } catch {
          // Ignore cross-origin scroll blocks
        }
      } else {
        const container = showcaseScrollRef.current;
        if (!container) return;
        const maxScroll = Math.max(
          0,
          container.scrollHeight - container.clientHeight
        );
        if (maxScroll > 0) {
          smoothScrollElementTo(
            container,
            Math.round(state.scrollRatio * maxScroll),
            { duration: 0.45 }
          );
        }
      }
    },
    [hasUploadedHtml, shouldEmbedLiveUrl, isCrossOriginLiveUrl, tvBridgeChannelId]
  );

  // Apply scroll whenever presenter updates scrollRatio / sectionIndex
  useEffect(() => {
    applyScrollSync(feedState);
  }, [feedState, applyScrollSync]);

  // Apply or remove Layout X-Ray outlines when not in Website-Only mode
  useEffect(() => {
    const showXray = !feedState.tvWebsiteOnly && feedState.xrayEnabled;

    if (hasUploadedHtml) {
      iframeRef.current?.contentWindow?.postMessage(
        {
          target: 'se-review-bridge',
          channelId: tvBridgeChannelId,
          type: 'SET_XRAY',
          enabled: showXray,
        },
        '*'
      );
      return;
    }

    if (shouldEmbedLiveUrl) {
      if (isCrossOriginLiveUrl) return;
      const iframe = iframeRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const existing = doc.getElementById(TV_XRAY_STYLE_ID);
        if (showXray && !existing) {
          const styleEl = doc.createElement('style');
          styleEl.id = TV_XRAY_STYLE_ID;
          styleEl.textContent = `
            body header, body nav, body main, body section, body article, body footer, body div {
              outline: 1px dashed rgba(234, 76, 137, 0.45) !important;
              outline-offset: -1px !important;
            }
            body h1, body h2, body h3, body p, body button, body a {
              outline: 1px dotted rgba(56, 189, 248, 0.5) !important;
            }
          `;
          doc.head.appendChild(styleEl);
        } else if (!showXray && existing) {
          existing.remove();
        }
      } catch {
        // Cross-origin blocked
      }
    } else {
      const existing = document.getElementById(TV_XRAY_STYLE_ID);
      if (showXray && !existing) {
        const styleEl = document.createElement('style');
        styleEl.id = TV_XRAY_STYLE_ID;
        styleEl.textContent = `
          [data-tv-showcase-root] header, [data-tv-showcase-root] nav, [data-tv-showcase-root] main, [data-tv-showcase-root] section, [data-tv-showcase-root] article, [data-tv-showcase-root] footer, [data-tv-showcase-root] div {
            outline: 1px dashed rgba(234, 76, 137, 0.45) !important;
            outline-offset: -1px !important;
          }
          [data-tv-showcase-root] h1, [data-tv-showcase-root] h2, [data-tv-showcase-root] h3, [data-tv-showcase-root] p, [data-tv-showcase-root] button, [data-tv-showcase-root] a {
            outline: 1px dotted rgba(56, 189, 248, 0.5) !important;
          }
        `;
        document.head.appendChild(styleEl);
      } else if (!showXray && existing) {
        existing.remove();
      }
    }

    return () => {
      document.getElementById(TV_XRAY_STYLE_ID)?.remove();
    };
  }, [
    feedState.tvWebsiteOnly,
    feedState.xrayEnabled,
    feedState.portfolioId,
    hasUploadedHtml,
    shouldEmbedLiveUrl,
    isCrossOriginLiveUrl,
    tvBridgeChannelId,
  ]);

  // Draw normalized annotation strokes onto TV overlay canvas when overlays are active
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = stageFrameRef.current;
    if (!canvas || !frame) return;

    const dpr = window.devicePixelRatio || 1;
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (feedState.tvWebsiteOnly) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of feedState.strokes) {
      if (!stroke?.points || stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].xPct * width, stroke.points[0].yPct * height);
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].xPct * width, stroke.points[i].yPct * height);
      }
      ctx.stroke();
    }
  }, [
    feedState.strokes,
    feedState.tvWebsiteOnly,
    feedState.viewport,
    feedState.customWidth,
    feedState.customHeight,
  ]);

  const showOverlays = !feedState.tvWebsiteOnly;
  const isCustomViewport = feedState.viewport === 'custom';
  const isResponsiveViewport = feedState.viewport !== 'desktop';
  const frameWidthClass = isCustomViewport
    ? 'shrink-0 my-6 rounded-2xl border border-white/15 shadow-2xl'
    : feedState.viewport === 'mobile'
      ? 'w-[390px] max-w-full my-6 rounded-2xl border border-white/15 shadow-2xl'
      : feedState.viewport === 'tablet'
        ? 'w-[820px] max-w-full my-6 rounded-2xl border border-white/15 shadow-2xl'
        : 'w-full h-full';

  const customFrameStyle: React.CSSProperties | undefined = isCustomViewport
    ? {
        width: `${feedState.customWidth ?? 1280}px`,
        height: `${feedState.customHeight ?? 720}px`,
      }
    : undefined;

  return (
    <SmoothScrollArea
      className={`h-screen w-screen ${
        isCustomViewport ? 'overflow-auto' : 'overflow-hidden'
      } ${
        showOverlays && feedState.spotlightDim
          ? 'bg-zinc-950'
          : isResponsiveViewport
            ? 'bg-zinc-950'
            : 'bg-white'
      }`}
      contentClassName={
        isCustomViewport
          ? 'p-6 min-h-full min-w-full'
          : 'h-full w-full flex justify-center items-stretch'
      }
    >
      <div
        ref={stageFrameRef}
        style={customFrameStyle}
        className={`${frameWidthClass} ${
          isCustomViewport ? 'mx-auto my-0' : ''
        } relative overflow-hidden bg-white`}
      >
        {awaitingUploadedHtml ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--p-bg)] text-[var(--p-muted)] p-8 text-center">
            <div className="w-7 h-7 rounded-full border-2 border-[var(--p-border)] border-t-[var(--p-accent)] animate-spin" />
            <p className="text-[13px] font-medium">
              Loading uploaded website bundle...
            </p>
          </div>
        ) : hasUploadedHtml ? (
          <iframe
            key={activePortfolio.id}
            ref={iframeRef}
            sandbox="allow-scripts allow-forms allow-popups"
            srcDoc={bridgedHtml}
            onLoad={() => applyScrollSync(feedState)}
            title={`${activePortfolio.studentName} TV Presentation Feed`}
            className="w-full h-full border-0 bg-white"
          />
        ) : shouldEmbedLiveUrl ? (
          <iframe
            key={activePortfolio.id}
            ref={iframeRef}
            src={safeLiveUrl}
            sandbox={
              isCrossOriginLiveUrl
                ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox'
                : 'allow-scripts allow-same-origin allow-forms allow-popups'
            }
            referrerPolicy="no-referrer"
            onLoad={() => applyScrollSync(feedState)}
            title={`${activePortfolio.studentName} TV Presentation Feed`}
            className="w-full h-full border-0 bg-white"
          />
        ) : (
          <SmoothScrollArea
            ref={showcaseScrollRef}
            resetKey={activePortfolio.id}
            data-tv-showcase-root
            className="w-full h-full overflow-y-auto bg-[var(--p-bg)] text-[var(--p-ink)]"
          >
            <section className="p-10 md:p-16 border-b border-[var(--p-border)] grid grid-cols-1 md:grid-cols-12 gap-10 items-center min-h-[75vh]">
              <div className="md:col-span-7 space-y-5">
                <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--p-accent)]">
                  {activePortfolio.discipline} · Published Cohort Showcase
                </p>
                <h1 className="text-[clamp(2.2rem,4vw,3.5rem)] font-bold tracking-tight leading-[1.08] text-[var(--p-ink)]">
                  {activePortfolio.projectTitle}
                </h1>
                <p className="text-[17px] text-[var(--p-ink-secondary)] leading-relaxed">
                  {activePortfolio.projectSummary}
                </p>
                <div className="flex items-center gap-3.5 pt-2">
                  <span
                    className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold text-white"
                    style={{ backgroundColor: activePortfolio.avatarColor }}
                  >
                    {activePortfolio.avatarUrl ? (
                      <img
                        src={activePortfolio.avatarUrl}
                        alt={activePortfolio.studentName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      activePortfolio.initials
                    )}
                  </span>
                  <div>
                    <div className="text-[16px] font-bold text-[var(--p-ink)]">
                      {activePortfolio.studentName}
                    </div>
                    <div className="text-[13px] text-[var(--p-muted)]">
                      {activePortfolio.username
                        ? `@${activePortfolio.username} · `
                        : ''}
                      {activePortfolio.roleTitle}
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-5 aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--p-border)] bg-[var(--p-surface)]">
                {activePortfolio.thumbnail ? (
                  <img
                    src={activePortfolio.thumbnail}
                    alt={activePortfolio.projectTitle}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className={`w-full h-full bg-gradient-to-br ${activePortfolio.fallbackGradient} flex flex-col items-center justify-center p-8 text-center`}
                  >
                    <Layers className="w-10 h-10 text-white/80 mb-2" />
                    <span className="text-base font-semibold text-white">
                      {activePortfolio.projectTitle}
                    </span>
                  </div>
                )}
              </div>
            </section>

            <section className="p-10 md:p-16 border-b border-[var(--p-border)] bg-[var(--p-surface-subtle)] space-y-4">
              <h2 className="text-[26px] font-bold text-[var(--p-ink)]">
                About {activePortfolio.studentName}
              </h2>
              <p className="text-[17px] text-[var(--p-ink-secondary)] leading-relaxed max-w-4xl">
                {activePortfolio.bio || activePortfolio.projectSummary}
              </p>
            </section>

            <section className="p-10 md:p-16 border-b border-[var(--p-border)] space-y-5">
              <h2 className="text-[26px] font-bold text-[var(--p-ink)]">
                Technical Stack & Highlights
              </h2>
              <div className="flex flex-wrap gap-2.5">
                {(activePortfolio.skills ?? []).map((skill) => (
                  <span
                    key={skill}
                    className="px-4 py-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-[14px] font-semibold text-[var(--p-ink)]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </section>

            <section className="p-10 md:p-16 bg-[var(--p-surface-subtle)] space-y-5">
              <h2 className="text-[26px] font-bold text-[var(--p-ink)]">
                Social Media & Contact Links
              </h2>
              <SocialLinksBar
                links={activePortfolio.socialLinks}
                size="md"
                showLabels
              />
            </section>
          </SmoothScrollArea>
        )}

        {/* Mirrored Element Highlight Overlay (hidden in Website-Only mode) */}
        {showOverlays && feedState.highlightedRect && (
          <div
            aria-hidden="true"
            style={{
              top: `${feedState.highlightedRect.top}px`,
              left: `${feedState.highlightedRect.left}px`,
              width: `${Math.max(2, feedState.highlightedRect.width)}px`,
              height: `${Math.max(2, feedState.highlightedRect.height)}px`,
            }}
            className="pointer-events-none absolute z-20 border-2 border-cyan-500 bg-cyan-500/10"
          >
            <div className="absolute -top-6 left-0 px-2 py-0.5 rounded bg-cyan-600 text-[11px] font-[family-name:var(--font-mono)] font-semibold text-white whitespace-nowrap shadow">
              {feedState.highlightedRect.label}
            </div>
          </div>
        )}

        {/* Mirrored Laser Pointer (hidden in Website-Only mode) */}
        {showOverlays && feedState.laserPos && (
          <div
            aria-hidden="true"
            style={{
              left: `${feedState.laserPos.xPct * 100}%`,
              top: `${feedState.laserPos.yPct * 100}%`,
            }}
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-rose-500/85 ring-4 ring-rose-500/30 shadow-[0_0_24px_rgba(244,63,94,0.95)]"
          />
        )}

        {/* Mirrored Freehand Annotation Canvas (hidden in Website-Only mode) */}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 w-full h-full z-[25]"
        />
      </div>
    </SmoothScrollArea>
  );
};
