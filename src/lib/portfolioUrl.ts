const DANGEROUS_PROTOCOL_RE = /^\s*(javascript|data|vbscript|file):/i;
const HAS_PROTOCOL_RE = /^https?:\/\//i;

/**
 * Normalizes and validates a portfolio website URL so bare domains get `https://`,
 * local static paths (`/student-portfolios/...`) stay intact, and dangerous or
 * self-referencing SPA review routes are rejected before embedding in an iframe.
 */
export function sanitizePortfolioUrl(raw?: string | null): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || DANGEROUS_PROTOCOL_RE.test(trimmed)) {
    return '';
  }

  // Root-relative local path (e.g. /student-portfolios/Bond%20Portfolio/index.html)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    const cleanPath = trimmed.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    if (cleanPath === '/review' || cleanPath === '/tv') {
      return '';
    }
    return trimmed;
  }

  let candidate = trimmed;
  if (candidate.startsWith('//')) {
    candidate = `https:${candidate}`;
  } else if (!HAS_PROTOCOL_RE.test(candidate)) {
    const isLocalHost =
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(candidate);
    candidate = `${isLocalHost ? 'http' : 'https'}://${candidate}`;
  }

  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
    const parsed = new URL(candidate, base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    // Prevent recursive self-embedding of the Review or TV pages
    if (
      typeof window !== 'undefined' &&
      parsed.origin === window.location.origin
    ) {
      const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
      if (
        normalizedPath === '/review' ||
        normalizedPath === '/tv' ||
        normalizedPath === '/'
      ) {
        return '';
      }
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function isSameOriginPortfolioUrl(url: string): boolean {
  if (!url) return true;
  if (typeof window === 'undefined') {
    return url.startsWith('/') && !url.startsWith('//');
  }
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function isBlockedMixedContentUrl(url: string): boolean {
  if (!url || typeof window === 'undefined') return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return (
      window.location.protocol === 'https:' && parsed.protocol === 'http:'
    );
  } catch {
    return false;
  }
}
