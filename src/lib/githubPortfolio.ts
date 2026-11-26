import type { Discipline } from '../data/portfolios';
import {
  ALLOWED_EXTENSIONS,
  compileAndUploadPortfolioBundle,
  getExtension,
  guessMimeType,
  IGNORED_PATH_PATTERNS,
  MAX_FILE_COUNT,
  MAX_TOTAL_BYTES,
  normalizeSlashPath,
  type StagedUploadFile,
  TEXT_EXTENSIONS,
  type UploadedPortfolioFile,
} from './portfolioBundle';

export interface GitHubRepoSummary {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string;
  htmlUrl: string;
  homepage: string;
  defaultBranch: string;
  language: string;
  topics: string[];
  hasPages: boolean;
  pagesUrl: string;
  isPrivate: boolean;
  stargazersCount: number;
  updatedAt: string;
}

export interface GitHubTreeBlob {
  path: string;
  sha: string;
  size: number;
}

export interface GitHubRepoTarget {
  owner: string;
  repo: string;
  branch?: string;
  subPath?: string;
}

export interface GitHubRepoInspection {
  repo: GitHubRepoSummary;
  branch: string;
  branches: string[];
  entryCandidates: string[];
  recommendedEntry: string | null;
  treeBlobs: GitHubTreeBlob[];
  hasPackageJson: boolean;
  looksLikeUnbuiltSource: boolean;
  unbuiltWarning?: string;
}

interface GitHubApiRepo {
  id: number;
  name: string;
  full_name: string;
  owner?: { login?: string };
  description?: string | null;
  html_url: string;
  homepage?: string | null;
  default_branch?: string;
  language?: string | null;
  topics?: string[];
  has_pages?: boolean;
  private?: boolean;
  stargazers_count?: number;
  updated_at?: string;
}

function buildGitHubHeaders(token?: string, accept = 'application/vnd.github+json'): HeadersInit {
  const headers: Record<string, string> = {
    Accept: accept,
  };
  const trimmed = token?.trim();
  if (trimmed) {
    headers.Authorization = `Bearer ${trimmed}`;
  }
  return headers;
}

async function readGitHubError(res: Response, fallback: string): Promise<string> {
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === '0' || res.status === 429) {
      return 'GitHub API rate limit reached for anonymous requests. Wait a few minutes or enter a GitHub Personal Access Token.';
    }
  }
  if (res.status === 401) {
    return 'GitHub token was rejected or expired. Check your Personal Access Token and try again.';
  }
  if (res.status === 404) {
    return 'GitHub repository or user was not found (if private, provide a Personal Access Token with repo read access).';
  }
  try {
    const body = (await res.json()) as { message?: string };
    if (body?.message) return `GitHub API: ${body.message}`;
  } catch {
    // Ignore JSON parse errors
  }
  return `${fallback} (HTTP ${res.status})`;
}

function buildGitHubPagesUrl(owner: string, repoName: string, hasPages: boolean): string {
  if (!hasPages) return '';
  if (repoName.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return `https://${owner}.github.io/`;
  }
  return `https://${owner}.github.io/${repoName}/`;
}

function mapApiRepo(raw: GitHubApiRepo): GitHubRepoSummary {
  const owner = raw.owner?.login || raw.full_name.split('/')[0] || '';
  const hasPages = Boolean(raw.has_pages);
  const rawHomepage = (raw.homepage || '').trim();
  const normalizedHomepage =
    rawHomepage && !/^https?:\/\//i.test(rawHomepage)
      ? `https://${rawHomepage}`
      : rawHomepage;

  return {
    id: raw.id,
    name: raw.name,
    fullName: raw.full_name,
    owner,
    description: (raw.description || '').trim(),
    htmlUrl: raw.html_url,
    homepage: normalizedHomepage,
    defaultBranch: raw.default_branch || 'main',
    language: (raw.language || '').trim(),
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    hasPages,
    pagesUrl: buildGitHubPagesUrl(owner, raw.name, hasPages),
    isPrivate: Boolean(raw.private),
    stargazersCount: Number(raw.stargazers_count || 0),
    updatedAt: raw.updated_at || new Date().toISOString(),
  };
}

