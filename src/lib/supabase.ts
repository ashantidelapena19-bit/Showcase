import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { SocialLinks } from '../components/SocialLinksBar';
import {
  type Discipline,
  type PortfolioSourceType,
  type PortfolioThumbnailMode,
  STUDENT_PORTFOLIOS,
  type StudentPortfolio,
} from '../data/portfolios';
import {
  cleanupUnusedSiteBundles,
  type UploadedPortfolioFile,
} from './portfolioBundle';
import { sanitizePortfolioUrl } from './portfolioUrl';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export interface UserProfileRecord {
  id: string;
  email: string;
  auth_user_id: string | null;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  roll_number: string | null;
  role_title: string;
  discipline: string;
  project_title: string;
  project_summary: string;
  cover_image_url: string | null;
  portfolio_url: string | null;
  skills: string[];
  highlights: string[];
  social_links: SocialLinks;
  onboarding_completed?: boolean;
  is_published: boolean;
  published_at: string | null;
  auth_providers: string[];
  last_sign_in_provider: string | null;
  last_sign_in_at: string;
  updated_at?: string;
}

export interface AuthSession {
  mode: 'authenticated' | 'guest';
  profileId?: string;
  authUserId?: string;
  email: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  rollNumber?: string;
  portfolioUrl?: string;
  providers: string[];
  signedInAt: string;
  needsProfileSetup?: boolean;
  profileSyncWarning?: string;
}

export const GUEST_SESSION: AuthSession = {
  mode: 'guest',
  email: 'guest@se-class-a.local',
  displayName: 'Guest Visitor',
  providers: ['guest'],
  signedInAt: new Date().toISOString(),
};

const VALID_DISCIPLINES: Exclude<Discipline, 'All'>[] = [
  'Full-Stack',
  'Systems & CLI',
  'UI / Design',
  'AI & Data',
  'Mobile & WebGL',
];

const FALLBACK_GRADIENTS = [
  'from-slate-800 via-slate-900 to-zinc-900',
  'from-indigo-900 via-slate-900 to-zinc-900',
  'from-rose-900 via-slate-900 to-neutral-900',
  'from-emerald-900 via-slate-900 to-zinc-900',
  'from-amber-900 via-stone-900 to-neutral-900',
];

const AVATAR_COLORS = [
  '#EA4C89',
  '#1E293B',
  '#2563EB',
  '#0F766E',
  '#7C3AED',
  '#B45309',
  '#0284C7',
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SE';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function findMatchedCohortStudent(email: string) {
  const normalized = email.trim().toLowerCase();
  return STUDENT_PORTFOLIOS.find((s) => {
    const slugLast = s.lastName.toLowerCase().replace(/[^a-z]/g, '');
    const expectedEmail = `${s.firstName[0].toLowerCase()}.${slugLast}@se-class-a.edu`;
    return expectedEmail === normalized;
  });
}

function formatFallbackName(user: User, normalizedEmail: string): string {
  const metaName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim());
  if (metaName) return metaName;

  if (!normalizedEmail) return 'Class A Member';
  return normalizedEmail
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractUserProviders(user: User): string[] {
  const appProviders = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers.filter((p): p is string => typeof p === 'string')
    : [];
  const primaryProvider =
    typeof user.app_metadata?.provider === 'string' ? [user.app_metadata.provider] : [];
  const identityProviders = Array.isArray(user.identities)
    ? user.identities
        .map((id) => id.provider)
        .filter((p): p is string => typeof p === 'string')
    : [];

  return Array.from(new Set([...appProviders, ...primaryProvider, ...identityProviders]));
}

export function sanitizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function deriveDefaultUsernameFromEmail(email: string): string {
  const localPart = email.trim().split('@')[0] ?? '';
  const cleaned = sanitizeUsername(localPart);
  return cleaned || 'developer';
}

const LOCAL_ONBOARDING_PREFIX = 'se-onboarding-done-';

function readLocalOnboardingDone(authUserId: string | null | undefined): boolean {
  if (typeof window === 'undefined' || !authUserId) return false;
  try {
    return window.localStorage.getItem(`${LOCAL_ONBOARDING_PREFIX}${authUserId}`) === 'true';
  } catch {
    return false;
  }
}

function writeLocalOnboardingDone(authUserId: string | null | undefined, done: boolean): void {
  if (typeof window === 'undefined' || !authUserId) return;
  try {
    if (done) {
      window.localStorage.setItem(`${LOCAL_ONBOARDING_PREFIX}${authUserId}`, 'true');
    } else {
      window.localStorage.removeItem(`${LOCAL_ONBOARDING_PREFIX}${authUserId}`);
    }
  } catch {
    // Ignore storage errors
  }
}

function computeNeedsProfileSetup(
  record: UserProfileRecord | null | undefined,
  authUserId: string
): boolean {
  if (readLocalOnboardingDone(authUserId)) {
    return false;
  }
  if (!record) {
    return true;
  }
  if (record.onboarding_completed === true) {
    return false;
  }
  const hasUsername = Boolean(record.username?.trim());
  const hasSkills = Array.isArray(record.skills) && record.skills.length > 0;
  if (record.onboarding_completed === false) {
    return !(hasUsername && hasSkills);
  }
  // Legacy schema without onboarding_completed column: treat profiles missing username or skills as unconfigured
  return !(hasUsername && hasSkills);
}

function isMissingOnboardingColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('onboarding_completed') && (lower.includes('column') || lower.includes('schema cache'));
}

/**
 * Resolves a single unified `public.user_profiles` record by normalized lowercase email,
 * so logging in with Email/Password or Google OAuth with the same email points to the same profile row.
 */
export async function syncUnifiedUserProfile(user: User): Promise<AuthSession> {
  const normalizedEmail = (user.email ?? '').trim().toLowerCase();
  const matchedStudent = findMatchedCohortStudent(normalizedEmail);
  const providers = extractUserProviders(user);
  const fallbackName = matchedStudent?.studentName ?? formatFallbackName(user, normalizedEmail);
  const avatarUrl =
    (typeof user.user_metadata?.avatar_url === 'string' && user.user_metadata.avatar_url) ||
    (typeof user.user_metadata?.picture === 'string' && user.user_metadata.picture) ||
    undefined;

  const baseSession: AuthSession = {
    mode: 'authenticated',
    authUserId: user.id,
    email: normalizedEmail,
    displayName: fallbackName,
    avatarUrl,
    rollNumber: matchedStudent?.rollNumber,
    portfolioUrl: matchedStudent?.portfolioUrl,
    providers,
    signedInAt: user.last_sign_in_at ?? new Date().toISOString(),
    needsProfileSetup: !readLocalOnboardingDone(user.id),
  };

  if (!supabase || !normalizedEmail) {
    return baseSession;
  }

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle<UserProfileRecord>();

    if (fetchError) {
      return {
        ...baseSession,
        profileSyncWarning:
          'Signed in, but the user_profiles table could not be queried yet. Run supabase/schema.sql in your Supabase SQL Editor.',
      };
    }

    const mergedProviders = Array.from(
      new Set([...(existing?.auth_providers ?? []), ...providers])
    );

    const payload = {
      email: normalizedEmail,
      auth_user_id: user.id,
      display_name: existing?.display_name?.trim() || fallbackName,
      avatar_url: existing?.avatar_url ?? avatarUrl ?? null,
      roll_number: existing?.roll_number ?? matchedStudent?.rollNumber ?? null,
      portfolio_url: existing?.portfolio_url ?? matchedStudent?.portfolioUrl ?? null,
      auth_providers: mergedProviders,
      last_sign_in_provider: providers[providers.length - 1] ?? null,
      last_sign_in_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: synced, error: upsertError } = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'email' })
      .select('*')
      .single<UserProfileRecord>();

    if (upsertError || !synced) {
      if (existing) {
        return {
          ...baseSession,
          profileId: existing.id,
          username: existing.username ?? undefined,
          displayName: existing.display_name || fallbackName,
          avatarUrl: existing.avatar_url ?? avatarUrl,
          rollNumber: existing.roll_number ?? matchedStudent?.rollNumber,
          portfolioUrl: existing.portfolio_url ?? matchedStudent?.portfolioUrl,
          providers: mergedProviders,
          needsProfileSetup: computeNeedsProfileSetup(existing, user.id),
        };
      }
      return {
        ...baseSession,
        profileSyncWarning: upsertError?.message,
      };
    }

    return {
      mode: 'authenticated',
      profileId: synced.id,
      authUserId: synced.auth_user_id ?? user.id,
      email: synced.email,
      username: synced.username ?? undefined,
      displayName: synced.display_name || fallbackName,
      avatarUrl: synced.avatar_url ?? avatarUrl,
      rollNumber: synced.roll_number ?? matchedStudent?.rollNumber,
      portfolioUrl: synced.portfolio_url ?? matchedStudent?.portfolioUrl,
      providers: synced.auth_providers.length > 0 ? synced.auth_providers : mergedProviders,
      signedInAt: synced.last_sign_in_at ?? baseSession.signedInAt,
      needsProfileSetup: computeNeedsProfileSetup(synced, synced.auth_user_id ?? user.id),
    };
  } catch {
    return baseSession;
  }
}

