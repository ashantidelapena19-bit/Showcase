import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Crosshair,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode,
  Globe,
  Layers,
  ListTree,
  Maximize2,
  Minimize2,
  Monitor,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Pencil,
  Pin,
  Play,
  RotateCcw,
  Search,
  Smartphone,
  Sparkles,
  Tablet,
  Timer,
  Tv,
  Undo2,
} from 'lucide-react';
import { StudentPortfolio } from '../data/portfolios';
import { injectReviewBridgeScript } from '../lib/portfolioBundle';
import {
  isBlockedMixedContentUrl,
  isSameOriginPortfolioUrl,
  sanitizePortfolioUrl,
} from '../lib/portfolioUrl';
import {
  publishTvMessage,
  subscribeTvMessages,
  type TvFeedState,
} from '../lib/tvSync';
import {
  SmoothScrollArea,
  smoothScrollElementBy,
  smoothScrollElementTo,
} from './AntigravityScrollProvider';
import { SocialLinksBar } from './SocialLinksBar';

interface PortfolioReviewPageProps {
  portfolio: StudentPortfolio;
  allPortfolios: StudentPortfolio[];
  onSelectPortfolio: (next: StudentPortfolio) => void;
  onNavigateGallery: () => void;
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile' | 'custom';
type PresentationTool = 'interact' | 'inspect' | 'laser' | 'draw';
type InspectorTab = 'sections' | 'inspector' | 'code' | 'dom';
type CodeTab = 'all' | 'html' | 'css' | 'js';

interface DetectedSection {
  id: string;
  label: string;
  tag: string;
  top: number;
  height: number;
  selector: string;
  element?: HTMLElement;
}

interface ElementSnapshot {
  key: string;
  tag: string;
  id: string;
  classes: string[];
  selector: string;
  breadcrumb: string[];
  rect: { top: number; left: number; width: number; height: number };
  styles: {
    display: string;
    position: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    color: string;
    backgroundColor: string;
    padding: string;
    margin: string;
    borderRadius: string;
    gridTemplateColumns: string;
    flexDirection: string;
  };
  outerHtml: string;
  textPreview: string;
}

interface DomTreeNode {
  key: string;
  nodeId?: string;
  tag: string;
  id: string;
  classes: string[];
  label: string;
  depth: number;
  element?: HTMLElement;
}

type PenAnchorMode = 'document' | 'screen';

interface DrawStroke {
  color: string;
  anchor: PenAnchorMode;
  points: { x: number; y: number }[];
}

const PEN_COLORS = [
  { name: 'Accent Pink', value: '#ea4c89' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Emerald', value: '#10b981' },
] as const;

const XRAY_STYLE_ID = 'se-review-xray-style';

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function buildSelectorLabel(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = Array.from(el.classList)
    .slice(0, 2)
    .map((c) => `.${c}`)
    .join('');
  return `${tag}${id}${cls}`;
}

function resolveHtmlTarget(
  rawTarget: EventTarget | null,
  win: Window
): HTMLElement | null {
  if (!rawTarget || typeof rawTarget !== 'object') return null;
  const winWithHtml = win as Window & { HTMLElement?: typeof HTMLElement };
  const isHtml = (node: unknown): node is HTMLElement =>
    Boolean(
      node &&
        ((winWithHtml.HTMLElement && node instanceof winWithHtml.HTMLElement) ||
          node instanceof HTMLElement)
    );

  if (isHtml(rawTarget)) return rawTarget;

  const node = rawTarget as Node;
  if (node.nodeType === 1) {
    let cursor: Element | null = rawTarget as Element;
    while (cursor) {
      if (isHtml(cursor)) return cursor;
      cursor = cursor.parentElement;
    }
  }
  return null;
}

function extractElementSnapshot(
  el: HTMLElement,
  win: Window,
  containerRect?: DOMRect,
  zoom = 1
): ElementSnapshot {
  const rawRect = el.getBoundingClientRect();
  const computed = win.getComputedStyle(el);

  const safeZoom = zoom > 0 ? zoom : 1;
  const top = containerRect
    ? (rawRect.top - containerRect.top) / safeZoom
    : rawRect.top;
  const left = containerRect
    ? (rawRect.left - containerRect.left) / safeZoom
    : rawRect.left;
  const width = containerRect ? rawRect.width / safeZoom : rawRect.width;
  const height = containerRect ? rawRect.height / safeZoom : rawRect.height;

  const breadcrumb: string[] = [];
  let cursor: HTMLElement | null = el;
  while (cursor && cursor.tagName.toLowerCase() !== 'html' && breadcrumb.length < 6) {
    breadcrumb.unshift(buildSelectorLabel(cursor));
    cursor = cursor.parentElement;
  }

  const rawHtml = el.outerHTML || '';
  const trimmedHtml =
    rawHtml.length > 1400 ? `${rawHtml.slice(0, 1400)}\n<!-- ...truncated -->` : rawHtml;

  const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();

  return {
    key: `${buildSelectorLabel(el)}-${Math.round(rawRect.top)}-${Math.round(rawRect.left)}`,
    tag: el.tagName.toLowerCase(),
    id: el.id || '',
    classes: Array.from(el.classList),
    selector: buildSelectorLabel(el),
    breadcrumb,
    rect: {
      top,
      left,
      width,
      height,
    },
    styles: {
      display: computed.display,
      position: computed.position,
      fontFamily: computed.fontFamily.split(',')[0]?.replace(/['"]/g, '') || computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      padding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
      margin: `${computed.marginTop} ${computed.marginRight} ${computed.marginBottom} ${computed.marginLeft}`,
      borderRadius: computed.borderRadius,
      gridTemplateColumns: computed.gridTemplateColumns,
      flexDirection: computed.flexDirection,
    },
    outerHtml: trimmedHtml,
    textPreview: text.slice(0, 90),
  };
}

function parseSourceSegments(raw: string): {
  all: string;
  html: string;
  css: string;
  js: string;
} {
  if (!raw.trim()) {
    return { all: '', html: '', css: '', js: '' };
  }

  const styleMatches = Array.from(raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi));
  const scriptMatches = Array.from(raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi));
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  const css = styleMatches.map((m) => m[1].trim()).filter(Boolean).join('\n\n/* --- */\n\n');
  const js = scriptMatches
    .map((m) => m[1].trim())
    .filter(Boolean)
    .join('\n\n// ---\n\n');
  const html = (bodyMatch ? bodyMatch[1] : raw)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '<!-- <script>...</script> -->')
    .trim();

  return {
    all: raw.trim(),
    html: html || raw.trim(),
    css: css || '/* No inline <style> blocks found in this document. */',
    js: js || '// No inline <script> blocks found in this document.',
  };
}

export const PortfolioReviewPage: React.FC<PortfolioReviewPageProps> = ({
  portfolio,
  allPortfolios,
  onSelectPortfolio,
  onNavigateGallery,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const showcaseScrollRef = useRef<HTMLDivElement>(null);
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [customWidth, setCustomWidth] = useState<number>(1280);
  const [customHeight, setCustomHeight] = useState<number>(720);
  const [widthDraft, setWidthDraft] = useState<string>('1280');
  const [heightDraft, setHeightDraft] = useState<string>('720');
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const resizeSessionRef = useRef<{
    axis: 'width' | 'height' | 'both';
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [tool, setTool] = useState<PresentationTool>('interact');
  const [penAnchor, setPenAnchor] = useState<PenAnchorMode>('document');
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0].value);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const strokesRef = useRef<DrawStroke[]>([]);
  const activeStrokeRef = useRef<DrawStroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [isGrabPanning, setIsGrabPanning] = useState(false);
  const panDragRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const touchPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const prevTouchMidRef = useRef<{ x: number; y: number } | null>(null);

  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [xrayEnabled, setXrayEnabled] = useState(false);
  const [spotlightDim, setSpotlightDim] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [cleanWebsiteOnly, setCleanWebsiteOnly] = useState(false);
  const [tvConnected, setTvConnected] = useState(false);
  const [tvWebsiteOnly, setTvWebsiteOnly] = useState(true);
  const [scrollMetrics, setScrollMetrics] = useState<{
    scrollTop: number;
    scrollRatio: number;
  }>({ scrollTop: 0, scrollRatio: 0 });
  const liveScrollRef = useRef<{
    top: number;
    left: number;
    maxTop: number;
    maxLeft: number;
  }>({ top: 0, left: 0, maxTop: 0, maxLeft: 0 });
  const iframeDampRef = useRef<{
    win: Window | null;
    targetY: number;
    currentY: number;
    rafId: number;
    lastTime: number;
    samples: number[];
    lambda: number;
  }>({
    win: null,
    targetY: 0,
    currentY: 0,
    rafId: 0,
    lastTime: 0,
    samples: [],
    lambda: 7.4,
  });
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('sections');
  const [codeTab, setCodeTab] = useState<CodeTab>('all');

  const [liveStageMode, setLiveStageMode] = useState<'embed' | 'showcase'>('embed');
  const [isSameOrigin, setIsSameOrigin] = useState<boolean>(true);
  const [sections, setSections] = useState<DetectedSection[]>([]);
  const sectionsRef = useRef<DetectedSection[]>([]);
  sectionsRef.current = sections;
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(0);
  const activeSectionIndexRef = useRef<number>(0);
  const programmaticScrollLockRef = useRef<{
    targetIndex: number;
    targetTop: number;
    expiresAt: number;
  } | null>(null);

  const setActiveSectionSafe = useCallback((idx: number) => {
    if (activeSectionIndexRef.current === idx) return;
    activeSectionIndexRef.current = idx;
    setActiveSectionIndex(idx);
  }, []);

  const syncActiveSectionFromScroll = useCallback(
    (scrollTop: number, maxTop: number) => {
      const list = sectionsRef.current;
      if (list.length === 0) return;

      const lock = programmaticScrollLockRef.current;
      if (lock) {
        if (Math.abs(scrollTop - lock.targetTop) <= 6) {
          programmaticScrollLockRef.current = null;
          setActiveSectionSafe(lock.targetIndex);
          return;
        }
        if (Date.now() < lock.expiresAt) {
          return;
        }
        programmaticScrollLockRef.current = null;
      }

      let foundIdx = 0;
      if (maxTop > 0 && scrollTop >= maxTop - 8) {
        foundIdx = list.length - 1;
      } else {
        for (let i = 0; i < list.length; i += 1) {
          if (scrollTop + 120 >= list[i].top) {
            foundIdx = i;
          }
        }
      }
      setActiveSectionSafe(foundIdx);
    },
    [setActiveSectionSafe]
  );

  const [hoveredElement, setHoveredElement] = useState<ElementSnapshot | null>(null);
  const [lockedElement, setLockedElement] = useState<ElementSnapshot | null>(null);
  const lockedDomNodeRef = useRef<HTMLElement | null>(null);
  const [trackedHistory, setTrackedHistory] = useState<ElementSnapshot[]>([]);
  const [domTree, setDomTree] = useState<DomTreeNode[]>([]);

  const [sourceRaw, setSourceRaw] = useState<string>('');
  const [sourceLoading, setSourceLoading] = useState<boolean>(false);
  const [codeSearch, setCodeSearch] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Presenter Stopwatch
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);

  // Presenter Notes persisted per portfolio
  const [notes, setNotes] = useState<string>('');

  const safeLiveUrl = useMemo(
    () => sanitizePortfolioUrl(portfolio.portfolioUrl),
    [portfolio.portfolioUrl]
  );
  const hasUploadedHtml = Boolean(portfolio.portfolioHtml?.trim());
  const awaitingUploadedHtml = Boolean(portfolio.hasUploadedHtml && !hasUploadedHtml);
  const hasLiveUrl = Boolean(safeLiveUrl) && !hasUploadedHtml && !awaitingUploadedHtml;
  const isCrossOriginLiveUrl =
    hasLiveUrl && !isSameOriginPortfolioUrl(safeLiveUrl);
  const isMixedContentBlocked =
    isCrossOriginLiveUrl && isBlockedMixedContentUrl(safeLiveUrl);
  const isStageShowingShowcase =
    (!hasUploadedHtml && !awaitingUploadedHtml && !hasLiveUrl) ||
    (hasLiveUrl && liveStageMode === 'showcase');
  const hasCodeSource = hasUploadedHtml || hasLiveUrl;

  const bridgeChannelId = useMemo(
    () => `rev-${portfolio.id}`,
    [portfolio.id]
  );

  const bridgedHtml = useMemo(
    () =>
      hasUploadedHtml && portfolio.portfolioHtml
        ? injectReviewBridgeScript(portfolio.portfolioHtml, bridgeChannelId)
        : '',
    [hasUploadedHtml, portfolio.portfolioHtml, bridgeChannelId]
  );

  const sendBridgeCommand = useCallback(
    (cmd: Record<string, unknown>) => {
      if (!hasUploadedHtml) return;
      iframeRef.current?.contentWindow?.postMessage(
        { target: 'se-review-bridge', channelId: bridgeChannelId, ...cmd },
        '*'
      );
    },
    [hasUploadedHtml, bridgeChannelId]
  );