export function extractGitHubUsername(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withoutUrl = trimmed
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/^@/, '');
  const firstSegment = withoutUrl.split(/[/?#]/)[0]?.trim() ?? '';
  return firstSegment.replace(/[^a-zA-Z0-9-]/g, '');
}

export function parseGitHubRepoTarget(raw: string): GitHubRepoTarget | null {
  let cleaned = raw.trim();
  if (!cleaned) return null;

  cleaned = cleaned
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/^\/+|\/+$/g, '')
    .split(/[?#]/)[0];

  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!owner || !repo) return null;

  let branch: string | undefined;
  let subPath: string | undefined;

  if ((parts[2] === 'tree' || parts[2] === 'blob') && parts.length >= 4) {
    branch = parts[3];
    const rest = parts.slice(4);
    if (parts[2] === 'blob' && rest.length > 0) {
      // Drop filename if URL pointed directly to a file like /blob/main/dist/index.html
      const last = rest[rest.length - 1];
      if (last.includes('.')) {
        rest.pop();
      }
    }
    if (rest.length > 0) {
      subPath = rest.join('/');
    }
  } else if (parts.length > 2) {
    subPath = parts.slice(2).join('/');
  }

  return { owner, repo, branch, subPath };
}

export async function fetchGitHubUserRepos(
  username: string,
  token?: string
): Promise<GitHubRepoSummary[]> {
  const cleanUser = extractGitHubUsername(username);
  const cleanToken = token?.trim();

  if (!cleanUser && !cleanToken) {
    throw new Error('Enter a GitHub username or provide a Personal Access Token to load repositories.');
  }

  const endpoint = cleanToken && !cleanUser
    ? 'https://api.github.com/user/repos?sort=updated&per_page=30&affiliation=owner'
    : `https://api.github.com/users/${encodeURIComponent(cleanUser)}/repos?sort=updated&per_page=30&type=owner`;

  const res = await fetch(endpoint, {
    headers: buildGitHubHeaders(cleanToken),
  });

  if (!res.ok) {
    throw new Error(await readGitHubError(res, 'Could not load GitHub repositories'));
  }

  const data = (await res.json()) as GitHubApiRepo[];
  return data.map(mapApiRepo);
}

const BUILT_PREFIX_PRIORITY = [
  'dist/index.html',
  'build/index.html',
  'docs/index.html',
  'out/index.html',
  'public/index.html',
  'index.html',
];

function sortEntryCandidates(paths: string[], preferBuiltDirs: boolean): string[] {
  return [...paths].sort((a, b) => {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();

    if (preferBuiltDirs) {
      const aBuiltIdx = BUILT_PREFIX_PRIORITY.indexOf(al);
      const bBuiltIdx = BUILT_PREFIX_PRIORITY.indexOf(bl);
      if (aBuiltIdx !== -1 || bBuiltIdx !== -1) {
        if (aBuiltIdx === -1) return 1;
        if (bBuiltIdx === -1) return -1;
        return aBuiltIdx - bBuiltIdx;
      }
    } else {
      const aRoot = al === 'index.html' ? 0 : al.endsWith('/index.html') ? 1 : 2;
      const bRoot = bl === 'index.html' ? 0 : bl.endsWith('/index.html') ? 1 : 2;
      if (aRoot !== bRoot) return aRoot - bRoot;
    }

    return a.split('/').length - b.split('/').length || a.localeCompare(b);
  });
}

async function fetchGitHubRawText(
  owner: string,
  repo: string,
  branch: string,
  blob: GitHubTreeBlob,
  token?: string
): Promise<string> {
  if (token?.trim()) {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${blob.sha}`,
      { headers: buildGitHubHeaders(token, 'application/vnd.github.raw+json') }
    );
    if (!res.ok) {
      throw new Error(await readGitHubError(res, `Failed to fetch ${blob.path}`));
    }
    return res.text();
  }

  const encodedPath = blob.path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const res = await fetch(
    `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch ${blob.path} (HTTP ${res.status})`);
  }
  return res.text();
}

async function fetchGitHubRawBlob(
  owner: string,
  repo: string,
  branch: string,
  blob: GitHubTreeBlob,
  mimeType: string,
  token?: string
): Promise<Blob> {
  if (token?.trim()) {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${blob.sha}`,
      { headers: buildGitHubHeaders(token, 'application/vnd.github.raw+json') }
    );
    if (!res.ok) {
      throw new Error(await readGitHubError(res, `Failed to fetch ${blob.path}`));
    }
    const buf = await res.arrayBuffer();
    return new Blob([buf], { type: mimeType });
  }

  const encodedPath = blob.path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const res = await fetch(
    `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch ${blob.path} (HTTP ${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: mimeType });
}

export async function inspectGitHubRepo(
  target: GitHubRepoTarget,
  token?: string
): Promise<GitHubRepoInspection> {
  const cleanToken = token?.trim();
  const repoRes = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`,
    { headers: buildGitHubHeaders(cleanToken) }
  );
  if (!repoRes.ok) {
    throw new Error(await readGitHubError(repoRes, 'Unable to inspect GitHub repository'));
  }

  const repoMeta = mapApiRepo((await repoRes.json()) as GitHubApiRepo);
  const selectedBranch = target.branch?.trim() || repoMeta.defaultBranch;

  const [branchesRes, treeRes] = await Promise.all([
    fetch(
      `https://api.github.com/repos/${encodeURIComponent(repoMeta.owner)}/${encodeURIComponent(repoMeta.name)}/branches?per_page=20`,
      { headers: buildGitHubHeaders(cleanToken) }
    ),
    fetch(
      `https://api.github.com/repos/${encodeURIComponent(repoMeta.owner)}/${encodeURIComponent(repoMeta.name)}/git/trees/${encodeURIComponent(selectedBranch)}?recursive=1`,
      { headers: buildGitHubHeaders(cleanToken) }
    ),
  ]);

  let branches: string[] = [selectedBranch];
  if (branchesRes.ok) {
    const branchList = (await branchesRes.json()) as { name?: string }[];
    const names = branchList.map((b) => b.name).filter((n): n is string => Boolean(n));
    if (names.length > 0) {
      branches = Array.from(new Set([selectedBranch, repoMeta.defaultBranch, ...names]));
    }
  }

  if (!treeRes.ok) {
    throw new Error(
      await readGitHubError(
        treeRes,
        `Could not read files on branch "${selectedBranch}"`
      )
    );
  }

  const treeJson = (await treeRes.json()) as {
    tree?: { path?: string; type?: string; sha?: string; size?: number }[];
  };

  const normalizedSubPath = target.subPath
    ? normalizeSlashPath(target.subPath).replace(/\/+$/, '')
    : '';

  const allBlobs: GitHubTreeBlob[] = (treeJson.tree ?? [])
    .filter((item) => item.type === 'blob' && Boolean(item.path) && Boolean(item.sha))
    .map((item) => ({
      path: normalizeSlashPath(item.path!),
      sha: item.sha!,
      size: Number(item.size || 0),
    }))
    .filter((item) => !IGNORED_PATH_PATTERNS.some((re) => re.test(item.path)));

  const hasPackageJson = allBlobs.some((b) => b.path.toLowerCase() === 'package.json');

  const scopedBlobs = allBlobs.filter((item) => {
    if (normalizedSubPath) {
      const prefix = `${normalizedSubPath.toLowerCase()}/`;
      if (!item.path.toLowerCase().startsWith(prefix)) return false;
    }
    return ALLOWED_EXTENSIONS.has(getExtension(item.path));
  });

  const rawHtmlCandidates = scopedBlobs
    .filter((b) => {
      const ext = getExtension(b.path);
      return ext === 'html' || ext === 'htm';
    })
    .map((b) => b.path);

  const hasBuiltSubdir = rawHtmlCandidates.some((p) =>
    /^(dist|build|docs|out)\/index\.html$/i.test(p)
  );
  const entryCandidates = sortEntryCandidates(
    rawHtmlCandidates,
    hasPackageJson && hasBuiltSubdir
  );
  const recommendedEntry = entryCandidates[0] ?? null;

  let looksLikeUnbuiltSource = false;
  let unbuiltWarning: string | undefined;

  if (!recommendedEntry) {
    looksLikeUnbuiltSource = hasPackageJson;
    unbuiltWarning = hasPackageJson
      ? 'No compiled index.html was found in this branch. If your portfolio is built with React/Vite/Next.js, select the gh-pages branch, point to a built dist/ or docs/ folder, or use its GitHub Pages / Live URL below.'
      : 'No .html entry file was found in this repository branch.';
  } else if (
    hasPackageJson &&
    recommendedEntry.toLowerCase() === 'index.html' &&
    !hasBuiltSubdir
  ) {
    const rootBlob = scopedBlobs.find((b) => b.path === recommendedEntry);
    if (rootBlob) {
      try {
        const previewText = await fetchGitHubRawText(
          repoMeta.owner,
          repoMeta.name,
          selectedBranch,
          rootBlob,
          cleanToken
        );
        if (
          /<script[^>]+src=["'][^"']*\/src\/[^"']+\.(tsx?|jsx?)["']/i.test(previewText) ||
          /vite\.svg|@vite\/client/i.test(previewText)
        ) {
          looksLikeUnbuiltSource = true;
          unbuiltWarning =
            'The root index.html references raw TypeScript/JSX source modules (e.g., /src/main.tsx) that require a build step. Switch to a built branch (like gh-pages), or use the GitHub Pages / Live URL option below.';
        }
      } catch {
        // Ignore peek errors
      }
    }
  }

  return {
    repo: repoMeta,
    branch: selectedBranch,
    branches,
    entryCandidates,
    recommendedEntry,
    treeBlobs: scopedBlobs,
    hasPackageJson,
    looksLikeUnbuiltSource,
    unbuiltWarning,
  };
}

export async function importGitHubRepoBundle(
  options: {
    repo: GitHubRepoSummary;
    branch: string;
    entryPath: string;
    treeBlobs: GitHubTreeBlob[];
    token?: string;
  },
  authUserId: string
): Promise<{
  compiledHtml: string;
  manifest: UploadedPortfolioFile[];
  entryFile: string;
  warnings: string[];
}> {
  const { repo, branch, entryPath, treeBlobs, token } = options;
  const cleanEntry = normalizeSlashPath(entryPath);
  const slashIdx = cleanEntry.lastIndexOf('/');
  const basePrefix = slashIdx >= 0 ? cleanEntry.slice(0, slashIdx + 1) : '';
  const localEntryPath = slashIdx >= 0 ? cleanEntry.slice(slashIdx + 1) : cleanEntry;

  const matchingBlobs = treeBlobs.filter((blob) => {
    if (!basePrefix) return true;
    return blob.path.toLowerCase().startsWith(basePrefix.toLowerCase());
  });

  if (matchingBlobs.length === 0) {
    throw new Error('No portfolio files found under the selected GitHub entry folder.');
  }

  // Put entry file and stylesheets/scripts first so limits never drop core assets
  const orderedBlobs = [...matchingBlobs]
    .sort((a, b) => {
      if (a.path === cleanEntry) return -1;
      if (b.path === cleanEntry) return 1;
      const aCode = TEXT_EXTENSIONS.has(getExtension(a.path)) ? 0 : 1;
      const bCode = TEXT_EXTENSIONS.has(getExtension(b.path)) ? 0 : 1;
      return aCode - bCode || a.size - b.size;
    })
    .slice(0, MAX_FILE_COUNT);

  const warnings: string[] = [];
  if (matchingBlobs.length > MAX_FILE_COUNT) {
    warnings.push(
      `Repository folder exceeded ${MAX_FILE_COUNT} files; only the first ${MAX_FILE_COUNT} files were imported.`
    );
  }

  const staged: StagedUploadFile[] = [];
  let totalBytes = 0;

  const CONCURRENCY = 6;
  for (let i = 0; i < orderedBlobs.length; i += CONCURRENCY) {
    const chunk = orderedBlobs.slice(i, i + CONCURRENCY);
    const downloaded = await Promise.all(
      chunk.map(async (blob) => {
        const relativePath = basePrefix
          ? blob.path.slice(basePrefix.length)
          : blob.path;
        const ext = getExtension(relativePath);
        const isText = TEXT_EXTENSIONS.has(ext);
        const mimeType = guessMimeType(relativePath);

        if (isText) {
          const textContent = await fetchGitHubRawText(
            repo.owner,
            repo.name,
            branch,
            blob,
            token
          );
          const size = new TextEncoder().encode(textContent).length;
          return {
            path: relativePath,
            name: relativePath.split('/').pop() || relativePath,
            mimeType,
            size,
            isText: true,
            textContent,
          } satisfies StagedUploadFile;
        }

        const fileBlob = await fetchGitHubRawBlob(
          repo.owner,
          repo.name,
          branch,
          blob,
          mimeType,
          token
        );
        return {
          path: relativePath,
          name: relativePath.split('/').pop() || relativePath,
          mimeType,
          size: fileBlob.size,
          isText: false,
          blob: fileBlob,
        } satisfies StagedUploadFile;
      })
    );

    for (const item of downloaded) {
      totalBytes += item.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error(
          'Imported GitHub portfolio exceeds the 150 MB limit. Point to a smaller dist/ or docs/ build folder.'
        );
      }
      staged.push(item);
    }
  }

  const compiled = await compileAndUploadPortfolioBundle(
    staged,
    localEntryPath,
    authUserId
  );

  return {
    compiledHtml: compiled.compiledHtml,
    manifest: compiled.manifest,
    entryFile: localEntryPath,
    warnings: [...warnings, ...compiled.warnings],
  };
}

