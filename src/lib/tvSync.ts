export type TvViewportMode = 'desktop' | 'tablet' | 'mobile' | 'custom';

export interface NormalizedStroke {
  color: string;
  points: { xPct: number; yPct: number }[];
}

export interface TvFeedState {
  portfolioId: string;
  sectionIndex: number;
  scrollTop: number;
  scrollRatio: number;
  viewport: TvViewportMode;
  customWidth?: number;
  customHeight?: number;
  tvWebsiteOnly: boolean;
  xrayEnabled: boolean;
  spotlightDim: boolean;
  laserPos: { xPct: number; yPct: number } | null;
  strokes: NormalizedStroke[];
  highlightedRect: {
    top: number;
    left: number;
    width: number;
    height: number;
    label: string;
  } | null;
  updatedAt: number;
}

export type TvSyncMessage =
  | { type: 'STATE_UPDATE'; payload: TvFeedState }
  | { type: 'REQUEST_STATE' }
  | { type: 'TV_CONNECTED' }
  | { type: 'TV_DISCONNECTED' };

const CHANNEL_NAME = 'se-class-a-tv-feed-v1';
const STORAGE_KEY = 'se-class-a-tv-feed-state-v1';

export function publishTvMessage(message: TvSyncMessage): void {
  if (typeof window === 'undefined') return;

  if ('BroadcastChannel' in window) {
    try {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      ch.postMessage(message);
      ch.close();
    } catch {
      // Ignore BroadcastChannel errors
    }
  }

  if (message.type === 'STATE_UPDATE') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(message.payload));
    } catch {
      // Ignore storage quota errors
    }
  }
}

export function loadLastTvFeedState(): TvFeedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TvFeedState;
  } catch {
    return null;
  }
}

export function subscribeTvMessages(
  onMessage: (message: TvSyncMessage) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  let channel: BroadcastChannel | null = null;
  if ('BroadcastChannel' in window) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<TvSyncMessage>) => {
        if (event.data && typeof event.data.type === 'string') {
          onMessage(event.data);
        }
      };
    } catch {
      channel = null;
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as TvFeedState;
      onMessage({ type: 'STATE_UPDATE', payload: parsed });
    } catch {
      // Ignore parse errors
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (channel) {
      channel.close();
    }
  };
}
