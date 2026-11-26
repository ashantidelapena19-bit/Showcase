import JSZip from 'jszip';
import { supabase } from './supabase';

export interface UploadedPortfolioFile {
  path: string;
  type: string;
  size: number;
  storageUrl?: string;
}

export interface StagedUploadFile {
  path: string;
  name: string;
  mimeType: string;
  size: number;
  isText: boolean;
  textContent?: string;
  blob?: Blob;
}

export const MAX_FILE_COUNT = 200;
export const MAX_TOTAL_BYTES = 150 * 1024 * 1024; // 150 MB raw staging cap
const MAX_COMPILED_HTML_BYTES = 8 * 1024 * 1024; // 8 MB DB payload cap

export const IGNORED_PATH_PATTERNS = [
  /^__MACOSX\//i,
  /(^|\/)\.DS_Store$/i,
  /(^|\/)Thumbs\.db$/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)(\.venv|venv|__pycache__)(\/|$)/i,
  /(^|\/)(\.next|\.nuxt|\.svelte-kit|\.astro|\.cache|\.parcel-cache|\.turbo)(\/|$)/i,
  /(^|\/)(\.vscode|\.idea|coverage)(\/|$)/i,
];

function createAbortError(): Error {
  const err = new Error('Upload cancelled.');
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

export const TEXT_EXTENSIONS = new Set([
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'json',
  'svg',
  'txt',
  'md',
]);

export const ALLOWED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'ico',
  'avif',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'mp4',
  'webm',
  'ogg',
  'mp3',
  'wav',
  'wasm',
  'glb',
  'gltf',
  'pdf',
]);

export function getExtension(path: string): string {
  const clean = path.split('?')[0].split('#')[0];
  const idx = clean.lastIndexOf('.');
  return idx >= 0 ? clean.slice(idx + 1).toLowerCase() : '';
}

export function guessMimeType(path: string, fallback = 'application/octet-stream'): string {
  const ext = getExtension(path);
  switch (ext) {
    case 'html':
    case 'htm':
      return 'text/html';
    case 'css':
      return 'text/css';
    case 'js':
    case 'mjs':
      return 'application/javascript';
    case 'json':
      return 'application/json';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'ico':
      return 'image/x-icon';
    case 'avif':
      return 'image/avif';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    case 'ttf':
      return 'font/ttf';
    case 'otf':
      return 'font/otf';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'ogg':
      return 'audio/ogg';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'wasm':
      return 'application/wasm';
    case 'glb':
      return 'model/gltf-binary';
    case 'gltf':
      return 'model/gltf+json';
    case 'pdf':
      return 'application/pdf';
    default:
      return fallback;
  }
}

export function normalizeSlashPath(raw: string): string {
  return raw
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function stripSingleRootDirectory(paths: string[]): string[] {
  if (paths.length === 0) return paths;
  const split = paths.map((p) => p.split('/'));
  if (split.some((parts) => parts.length < 2)) return paths;
  const firstRoot = split[0][0];
  if (!firstRoot) return paths;
  const allShareRoot = split.every((parts) => parts[0] === firstRoot);
  if (!allShareRoot) return paths;
  return split.map((parts) => parts.slice(1).join('/'));
}

function resolveRelativePath(baseFilePath: string, targetRef: string): string {
  const cleaned = targetRef.split('?')[0].split('#')[0].trim();
  if (!cleaned) return '';
  const baseParts = normalizeSlashPath(baseFilePath).split('/');
  baseParts.pop(); // remove filename
  const targetParts = cleaned.replace(/\\/g, '/').split('/');
  const resolved: string[] = [...baseParts];
  for (const part of targetParts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

function isExternalOrSpecialUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return (
    !trimmed ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('javascript:')
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to encode asset.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export interface BundleProgressInfo {
  phase: 'extracting' | 'uploading' | 'compiling';
  completed: number;
  total: number;
  currentFile?: string;
}

/**
 * Recursively extracts files from a dropped DataTransfer, supporting both
 * individual files/.zip archives and dropped folders (via webkitGetAsEntry).
 */
export async function readDroppedDataTransferFiles(
  dataTransfer: DataTransfer
): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) =>
      typeof (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null })
        .webkitGetAsEntry === 'function'
        ? (
            item as DataTransferItem & {
              webkitGetAsEntry: () => FileSystemEntry | null;
            }
          ).webkitGetAsEntry()
        : null
    )
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  const hasDirectoryEntry = entries.some((entry) => entry.isDirectory);
  if (!hasDirectoryEntry) {
    return Array.from(dataTransfer.files ?? []);
  }

  const collected: File[] = [];
  const MAX_SCANNED_FILES = 600;

  const readFileEntry = (entry: FileSystemFileEntry, relativePath: string): Promise<void> =>
    new Promise((resolve) => {
      entry.file(
        (file) => {
          const normalized = normalizeSlashPath(relativePath);
          if (normalized && !IGNORED_PATH_PATTERNS.some((re) => re.test(normalized))) {
            try {
              Object.defineProperty(file, 'webkitRelativePath', {
                value: normalized,
                configurable: true,
              });
            } catch {
              // Ignore readonly property on certain browsers
            }
            collected.push(file);
          }
          resolve();
        },
        () => resolve()
      );
    });

  const walkEntry = async (entry: FileSystemEntry, parentPath: string): Promise<void> => {
    if (collected.length >= MAX_SCANNED_FILES) return;
    const nextPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    const normalized = normalizeSlashPath(nextPath);
    if (IGNORED_PATH_PATTERNS.some((re) => re.test(normalized))) {
      return;
    }

    if (entry.isFile) {
      await readFileEntry(entry as FileSystemFileEntry, nextPath);
      return;
    }

    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const readBatch = (): Promise<FileSystemEntry[]> =>
        new Promise((resolve) => {
          reader.readEntries(
            (batch) => resolve(batch),
            () => resolve([])
          );
        });

      let batch = await readBatch();
      while (batch.length > 0 && collected.length < MAX_SCANNED_FILES) {
        for (const child of batch) {
          if (collected.length >= MAX_SCANNED_FILES) break;
          await walkEntry(child, nextPath);
        }
        batch = await readBatch();
      }
    }
  };

  for (const entry of entries) {
    if (collected.length >= MAX_SCANNED_FILES) break;
    await walkEntry(entry, '');
  }

  return collected;
}