  // Load persisted notes and reset scroll when portfolio changes
  useEffect(() => {
    setSections([]);
    sectionsRef.current = [];
    setActiveSectionSafe(0);
    programmaticScrollLockRef.current = null;
    setScrollMetrics({ scrollTop: 0, scrollRatio: 0 });
    liveScrollRef.current = { top: 0, left: 0, maxTop: 0, maxLeft: 0 };
    if (iframeDampRef.current.rafId) {
      window.cancelAnimationFrame(iframeDampRef.current.rafId);
      iframeDampRef.current.rafId = 0;
    }
    iframeDampRef.current.win = null;
    setLiveStageMode('embed');
    setIsSameOrigin(!hasUploadedHtml && isCrossOriginLiveUrl ? false : true);
    setHoveredElement(null);
    setLockedElement(null);
    lockedDomNodeRef.current = null;
    setTrackedHistory([]);
    setDomTree([]);
    setStrokes([]);
    strokesRef.current = [];
    setCodeSearch('');
    setXrayEnabled(false);

    try {
      const saved = window.localStorage.getItem(`se-review-notes-${portfolio.id}`);
      setNotes(saved ?? '');
    } catch {
      setNotes('');
    }
  }, [portfolio.id, hasUploadedHtml, isCrossOriginLiveUrl, setActiveSectionSafe]);

  const handleNotesChange = (val: string) => {
    setNotes(val);
    try {
      window.localStorage.setItem(`se-review-notes-${portfolio.id}`, val);
    } catch {
      // Ignore storage errors
    }
  };

  // Stopwatch tick
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  // Populate Code Viewer source from uploaded HTML or same-origin URL
  useEffect(() => {
    if (hasUploadedHtml) {
      setSourceRaw(portfolio.portfolioHtml ?? '');
      setSourceLoading(false);
      setIsSameOrigin(true);
      return;
    }
    if (!hasLiveUrl || !safeLiveUrl) {
      setSourceRaw('');
      setSourceLoading(false);
      setIsSameOrigin(true);
      return;
    }
    if (isCrossOriginLiveUrl) {
      setSourceRaw('');
      setSourceLoading(false);
      setIsSameOrigin(liveStageMode === 'showcase');
      return;
    }

    let cancelled = false;
    setSourceLoading(true);
    fetch(safeLiveUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load source.');
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setSourceRaw(text);
          setSourceLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSourceRaw('');
          setSourceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    hasUploadedHtml,
    portfolio.portfolioHtml,
    hasLiveUrl,
    safeLiveUrl,
    isCrossOriginLiveUrl,
    liveStageMode,
  ]);

  // Listen to isolated sandbox postMessage bridge for user-uploaded HTML sites
  useEffect(() => {
    if (!hasUploadedHtml) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== 'se-review-bridge' || data.channelId !== bridgeChannelId) {
        return;
      }

      if (data.type === 'READY') {
        setIsSameOrigin(true);
        const nextSections = Array.isArray(data.sections)
          ? (data.sections as DetectedSection[])
          : [];
        const nextTree = Array.isArray(data.domTree)
          ? (data.domTree as DomTreeNode[])
          : [];
        liveScrollRef.current = {
          top: Number(data.scrollTop ?? 0),
          left: Number(data.scrollLeft ?? 0),
          maxTop: Number(data.maxScrollTop ?? 0),
          maxLeft: Number(data.maxScrollLeft ?? 0),
        };
        setSections(nextSections);
        setDomTree(nextTree);
        sendBridgeCommand({ type: 'SET_INSPECT_MODE', enabled: tool === 'inspect' });
        sendBridgeCommand({
          type: 'SET_XRAY',
          enabled: xrayEnabled && !cleanWebsiteOnly,
        });
        redrawCanvasRef.current();
      } else if (data.type === 'SCROLL') {
        const scrollTop = Number(data.scrollTop ?? 0);
        const scrollLeft = Number(data.scrollLeft ?? 0);
        const maxTop = Number(data.maxScrollTop ?? liveScrollRef.current.maxTop);
        const maxLeft = Number(data.maxScrollLeft ?? liveScrollRef.current.maxLeft);
        const scrollRatio = Number(data.scrollRatio ?? 0);
        liveScrollRef.current = {
          top: scrollTop,
          left: scrollLeft,
          maxTop,
          maxLeft,
        };
        redrawCanvasRef.current();
        setScrollMetrics({ scrollTop: Math.round(scrollTop), scrollRatio });
        setHoveredElement(null);
        syncActiveSectionFromScroll(scrollTop, maxTop);
      } else if (data.type === 'INSPECT_HOVER' && data.snapshot) {
        setHoveredElement(data.snapshot as ElementSnapshot);
      } else if (data.type === 'INSPECT_LOCK' && data.snapshot) {
        const snap = data.snapshot as ElementSnapshot;
        setLockedElement(snap);
        setInspectorOpen(true);
        setInspectorTab('inspector');
        setTrackedHistory((prev) => {
          const filtered = prev.filter((item) => item.key !== snap.key);
          return [snap, ...filtered].slice(0, 12);
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [hasUploadedHtml, bridgeChannelId, sendBridgeCommand, tool, xrayEnabled, cleanWebsiteOnly, syncActiveSectionFromScroll]);

  const getActiveDocumentAndWindow = useCallback((): {
    doc: Document | null;
    win: Window | null;
    scrollContainer: HTMLElement | Window | null;
    isIframe: boolean;
  } => {
    if (hasUploadedHtml) {
      return { doc: null, win: null, scrollContainer: null, isIframe: true };
    }
    if (isStageShowingShowcase) {
      const container = showcaseScrollRef.current;
      if (!container) {
        return { doc: null, win: null, scrollContainer: null, isIframe: false };
      }
      return {
        doc: document,
        win: window,
        scrollContainer: container,
        isIframe: false,
      };
    }
    if (hasLiveUrl) {
      // Never inspect cross-origin iframe documents/windows (even transiently during about:blank load)
      if (isCrossOriginLiveUrl) {
        return { doc: null, win: null, scrollContainer: null, isIframe: true };
      }
      const iframe = iframeRef.current;
      if (!iframe) {
        return { doc: null, win: null, scrollContainer: null, isIframe: true };
      }
      try {
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;
        if (doc && win) {
          return { doc, win, scrollContainer: win, isIframe: true };
        }
      } catch {
        return { doc: null, win: null, scrollContainer: null, isIframe: true };
      }
      return { doc: null, win: null, scrollContainer: null, isIframe: true };
    }

    const container = showcaseScrollRef.current;
    if (!container) {
      return { doc: null, win: null, scrollContainer: null, isIframe: false };
    }
    return {
      doc: document,
      win: window,
      scrollContainer: container,
      isIframe: false,
    };
  }, [hasUploadedHtml, hasLiveUrl, isCrossOriginLiveUrl, isStageShowingShowcase]);

  // Scan sections & DOM tree from the loaded portfolio
  const scanPortfolioStructure = useCallback(() => {
    if (hasUploadedHtml) {
      setIsSameOrigin(true);
      sendBridgeCommand({ type: 'PING_SCAN' });
      return;
    }
    const { doc, win, isIframe } = getActiveDocumentAndWindow();
    if (!doc || !win) {
      setIsSameOrigin(false);
      setSections([]);
      setDomTree([]);
      return;
    }

    setIsSameOrigin(true);
    const root: HTMLElement | null = isIframe
      ? doc.body
      : showcaseScrollRef.current;
    if (!root) return;

    // 1. Detect presentation sections cleanly
    const rawCandidates = Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-review-section], header, .hero, main > div.hero, section, footer'
      )
    );

    const uniqueEls: HTMLElement[] = [];
    for (const el of rawCandidates) {
      if (el.offsetHeight < 24) continue;
      // Avoid duplicate parent/child matches if already captured
      const isNestedInsideCaptured = uniqueEls.some(
        (existing) => existing !== el && existing.contains(el)
      );
      if (!isNestedInsideCaptured) {
        uniqueEls.push(el);
      }
    }

    const containerTop = isIframe
      ? 0
      : (showcaseScrollRef.current?.getBoundingClientRect().top ?? 0) -
        (showcaseScrollRef.current?.scrollTop ?? 0);

    const detected: DetectedSection[] = uniqueEls.map((el, idx) => {
      const heading = el.querySelector('h1, h2, h3');
      const dataLabel = el.getAttribute('data-review-label');
      const fallbackTag = el.tagName.toLowerCase();
      const label =
        dataLabel?.trim() ||
        heading?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 44) ||
        (fallbackTag === 'header'
          ? 'Navigation Header'
          : fallbackTag === 'footer'
            ? 'Footer'
            : el.id
              ? `#${el.id}`
              : `Section ${idx + 1}`);

      const rect = el.getBoundingClientRect();
      const top = isIframe
        ? Math.max(0, Math.round(rect.top + win.scrollY - (idx === 0 ? 0 : 72)))
        : Math.max(0, Math.round(rect.top - containerTop));

      return {
        id: el.id || `sec-${idx}`,
        label,
        tag: fallbackTag,
        top,
        height: Math.round(rect.height),
        selector: buildSelectorLabel(el),
        element: el,
      };
    });

    setSections(detected);

    // 2. Build compact interactive DOM tree (up to 70 key elements)
    const nodes: DomTreeNode[] = [];
    const walk = (node: HTMLElement, depth: number) => {
      if (nodes.length >= 75 || depth > 4) return;
      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'link', 'meta', 'svg', 'path'].includes(tag)) return;

      const headingText =
        tag.startsWith('h') || tag === 'button' || tag === 'a'
          ? node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 28)
          : '';
      nodes.push({
        key: `${buildSelectorLabel(node)}-${nodes.length}`,
        tag,
        id: node.id || '',
        classes: Array.from(node.classList).slice(0, 2),
        label: headingText || '',
        depth,
        element: node,
      });

