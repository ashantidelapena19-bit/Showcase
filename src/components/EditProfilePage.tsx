import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  CheckCircle2,
  Code2,
  Eye,
  EyeOff,
  FileCode2,
  FolderGit2,
  FolderUp,
  GitBranch,
  Globe,
  ImagePlus,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Monitor,
  Play,
  Presentation,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  UserCog,
  X,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  type Discipline,
  type PortfolioSourceType,
  type PortfolioThumbnailMode,
} from '../data/portfolios';
import {
  extractGitHubUsername,
  fetchGitHubUserRepos,
  type GitHubRepoInspection,
  type GitHubRepoSummary,
  importGitHubRepoBundle,
  inspectGitHubRepo,
  parseGitHubRepoTarget,
  suggestPortfolioMetaFromRepo,
} from '../lib/githubPortfolio';
import {
  type BundleProgressInfo,
  compileAndUploadPortfolioBundle,
  compileLocalPreviewHtml,
  extractPortfolioFiles,
  readDroppedDataTransferFiles,
  type StagedUploadFile,
  type UploadedPortfolioFile,
} from '../lib/portfolioBundle';
import {
  isBlockedMixedContentUrl,
  sanitizePortfolioUrl,
} from '../lib/portfolioUrl';
import {
  type AuthSession,
  deleteUserPortfolio,
  fetchMyFullProfile,
  fetchMyPortfolios,
  sanitizeUsername,
  saveUserPortfolio,
  saveUserProfileAndPortfolio,
  setUserPortfolioPublished,
  uploadProfileMedia,
  type UserPortfolioRecord,
} from '../lib/supabase';
import {
  canonicalizeSkillName,
  detectTechFromUploadedFiles,
  TECH_SKILL_PRESETS,
} from '../lib/techStack';
import { SmoothScrollArea } from './AntigravityScrollProvider';
import { PortfolioThumbnailMedia } from './PortfolioThumbnailMedia';
import {
  SOCIAL_PLATFORM_FIELDS,
  type SocialLinks,
  SocialLinksBar,
  SocialPlatformIcon,
} from './SocialLinksBar';
import { TechLogo } from './TechLogo';

interface EditProfilePageProps {
  session: AuthSession | null;
  initialTab?: 'portfolios' | 'profile';
  onProfileSaved: (updated: {
    displayName: string;
    username?: string;
    avatarUrl?: string;
    portfolioUrl?: string;
    needsProfileSetup?: boolean;
  }) => void;
  onRefreshGalleryPortfolios: () => Promise<void>;
  onNavigateGallery: () => void;
  onNavigateLogin: () => void;
  onReviewPortfolio?: (portfolioId: string) => void;
  onSwitchAccount: () => Promise<void>;
  onLogout: () => Promise<void>;
}

const ANTIGRAVITY_EASE = [0.22, 1, 0.36, 1] as const;

