const DEVICE_VIEWER_KEY = 'se-class-a-device-viewer-v1';
const VIEWED_LEDGER_KEY = 'se-class-a-viewed-portfolios-v1';
const VIEW_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours per portfolio per device

let memoryFallbackViewerId: string | null = null;
const memoryFallbackViewed = new Map<string, number>();

function generateViewerToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Returns a persistent device-level viewer key shared across all tabs
 * (both logged-in and unlogged) in the same browser profile.
 */
export function getDeviceViewerKey(): string {
  if (typeof window === 'undefined') return 'ssr-viewer';

  try {
    const existing = window.localStorage.getItem(DEVICE_VIEWER_KEY)?.trim();
    if (existing) return existing;
    const created = generateViewerToken();
    window.localStorage.setItem(DEVICE_VIEWER_KEY, created);
    return created;
  } catch {
    if (!memoryFallbackViewerId) {
      memoryFallbackViewerId = generateViewerToken();
    }
    return memoryFallbackViewerId;
  }
}

function readViewedLedger(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(VIEWED_LEDGER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const now = Date.now();
    const cleaned: Record<string, number> = {};
    for (const [id, ts] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof ts === 'number' && Number.isFinite(ts) && now - ts < VIEW_COOLDOWN_MS) {
        cleaned[id] = ts;
      }
    }
    return cleaned;
  } catch {
    const now = Date.now();
    const cleaned: Record<string, number> = {};
    for (const [id, ts] of memoryFallbackViewed.entries()) {
      if (now - ts < VIEW_COOLDOWN_MS) {
        cleaned[id] = ts;
      }
    }
    return cleaned;
  }
}

function writeViewedLedger(ledger: Record<string, number>): void {
  const now = Date.now();
  for (const [id, ts] of Object.entries(ledger)) {
    memoryFallbackViewed.set(id, ts);
  }
  if (typeof window === 'undefined') return;
  try {
    const pruned: Record<string, number> = {};
    for (const [id, ts] of Object.entries(ledger)) {
      if (now - ts < VIEW_COOLDOWN_MS) {
        pruned[id] = ts;
      }
    }
    window.localStorage.setItem(VIEWED_LEDGER_KEY, JSON.stringify(pruned));
  } catch {
    // Ignore storage quota/privacy restrictions; memory map still prevents in-tab spam.
  }
}

/**
 * Checks whether a portfolio view should be counted for this device/tab.
 * Atomically marks the portfolio as viewed if eligible so concurrent/cross-tab
 * openings on the same device do not inflate view counts.
 */
export function claimPortfolioViewSlot(portfolioId: string): boolean {
  const cleanedId = portfolioId.trim();
  if (!cleanedId) return false;

  const now = Date.now();
  const ledger = readViewedLedger();
  const lastViewed = ledger[cleanedId];
  if (typeof lastViewed === 'number' && now - lastViewed < VIEW_COOLDOWN_MS) {
    return false;
  }

  ledger[cleanedId] = now;
  writeViewedLedger(ledger);
  return true;
}