export async function extractPortfolioFiles(
  fileList: FileList | File[],
  options?: {
    signal?: AbortSignal;
    onProgress?: (info: BundleProgressInfo) => void;
  }
): Promise<{
  files: StagedUploadFile[];
  entryCandidates: string[];
  recommendedEntry: string;
  warnings: string[];
}> {
  throwIfAborted(options?.signal);
  const inputFiles = Array.from(fileList);
  const warnings: string[] = [];
  const rawEntries: {
    path: string;
    mimeType: string;
    size: number;
    readText: () => Promise<string>;
    readBlob: () => Promise<Blob>;
  }[] = [];

  for (const file of inputFiles) {
    throwIfAborted(options?.signal);
    const ext = getExtension(file.name);
    if (ext === 'zip') {
      const zip = await JSZip.loadAsync(file);
      throwIfAborted(options?.signal);
      const zipEntries = Object.values(zip.files).filter((entry) => !entry.dir);
      for (const entry of zipEntries) {
        const normalized = normalizeSlashPath(entry.name);
        if (!normalized || IGNORED_PATH_PATTERNS.some((re) => re.test(normalized))) {
          continue;
        }
        const entryExt = getExtension(normalized);
        if (!ALLOWED_EXTENSIONS.has(entryExt)) {
          continue;
        }
        rawEntries.push({
          path: normalized,
          mimeType: guessMimeType(normalized),
          size: 0,
          readText: () => entry.async('string'),
          readBlob: async () => {
            const uint8 = await entry.async('uint8array');
            return new Blob([uint8.buffer as ArrayBuffer], {
              type: guessMimeType(normalized),
            });
          },
        });
        if (rawEntries.length >= MAX_FILE_COUNT) {
          warnings.push(`File limit reached (${MAX_FILE_COUNT} files). Extra files were skipped.`);
          break;
        }
      }
      if (rawEntries.length >= MAX_FILE_COUNT) break;
      continue;
    }

    const rawPath =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;
    const normalized = normalizeSlashPath(rawPath);
    if (!normalized || IGNORED_PATH_PATTERNS.some((re) => re.test(normalized))) {
      continue;
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      if (warnings.length < 8) {
        warnings.push(`Skipped unsupported file type: ${file.name}`);
      }
      continue;
    }

    rawEntries.push({
      path: normalized,
      mimeType: file.type || guessMimeType(normalized),
      size: file.size,
      readText: () => file.text(),
      readBlob: async () => file,
    });
    if (rawEntries.length >= MAX_FILE_COUNT) {
      warnings.push(`File limit reached (${MAX_FILE_COUNT} files). Extra files were skipped.`);
      break;
    }
  }

  if (rawEntries.length === 0) {
    throw new Error(
      'No supported web portfolio files found. Upload a .zip, folder, or .html/.css/.js/image files.'
    );
  }

  const strippedPaths = stripSingleRootDirectory(rawEntries.map((r) => r.path));
  const stagedResults: (StagedUploadFile | null)[] = new Array(rawEntries.length).fill(null);
  let totalBytes = 0;
  let completed = 0;
  let cursor = 0;
  const EXTRACT_CONCURRENCY = 8;

  const extractWorker = async () => {
    while (cursor < rawEntries.length) {
      throwIfAborted(options?.signal);
      const idx = cursor;
      cursor += 1;
      const entry = rawEntries[idx];
      const cleanPath = strippedPaths[idx];
      const ext = getExtension(cleanPath);
      const isText = TEXT_EXTENSIONS.has(ext);

      let textContent: string | undefined;
      let blob: Blob | undefined;
      let size = entry.size;

      if (isText) {
        textContent = await entry.readText();
        size = new TextEncoder().encode(textContent).length;
      } else {
        blob = await entry.readBlob();
        size = blob.size;
      }

      totalBytes += size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error(
          'Uploaded portfolio bundle exceeds the 150 MB limit. Remove oversized media/build artifacts and try again.'
        );
      }

      const parts = cleanPath.split('/');
      stagedResults[idx] = {
        path: cleanPath,
        name: parts[parts.length - 1] || cleanPath,
        mimeType: entry.mimeType,
        size,
        isText,
        textContent,
        blob,
      };
      completed += 1;
      options?.onProgress?.({
        phase: 'extracting',
        completed,
        total: rawEntries.length,
        currentFile: cleanPath,
      });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(EXTRACT_CONCURRENCY, rawEntries.length) }, () =>
      extractWorker()
    )
  );
  throwIfAborted(options?.signal);

  const staged = stagedResults.filter((item): item is StagedUploadFile => item !== null);

  const entryCandidates = staged
    .filter((f) => {
      const ext = getExtension(f.path);
      return ext === 'html' || ext === 'htm';
    })
    .map((f) => f.path)
    .sort((a, b) => {
      const aIndex = a.toLowerCase() === 'index.html' ? -2 : a.toLowerCase().endsWith('/index.html') ? -1 : 0;
      const bIndex = b.toLowerCase() === 'index.html' ? -2 : b.toLowerCase().endsWith('/index.html') ? -1 : 0;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.split('/').length - b.split('/').length || a.localeCompare(b);
    });

  if (entryCandidates.length === 0) {
    throw new Error(
      'Your upload needs at least one .html entry file (such as index.html).'
    );
  }

  return {
    files: staged,
    entryCandidates,
    recommendedEntry: entryCandidates[0],
    warnings,
  };
}