      const winWithHtml = win as Window & { HTMLElement?: typeof HTMLElement };
      for (const child of Array.from(node.children)) {
        if (
          (winWithHtml.HTMLElement && child instanceof winWithHtml.HTMLElement) ||
          child instanceof HTMLElement
        ) {
          walk(child, depth + 1);
        }
      }
    };
    walk(root, 0);
    setDomTree(nodes);
  }, [getActiveDocumentAndWindow]);

  // Apply/remove X-Ray CSS inside iframe or showcase
  useEffect(() => {
    if (hasUploadedHtml) {
      sendBridgeCommand({
        type: 'SET_XRAY',
        enabled: xrayEnabled && !cleanWebsiteOnly,
      });
      return;
    }

    const { doc, isIframe } = getActiveDocumentAndWindow();
    if (!doc) return;

    const existing = doc.getElementById(XRAY_STYLE_ID);
    if (xrayEnabled && !cleanWebsiteOnly) {
      if (!existing) {
        const styleEl = doc.createElement('style');
        styleEl.id = XRAY_STYLE_ID;
        const scope = isIframe ? 'body' : '[data-showcase-root]';
        styleEl.textContent = `
          ${scope} header, ${scope} nav, ${scope} main, ${scope} section, ${scope} article, ${scope} footer, ${scope} div {
            outline: 1px dashed rgba(234, 76, 137, 0.45) !important;
            outline-offset: -1px !important;
          }
          ${scope} h1, ${scope} h2, ${scope} h3, ${scope} p, ${scope} button, ${scope} a {
            outline: 1px dotted rgba(56, 189, 248, 0.5) !important;
          }
        `;
        doc.head.appendChild(styleEl);
      }
    } else if (existing) {
      existing.remove();
    }

    return () => {
      try {
        doc.getElementById(XRAY_STYLE_ID)?.remove();
      } catch {
        // Ignore cross-origin cleanup errors
      }
    };
  }, [xrayEnabled, cleanWebsiteOnly, getActiveDocumentAndWindow, sections, hasUploadedHtml, sendBridgeCommand]);

  // Scroll spy inside iframe / showcase container
  useEffect(() => {
    const { doc, win, scrollContainer, isIframe } = getActiveDocumentAndWindow();
    if (!scrollContainer) return;

    const readCurrentScroll = () => {
      const currentTop = isIframe
        ? (win?.scrollY ?? doc?.documentElement.scrollTop ?? 0)
        : (showcaseScrollRef.current?.scrollTop ?? 0);
      const currentLeft = isIframe
        ? (win?.scrollX ?? doc?.documentElement.scrollLeft ?? 0)
        : (showcaseScrollRef.current?.scrollLeft ?? 0);
      const maxTop = isIframe
        ? Math.max(
            0,
            (doc?.documentElement.scrollHeight ?? 0) - (win?.innerHeight ?? 0)
          )
        : Math.max(
            0,
            (showcaseScrollRef.current?.scrollHeight ?? 0) -
              (showcaseScrollRef.current?.clientHeight ?? 0)
          );
      const maxLeft = isIframe
        ? Math.max(
            0,
            (doc?.documentElement.scrollWidth ?? 0) - (win?.innerWidth ?? 0)
          )
        : Math.max(
            0,
            (showcaseScrollRef.current?.scrollWidth ?? 0) -
              (showcaseScrollRef.current?.clientWidth ?? 0)
          );
      return { currentTop, currentLeft, maxTop, maxLeft };
    };

    // Seed initial scroll metrics immediately
    const initial = readCurrentScroll();
    liveScrollRef.current = {
      top: initial.currentTop,
      left: initial.currentLeft,
      maxTop: initial.maxTop,
      maxLeft: initial.maxLeft,
    };

    let rafId = 0;
    const measureScroll = () => {
      rafId = 0;
      const { currentTop, maxTop } = readCurrentScroll();
      const ratio = maxTop > 0 ? Math.min(1, Math.max(0, currentTop / maxTop)) : 0;
      setScrollMetrics({ scrollTop: Math.round(currentTop), scrollRatio: ratio });
      syncActiveSectionFromScroll(currentTop, maxTop);
      setHoveredElement(null);

      if (lockedDomNodeRef.current && win) {
        const containerRect = !isIframe
          ? stageFrameRef.current?.getBoundingClientRect()
          : undefined;
        setLockedElement(
          extractElementSnapshot(lockedDomNodeRef.current, win, containerRect, zoom)
        );
      }
    };

    const handleScroll = () => {
      // Sync canvas immediately in the same frame so page-pinned drawings never lag
      const next = readCurrentScroll();
      liveScrollRef.current = {
        top: next.currentTop,
        left: next.currentLeft,
        maxTop: next.maxTop,
        maxLeft: next.maxLeft,
      };
      redrawCanvasRef.current();

      if (rafId) return;
      rafId = window.requestAnimationFrame(measureScroll);
    };

    const handleManualInterrupt = () => {
      programmaticScrollLockRef.current = null;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    scrollContainer.addEventListener('wheel', handleManualInterrupt, { passive: true });
    scrollContainer.addEventListener('touchstart', handleManualInterrupt, { passive: true });
    return () => {
      try {
        scrollContainer.removeEventListener('scroll', handleScroll);
        scrollContainer.removeEventListener('wheel', handleManualInterrupt);
        scrollContainer.removeEventListener('touchstart', handleManualInterrupt);
      } catch {
        // Ignore cross-origin WindowProxy cleanup errors
      }
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [sections, getActiveDocumentAndWindow, zoom, syncActiveSectionFromScroll]);

  // Live Element Inspector listeners when tool === 'inspect'
  useEffect(() => {
    if (hasUploadedHtml) {
      sendBridgeCommand({ type: 'SET_INSPECT_MODE', enabled: tool === 'inspect' });
      if (tool !== 'inspect') {
        setHoveredElement(null);
      }
      return;
    }
    if (tool !== 'inspect') {
      setHoveredElement(null);
      return;
    }

    const { doc, win, isIframe } = getActiveDocumentAndWindow();
    if (!doc || !win) return;

    const targetRoot: HTMLElement | Document = isIframe
      ? doc
      : (showcaseScrollRef.current ?? doc);

    const handleMouseMove = (e: Event) => {
      const me = e as MouseEvent;
      const htmlEl = resolveHtmlTarget(me.target, win);
      if (!htmlEl) return;
      if (!isIframe && showcaseScrollRef.current && !showcaseScrollRef.current.contains(htmlEl)) {
        return;
      }
      const containerRect = !isIframe
        ? stageFrameRef.current?.getBoundingClientRect()
        : undefined;
      const snap = extractElementSnapshot(htmlEl, win, containerRect, zoom);
      setHoveredElement(snap);
    };

    const handleClick = (e: Event) => {
      const me = e as MouseEvent;
      const htmlEl = resolveHtmlTarget(me.target, win);
      if (!htmlEl) return;
      if (!isIframe && showcaseScrollRef.current && !showcaseScrollRef.current.contains(htmlEl)) {
        return;
      }
      me.preventDefault();
      me.stopPropagation();
      me.stopImmediatePropagation?.();
      const containerRect = !isIframe
        ? stageFrameRef.current?.getBoundingClientRect()
        : undefined;
      const snap = extractElementSnapshot(htmlEl, win, containerRect, zoom);
      lockedDomNodeRef.current = htmlEl;
      setLockedElement(snap);
      setInspectorOpen(true);
      setInspectorTab('inspector');
      setTrackedHistory((prev) => {
        const filtered = prev.filter((item) => item.key !== snap.key);
        return [snap, ...filtered].slice(0, 12);
      });
    };

    targetRoot.addEventListener('mousemove', handleMouseMove, true);
    targetRoot.addEventListener('click', handleClick, true);

    return () => {
      try {
        targetRoot.removeEventListener('mousemove', handleMouseMove, true);
        targetRoot.removeEventListener('click', handleClick, true);
      } catch {
        // Ignore cross-origin cleanup errors
      }
    };
  }, [tool, getActiveDocumentAndWindow, sections, zoom, hasUploadedHtml, sendBridgeCommand]);

  // Scroll to specific section index (or viewport step if cross-origin)
  const scrollToSection = useCallback(
    (index: number) => {
      if (sections.length === 0) {
        const delta = index > activeSectionIndex ? 520 : -520;
        if (hasUploadedHtml) {
          sendBridgeCommand({ type: 'SCROLL_BY', left: 0, top: delta, behavior: 'smooth' });
          return;
        }
        // Fallback viewport-step scrolling for cross-origin sites
        try {
          const win = iframeRef.current?.contentWindow;
          if (win) {
            win.scrollBy({ top: delta, behavior: 'smooth' });
          }
        } catch {
          // Cross-origin blocked
        }
        return;
      }

      const clamped = Math.max(0, Math.min(sections.length - 1, index));
      const target = sections[clamped];
      const maxTop = liveScrollRef.current.maxTop;
      const expectedTop =
        maxTop > 0 ? Math.min(target.top, maxTop) : target.top;

      programmaticScrollLockRef.current = {
        targetIndex: clamped,
        targetTop: expectedTop,
        expiresAt: Date.now() + 1400,
      };
      setActiveSectionSafe(clamped);

      if (hasUploadedHtml) {
        sendBridgeCommand({ type: 'SCROLL_TO', top: target.top, behavior: 'smooth' });
        return;
      }

      const { win, isIframe } = getActiveDocumentAndWindow();
      if (isIframe && win) {
        if (iframeDampRef.current.rafId) {
          window.cancelAnimationFrame(iframeDampRef.current.rafId);
          iframeDampRef.current.rafId = 0;
        }
        win.scrollTo({ top: target.top, behavior: 'smooth' });
      } else if (showcaseScrollRef.current) {
        smoothScrollElementTo(showcaseScrollRef.current, target.top);
      }
    },
    [
      sections,
      activeSectionIndex,
      getActiveDocumentAndWindow,
      hasUploadedHtml,
      sendBridgeCommand,
      setActiveSectionSafe,
    ]
  );

  const handleStepSection = useCallback(
    (direction: -1 | 1) => {
      if (sections.length === 0) {
        scrollToSection(activeSectionIndex + direction);
        return;
      }
      const next = Math.max(0, Math.min(sections.length - 1, activeSectionIndex + direction));
      scrollToSection(next);
    },
    [sections.length, activeSectionIndex, scrollToSection]
  );

  // Keyboard shortcuts for section stepping and exiting Website-Only mode
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ']') {
        e.preventDefault();
        handleStepSection(1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === '[') {
        e.preventDefault();
        handleStepSection(-1);
      } else if (e.key === 'Escape') {
        if (cleanWebsiteOnly) {
          setCleanWebsiteOnly(false);
        } else if (tool !== 'interact') {
          setTool('interact');
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleStepSection, tool, cleanWebsiteOnly]);

  // Trigger scan for built-in showcase portfolios and cached local iframes
  useEffect(() => {
    if (isStageShowingShowcase) {
      const timer = window.setTimeout(() => scanPortfolioStructure(), 60);
      return () => window.clearTimeout(timer);
    }
    if (hasUploadedHtml || isCrossOriginLiveUrl) {
      if (isCrossOriginLiveUrl) {
        setIsSameOrigin(false);
        setSections([]);
        setDomTree([]);
      }
      return;
    }
    const iframe = iframeRef.current;
    try {
      if (iframe?.contentDocument?.readyState === 'complete') {
        scanPortfolioStructure();
      }
    } catch {
      // Cross-origin blocked
    }
  }, [
    isStageShowingShowcase,
    hasUploadedHtml,
    isCrossOriginLiveUrl,
    portfolio.id,
    scanPortfolioStructure,
  ]);

  // Spacebar-to-pan modifier in Draw mode (hold Space + drag to scroll smoothly)
  useEffect(() => {
    if (tool !== 'draw') {
      setIsSpacePanning(false);
      setIsGrabPanning(false);
      panDragRef.current = null;
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setIsSpacePanning(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePanning(false);
        setIsGrabPanning(false);
        panDragRef.current = null;
      }
    };

    const handleBlur = () => {
      setIsSpacePanning(false);
      setIsGrabPanning(false);
      panDragRef.current = null;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [tool]);

  // Synchronous scroll getter for canvas drawing & rendering
  const getCurrentStageScroll = useCallback(() => {
    if (hasUploadedHtml) {
      return liveScrollRef.current;
    }
    if (isStageShowingShowcase) {
      const el = showcaseScrollRef.current;
      if (el) {
        const top = el.scrollTop;
        const left = el.scrollLeft;
        const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
        const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
        liveScrollRef.current = { top, left, maxTop, maxLeft };
        return liveScrollRef.current;
      }
      return liveScrollRef.current;
    }
    if (hasLiveUrl && !isCrossOriginLiveUrl) {
      const iframe = iframeRef.current;
      try {
        const win = iframe?.contentWindow;
        const doc = iframe?.contentDocument;
        if (win && doc) {
          const top = win.scrollY || doc.documentElement.scrollTop || 0;
          const left = win.scrollX || doc.documentElement.scrollLeft || 0;
          const maxTop = Math.max(0, doc.documentElement.scrollHeight - win.innerHeight);
          const maxLeft = Math.max(0, doc.documentElement.scrollWidth - win.innerWidth);
          liveScrollRef.current = { top, left, maxTop, maxLeft };
          return liveScrollRef.current;
        }
      } catch {
        // Cross-origin fallback
      }
      return liveScrollRef.current;
    }
    return liveScrollRef.current;
  }, [hasUploadedHtml, isStageShowingShowcase, hasLiveUrl, isCrossOriginLiveUrl]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const frame = stageFrameRef.current;
    if (!canvas || !frame) return;

    const dpr = window.devicePixelRatio || 1;
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const { top: scrollTop, left: scrollLeft } = getCurrentStageScroll();

    for (const stroke of strokesRef.current) {
      if (!stroke?.points || stroke.points.length === 0) continue;
      const offsetX = stroke.anchor === 'document' ? scrollLeft : 0;
      const offsetY = stroke.anchor === 'document' ? scrollTop : 0;

      if (stroke.points.length === 1) {
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        ctx.arc(
          stroke.points[0].x - offsetX,
          stroke.points[0].y - offsetY,
          1.75,
          0,
          Math.PI * 2
        );
        ctx.fill();
        continue;
      }

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x - offsetX, stroke.points[0].y - offsetY);
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].x - offsetX, stroke.points[i].y - offsetY);
      }
      ctx.stroke();
    }
  }, [getCurrentStageScroll]);

  const redrawCanvasRef = useRef<() => void>(() => {});
  redrawCanvasRef.current = redrawCanvas;

  // Keep strokesRef synchronized and redraw annotation canvas on updates/resize
  useEffect(() => {
    strokesRef.current = strokes;
    redrawCanvas();
  }, [
    strokes,
    redrawCanvas,
    viewport,
    customWidth,
    customHeight,
    inspectorOpen,
    cleanWebsiteOnly,
  ]);

  useEffect(() => {
    const frame = stageFrameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      redrawCanvasRef.current();
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const clampPx = (val: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(val)));

  const handleWidthInputChange = (raw: string) => {
    setWidthDraft(raw);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 240) {
      const clamped = clampPx(parsed, 240, 3840);
      setCustomWidth(clamped);
      setViewport('custom');
    }
  };

  const handleHeightInputChange = (raw: string) => {
    setHeightDraft(raw);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 200) {
      const clamped = clampPx(parsed, 200, 2160);
      setCustomHeight(clamped);
      setViewport('custom');
    }
  };

  const commitDimensionDrafts = () => {
    const wParsed = Number(widthDraft);
    const hParsed = Number(heightDraft);
    const nextW = Number.isFinite(wParsed) && wParsed > 0
      ? clampPx(wParsed, 240, 3840)
      : customWidth;
    const nextH = Number.isFinite(hParsed) && hParsed > 0
      ? clampPx(hParsed, 200, 2160)
      : customHeight;
    setCustomWidth(nextW);
    setCustomHeight(nextH);
    setWidthDraft(String(nextW));
    setHeightDraft(String(nextH));
  };

  const startResizeDrag = (
    axis: 'width' | 'height' | 'both',
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const frame = stageFrameRef.current;
    if (!frame) return;

    const currentW = clampPx(frame.clientWidth, 240, 3840);
    const currentH = clampPx(frame.clientHeight, 200, 2160);

    setCustomWidth(currentW);
    setCustomHeight(currentH);
    setWidthDraft(String(currentW));
    setHeightDraft(String(currentH));
    setViewport('custom');
    setIsResizing(true);

    resizeSessionRef.current = {
      axis,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: currentW,
      startHeight: currentH,
    };
  };

  useEffect(() => {
    if (!isResizing) return;

    const safeZoom = !cleanWebsiteOnly && zoom > 0 ? zoom : 1;

    const handlePointerMove = (e: PointerEvent) => {
      const session = resizeSessionRef.current;
      if (!session) return;

      const deltaX = (e.clientX - session.startX) / safeZoom;
      const deltaY = (e.clientY - session.startY) / safeZoom;

      if (session.axis === 'width' || session.axis === 'both') {
        const multiplier = session.axis === 'width' ? 2 : 2;
        const nextW = clampPx(session.startWidth + deltaX * multiplier, 240, 3840);
        setCustomWidth(nextW);
        setWidthDraft(String(nextW));
      }

      if (session.axis === 'height' || session.axis === 'both') {
        const nextH = clampPx(session.startHeight + deltaY, 200, 2160);
        setCustomHeight(nextH);
        setHeightDraft(String(nextH));
      }
    };

    const handlePointerUp = () => {
      resizeSessionRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isResizing, zoom, cleanWebsiteOnly]);

  const dampIframeScrollBy = useCallback(
    (win: Window, dx: number, dy: number, immediate = false) => {
      const state = iframeDampRef.current;
      if (dx !== 0) {
        try {
          win.scrollBy({ left: dx, behavior: 'auto' });
        } catch {
          // Ignore cross-origin errors
        }
      }
      if (dy === 0) return;

      let maxTop = 0;
      try {
        const doc = win.document;
        maxTop = Math.max(0, doc.documentElement.scrollHeight - win.innerHeight);
      } catch {
        // Cross-origin fallback
        try {
          win.scrollBy({ top: dy, behavior: immediate ? 'auto' : 'smooth' });
        } catch {
          // Ignore cross-origin scroll errors
        }
        return;
      }

      if (state.win !== win) {
        if (state.rafId) {
          window.cancelAnimationFrame(state.rafId);
          state.rafId = 0;
        }
        state.win = win;
        state.currentY = win.scrollY;
        state.targetY = win.scrollY;
        state.lastTime = 0;
      }

      const base = state.rafId ? state.targetY : win.scrollY;
      state.targetY = Math.max(0, Math.min(maxTop, base + dy));

      if (immediate) {
        if (state.rafId) {
          window.cancelAnimationFrame(state.rafId);
          state.rafId = 0;
        }
        state.currentY = state.targetY;
        state.lastTime = 0;
        win.scrollTo({ top: state.targetY, behavior: 'auto' });
        return;
      }

      if (!state.rafId) {
        state.currentY = win.scrollY;
        state.lastTime = 0;
        const step = (now: number) => {
          if (!state.lastTime) {
            state.lastTime = now;
            state.rafId = window.requestAnimationFrame(step);
            return;
          }
          const rawDtMs = now - state.lastTime;
          state.lastTime = now;
          if (rawDtMs >= 3.5 && rawDtMs <= 25) {
            state.samples.push(rawDtMs);
            if (state.samples.length > 14) state.samples.shift();
            if (state.samples.length >= 6) {
              const sorted = [...state.samples].sort((a, b) => a - b);
              const fps = 1000 / sorted[Math.floor(sorted.length / 2)];
              const t = Math.max(0, Math.min(1, (fps - 75) / 30));
              state.lambda = 7.4 + (4.9 - 7.4) * t;
            }
          }
          const dt = Math.min(Math.max(rawDtMs, 1), 33.34) * 0.001;
          const factor = 1 - Math.exp(-state.lambda * dt);
          state.currentY += (state.targetY - state.currentY) * factor;
          if (Math.abs(state.targetY - state.currentY) < 0.6) {
            win.scrollTo({ top: state.targetY, behavior: 'auto' });
            state.rafId = 0;
            state.lastTime = 0;
            return;
          }
          win.scrollTo({ top: state.currentY, behavior: 'auto' });
          state.rafId = window.requestAnimationFrame(step);
        };
        state.rafId = window.requestAnimationFrame(step);
      }
    },
    []
  );

  const scrollStageBy = useCallback(
    (dx: number, dy: number, immediate = false) => {
      if (dx === 0 && dy === 0) return;

      if (hasUploadedHtml) {
        sendBridgeCommand({ type: 'SCROLL_BY', left: dx, top: dy, immediate });
        return;
      }

      const { win, isIframe } = getActiveDocumentAndWindow();
      if (isIframe && win) {
        dampIframeScrollBy(win, dx, dy, immediate);
      } else if (isIframe && iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.scrollBy({
            left: dx,
            top: dy,
            behavior: immediate ? 'auto' : 'smooth',
          });
        } catch {
          // Ignore cross-origin scroll errors
        }
      } else if (showcaseScrollRef.current) {
        if (immediate) {
          const el = showcaseScrollRef.current;
          el.scrollBy({ left: dx, top: dy, behavior: 'auto' });
          const lenis = Reflect.get(el, '__lenis') as
            | { scrollTo: (t: number, o?: { immediate?: boolean }) => void }
            | undefined;
          lenis?.scrollTo(el.scrollTop, { immediate: true });
        } else {
          smoothScrollElementBy(showcaseScrollRef.current, dy, dx);
        }
      }
    },
    [hasUploadedHtml, sendBridgeCommand, getActiveDocumentAndWindow, dampIframeScrollBy]
  );

  const effectiveAnchor: PenAnchorMode = isSameOrigin ? penAnchor : 'screen';

  const toStrokePoint = useCallback(
    (clientX: number, clientY: number, anchor: PenAnchorMode) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const safeZoom = cleanWebsiteOnly ? 1 : zoom;
      const stageX = (clientX - rect.left) / safeZoom;
      const stageY = (clientY - rect.top) / safeZoom;
      if (anchor === 'document') {
        const scroll = getCurrentStageScroll();
        return {
          x: stageX + scroll.left,
          y: stageY + scroll.top,
        };
      }
      return { x: stageX, y: stageY };
    },
    [cleanWebsiteOnly, zoom, getCurrentStageScroll]
  );

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== 'draw' || !canvasRef.current) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture errors
    }

    // Track multi-touch pointers so 2-finger touch scrolls smoothly in Draw mode
    if (e.pointerType === 'touch') {
      touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPointersRef.current.size >= 2) {
        // Cancel an accidental single-tap dot started as the second finger landed
        if (activeStrokeRef.current && activeStrokeRef.current.points.length <= 2) {
          activeStrokeRef.current = null;
          setIsDrawing(false);
          setStrokes((prev) => prev.slice(0, -1));
        }
        const pts = Array.from(touchPointersRef.current.values());
        const midX = pts.reduce((acc, p) => acc + p.x, 0) / pts.length;
        const midY = pts.reduce((acc, p) => acc + p.y, 0) / pts.length;
        prevTouchMidRef.current = { x: midX, y: midY };
        return;
      }
    }

    // Middle-mouse drag or Space + drag pans/scrolls the portfolio cleanly
    if (e.button === 1 || isSpacePanning) {
      panDragRef.current = {
        pointerId: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
      };
      setIsGrabPanning(true);
      return;
    }

    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const anchor = effectiveAnchor;
    const point = toStrokePoint(e.clientX, e.clientY, anchor);
    const nextStroke: DrawStroke = {
      color: penColor,
      anchor,
      points: [point],
    };
    activeStrokeRef.current = nextStroke;
    setIsDrawing(true);
    setStrokes((prev) => [...prev, nextStroke]);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== 'draw' || !canvasRef.current) return;

    // 2-finger touch scroll
    if (e.pointerType === 'touch' && touchPointersRef.current.has(e.pointerId)) {
      touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPointersRef.current.size >= 2) {
        const pts = Array.from(touchPointersRef.current.values());
        const midX = pts.reduce((acc, p) => acc + p.x, 0) / pts.length;
        const midY = pts.reduce((acc, p) => acc + p.y, 0) / pts.length;
        if (prevTouchMidRef.current) {
          const safeZoom = cleanWebsiteOnly ? 1 : zoom;
          const dx = (prevTouchMidRef.current.x - midX) / safeZoom;
          const dy = (prevTouchMidRef.current.y - midY) / safeZoom;
          scrollStageBy(dx, dy, true);
        }
        prevTouchMidRef.current = { x: midX, y: midY };
        return;
      }
    }

    // Space+drag / middle-mouse pan scrolling
    if (panDragRef.current && panDragRef.current.pointerId === e.pointerId) {
      const safeZoom = cleanWebsiteOnly ? 1 : zoom;
      const dx = (panDragRef.current.lastX - e.clientX) / safeZoom;
      const dy = (panDragRef.current.lastY - e.clientY) / safeZoom;
      panDragRef.current.lastX = e.clientX;
      panDragRef.current.lastY = e.clientY;
      scrollStageBy(dx, dy, true);
      return;
    }

    const current = activeStrokeRef.current;
    if (!isDrawing || !current) return;

    const point = toStrokePoint(e.clientX, e.clientY, current.anchor);
    const updatedStroke: DrawStroke = {
      color: current.color,
      anchor: current.anchor,
      points: [...current.points, point],
    };
    activeStrokeRef.current = updatedStroke;
    setStrokes((prev) =>
      prev.length === 0 ? [updatedStroke] : [...prev.slice(0, -1), updatedStroke]
    );
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      touchPointersRef.current.delete(e.pointerId);
      if (touchPointersRef.current.size < 2) {
        prevTouchMidRef.current = null;
      }
    }
    if (panDragRef.current && panDragRef.current.pointerId === e.pointerId) {
      panDragRef.current = null;
      setIsGrabPanning(false);
    }
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release errors
      }
    }
    setIsDrawing(false);
    activeStrokeRef.current = null;
  };

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== 'laser' || !stageFrameRef.current) return;
    const rect = stageFrameRef.current.getBoundingClientRect();
    const safeZoom = cleanWebsiteOnly ? 1 : zoom;
    setLaserPos({
      x: (e.clientX - rect.left) / safeZoom,
      y: (e.clientY - rect.top) / safeZoom,
    });
  };

  const handleStageWheelRef = useRef<(e: WheelEvent) => void>(() => {});
  handleStageWheelRef.current = (e: WheelEvent) => {
    if (tool !== 'laser' && tool !== 'draw') return;
    const unitScale =
      e.deltaMode === 1
        ? 16
        : e.deltaMode === 2
          ? stageFrameRef.current?.clientHeight || window.innerHeight
          : 1;
    const dx = e.deltaX * unitScale;
    const dy = e.deltaY * unitScale;

    // Check if inner portfolio has scroll room; if not (e.g. tall custom viewport),
    // allow wheel to bubble to the outer SmoothScrollArea wrapper.
    const scrollState = getCurrentStageScroll();
    const canScrollDown = dy > 0 && scrollState.top < scrollState.maxTop - 1;
    const canScrollUp = dy < 0 && scrollState.top > 1;
    const canScrollRight = dx > 0 && scrollState.left < scrollState.maxLeft - 1;
    const canScrollLeft = dx < 0 && scrollState.left > 1;
    const innerHasScrollRoom =
      viewport !== 'custom' ||
      canScrollDown ||
      canScrollUp ||
      canScrollRight ||
      canScrollLeft ||
      !isSameOrigin;

    if (!innerHasScrollRoom) {
      return;
    }

    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    programmaticScrollLockRef.current = null;
    scrollStageBy(dx, dy, false);
  };

  useEffect(() => {
    if (cleanWebsiteOnly || (tool !== 'laser' && tool !== 'draw')) return;
    const frame = stageFrameRef.current;
    if (!frame) return;

    const onWheel = (e: WheelEvent) => {
      handleStageWheelRef.current(e);
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      frame.removeEventListener('wheel', onWheel);
    };
  }, [tool, cleanWebsiteOnly]);

  const handleHighlightDomElement = (node: DomTreeNode) => {
    if (hasUploadedHtml && node.nodeId) {
      sendBridgeCommand({ type: 'HIGHLIGHT_NODE', nodeId: node.nodeId });
      return;
    }
    const el = node.element;
    const { win, isIframe } = getActiveDocumentAndWindow();
    if (!win || !el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      const containerRect = !isIframe
        ? stageFrameRef.current?.getBoundingClientRect()
        : undefined;
      const snap = extractElementSnapshot(el, win, containerRect, zoom);
      lockedDomNodeRef.current = el;
      setLockedElement(snap);
      setTrackedHistory((prev) => {
        const filtered = prev.filter((item) => item.key !== snap.key);
        return [snap, ...filtered].slice(0, 12);
      });
    }, 280);
  };

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    });
  };

  const parsedSource = useMemo(() => parseSourceSegments(sourceRaw), [sourceRaw]);
  const displayedCode = parsedSource[codeTab];
  const codeLines = useMemo(() => {
    const lines = displayedCode.split('\n');
    const q = codeSearch.trim().toLowerCase();
    if (!q) {
      return lines.map((line, i) => ({ num: i + 1, line, matches: false }));
    }
    return lines
      .map((line, i) => ({
        num: i + 1,
        line,
        matches: line.toLowerCase().includes(q),
      }))
      .filter((item) => item.matches);
  }, [displayedCode, codeSearch]);

  const currentIdx = allPortfolios.findIndex((p) => p.id === portfolio.id);
  const prevPortfolio =
    allPortfolios[(currentIdx - 1 + allPortfolios.length) % allPortfolios.length];
  const nextPortfolio = allPortfolios[(currentIdx + 1) % allPortfolios.length];

  const frameWidthClass =
    viewport === 'custom'
      ? 'shrink-0'
      : viewport === 'mobile'
        ? 'w-[390px] shrink-0 h-full min-h-[540px]'
        : viewport === 'tablet'
          ? 'w-[820px] shrink-0 h-full min-h-[540px]'
          : 'w-full h-full min-h-[540px]';

  const activeBox = hoveredElement ?? lockedElement;
  const currentSectionLabel =
    sections[activeSectionIndex]?.label ??
    (hasLiveUrl || hasUploadedHtml ? 'Portfolio Stage' : portfolio.projectTitle);

  const buildTvFeedState = useCallback((): TvFeedState => {
    const frameW = stageFrameRef.current?.clientWidth || 1;
    const frameH = stageFrameRef.current?.clientHeight || 1;

    return {
      portfolioId: portfolio.id,
      sectionIndex: activeSectionIndex,
      scrollTop: scrollMetrics.scrollTop,
      scrollRatio: scrollMetrics.scrollRatio,
      viewport,
      customWidth: viewport === 'custom' ? customWidth : undefined,
      customHeight: viewport === 'custom' ? customHeight : undefined,
      tvWebsiteOnly,
      xrayEnabled,
      spotlightDim,
      laserPos:
        tool === 'laser' && laserPos
          ? { xPct: laserPos.x / frameW, yPct: laserPos.y / frameH }
          : null,
      strokes: strokes.map((s) => {
        const offX = s.anchor === 'document' ? liveScrollRef.current.left : 0;
        const offY = s.anchor === 'document' ? liveScrollRef.current.top : 0;
        return {
          color: s.color,
          points: (s.points ?? []).map((pt) => ({
            xPct: (pt.x - offX) / frameW,
            yPct: (pt.y - offY) / frameH,
          })),
        };
      }),
      highlightedRect: activeBox
        ? {
            top: activeBox.rect.top,
            left: activeBox.rect.left,
            width: activeBox.rect.width,
            height: activeBox.rect.height,
            label: `${activeBox.selector} · ${Math.round(activeBox.rect.width)}×${Math.round(activeBox.rect.height)}`,
          }
        : null,
      updatedAt: Date.now(),
    };
  }, [
    portfolio.id,
    activeSectionIndex,
    scrollMetrics,
    viewport,
    customWidth,
    customHeight,
    tvWebsiteOnly,
    xrayEnabled,
    spotlightDim,
    tool,
    laserPos,
    strokes,
    activeBox,
  ]);

  // Broadcast live state updates to connected TV Feed windows
  useEffect(() => {
    publishTvMessage({ type: 'STATE_UPDATE', payload: buildTvFeedState() });
  }, [buildTvFeedState]);

  // Listen for TV Feed window presence & immediate state sync requests
  useEffect(() => {
    return subscribeTvMessages((msg) => {
      if (msg.type === 'TV_CONNECTED') {
        setTvConnected(true);
        publishTvMessage({ type: 'STATE_UPDATE', payload: buildTvFeedState() });
      } else if (msg.type === 'TV_DISCONNECTED') {
        setTvConnected(false);
      } else if (msg.type === 'REQUEST_STATE') {
        setTvConnected(true);
        publishTvMessage({ type: 'STATE_UPDATE', payload: buildTvFeedState() });
      }
    });
  }, [buildTvFeedState]);

  return (
    <div className="h-screen flex flex-col bg-[var(--p-bg)] text-[var(--p-ink)] overflow-hidden transition-colors duration-200">
      {/* Studio Top Bar (hidden in single-screen Website-Only mode) */}
      {!cleanWebsiteOnly && (
        <header className="h-16 px-4 md:px-6 border-b border-[var(--p-border)] bg-[var(--p-surface-elevated)] flex items-center justify-between gap-3 shrink-0 z-30">
        {/* Left: Back + Portfolio Info + Prev/Next Portfolio */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onNavigateGallery}
            className="h-9 px-3 rounded-lg border border-[var(--p-border)] hover:bg-[var(--p-surface)] text-[13px] font-medium text-[var(--p-ink)] inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Gallery</span>
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ backgroundColor: portfolio.avatarColor }}
            >
              {portfolio.avatarUrl ? (
                <img
                  src={portfolio.avatarUrl}
                  alt={portfolio.studentName}
                  className="w-full h-full object-cover"
                />
              ) : (
                portfolio.initials
              )}
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-[var(--p-ink)] truncate">
                {portfolio.studentName}
              </div>
              <div className="text-[11px] text-[var(--p-muted)] truncate hidden sm:block">
                {portfolio.projectTitle}
              </div>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-1 ml-2 pl-3 border-l border-[var(--p-border)]">
            <button
              type="button"
              onClick={() => onSelectPortfolio(prevPortfolio)}
              title={`Previous portfolio: ${prevPortfolio.studentName}`}
              aria-label={`Previous portfolio: ${prevPortfolio.studentName}`}
              className="w-8 h-8 rounded-lg border border-[var(--p-border)] hover:bg-[var(--p-surface)] flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onSelectPortfolio(nextPortfolio)}
              title={`Next portfolio: ${nextPortfolio.studentName}`}
              aria-label={`Next portfolio: ${nextPortfolio.studentName}`}
              className="w-8 h-8 rounded-lg border border-[var(--p-border)] hover:bg-[var(--p-surface)] flex items-center justify-center cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center: Section-by-Section Stepper Arrow Controls */}
        <div className="flex items-center gap-1.5 bg-[var(--p-surface)] border border-[var(--p-border)] rounded-xl p-1 shrink-0">
          <button
            type="button"
            onClick={() => handleStepSection(-1)}
            disabled={sections.length > 0 && activeSectionIndex <= 0}
            title="Scroll to previous section (Up / Left Arrow)"
            aria-label="Scroll to previous section"
            className="h-8 px-2.5 rounded-lg bg-[var(--p-surface-elevated)] hover:bg-[var(--p-bg)] border border-[var(--p-border)] text-[var(--p-ink)] inline-flex items-center gap-1 text-[12px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Prev</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setInspectorOpen(true);
              setInspectorTab('sections');
            }}
            className="px-3 h-8 rounded-lg text-[12px] font-semibold text-[var(--p-ink)] hover:bg-[var(--p-surface-elevated)] transition-colors inline-flex items-center gap-2 cursor-pointer max-w-[200px]"
            title="View all sections"
          >
            <span className="font-[family-name:var(--font-mono)] text-[var(--p-accent)] tabular-nums shrink-0">
              {sections.length > 0
                ? `${activeSectionIndex + 1}/${sections.length}`
                : 'Step'}
            </span>
            <span className="truncate hidden sm:inline">{currentSectionLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => handleStepSection(1)}
            disabled={sections.length > 0 && activeSectionIndex >= sections.length - 1}
            title="Scroll to next section (Down / Right Arrow)"
            aria-label="Scroll to next section"
            className="h-8 px-2.5 rounded-lg bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] inline-flex items-center gap-1 text-[12px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span className="hidden md:inline">Next</span>
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: TV Feed, Website-Only, & Inspector Toggle */}
        <div className="flex items-center gap-2 shrink-0">

          {/* TV Feed & Website-Only Controls */}
          <a
            href={`/tv?id=${encodeURIComponent(portfolio.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open clean TV Feed window to display on HDMI TV"
            className="h-9 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[12px] font-semibold text-[var(--p-ink)] inline-flex items-center gap-1.5 transition-colors"
          >
            <Tv className="w-3.5 h-3.5 text-[var(--p-accent)]" />
            <span className="hidden md:inline">TV Feed</span>
            {tvConnected && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-500"
                title="TV display connected"
              />
            )}
          </a>

          <button
            type="button"
            onClick={() => setTvWebsiteOnly((prev) => !prev)}
            title={
              tvWebsiteOnly
                ? 'TV Feed shows ONLY the pure website view (click to mirror laser/drawings on TV)'
                : 'TV Feed mirrors website + laser/drawing overlays (click for pure website only)'
            }
            className={`h-9 px-3 rounded-lg border text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              tvWebsiteOnly
                ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/12 text-[var(--p-accent)]'
                : 'border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[var(--p-ink)]'
            }`}
          >
            {tvWebsiteOnly ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            <span className="hidden xl:inline">
              {tvWebsiteOnly ? 'TV: Site Only' : 'TV: +Overlays'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCleanWebsiteOnly(true);
              setInspectorOpen(false);
            }}
            title="Show ONLY the website view on this screen (press Esc to return to controls)"
            className="h-9 px-3 rounded-lg bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Website Only</span>
          </button>

          <button
            type="button"
            onClick={() => setInspectorOpen((prev) => !prev)}
            title={inspectorOpen ? 'Hide inspection panel' : 'Show inspection panel'}
            aria-label={inspectorOpen ? 'Hide inspection panel' : 'Show inspection panel'}
            className="h-9 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[12px] font-semibold text-[var(--p-ink)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {inspectorOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
            <span className="hidden xl:inline">Tools</span>
          </button>
        </div>
        </header>
      )}

      {/* Main Studio Split Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Subtle hover-only exit button when viewing clean Website-Only mode on single/mirrored display */}
        {cleanWebsiteOnly && (
          <button
            type="button"
            onClick={() => {
              setCleanWebsiteOnly(false);
              setInspectorOpen(true);
            }}
            title="Exit Website-Only view (or press Esc)"
            className="fixed top-3 right-3 z-50 h-9 px-3 rounded-lg bg-zinc-950/75 text-white border border-white/15 backdrop-blur-sm text-[12px] font-semibold inline-flex items-center gap-1.5 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer shadow-lg"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Show Controls (Esc)</span>
          </button>
        )}

        {/* Left/Center: Portfolio Presentation Stage */}
        <div
          className={`flex-1 flex flex-col min-w-0 relative transition-colors duration-200 ${
            cleanWebsiteOnly
              ? 'bg-white'
              : spotlightDim
                ? 'bg-zinc-950'
                : 'bg-[var(--p-surface)]'
          }`}
        >
          {/* Floating Presentation & Viewport Control Bar (hidden in Website-Only mode) */}
          {!cleanWebsiteOnly && (
            <div className="px-3 md:px-4 py-2 border-b border-[var(--p-border)] bg-[var(--p-surface-elevated)]/95 backdrop-blur-sm flex flex-col gap-2 shrink-0 z-20">
              {/* Row 1: Pointer Tools, X-Ray, Spotlight, & Stopwatch */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTool('interact')}
                    className={`h-8 px-2.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                      tool === 'interact'
                        ? 'bg-[var(--p-action)] text-[var(--p-action-ink)]'
                        : 'text-[var(--p-ink-secondary)] hover:bg-[var(--p-surface)]'
                    }`}
                  >
                    <MousePointer2 className="w-3.5 h-3.5" />
                    <span>Interact</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTool('inspect');
                      setInspectorOpen(true);
                      setInspectorTab('inspector');
                    }}
                    disabled={!isSameOrigin}
                    title={
                      isSameOrigin
                        ? 'Hover and click any web element to track its DOM, styles, and code'
                        : 'Element inspection unavailable on cross-origin URLs'
                    }
                    className={`h-8 px-2.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                      tool === 'inspect'
                        ? 'bg-[var(--p-accent)] text-[var(--p-accent-ink)]'
                        : 'text-[var(--p-ink-secondary)] hover:bg-[var(--p-surface)]'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Inspect</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTool('laser')}
                    className={`h-8 px-2.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                      tool === 'laser'
                        ? 'bg-rose-600 text-white'
                        : 'text-[var(--p-ink-secondary)] hover:bg-[var(--p-surface)]'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Laser</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTool('draw')}
                    className={`h-8 px-2.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                      tool === 'draw'
                        ? 'bg-[var(--p-accent)] text-[var(--p-accent-ink)]'
                        : 'text-[var(--p-ink-secondary)] hover:bg-[var(--p-surface)]'
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Draw</span>
                  </button>

                  {tool === 'draw' && (
                    <div className="flex flex-wrap items-center gap-1.5 ml-1 pl-2 border-l border-[var(--p-border)]">
                      {/* Pen Behavior: Pin to Page Area vs Stick to Screen */}
                      <div
                        role="group"
                        aria-label="Pen anchor behavior"
                        className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--p-surface)] border border-[var(--p-border)]"
                      >
                        <button
                          type="button"
                          onClick={() => setPenAnchor('document')}
                          disabled={!isSameOrigin}
                          title={
                            isSameOrigin
                              ? 'Stick to Page — lines stay pinned to the exact area as you scroll'
                              : 'Page pinning requires local, GitHub, or uploaded portfolios'
                          }
                          className={`h-6 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                            effectiveAnchor === 'document'
                              ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] shadow-xs'
                              : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                          }`}
                        >
                          <Pin className="w-3 h-3" />
                          <span>Page</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPenAnchor('screen')}
                          title="Stick to Screen — lines stay fixed on the viewport while scrolling"
                          className={`h-6 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
                            effectiveAnchor === 'screen'
                              ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] shadow-xs'
                              : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                          }`}
                        >
                          <Monitor className="w-3 h-3" />
                          <span>Screen</span>
                        </button>
                      </div>

                      {PEN_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setPenColor(c.value)}
                          aria-label={`Pen color ${c.name}`}
                          className={`w-4 h-4 rounded-full border-2 cursor-pointer transition-transform ${
                            penColor === c.value
                              ? 'border-[var(--p-ink)] scale-110'
                              : 'border-transparent'
                          }`}
                          style={{ backgroundColor: c.value }}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                        disabled={strokes.length === 0}
                        title="Undo last stroke"
                        className="p-1 rounded-md text-[var(--p-ink-secondary)] hover:bg-[var(--p-surface)] disabled:opacity-40 cursor-pointer"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setStrokes([])}
                        disabled={strokes.length === 0}
                        title="Clear all annotations"
                        className="p-1 rounded-md text-[var(--p-ink-secondary)] hover:bg-[var(--p-surface)] disabled:opacity-40 cursor-pointer"
                      >
                        <Eraser className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {tool !== 'draw' && strokes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setStrokes([])}
                      className="ml-1 px-2 h-7 rounded-md border border-[var(--p-border)] text-[11px] font-medium text-[var(--p-muted)] hover:text-[var(--p-ink)] cursor-pointer whitespace-nowrap"
                    >
                      Clear ({strokes.length})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setXrayEnabled((prev) => !prev)}
                    disabled={!isSameOrigin}
                    title="Toggle DOM box-model wireframe outlines"
                    className={`h-8 px-2.5 rounded-lg border text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap disabled:opacity-40 ${
                      xrayEnabled
                        ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/12 text-[var(--p-accent)]'
                        : 'border-[var(--p-border)] text-[var(--p-ink-secondary)] hover:bg-[var(--p-surface)]'
                    }`}
                  >
                    <Box className="w-3.5 h-3.5" />
                    <span>X-Ray</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSpotlightDim((prev) => !prev)}
                    title="Dim surrounding studio background for presentation focus"
                    className={`h-8 px-2.5 rounded-lg border text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                      spotlightDim
                        ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/12 text-[var(--p-accent)]'
                        : 'border-[var(--p-border)] text-[var(--p-ink-secondary)] hover:bg-[var(--p-surface)]'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Spotlight</span>
                  </button>

                  {/* Stopwatch */}
                  <div className="flex items-center gap-1 border border-[var(--p-border)] rounded-lg px-2 h-8 bg-[var(--p-bg)] shrink-0">
                    <Timer className="w-3.5 h-3.5 text-[var(--p-muted)]" />
                    <span className="text-[12px] font-[family-name:var(--font-mono)] tabular-nums text-[var(--p-ink)] min-w-[38px]">
                      {formatTimer(timerSeconds)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTimerRunning((prev) => !prev)}
                      aria-label={timerRunning ? 'Pause timer' : 'Start timer'}
                      className="p-1 text-[var(--p-ink-secondary)] hover:text-[var(--p-ink)] cursor-pointer"
                    >
                      {timerRunning ? (
                        <Pause className="w-3 h-3" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTimerRunning(false);
                        setTimerSeconds(0);
                      }}
                      aria-label="Reset timer"
                      className="p-1 text-[var(--p-muted)] hover:text-[var(--p-ink)] cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Stable Viewport Presets (Desktop/Tablet/Mobile), Freeform W×H px, & Zoom */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[var(--p-border)]/70">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Viewport Preset Switcher (always visible, fixed dimensions) */}
                  <div className="flex items-center gap-0.5 p-0.5 h-8 bg-[var(--p-surface)] rounded-lg border border-[var(--p-border)] shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewport('desktop')}
                      title="Desktop viewport (100%)"
                      aria-label="Desktop viewport"
                      className={`h-7 px-2 rounded-md cursor-pointer transition-colors inline-flex items-center gap-1 text-[11px] font-medium ${
                        viewport === 'desktop'
                          ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] shadow-xs'
                          : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Desktop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setViewport('tablet');
                        setWidthDraft('820');
                      }}
                      title="Tablet viewport (820px)"
                      aria-label="Tablet viewport"
                      className={`h-7 px-2 rounded-md cursor-pointer transition-colors inline-flex items-center gap-1 text-[11px] font-medium ${
                        viewport === 'tablet'
                          ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] shadow-xs'
                          : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                      }`}
                    >
                      <Tablet className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Tablet</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setViewport('mobile');
                        setWidthDraft('390');
                      }}
                      title="Mobile viewport (390px)"
                      aria-label="Mobile viewport"
                      className={`h-7 px-2 rounded-md cursor-pointer transition-colors inline-flex items-center gap-1 text-[11px] font-medium ${
                        viewport === 'mobile'
                          ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] shadow-xs'
                          : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Mobile</span>
                    </button>
                  </div>

                  {/* Freeform Width × Height (px) Control */}
                  <div
                    className={`flex items-center gap-1.5 border rounded-lg px-2 h-8 bg-[var(--p-bg)] shrink-0 ${
                      viewport === 'custom'
                        ? 'border-[var(--p-accent)]'
                        : 'border-[var(--p-border)]'
                    }`}
                    title="Freeform website width and height in pixels (or drag stage edges)"
                  >
                    <label
                      htmlFor="stage-width-px"
                      className="text-[11px] font-semibold text-[var(--p-muted)] leading-none select-none"
                    >
                      W
                    </label>
                    <input
                      id="stage-width-px"
                      type="text"
                      inputMode="numeric"
                      value={widthDraft}
                      onChange={(e) =>
                        handleWidthInputChange(e.target.value.replace(/[^0-9]/g, ''))
                      }
                      onBlur={commitDimensionDrafts}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitDimensionDrafts();
                          setViewport('custom');
                        }
                      }}
                      aria-label="Website width in pixels"
                      className="w-12 h-6 leading-6 px-1 py-0 rounded bg-[var(--p-surface-subtle)] border border-[var(--p-border)] text-[11px] font-[family-name:var(--font-mono)] tabular-nums text-[var(--p-ink)] focus:outline-none focus:border-[var(--p-accent)] text-center"
                    />
                    <span className="text-[11px] text-[var(--p-muted)] leading-none select-none">
                      ×
                    </span>
                    <label
                      htmlFor="stage-height-px"
                      className="text-[11px] font-semibold text-[var(--p-muted)] leading-none select-none"
                    >
                      H
                    </label>
                    <input
                      id="stage-height-px"
                      type="text"
                      inputMode="numeric"
                      value={heightDraft}
                      onChange={(e) =>
                        handleHeightInputChange(e.target.value.replace(/[^0-9]/g, ''))
                      }
                      onBlur={commitDimensionDrafts}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitDimensionDrafts();
                          setViewport('custom');
                        }
                      }}
                      aria-label="Website height in pixels"
                      className="w-12 h-6 leading-6 px-1 py-0 rounded bg-[var(--p-surface-subtle)] border border-[var(--p-border)] text-[11px] font-[family-name:var(--font-mono)] tabular-nums text-[var(--p-ink)] focus:outline-none focus:border-[var(--p-accent)] text-center"
                    />
                    <span className="text-[10px] font-[family-name:var(--font-mono)] text-[var(--p-muted)] leading-none select-none">
                      px
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (viewport === 'custom') {
                          setViewport('desktop');
                        } else {
                          commitDimensionDrafts();
                          setViewport('custom');
                        }
                      }}
                      title={
                        viewport === 'custom'
                          ? 'Reset to full Desktop fit'
                          : 'Apply custom pixel width & height'
                      }
                      className={`w-10 h-6 rounded text-[10px] font-semibold cursor-pointer transition-colors text-center shrink-0 ${
                        viewport === 'custom'
                          ? 'bg-[var(--p-accent)] text-[var(--p-accent-ink)]'
                          : 'bg-[var(--p-surface)] hover:bg-[var(--p-border)] text-[var(--p-ink)]'
                      }`}
                    >
                      {viewport === 'custom' ? 'Fit' : 'Set'}
                    </button>
                  </div>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1 border border-[var(--p-border)] rounded-lg px-1.5 h-8 bg-[var(--p-bg)] shrink-0">
                  {[0.75, 1, 1.25].map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => setZoom(scale)}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-[family-name:var(--font-mono)] cursor-pointer ${
                        zoom === scale
                          ? 'bg-[var(--p-action)] text-[var(--p-action-ink)] font-semibold'
                          : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                      }`}
                    >
                      {Math.round(scale * 100)}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stage Canvas Container */}
          <SmoothScrollArea
            className="flex-1 overflow-auto"
            contentClassName={`min-h-full ${
              viewport === 'custom' ? 'min-w-full' : 'h-full'
            } ${cleanWebsiteOnly ? 'p-0' : 'p-3 md:p-5'}`}
          >
            <div
              ref={stageFrameRef}
              onMouseMove={handleStageMouseMove}
              onMouseLeave={() => setLaserPos(null)}
              style={{
                width: viewport === 'custom' ? `${customWidth}px` : undefined,
                height: viewport === 'custom' ? `${customHeight}px` : undefined,
                transform: !cleanWebsiteOnly && zoom !== 1 ? `scale(${zoom})` : undefined,
                transformOrigin: 'top center',
              }}
              className={`${frameWidthClass} mx-auto relative overflow-hidden bg-white ${
                isResizing ? '' : 'transition-[width,height] duration-150'
              } ${
                cleanWebsiteOnly && viewport === 'desktop'
                  ? 'rounded-none border-0 shadow-none'
                  : 'rounded-xl border border-[var(--p-border)] shadow-xl'
              }`}
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
                  key={portfolio.id}
                  ref={iframeRef}
                  sandbox="allow-scripts allow-forms allow-popups"
                  srcDoc={bridgedHtml}
                  onLoad={scanPortfolioStructure}
                  title={`${portfolio.studentName} Uploaded Portfolio Stage`}
                  className={`w-full h-full border-0 bg-white ${
                    isResizing ? 'pointer-events-none' : ''
                  }`}
                />
              ) : hasLiveUrl && !isStageShowingShowcase ? (
                <div className="w-full h-full flex flex-col bg-white">
                  {isCrossOriginLiveUrl && !cleanWebsiteOnly && (
                    <div className="px-3 py-1.5 border-b border-[var(--p-border)] bg-[var(--p-surface-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className="w-3.5 h-3.5 text-[var(--p-accent)] shrink-0" />
                        <span className="font-[family-name:var(--font-mono)] text-[var(--p-ink)] truncate max-w-[260px]">
                          {safeLiveUrl.replace(/^https?:\/\//i, '')}
                        </span>
                        <span className="hidden md:inline text-[var(--p-muted)]">
                          · If blank (site blocks framing), use Showcase View or open externally
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setLiveStageMode('showcase')}
                          className="h-6 px-2.5 rounded-md border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[11px] font-semibold text-[var(--p-ink)] cursor-pointer transition-colors"
                        >
                          Showcase View
                        </button>
                        <a
                          href={safeLiveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-6 px-2.5 rounded-md bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          <span>Open Live Site</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 min-h-0 relative">
                    {isMixedContentBlocked ? (
                      <div className="w-full h-full flex items-center justify-center p-8 bg-[var(--p-bg)] text-[var(--p-ink)]">
                        <div className="max-w-md w-full p-6 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-center space-y-4 shadow-sm">
                          <div className="w-11 h-11 rounded-xl bg-[var(--p-accent)]/12 text-[var(--p-accent)] flex items-center justify-center mx-auto">
                            <Globe className="w-5 h-5" />
                          </div>
                          <div className="space-y-1.5">
                            <h3 className="text-[16px] font-bold text-[var(--p-ink)]">
                              Insecure HTTP Link Cannot Embed Here
                            </h3>
                            <p className="text-[13px] text-[var(--p-muted)] leading-relaxed">
                              Modern browsers block <code className="font-[family-name:var(--font-mono)]">http://</code> sites inside an <code className="font-[family-name:var(--font-mono)]">https://</code> frame. Open the website directly in a new tab or present using Showcase View.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                            <a
                              href={safeLiveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-9 px-4 rounded-lg bg-[var(--p-accent)] hover:bg-[var(--p-accent-hover)] text-[var(--p-accent-ink)] text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <span>Open External Site</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => setLiveStageMode('showcase')}
                              className="h-9 px-4 rounded-lg border border-[var(--p-border)] hover:bg-[var(--p-surface)] text-[12px] font-semibold text-[var(--p-ink)] cursor-pointer transition-colors"
                            >
                              Switch to Showcase View
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <iframe
                        key={portfolio.id}
                        ref={iframeRef}
                        src={safeLiveUrl}
                        sandbox={
                          isCrossOriginLiveUrl
                            ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox'
                            : 'allow-scripts allow-same-origin allow-forms allow-popups'
                        }
                        referrerPolicy="no-referrer"
                        onLoad={scanPortfolioStructure}
                        title={`${portfolio.studentName} Portfolio Review Stage`}
                        className={`w-full h-full border-0 bg-white ${
                          isResizing ? 'pointer-events-none' : ''
                        }`}
                      />
                    )}
                  </div>
                </div>
              ) : (
                /* Built-in Multi-Section Showcase Stage (for Showcase portfolios or URL fallback) */
                <div className="w-full h-full flex flex-col">
                  {hasLiveUrl && !cleanWebsiteOnly && (
                    <div className="px-3 py-1.5 border-b border-[var(--p-border)] bg-[var(--p-surface-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
                      <span className="text-[var(--p-muted)]">
                        Viewing Showcase Fallback (full Section Map, Inspect, X-Ray &amp; Page-Pin Draw active)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLiveStageMode('embed')}
                          className="h-6 px-2.5 rounded-md border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[11px] font-semibold text-[var(--p-ink)] cursor-pointer transition-colors"
                        >
                          Back to Website Embed
                        </button>
                        <a
                          href={safeLiveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-6 px-2.5 rounded-md bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          <span>Open Live Site</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                  <SmoothScrollArea
                    ref={showcaseScrollRef}
                    resetKey={`${portfolio.id}-${liveStageMode}`}
                    data-showcase-root
                    className="flex-1 min-h-0 w-full overflow-y-auto bg-[var(--p-bg)] text-[var(--p-ink)]"
                  >
                    <section
                      id="overview"
                      data-review-section
                      data-review-label="Hero & Overview"
                      className="p-8 md:p-12 border-b border-[var(--p-border)] grid grid-cols-1 md:grid-cols-12 gap-8 items-center"
                    >
                      <div className="md:col-span-7 space-y-4">
                        <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--p-accent)]">
                          {portfolio.discipline} · Published Cohort Showcase
                        </p>
                        <h1 className="text-[clamp(1.85rem,3.5vw,2.75rem)] font-bold tracking-tight leading-[1.1] text-[var(--p-ink)]">
                          {portfolio.projectTitle}
                        </h1>
                        <p className="text-[15px] text-[var(--p-ink-secondary)] leading-relaxed">
                          {portfolio.projectSummary}
                        </p>
                        <div className="flex items-center gap-3 pt-2">
                          <span
                            className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white"
                            style={{ backgroundColor: portfolio.avatarColor }}
                          >
                            {portfolio.avatarUrl ? (
                              <img
                                src={portfolio.avatarUrl}
                                alt={portfolio.studentName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              portfolio.initials
                            )}
                          </span>
                          <div>
                            <div className="text-[14px] font-bold text-[var(--p-ink)]">
                              {portfolio.studentName}
                            </div>
                            <div className="text-[12px] text-[var(--p-muted)]">
                              {portfolio.username ? `@${portfolio.username} · ` : ''}
                              {portfolio.roleTitle}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-5 aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--p-border)] bg-[var(--p-surface)]">
                        {portfolio.thumbnail ? (
                          <img
                            src={portfolio.thumbnail}
                            alt={portfolio.projectTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            className={`w-full h-full bg-gradient-to-br ${portfolio.fallbackGradient} flex flex-col items-center justify-center p-6 text-center`}
                          >
                            <Layers className="w-9 h-9 text-white/80 mb-2" />
                            <span className="text-sm font-semibold text-white">
                              {portfolio.projectTitle}
                            </span>
                          </div>
                        )}
                      </div>
                    </section>

                    <section
                      id="about"
                      data-review-section
                      data-review-label="Profile & Bio"
                      className="p-8 md:p-12 border-b border-[var(--p-border)] bg-[var(--p-surface-subtle)] space-y-4"
                    >
                      <h2 className="text-[22px] font-bold text-[var(--p-ink)]">
                        About {portfolio.studentName}
                      </h2>
                      <p className="text-[15px] text-[var(--p-ink-secondary)] leading-relaxed max-w-3xl">
                        {portfolio.bio || portfolio.projectSummary}
                      </p>
                    </section>

                    <section
                      id="stack"
                      data-review-section
                      data-review-label="Technical Stack"
                      className="p-8 md:p-12 border-b border-[var(--p-border)] space-y-4"
                    >
                      <h2 className="text-[22px] font-bold text-[var(--p-ink)]">
                        Technical Stack & Highlights
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {(portfolio.skills ?? []).map((skill) => (
                          <span
                            key={skill}
                            className="px-3.5 py-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-[13px] font-semibold text-[var(--p-ink)]"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </section>

                    <section
                      id="contact"
                      data-review-section
                      data-review-label="Social & Contact"
                      className="p-8 md:p-12 bg-[var(--p-surface-subtle)] space-y-4"
                    >
                      <h2 className="text-[22px] font-bold text-[var(--p-ink)]">
                        Social Media & Contact Links
                      </h2>
                      <SocialLinksBar
                        links={portfolio.socialLinks}
                        size="md"
                        showLabels
                      />
                    </section>
                  </SmoothScrollArea>
                </div>
              )}

              {/* Live Element Inspection Bounding Box Overlay */}
              {!cleanWebsiteOnly && activeBox && (
                <div
                  aria-hidden="true"
                  style={{
                    top: `${activeBox.rect.top}px`,
                    left: `${activeBox.rect.left}px`,
                    width: `${Math.max(2, activeBox.rect.width)}px`,
                    height: `${Math.max(2, activeBox.rect.height)}px`,
                  }}
                  className={`pointer-events-none absolute z-20 transition-all duration-75 ${
                    hoveredElement
                      ? 'border-2 border-[#ea4c89] bg-[#ea4c89]/10'
                      : 'border-2 border-cyan-500 bg-cyan-500/10'
                  }`}
                >
                  <div
                    className={`absolute -top-6 left-0 px-2 py-0.5 rounded text-[11px] font-[family-name:var(--font-mono)] font-semibold text-white whitespace-nowrap shadow ${
                      hoveredElement ? 'bg-[#ea4c89]' : 'bg-cyan-600'
                    }`}
                  >
                    {activeBox.selector} · {Math.round(activeBox.rect.width)}×
                    {Math.round(activeBox.rect.height)}
                  </div>
                </div>
              )}

              {/* Laser Pointer Capture Layer & Glowing Dot (always mounted over iframe when laser is active) */}
              {!cleanWebsiteOnly && tool === 'laser' && (
                <div
                  onMouseMove={handleStageMouseMove}
                  onMouseLeave={() => setLaserPos(null)}
                  className="absolute inset-0 z-30 cursor-none"
                >
                  {laserPos && (
                    <div
                      aria-hidden="true"
                      style={{
                        left: `${laserPos.x}px`,
                        top: `${laserPos.y}px`,
                      }}
                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-rose-500/90 ring-4 ring-rose-500/35 shadow-[0_0_24px_rgba(244,63,94,0.95)]"
                    />
                  )}
                </div>
              )}

              {/* Freehand Annotation Canvas */}
              <canvas
                ref={canvasRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                className={`absolute inset-0 w-full h-full z-[25] touch-none ${
                  cleanWebsiteOnly ? 'hidden' : ''
                } ${
                  tool === 'draw'
                    ? isGrabPanning
                      ? 'pointer-events-auto cursor-grabbing'
                      : isSpacePanning
                        ? 'pointer-events-auto cursor-grab'
                        : 'pointer-events-auto cursor-crosshair'
                    : 'pointer-events-none'
                }`}
              />

              {/* Interactive Freeform Edge & Corner Resize Handles */}
              {!cleanWebsiteOnly && (
                <>
                  <div
                    role="separator"
                    aria-label="Drag to resize website width"
                    onPointerDown={(e) => startResizeDrag('width', e)}
                    title="Drag horizontally to resize width (px)"
                    className="absolute top-2 bottom-4 right-0 w-2 cursor-ew-resize z-40 group flex items-center justify-center"
                  >
                    <span className="w-1 h-10 rounded-full bg-[var(--p-border-strong)]/60 group-hover:bg-[var(--p-accent)] transition-colors" />
                  </div>
                  <div
                    role="separator"
                    aria-label="Drag to resize website height"
                    onPointerDown={(e) => startResizeDrag('height', e)}
                    title="Drag vertically to resize height (px)"
                    className="absolute left-2 right-4 bottom-0 h-2 cursor-ns-resize z-40 group flex items-center justify-center"
                  >
                    <span className="h-1 w-10 rounded-full bg-[var(--p-border-strong)]/60 group-hover:bg-[var(--p-accent)] transition-colors" />
                  </div>
                  <div
                    role="separator"
                    aria-label="Drag to resize website width and height"
                    onPointerDown={(e) => startResizeDrag('both', e)}
                    title="Drag corner to resize width & height (px)"
                    className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize z-40 flex items-end justify-end p-0.5 group"
                  >
                    <span className="w-2.5 h-2.5 rounded-br border-r-2 border-b-2 border-[var(--p-border-strong)] group-hover:border-[var(--p-accent)] transition-colors" />
                  </div>
                </>
              )}

              {/* Live Dimension Readout During Active Resize Drag */}
              {isResizing && (
                <div className="pointer-events-none absolute bottom-3 right-3 z-50 px-2.5 py-1 rounded-md bg-zinc-950/85 text-white text-[11px] font-[family-name:var(--font-mono)] tabular-nums shadow-lg">
                  {customWidth} × {customHeight} px
                </div>
              )}
            </div>
          </SmoothScrollArea>
        </div>

        {/* Right Side: Presentation & Inspection Tools Sidebar (hidden in Website-Only mode) */}
        {!cleanWebsiteOnly && inspectorOpen && (
          <aside className="w-full max-w-[390px] lg:w-[390px] xl:w-[420px] border-l border-[var(--p-border)] bg-[var(--p-surface-elevated)] flex flex-col shrink-0 overflow-hidden">
            {/* Inspector Tabs */}
            <div className="p-2 border-b border-[var(--p-border)] grid grid-cols-4 gap-1 bg-[var(--p-surface-subtle)] shrink-0">
              <button
                type="button"
                onClick={() => setInspectorTab('sections')}
                className={`h-9 rounded-lg text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  inspectorTab === 'sections'
                    ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] border border-[var(--p-border)] shadow-xs'
                    : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Sections</span>
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab('inspector')}
                className={`h-9 rounded-lg text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  inspectorTab === 'inspector'
                    ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] border border-[var(--p-border)] shadow-xs'
                    : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Inspect</span>
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab('code')}
                className={`h-9 rounded-lg text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  inspectorTab === 'code'
                    ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] border border-[var(--p-border)] shadow-xs'
                    : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Code</span>
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab('dom')}
                className={`h-9 rounded-lg text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  inspectorTab === 'dom'
                    ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] border border-[var(--p-border)] shadow-xs'
                    : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                }`}
              >
                <ListTree className="w-3.5 h-3.5" />
                <span>DOM</span>
              </button>
            </div>

            {/* Tab Content */}
            <SmoothScrollArea
              resetKey={inspectorTab}
              className="flex-1 overflow-y-auto"
              contentClassName="p-4 space-y-5"
            >
              {/* TAB 1: SECTIONS & PRESENTER NOTES */}
              {inspectorTab === 'sections' && (
                <>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-[13px] font-bold text-[var(--p-ink)]">
                        Presentation Section Map
                      </h2>
                      <span className="text-[11px] font-[family-name:var(--font-mono)] text-[var(--p-muted)]">
                        {sections.length} stops
                      </span>
                    </div>

                    {sections.length > 0 ? (
                      <div className="space-y-1.5">
                        {sections.map((sec, idx) => {
                          const isCurrent = idx === activeSectionIndex;
                          return (
                            <button
                              key={`${sec.id}-${idx}`}
                              type="button"
                              onClick={() => scrollToSection(idx)}
                              className={`w-full px-3 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                isCurrent
                                  ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/10 text-[var(--p-ink)]'
                                  : 'border-[var(--p-border)] bg-[var(--p-surface-subtle)] hover:bg-[var(--p-surface)] text-[var(--p-ink-secondary)]'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-[13px] font-semibold truncate">
                                  {idx + 1}. {sec.label}
                                </div>
                                <div className="text-[11px] font-[family-name:var(--font-mono)] text-[var(--p-muted)] truncate">
                                  &lt;{sec.selector}&gt; · y:{sec.top}px
                                </div>
                              </div>
                              {isCurrent && (
                                <span className="w-2 h-2 rounded-full bg-[var(--p-accent)] shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[12px] text-[var(--p-muted)] leading-relaxed space-y-2.5">
                        <p>
                          {isSameOrigin
                            ? 'Scanning document sections...'
                            : 'External cross-origin website loaded. Section discovery is blocked by browser CORS policy—use Showcase View for Section Map or open the standalone tab.'}
                        </p>
                        {!isSameOrigin && hasLiveUrl && !isStageShowingShowcase && (
                          <button
                            type="button"
                            onClick={() => setLiveStageMode('showcase')}
                            className="h-8 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[11px] font-semibold text-[var(--p-ink)] cursor-pointer transition-colors"
                          >
                            Switch to Showcase View
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Speaker Notes */}
                  <div className="pt-4 border-t border-[var(--p-border)] space-y-2">
                    <label
                      htmlFor="presenter-notes"
                      className="block text-[13px] font-bold text-[var(--p-ink)]"
                    >
                      Presenter Review Notes
                    </label>
                    <textarea
                      id="presenter-notes"
                      rows={5}
                      value={notes}
                      onChange={(e) => handleNotesChange(e.target.value)}
                      placeholder="Jot down feedback, code observations, or demo talking points for this portfolio (auto-saved locally)..."
                      className="w-full p-3 rounded-xl border border-[var(--p-border)] bg-[var(--p-bg)] text-[13px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)] resize-y"
                    />
                  </div>

                  {hasLiveUrl && safeLiveUrl && (
                    <div className="pt-2">
                      <a
                        href={safeLiveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-10 px-4 rounded-lg border border-[var(--p-border)] hover:bg-[var(--p-surface)] text-[12px] font-semibold text-[var(--p-ink)] inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Open Direct Tab</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </>
              )}

              {/* TAB 2: LIVE ELEMENT INSPECTOR */}
              {inspectorTab === 'inspector' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[13px] font-bold text-[var(--p-ink)]">
                      Element Tracker
                    </h2>
                    <button
                      type="button"
                      onClick={() =>
                        setTool((prev) => (prev === 'inspect' ? 'interact' : 'inspect'))
                      }
                      disabled={!isSameOrigin}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-40 ${
                        tool === 'inspect'
                          ? 'bg-[var(--p-accent)] text-[var(--p-accent-ink)]'
                          : 'border border-[var(--p-border)] text-[var(--p-ink)] hover:bg-[var(--p-surface)]'
                      }`}
                    >
                      {tool === 'inspect' ? 'Picker Active' : 'Enable Picker'}
                    </button>
                  </div>

                  {!isSameOrigin ? (
                    <div className="p-4 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[12px] text-[var(--p-muted)] leading-relaxed">
                      Browser security blocks inspecting DOM elements inside cross-origin external websites. Local Class A portfolios support full live element tracking.
                    </div>
                  ) : !lockedElement ? (
                    <div className="p-4 rounded-xl border border-dashed border-[var(--p-border-strong)] bg-[var(--p-surface-subtle)] text-[13px] text-[var(--p-muted)] leading-relaxed space-y-2">
                      <p>
                        Enable <strong className="text-[var(--p-ink)]">Inspect Element</strong> (or click any node in the <strong className="text-[var(--p-ink)]">DOM</strong> tab) and hover/click elements on the portfolio to track their dimensions, computed styles, and HTML.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Selector & Breadcrumb */}
                      <div className="p-3.5 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-[family-name:var(--font-mono)] text-[13px] font-bold text-[var(--p-accent)] truncate">
                            &lt;{lockedElement.selector}&gt;
                          </span>
                          <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--p-muted)] shrink-0">
                            {Math.round(lockedElement.rect.width)} ×{' '}
                            {Math.round(lockedElement.rect.height)}
                          </span>
                        </div>
                        <div className="text-[11px] font-[family-name:var(--font-mono)] text-[var(--p-muted)] leading-relaxed break-all">
                          {lockedElement.breadcrumb.join(' › ')}
                        </div>
                        {lockedElement.textPreview && (
                          <div className="text-[12px] text-[var(--p-ink-secondary)] italic border-t border-[var(--p-border)] pt-2">
                            &ldquo;{lockedElement.textPreview}&rdquo;
                          </div>
                        )}
                      </div>

                      {/* Computed Styles Grid */}
                      <div className="space-y-2">
                        <h3 className="text-[12px] font-bold text-[var(--p-ink)]">
                          Computed Styles & Box Model
                        </h3>
                        <div className="rounded-xl border border-[var(--p-border)] divide-y divide-[var(--p-border)] text-[12px] font-[family-name:var(--font-mono)]">
                          <div className="px-3 py-2 flex justify-between gap-2">
                            <span className="text-[var(--p-muted)]">display</span>
                            <span className="text-[var(--p-ink)]">{lockedElement.styles.display}</span>
                          </div>
                          <div className="px-3 py-2 flex justify-between gap-2">
                            <span className="text-[var(--p-muted)]">font</span>
                            <span className="text-[var(--p-ink)] truncate">
                              {lockedElement.styles.fontFamily} · {lockedElement.styles.fontSize}
                            </span>
                          </div>
                          <div className="px-3 py-2 flex justify-between gap-2 items-center">
                            <span className="text-[var(--p-muted)]">color</span>
                            <span className="inline-flex items-center gap-1.5 text-[var(--p-ink)]">
                              <span
                                className="w-3 h-3 rounded border border-black/20"
                                style={{ backgroundColor: lockedElement.styles.color }}
                              />
                              {lockedElement.styles.color}
                            </span>
                          </div>
                          <div className="px-3 py-2 flex justify-between gap-2 items-center">
                            <span className="text-[var(--p-muted)]">background</span>
                            <span className="inline-flex items-center gap-1.5 text-[var(--p-ink)] truncate">
                              <span
                                className="w-3 h-3 rounded border border-black/20 shrink-0"
                                style={{
                                  backgroundColor: lockedElement.styles.backgroundColor,
                                }}
                              />
                              <span className="truncate">
                                {lockedElement.styles.backgroundColor}
                              </span>
                            </span>
                          </div>
                          <div className="px-3 py-2 flex justify-between gap-2">
                            <span className="text-[var(--p-muted)]">padding</span>
                            <span className="text-[var(--p-ink)]">{lockedElement.styles.padding}</span>
                          </div>
                          <div className="px-3 py-2 flex justify-between gap-2">
                            <span className="text-[var(--p-muted)]">margin</span>
                            <span className="text-[var(--p-ink)]">{lockedElement.styles.margin}</span>
                          </div>
                          {lockedElement.styles.display.includes('grid') && (
                            <div className="px-3 py-2 flex justify-between gap-2">
                              <span className="text-[var(--p-muted)]">grid-cols</span>
                              <span className="text-[var(--p-ink)] truncate">
                                {lockedElement.styles.gridTemplateColumns}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* OuterHTML Snippet & Jump to Source */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-[12px] font-bold text-[var(--p-ink)]">
                            Element Markup
                          </h3>
                          <div className="flex items-center gap-1.5">
                            {sourceRaw && (
                              <button
                                type="button"
                                onClick={() => {
                                  const q =
                                    lockedElement.id ||
                                    lockedElement.classes[0] ||
                                    lockedElement.tag;
                                  setCodeSearch(q);
                                  setCodeTab('html');
                                  setInspectorTab('code');
                                }}
                                className="px-2 py-1 rounded border border-[var(--p-border)] text-[11px] font-medium text-[var(--p-accent)] hover:bg-[var(--p-surface)] cursor-pointer"
                              >
                                Find in Code
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleCopy(lockedElement.outerHtml, 'el-html')}
                              className="px-2 py-1 rounded border border-[var(--p-border)] text-[11px] font-medium text-[var(--p-ink)] hover:bg-[var(--p-surface)] inline-flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === 'el-html' ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>Copy</span>
                            </button>
                          </div>
                        </div>
                        <pre className="p-3 rounded-xl border border-[var(--p-border)] bg-zinc-950 text-zinc-100 text-[11px] font-[family-name:var(--font-mono)] overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                          {lockedElement.outerHtml}
                        </pre>
                      </div>

                      {/* Recently Tracked Elements */}
                      {trackedHistory.length > 1 && (
                        <div className="pt-2 border-t border-[var(--p-border)] space-y-2">
                          <h3 className="text-[12px] font-bold text-[var(--p-muted)]">
                            Recently Tracked Elements
                          </h3>
                          <div className="flex flex-wrap gap-1.5">
                            {trackedHistory.map((item) => (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => setLockedElement(item)}
                                className={`px-2 py-1 rounded border text-[11px] font-[family-name:var(--font-mono)] cursor-pointer ${
                                  lockedElement.key === item.key
                                    ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/10 text-[var(--p-accent)]'
                                    : 'border-[var(--p-border)] text-[var(--p-ink-secondary)] hover:bg-[var(--p-surface)]'
                                }`}
                              >
                                {item.selector}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: LIVE SOURCE CODE VIEWER */}
              {inspectorTab === 'code' && (
                <div className="space-y-3 flex flex-col h-full">
                  {!hasCodeSource ? (
                    <div className="p-4 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[13px] text-[var(--p-muted)] leading-relaxed">
                      This portfolio uses the built-in Gallery Showcase renderer rather than a standalone HTML file. Use the <strong className="text-[var(--p-ink)]">Inspect</strong> or <strong className="text-[var(--p-ink)]">DOM</strong> tab to inspect its rendered markup and styles.
                    </div>
                  ) : sourceLoading ? (
                    <div className="py-12 text-center text-[13px] text-[var(--p-muted)]">
                      Loading source code...
                    </div>
                  ) : !sourceRaw ? (
                    <div className="p-4 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[13px] text-[var(--p-muted)] leading-relaxed">
                      Source fetching is available for local Class A student sites. External cross-origin sites restrict direct source retrieval.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 bg-[var(--p-surface)] p-1 rounded-lg border border-[var(--p-border)]">
                          {(['all', 'html', 'css', 'js'] as CodeTab[]).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setCodeTab(t)}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase cursor-pointer ${
                                codeTab === t
                                  ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] shadow-xs'
                                  : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(displayedCode, 'full-code')}
                          className="px-2.5 py-1.5 rounded-lg border border-[var(--p-border)] text-[11px] font-semibold text-[var(--p-ink)] hover:bg-[var(--p-surface)] inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'full-code' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <FileCode className="w-3.5 h-3.5" />
                          )}
                          <span>Copy</span>
                        </button>
                      </div>

                      <div className="relative flex items-center">
                        <Search className="w-3.5 h-3.5 text-[var(--p-muted)] absolute left-3 pointer-events-none" />
                        <input
                          type="text"
                          value={codeSearch}
                          onChange={(e) => setCodeSearch(e.target.value)}
                          placeholder="Track code line, id, class, or function..."
                          className="w-full h-9 pl-8 pr-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[12px] font-[family-name:var(--font-mono)] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                        />
                      </div>

                      <SmoothScrollArea
                        resetKey={`${codeTab}-${codeSearch}`}
                        className="rounded-xl border border-[var(--p-border)] bg-zinc-950 text-zinc-100 overflow-auto max-h-[58vh] text-[11px] font-[family-name:var(--font-mono)] leading-relaxed"
                      >
                        {codeLines.length > 0 ? (
                          <table className="w-full border-collapse">
                            <tbody>
                              {codeLines.map((row) => (
                                <tr
                                  key={row.num}
                                  className={
                                    row.matches ? 'bg-[#ea4c89]/20' : 'hover:bg-white/5'
                                  }
                                >
                                  <td className="select-none text-right pr-3 pl-3 py-0.5 text-zinc-500 w-10 align-top">
                                    {row.num}
                                  </td>
                                  <td className="pr-3 py-0.5 whitespace-pre text-zinc-100">
                                    {row.line}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="p-4 text-zinc-400">
                            No lines matched &ldquo;{codeSearch}&rdquo;.
                          </div>
                        )}
                      </SmoothScrollArea>
                    </>
                  )}
                </div>
              )}

              {/* TAB 4: INTERACTIVE DOM TREE */}
              {inspectorTab === 'dom' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[13px] font-bold text-[var(--p-ink)]">
                      Live DOM Element Tree
                    </h2>
                    <span className="text-[11px] text-[var(--p-muted)]">
                      Click node to track
                    </span>
                  </div>

                  {!isSameOrigin ? (
                    <div className="p-4 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[12px] text-[var(--p-muted)]">
                      DOM tree unavailable for cross-origin external websites.
                    </div>
                  ) : domTree.length === 0 ? (
                    <div className="p-4 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[12px] text-[var(--p-muted)]">
                      No DOM elements scanned yet.
                    </div>
                  ) : (
                    <div className="space-y-0.5 font-[family-name:var(--font-mono)] text-[11px]">
                      {domTree.map((node) => (
                        <button
                          key={node.key}
                          type="button"
                          onClick={() => handleHighlightDomElement(node)}
                          style={{ paddingLeft: `${8 + node.depth * 12}px` }}
                          className="w-full py-1.5 pr-2 rounded-md text-left hover:bg-[var(--p-surface)] flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <span className="text-[var(--p-accent)] font-semibold shrink-0">
                            &lt;{node.tag}
                            {node.id ? `#${node.id}` : ''}
                            {node.classes.length > 0
                              ? `.${node.classes.join('.')}`
                              : ''}
                            &gt;
                          </span>
                          {node.label && (
                            <span className="text-[var(--p-muted)] truncate">
                              {node.label}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </SmoothScrollArea>
          </aside>
        )}
      </div>
    </div>
  );
};