export interface EditableProfileInput {
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  roleTitle: string;
  discipline: Exclude<Discipline, 'All'>;
  projectTitle: string;
  projectSummary: string;
  coverImageUrl: string;
  portfolioUrl: string;
  skills: string[];
  highlights: string[];
  socialLinks: SocialLinks;
  isPublished: boolean;
  onboardingCompleted?: boolean;
}

export async function fetchMyFullProfile(
  session: AuthSession
): Promise<{ profile: UserProfileRecord | null; error: string | null }> {
  if (!supabase || session.mode !== 'authenticated') {
    return { profile: null, error: 'Sign in required.' };
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('email', session.email.toLowerCase())
    .maybeSingle<UserProfileRecord>();

  if (error) {
    return { profile: null, error: error.message };
  }
  return { profile: data ?? null, error: null };
}

export async function saveUserProfileAndPortfolio(
  session: AuthSession,
  input: EditableProfileInput
): Promise<{ profile: UserProfileRecord | null; error: string | null }> {
  if (!supabase || session.mode !== 'authenticated' || !session.authUserId) {
    return { profile: null, error: 'Please sign in before saving your profile.' };
  }

  const cleanedUsername = sanitizeUsername(input.username);
  const cleanedSocials: SocialLinks = {};
  (Object.keys(input.socialLinks) as (keyof SocialLinks)[]).forEach((key) => {
    const val = input.socialLinks[key]?.trim();
    if (val) {
      cleanedSocials[key] = val;
    }
  });

  const nowIso = new Date().toISOString();
  const cleanedSkills = input.skills.map((s) => s.trim()).filter(Boolean);
  const resolvedOnboardingDone =
    input.onboardingCompleted ?? Boolean(cleanedUsername && cleanedSkills.length > 0);

  const basePayload = {
    email: session.email.trim().toLowerCase(),
    auth_user_id: session.authUserId,
    username: cleanedUsername || null,
    display_name: input.displayName.trim() || session.displayName,
    avatar_url: input.avatarUrl.trim() || null,
    bio: input.bio.trim(),
    role_title: input.roleTitle.trim() || 'Software Engineering Student',
    discipline: input.discipline,
    project_title: input.projectTitle.trim(),
    project_summary: input.projectSummary.trim(),
    cover_image_url: input.coverImageUrl.trim() || null,
    portfolio_url: sanitizePortfolioUrl(input.portfolioUrl) || null,
    skills: cleanedSkills,
    highlights: input.highlights.map((h) => h.trim()).filter(Boolean),
    social_links: cleanedSocials,
    is_published: input.isPublished,
    published_at: input.isPublished ? nowIso : null,
    updated_at: nowIso,
  };

  let { data, error } = await supabase
    .from('user_profiles')
    .upsert(
      { ...basePayload, onboarding_completed: resolvedOnboardingDone },
      { onConflict: 'email' }
    )
    .select('*')
    .single<UserProfileRecord>();

  if (error && isMissingOnboardingColumnError(error.message)) {
    const retry = await supabase
      .from('user_profiles')
      .upsert(basePayload, { onConflict: 'email' })
      .select('*')
      .single<UserProfileRecord>();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    if (error?.message.includes('user_profiles_username_unique_idx')) {
      return {
        profile: null,
        error: 'That username is already taken. Please choose another username.',
      };
    }
    if (error && (error.message.includes('column') || error.message.includes('does not exist'))) {
      return {
        profile: null,
        error:
          'Your Supabase user_profiles table needs the latest columns. Run the updated supabase/schema.sql script in Supabase SQL Editor.',
      };
    }
    return { profile: null, error: error?.message ?? 'Could not save your profile.' };
  }

  if (resolvedOnboardingDone) {
    writeLocalOnboardingDone(session.authUserId, true);
  }
  invalidateGalleryCaches();
  void cleanupUnusedProfileMedia(session.authUserId, 'avatar', input.avatarUrl);
  return { profile: data, error: null };
}

async function compressImageToDataUrl(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality = 0.84
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        const width = Math.max(1, Math.round(img.width * ratio));
        const height = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function extractOwnedMediaFileName(
  url: string | null | undefined,
  authUserId: string,
  kind: 'avatar' | 'cover'
): string | null {
  const trimmed = url?.trim();
  if (!trimmed || !authUserId) return null;
  const cleanUrl = trimmed.split('#')[0].split('?')[0];
  const prefix = `/${authUserId}/`;
  const idx = cleanUrl.lastIndexOf(prefix);
  if (idx === -1) return null;
  const fileName = cleanUrl.slice(idx + prefix.length);
  if (!fileName || fileName.includes('/') || !fileName.startsWith(`${kind}-`)) {
    return null;
  }
  return fileName;
}

/**
 * Deletes older `${authUserId}/${kind}-*` files from `portfolio-media` Storage
 * whenever a user replaces or removes their cover thumbnail or avatar.
 */
export async function cleanupUnusedProfileMedia(
  authUserId: string,
  kind: 'avatar' | 'cover',
  keepUrl?: string | null
): Promise<void> {
  if (!supabase || !authUserId) return;

  try {
    const keepFileName = extractOwnedMediaFileName(keepUrl, authUserId, kind);
    const { data: entries, error } = await supabase.storage
      .from('portfolio-media')
      .list(authUserId, { limit: 100 });

    if (error || !entries || entries.length === 0) return;

    const obsoletePaths = entries
      .filter(
        (entry) =>
          entry.id !== null &&
          entry.name.startsWith(`${kind}-`) &&
          entry.name !== keepFileName
      )
      .map((entry) => `${authUserId}/${entry.name}`);

    if (obsoletePaths.length === 0) return;

    for (let i = 0; i < obsoletePaths.length; i += 100) {
      const chunk = obsoletePaths.slice(i, i + 100);
      await supabase.storage.from('portfolio-media').remove(chunk);
    }
  } catch {
    // Non-critical Storage cleanup
  }
}

/**
 * Uploads an avatar or portfolio cover image to Supabase Storage (`portfolio-media`),
 * cleans up older replaced files of the same kind, and falls back to a compressed
 * client-side Data URL if the Storage bucket has not been provisioned yet.
 */
export async function uploadProfileMedia(
  file: File,
  kind: 'avatar' | 'cover',
  authUserId: string
): Promise<{ url: string; usedStorage: boolean }> {
  if (supabase && authUserId) {
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const filePath = `${authUserId}/${kind}-${uniqueSuffix}.${ext}`;
    const { error } = await supabase.storage
      .from('portfolio-media')
      .upload(filePath, file, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type,
      });

    if (!error) {
      const { data } = supabase.storage.from('portfolio-media').getPublicUrl(filePath);
      if (data?.publicUrl) {
        await cleanupUnusedProfileMedia(authUserId, kind, data.publicUrl);
        return { url: data.publicUrl, usedStorage: true };
      }
    }
  }

  const fallbackUrl =
    kind === 'avatar'
      ? await compressImageToDataUrl(file, 320, 320, 0.85)
      : await compressImageToDataUrl(file, 960, 720, 0.82);

  await cleanupUnusedProfileMedia(authUserId, kind, null);
  return { url: fallbackUrl, usedStorage: false };
}

type PublicPublishedProfileRow = Pick<
  UserProfileRecord,
  | 'id'
  | 'auth_user_id'
  | 'username'
  | 'display_name'
  | 'avatar_url'
  | 'bio'
  | 'roll_number'
  | 'role_title'
  | 'discipline'
  | 'project_title'
  | 'project_summary'
  | 'cover_image_url'
  | 'portfolio_url'
  | 'skills'
  | 'highlights'
  | 'social_links'
  | 'is_published'
  | 'published_at'
  | 'updated_at'
>;

export interface UserPortfolioRecord {
  id: string;
  owner_user_id: string;
  owner_email: string;
  title: string;
  discipline: string;
  summary: string;
  cover_image_url: string | null;
  source_type: PortfolioSourceType;
  thumbnail_mode?: PortfolioThumbnailMode | null;
  portfolio_url: string | null;
  portfolio_html: string | null;
  entry_file: string | null;
  uploaded_files: UploadedPortfolioFile[];
  skills: string[];
  highlights: string[];
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPortfolioInput {
  id?: string;
  title: string;
  discipline: Exclude<Discipline, 'All'>;
  summary: string;
  coverImageUrl: string;
  sourceType: PortfolioSourceType;
  thumbnailMode?: PortfolioThumbnailMode;
  portfolioUrl: string;
  portfolioHtml: string;
  entryFile: string;
  uploadedFiles: UploadedPortfolioFile[];
  skills: string[];
  highlights: string[];
  isPublished: boolean;
}

const THUMB_MODE_CACHE_KEY = 'se-portfolio-thumb-mode-v1';
const PUBLISHED_CACHE_TTL_MS = 60_000;
const ENGAGEMENT_CACHE_TTL_MS = 30_000;

interface PortfolioHtmlDetail {
  portfolioHtml?: string;
  uploadedFiles?: UploadedPortfolioFile[];
  entryFile?: string;
}

let publishedPortfoliosCache: { data: StudentPortfolio[]; fetchedAt: number } | null = null;
let publishedPortfoliosInflight: Promise<StudentPortfolio[]> | null = null;

const engagementCache = new Map<
  string,
  { data: PortfolioEngagementSnapshot; fetchedAt: number }
>();
const engagementInflight = new Map<string, Promise<PortfolioEngagementSnapshot>>();

const htmlDetailCache = new Map<string, PortfolioHtmlDetail>();
const htmlDetailInflight = new Map<string, Promise<PortfolioHtmlDetail | null>>();

export function invalidateGalleryCaches(portfolioId?: string): void {
  publishedPortfoliosCache = null;
  publishedPortfoliosInflight = null;
  engagementCache.clear();
  engagementInflight.clear();
  if (portfolioId) {
    htmlDetailCache.delete(portfolioId);
    htmlDetailInflight.delete(portfolioId);
  } else {
    htmlDetailCache.clear();
    htmlDetailInflight.clear();
  }
}

function normalizeThumbnailMode(val?: unknown): PortfolioThumbnailMode | null {
  return val === 'homepage' || val === 'image' || val === 'live' ? val : null;
}

function readCachedThumbnailMode(portfolioUuid: string): PortfolioThumbnailMode | null {
  if (typeof window === 'undefined' || !portfolioUuid) return null;
  try {
    const raw = window.localStorage.getItem(THUMB_MODE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeThumbnailMode(parsed[portfolioUuid]);
  } catch {
    return null;
  }
}

function writeCachedThumbnailMode(
  portfolioUuid: string,
  mode: PortfolioThumbnailMode
): void {
  if (typeof window === 'undefined' || !portfolioUuid) return;
  try {
    const raw = window.localStorage.getItem(THUMB_MODE_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[portfolioUuid] = mode;
    window.localStorage.setItem(THUMB_MODE_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore storage quota errors
  }
}

function isMissingThumbnailModeColumnError(message?: string): boolean {
  if (!message) return false;
  return (
    message.includes('thumbnail_mode') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  );
}

export function profileToStudentPortfolio(
  row: PublicPublishedProfileRow
): StudentPortfolio {
  const displayName = row.display_name?.trim() || row.username || 'Class A Member';
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? displayName;
  const lastName = nameParts.slice(1).join(' ') || firstName;
  const seed = hashString(row.id || displayName);

  const discipline = VALID_DISCIPLINES.includes(
    row.discipline as Exclude<Discipline, 'All'>
  )
    ? (row.discipline as Exclude<Discipline, 'All'>)
    : 'Full-Stack';

  const socialLinks: SocialLinks =
    row.social_links && typeof row.social_links === 'object' ? row.social_links : {};

  const githubRaw = socialLinks.github?.trim() ?? '';
  const githubHandle = githubRaw
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');

  return {
    id: `published-${row.id}`,
    rollNumber: row.roll_number?.trim() || (row.username ? `@${row.username}` : 'MEMBER'),
    studentName: displayName,
    username: row.username?.trim() || undefined,
    bio: row.bio?.trim() || undefined,
    firstName,
    lastName,
    folderName: row.username?.trim() || displayName,
    portfolioUrl: sanitizePortfolioUrl(row.portfolio_url),
    sourceType: sanitizePortfolioUrl(row.portfolio_url) ? 'url' : 'showcase',
    thumbnailMode: row.cover_image_url?.trim()
      ? 'image'
      : sanitizePortfolioUrl(row.portfolio_url)
        ? 'homepage'
        : 'image',
    ownerUserId: row.auth_user_id ?? undefined,
    discipline,
    roleTitle: row.role_title?.trim() || 'Software Engineering Student',
    projectTitle: row.project_title?.trim() || `${displayName} Portfolio`,
    projectSummary:
      row.project_summary?.trim() ||
      row.bio?.trim() ||
      'Published Software Engineering portfolio showcasing projects and engineering skills.',
    thumbnail: row.cover_image_url?.trim() || '',
    fallbackGradient: FALLBACK_GRADIENTS[seed % FALLBACK_GRADIENTS.length],
    avatarColor: AVATAR_COLORS[seed % AVATAR_COLORS.length],
    avatarUrl: row.avatar_url?.trim() || undefined,
    initials: getInitials(displayName),
    skills:
      Array.isArray(row.skills) && row.skills.length > 0
        ? row.skills
        : ['TypeScript', 'React'],
    likes: 0,
    views: 0,
    commentsCount: 0,
    year: 'Published 2026',
    highlights:
      Array.isArray(row.highlights) && row.highlights.length > 0
        ? row.highlights
        : ['Published Cohort Profile'],
    githubHandle: githubHandle || row.username || 'se-class-a',
    socialLinks,
    isPublishedCommunity: true,
    publishedAt: row.published_at ?? row.updated_at ?? undefined,
  };
}

export function userPortfolioToStudentPortfolio(
  row: UserPortfolioRecord,
  author?: PublicPublishedProfileRow
): StudentPortfolio {
  const displayName =
    author?.display_name?.trim() ||
    author?.username?.trim() ||
    'Class A Member';
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? displayName;
  const lastName = nameParts.slice(1).join(' ') || firstName;
  const seed = hashString(row.id || displayName);

  const discipline = VALID_DISCIPLINES.includes(
    row.discipline as Exclude<Discipline, 'All'>
  )
    ? (row.discipline as Exclude<Discipline, 'All'>)
    : 'Full-Stack';

  const socialLinks: SocialLinks =
    author?.social_links && typeof author.social_links === 'object'
      ? author.social_links
      : {};

  const githubRaw = socialLinks.github?.trim() ?? '';
  const githubHandle = githubRaw
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');

  const resolvedThumbnailMode: PortfolioThumbnailMode =
    normalizeThumbnailMode(row.thumbnail_mode) ??
    readCachedThumbnailMode(row.id) ??
    (row.cover_image_url?.trim()
      ? 'image'
      : row.source_type === 'upload' || row.source_type === 'url'
        ? 'homepage'
        : 'image');

  const hasUploadedHtml =
    row.source_type === 'upload' && Boolean(row.portfolio_html?.trim());

  return {
    id: `portfolio-${row.id}`,
    rollNumber:
      author?.roll_number?.trim() ||
      (author?.username ? `@${author.username}` : 'MEMBER'),
    studentName: displayName,
    username: author?.username?.trim() || undefined,
    bio: author?.bio?.trim() || undefined,
    firstName,
    lastName,
    folderName: author?.username?.trim() || displayName,
    portfolioUrl:
      row.source_type === 'url' ? sanitizePortfolioUrl(row.portfolio_url) : '',
    portfolioHtml: hasUploadedHtml ? row.portfolio_html ?? undefined : undefined,
    hasUploadedHtml,
    sourceType: row.source_type,
    thumbnailMode: resolvedThumbnailMode,
    entryFile: row.entry_file ?? undefined,
    uploadedFiles: Array.isArray(row.uploaded_files) ? row.uploaded_files : [],
    ownerUserId: row.owner_user_id,
    discipline,
    roleTitle: author?.role_title?.trim() || 'Software Engineering Student',
    projectTitle: row.title?.trim() || `${displayName} Portfolio`,
    projectSummary:
      row.summary?.trim() ||
      author?.bio?.trim() ||
      'Uploaded Software Engineering portfolio showcasing projects and engineering craft.',
    thumbnail: row.cover_image_url?.trim() || '',
    fallbackGradient: FALLBACK_GRADIENTS[seed % FALLBACK_GRADIENTS.length],
    avatarColor: AVATAR_COLORS[seed % AVATAR_COLORS.length],
    avatarUrl: author?.avatar_url?.trim() || undefined,
    initials: getInitials(displayName),
    skills:
      Array.isArray(row.skills) && row.skills.length > 0
        ? row.skills
        : ['TypeScript', 'React'],
    likes: 0,
    views: 0,
    commentsCount: 0,
    year: 'Uploaded 2026',
    highlights:
      Array.isArray(row.highlights) && row.highlights.length > 0
        ? row.highlights
        : ['Uploaded Portfolio'],
    githubHandle: githubHandle || author?.username || 'se-class-a',
    socialLinks,
    isPublishedCommunity: true,
    publishedAt: row.published_at ?? row.updated_at ?? undefined,
  };
}

export async function fetchMyPortfolios(
  session: AuthSession
): Promise<{ portfolios: UserPortfolioRecord[]; error: string | null }> {
  if (!supabase || session.mode !== 'authenticated' || !session.authUserId) {
    return { portfolios: [], error: 'Sign in required.' };
  }

  const { data, error } = await supabase
    .from('user_portfolios')
    .select('*')
    .eq('owner_user_id', session.authUserId)
    .order('updated_at', { ascending: false });

  if (error) {
    return { portfolios: [], error: error.message };
  }

  const normalizedRows = ((data as UserPortfolioRecord[]) ?? []).map((row) => ({
    ...row,
    thumbnail_mode:
      normalizeThumbnailMode(row.thumbnail_mode) ??
      readCachedThumbnailMode(row.id) ??
      (row.cover_image_url?.trim() ? 'image' : 'homepage'),
  }));

  return { portfolios: normalizedRows, error: null };
}

export async function hasUserUploadedPortfolio(
  authUserId: string
): Promise<boolean> {
  if (!supabase || !authUserId) return false;
  try {
    const { data, error } = await supabase
      .from('user_portfolios')
      .select('id')
      .eq('owner_user_id', authUserId)
      .limit(1);
    if (error || !data) return false;
    return data.length > 0;
  } catch {
    return false;
  }
}

export async function saveUserPortfolio(
  session: AuthSession,
  input: UserPortfolioInput
): Promise<{ portfolio: UserPortfolioRecord | null; error: string | null }> {
  if (!supabase || session.mode !== 'authenticated' || !session.authUserId) {
    return { portfolio: null, error: 'Please sign in before uploading a portfolio.' };
  }

  const nowIso = new Date().toISOString();
  const desiredThumbMode: PortfolioThumbnailMode =
    normalizeThumbnailMode(input.thumbnailMode) ?? 'image';

  const basePayload = {
    owner_user_id: session.authUserId,
    owner_email: session.email.trim().toLowerCase(),
    title: input.title.trim() || `${session.displayName} Portfolio`,
    discipline: input.discipline,
    summary: input.summary.trim(),
    cover_image_url: input.coverImageUrl.trim() || null,
    source_type: input.sourceType,
    portfolio_url:
      input.sourceType === 'url'
        ? sanitizePortfolioUrl(input.portfolioUrl) || null
        : null,
    portfolio_html:
      input.sourceType === 'upload' ? input.portfolioHtml || null : null,
    entry_file:
      input.sourceType === 'upload' ? input.entryFile.trim() || null : null,
    uploaded_files:
      input.sourceType === 'upload' ? input.uploadedFiles : [],
    skills: input.skills.map((s) => s.trim()).filter(Boolean),
    highlights: input.highlights.map((h) => h.trim()).filter(Boolean),
    is_published: input.isPublished,
    published_at: input.isPublished ? nowIso : null,
    updated_at: nowIso,
  };
  const payloadWithThumbMode = {
    ...basePayload,
    thumbnail_mode: desiredThumbMode,
  };

  const PORTFOLIO_SAVE_SELECT =
    'id, owner_user_id, owner_email, title, discipline, summary, thumbnail_mode, cover_image_url, source_type, portfolio_url, entry_file, uploaded_files, skills, highlights, is_published, published_at, created_at, updated_at';
  const PORTFOLIO_SAVE_SELECT_LEGACY =
    'id, owner_user_id, owner_email, title, discipline, summary, cover_image_url, source_type, portfolio_url, entry_file, uploaded_files, skills, highlights, is_published, published_at, created_at, updated_at';

  if (input.id) {
    let { data, error } = await supabase
      .from('user_portfolios')
      .update(payloadWithThumbMode)
      .eq('id', input.id)
      .eq('owner_user_id', session.authUserId)
      .select(PORTFOLIO_SAVE_SELECT)
      .single<Omit<UserPortfolioRecord, 'portfolio_html'>>();

    if (error && isMissingThumbnailModeColumnError(error.message)) {
      const retry = await supabase
        .from('user_portfolios')
        .update(basePayload)
        .eq('id', input.id)
        .eq('owner_user_id', session.authUserId)
        .select(PORTFOLIO_SAVE_SELECT_LEGACY)
        .single<Omit<UserPortfolioRecord, 'portfolio_html'>>();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      return {
        portfolio: null,
        error: error?.message.includes('does not exist')
          ? 'The user_portfolios table is not created yet. Run the latest supabase/schema.sql in Supabase SQL Editor.'
          : error?.message ?? 'Could not save portfolio.',
      };
    }

    writeCachedThumbnailMode(data.id, desiredThumbMode);
    invalidateGalleryCaches(`portfolio-${data.id}`);
    void cleanupUnusedSiteBundles(
      session.authUserId,
      input.sourceType === 'upload' ? input.uploadedFiles : []
    );
    void cleanupUnusedProfileMedia(session.authUserId, 'cover', input.coverImageUrl);
    return {
      portfolio: {
        ...data,
        portfolio_html: basePayload.portfolio_html,
        thumbnail_mode:
          normalizeThumbnailMode(data.thumbnail_mode) ?? desiredThumbMode,
      },
      error: null,
    };
  }

  // Enforce one portfolio per user before inserting
  const { data: existingPortfolios, error: checkError } = await supabase
    .from('user_portfolios')
    .select('id')
    .eq('owner_user_id', session.authUserId)
    .limit(1);

  if (checkError && checkError.message.includes('does not exist')) {
    return {
      portfolio: null,
      error:
        'The user_portfolios table is not created yet. Run the latest supabase/schema.sql in Supabase SQL Editor.',
    };
  }

  if (!checkError && existingPortfolios && existingPortfolios.length > 0) {
    return {
      portfolio: null,
      error:
        'Each account is limited to 1 portfolio upload. Edit, replace, or delete your existing portfolio instead.',
    };
  }

  let { data, error } = await supabase
    .from('user_portfolios')
    .insert(payloadWithThumbMode)
    .select(PORTFOLIO_SAVE_SELECT)
    .single<Omit<UserPortfolioRecord, 'portfolio_html'>>();

  if (error && isMissingThumbnailModeColumnError(error.message)) {
    const retry = await supabase
      .from('user_portfolios')
      .insert(basePayload)
      .select(PORTFOLIO_SAVE_SELECT_LEGACY)
      .single<Omit<UserPortfolioRecord, 'portfolio_html'>>();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    if (
      error &&
      (error.code === '23505' ||
        error.message.includes('user_portfolios_single_owner_unique_idx'))
    ) {
      return {
        portfolio: null,
        error:
          'Each account is limited to 1 portfolio upload. Edit, replace, or delete your existing portfolio instead.',
      };
    }
    return {
      portfolio: null,
      error: error?.message.includes('does not exist')
        ? 'The user_portfolios table is not created yet. Run the latest supabase/schema.sql in Supabase SQL Editor.'
        : error?.message ?? 'Could not save portfolio.',
    };
  }

  writeCachedThumbnailMode(data.id, desiredThumbMode);
  invalidateGalleryCaches(`portfolio-${data.id}`);
  void cleanupUnusedSiteBundles(
    session.authUserId,
    input.sourceType === 'upload' ? input.uploadedFiles : []
  );
  void cleanupUnusedProfileMedia(session.authUserId, 'cover', input.coverImageUrl);
  return {
    portfolio: {
      ...data,
      portfolio_html: basePayload.portfolio_html,
      thumbnail_mode:
        normalizeThumbnailMode(data.thumbnail_mode) ?? desiredThumbMode,
    },
    error: null,
  };
}

export async function setUserPortfolioPublished(
  portfolioId: string,
  authUserId: string,
  isPublished: boolean
): Promise<{ portfolio: UserPortfolioRecord | null; error: string | null }> {
  if (!supabase || !authUserId) {
    return { portfolio: null, error: 'Sign in required.' };
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_portfolios')
    .update({
      is_published: isPublished,
      published_at: isPublished ? nowIso : null,
      updated_at: nowIso,
    })
    .eq('id', portfolioId)
    .eq('owner_user_id', authUserId)
    .select('*')
    .single<UserPortfolioRecord>();

  if (error) {
    return { portfolio: null, error: error.message };
  }
  invalidateGalleryCaches(`portfolio-${portfolioId}`);
  return { portfolio: data, error: null };
}

export async function deleteUserPortfolio(
  portfolioId: string,
  authUserId: string
): Promise<{ error: string | null }> {
  if (!supabase || !authUserId) {
    return { error: 'Sign in required.' };
  }

  const { error } = await supabase
    .from('user_portfolios')
    .delete()
    .eq('id', portfolioId)
    .eq('owner_user_id', authUserId);

  if (!error) {
    invalidateGalleryCaches(`portfolio-${portfolioId}`);
    void cleanupUnusedSiteBundles(authUserId, []);
    void cleanupUnusedProfileMedia(authUserId, 'cover', null);
  }

  return { error: error ? error.message : null };
}

interface PublicPortfolioRpcRow {
  id: string;
  owner_user_id: string;
  title: string;
  discipline: string;
  summary: string;
  cover_image_url: string | null;
  source_type: PortfolioSourceType;
  thumbnail_mode: PortfolioThumbnailMode | null;
  portfolio_url: string | null;
  portfolio_html: string | null;
  has_uploaded_html: boolean;
  entry_file: string | null;
  skills: string[];
  highlights: string[];
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  author_bio: string | null;
  author_roll_number: string | null;
  author_role_title: string | null;
  author_social_links: SocialLinks | null;
}

function publicRpcRowToStudentPortfolio(row: PublicPortfolioRpcRow): StudentPortfolio {
  const displayName =
    row.author_display_name?.trim() ||
    row.author_username?.trim() ||
    'Class A Member';
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? displayName;
  const lastName = nameParts.slice(1).join(' ') || firstName;
  const seed = hashString(row.id || displayName);

  const discipline = VALID_DISCIPLINES.includes(
    row.discipline as Exclude<Discipline, 'All'>
  )
    ? (row.discipline as Exclude<Discipline, 'All'>)
    : 'Full-Stack';

  const socialLinks: SocialLinks =
    row.author_social_links && typeof row.author_social_links === 'object'
      ? row.author_social_links
      : {};

  const githubRaw = socialLinks.github?.trim() ?? '';
  const githubHandle = githubRaw
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');

  const resolvedThumbnailMode: PortfolioThumbnailMode =
    normalizeThumbnailMode(row.thumbnail_mode) ??
    readCachedThumbnailMode(row.id) ??
    (row.cover_image_url?.trim()
      ? 'image'
      : row.source_type === 'upload' || row.source_type === 'url'
        ? 'homepage'
        : 'image');

  const portfolioId = `portfolio-${row.id}`;
  const inlineHtml =
    row.source_type === 'upload' && row.portfolio_html?.trim()
      ? row.portfolio_html
      : undefined;

  if (inlineHtml) {
    htmlDetailCache.set(portfolioId, {
      portfolioHtml: inlineHtml,
      entryFile: row.entry_file ?? undefined,
    });
  }

  return {
    id: portfolioId,
    rollNumber:
      row.author_roll_number?.trim() ||
      (row.author_username ? `@${row.author_username}` : 'MEMBER'),
    studentName: displayName,
    username: row.author_username?.trim() || undefined,
    bio: row.author_bio?.trim() || undefined,
    firstName,
    lastName,
    folderName: row.author_username?.trim() || displayName,
    portfolioUrl:
      row.source_type === 'url' ? sanitizePortfolioUrl(row.portfolio_url) : '',
    portfolioHtml: inlineHtml,
    hasUploadedHtml: Boolean(row.has_uploaded_html || inlineHtml),
    sourceType: row.source_type,
    thumbnailMode: resolvedThumbnailMode,
    entryFile: row.entry_file ?? undefined,
    uploadedFiles: [],
    ownerUserId: row.owner_user_id,
    discipline,
    roleTitle: row.author_role_title?.trim() || 'Software Engineering Student',
    projectTitle: row.title?.trim() || `${displayName} Portfolio`,
    projectSummary:
      row.summary?.trim() ||
      row.author_bio?.trim() ||
      'Uploaded Software Engineering portfolio showcasing projects and engineering craft.',
    thumbnail: row.cover_image_url?.trim() || '',
    fallbackGradient: FALLBACK_GRADIENTS[seed % FALLBACK_GRADIENTS.length],
    avatarColor: AVATAR_COLORS[seed % AVATAR_COLORS.length],
    avatarUrl: row.author_avatar_url?.trim() || undefined,
    initials: getInitials(displayName),
    skills:
      Array.isArray(row.skills) && row.skills.length > 0
        ? row.skills
        : ['TypeScript', 'React'],
    likes: 0,
    views: 0,
    commentsCount: 0,
    year: 'Uploaded 2026',
    highlights:
      Array.isArray(row.highlights) && row.highlights.length > 0
        ? row.highlights
        : ['Uploaded Portfolio'],
    githubHandle: githubHandle || row.author_username || 'se-class-a',
    socialLinks,
    isPublishedCommunity: true,
    publishedAt: row.published_at ?? row.updated_at ?? undefined,
  };
}

export async function fetchPublishedPortfolios(
  options: { forceRefresh?: boolean } = {}
): Promise<StudentPortfolio[]> {
  if (!supabase) return [];

  const now = Date.now();
  if (
    !options.forceRefresh &&
    publishedPortfoliosCache &&
    now - publishedPortfoliosCache.fetchedAt < PUBLISHED_CACHE_TTL_MS
  ) {
    return publishedPortfoliosCache.data;
  }

  if (!options.forceRefresh && publishedPortfoliosInflight) {
    return publishedPortfoliosInflight;
  }

  const runFetch = async (): Promise<StudentPortfolio[]> => {
    try {
      // 1. Try privacy-preserving RPCs first (excludes emails + defers heavy HTML on image cards)
      const [rpcPortfoliosRes, rpcLegacyRes] = await Promise.all([
        supabase!.rpc('get_public_portfolios'),
        supabase!.rpc('get_public_legacy_profiles'),
      ]);

      if (!rpcPortfoliosRes.error && Array.isArray(rpcPortfoliosRes.data)) {
        const uploadedPortfolios = (
          rpcPortfoliosRes.data as PublicPortfolioRpcRow[]
        ).map(publicRpcRowToStudentPortfolio);

        const legacyPortfolios =
          !rpcLegacyRes.error && Array.isArray(rpcLegacyRes.data)
            ? (rpcLegacyRes.data as PublicPublishedProfileRow[]).map(
                profileToStudentPortfolio
              )
            : [];

        const merged = [...uploadedPortfolios, ...legacyPortfolios];
        publishedPortfoliosCache = { data: merged, fetchedAt: Date.now() };
        return merged;
      }

      // 2. Fallback to direct table queries when older schema.sql is still active
      const columnsWithThumb =
        'id, owner_user_id, title, discipline, summary, cover_image_url, source_type, thumbnail_mode, portfolio_url, portfolio_html, entry_file, uploaded_files, skills, highlights, is_published, published_at, created_at, updated_at';
      const columnsLegacy =
        'id, owner_user_id, title, discipline, summary, cover_image_url, source_type, portfolio_url, portfolio_html, entry_file, uploaded_files, skills, highlights, is_published, published_at, created_at, updated_at';

      const [uploadedRes, legacyProfilesRes] = await Promise.all([
        supabase!
          .from('user_portfolios')
          .select(columnsWithThumb)
          .eq('is_published', true)
          .order('published_at', { ascending: false, nullsFirst: false }),
        supabase!
          .from('user_profiles')
          .select(
            'id, auth_user_id, username, display_name, avatar_url, bio, roll_number, role_title, discipline, project_title, project_summary, cover_image_url, portfolio_url, skills, highlights, social_links, is_published, published_at, updated_at'
          )
          .eq('is_published', true)
          .order('published_at', { ascending: false, nullsFirst: false }),
      ]);

      let uploadedRows: UserPortfolioRecord[] =
        !uploadedRes.error && uploadedRes.data
          ? (uploadedRes.data as UserPortfolioRecord[])
          : [];

      if (
        uploadedRes.error &&
        isMissingThumbnailModeColumnError(uploadedRes.error.message)
      ) {
        const legacyRes = await supabase!
          .from('user_portfolios')
          .select(columnsLegacy)
          .eq('is_published', true)
          .order('published_at', { ascending: false, nullsFirst: false });
        if (!legacyRes.error && legacyRes.data) {
          uploadedRows = legacyRes.data as unknown as UserPortfolioRecord[];
        }
      }

      const ownerIds = Array.from(
        new Set(uploadedRows.map((r) => r.owner_user_id).filter(Boolean))
      );

      const authorByAuthId = new Map<string, PublicPublishedProfileRow>();
      if (!legacyProfilesRes.error && legacyProfilesRes.data) {
        for (const p of legacyProfilesRes.data as PublicPublishedProfileRow[]) {
          if (p.auth_user_id) authorByAuthId.set(p.auth_user_id, p);
        }
      }

      if (ownerIds.length > 0) {
        const { data: authorsData } = await supabase!
          .from('user_profiles')
          .select(
            'id, auth_user_id, username, display_name, avatar_url, bio, roll_number, role_title, discipline, project_title, project_summary, cover_image_url, portfolio_url, skills, highlights, social_links, is_published, published_at, updated_at'
          )
          .in('auth_user_id', ownerIds);

        if (authorsData) {
          for (const a of authorsData as PublicPublishedProfileRow[]) {
            if (a.auth_user_id) authorByAuthId.set(a.auth_user_id, a);
          }
        }
      }

      const uploadedPortfolios = uploadedRows.map((row) =>
        userPortfolioToStudentPortfolio(row, authorByAuthId.get(row.owner_user_id))
      );

      const ownersWithNewPortfolios = new Set(ownerIds);
      const legacyPortfolios =
        !legacyProfilesRes.error && legacyProfilesRes.data
          ? (legacyProfilesRes.data as PublicPublishedProfileRow[])
              .filter(
                (row) => !row.auth_user_id || !ownersWithNewPortfolios.has(row.auth_user_id)
              )
              .map(profileToStudentPortfolio)
          : [];

      const merged = [...uploadedPortfolios, ...legacyPortfolios];
      publishedPortfoliosCache = { data: merged, fetchedAt: Date.now() };
      return merged;
    } catch {
      return [];
    } finally {
      publishedPortfoliosInflight = null;
    }
  };

  publishedPortfoliosInflight = runFetch();
  return publishedPortfoliosInflight;
}

export async function fetchPortfolioHtmlById(
  portfolioId: string
): Promise<PortfolioHtmlDetail | null> {
  if (!supabase || !portfolioId.startsWith('portfolio-')) return null;

  const cached = htmlDetailCache.get(portfolioId);
  if (cached && cached.uploadedFiles !== undefined && cached.portfolioHtml !== undefined) {
    return cached;
  }

  const inflight = htmlDetailInflight.get(portfolioId);
  if (inflight) return inflight;

  const loadDetail = async (): Promise<PortfolioHtmlDetail | null> => {
    try {
      const rpcRes = await supabase!.rpc('get_portfolio_html_detail', {
        p_portfolio_id: portfolioId,
      });

      if (!rpcRes.error && Array.isArray(rpcRes.data) && rpcRes.data[0]) {
        const row = rpcRes.data[0] as {
          portfolio_html?: string | null;
          uploaded_files?: UploadedPortfolioFile[] | null;
          entry_file?: string | null;
        };
        const detail: PortfolioHtmlDetail = {
          portfolioHtml: row.portfolio_html?.trim() ? row.portfolio_html : undefined,
          uploadedFiles: Array.isArray(row.uploaded_files) ? row.uploaded_files : [],
          entryFile: row.entry_file ?? undefined,
        };
        htmlDetailCache.set(portfolioId, detail);
        return detail;
      }

      // Fallback to direct table lookup on legacy schema
      const rawId = portfolioId.replace(/^portfolio-/, '').trim();
      if (!rawId) return null;
      const { data, error } = await supabase!
        .from('user_portfolios')
        .select('portfolio_html, uploaded_files, entry_file')
        .eq('id', rawId)
        .maybeSingle<{
          portfolio_html: string | null;
          uploaded_files: UploadedPortfolioFile[] | null;
          entry_file: string | null;
        }>();
      if (error || !data) return null;
      const detail: PortfolioHtmlDetail = {
        portfolioHtml: data.portfolio_html?.trim() ? data.portfolio_html : undefined,
        uploadedFiles: Array.isArray(data.uploaded_files) ? data.uploaded_files : [],
        entryFile: data.entry_file ?? undefined,
      };
      htmlDetailCache.set(portfolioId, detail);
      return detail;
    } catch {
      return null;
    } finally {
      htmlDetailInflight.delete(portfolioId);
    }
  };

  const promise = loadDetail();
  htmlDetailInflight.set(portfolioId, promise);
  return promise;
}

export async function fetchMyPortfolioById(
  portfolioId: string,
  authUserId: string
): Promise<StudentPortfolio | null> {
  if (!supabase || !authUserId || !portfolioId.startsWith('portfolio-')) {
    return null;
  }
  const rawId = portfolioId.replace(/^portfolio-/, '').trim();
  if (!rawId) return null;

  const columnsWithThumb =
    'id, owner_user_id, title, discipline, summary, cover_image_url, source_type, thumbnail_mode, portfolio_url, portfolio_html, entry_file, uploaded_files, skills, highlights, is_published, published_at, created_at, updated_at';
  const columnsLegacy =
    'id, owner_user_id, title, discipline, summary, cover_image_url, source_type, portfolio_url, portfolio_html, entry_file, uploaded_files, skills, highlights, is_published, published_at, created_at, updated_at';

  try {
    let [portfolioRes, authorRes] = await Promise.all([
      supabase
        .from('user_portfolios')
        .select(columnsWithThumb)
        .eq('id', rawId)
        .eq('owner_user_id', authUserId)
        .maybeSingle<UserPortfolioRecord>(),
      supabase
        .from('user_profiles')
        .select(
          'id, auth_user_id, username, display_name, avatar_url, bio, roll_number, role_title, discipline, project_title, project_summary, cover_image_url, portfolio_url, skills, highlights, social_links, is_published, published_at, updated_at'
        )
        .eq('auth_user_id', authUserId)
        .maybeSingle<PublicPublishedProfileRow>(),
    ]);

    if (
      portfolioRes.error &&
      isMissingThumbnailModeColumnError(portfolioRes.error.message)
    ) {
      portfolioRes = await supabase
        .from('user_portfolios')
        .select(columnsLegacy)
        .eq('id', rawId)
        .eq('owner_user_id', authUserId)
        .maybeSingle<UserPortfolioRecord>();
    }

    if (portfolioRes.error || !portfolioRes.data) return null;
    return userPortfolioToStudentPortfolio(
      portfolioRes.data,
      authorRes.data ?? undefined
    );
  } catch {
    return null;
  }
}

export interface PortfolioComment {
  id: string;
  portfolio_id: string;
  parent_comment_id?: string | null;
  author_user_id: string;
  author_name: string;
  author_username: string | null;
  author_avatar_url: string | null;
  body: string;
  created_at: string;
}

export const COMMENT_REACTION_EMOJIS = ['👍', '❤️', '🔥', '👏', '🚀', '💡'] as const;
export type CommentReactionEmoji = (typeof COMMENT_REACTION_EMOJIS)[number];

export interface CommentReactionBucket {
  emoji: CommentReactionEmoji;
  count: number;
  reactedByMe: boolean;
}

export type CommentReactionsMap = Record<string, CommentReactionBucket[]>;

export interface MentionableUser {
  username: string;
  displayName: string;
  avatarUrl?: string;
  portfolioId?: string;
}

export interface PortfolioEngagementSnapshot {
  viewsByPortfolio: Record<string, number>;
  heartsByPortfolio: Record<string, number>;
  commentsByPortfolio: Record<string, number>;
  userLikedIds: Record<string, boolean>;
  schemaReady: boolean;
}

export async function fetchPortfolioEngagement(
  authUserId?: string,
  options: { forceRefresh?: boolean } = {}
): Promise<PortfolioEngagementSnapshot> {
  const empty: PortfolioEngagementSnapshot = {
    viewsByPortfolio: {},
    heartsByPortfolio: {},
    commentsByPortfolio: {},
    userLikedIds: {},
    schemaReady: Boolean(supabase),
  };

  if (!supabase) return empty;

  const cacheKey = authUserId || '__anon__';
  const now = Date.now();
  const cached = engagementCache.get(cacheKey);
  if (
    !options.forceRefresh &&
    cached &&
    now - cached.fetchedAt < ENGAGEMENT_CACHE_TTL_MS
  ) {
    return cached.data;
  }

  const inflight = engagementInflight.get(cacheKey);
  if (!options.forceRefresh && inflight) {
    return inflight;
  }

  const runFetch = async (): Promise<PortfolioEngagementSnapshot> => {
    try {
      // 1. Prefer Postgres-aggregated engagement summary RPC
      const rpcRes = await supabase!.rpc('get_portfolio_engagement_summary');
      if (!rpcRes.error && Array.isArray(rpcRes.data)) {
        const viewsByPortfolio: Record<string, number> = {};
        const heartsByPortfolio: Record<string, number> = {};
        const commentsByPortfolio: Record<string, number> = {};
        const userLikedIds: Record<string, boolean> = {};

        for (const row of rpcRes.data as {
          portfolio_id: string;
          view_count: number | string;
          heart_count: number | string;
          comment_count: number | string;
          liked_by_me: boolean;
        }[]) {
          const id = String(row.portfolio_id);
          viewsByPortfolio[id] = Number(row.view_count ?? 0);
          heartsByPortfolio[id] = Number(row.heart_count ?? 0);
          commentsByPortfolio[id] = Number(row.comment_count ?? 0);
          if (authUserId && row.liked_by_me) {
            userLikedIds[id] = true;
          }
        }

        const snapshot: PortfolioEngagementSnapshot = {
          viewsByPortfolio,
          heartsByPortfolio,
          commentsByPortfolio,
          userLikedIds,
          schemaReady: true,
        };
        engagementCache.set(cacheKey, { data: snapshot, fetchedAt: Date.now() });
        return snapshot;
      }

      // 2. Fallback to direct table queries if summary RPC is not yet deployed
      const [statsRes, heartsRes, commentsRes] = await Promise.all([
        supabase!.from('portfolio_stats').select('portfolio_id, view_count'),
        supabase!.from('portfolio_hearts').select('portfolio_id, user_id'),
        supabase!.from('portfolio_comments').select('portfolio_id'),
      ]);

      if (statsRes.error || heartsRes.error || commentsRes.error) {
        return { ...empty, schemaReady: false };
      }

      const viewsByPortfolio: Record<string, number> = {};
      for (const row of statsRes.data ?? []) {
        const id = String(row.portfolio_id);
        viewsByPortfolio[id] = Number(row.view_count ?? 0);
      }

      const heartsByPortfolio: Record<string, number> = {};
      const userLikedIds: Record<string, boolean> = {};
      for (const row of heartsRes.data ?? []) {
        const id = String(row.portfolio_id);
        heartsByPortfolio[id] = (heartsByPortfolio[id] ?? 0) + 1;
        if (authUserId && row.user_id === authUserId) {
          userLikedIds[id] = true;
        }
      }

      const commentsByPortfolio: Record<string, number> = {};
      for (const row of commentsRes.data ?? []) {
        const id = String(row.portfolio_id);
        commentsByPortfolio[id] = (commentsByPortfolio[id] ?? 0) + 1;
      }

      const snapshot: PortfolioEngagementSnapshot = {
        viewsByPortfolio,
        heartsByPortfolio,
        commentsByPortfolio,
        userLikedIds,
        schemaReady: true,
      };
      engagementCache.set(cacheKey, { data: snapshot, fetchedAt: Date.now() });
      return snapshot;
    } catch {
      return { ...empty, schemaReady: false };
    } finally {
      engagementInflight.delete(cacheKey);
    }
  };

  const promise = runFetch();
  engagementInflight.set(cacheKey, promise);
  return promise;
}

export async function incrementPortfolioView(
  portfolioId: string,
  viewerKey?: string
): Promise<number | null> {
  if (!supabase || !portfolioId.trim()) return null;

  try {
    const { data, error } = await supabase.rpc('increment_portfolio_view', {
      p_portfolio_id: portfolioId,
      p_viewer_key: viewerKey ?? null,
    });

    if (error) {
      // Fallback gracefully if Supabase SQL hasn't been upgraded to the 2-arg RPC yet
      if (
        error.code === 'PGRST202' ||
        error.message.includes('increment_portfolio_view')
      ) {
        const legacy = await supabase.rpc('increment_portfolio_view', {
          p_portfolio_id: portfolioId,
        });
        if (legacy.error) return null;
        return typeof legacy.data === 'number'
          ? legacy.data
          : Number(legacy.data ?? 0);
      }
      return null;
    }

    return typeof data === 'number' ? data : Number(data ?? 0);
  } catch {
    return null;
  }
}

export async function togglePortfolioHeart(
  portfolioId: string,
  authUserId: string,
  currentlyLiked: boolean
): Promise<{ liked: boolean; error: string | null }> {
  if (!supabase || !authUserId) {
    return { liked: currentlyLiked, error: 'Please sign in to heart portfolios.' };
  }

  if (currentlyLiked) {
    const { error } = await supabase
      .from('portfolio_hearts')
      .delete()
      .eq('portfolio_id', portfolioId)
      .eq('user_id', authUserId);

    if (error) {
      return { liked: currentlyLiked, error: error.message };
    }
    engagementCache.clear();
    return { liked: false, error: null };
  }

  const { error } = await supabase
    .from('portfolio_hearts')
    .insert({ portfolio_id: portfolioId, user_id: authUserId });

  if (error) {
    // Handle duplicate race cleanly as liked
    if (error.code === '23505') {
      engagementCache.clear();
      return { liked: true, error: null };
    }
    return { liked: currentlyLiked, error: error.message };
  }

  engagementCache.clear();
  return { liked: true, error: null };
}

export async function fetchPortfolioComments(
  portfolioId: string
): Promise<{ comments: PortfolioComment[]; error: string | null }> {
  if (!supabase || !portfolioId) {
    return { comments: [], error: null };
  }

  const { data, error } = await supabase
    .from('portfolio_comments')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('created_at', { ascending: false });

  if (error) {
    return { comments: [], error: error.message };
  }

  return { comments: (data as PortfolioComment[]) ?? [], error: null };
}

export async function addPortfolioComment(
  portfolioId: string,
  session: AuthSession,
  body: string,
  parentCommentId?: string | null
): Promise<{ comment: PortfolioComment | null; error: string | null }> {
  if (!supabase || session.mode !== 'authenticated' || !session.authUserId) {
    return { comment: null, error: 'Sign in required to post a comment.' };
  }

  const trimmed = body.trim();
  if (!trimmed) {
    return { comment: null, error: 'Please write a comment before posting.' };
  }

  const basePayload = {
    portfolio_id: portfolioId,
    author_user_id: session.authUserId,
    author_name: session.displayName || 'Class A Member',
    author_username: session.username ?? null,
    author_avatar_url: session.avatarUrl ?? null,
    body: trimmed.slice(0, 1500),
  };

  let { data, error } = await supabase
    .from('portfolio_comments')
    .insert({
      ...basePayload,
      parent_comment_id: parentCommentId ?? null,
    })
    .select('*')
    .single<PortfolioComment>();

  if (
    error &&
    error.message.includes('parent_comment_id') &&
    (error.message.includes('does not exist') || error.message.includes('schema cache'))
  ) {
    if (parentCommentId) {
      return {
        comment: null,
        error:
          'Threaded comment replies require the latest supabase/schema.sql update in Supabase SQL Editor.',
      };
    }
    const retry = await supabase
      .from('portfolio_comments')
      .insert(basePayload)
      .select('*')
      .single<PortfolioComment>();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return { comment: null, error: error.message };
  }

  engagementCache.clear();
  return { comment: data, error: null };
}

export async function deletePortfolioComment(
  commentId: string,
  authUserId: string
): Promise<{ error: string | null }> {
  if (!supabase || !authUserId) {
    return { error: 'Sign in required.' };
  }

  const { error } = await supabase
    .from('portfolio_comments')
    .delete()
    .eq('id', commentId)
    .eq('author_user_id', authUserId);

  if (!error) {
    engagementCache.clear();
  }
  return { error: error ? error.message : null };
}

const VALID_COMMENT_REACTION_SET = new Set<string>(COMMENT_REACTION_EMOJIS);

export async function fetchPortfolioCommentReactions(
  portfolioId: string,
  authUserId?: string
): Promise<{ reactionsByComment: CommentReactionsMap; schemaReady: boolean }> {
  if (!supabase || !portfolioId) {
    return { reactionsByComment: {}, schemaReady: false };
  }

  try {
    const { data, error } = await supabase
      .from('portfolio_comment_reactions')
      .select('comment_id, emoji, user_id')
      .eq('portfolio_id', portfolioId);

    if (error || !data) {
      return { reactionsByComment: {}, schemaReady: false };
    }

    const counts = new Map<
      string,
      Map<CommentReactionEmoji, { count: number; reactedByMe: boolean }>
    >();

    for (const row of data as {
      comment_id: string;
      emoji: string;
      user_id: string;
    }[]) {
      if (!VALID_COMMENT_REACTION_SET.has(row.emoji)) continue;
      const emoji = row.emoji as CommentReactionEmoji;
      let commentMap = counts.get(row.comment_id);
      if (!commentMap) {
        commentMap = new Map();
        counts.set(row.comment_id, commentMap);
      }
      const prev = commentMap.get(emoji) ?? { count: 0, reactedByMe: false };
      commentMap.set(emoji, {
        count: prev.count + 1,
        reactedByMe: prev.reactedByMe || (Boolean(authUserId) && row.user_id === authUserId),
      });
    }

    const reactionsByComment: CommentReactionsMap = {};
    counts.forEach((emojiMap, commentId) => {
      const list: CommentReactionBucket[] = [];
      for (const emoji of COMMENT_REACTION_EMOJIS) {
        const entry = emojiMap.get(emoji);
        if (entry && entry.count > 0) {
          list.push({ emoji, count: entry.count, reactedByMe: entry.reactedByMe });
        }
      }
      if (list.length > 0) {
        reactionsByComment[commentId] = list;
      }
    });

    return { reactionsByComment, schemaReady: true };
  } catch {
    return { reactionsByComment: {}, schemaReady: false };
  }
}

export async function addCommentReaction(
  commentId: string,
  portfolioId: string,
  authUserId: string,
  emoji: CommentReactionEmoji
): Promise<{ reacted: boolean; alreadyReacted?: boolean; error: string | null }> {
  if (!supabase || !authUserId) {
    return { reacted: false, error: 'Sign in required to react to comments.' };
  }

  const { error } = await supabase
    .from('portfolio_comment_reactions')
    .insert({
      comment_id: commentId,
      portfolio_id: portfolioId,
      user_id: authUserId,
      emoji,
    });

  if (error) {
    if (error.code === '23505') {
      return {
        reacted: false,
        alreadyReacted: true,
        error: 'You can only react once to a comment.',
      };
    }
    if (error.message.includes('does not exist')) {
      return {
        reacted: false,
        error:
          'Comment reactions table is not ready yet. Run the latest supabase/schema.sql in Supabase SQL Editor.',
      };
    }
    return { reacted: false, error: error.message };
  }

  return { reacted: true, error: null };
}

export async function searchMentionableUsers(
  query: string,
  localCandidates: MentionableUser[] = [],
  options: { limit?: number } = {}
): Promise<MentionableUser[]> {
  const normalizedQuery = query.trim().replace(/^@+/, '').toLowerCase();
  const maxResults = options.limit ?? 12;
  const byUsername = new Map<string, MentionableUser>();

  for (const candidate of localCandidates) {
    const uname = sanitizeUsername(candidate.username);
    if (!uname) continue;
    const key = uname.toLowerCase();
    const existing = byUsername.get(key);
    byUsername.set(key, {
      username: uname,
      displayName: candidate.displayName || existing?.displayName || uname,
      avatarUrl: candidate.avatarUrl || existing?.avatarUrl,
      portfolioId: candidate.portfolioId || existing?.portfolioId,
    });
  }

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('search_mentionable_users', {
        p_query: normalizedQuery,
      });
      if (!error && Array.isArray(data)) {
        for (const row of data as {
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
        }[]) {
          const uname = sanitizeUsername(row.username ?? '');
          if (!uname) continue;
          const key = uname.toLowerCase();
          const existing = byUsername.get(key);
          byUsername.set(key, {
            username: uname,
            displayName: row.display_name?.trim() || existing?.displayName || uname,
            avatarUrl: row.avatar_url?.trim() || existing?.avatarUrl,
            portfolioId: existing?.portfolioId,
          });
        }
      }
    } catch {
      // Fallback cleanly to localCandidates
    }
  }

  const all = Array.from(byUsername.values());
  const filtered = normalizedQuery
    ? all.filter(
        (u) =>
          u.username.toLowerCase().includes(normalizedQuery) ||
          u.displayName.toLowerCase().includes(normalizedQuery)
      )
    : all;

  return filtered
    .sort((a, b) => {
      if (normalizedQuery) {
        const aPrefix = a.username.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        const bPrefix = b.username.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      }
      return a.username.localeCompare(b.username);
    })
    .slice(0, maxResults);
}

const MENTION_EXTRACT_RE = /@([a-z0-9][a-z0-9._-]{0,31})/gi;

/**
 * Extracts unique `@username` tokens from comment text (ignoring inline code spans
 * and email addresses like name@domain.com).
 */
export function extractMentionHandles(text: string): string[] {
  const withoutCode = text.replace(/`[^`]*`/g, ' ');
  const handles = new Set<string>();
  let match: RegExpExecArray | null;
  MENTION_EXTRACT_RE.lastIndex = 0;

  while ((match = MENTION_EXTRACT_RE.exec(withoutCode)) !== null) {
    const start = match.index;
    const prevChar = start > 0 ? withoutCode[start - 1] : '';
    const isBoundary = start === 0 || /[\s([\]{}"',;:!?]/.test(prevChar);
    if (!isBoundary) continue;
    handles.add(match[1]);
  }

  return Array.from(handles);
}

/**
 * Verifies that every mentioned `@username` corresponds to a real existing user.
 */
export async function validateMentionedUsernames(
  handles: string[],
  knownExistingLowercase: Set<string>
): Promise<{ invalidHandles: string[]; verifiedUsers: MentionableUser[] }> {
  if (handles.length === 0) {
    return { invalidHandles: [], verifiedUsers: [] };
  }

  const resolvedLower = new Set<string>(knownExistingLowercase);
  const verifiedUsers: MentionableUser[] = [];
  const missing = handles.filter((h) => !resolvedLower.has(h.toLowerCase()));

  if (missing.length > 0 && supabase) {
    try {
      const rpcRes = await supabase.rpc('check_mentionable_usernames', {
        p_usernames: missing,
      });

      if (!rpcRes.error && Array.isArray(rpcRes.data)) {
        for (const row of rpcRes.data as {
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
        }[]) {
          const uname = sanitizeUsername(row.username ?? '');
          if (!uname) continue;
          resolvedLower.add(uname.toLowerCase());
          verifiedUsers.push({
            username: uname,
            displayName: row.display_name?.trim() || uname,
            avatarUrl: row.avatar_url?.trim() || undefined,
          });
        }
      } else {
        // Fallback when check_mentionable_usernames RPC hasn't been deployed yet
        await Promise.all(
          missing.map(async (h) => {
            const matches = await searchMentionableUsers(h, [], { limit: 25 });
            for (const m of matches) {
              if (m.username.toLowerCase() === h.toLowerCase()) {
                resolvedLower.add(m.username.toLowerCase());
                verifiedUsers.push(m);
              }
            }
          })
        );
      }
    } catch {
      // Keep local knownExistingLowercase set
    }
  }

  const invalidHandles = handles.filter((h) => !resolvedLower.has(h.toLowerCase()));
  return { invalidHandles, verifiedUsers };
}