function rewriteCssAssetUrls(
  cssText: string,
  cssFilePath: string,
  assetUrlMap: Map<string, string>
): string {
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, rawUrl) => {
    if (isExternalOrSpecialUrl(rawUrl)) return match;
    const resolved = resolveRelativePath(cssFilePath, rawUrl);
    const direct = assetUrlMap.get(resolved) ?? assetUrlMap.get(normalizeSlashPath(rawUrl));
    if (!direct) return match;
    return `url(${quote || '"'}${direct}${quote || '"'})`;
  });
}

function assembleCompiledHtml(
  files: StagedUploadFile[],
  entryPath: string,
  assetUrlMap: Map<string, string>,
  options?: { enforceByteLimit?: boolean }
): string {
  const fileMap = new Map<string, StagedUploadFile>();
  for (const f of files) {
    fileMap.set(f.path, f);
    fileMap.set(f.path.toLowerCase(), f);
  }

  const entryFile =
    fileMap.get(entryPath) ?? fileMap.get(entryPath.toLowerCase());
  if (!entryFile || typeof entryFile.textContent !== 'string') {
    throw new Error(`Entry HTML file "${entryPath}" could not be read.`);
  }

  let html = entryFile.textContent;

  // Inline local <link rel="stylesheet" href="..."> tags
  html = html.replace(
    /<link\b([^>]*?)\bhref=(["'])([^"']+)\2([^>]*)>/gi,
    (fullTag, before, _quote, rawHref, after) => {
      const combinedAttrs = `${before} ${after}`;
      if (!/rel\s*=\s*["']?stylesheet["']?/i.test(combinedAttrs)) {
        if (!isExternalOrSpecialUrl(rawHref)) {
          const resolved = resolveRelativePath(entryPath, rawHref);
          const mapped = assetUrlMap.get(resolved) ?? assetUrlMap.get(resolved.toLowerCase());
          if (mapped) {
            return `<link${before}href="${mapped}"${after}>`;
          }
        }
        return fullTag;
      }

      if (isExternalOrSpecialUrl(rawHref)) return fullTag;
      const resolved = resolveRelativePath(entryPath, rawHref);
      const cssFile =
        fileMap.get(resolved) ?? fileMap.get(resolved.toLowerCase());
      if (!cssFile || typeof cssFile.textContent !== 'string') {
        return fullTag;
      }
      const rewrittenCss = rewriteCssAssetUrls(
        cssFile.textContent,
        cssFile.path,
        assetUrlMap
      );
      return `<style data-bundled-file="${cssFile.path}">\n${rewrittenCss}\n</style>`;
    }
  );

  // Inline local <script src="..."></script> tags
  html = html.replace(
    /<script\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi,
    (fullTag, before, _quote, rawSrc, after) => {
      if (isExternalOrSpecialUrl(rawSrc)) return fullTag;
      const resolved = resolveRelativePath(entryPath, rawSrc);
      const jsFile =
        fileMap.get(resolved) ?? fileMap.get(resolved.toLowerCase());
      if (!jsFile || typeof jsFile.textContent !== 'string') {
        return fullTag;
      }
      const safeJs = jsFile.textContent.replace(/<\/script/gi, '<\\/script');
      const preservedTypeMatch = `${before} ${after}`.match(
        /\btype\s*=\s*(['"][^'"]+['"])/i
      );
      const typeAttr = preservedTypeMatch ? ` type=${preservedTypeMatch[1]}` : '';
      return `<script${typeAttr} data-bundled-file="${jsFile.path}">\n${safeJs}\n</script>`;
    }
  );

  // Rewrite inline <style> url(...) references
  html = html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, openTag, cssBody, closeTag) =>
      `${openTag}${rewriteCssAssetUrls(cssBody, entryPath, assetUrlMap)}${closeTag}`
  );

  // Rewrite local asset attributes (src, poster, data-src) in HTML
  html = html.replace(
    /\b(src|poster|data-src)=(["'])([^"']+)\2/gi,
    (fullAttr, attrName, quote, rawRef) => {
      if (isExternalOrSpecialUrl(rawRef)) return fullAttr;
      const resolved = resolveRelativePath(entryPath, rawRef);
      const mapped =
        assetUrlMap.get(resolved) ??
        assetUrlMap.get(resolved.toLowerCase()) ??
        assetUrlMap.get(normalizeSlashPath(rawRef));
      if (!mapped) return fullAttr;
      return `${attrName}=${quote}${mapped}${quote}`;
    }
  );

  // Wrap partial HTML fragment cleanly if no <html> tag exists
  if (!/<html[\s>]/i.test(html)) {
    html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Uploaded Portfolio</title>
</head>
<body>
${html}
</body>
</html>`;
  }

  if (options?.enforceByteLimit) {
    const byteSize = new TextEncoder().encode(html).length;
    if (byteSize > MAX_COMPILED_HTML_BYTES) {
      throw new Error(
        'Compiled portfolio HTML exceeds 8 MB. Keep large images and media as separate files rather than inline base64 inside HTML.'
      );
    }
  }

  return html;
}

/**
 * Builds an instant local preview using ephemeral blob: URLs so the user sees
 * their uploaded folder or .zip immediately without waiting on remote uploads.
 * Never persist this preview HTML to the database.
 */
export function compileLocalPreviewHtml(
  files: StagedUploadFile[],
  entryPath: string
): {
  previewHtml: string;
  manifest: UploadedPortfolioFile[];
  revokeUrls: () => void;
} {
  const assetUrlMap = new Map<string, string>();
  const createdUrls: string[] = [];

  for (const file of files) {
    const ext = getExtension(file.path);
    if (['html', 'htm', 'css', 'js', 'mjs', 'md', 'txt'].includes(ext)) {
      continue;
    }
    const blob =
      file.blob ??
      new Blob([file.textContent ?? ''], {
        type: file.mimeType || guessMimeType(file.path),
      });
    const objectUrl = URL.createObjectURL(blob);
    createdUrls.push(objectUrl);
    assetUrlMap.set(file.path, objectUrl);
    assetUrlMap.set(file.path.toLowerCase(), objectUrl);
  }

  const previewHtml = assembleCompiledHtml(files, entryPath, assetUrlMap, {
    enforceByteLimit: false,
  });

  const manifest: UploadedPortfolioFile[] = files.map((file) => ({
    path: file.path,
    type: file.mimeType,
    size: file.size,
  }));

  return {
    previewHtml,
    manifest,
    revokeUrls: () => {
      for (const url of createdUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revoke errors
        }
      }
    },
  };
}

function uploadWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Storage upload timed out.'));
    }, timeoutMs);

    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener('abort', handleAbort, { once: true });

    promise.then(
      (val) => {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', handleAbort);
        resolve(val);
      },
      (err) => {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', handleAbort);
        reject(err);
      }
    );
  });
}

function isFatalStorageBucketError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('bucket not found') ||
    lower.includes('row-level security') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('jwt') ||
    lower.includes('invalid token')
  );
}

export async function compileAndUploadPortfolioBundle(
  files: StagedUploadFile[],
  entryPath: string,
  authUserId: string,
  options?: {
    signal?: AbortSignal;
    cachedMediaUrls?: Map<string, string>;
    onProgress?: (info: BundleProgressInfo) => void;
  }
): Promise<{
  compiledHtml: string;
  manifest: UploadedPortfolioFile[];
  mediaUrlByPath: Map<string, string>;
  warnings: string[];
}> {
  throwIfAborted(options?.signal);
  const warnings: string[] = [];
  const bundleId = `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const assetUrlMap = new Map<string, string>();
  const mediaUrlByPath = new Map<string, string>();
  const manifest: UploadedPortfolioFile[] = [];

  if (options?.cachedMediaUrls) {
    options.cachedMediaUrls.forEach((url, path) => {
      mediaUrlByPath.set(path, url);
      assetUrlMap.set(path, url);
      assetUrlMap.set(path.toLowerCase(), url);
    });
  }

  // Upload non-HTML/CSS/JS media & font assets concurrently in bounded batches
  // (Skip documentation files like .md/.txt and assets already cached from this upload)
  const UPLOAD_CONCURRENCY = 8;
  const mediaFiles = files.filter((file) => {
    const ext = getExtension(file.path);
    if (['html', 'htm', 'css', 'js', 'mjs', 'md', 'txt'].includes(ext)) {
      return false;
    }
    return !mediaUrlByPath.has(file.path);
  });

  let mediaCursor = 0;
  let completedUploads = 0;
  let consecutiveFailures = 0;
  let storageCircuitOpen = false;
  let storageCircuitReason = '';
  let inlineFallbackBytes = 0;
  const MAX_TOTAL_INLINE_FALLBACK_BYTES = 3 * 1024 * 1024;

  const uploadWorker = async () => {
    while (mediaCursor < mediaFiles.length) {
      throwIfAborted(options?.signal);
      const idx = mediaCursor;
      mediaCursor += 1;
      const file = mediaFiles[idx];
      const uploadBlob =
        file.blob ??
        new Blob([file.textContent ?? ''], {
          type: file.mimeType || guessMimeType(file.path),
        });

      let storageUrl: string | undefined;
      if (supabase && authUserId && !storageCircuitOpen) {
        const safePath = file.path.replace(/[^a-zA-Z0-9._/-]/g, '_');
        const storagePath = `${authUserId}/sites/${bundleId}/${safePath}`;
        const timeoutMs =
          15_000 + Math.min(30_000, Math.round(uploadBlob.size / 150));

        try {
          const { error } = await uploadWithTimeout(
            supabase.storage
              .from('portfolio-media')
              .upload(storagePath, uploadBlob, {
                upsert: true,
                cacheControl: '31536000',
                contentType: file.mimeType || guessMimeType(file.path),
              }),
            timeoutMs,
            options?.signal
          );

          if (!error) {
            consecutiveFailures = 0;
            const { data } = supabase.storage
              .from('portfolio-media')
              .getPublicUrl(storagePath);
            if (data?.publicUrl) {
              storageUrl = data.publicUrl;
            }
          } else {
            consecutiveFailures += 1;
            if (isFatalStorageBucketError(error.message) || consecutiveFailures >= 4) {
              storageCircuitOpen = true;
              storageCircuitReason = error.message;
            }
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw err;
          }
          consecutiveFailures += 1;
          const msg = err instanceof Error ? err.message : 'Upload timed out.';
          if (consecutiveFailures >= 3) {
            storageCircuitOpen = true;
            storageCircuitReason = msg;
          }
        }
      }

      if (
        !storageUrl &&
        uploadBlob.size <= 250 * 1024 &&
        inlineFallbackBytes + uploadBlob.size <= MAX_TOTAL_INLINE_FALLBACK_BYTES
      ) {
        try {
          storageUrl = await blobToDataUrl(uploadBlob);
          inlineFallbackBytes += uploadBlob.size;
        } catch {
          // Ignore fallback errors
        }
      }

      if (storageUrl) {
        mediaUrlByPath.set(file.path, storageUrl);
        assetUrlMap.set(file.path, storageUrl);
        assetUrlMap.set(file.path.toLowerCase(), storageUrl);
      } else if (!storageCircuitOpen && warnings.length < 5) {
        warnings.push(`Asset "${file.path}" could not be uploaded to Storage.`);
      }

      completedUploads += 1;
      options?.onProgress?.({
        phase: 'uploading',
        completed: completedUploads,
        total: mediaFiles.length,
        currentFile: file.path,
      });
    }
  };

  if (mediaFiles.length > 0) {
    options?.onProgress?.({
      phase: 'uploading',
      completed: 0,
      total: mediaFiles.length,
      currentFile: mediaFiles[0]?.path,
    });
    const workerCount = Math.min(UPLOAD_CONCURRENCY, mediaFiles.length);
    await Promise.all(Array.from({ length: workerCount }, () => uploadWorker()));
  }

  throwIfAborted(options?.signal);

  if (storageCircuitOpen) {
    warnings.unshift(
      `Storage upload interrupted (${storageCircuitReason || 'connection/bucket issue'}). Large media files were skipped; check your Supabase "portfolio-media" bucket or retry.`
    );
  }

  for (const file of files) {
    manifest.push({
      path: file.path,
      type: file.mimeType,
      size: file.size,
      storageUrl: mediaUrlByPath.get(file.path),
    });
  }

  options?.onProgress?.({
    phase: 'compiling',
    completed: 1,
    total: 1,
    currentFile: entryPath,
  });

  const html = assembleCompiledHtml(files, entryPath, assetUrlMap, {
    enforceByteLimit: true,
  });

  return { compiledHtml: html, manifest, mediaUrlByPath, warnings };
}

/**
 * Injects an isolated postMessage review bridge into sandbox="allow-scripts" srcDoc portfolios
 * so Section Map, Inspect Element, DOM Tree, X-Ray, and TV Scroll Sync work without exposing
 * parent origin storage/cookies/auth tokens to user-uploaded scripts.
 */
export function injectReviewBridgeScript(html: string, channelId: string): string {
  const safeChannel = JSON.stringify(channelId);
  const bridgeScript = `
<script data-se-review-bridge="true">
(function () {
  var CHANNEL = ${safeChannel};
  var inspectEnabled = false;
  var xrayEnabled = false;
  var nodeIndex = new Map();
  var XRAY_ID = 'se-sandbox-xray-style';

  function buildLabel(el) {
    if (!el || !el.tagName) return 'el';
    var tag = el.tagName.toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var cls = Array.from(el.classList || []).slice(0, 2).map(function (c) { return '.' + c; }).join('');
    return tag + id + cls;
  }

  function resolveHtml(target) {
    var cursor = target;
    while (cursor && cursor.nodeType === 1) {
      if (cursor.tagName) return cursor;
      cursor = cursor.parentElement;
    }
    return null;
  }

  function snapshotElement(el) {
    var rect = el.getBoundingClientRect();
    var computed = window.getComputedStyle(el);
    var breadcrumb = [];
    var cursor = el;
    while (cursor && cursor.tagName && cursor.tagName.toLowerCase() !== 'html' && breadcrumb.length < 6) {
      breadcrumb.unshift(buildLabel(cursor));
      cursor = cursor.parentElement;
    }
    var rawHtml = (el.outerHTML || '').replace(/\\sdata-se-node="[^"]*"/g, '');
    if (rawHtml.length > 1400) {
      rawHtml = rawHtml.slice(0, 1400) + '\\n<!-- ...truncated -->';
    }
    var text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    return {
      key: buildLabel(el) + '-' + Math.round(rect.top) + '-' + Math.round(rect.left),
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      classes: Array.from(el.classList || []),
      selector: buildLabel(el),
      breadcrumb: breadcrumb,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      styles: {
        display: computed.display,
        position: computed.position,
        fontFamily: (computed.fontFamily.split(',')[0] || computed.fontFamily).replace(/['"]/g, ''),
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight,
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        padding: computed.paddingTop + ' ' + computed.paddingRight + ' ' + computed.paddingBottom + ' ' + computed.paddingLeft,
        margin: computed.marginTop + ' ' + computed.marginRight + ' ' + computed.marginBottom + ' ' + computed.marginLeft,
        borderRadius: computed.borderRadius,
        gridTemplateColumns: computed.gridTemplateColumns,
        flexDirection: computed.flexDirection
      },
      outerHtml: rawHtml,
      textPreview: text.slice(0, 90)
    };
  }

  function scanDocument() {
    var body = document.body;
    if (!body) return;

    var rawCandidates = Array.from(body.querySelectorAll('[data-review-section], header, .hero, main > div.hero, section, footer'));
    var uniqueEls = [];
    for (var i = 0; i < rawCandidates.length; i++) {
      var el = rawCandidates[i];
      if (el.offsetHeight < 24) continue;
      var nested = uniqueEls.some(function (existing) { return existing !== el && existing.contains(el); });
      if (!nested) uniqueEls.push(el);
    }

    var sections = uniqueEls.map(function (el, idx) {
      var heading = el.querySelector('h1, h2, h3');
      var dataLabel = el.getAttribute('data-review-label');
      var fallbackTag = el.tagName.toLowerCase();
      var label = (dataLabel && dataLabel.trim()) ||
        (heading && heading.textContent && heading.textContent.replace(/\\s+/g, ' ').trim().slice(0, 44)) ||
        (fallbackTag === 'header' ? 'Navigation Header' : fallbackTag === 'footer' ? 'Footer' : el.id ? '#' + el.id : 'Section ' + (idx + 1));
      var rect = el.getBoundingClientRect();
      return {
        id: el.id || 'sec-' + idx,
        label: label,
        tag: fallbackTag,
        top: Math.max(0, Math.round(rect.top + window.scrollY - (idx === 0 ? 0 : 72))),
        height: Math.round(rect.height),
        selector: buildLabel(el)
      };
    });

    nodeIndex.clear();
    var nodes = [];
    function walk(node, depth) {
      if (nodes.length >= 75 || depth > 4) return;
      var tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'svg' || tag === 'path') return;
      var nodeId = 'n-' + nodes.length;
      node.setAttribute('data-se-node', nodeId);
      nodeIndex.set(nodeId, node);
      var text = (tag[0] === 'h' || tag === 'button' || tag === 'a') && node.textContent
        ? node.textContent.replace(/\\s+/g, ' ').trim().slice(0, 28)
        : '';
      nodes.push({
        key: buildLabel(node) + '-' + nodes.length,
        nodeId: nodeId,
        tag: tag,
        id: node.id || '',
        classes: Array.from(node.classList || []).slice(0, 2),
        label: text || '',
        depth: depth
      });
      var children = Array.from(node.children || []);
      for (var j = 0; j < children.length; j++) {
        walk(children[j], depth + 1);
      }
    }
    walk(body, 0);

    var maxScrollTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var maxScrollLeft = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    window.parent.postMessage({
      source: 'se-review-bridge',
      channelId: CHANNEL,
      type: 'READY',
      sections: sections,
      domTree: nodes,
      scrollTop: window.scrollY || document.documentElement.scrollTop || 0,
      scrollLeft: window.scrollX || document.documentElement.scrollLeft || 0,
      maxScrollTop: maxScrollTop,
      maxScrollLeft: maxScrollLeft
    }, '*');
  }

  function applyXray(enabled) {
    xrayEnabled = Boolean(enabled);
    var existing = document.getElementById(XRAY_ID);
    if (xrayEnabled && !existing && document.head) {
      var styleEl = document.createElement('style');
      styleEl.id = XRAY_ID;
      styleEl.textContent = 'body header, body nav, body main, body section, body article, body footer, body div { outline: 1px dashed rgba(234, 76, 137, 0.45) !important; outline-offset: -1px !important; } body h1, body h2, body h3, body p, body button, body a { outline: 1px dotted rgba(56, 189, 248, 0.5) !important; }';
      document.head.appendChild(styleEl);
    } else if (!xrayEnabled && existing) {
      existing.remove();
    }
  }

  function emitScrollMetrics(overrideTop, overrideLeft) {
    var top = typeof overrideTop === 'number'
      ? overrideTop
      : (window.scrollY || document.documentElement.scrollTop || 0);
    var left = typeof overrideLeft === 'number'
      ? overrideLeft
      : (window.scrollX || document.documentElement.scrollLeft || 0);
    var maxScrollTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var maxScrollLeft = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    var ratio = maxScrollTop > 0 ? Math.min(1, Math.max(0, top / maxScrollTop)) : 0;
    window.parent.postMessage({
      source: 'se-review-bridge',
      channelId: CHANNEL,
      type: 'SCROLL',
      scrollTop: top,
      scrollLeft: left,
      maxScrollTop: maxScrollTop,
      maxScrollLeft: maxScrollLeft,
      scrollRatio: ratio
    }, '*');
  }

  window.addEventListener('scroll', function () {
    emitScrollMetrics();
  }, { passive: true });

  document.addEventListener('mousemove', function (e) {
    if (!inspectEnabled) return;
    var el = resolveHtml(e.target);
    if (!el) return;
    window.parent.postMessage({
      source: 'se-review-bridge',
      channelId: CHANNEL,
      type: 'INSPECT_HOVER',
      snapshot: snapshotElement(el)
    }, '*');
  }, true);

  document.addEventListener('click', function (e) {
    if (!inspectEnabled) return;
    var el = resolveHtml(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({
      source: 'se-review-bridge',
      channelId: CHANNEL,
      type: 'INSPECT_LOCK',
      snapshot: snapshotElement(el)
    }, '*');
  }, true);

  var smoothRafId = 0;
  var smoothTargetY = window.scrollY;
  var dampCurrentY = window.scrollY;
  var dampLastTime = 0;
  var dampRafId = 0;
  var dampSamples = [];
  var dampLambda = 7.4;

  function stopAllSmoothScroll() {
    if (smoothRafId) {
      cancelAnimationFrame(smoothRafId);
      smoothRafId = 0;
    }
    if (dampRafId) {
      cancelAnimationFrame(dampRafId);
      dampRafId = 0;
    }
    dampLastTime = 0;
  }

  function dampScrollBy(deltaY, immediate) {
    var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var base = dampRafId ? smoothTargetY : window.scrollY;
    smoothTargetY = Math.max(0, Math.min(maxScroll, base + deltaY));
    if (immediate) {
      stopAllSmoothScroll();
      dampCurrentY = smoothTargetY;
      window.scrollTo({ top: smoothTargetY, behavior: 'auto' });
      emitScrollMetrics(smoothTargetY);
      return;
    }
    if (!dampRafId) {
      dampCurrentY = window.scrollY;
      dampLastTime = 0;
    }
    if (smoothRafId) {
      cancelAnimationFrame(smoothRafId);
      smoothRafId = 0;
    }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo({ top: smoothTargetY, behavior: 'auto' });
      emitScrollMetrics(smoothTargetY);
      return;
    }
    if (!dampRafId) {
      var step = function (now) {
        if (!dampLastTime) {
          dampLastTime = now;
          dampRafId = requestAnimationFrame(step);
          return;
        }
        var rawDtMs = now - dampLastTime;
        dampLastTime = now;
        if (rawDtMs >= 3.5 && rawDtMs <= 25) {
          dampSamples.push(rawDtMs);
          if (dampSamples.length > 14) dampSamples.shift();
          if (dampSamples.length >= 6) {
            var sorted = dampSamples.slice().sort(function (a, b) { return a - b; });
            var fps = 1000 / sorted[Math.floor(sorted.length / 2)];
            var t = Math.max(0, Math.min(1, (fps - 75) / 30));
            dampLambda = 7.4 + (4.9 - 7.4) * t;
          }
        }
        var dt = Math.min(Math.max(rawDtMs, 1), 33.34) * 0.001;
        var factor = 1 - Math.exp(-dampLambda * dt);
        dampCurrentY = dampCurrentY + (smoothTargetY - dampCurrentY) * factor;
        if (Math.abs(smoothTargetY - dampCurrentY) < 0.6) {
          window.scrollTo({ top: smoothTargetY, behavior: 'auto' });
          emitScrollMetrics(smoothTargetY);
          dampRafId = 0;
          dampLastTime = 0;
          return;
        }
        window.scrollTo({ top: dampCurrentY, behavior: 'auto' });
        emitScrollMetrics(dampCurrentY);
        dampRafId = requestAnimationFrame(step);
      };
      dampRafId = requestAnimationFrame(step);
    }
  }

  function smoothScrollToY(targetY, durationMs) {
    var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var clamped = Math.max(0, Math.min(maxScroll, targetY));
    smoothTargetY = clamped;
    stopAllSmoothScroll();
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo({ top: clamped, behavior: 'auto' });
      emitScrollMetrics(clamped);
      return;
    }
    var startY = window.scrollY;
    var diff = clamped - startY;
    if (Math.abs(diff) < 1) {
      window.scrollTo({ top: clamped, behavior: 'auto' });
      emitScrollMetrics(clamped);
      return;
    }
    var elapsed = 0;
    var lastTime = 0;
    var duration = durationMs || 680;
    function tick(now) {
      if (lastTime) {
        elapsed += Math.min(Math.max(now - lastTime, 1), 33.34);
      }
      lastTime = now;
      var t = Math.min(1, elapsed / duration);
      var eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      var nextY = startY + diff * eased;
      window.scrollTo({ top: nextY, behavior: 'auto' });
      emitScrollMetrics(nextY);
      if (t < 1) {
        smoothRafId = requestAnimationFrame(tick);
      } else {
        smoothRafId = 0;
      }
    }
    smoothRafId = requestAnimationFrame(tick);
  }

  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || data.target !== 'se-review-bridge' || data.channelId !== CHANNEL) return;
    if (data.type === 'SCROLL_TO') {
      smoothScrollToY(Number(data.top || 0), 760);
    } else if (data.type === 'SCROLL_BY') {
      if (data.left) {
        window.scrollBy({ left: Number(data.left || 0), behavior: 'auto' });
      }
      if (data.top) {
        dampScrollBy(Number(data.top || 0), Boolean(data.immediate));
      } else if (data.left) {
        emitScrollMetrics();
      }
    } else if (data.type === 'SCROLL_RATIO') {
      var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll > 0) {
        smoothScrollToY(Math.round(Number(data.ratio || 0) * maxScroll), 240);
      }
    } else if (data.type === 'SET_INSPECT_MODE') {
      inspectEnabled = Boolean(data.enabled);
    } else if (data.type === 'SET_XRAY') {
      applyXray(data.enabled);
    } else if (data.type === 'HIGHLIGHT_NODE') {
      var node = nodeIndex.get(data.nodeId);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(function () {
          window.parent.postMessage({
            source: 'se-review-bridge',
            channelId: CHANNEL,
            type: 'INSPECT_LOCK',
            snapshot: snapshotElement(node)
          }, '*');
        }, 280);
      }
    } else if (data.type === 'PING_SCAN') {
      scanDocument();
    }
  });

  if (document.readyState === 'complete') {
    scanDocument();
  } else {
    window.addEventListener('load', scanDocument);
    document.addEventListener('DOMContentLoaded', scanDocument);
  }
})();
</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${bridgeScript}\n</body>`);
  }
  return `${html}\n${bridgeScript}`;
}

/**
 * Prepares uploaded HTML for 4:3 gallery card previews.
 * Locks viewport scrolling on the opening page; optionally pauses animations after initial mount
 * for the static "Portfolio Home Page" thumbnail mode, or keeps everything live for "Live Website".
 */
export function injectCardPreviewHelpers(
  html: string,
  options: { freezeAnimations: boolean }
): string {
  const freezeFlag = options.freezeAnimations ? 'true' : 'false';
  const headInjection = `<style data-se-card-preview="true">
  html, body {
    overflow: hidden !important;
    overscroll-behavior: none !important;
    scrollbar-width: none !important;
  }
  html::-webkit-scrollbar, body::-webkit-scrollbar {
    display: none !important;
  }
</style>`;

  const bodyScript = `<script data-se-card-preview-script="true">
(function () {
  var SHOULD_FREEZE = ${freezeFlag};
  try { window.scrollTo(0, 0); } catch (e) {}
  if (!SHOULD_FREEZE) return;

  function freezeFrame() {
    if (document.getElementById('se-card-freeze-style')) return;
    var style = document.createElement('style');
    style.id = 'se-card-freeze-style';
    style.textContent =
      '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; scroll-behavior: auto !important; }';
    (document.head || document.documentElement).appendChild(style);
    try {
      var vids = document.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) {
        vids[i].pause();
      }
    } catch (e) {}
    try {
      window.requestAnimationFrame = function () { return 0; };
    } catch (e) {}
  }

  function scheduleFreeze() {
    window.setTimeout(freezeFrame, 650);
  }

  if (document.readyState === 'complete') {
    scheduleFreeze();
  } else {
    window.addEventListener('load', scheduleFreeze, { once: true });
    window.setTimeout(freezeFrame, 1600);
  }
})();
</script>`;

  let result = html;
  if (/<\/head>/i.test(result)) {
    result = result.replace(/<\/head>/i, `${headInjection}\n</head>`);
  } else if (/<body[\s>]/i.test(result)) {
    result = result.replace(/<body([\s>])/i, `<head>${headInjection}</head><body$1`);
  } else {
    result = `${headInjection}\n${result}`;
  }

  if (/<\/body>/i.test(result)) {
    return result.replace(/<\/body>/i, `${bodyScript}\n</body>`);
  }
  return `${result}\n${bodyScript}`;
}

/**
 * Deletes obsolete `${authUserId}/sites/bundle-...` Storage directories that are
 * no longer referenced by the user's active uploaded portfolio manifest.
 */
export async function cleanupUnusedSiteBundles(
  authUserId: string,
  activeManifest: UploadedPortfolioFile[] = []
): Promise<void> {
  if (!supabase || !authUserId) return;

  try {
    const activeBundles = new Set<string>();
    const bundleMatchRe = new RegExp(`/${authUserId}/sites/(bundle-[^/]+)/`);
    for (const entry of activeManifest) {
      const m = entry.storageUrl?.match(bundleMatchRe);
      if (m?.[1]) {
        activeBundles.add(m[1]);
      }
    }

    const { data: rootFolders, error } = await supabase.storage
      .from('portfolio-media')
      .list(`${authUserId}/sites`, { limit: 100 });
    if (error || !rootFolders || rootFolders.length === 0) return;

    const obsoleteFolders = rootFolders
      .map((item) => item.name)
      .filter((name) => name.startsWith('bundle-') && !activeBundles.has(name));

    if (obsoleteFolders.length === 0) return;

    const pathsToDelete: string[] = [];
    const collectPaths = async (prefix: string) => {
      const { data: entries } = await supabase!.storage
        .from('portfolio-media')
        .list(prefix, { limit: 200 });
      if (!entries) return;
      for (const entry of entries) {
        const full = `${prefix}/${entry.name}`;
        // Supabase returns id === null for nested directory placeholders
        if (entry.id === null) {
          await collectPaths(full);
        } else {
          pathsToDelete.push(full);
        }
      }
    };

    for (const folder of obsoleteFolders) {
      await collectPaths(`${authUserId}/sites/${folder}`);
    }

    // Remove in batches of 100 objects
    for (let i = 0; i < pathsToDelete.length; i += 100) {
      const chunk = pathsToDelete.slice(i, i + 100);
      await supabase.storage.from('portfolio-media').remove(chunk);
    }
  } catch {
    // Non-critical background cleanup; ignore Storage listing errors
  }
}