const DISCIPLINE_OPTIONS: Exclude<Discipline, 'All'>[] = [
  'Full-Stack',
  'Systems & CLI',
  'UI / Design',
  'AI & Data',
  'Mobile & WebGL',
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const EditProfilePage: React.FC<EditProfilePageProps> = ({
  session,
  initialTab = 'portfolios',
  onProfileSaved,
  onRefreshGalleryPortfolios,
  onNavigateGallery,
  onNavigateLogin,
  onReviewPortfolio,
  onSwitchAccount,
  onLogout,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const isAuthenticated = session?.mode === 'authenticated';
  const bundleAbortRef = useRef<AbortController | null>(null);
  const pendingBundlePromiseRef = useRef<Promise<{
    compiledHtml: string;
    manifest: UploadedPortfolioFile[];
  } | null> | null>(null);
  const cachedMediaUrlsRef = useRef<Map<string, string>>(new Map());
  const revokePreviewUrlsRef = useRef<(() => void) | null>(null);

  const setFolderInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      node.setAttribute('webkitdirectory', '');
      node.setAttribute('directory', '');
    }
  }, []);

  const [studioTab, setStudioTab] = useState<'portfolios' | 'profile'>(initialTab);
  const [loading, setLoading] = useState(Boolean(isAuthenticated));
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPortfolio, setSavingPortfolio] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [processingBundle, setProcessingBundle] = useState(false);
  const [bundleProgress, setBundleProgress] = useState<BundleProgressInfo | null>(null);
  const [isDraggingSite, setIsDraggingSite] = useState(false);

  // Profile Identity State
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(session?.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(session?.avatarUrl ?? '');
  const [bio, setBio] = useState('');
  const [roleTitle, setRoleTitle] = useState('Software Engineering Student');
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({
    email: session?.email ?? '',
  });
  const [legacyPublishedFlag, setLegacyPublishedFlag] = useState(false);

  // User Uploaded Portfolios State
  const [myPortfolios, setMyPortfolios] = useState<UserPortfolioRecord[]>([]);
  const [portfoliosSchemaWarning, setPortfoliosSchemaWarning] = useState<string | null>(null);
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Active Portfolio Form State
  const [portfolioTitle, setPortfolioTitle] = useState('');
  const [discipline, setDiscipline] =
    useState<Exclude<Discipline, 'All'>>('Full-Stack');
  const [portfolioSummary, setPortfolioSummary] = useState('');
  const [thumbnailMode, setThumbnailMode] =
    useState<PortfolioThumbnailMode>('image');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [sourceMode, setSourceMode] = useState<PortfolioSourceType | 'github'>('upload');
  const [sourceType, setSourceType] = useState<PortfolioSourceType>('upload');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [portfolioHtml, setPortfolioHtml] = useState('');
  const [localPreviewHtml, setLocalPreviewHtml] = useState('');
  const [entryFile, setEntryFile] = useState('index.html');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedPortfolioFile[]>([]);
  const [stagedFiles, setStagedFiles] = useState<StagedUploadFile[]>([]);
  const [entryCandidates, setEntryCandidates] = useState<string[]>([]);
  const [showRawHtmlEditor, setShowRawHtmlEditor] = useState(false);
  const [showUrlPreview, setShowUrlPreview] = useState(false);
  const [skillsText, setSkillsText] = useState('TypeScript, React, Tailwind CSS');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [highlightDraft, setHighlightDraft] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  // GitHub Repo Importer State (token stays strictly in-memory for the active session)
  const [githubRepoInput, setGithubRepoInput] = useState('');
  const [githubUsernameInput, setGithubUsernameInput] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [showGithubTokenInput, setShowGithubTokenInput] = useState(false);
  const [githubRepos, setGithubRepos] = useState<GitHubRepoSummary[]>([]);
  const [githubRepoFilter, setGithubRepoFilter] = useState('');
  const [loadingGithubRepos, setLoadingGithubRepos] = useState(false);
  const [inspectingGithubRepo, setInspectingGithubRepo] = useState(false);
  const [importingGithubBundle, setImportingGithubBundle] = useState(false);
  const [githubInspection, setGithubInspection] =
    useState<GitHubRepoInspection | null>(null);
  const [selectedGithubEntry, setSelectedGithubEntry] = useState('');
  const [importedGithubRepoLabel, setImportedGithubRepoLabel] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [savedPortfolioIdForReview, setSavedPortfolioIdForReview] = useState<string | null>(null);

  useEffect(() => {
    setStudioTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    return () => {
      bundleAbortRef.current?.abort();
      revokePreviewUrlsRef.current?.();
    };
  }, []);

  const loadPortfolioIntoForm = useCallback((record: UserPortfolioRecord) => {
    const resolvedType = record.source_type ?? 'upload';
    setEditingPortfolioId(record.id);
    setPortfolioTitle(record.title ?? '');
    setDiscipline(
      DISCIPLINE_OPTIONS.includes(record.discipline as Exclude<Discipline, 'All'>)
        ? (record.discipline as Exclude<Discipline, 'All'>)
        : 'Full-Stack'
    );
    setPortfolioSummary(record.summary ?? '');
    const resolvedThumbnailMode: PortfolioThumbnailMode =
      record.thumbnail_mode === 'homepage' ||
      record.thumbnail_mode === 'image' ||
      record.thumbnail_mode === 'live'
        ? record.thumbnail_mode
        : record.cover_image_url?.trim()
          ? 'image'
          : resolvedType === 'upload' || Boolean(record.portfolio_url?.trim())
            ? 'homepage'
            : 'image';
    setThumbnailMode(resolvedThumbnailMode);
    setCoverImageUrl(record.cover_image_url ?? '');
    setSourceType(resolvedType);
    setSourceMode(resolvedType);
    setPortfolioUrl(record.portfolio_url ?? '');
    setPortfolioHtml(record.portfolio_html ?? '');
    setEntryFile(record.entry_file ?? 'index.html');
    setUploadedFiles(Array.isArray(record.uploaded_files) ? record.uploaded_files : []);
    setStagedFiles([]);
    setEntryCandidates([]);
    setShowRawHtmlEditor(false);
    setGithubInspection(null);
    setImportedGithubRepoLabel(null);
    setSkillsText(
      Array.isArray(record.skills) && record.skills.length > 0
        ? record.skills.join(', ')
        : 'TypeScript, React, Tailwind CSS'
    );
    setHighlights(Array.isArray(record.highlights) ? record.highlights : []);
    setIsPublished(Boolean(record.is_published));
    setSavedPortfolioIdForReview(`portfolio-${record.id}`);
    setErrorMsg(null);
    setSuccessMsg(null);
  }, []);

  const resetPortfolioForm = useCallback(() => {
    setEditingPortfolioId(null);
    setPortfolioTitle('');
    setDiscipline('Full-Stack');
    setPortfolioSummary('');
    setThumbnailMode('image');
    setCoverImageUrl('');
    setSourceType('upload');
    setSourceMode('upload');
    setPortfolioUrl('');
    setPortfolioHtml('');
    setEntryFile('index.html');
    setUploadedFiles([]);
    setStagedFiles([]);
    setEntryCandidates([]);
    setShowRawHtmlEditor(false);
    setGithubInspection(null);
    setSelectedGithubEntry('');
    setImportedGithubRepoLabel(null);
    setSkillsText('TypeScript, React, Tailwind CSS');
    setHighlights([]);
    setHighlightDraft('');
    setIsPublished(false);
    setSavedPortfolioIdForReview(null);
    setErrorMsg(null);
    setSuccessMsg(null);
  }, []);

  useEffect(() => {
    if (!session || session.mode !== 'authenticated') {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setErrorMsg(null);

    void Promise.all([
      fetchMyFullProfile(session),
      fetchMyPortfolios(session),
    ]).then(([profileRes, portfoliosRes]) => {
      if (!mounted) return;

      if (profileRes.error && !profileRes.profile) {
        setErrorMsg(
          'Could not load saved profile fields yet. Run the latest supabase/schema.sql in Supabase SQL Editor.'
        );
      }
      if (profileRes.profile) {
        const p = profileRes.profile;
        setUsername(p.username ?? '');
        setDisplayName(p.display_name || session.displayName);
        setAvatarUrl(p.avatar_url ?? session.avatarUrl ?? '');
        setBio(p.bio ?? '');
        setRoleTitle(p.role_title || 'Software Engineering Student');
        setSocialLinks({
          email: session.email,
          ...(p.social_links ?? {}),
        });
        if (p.social_links?.github) {
          const ghUser = extractGitHubUsername(p.social_links.github);
          if (ghUser) {
            setGithubUsernameInput((prev) => prev || ghUser);
          }
        }
        setLegacyPublishedFlag(Boolean(p.is_published));
      } else {
        setDisplayName(session.displayName);
        setAvatarUrl(session.avatarUrl ?? '');
        setSocialLinks({ email: session.email });
      }

      if (portfoliosRes.error) {
        setPortfoliosSchemaWarning(
          portfoliosRes.error.includes('does not exist')
            ? 'Run the updated supabase/schema.sql in Supabase SQL Editor to enable portfolio website uploads.'
            : portfoliosRes.error
        );
      } else {
        setPortfoliosSchemaWarning(null);
        setMyPortfolios(portfoliosRes.portfolios);
        if (portfoliosRes.portfolios.length > 0) {
          loadPortfolioIntoForm(portfoliosRes.portfolios[0]);
        } else if (profileRes.profile && (profileRes.profile.project_title || profileRes.profile.portfolio_url)) {
          setPortfolioTitle(profileRes.profile.project_title ?? '');
          setPortfolioSummary(profileRes.profile.project_summary ?? '');
          setCoverImageUrl(profileRes.profile.cover_image_url ?? '');
          setThumbnailMode(
            profileRes.profile.cover_image_url?.trim()
              ? 'image'
              : profileRes.profile.portfolio_url?.trim()
                ? 'homepage'
                : 'image'
          );
          if (profileRes.profile.portfolio_url) {
            setSourceType('url');
            setSourceMode('url');
            setPortfolioUrl(profileRes.profile.portfolio_url);
          }
          if (Array.isArray(profileRes.profile.skills) && profileRes.profile.skills.length > 0) {
            setSkillsText(profileRes.profile.skills.join(', '));
          }
          if (Array.isArray(profileRes.profile.highlights)) {
            setHighlights(profileRes.profile.highlights);
          }
        }
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [session?.email, session?.mode, loadPortfolioIntoForm]);

  const parsedSkills = skillsText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const togglePresetSkill = (skillName: string) => {
    const exists = parsedSkills.some(
      (s) => s.toLowerCase() === skillName.toLowerCase()
    );
    const next = exists
      ? parsedSkills.filter((s) => s.toLowerCase() !== skillName.toLowerCase())
      : [...parsedSkills, skillName];
    setSkillsText(next.join(', '));
  };

  const handleAddHighlight = () => {
    const clean = highlightDraft.trim();
    if (!clean) return;
    if (!highlights.includes(clean)) {
      setHighlights((prev) => [...prev, clean].slice(0, 6));
    }
    setHighlightDraft('');
  };

  const handleMediaUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'avatar' | 'cover'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !session?.authUserId) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    if (kind === 'avatar') setUploadingAvatar(true);
    else setUploadingCover(true);

    try {
      const { url } = await uploadProfileMedia(file, kind, session.authUserId);
      if (kind === 'avatar') {
        setAvatarUrl(url);
      } else {
        setCoverImageUrl(url);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to process image upload.'
      );
    } finally {
      if (kind === 'avatar') setUploadingAvatar(false);
      else setUploadingCover(false);
      e.target.value = '';
    }
  };

  const cancelBundleProcessing = useCallback(() => {
    bundleAbortRef.current?.abort();
    bundleAbortRef.current = null;
    pendingBundlePromiseRef.current = null;
    setProcessingBundle(false);
    setBundleProgress(null);
  }, []);

  const processSiteFiles = async (fileList: FileList | File[]) => {
    if (!session?.authUserId || fileList.length === 0) return;

    bundleAbortRef.current?.abort();
    revokePreviewUrlsRef.current?.();
    revokePreviewUrlsRef.current = null;
    cachedMediaUrlsRef.current = new Map();

    const controller = new AbortController();
    bundleAbortRef.current = controller;

    setErrorMsg(null);
    setSuccessMsg(null);
    setProcessingBundle(true);
    setBundleProgress({
      phase: 'extracting',
      completed: 0,
      total: fileList.length,
    });

    try {
      const extracted = await extractPortfolioFiles(fileList, {
        signal: controller.signal,
        onProgress: (info) => {
          if (!controller.signal.aborted) {
            setBundleProgress(info);
          }
        },
      });
      if (controller.signal.aborted) return;

      // Build an instant local preview before uploading media so the UI stays responsive
      const localPreview = compileLocalPreviewHtml(
        extracted.files,
        extracted.recommendedEntry
      );
      revokePreviewUrlsRef.current = localPreview.revokeUrls;

      setStagedFiles(extracted.files);
      setEntryCandidates(extracted.entryCandidates);
      setEntryFile(extracted.recommendedEntry);
      setLocalPreviewHtml(localPreview.previewHtml);
      setPortfolioHtml('');
      setUploadedFiles(localPreview.manifest);
      setSourceType('upload');
      setSourceMode('upload');
      setImportedGithubRepoLabel(null);

      if (!portfolioTitle.trim()) {
        const titleMatch = localPreview.previewHtml.match(
          /<title[^>]*>([^<]+)<\/title>/i
        );
        if (titleMatch?.[1]?.trim()) {
          setPortfolioTitle(titleMatch[1].trim().slice(0, 80));
        }
      }

      if (
        !skillsText.trim() ||
        skillsText.trim() === 'TypeScript, React, Tailwind CSS'
      ) {
        const detectedSkills = detectTechFromUploadedFiles(extracted.files);
        if (detectedSkills.length > 0) {
          setSkillsText(detectedSkills.join(', '));
        }
      }

      const uploadTask = (async () => {
        const compiled = await compileAndUploadPortfolioBundle(
          extracted.files,
          extracted.recommendedEntry,
          session.authUserId!,
          {
            signal: controller.signal,
            onProgress: (info) => {
              if (!controller.signal.aborted) {
                setBundleProgress(info);
              }
            },
          }
        );
        if (controller.signal.aborted) return null;

        cachedMediaUrlsRef.current = compiled.mediaUrlByPath;
        setPortfolioHtml(compiled.compiledHtml);
        setUploadedFiles(compiled.manifest);
        setLocalPreviewHtml('');
        revokePreviewUrlsRef.current?.();
        revokePreviewUrlsRef.current = null;

        const allWarnings = [...extracted.warnings, ...compiled.warnings];
        setSuccessMsg(
          `Ready: ${compiled.manifest.length} file${compiled.manifest.length === 1 ? '' : 's'} compiled with entry "${extracted.recommendedEntry}".${allWarnings.length > 0 ? ` (${allWarnings[0]})` : ''}`
        );

        return {
          compiledHtml: compiled.compiledHtml,
          manifest: compiled.manifest,
        };
      })();

      pendingBundlePromiseRef.current = uploadTask;
      await uploadTask;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to process portfolio files.'
      );
    } finally {
      if (bundleAbortRef.current === controller) {
        bundleAbortRef.current = null;
        pendingBundlePromiseRef.current = null;
        setProcessingBundle(false);
        setBundleProgress(null);
      }
    }
  };

  const handleEntryFileChange = async (nextEntry: string) => {
    setEntryFile(nextEntry);
    if (stagedFiles.length === 0 || !session?.authUserId) return;
    setProcessingBundle(true);
    setErrorMsg(null);
    try {
      const compiled = await compileAndUploadPortfolioBundle(
        stagedFiles,
        nextEntry,
        session.authUserId,
        {
          cachedMediaUrls: cachedMediaUrlsRef.current,
          onProgress: setBundleProgress,
        }
      );
      cachedMediaUrlsRef.current = compiled.mediaUrlByPath;
      setPortfolioHtml(compiled.compiledHtml);
      setUploadedFiles(compiled.manifest);
      setLocalPreviewHtml('');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not switch entry HTML file.'
      );
    } finally {
      setProcessingBundle(false);
      setBundleProgress(null);
    }
  };

  const handleLoadGitHubRepos = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadingGithubRepos(true);
    try {
      const repos = await fetchGitHubUserRepos(
        githubUsernameInput,
        githubToken || undefined
      );
      setGithubRepos(repos);
      if (repos.length === 0) {
        setErrorMsg('No repositories found for that GitHub account.');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not fetch GitHub repositories.'
      );
    } finally {
      setLoadingGithubRepos(false);
    }
  };

  const handleInspectGitHubRepo = async (
    rawInputOrRepo: string | GitHubRepoSummary,
    overrideBranch?: string
  ) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const target =
      typeof rawInputOrRepo === 'string'
        ? parseGitHubRepoTarget(rawInputOrRepo)
        : {
            owner: rawInputOrRepo.owner,
            repo: rawInputOrRepo.name,
            branch: overrideBranch || rawInputOrRepo.defaultBranch,
          };

    if (!target) {
      setErrorMsg(
        'Enter a valid GitHub repository URL or owner/repo (for example: octocat/portfolio).'
      );
      return;
    }

    if (overrideBranch) {
      target.branch = overrideBranch;
    }

    if (typeof rawInputOrRepo !== 'string') {
      setGithubRepoInput(rawInputOrRepo.htmlUrl);
    }

    setInspectingGithubRepo(true);
    try {
      const inspection = await inspectGitHubRepo(target, githubToken || undefined);
      setGithubInspection(inspection);
      setSelectedGithubEntry(inspection.recommendedEntry ?? '');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not inspect GitHub repository.'
      );
    } finally {
      setInspectingGithubRepo(false);
    }
  };

  const applyGitHubRepoMetadata = (repo: GitHubRepoSummary, htmlTitle?: string) => {
    const suggested = suggestPortfolioMetaFromRepo(repo);
    if (!portfolioTitle.trim()) {
      setPortfolioTitle((htmlTitle || suggested.title).slice(0, 80));
    }
    if (!portfolioSummary.trim()) {
      setPortfolioSummary(suggested.summary);
    }
    setDiscipline(suggested.discipline);
    if (
      !skillsText.trim() ||
      skillsText.trim() === 'TypeScript, React, Tailwind CSS'
    ) {
      setSkillsText(suggested.skills.join(', '));
    }
    if (!socialLinks.github?.trim()) {
      setSocialLinks((prev) => ({
        ...prev,
        github: `https://github.com/${repo.owner}`,
      }));
    }
  };

  const handleImportGitHubStaticBundle = async () => {
    if (!githubInspection || !selectedGithubEntry || !session?.authUserId) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setImportingGithubBundle(true);

    try {
      const imported = await importGitHubRepoBundle(
        {
          repo: githubInspection.repo,
          branch: githubInspection.branch,
          entryPath: selectedGithubEntry,
          treeBlobs: githubInspection.treeBlobs,
          token: githubToken || undefined,
        },
        session.authUserId
      );

      setPortfolioHtml(imported.compiledHtml);
      setUploadedFiles(imported.manifest);
      setEntryFile(imported.entryFile);
      setSourceType('upload');
      setImportedGithubRepoLabel(
        `${githubInspection.repo.fullName}@${githubInspection.branch}`
      );

      const titleMatch = imported.compiledHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
      applyGitHubRepoMetadata(githubInspection.repo, titleMatch?.[1]?.trim());

      setSuccessMsg(
        `Imported ${imported.manifest.length} file${imported.manifest.length === 1 ? '' : 's'} from ${githubInspection.repo.fullName} (${githubInspection.branch}). Preview it below, then Save & Publish.${imported.warnings.length > 0 ? ` (${imported.warnings[0]})` : ''}`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to import static site files from GitHub.'
      );
    } finally {
      setImportingGithubBundle(false);
    }
  };

  const handleUseGitHubLiveUrl = (repo: GitHubRepoSummary, liveUrl: string) => {
    setErrorMsg(null);
    setPortfolioUrl(liveUrl);
    setSourceType('url');
    setSourceMode('url');
    applyGitHubRepoMetadata(repo);
    setSuccessMsg(
      `Linked live deployment URL from ${repo.fullName}. Review your card details below, then Save & Publish.`
    );
  };

  const handleSaveProfileIdentity = async () => {
    if (!session || session.mode !== 'authenticated') return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!displayName.trim()) {
      setErrorMsg('Please enter a display name for your profile.');
      return;
    }

    setSavingProfile(true);
    try {
      const effectiveSkills =
        parsedSkills.length > 0 ? parsedSkills : ['TypeScript', 'React'];
      const hasUsername = Boolean(sanitizeUsername(username));
      const { profile, error } = await saveUserProfileAndPortfolio(session, {
        username,
        displayName,
        avatarUrl,
        bio,
        roleTitle,
        discipline,
        projectTitle: portfolioTitle.trim() || `${displayName.trim()} Portfolio`,
        projectSummary:
          portfolioSummary.trim() ||
          bio.trim() ||
          'Software Engineering portfolio and featured work.',
        coverImageUrl,
        portfolioUrl: sourceType === 'url' ? portfolioUrl : '',
        skills: effectiveSkills,
        highlights:
          highlights.length > 0
            ? highlights
            : [roleTitle.trim() || 'Software Engineering Student'],
        socialLinks,
        isPublished: legacyPublishedFlag,
        onboardingCompleted: hasUsername,
      });

      if (error || !profile) {
        setErrorMsg(error ?? 'Could not save your profile.');
        return;
      }

      setUsername(profile.username ?? '');
      onProfileSaved({
        displayName: profile.display_name,
        username: profile.username ?? undefined,
        avatarUrl: profile.avatar_url ?? undefined,
        portfolioUrl: profile.portfolio_url ?? undefined,
        needsProfileSetup: !(profile.onboarding_completed || Boolean(profile.username?.trim())),
      });
      await onRefreshGalleryPortfolios();
      setSuccessMsg('Profile identity and social links saved.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePortfolio = async (publishState: boolean) => {
    if (!session || session.mode !== 'authenticated') return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (!portfolioTitle.trim()) {
      setErrorMsg('Give your portfolio a title before saving.');
      return;
    }

    let normalizedPortfolioUrl = '';
    if (sourceType === 'url') {
      normalizedPortfolioUrl = sanitizePortfolioUrl(portfolioUrl);
      if (!normalizedPortfolioUrl) {
        setErrorMsg(
          'Enter a valid website URL (for example, https://your-portfolio.vercel.app).'
        );
        return;
      }
      if (normalizedPortfolioUrl !== portfolioUrl) {
        setPortfolioUrl(normalizedPortfolioUrl);
      }
    }

    setSavingPortfolio(true);
    try {
      let resolvedHtml = portfolioHtml;
      let resolvedFiles = uploadedFiles;

      if (sourceType === 'upload' && pendingBundlePromiseRef.current) {
        const finalized = await pendingBundlePromiseRef.current;
        if (finalized) {
          resolvedHtml = finalized.compiledHtml;
          resolvedFiles = finalized.manifest;
        }
      }

      if (sourceType === 'upload' && !resolvedHtml.trim()) {
        if (stagedFiles.length > 0 && session.authUserId) {
          const compiled = await compileAndUploadPortfolioBundle(
            stagedFiles,
            entryFile,
            session.authUserId,
            {
              cachedMediaUrls: cachedMediaUrlsRef.current,
              onProgress: setBundleProgress,
            }
          );
          cachedMediaUrlsRef.current = compiled.mediaUrlByPath;
          resolvedHtml = compiled.compiledHtml;
          resolvedFiles = compiled.manifest;
          setPortfolioHtml(resolvedHtml);
          setUploadedFiles(resolvedFiles);
          setLocalPreviewHtml('');
        } else {
          setErrorMsg(
            sourceMode === 'github'
              ? 'Inspect a GitHub repository and click "Import Static Site from GitHub" (or use its GitHub Pages / Live URL) before saving.'
              : 'Upload your portfolio files (.zip, folder, or index.html) or paste HTML before saving in Upload Website mode.'
          );
          return;
        }
      }

      const targetPortfolioId = editingPortfolioId ?? myPortfolios[0]?.id;

      // Sync profile identity and save portfolio concurrently (distinct tables)
      const [, saveResult] = await Promise.all([
        saveUserProfileAndPortfolio(session, {
          username,
          displayName: displayName.trim() || session.displayName,
          avatarUrl,
          bio,
          roleTitle,
          discipline,
          projectTitle: portfolioTitle.trim(),
          projectSummary: portfolioSummary.trim() || bio.trim(),
          coverImageUrl,
          portfolioUrl: sourceType === 'url' ? normalizedPortfolioUrl : '',
          skills: parsedSkills.length > 0 ? parsedSkills : ['TypeScript', 'React'],
          highlights,
          socialLinks,
          isPublished: legacyPublishedFlag,
        }),
        saveUserPortfolio(session, {
          id: targetPortfolioId,
          title: portfolioTitle,
          discipline,
          summary:
            portfolioSummary.trim() ||
            bio.trim() ||
            'Uploaded Software Engineering portfolio showcasing projects and code.',
          thumbnailMode,
          coverImageUrl,
          sourceType,
          portfolioUrl: sourceType === 'url' ? normalizedPortfolioUrl : '',
          portfolioHtml: resolvedHtml,
          entryFile,
          uploadedFiles: resolvedFiles,
          skills: parsedSkills.length > 0 ? parsedSkills : ['TypeScript', 'React'],
          highlights:
            highlights.length > 0
              ? highlights
              : [roleTitle.trim() || 'Software Engineering Student'],
          isPublished: publishState,
        }),
      ]);

      const { portfolio, error } = saveResult;

      if (error || !portfolio) {
        setErrorMsg(error ?? 'Could not save portfolio.');
        return;
      }

      setEditingPortfolioId(portfolio.id);
      setIsPublished(Boolean(portfolio.is_published));
      setSavedPortfolioIdForReview(`portfolio-${portfolio.id}`);

      setMyPortfolios((prev) => {
        const exists = prev.some((item) => item.id === portfolio.id);
        return exists
          ? prev.map((item) => (item.id === portfolio.id ? portfolio : item))
          : [portfolio, ...prev];
      });

      const savedUsername = sanitizeUsername(username) || undefined;
      onProfileSaved({
        displayName: displayName.trim() || session.displayName,
        username: savedUsername,
        avatarUrl: avatarUrl || undefined,
        portfolioUrl:
          sourceType === 'url' ? normalizedPortfolioUrl || undefined : undefined,
        needsProfileSetup: savedUsername ? false : session.needsProfileSetup,
      });
      await onRefreshGalleryPortfolios();

      setSuccessMsg(
        publishState
          ? `"${portfolio.title}" is now published in the Gallery and ready for Review Studio.`
          : `"${portfolio.title}" saved as a private draft.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to save your portfolio right now.'
      );
    } finally {
      setSavingPortfolio(false);
    }
  };

  const handleTogglePublishedFromList = async (item: UserPortfolioRecord) => {
    if (!session?.authUserId) return;
    setErrorMsg(null);
    const nextState = !item.is_published;
    const { portfolio, error } = await setUserPortfolioPublished(
      item.id,
      session.authUserId,
      nextState
    );
    if (error || !portfolio) {
      setErrorMsg(error ?? 'Unable to update publish status.');
      return;
    }
    setMyPortfolios((prev) =>
      prev.map((row) => (row.id === portfolio.id ? portfolio : row))
    );
    if (editingPortfolioId === portfolio.id) {
      setIsPublished(Boolean(portfolio.is_published));
    }
    await onRefreshGalleryPortfolios();
  };

  const handleDeletePortfolioFromList = async (portfolioId: string) => {
    if (!session?.authUserId) return;
    const { error } = await deleteUserPortfolio(portfolioId, session.authUserId);
    setConfirmDeleteId(null);
    if (error) {
      setErrorMsg(error);
      return;
    }
    const remaining = myPortfolios.filter((p) => p.id !== portfolioId);
    setMyPortfolios(remaining);
    if (editingPortfolioId === portfolioId) {
      if (remaining.length > 0) {
        loadPortfolioIntoForm(remaining[0]);
      } else {
        resetPortfolioForm();
      }
    }
    await onRefreshGalleryPortfolios();
    setSuccessMsg('Portfolio deleted.');
  };

  const previewName = displayName.trim() || session?.displayName || 'Your Name';
  const previewInitials =
    previewName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'SE';

  return (
    <div className="min-h-screen bg-[var(--p-bg)] text-[var(--p-ink)] flex flex-col transition-colors duration-200">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[var(--p-header-bg)] backdrop-blur-md border-b border-[var(--p-border)]">
        <div className="max-w-[1360px] mx-auto px-6 md:px-10 h-[72px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigateGallery();
              }}
              className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--p-ink-secondary)] hover:text-[var(--p-ink)] transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Gallery</span>
            </a>
            <span className="text-[var(--p-border-strong)] hidden sm:inline">/</span>
            <span className="text-[15px] font-bold text-[var(--p-ink)] truncate hidden sm:inline">
              Portfolio Upload &amp; Profile Studio
            </span>
          </div>

          {isAuthenticated && (
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => void onSwitchAccount()}
                className="px-3.5 py-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[13px] font-medium text-[var(--p-ink)] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[var(--p-muted)]" />
                <span className="hidden sm:inline">Switch Account</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  void onLogout().then(() => onNavigateGallery());
                }}
                className="px-3.5 py-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[13px] font-medium text-[var(--p-ink)] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5 text-[var(--p-muted)]" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 md:px-10 py-10 md:py-12">
        {!isAuthenticated ? (
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ANTIGRAVITY_EASE }}
            className="max-w-lg mx-auto my-12 p-8 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-center space-y-5"
          >
            <h1 className="text-[24px] font-bold tracking-tight text-[var(--p-ink)] text-balance">
              Sign in to Upload &amp; Publish Your Portfolio
            </h1>
            <p className="text-[14px] text-[var(--p-muted)] leading-relaxed">
              {session?.mode === 'guest'
                ? 'You are currently browsing in Guest Mode. Sign in with an account to upload your portfolio website, manage drafts, and publish to the Gallery.'
                : 'Sign in with your account to upload your portfolio website files, link a live deployment, and customize your public profile.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={onNavigateLogin}
                className="h-11 px-6 rounded-lg bg-[var(--p-action)] text-[var(--p-action-ink)] text-[14px] font-semibold hover:bg-[var(--p-action-hover)] transition-colors cursor-pointer"
              >
                Go to Sign In
              </button>
              <button
                type="button"
                onClick={onNavigateGallery}
                className="h-11 px-6 rounded-lg border border-[var(--p-border)] text-[var(--p-ink)] text-[14px] font-medium hover:bg-[var(--p-surface)] transition-colors cursor-pointer"
              >
                Back to Gallery
              </button>
            </div>
          </motion.div>
        ) : loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--p-accent)]" />
            <p className="text-[14px] text-[var(--p-muted)]">
              Loading your portfolio studio...
            </p>
          </div>
        ) : (
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: ANTIGRAVITY_EASE }}
            className="space-y-8"
          >
            {/* Studio Header & Mode Switcher */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
              <div>
                <p className="text-[13px] font-medium text-[var(--p-muted)] mb-1.5">
                  Creator Studio · {session.email}
                </p>
                <h1 className="text-[clamp(1.85rem,3vw,2.5rem)] font-bold tracking-tight leading-[1.12] text-[var(--p-ink)] text-balance">
                  Upload &amp; manage your{' '}
                  <span className="font-[family-name:var(--font-serif-editorial)] italic font-medium">
                    portfolio
                  </span>
                </h1>
              </div>

              {/* Studio Section Tabs */}
              <div
                role="tablist"
                aria-label="Studio sections"
                className="inline-flex items-center gap-1 p-1 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] self-start lg:self-auto"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={studioTab === 'portfolios'}
                  onClick={() => {
                    setStudioTab('portfolios');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className={`h-9 px-4 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                    studioTab === 'portfolios'
                      ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] border border-[var(--p-border)] shadow-xs'
                      : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>My Portfolio ({myPortfolios.length > 0 ? '1/1' : '0/1'})</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={studioTab === 'profile'}
                  onClick={() => {
                    setStudioTab('profile');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className={`h-9 px-4 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                    studioTab === 'profile'
                      ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] border border-[var(--p-border)] shadow-xs'
                      : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                  }`}
                >
                  <UserCog className="w-3.5 h-3.5" />
                  <span>Profile &amp; Socials</span>
                </button>
              </div>
            </div>

            {portfoliosSchemaWarning && (
              <div
                role="alert"
                className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-[13px] text-[var(--p-ink)] leading-relaxed"
              >
                {portfoliosSchemaWarning}
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="p-4 rounded-xl border border-red-600/40 bg-red-500/10 text-[13px] text-red-700 dark:text-red-300 leading-relaxed"
              >
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                className="p-4 rounded-xl border border-emerald-600/35 bg-emerald-500/10 text-[13px] text-[var(--p-ink)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savedPortfolioIdForReview && onReviewPortfolio && (
                    <button
                      type="button"
                      onClick={() => onReviewPortfolio(savedPortfolioIdForReview)}
                      className="px-3.5 py-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[var(--p-ink)] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Presentation className="w-3.5 h-3.5 text-[var(--p-accent)]" />
                      <span>Open in Review</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onNavigateGallery}
                    className="px-4 py-2 rounded-lg bg-[var(--p-action)] text-[var(--p-action-ink)] text-[12px] font-semibold hover:bg-[var(--p-action-hover)] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>View Gallery</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {studioTab === 'portfolios' ? (
              <div className="space-y-8">
                {/* Single-Portfolio Slot Roster */}
                <section className="p-5 md:p-6 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-[16px] font-bold text-[var(--p-ink)]">
                        Your Portfolio Slot (1 per account)
                      </h2>
                      <p className="text-[13px] text-[var(--p-muted)]">
                        {myPortfolios.length === 0
                          ? 'Upload static HTML/CSS/JS files, import from GitHub, link a live URL, or build a showcase card.'
                          : 'Each account has 1 portfolio slot. Edit details or replace files below, or delete to upload from scratch.'}
                      </p>
                    </div>
                    <span className="text-[12px] font-semibold text-[var(--p-muted)] tabular-nums whitespace-nowrap">
                      {myPortfolios.length > 0 ? '1 of 1 slot used' : '0 of 1 slot used'}
                    </span>
                  </div>

                  {myPortfolios.length > 1 && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-[12px] text-[var(--p-ink)] leading-relaxed"
                    >
                      Multiple legacy portfolios detected on this account. Please delete any extras below so only 1 portfolio remains.
                    </div>
                  )}

                  {myPortfolios.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-[var(--p-border-strong)] bg-[var(--p-surface-subtle)] text-center text-[13px] text-[var(--p-muted)]">
                      You have not uploaded your portfolio yet. Use the editor below to upload website files, import from GitHub, add a live URL, or publish a showcase card.
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--p-border)] rounded-xl border border-[var(--p-border)] overflow-hidden bg-[var(--p-bg)]">
                      {myPortfolios.map((item) => {
                        const isSelected = editingPortfolioId === item.id;
                        const sourceLabel =
                          item.source_type === 'upload'
                            ? `Uploaded Site (${item.entry_file || 'index.html'})`
                            : item.source_type === 'url'
                              ? 'Live URL'
                              : 'Showcase Card';
                        return (
                          <div
                            key={item.id}
                            className={`px-4 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                              isSelected ? 'bg-[var(--p-accent)]/6' : 'hover:bg-[var(--p-surface-subtle)]'
                            }`}
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => loadPortfolioIntoForm(item)}
                                  className="text-[14px] font-bold text-[var(--p-ink)] hover:text-[var(--p-accent)] truncate text-left cursor-pointer"
                                >
                                  {item.title}
                                </button>
                                {isSelected && (
                                  <span className="text-[11px] font-semibold text-[var(--p-accent)] shrink-0">
                                    Editing
                                  </span>
                                )}
                              </div>
                              <div className="text-[12px] text-[var(--p-muted)] flex flex-wrap items-center gap-2">
                                <span>{item.discipline}</span>
                                <span aria-hidden="true">·</span>
                                <span>{sourceLabel}</span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    item.is_published
                                      ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                      : 'text-[var(--p-muted)]'
                                  }
                                >
                                  {item.is_published ? 'Published' : 'Draft'}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => loadPortfolioIntoForm(item)}
                                className="h-8 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[12px] font-semibold text-[var(--p-ink)] cursor-pointer transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleTogglePublishedFromList(item)}
                                className="h-8 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[12px] font-medium text-[var(--p-ink)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                              >
                                {item.is_published ? (
                                  <>
                                    <EyeOff className="w-3.5 h-3.5 text-[var(--p-muted)]" />
                                    <span>Unpublish</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye className="w-3.5 h-3.5 text-[var(--p-accent)]" />
                                    <span>Publish</span>
                                  </>
                                )}
                              </button>
                              {onReviewPortfolio && (
                                <button
                                  type="button"
                                  onClick={() => onReviewPortfolio(`portfolio-${item.id}`)}
                                  className="h-8 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[12px] font-medium text-[var(--p-ink)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                                >
                                  <Presentation className="w-3.5 h-3.5 text-[var(--p-accent)]" />
                                  <span>Review</span>
                                </button>
                              )}
                              {confirmDeleteId === item.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void handleDeletePortfolioFromList(item.id)}
                                    className="h-8 px-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[12px] font-semibold cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="h-8 px-2 rounded-lg border border-[var(--p-border)] text-[12px] text-[var(--p-muted)] hover:text-[var(--p-ink)] cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(item.id)}
                                  aria-label={`Delete ${item.title}`}
                                  className="h-8 px-2.5 rounded-lg border border-[var(--p-border)] text-[var(--p-muted)] hover:text-red-600 hover:border-red-500/40 cursor-pointer transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Main Portfolio Editor + Live Preview Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Left 8 Columns: Upload Source + Metadata */}
                  <div className="lg:col-span-8 space-y-6">
                    {/* 1. Website Source Uploader */}
                    <section className="p-6 md:p-7 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h2 className="text-[18px] font-bold text-[var(--p-ink)]">
                            {editingPortfolioId ? 'Edit Portfolio Website' : '1. Upload Portfolio Website'}
                          </h2>
                          <p className="text-[13px] text-[var(--p-muted)] mt-0.5">
                            Choose how visitors and reviewers will experience this portfolio.
                          </p>
                        </div>

                        <span className="text-[12px] font-medium text-[var(--p-muted)] whitespace-nowrap">
                          {isPublished ? 'Status: Published' : 'Status: Draft'}
                        </span>
                      </div>

                      {/* 4-Mode Source Selector */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 p-1 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)]">
                        <button
                          type="button"
                          onClick={() => {
                            setSourceMode('upload');
                            setSourceType('upload');
                          }}
                          className={`py-2.5 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                            sourceMode === 'upload'
                              ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] border border-[var(--p-border)] shadow-xs'
                              : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                          }`}
                        >
                          <FolderUp className="w-4 h-4 text-[var(--p-accent)] shrink-0" />
                          <span>Upload Files</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSourceMode('github');
                            if (sourceType !== 'upload') {
                              setSourceType('upload');
                            }
                          }}
                          className={`py-2.5 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                            sourceMode === 'github'
                              ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] border border-[var(--p-border)] shadow-xs'
                              : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                          }`}
                        >
                          <FolderGit2 className="w-4 h-4 text-[var(--p-accent)] shrink-0" />
                          <span>Import from GitHub</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSourceMode('url');
                            setSourceType('url');
                          }}
                          className={`py-2.5 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                            sourceMode === 'url'
                              ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] border border-[var(--p-border)] shadow-xs'
                              : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                          }`}
                        >
                          <Globe className="w-4 h-4 text-[var(--p-accent)] shrink-0" />
                          <span>Live Website URL</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSourceMode('showcase');
                            setSourceType('showcase');
                          }}
                          className={`py-2.5 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                            sourceMode === 'showcase'
                              ? 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] border border-[var(--p-border)] shadow-xs'
                              : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                          }`}
                        >
                          <Layers className="w-4 h-4 text-[var(--p-accent)] shrink-0" />
                          <span>Showcase Builder</span>
                        </button>
                      </div>

                      {/* Source Mode 1: Upload .zip / Folder / HTML+CSS+JS */}
                      {sourceMode === 'upload' && (
                        <div className="space-y-4">
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsDraggingSite(true);
                            }}
                            onDragLeave={() => setIsDraggingSite(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setIsDraggingSite(false);
                              void readDroppedDataTransferFiles(e.dataTransfer).then(
                                (droppedFiles) => {
                                  if (droppedFiles.length > 0) {
                                    void processSiteFiles(droppedFiles);
                                  }
                                }
                              );
                            }}
                            className={`p-6 rounded-xl border-2 border-dashed text-center transition-colors ${
                              isDraggingSite
                                ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/8'
                                : 'border-[var(--p-border-strong)] bg-[var(--p-surface-subtle)]'
                            }`}
                          >
                            {processingBundle ? (
                              <div className="py-3 max-w-md mx-auto flex flex-col items-center gap-3">
                                <Loader2 className="w-6 h-6 animate-spin text-[var(--p-accent)]" />
                                <div className="w-full space-y-1.5">
                                  <p className="text-[13px] font-semibold text-[var(--p-ink)]">
                                    {bundleProgress?.phase === 'extracting'
                                      ? `Reading files (${bundleProgress.completed}/${Math.max(bundleProgress.total, 1)})...`
                                      : bundleProgress?.phase === 'uploading'
                                        ? `Uploading media assets (${bundleProgress.completed}/${Math.max(bundleProgress.total, 1)})...`
                                        : 'Finalizing HTML bundle...'}
                                  </p>
                                  {bundleProgress?.currentFile && (
                                    <p className="text-[11.5px] font-[family-name:var(--font-mono)] text-[var(--p-muted)] truncate">
                                      {bundleProgress.currentFile}
                                    </p>
                                  )}
                                  {bundleProgress && bundleProgress.total > 0 && (
                                    <div className="w-full h-1.5 rounded-full bg-[var(--p-border)] overflow-hidden">
                                      <div
                                        className="h-full bg-[var(--p-accent)] transition-all duration-200"
                                        style={{
                                          width: `${Math.min(
                                            100,
                                            Math.round(
                                              (bundleProgress.completed / bundleProgress.total) *
                                                100
                                            )
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={cancelBundleProcessing}
                                  className="h-8 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[12px] font-medium text-[var(--p-ink)] cursor-pointer transition-colors"
                                >
                                  Cancel upload
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="w-11 h-11 rounded-full bg-[var(--p-surface-elevated)] border border-[var(--p-border)] mx-auto flex items-center justify-center">
                                  <FileCode2 className="w-5 h-5 text-[var(--p-accent)]" />
                                </div>
                                <div>
                                  <p className="text-[14px] font-semibold text-[var(--p-ink)]">
                                    Drop a .zip archive, folder, or static site files here
                                  </p>
                                  <p className="text-[12px] text-[var(--p-muted)] mt-1">
                                    Supports index.html, CSS, JS, SVG, media, and fonts (up to 150 MB). Enables full Section Map, Inspect Element, Code View, and TV Sync in Review Studio.
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                                  <label className="h-10 px-4 rounded-lg bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors">
                                    <Upload className="w-4 h-4" />
                                    <span>Select .zip or Files</span>
                                    <input
                                      type="file"
                                      multiple
                                      accept=".zip,.html,.htm,.css,.js,.mjs,.json,.svg,.png,.jpg,.jpeg,.webp,.gif,.avif,.woff,.woff2,.ttf,.otf,.mp4,.webm,.mp3,.wav,.wasm,.glb,.gltf,.pdf"
                                      onChange={(e) => {
                                        if (e.target.files?.length) {
                                          void processSiteFiles(e.target.files);
                                        }
                                        e.target.value = '';
                                      }}
                                      className="sr-only"
                                    />
                                  </label>

                                  <label className="h-10 px-4 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[13px] font-semibold text-[var(--p-ink)] inline-flex items-center gap-2 cursor-pointer transition-colors">
                                    <FolderUp className="w-4 h-4" />
                                    <span>Select Folder</span>
                                    <input
                                      ref={setFolderInputRef}
                                      type="file"
                                      multiple
                                      onChange={(e) => {
                                        if (e.target.files?.length) {
                                          void processSiteFiles(e.target.files);
                                        }
                                        e.target.value = '';
                                      }}
                                      className="sr-only"
                                    />
                                  </label>

                                  <button
                                    type="button"
                                    onClick={() => setShowRawHtmlEditor((prev) => !prev)}
                                    className="h-10 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[13px] font-medium text-[var(--p-ink)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                                  >
                                    <Code2 className="w-4 h-4 text-[var(--p-muted)]" />
                                    <span>{showRawHtmlEditor ? 'Hide HTML Editor' : 'Paste / Edit HTML'}</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Entry File Selector & Manifest */}
                          {(uploadedFiles.length > 0 || entryCandidates.length > 1) && (
                            <div className="p-4 rounded-xl border border-[var(--p-border)] bg-[var(--p-bg)] space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="text-[12px] font-semibold text-[var(--p-ink)]">
                                  Bundled Files ({uploadedFiles.length}) · Entry:{' '}
                                  <span className="font-[family-name:var(--font-mono)] text-[var(--p-accent)]">
                                    {entryFile}
                                  </span>
                                </div>
                                {entryCandidates.length > 1 && (
                                  <select
                                    value={entryFile}
                                    onChange={(e) => void handleEntryFileChange(e.target.value)}
                                    aria-label="Select entry HTML file"
                                    className="h-8 px-2.5 rounded-md border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-[12px] font-[family-name:var(--font-mono)] text-[var(--p-ink)]"
                                  >
                                    {entryCandidates.map((cand) => (
                                      <option key={cand} value={cand}>
                                        {cand}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>

                              <SmoothScrollArea
                                className="max-h-36 overflow-y-auto rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[12px] font-[family-name:var(--font-mono)]"
                                contentClassName="divide-y divide-[var(--p-border)]"
                              >
                                {uploadedFiles.map((f) => (
                                  <div
                                    key={f.path}
                                    className="px-3 py-1.5 flex items-center justify-between gap-3"
                                  >
                                    <span className="truncate text-[var(--p-ink)]">{f.path}</span>
                                    <span className="text-[var(--p-muted)] shrink-0 tabular-nums">
                                      {formatBytes(f.size)}
                                    </span>
                                  </div>
                                ))}
                              </SmoothScrollArea>
                            </div>
                          )}

                          {/* Optional Raw HTML Paste / Quick Edit */}
                          {showRawHtmlEditor && (
                            <div className="space-y-2">
                              <label
                                htmlFor="raw-portfolio-html"
                                className="block text-[12px] font-semibold text-[var(--p-muted)]"
                              >
                                Direct HTML Source (you can paste a complete single-file HTML portfolio here)
                              </label>
                              <textarea
                                id="raw-portfolio-html"
                                rows={8}
                                value={portfolioHtml}
                                onChange={(e) => setPortfolioHtml(e.target.value)}
                                placeholder="<!doctype html><html>...</html>"
                                className="w-full p-3.5 rounded-xl border border-[var(--p-border)] bg-zinc-950 text-zinc-100 text-[12px] font-[family-name:var(--font-mono)] focus:outline-none focus:border-[var(--p-accent)] resize-y"
                              />
                            </div>
                          )}

                          {/* Live Embedded Mini-Preview of Uploaded Website */}
                          {(localPreviewHtml.trim() || portfolioHtml.trim()) && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[12px] font-semibold text-[var(--p-muted)]">
                                  {localPreviewHtml.trim() && !portfolioHtml.trim()
                                    ? 'Instant Local Preview (finishing media sync...)'
                                    : 'Live Sandboxed Website Preview'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    cancelBundleProcessing();
                                    revokePreviewUrlsRef.current?.();
                                    revokePreviewUrlsRef.current = null;
                                    cachedMediaUrlsRef.current = new Map();
                                    setLocalPreviewHtml('');
                                    setPortfolioHtml('');
                                    setUploadedFiles([]);
                                    setStagedFiles([]);
                                    setEntryCandidates([]);
                                    setImportedGithubRepoLabel(null);
                                  }}
                                  className="text-[12px] font-medium text-red-600 hover:underline cursor-pointer"
                                >
                                  Clear uploaded site
                                </button>
                              </div>
                              <div className="w-full h-[300px] rounded-xl border border-[var(--p-border)] overflow-hidden bg-white">
                                <iframe
                                  sandbox="allow-scripts allow-forms"
                                  srcDoc={localPreviewHtml || portfolioHtml}
                                  title="Uploaded portfolio live preview"
                                  className="w-full h-full border-0"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Source Mode 2: Import from GitHub Repository */}
                      {sourceMode === 'github' && (
                        <div className="space-y-4">
                          {/* Direct Repository URL or owner/repo */}
                          <div className="p-5 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] space-y-4">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-full bg-[var(--p-surface-elevated)] border border-[var(--p-border)] flex items-center justify-center shrink-0">
                                <SocialPlatformIcon
                                  platform="github"
                                  className="w-5 h-5 text-[var(--p-ink)]"
                                />
                              </div>
                              <div className="min-w-0">
                                <h3 className="text-[14px] font-bold text-[var(--p-ink)]">
                                  Import Portfolio from a GitHub Repository
                                </h3>
                                <p className="text-[12px] text-[var(--p-muted)] mt-0.5 leading-relaxed">
                                  Paste any repository URL (e.g. <span className="font-[family-name:var(--font-mono)]">https://github.com/user/portfolio</span> or <span className="font-[family-name:var(--font-mono)]">user/repo/tree/main/dist</span>) or browse your GitHub repositories below.
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2.5">
                              <input
                                type="text"
                                aria-label="GitHub repository URL or owner/repo"
                                value={githubRepoInput}
                                onChange={(e) => setGithubRepoInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleInspectGitHubRepo(githubRepoInput);
                                  }
                                }}
                                placeholder="https://github.com/username/portfolio or username/repo"
                                className="flex-1 h-11 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[13px] font-[family-name:var(--font-mono)] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                              />
                              <button
                                type="button"
                                disabled={inspectingGithubRepo || !githubRepoInput.trim()}
                                onClick={() => void handleInspectGitHubRepo(githubRepoInput)}
                                className="h-11 px-4 rounded-lg bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors shrink-0 whitespace-nowrap"
                              >
                                {inspectingGithubRepo ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Search className="w-4 h-4" />
                                )}
                                <span>Inspect Repo</span>
                              </button>
                            </div>

                            {/* Browse Repositories by GitHub Username */}
                            <div className="pt-3 border-t border-[var(--p-border)] space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="text-[12px] font-semibold text-[var(--p-ink)]">
                                  Or Browse Repositories by GitHub Username
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowGithubTokenInput((prev) => !prev)}
                                  className="text-[12px] font-medium text-[var(--p-muted)] hover:text-[var(--p-ink)] inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                  <span>
                                    {showGithubTokenInput
                                      ? 'Hide Private Repo Token'
                                      : 'Private Repo / Rate-Limit Token'}
                                  </span>
                                </button>
                              </div>

                              {showGithubTokenInput && (
                                <div className="space-y-1.5">
                                  <input
                                    type="password"
                                    aria-label="Optional GitHub Personal Access Token"
                                    value={githubToken}
                                    onChange={(e) => setGithubToken(e.target.value)}
                                    placeholder="ghp_... (kept in memory only for this session; never saved)"
                                    className="w-full h-10 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[13px] font-[family-name:var(--font-mono)] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                                  />
                                  <p className="text-[11px] text-[var(--p-muted)]">
                                    Optional read-only token for importing private repositories or avoiding anonymous GitHub API rate limits.
                                  </p>
                                </div>
                              )}

                              <div className="flex flex-col sm:flex-row gap-2.5">
                                <input
                                  type="text"
                                  aria-label="GitHub username"
                                  value={githubUsernameInput}
                                  onChange={(e) => setGithubUsernameInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      void handleLoadGitHubRepos();
                                    }
                                  }}
                                  placeholder="GitHub username (e.g., octocat)"
                                  className="flex-1 h-10 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[13px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                                />
                                <button
                                  type="button"
                                  disabled={loadingGithubRepos}
                                  onClick={() => void handleLoadGitHubRepos()}
                                  className="h-10 px-4 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[13px] font-semibold text-[var(--p-ink)] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors shrink-0 whitespace-nowrap"
                                >
                                  {loadingGithubRepos ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <FolderGit2 className="w-3.5 h-3.5 text-[var(--p-accent)]" />
                                  )}
                                  <span>Load Repos</span>
                                </button>
                              </div>

                              {githubRepos.length > 0 && (
                                <div className="space-y-2">
                                  <input
                                    type="search"
                                    aria-label="Filter loaded GitHub repositories"
                                    value={githubRepoFilter}
                                    onChange={(e) => setGithubRepoFilter(e.target.value)}
                                    placeholder={`Filter ${githubRepos.length} repositories...`}
                                    className="w-full h-9 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[12px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                                  />
                                  <SmoothScrollArea
                                    className="max-h-56 overflow-y-auto rounded-xl border border-[var(--p-border)] bg-[var(--p-bg)]"
                                    contentClassName="divide-y divide-[var(--p-border)]"
                                  >
                                    {githubRepos
                                      .filter((r) => {
                                        const q = githubRepoFilter.trim().toLowerCase();
                                        if (!q) return true;
                                        return (
                                          r.name.toLowerCase().includes(q) ||
                                          r.description.toLowerCase().includes(q) ||
                                          r.language.toLowerCase().includes(q)
                                        );
                                      })
                                      .map((repo) => (
                                        <div
                                          key={repo.id}
                                          className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--p-surface-subtle)] transition-colors"
                                        >
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--p-ink)]">
                                              <span className="truncate">{repo.name}</span>
                                              {repo.isPrivate && (
                                                <Lock className="w-3 h-3 text-[var(--p-muted)] shrink-0" />
                                              )}
                                              {repo.language && (
                                                <span className="text-[11px] font-medium text-[var(--p-muted)] shrink-0">
                                                  {repo.language}
                                                </span>
                                              )}
                                              {(repo.hasPages || repo.homepage) && (
                                                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                                                  Live Site
                                                </span>
                                              )}
                                            </div>
                                            {repo.description && (
                                              <p className="text-[12px] text-[var(--p-muted)] truncate mt-0.5">
                                                {repo.description}
                                              </p>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            disabled={inspectingGithubRepo}
                                            onClick={() => void handleInspectGitHubRepo(repo)}
                                            className="h-8 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[12px] font-semibold text-[var(--p-ink)] cursor-pointer shrink-0 transition-colors"
                                          >
                                            Select
                                          </button>
                                        </div>
                                      ))}
                                  </SmoothScrollArea>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Inspected GitHub Repository Actions */}
                          {githubInspection && (
                            <div className="p-5 rounded-xl border border-[var(--p-border)] bg-[var(--p-bg)] space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <a
                                      href={githubInspection.repo.htmlUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[14px] font-bold text-[var(--p-ink)] hover:text-[var(--p-accent)] inline-flex items-center gap-1"
                                    >
                                      <span>{githubInspection.repo.fullName}</span>
                                      <ArrowUpRight className="w-3.5 h-3.5" />
                                    </a>
                                    {githubInspection.repo.stargazersCount > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[12px] text-[var(--p-muted)] tabular-nums">
                                        <Star className="w-3 h-3" />
                                        {githubInspection.repo.stargazersCount}
                                      </span>
                                    )}
                                  </div>
                                  {githubInspection.repo.description && (
                                    <p className="text-[12px] text-[var(--p-muted)] mt-0.5">
                                      {githubInspection.repo.description}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <GitBranch className="w-3.5 h-3.5 text-[var(--p-muted)]" />
                                  <select
                                    aria-label="Select repository branch"
                                    value={githubInspection.branch}
                                    onChange={(e) =>
                                      void handleInspectGitHubRepo(
                                        githubInspection.repo,
                                        e.target.value
                                      )
                                    }
                                    className="h-9 px-2.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-[12px] font-[family-name:var(--font-mono)] text-[var(--p-ink)] cursor-pointer"
                                  >
                                    {githubInspection.branches.map((b) => (
                                      <option key={b} value={b}>
                                        {b}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {githubInspection.unbuiltWarning && (
                                <div className="p-3.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[12px] text-[var(--p-ink)] leading-relaxed">
                                  {githubInspection.unbuiltWarning}
                                </div>
                              )}

                              {githubInspection.entryCandidates.length > 0 && (
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                                  <div className="flex-1 min-w-0">
                                    <label
                                      htmlFor="github-entry-select"
                                      className="block text-[11px] font-semibold text-[var(--p-muted)] mb-1"
                                    >
                                      Detected HTML Entry ({githubInspection.entryCandidates.length} found)
                                    </label>
                                    <select
                                      id="github-entry-select"
                                      value={selectedGithubEntry}
                                      onChange={(e) => setSelectedGithubEntry(e.target.value)}
                                      className="w-full h-10 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-[12px] font-[family-name:var(--font-mono)] text-[var(--p-ink)] cursor-pointer"
                                    >
                                      {githubInspection.entryCandidates.map((cand) => (
                                        <option key={cand} value={cand}>
                                          {cand}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <button
                                    type="button"
                                    disabled={importingGithubBundle || !selectedGithubEntry}
                                    onClick={() => void handleImportGitHubStaticBundle()}
                                    className="h-10 px-4 rounded-lg bg-[var(--p-accent)] hover:bg-[var(--p-accent-hover)] text-[var(--p-accent-ink)] text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors shrink-0 sm:mt-5 whitespace-nowrap"
                                  >
                                    {importingGithubBundle ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Upload className="w-4 h-4" />
                                    )}
                                    <span>
                                      {importingGithubBundle
                                        ? 'Importing Files...'
                                        : 'Import Static Site from GitHub'}
                                    </span>
                                  </button>
                                </div>
                              )}

                              {(githubInspection.repo.pagesUrl ||
                                githubInspection.repo.homepage) && (
                                <div className="p-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[12px] font-semibold text-[var(--p-ink)]">
                                      Deployed GitHub Pages / Homepage Detected
                                    </div>
                                    <div className="text-[12px] font-[family-name:var(--font-mono)] text-[var(--p-muted)] truncate">
                                      {githubInspection.repo.homepage ||
                                        githubInspection.repo.pagesUrl}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUseGitHubLiveUrl(
                                        githubInspection.repo,
                                        githubInspection.repo.homepage ||
                                          githubInspection.repo.pagesUrl
                                      )
                                    }
                                    className="h-9 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[12px] font-semibold text-[var(--p-ink)] inline-flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                                  >
                                    <Globe className="w-3.5 h-3.5 text-[var(--p-accent)]" />
                                    <span>Use Live URL Instead</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Imported GitHub Bundle Manifest & Live Sandboxed Preview */}
                          {sourceType === 'upload' && portfolioHtml.trim() && (
                            <div className="space-y-3">
                              {uploadedFiles.length > 0 && (
                                <div className="p-4 rounded-xl border border-[var(--p-border)] bg-[var(--p-bg)] space-y-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-semibold text-[var(--p-ink)]">
                                    <span>
                                      {importedGithubRepoLabel
                                        ? `Imported from ${importedGithubRepoLabel} (${uploadedFiles.length} files)`
                                        : `Bundled Files (${uploadedFiles.length})`}
                                      {' · Entry: '}
                                      <span className="font-[family-name:var(--font-mono)] text-[var(--p-accent)]">
                                        {entryFile}
                                      </span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPortfolioHtml('');
                                        setUploadedFiles([]);
                                        setImportedGithubRepoLabel(null);
                                      }}
                                      className="text-[12px] font-medium text-red-600 hover:underline cursor-pointer"
                                    >
                                      Clear imported site
                                    </button>
                                  </div>
                                  <SmoothScrollArea
                                    className="max-h-32 overflow-y-auto rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[12px] font-[family-name:var(--font-mono)]"
                                    contentClassName="divide-y divide-[var(--p-border)]"
                                  >
                                    {uploadedFiles.map((f) => (
                                      <div
                                        key={f.path}
                                        className="px-3 py-1.5 flex items-center justify-between gap-3"
                                      >
                                        <span className="truncate text-[var(--p-ink)]">
                                          {f.path}
                                        </span>
                                        <span className="text-[var(--p-muted)] shrink-0 tabular-nums">
                                          {formatBytes(f.size)}
                                        </span>
                                      </div>
                                    ))}
                                  </SmoothScrollArea>
                                </div>
                              )}

                              <div className="space-y-2">
                                <span className="block text-[12px] font-semibold text-[var(--p-muted)]">
                                  Live Sandboxed Website Preview
                                </span>
                                <div className="w-full h-[300px] rounded-xl border border-[var(--p-border)] overflow-hidden bg-white">
                                  <iframe
                                    sandbox="allow-scripts allow-forms"
                                    srcDoc={portfolioHtml}
                                    title="GitHub imported portfolio live preview"
                                    className="w-full h-full border-0"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Source Mode 3: External Live URL */}
                      {sourceMode === 'url' && (() => {
                        const normalizedPreviewUrl = sanitizePortfolioUrl(portfolioUrl);
                        const previewBlocked =
                          normalizedPreviewUrl &&
                          isBlockedMixedContentUrl(normalizedPreviewUrl);
                        return (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label
                                htmlFor="portfolio-live-url"
                                className="block text-[13px] font-semibold text-[var(--p-ink)]"
                              >
                                Deployed Portfolio Website URL
                              </label>
                              {normalizedPreviewUrl && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setShowUrlPreview((prev) => !prev)}
                                    className="h-7 px-2.5 rounded-md border border-[var(--p-border)] bg-[var(--p-surface-subtle)] hover:bg-[var(--p-surface)] text-[11px] font-semibold text-[var(--p-ink)] inline-flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>{showUrlPreview ? 'Hide Preview' : 'Test URL Preview'}</span>
                                  </button>
                                  <a
                                    href={normalizedPreviewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="h-7 px-2.5 rounded-md border border-[var(--p-border)] hover:bg-[var(--p-surface)] text-[11px] font-semibold text-[var(--p-ink)] inline-flex items-center gap-1 transition-colors"
                                  >
                                    <span>Open Tab</span>
                                    <ArrowUpRight className="w-3 h-3" />
                                  </a>
                                </div>
                              )}
                            </div>
                            <div className="relative flex items-center">
                              <Globe className="w-4 h-4 text-[var(--p-muted)] absolute left-3.5 pointer-events-none" />
                              <input
                                id="portfolio-live-url"
                                type="url"
                                value={portfolioUrl}
                                onChange={(e) => setPortfolioUrl(e.target.value)}
                                onBlur={() => {
                                  const cleaned = sanitizePortfolioUrl(portfolioUrl);
                                  if (cleaned && cleaned !== portfolioUrl) {
                                    setPortfolioUrl(cleaned);
                                  }
                                }}
                                placeholder="https://your-portfolio.vercel.app"
                                className="w-full h-11 pl-10 pr-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                              />
                            </div>
                            {showUrlPreview && normalizedPreviewUrl && (
                              <div className="space-y-1.5">
                                {previewBlocked ? (
                                  <div className="p-3.5 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[12px] text-[var(--p-ink-secondary)]">
                                    Use <code className="font-[family-name:var(--font-mono)]">https://</code> for inline embedding. HTTP links still work via Open Tab and Showcase fallback in Review Studio.
                                  </div>
                                ) : (
                                  <div className="w-full h-[280px] rounded-xl border border-[var(--p-border)] overflow-hidden bg-white">
                                    <iframe
                                      src={normalizedPreviewUrl}
                                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                                      referrerPolicy="no-referrer"
                                      title="Live website URL preview"
                                      className="w-full h-full border-0"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            <p className="text-[12px] text-[var(--p-muted)] leading-relaxed">
                              Note: Some external hosts block iframe embedding via X-Frame-Options, in which case Review Studio offers a 1-click Showcase View and external tab launch. For full Section Map, Inspect Element, Code View, and TV Sync, upload your built static files or import a static GitHub repository.
                            </p>
                          </div>
                        );
                      })()}

                      {/* Source Mode 4: Built-in Showcase */}
                      {sourceMode === 'showcase' && (
                        <div className="p-4 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[13px] text-[var(--p-ink-secondary)] leading-relaxed">
                          The built-in Showcase Builder renders a clean multi-section presentation page automatically from your Title, Summary, Cover Image, Highlights, Skills, and Profile Social Links — with full Section Map, Inspect Element, and TV Feed support.
                        </div>
                      )}
                    </section>

                    {/* 2. Portfolio Showcase Details & Metadata */}
                    <section className="p-6 md:p-7 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] space-y-5">
                      <div>
                        <h2 className="text-[18px] font-bold text-[var(--p-ink)]">
                          2. Gallery Card &amp; Case Study Details
                        </h2>
                        <p className="text-[13px] text-[var(--p-muted)] mt-0.5">
                          Configure how this portfolio appears on the main Gallery grid and preview modal.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="portfolio-project-title"
                            className="block text-[13px] font-semibold text-[var(--p-ink)] mb-1.5"
                          >
                            Portfolio / Project Title
                          </label>
                          <input
                            id="portfolio-project-title"
                            type="text"
                            value={portfolioTitle}
                            onChange={(e) => setPortfolioTitle(e.target.value)}
                            placeholder="Distributed Task Mesh & Portfolio"
                            className="w-full h-11 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="portfolio-discipline"
                            className="block text-[13px] font-semibold text-[var(--p-ink)] mb-1.5"
                          >
                            Primary Discipline
                          </label>
                          <select
                            id="portfolio-discipline"
                            value={discipline}
                            onChange={(e) =>
                              setDiscipline(
                                e.target.value as Exclude<Discipline, 'All'>
                              )
                            }
                            className="w-full h-11 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] text-[var(--p-ink)] focus:outline-none focus:border-[var(--p-accent)] cursor-pointer"
                          >
                            {DISCIPLINE_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="portfolio-summary"
                          className="block text-[13px] font-semibold text-[var(--p-ink)] mb-1.5"
                        >
                          Portfolio Description
                        </label>
                        <textarea
                          id="portfolio-summary"
                          rows={3}
                          value={portfolioSummary}
                          onChange={(e) => setPortfolioSummary(e.target.value)}
                          placeholder="Describe your portfolio, architecture highlights, and featured engineering work..."
                          className="w-full p-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)] resize-y"
                        />
                      </div>

                      {/* Gallery Card Thumbnail Mode */}
                      <div className="space-y-3">
                        <div>
                          <span className="block text-[13px] font-semibold text-[var(--p-ink)]">
                            Gallery Card Thumbnail Display
                          </span>
                          <p className="text-[12px] text-[var(--p-muted)] mt-0.5">
                            Choose what visitors see on your 4:3 portfolio card in the main gallery.
                          </p>
                        </div>

                        <div
                          role="radiogroup"
                          aria-label="Gallery Card Thumbnail Display"
                          className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                        >
                          {(
                            [
                              {
                                id: 'homepage',
                                label: 'Portfolio Home Page',
                                description:
                                  'Shows a crisp static preview of your website’s opening page.',
                                icon: Monitor,
                              },
                              {
                                id: 'image',
                                label: 'Custom Image',
                                description:
                                  'Uses the custom 4:3 cover image uploaded or linked below.',
                                icon: ImagePlus,
                              },
                              {
                                id: 'live',
                                label: 'Live Animated View',
                                description:
                                  'Runs your live site right inside the card so entrance animations play.',
                                icon: Play,
                              },
                            ] as const
                          ).map((opt) => {
                            const Icon = opt.icon;
                            const active = thumbnailMode === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => setThumbnailMode(opt.id)}
                                className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer flex flex-col gap-1.5 ${
                                  active
                                    ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/8'
                                    : 'border-[var(--p-border)] bg-[var(--p-bg)] hover:border-[var(--p-border-strong)]'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Icon
                                    className={`w-4 h-4 shrink-0 ${
                                      active
                                        ? 'text-[var(--p-accent)]'
                                        : 'text-[var(--p-muted)]'
                                    }`}
                                  />
                                  <span className="text-[13px] font-semibold text-[var(--p-ink)]">
                                    {opt.label}
                                  </span>
                                </div>
                                <p className="text-[12px] text-[var(--p-muted)] leading-snug">
                                  {opt.description}
                                </p>
                              </button>
                            );
                          })}
                        </div>

                        {(thumbnailMode === 'homepage' || thumbnailMode === 'live') &&
                          sourceType === 'url' &&
                          portfolioUrl.trim() && (
                            <p className="text-[12px] text-[var(--p-muted)]">
                              Tip: If your external host blocks iframe embedding, adding an optional fallback cover image below keeps your card looking sharp.
                            </p>
                          )}
                      </div>

                      {/* Cover Image Upload or URL */}
                      <div className="space-y-2.5">
                        <span className="block text-[13px] font-semibold text-[var(--p-ink)]">
                          {thumbnailMode === 'image'
                            ? 'Custom Cover Image (4:3 recommended)'
                            : 'Fallback Cover Image (4:3, optional)'}
                        </span>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          {coverImageUrl.trim() && (
                            <div className="w-16 h-11 rounded-lg overflow-hidden border border-[var(--p-border)] bg-[var(--p-surface)] shrink-0">
                              <img
                                key={coverImageUrl}
                                src={coverImageUrl}
                                alt="Cover preview"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <label className="px-4 h-11 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-subtle)] hover:bg-[var(--p-surface)] text-[13px] font-semibold text-[var(--p-ink)] inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 transition-colors">
                            {uploadingCover ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ImagePlus className="w-4 h-4" />
                            )}
                            <span>{uploadingCover ? 'Uploading...' : 'Upload Cover'}</span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              onChange={(e) => void handleMediaUpload(e, 'cover')}
                              className="sr-only"
                            />
                          </label>
                          <input
                            type="url"
                            aria-label="Cover image URL"
                            value={coverImageUrl}
                            onChange={(e) => setCoverImageUrl(e.target.value)}
                            placeholder="https://example.com/portfolio-cover.jpg"
                            className="flex-1 h-11 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[13px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                          />
                          {coverImageUrl.trim() && (
                            <button
                              type="button"
                              onClick={() => setCoverImageUrl('')}
                              className="h-11 px-3.5 rounded-lg border border-[var(--p-border)] text-[12px] font-medium text-[var(--p-muted)] hover:text-red-600 hover:border-red-500/40 inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Key Highlights */}
                      <div className="space-y-2.5">
                        <label
                          htmlFor="portfolio-highlight-input"
                          className="block text-[13px] font-semibold text-[var(--p-ink)]"
                        >
                          Key Highlights &amp; Achievements
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="portfolio-highlight-input"
                            type="text"
                            value={highlightDraft}
                            onChange={(e) => setHighlightDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddHighlight();
                              }
                            }}
                            placeholder="e.g., 99.9% Uptime, Best UI Craft Award"
                            className="flex-1 h-10 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[13px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                          />
                          <button
                            type="button"
                            onClick={handleAddHighlight}
                            className="h-10 px-4 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-subtle)] hover:bg-[var(--p-surface)] text-[13px] font-semibold text-[var(--p-ink)] cursor-pointer transition-colors"
                          >
                            Add
                          </button>
                        </div>
                        {highlights.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {highlights.map((h) => (
                              <span
                                key={h}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[12px] font-medium text-[var(--p-ink)]"
                              >
                                <span>{h}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setHighlights((prev) => prev.filter((item) => item !== h))
                                  }
                                  aria-label={`Remove highlight ${h}`}
                                  className="text-[var(--p-muted)] hover:text-[var(--p-ink)] cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Tech Stack / Skills */}
                      <div className="space-y-2.5">
                        <label
                          htmlFor="portfolio-skills"
                          className="block text-[13px] font-semibold text-[var(--p-ink)]"
                        >
                          Technical Skills (comma-separated)
                        </label>
                        <input
                          id="portfolio-skills"
                          type="text"
                          value={skillsText}
                          onChange={(e) => setSkillsText(e.target.value)}
                          placeholder="TypeScript, React, PostgreSQL, Docker"
                          className="w-full h-11 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                        />
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {TECH_SKILL_PRESETS.map((tech) => {
                            const selected = parsedSkills.some(
                              (s) =>
                                canonicalizeSkillName(s).toLowerCase() ===
                                tech.name.toLowerCase()
                            );
                            return (
                              <button
                                key={tech.name}
                                type="button"
                                onClick={() => togglePresetSkill(tech.name)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px] font-medium transition-colors cursor-pointer ${
                                  selected
                                    ? 'bg-[var(--p-action)] text-[var(--p-action-ink)] border-[var(--p-action)]'
                                    : 'bg-[var(--p-surface-subtle)] text-[var(--p-ink-secondary)] border-[var(--p-border)] hover:border-[var(--p-border-strong)]'
                                }`}
                              >
                                <TechLogo name={tech.name} size={14} />
                                <span>{tech.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* Right 4 Columns: Live Card Preview & Publish Actions */}
                  <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-24">
                    <div className="p-6 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] space-y-5">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-[15px] font-bold text-[var(--p-ink)]">
                          Live Gallery Card Preview
                        </h2>
                        <Sparkles className="w-4 h-4 text-[var(--p-accent)]" />
                      </div>

                      {/* 4:3 Card Preview */}
                      <div className="space-y-3">
                        <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden border border-[var(--p-border)] bg-[var(--p-surface)]">
                          <PortfolioThumbnailMedia
                            portfolioId={
                              editingPortfolioId
                                ? `portfolio-${editingPortfolioId}`
                                : 'preview-draft'
                            }
                            mode={thumbnailMode}
                            title={portfolioTitle.trim() || `${previewName} Portfolio`}
                            studentName={previewName}
                            username={sanitizeUsername(username) || undefined}
                            discipline={discipline}
                            projectSummary={portfolioSummary.trim() || bio.trim()}
                            skills={parsedSkills}
                            avatarUrl={avatarUrl || undefined}
                            initials={previewInitials}
                            thumbnail={coverImageUrl}
                            fallbackGradient="from-slate-800 via-slate-900 to-zinc-900"
                            portfolioHtml={
                              sourceType === 'upload' ? portfolioHtml : undefined
                            }
                            portfolioUrl={
                              sourceType === 'url' ? portfolioUrl : undefined
                            }
                            lazy={false}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-7 h-7 rounded-full overflow-hidden bg-[var(--p-accent)] text-[var(--p-accent-ink)] flex items-center justify-center text-[11px] font-bold shrink-0">
                              {avatarUrl ? (
                                <img
                                  key={avatarUrl}
                                  src={avatarUrl}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                previewInitials
                              )}
                            </span>
                            <div className="min-w-0">
                              <div className="text-[14px] font-semibold text-[var(--p-ink)] truncate">
                                {previewName}
                              </div>
                              {username && (
                                <div className="text-[12px] text-[var(--p-muted)] truncate">
                                  @{sanitizeUsername(username)}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] text-[var(--p-muted)] whitespace-nowrap">
                            {discipline}
                          </span>
                        </div>

                        {(portfolioSummary.trim() || bio.trim()) && (
                          <p className="text-[13px] text-[var(--p-ink-secondary)] line-clamp-3 leading-relaxed">
                            {portfolioSummary.trim() || bio.trim()}
                          </p>
                        )}

                        <div className="pt-1">
                          <SocialLinksBar links={socialLinks} size="sm" />
                        </div>
                      </div>

                      {/* Publish Controls */}
                      <div className="pt-4 border-t border-[var(--p-border)] space-y-2.5">
                        <button
                          type="button"
                          disabled={savingPortfolio || processingBundle}
                          onClick={() => void handleSavePortfolio(true)}
                          className="w-full h-12 px-4 rounded-lg bg-[var(--p-accent)] hover:bg-[var(--p-accent-hover)] text-[var(--p-accent-ink)] text-[14px] font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                        >
                          {savingPortfolio ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          <span>
                            {isPublished
                              ? 'Update Published Portfolio'
                              : 'Save & Publish to Gallery'}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={savingPortfolio || processingBundle}
                          onClick={() => void handleSavePortfolio(false)}
                          className="w-full h-11 px-4 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-subtle)] hover:bg-[var(--p-surface)] text-[13px] font-semibold text-[var(--p-ink)] transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {isPublished ? 'Unpublish & Save as Draft' : 'Save Draft Only'}
                        </button>

                        {savedPortfolioIdForReview && onReviewPortfolio && (
                          <button
                            type="button"
                            onClick={() => onReviewPortfolio(savedPortfolioIdForReview)}
                            className="w-full h-10 px-4 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] hover:bg-[var(--p-surface)] text-[13px] font-medium text-[var(--p-ink)] inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
                          >
                            <Presentation className="w-3.5 h-3.5 text-[var(--p-accent)]" />
                            <span>Test in Review Studio</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            ) : (
              /* TAB 2: PROFILE IDENTITY & SOCIAL ACCOUNTS */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-8 space-y-6">
                  {/* Profile Identity */}
                  <section className="p-6 md:p-7 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] space-y-6">
                    <div>
                      <h2 className="text-[18px] font-bold text-[var(--p-ink)]">
                        Profile Identity
                      </h2>
                      <p className="text-[13px] text-[var(--p-muted)] mt-1">
                        Your avatar, username, display name, and bio appear on all of your published portfolios and comments.
                      </p>
                    </div>

                    {/* Avatar Upload Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-5 border-b border-[var(--p-border)]">
                      <div className="relative w-20 h-20 rounded-full overflow-hidden border border-[var(--p-border)] bg-[var(--p-accent)] text-[var(--p-accent-ink)] flex items-center justify-center text-xl font-bold shrink-0">
                        {avatarUrl ? (
                          <img
                            key={avatarUrl}
                            src={avatarUrl}
                            alt={`${previewName} profile picture`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{previewInitials}</span>
                        )}
                      </div>

                      <div className="flex-1 space-y-3 min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <label className="px-3.5 py-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-subtle)] hover:bg-[var(--p-surface)] text-[13px] font-semibold text-[var(--p-ink)] inline-flex items-center gap-2 cursor-pointer transition-colors">
                            {uploadingAvatar ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Camera className="w-4 h-4" />
                            )}
                            <span>
                              {uploadingAvatar ? 'Uploading...' : 'Upload Profile Picture'}
                            </span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              onChange={(e) => void handleMediaUpload(e, 'avatar')}
                              className="sr-only"
                            />
                          </label>

                          {avatarUrl && (
                            <button
                              type="button"
                              onClick={() => setAvatarUrl('')}
                              className="px-3 py-2 rounded-lg border border-[var(--p-border)] text-[12px] font-medium text-[var(--p-muted)] hover:text-red-600 hover:border-red-500/40 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="profile-avatar-url"
                            className="block text-[12px] font-medium text-[var(--p-muted)] mb-1"
                          >
                            Or paste a profile image URL
                          </label>
                          <input
                            id="profile-avatar-url"
                            type="url"
                            value={avatarUrl}
                            onChange={(e) => setAvatarUrl(e.target.value)}
                            placeholder="https://example.com/avatar.jpg"
                            className="w-full h-10 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[13px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Username & Display Name */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="profile-username"
                          className="block text-[13px] font-semibold text-[var(--p-ink)] mb-1.5"
                        >
                          Username
                        </label>
                        <div className="relative flex items-center">
                          <span className="absolute left-3.5 text-[14px] text-[var(--p-muted)] select-none">
                            @
                          </span>
                          <input
                            id="profile-username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onBlur={() => setUsername(sanitizeUsername(username))}
                            placeholder="ashanti_dp"
                            className="w-full h-11 pl-8 pr-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="profile-display-name"
                          className="block text-[13px] font-semibold text-[var(--p-ink)] mb-1.5"
                        >
                          Display Name
                        </label>
                        <input
                          id="profile-display-name"
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Ashanti Dela Pena"
                          className="w-full h-11 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="profile-role"
                        className="block text-[13px] font-semibold text-[var(--p-ink)] mb-1.5"
                      >
                        Headline / Role
                      </label>
                      <input
                        id="profile-role"
                        type="text"
                        value={roleTitle}
                        onChange={(e) => setRoleTitle(e.target.value)}
                        placeholder="Full-Stack Software Engineer"
                        className="w-full h-11 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="profile-bio"
                        className="block text-[13px] font-semibold text-[var(--p-ink)] mb-1.5"
                      >
                        About / Profile Bio
                      </label>
                      <textarea
                        id="profile-bio"
                        rows={3}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Share your engineering focus, coursework, or what you love building..."
                        className="w-full p-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)] resize-y"
                      />
                    </div>
                  </section>

                  {/* Social Media & Contact Accounts */}
                  <section className="p-6 md:p-7 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] space-y-5">
                    <div>
                      <h2 className="text-[18px] font-bold text-[var(--p-ink)]">
                        Social Media &amp; Contact Accounts
                      </h2>
                      <p className="text-[13px] text-[var(--p-muted)] mt-1">
                        Connected profiles display automatically on your published portfolio modals.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {SOCIAL_PLATFORM_FIELDS.map((field) => (
                        <div key={field.key}>
                          <label
                            htmlFor={`social-${field.key}`}
                            className="flex items-center gap-2 text-[13px] font-semibold text-[var(--p-ink)] mb-1.5"
                          >
                            <SocialPlatformIcon
                              platform={field.key}
                              className="w-4 h-4 text-[var(--p-accent)]"
                            />
                            <span>{field.label}</span>
                          </label>
                          <input
                            id={`social-${field.key}`}
                            type="text"
                            value={socialLinks[field.key] ?? ''}
                            onChange={(e) =>
                              setSocialLinks((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            placeholder={field.placeholder}
                            className="w-full h-11 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)]"
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                {/* Right 4 Columns: Save Identity */}
                <aside className="lg:col-span-4 lg:sticky lg:top-24">
                  <div className="p-6 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] space-y-5">
                    <div className="flex items-center gap-3">
                      <span className="w-12 h-12 rounded-full overflow-hidden bg-[var(--p-accent)] text-[var(--p-accent-ink)] flex items-center justify-center text-sm font-bold shrink-0">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          previewInitials
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[16px] font-bold text-[var(--p-ink)] truncate">
                          {previewName}
                        </div>
                        <div className="text-[12px] text-[var(--p-muted)] truncate">
                          {username ? `@${sanitizeUsername(username)} · ` : ''}
                          {roleTitle}
                        </div>
                      </div>
                    </div>

                    {bio.trim() && (
                      <p className="text-[13px] text-[var(--p-ink-secondary)] leading-relaxed">
                        {bio}
                      </p>
                    )}

                    <SocialLinksBar links={socialLinks} size="sm" />

                    <button
                      type="button"
                      disabled={savingProfile}
                      onClick={() => void handleSaveProfileIdentity()}
                      className="w-full h-12 px-4 rounded-lg bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] text-[14px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
                    >
                      {savingProfile ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      <span>Save Profile Identity</span>
                    </button>
                  </div>
                </aside>
              </div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
};