export function suggestPortfolioMetaFromRepo(repo: GitHubRepoSummary): {
  title: string;
  summary: string;
  discipline: Exclude<Discipline, 'All'>;
  skills: string[];
} {
  const title = repo.name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const langLower = repo.language.toLowerCase();
  const topicText = repo.topics.join(' ').toLowerCase();

  let discipline: Exclude<Discipline, 'All'> = 'Full-Stack';
  if (
    langLower === 'css' ||
    langLower === 'scss' ||
    topicText.includes('design') ||
    topicText.includes('ui')
  ) {
    discipline = 'UI / Design';
  } else if (
    langLower === 'python' ||
    langLower === 'jupyter notebook' ||
    topicText.includes('ai') ||
    topicText.includes('ml') ||
    topicText.includes('data')
  ) {
    discipline = 'AI & Data';
  } else if (
    langLower === 'rust' ||
    langLower === 'go' ||
    langLower === 'c' ||
    langLower === 'c++' ||
    topicText.includes('cli') ||
    topicText.includes('systems')
  ) {
    discipline = 'Systems & CLI';
  } else if (
    topicText.includes('webgl') ||
    topicText.includes('threejs') ||
    topicText.includes('mobile') ||
    langLower === 'swift' ||
    langLower === 'kotlin'
  ) {
    discipline = 'Mobile & WebGL';
  }

  const rawSkills = [
    repo.language,
    ...repo.topics.slice(0, 5).map((t) =>
      t
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    ),
  ].filter(Boolean);

  const uniqueSkills = Array.from(new Set(rawSkills));

  return {
    title,
    summary:
      repo.description ||
      `Imported from GitHub repository ${repo.fullName}.`,
    discipline,
    skills:
      uniqueSkills.length > 0 ? uniqueSkills : ['HTML', 'CSS', 'JavaScript'],
  };
}
