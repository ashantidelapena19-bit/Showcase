import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Heart,
  Layers,
  LogIn,
  Palette,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'motion/react';
import {
  AntigravityScrollProvider,
  SmoothScrollArea,
  useAntigravityScroll,
} from './components/AntigravityScrollProvider';
import { ColorSchemeDrawer } from './components/ColorSchemeDrawer';
import { EditProfilePage } from './components/EditProfilePage';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { OnboardingPage } from './components/OnboardingPage';
import { PortfolioModal } from './components/PortfolioModal';
import { PortfolioReviewPage } from './components/PortfolioReviewPage';
import { ShotCard } from './components/ShotCard';
import { SkillsAndContributors } from './components/SkillsAndContributors';
import { TechLogo } from './components/TechLogo';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import { TvFeedPage } from './components/TvFeedPage';
import {
  STUDENT_PORTFOLIOS,
  StudentPortfolio,
} from './data/portfolios';
import { portfolioMatchesSkill } from './lib/techStack';
import type { UploadedPortfolioFile } from './lib/portfolioBundle';
import {
  type AuthSession,
  fetchMyPortfolioById,
  fetchPortfolioEngagement,
  fetchPortfolioHtmlById,
  fetchPublishedPortfolios,
  GUEST_SESSION,
  hasUserUploadedPortfolio,
  incrementPortfolioView,
  invalidateGalleryCaches,
  isSupabaseConfigured,
  supabase,
  syncUnifiedUserProfile,
  togglePortfolioHeart,
} from './lib/supabase';
import {
  claimPortfolioViewSlot,
  getDeviceViewerKey,
} from './lib/viewTracking';

type SortOption = 'popular' | 'views' | 'roll';

const ANTIGRAVITY_EASE = [0.22, 1, 0.36, 1] as const;
const GUEST_STORAGE_KEY = 'se-class-a-guest-v1';

function loadGuestMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(GUEST_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getNormalizedPath(): string {
  if (typeof window === 'undefined') return '/';
  const cleaned = window.location.pathname.replace(/\/+$/, '');
  return cleaned === '' ? '/' : cleaned;
}

function getReviewPortfolioId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
}

interface EngagementNotice {
  kind: 'auth' | 'error';
  message: string;
}

class RouteErrorBoundary extends React.Component<
  { resetKey: string; onReturnGallery: () => void; children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: {
    resetKey: string;
    onReturnGallery: () => void;
    children: React.ReactNode;
  }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected rendering error.',
    };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--p-bg)] text-[var(--p-ink)]">
          <div className="max-w-md w-full p-6 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-center space-y-4 shadow-lg">
            <h1 className="text-[18px] font-bold text-[var(--p-ink)]">
              Unable to Display This Portfolio View
            </h1>
            <p className="text-[13px] text-[var(--p-muted)] leading-relaxed">
              {this.state.errorMessage}
            </p>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, errorMessage: '' });
                  this.props.onReturnGallery();
                }}
                className="h-9 px-4 rounded-lg bg-[var(--p-accent)] hover:bg-[var(--p-accent-hover)] text-[var(--p-accent-ink)] text-[13px] font-semibold cursor-pointer transition-colors"
              >
                Back to Gallery
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                className="h-9 px-4 rounded-lg border border-[var(--p-border)] hover:bg-[var(--p-surface)] text-[13px] font-semibold text-[var(--p-ink)] cursor-pointer transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function GalleryExperience({
  session,
  hasUploadedPortfolio,
  portfolios,
  likedIds,
  engagementNotice,
  onDismissNotice,
  onToggleLike,
  onRecordView,
  onHydratePortfolioDetail,
  onCommentCountChange,
  onNavigateLogin,
  onNavigateProfile,
  onNavigateOnboarding,
  onNavigateUpload,
  onReviewPortfolio,
  onSwitchAccount,
  onLogout,
}: {
  session: AuthSession | null;
  hasUploadedPortfolio: boolean;
  portfolios: StudentPortfolio[];
  likedIds: Record<string, boolean>;
  engagementNotice: EngagementNotice | null;
  onDismissNotice: () => void;
  onToggleLike: (id: string) => void;
  onRecordView: (portfolioId: string) => void;
  onHydratePortfolioDetail: (portfolioId: string) => void;
  onCommentCountChange: (portfolioId: string, count: number) => void;
  onNavigateLogin: () => void;
  onNavigateProfile: () => void;
  onNavigateOnboarding: () => void;
  onNavigateUpload: () => void;
  onReviewPortfolio: (portfolio: StudentPortfolio, fromModal?: boolean) => void;
  onSwitchAccount: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [themeDrawerOpen, setThemeDrawerOpen] = useState(false);

  const activePortfolio = useMemo(
    () => portfolios.find((p) => p.id === activePortfolioId) ?? null,
    [portfolios, activePortfolioId]
  );

  const handleOpenPortfolio = useCallback(
    (item: StudentPortfolio) => {
      setActivePortfolioId(item.id);
      onRecordView(item.id);
      if (item.hasUploadedHtml && !item.portfolioHtml) {
        onHydratePortfolioDetail(item.id);
      }
    },
    [onRecordView, onHydratePortfolioDetail]
  );

  const handleCloseModal = useCallback(() => {
    setActivePortfolioId(null);
  }, []);

  const heroRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { pauseScroll, resumeScroll } = useAntigravityScroll();
  const { activeScheme, tokens } = useTheme();

  useEffect(() => {
    if (!rosterOpen) return;
    pauseScroll();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRosterOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      resumeScroll();
    };
  }, [rosterOpen, pauseScroll, resumeScroll]);

  // Global scroll velocity for weightless per-column lag (settles back to 0 when stopped)
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const clampedVelocity = useTransform(scrollVelocity, [-1800, 1800], [18, -18], {
    clamp: true,
  });

  const col0Lag = useSpring(
    useTransform(clampedVelocity, (v) => v * 0.35),
    { stiffness: 150, damping: 24, mass: 0.65, restDelta: 0.05, restSpeed: 0.5 }
  );
  const col1Lag = useSpring(
    useTransform(clampedVelocity, (v) => v * 0.9),
    { stiffness: 92, damping: 20, mass: 1.05, restDelta: 0.05, restSpeed: 0.5 }
  );
  const col2Lag = useSpring(
    useTransform(clampedVelocity, (v) => v * 0.58),
    { stiffness: 118, damping: 22, mass: 0.85, restDelta: 0.05, restSpeed: 0.5 }
  );
  const columnLags = [col0Lag, col1Lag, col2Lag];

  // Subtle delayed parallax on hero header as user scrolls into the gallery
  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const smoothHeroProgress = useSpring(heroScrollProgress, {
    stiffness: 135,
    damping: 28,
    restDelta: 0.002,
  });
  const heroY = useTransform(smoothHeroProgress, [0, 1], [0, 32]);
  const heroOpacity = useTransform(smoothHeroProgress, [0, 0.85], [1, 0.35]);

  const isAuthenticated = session?.mode === 'authenticated';

  const filteredPortfolios = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = portfolios.filter((item) => {
      if (selectedSkill && !portfolioMatchesSkill(item.skills, selectedSkill)) {
        return false;
      }
      if (!q) return true;
      return (
        item.studentName.toLowerCase().includes(q) ||
        (item.username?.toLowerCase().includes(q) ?? false) ||
        item.projectTitle.toLowerCase().includes(q) ||
        item.roleTitle.toLowerCase().includes(q) ||
        item.discipline.toLowerCase().includes(q) ||
        item.skills.some((s) => s.toLowerCase().includes(q))
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'popular') {
        if (a.isPublishedCommunity !== b.isPublishedCommunity) {
          return a.isPublishedCommunity ? -1 : 1;
        }
        return b.likes - a.likes;
      }
      if (sortBy === 'views') {
        return b.views - a.views;
      }
      return a.rollNumber.localeCompare(b.rollNumber);
    });
  }, [portfolios, searchQuery, selectedSkill, sortBy]);

  const totalViews = useMemo(
    () => portfolios.reduce((acc, p) => acc + p.views, 0),
    [portfolios]
  );

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[var(--p-bg)] text-[var(--p-ink)] transition-colors duration-200">
      <Navbar
        session={session}
        hasUploadedPortfolio={hasUploadedPortfolio}
        onNavigateLogin={onNavigateLogin}
        onNavigateProfile={onNavigateProfile}
        onNavigateUpload={onNavigateUpload}
        onSwitchAccount={onSwitchAccount}
        onLogout={onLogout}
      />

      {/* Persistent Home Page Reminder for Unconfigured Developer Profiles */}
      {isAuthenticated && session?.needsProfileSetup && (
        <div
          role="region"
          aria-label="Profile configuration reminder"
          className="max-w-[1360px] w-full mx-auto px-6 md:px-10 pt-5"
        >
          <div className="rounded-2xl border border-[var(--p-accent)]/35 bg-[var(--p-surface-elevated)] px-5 py-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-[var(--p-accent)]/12 text-[var(--p-accent)] flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[var(--p-ink)]">
                  Complete your web developer profile
                </p>
                <p className="text-[13px] text-[var(--p-muted)] leading-snug mt-0.5">
                  Add your name, @username, web programming &amp; markup languages, and skill level so classmates can find and @mention you.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onNavigateProfile}
                className="h-9 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] hover:bg-[var(--p-surface)] text-[12.5px] font-medium text-[var(--p-ink)] cursor-pointer transition-colors whitespace-nowrap"
              >
                Edit Profile
              </button>
              <button
                type="button"
                onClick={onNavigateOnboarding}
                className="h-9 px-4 rounded-lg bg-[var(--p-accent)] hover:bg-[var(--p-accent-hover)] text-[var(--p-accent-ink)] text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <span>Complete Setup</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editorial Dribbble-Inspired Hero + Search with Antigravity Entrance & Parallax */}
      <section
        ref={heroRef}
        className="pt-10 pb-8 md:pt-14 md:pb-10 px-6 md:px-10 max-w-[1360px] w-full mx-auto"
      >
        <motion.div
          style={shouldReduceMotion ? undefined : { y: heroY, opacity: heroOpacity }}
          className="max-w-3xl mx-auto text-center will-change-transform"
        >
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.04, ease: ANTIGRAVITY_EASE }}
            className="text-[13px] font-medium text-[var(--p-muted)] mb-3"
          >
            2026 Cohort Showcase · {portfolios.length} Student Portfolios ·{' '}
            <span className="tabular-nums">{totalViews.toLocaleString()}</span> Portfolio Views
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.72, delay: 0.11, ease: ANTIGRAVITY_EASE }}
            className="text-[clamp(2.1rem,4vw,3.35rem)] font-bold tracking-tight leading-[1.1] text-[var(--p-ink)] text-balance"
          >
            Software Engineering{' '}
            <span className="font-[family-name:var(--font-serif-editorial)] italic font-medium">
              Class A
            </span>{' '}
            Portfolio Gallery
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.68, delay: 0.18, ease: ANTIGRAVITY_EASE }}
            className="text-[15px] md:text-[16px] text-[var(--p-muted)] mt-3.5 max-w-2xl mx-auto leading-relaxed"
          >
            Explore capstone projects, technical stacks, and open each student’s individual portfolio website directly inside the gallery.
          </motion.p>

          {/* Dribbble-style Search Bar */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.68, delay: 0.25, ease: ANTIGRAVITY_EASE }}
            onSubmit={(e) => e.preventDefault()}
            className="mt-7 max-w-[660px] mx-auto relative flex items-center bg-[var(--p-surface)] border border-transparent focus-within:bg-[var(--p-surface-elevated)] focus-within:border-[var(--p-accent)]/50 focus-within:ring-4 focus-within:ring-[var(--p-accent)]/15 rounded-full p-1.5 pl-5 transition-all"
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="What student, project, or skill are you looking for?"
              aria-label="Search student portfolios"
              className="w-full bg-transparent text-[14px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none pr-3"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="p-2 text-[var(--p-muted)] hover:text-[var(--p-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              aria-label="Search"
              className="w-10 h-10 rounded-full bg-[var(--p-accent)] hover:bg-[var(--p-accent-hover)] text-[var(--p-accent-ink)] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>
          </motion.form>
        </motion.div>
      </section>

      {/* Controls Strip */}
      <section
        id="gallery"
        className="max-w-[1360px] w-full mx-auto px-6 md:px-10 pb-16"
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.3, ease: ANTIGRAVITY_EASE }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-7"
        >
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-medium text-[var(--p-muted)] tabular-nums">
              {filteredPortfolios.length} of {portfolios.length} Portfolios
            </span>
            {selectedSkill && (
              <button
                type="button"
                onClick={() => setSelectedSkill(null)}
                className="px-3 py-1.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-[12px] font-medium text-[var(--p-ink)] hover:bg-[var(--p-surface)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <TechLogo name={selectedSkill} size={15} />
                <span>Skill: {selectedSkill}</span>
                <X className="w-3.5 h-3.5 text-[var(--p-muted)]" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 flex-wrap">
            {isAuthenticated && (
              <button
                type="button"
                onClick={onNavigateUpload}
                className="px-3.5 py-2 rounded-lg bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] text-[13px] font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--p-accent)]"
              >
                {hasUploadedPortfolio ? (
                  <>
                    <Layers className="w-3.5 h-3.5" />
                    <span>Manage Portfolio</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Portfolio</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setThemeDrawerOpen(true)}
              aria-label={`Open color schemes organizer (Current: ${activeScheme.name})`}
              className="px-3.5 py-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:border-[var(--p-border-strong)] text-[13px] font-medium text-[var(--p-ink)] inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--p-accent)]"
            >
              <span
                className="w-3 h-3 rounded-full border border-black/15 shrink-0"
                style={{ backgroundColor: tokens.accent }}
                aria-hidden="true"
              />
              <Palette className="w-3.5 h-3.5 text-[var(--p-muted)]" />
              <span>Color Schemes</span>
            </button>

            <label className="sr-only" htmlFor="sort-select">
              Sort portfolios
            </label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3.5 py-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-[13px] font-medium text-[var(--p-ink)] focus:outline-none focus:border-[var(--p-ink)] cursor-pointer"
            >
              <option value="popular">Popular</option>
              <option value="views">Most Viewed</option>
              <option value="roll">Roll Number (A–Z)</option>
            </select>
          </div>
        </motion.div>

        {/* Dribbble 3-Column Portfolio Gallery Grid */}
        {filteredPortfolios.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-9 gap-y-10">
            {filteredPortfolios.map((item, idx) => (
              <ShotCard
                key={item.id}
                item={item}
                index={idx}
                columnLagY={columnLags[idx % 3]}
                isLiked={Boolean(likedIds[item.id])}
                canHeart={isAuthenticated}
                onToggleLike={onToggleLike}
                onSelectPortfolio={handleOpenPortfolio}
              />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center border border-[var(--p-border)] rounded-2xl bg-[var(--p-surface-subtle)]">
            <p className="text-[16px] font-semibold text-[var(--p-ink)]">
              No matching student portfolios found
            </p>
            <p className="text-[14px] text-[var(--p-muted)] mt-1">
              Try clearing your search query or resetting the active skill filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedSkill(null);
              }}
              className="mt-4 px-5 py-2.5 rounded-full bg-[var(--p-action)] text-[var(--p-action-ink)] text-[13px] font-semibold hover:bg-[var(--p-action-hover)] transition-colors cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </section>

      <SkillsAndContributors
        portfolios={portfolios}
        selectedSkill={selectedSkill}
        onSelectSkill={setSelectedSkill}
        onSelectPortfolio={handleOpenPortfolio}
      />

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-[var(--p-border)] bg-[var(--p-bg)] py-10 transition-colors duration-200">
        <div className="max-w-[1360px] mx-auto px-6 md:px-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-[var(--p-muted)]">
          <div className="flex items-center gap-3">
            <span className="font-bold text-[var(--p-ink)]">SE Class A</span>
            <span>·</span>
            <span>Software Engineering Cohort Showcase 2026</span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href="/student-portfolios/Bond%20Portfolio/index.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--p-ink)] transition-colors"
            >
              Bond Portfolio
            </a>
            <a
              href="/student-portfolios/Smith%20Portfolio/index.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--p-ink)] transition-colors"
            >
              Smith Portfolio
            </a>
            <button
              type="button"
              onClick={() => setThemeDrawerOpen(true)}
              className="hover:text-[var(--p-ink)] transition-colors cursor-pointer"
            >
              Color Schemes
            </button>
            <a
              href="/profile"
              onClick={(e) => {
                e.preventDefault();
                onNavigateProfile();
              }}
              className="hover:text-[var(--p-ink)] transition-colors"
            >
              Edit Profile
            </a>
            <a
              href="/login"
              onClick={(e) => {
                e.preventDefault();
                onNavigateLogin();
              }}
              className="hover:text-[var(--p-ink)] transition-colors"
            >
              {session?.mode === 'authenticated'
                ? `Account (${session.displayName.split(' ')[0]})`
                : session?.mode === 'guest'
                  ? 'Guest Mode'
                  : 'Login'}
            </a>
            <button
              type="button"
              onClick={() => setRosterOpen(true)}
              className="hover:text-[var(--p-ink)] transition-colors cursor-pointer"
            >
              All Sites
            </button>
          </div>
        </div>
      </footer>

      {/* Embedded Standalone Website Preview Modal */}
      <PortfolioModal
        portfolio={activePortfolio}
        allPortfolios={portfolios}
        session={session}
        isLiked={activePortfolio ? Boolean(likedIds[activePortfolio.id]) : false}
        onToggleLike={onToggleLike}
        onNavigateLogin={onNavigateLogin}
        onCommentCountChange={onCommentCountChange}
        onClose={handleCloseModal}
        onNavigate={handleOpenPortfolio}
        onReview={(item) => onReviewPortfolio(item, true)}
      />

      {/* Color Scheme & Semantic Token Organizer Drawer */}
      <ColorSchemeDrawer
        open={themeDrawerOpen}
        onClose={() => setThemeDrawerOpen(false)}
      />

      {/* Quick Student Sites Roster Drawer / Modal */}
      <AnimatePresence>
        {rosterOpen && (
          <motion.div
            key="roster-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Class A student websites directory"
            data-lenis-prevent
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: ANTIGRAVITY_EASE }}
            className="fixed inset-0 z-50 bg-[var(--p-backdrop)] backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setRosterOpen(false)}
          >
            <motion.div
              key="roster-modal-panel"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.99 }}
              transition={{ duration: 0.32, ease: ANTIGRAVITY_EASE }}
              className="w-full max-w-2xl bg-[var(--p-surface-elevated)] rounded-2xl border border-[var(--p-border)] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-[var(--p-border)] flex items-center justify-between">
                <div>
                  <h2 className="text-[17px] font-bold text-[var(--p-ink)]">
                    Software Engineering Class A — Student Sites
                  </h2>
                  <p className="text-[13px] text-[var(--p-muted)]">
                    Launch any student’s standalone portfolio website inside the viewer or in a new tab.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRosterOpen(false)}
                  aria-label="Close roster"
                  className="w-8 h-8 rounded-lg border border-[var(--p-border)] text-[var(--p-ink)] flex items-center justify-center hover:bg-[var(--p-surface)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <SmoothScrollArea
                className="max-h-[65vh] overflow-y-auto"
                contentClassName="divide-y divide-[var(--p-border)]"
              >
                {portfolios.map((student) => (
                  <div
                    key={student.id}
                    className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-[var(--p-surface-subtle)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {student.avatarUrl ? (
                        <img
                          src={student.avatarUrl}
                          alt={student.studentName}
                          className="w-8 h-8 rounded-full object-cover shrink-0 border border-[var(--p-border)]"
                        />
                      ) : (
                        <span
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: student.avatarColor }}
                        >
                          {student.initials}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-[var(--p-ink)] truncate">
                          {student.studentName} · {student.projectTitle}
                        </div>
                        <div className="text-[12px] font-[family-name:var(--font-mono)] text-[var(--p-muted)] truncate">
                          {student.sourceType === 'upload'
                            ? `uploaded-site/${student.entryFile || 'index.html'}`
                            : student.portfolioUrl || `${student.discipline} Showcase`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setRosterOpen(false);
                          handleOpenPortfolio(student);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[var(--p-action)] text-[var(--p-action-ink)] text-[12px] font-semibold hover:bg-[var(--p-action-hover)] cursor-pointer"
                      >
                        Preview
                      </button>
                      {student.portfolioUrl && (
                        <a
                          href={student.portfolioUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg border border-[var(--p-border)] text-[var(--p-ink)] text-[12px] font-medium hover:bg-[var(--p-surface)] inline-flex items-center gap-1"
                        >
                          <span>Visit</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </SmoothScrollArea>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Non-blocking Auth / Engagement Toast */}
      <AnimatePresence>
        {engagementNotice && (
          <motion.div
            key="engagement-toast"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.22, ease: ANTIGRAVITY_EASE }}
            role="status"
            aria-live="polite"
            className="fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] shadow-xl px-4 py-3 flex items-center gap-3"
          >
            <span className="w-8 h-8 rounded-full bg-[var(--p-accent)]/15 text-[var(--p-accent)] flex items-center justify-center shrink-0">
              <Heart className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-[var(--p-ink)] leading-snug">
                {engagementNotice.message}
              </p>
            </div>
            {engagementNotice.kind === 'auth' && (
              <button
                type="button"
                onClick={() => {
                  onDismissNotice();
                  onNavigateLogin();
                }}
                className="h-8 px-3 rounded-lg bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] text-[12px] font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
            <button
              type="button"
              onClick={onDismissNotice}
              aria-label="Dismiss notification"
              className="p-1 rounded-md text-[var(--p-muted)] hover:text-[var(--p-ink)] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RouteScrollReset({ pathname }: { pathname: string }) {
  const { scrollTo } = useAntigravityScroll();

  useEffect(() => {
    scrollTo(0, { immediate: true });
  }, [pathname, scrollTo]);

  return null;
}

export default function App() {
  const [pathname, setPathname] = useState<string>(getNormalizedPath);
  const [reviewId, setReviewId] = useState<string | null>(getReviewPortfolioId);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(loadGuestMode);
  const [authLoading, setAuthLoading] = useState<boolean>(Boolean(supabase));
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(false);
  const [publishedPortfolios, setPublishedPortfolios] = useState<StudentPortfolio[]>([]);
  const [hasUploadedPortfolio, setHasUploadedPortfolio] = useState<boolean>(false);
  const [viewsByPortfolio, setViewsByPortfolio] = useState<Record<string, number>>({});
  const [heartsByPortfolio, setHeartsByPortfolio] = useState<Record<string, number>>({});
  const [commentsByPortfolio, setCommentsByPortfolio] = useState<Record<string, number>>({});
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [engagementNotice, setEngagementNotice] = useState<EngagementNotice | null>(null);
  const [privateReviewPortfolio, setPrivateReviewPortfolio] =
    useState<StudentPortfolio | null>(null);
  const [hydratedDetailsById, setHydratedDetailsById] = useState<
    Record<
      string,
      {
        portfolioHtml?: string;
        uploadedFiles?: UploadedPortfolioFile[];
        entryFile?: string;
      }
    >
  >({});
  const skipNextReviewCountIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(getNormalizedPath());
      setReviewId(getReviewPortfolioId());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (
    to: '/' | '/login' | '/onboarding' | '/profile' | '/upload' | '/review' | '/tv',
    portfolioId?: string
  ) => {
    const targetUrl =
      (to === '/review' || to === '/tv') && portfolioId
        ? `${to}?id=${encodeURIComponent(portfolioId)}`
        : to;

    window.history.pushState({}, '', targetUrl);
    setPathname(to);
    setReviewId(portfolioId ?? null);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const refreshPublishedPortfolios = useCallback(async () => {
    invalidateGalleryCaches();
    setHydratedDetailsById({});
    const [list, ownsPortfolio] = await Promise.all([
      fetchPublishedPortfolios({ forceRefresh: true }),
      authSession?.authUserId
        ? hasUserUploadedPortfolio(authSession.authUserId)
        : Promise.resolve(false),
    ]);
    setPublishedPortfolios(list);
    setHasUploadedPortfolio(ownsPortfolio);
  }, [authSession?.authUserId]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchPublishedPortfolios(),
      authSession?.authUserId
        ? hasUserUploadedPortfolio(authSession.authUserId)
        : Promise.resolve(false),
    ]).then(([list, ownsPortfolio]) => {
      if (!active) return;
      setPublishedPortfolios(list);
      setHasUploadedPortfolio(ownsPortfolio);
    });
    return () => {
      active = false;
    };
  }, [authSession?.authUserId]);

  const handleHydratePortfolioDetail = useCallback((portfolioId: string) => {
    if (!portfolioId.startsWith('portfolio-')) return;
    void fetchPortfolioHtmlById(portfolioId).then((detail) => {
      if (!detail) return;
      setHydratedDetailsById((prev) => ({
        ...prev,
        [portfolioId]: detail,
      }));
    });
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;
    const urlLooksLikeRecovery =
      window.location.hash.includes('type=recovery') ||
      new URLSearchParams(window.location.search).get('type') === 'recovery';

    if (urlLooksLikeRecovery) {
      setIsPasswordRecovery(true);
      if (getNormalizedPath() !== '/login') {
        window.history.replaceState({}, '', '/login');
        setPathname('/login');
      }
    }

    const applySupabaseUser = async (
      user: import('@supabase/supabase-js').User | null
    ) => {
      if (!mounted) return;
      if (!user) {
        setAuthSession(null);
        setAuthLoading(false);
        return;
      }
      const synced = await syncUnifiedUserProfile(user);
      if (!mounted) return;
      setAuthSession(synced);
      setIsGuest(false);
      try {
        window.localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
      if (synced.needsProfileSetup && synced.authUserId && !urlLooksLikeRecovery) {
        const promptKey = `se-onboarding-autoprompted-${synced.authUserId}`;
        const currentPath = getNormalizedPath();
        let alreadyPrompted = false;
        try {
          alreadyPrompted = window.sessionStorage.getItem(promptKey) === '1';
        } catch {
          alreadyPrompted = false;
        }
        if (!alreadyPrompted && (currentPath === '/' || currentPath === '/login')) {
          try {
            window.sessionStorage.setItem(promptKey, '1');
          } catch {
            // Ignore storage errors
          }
          window.history.replaceState({}, '', '/onboarding');
          setPathname('/onboarding');
        }
      }
      setAuthLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => {
      void applySupabaseUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSupaSession) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        if (getNormalizedPath() !== '/login') {
          window.history.pushState({}, '', '/login');
          setPathname('/login');
        }
      }
      if (event === 'SIGNED_OUT') {
        setAuthSession(null);
        setIsPasswordRecovery(false);
        setAuthLoading(false);
        return;
      }
      void applySupabaseUser(nextSupaSession?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleContinueAsGuest = () => {
    setIsGuest(true);
    try {
      window.localStorage.setItem(GUEST_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
  };

  const handleExitGuest = () => {
    setIsGuest(false);
    try {
      window.localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const handleLogout = async () => {
    const prevUserId = authSession?.authUserId;
    if (supabase) {
      await supabase.auth.signOut();
    }
    if (prevUserId) {
      try {
        window.sessionStorage.removeItem(`se-onboarding-autoprompted-${prevUserId}`);
      } catch {
        // Ignore storage errors
      }
    }
    setAuthSession(null);
    handleExitGuest();
  };

  const handleSwitchAccount = async () => {
    await handleLogout();
    navigate('/login');
  };

  const handleProfileSaved = (updated: {
    displayName: string;
    username?: string;
    avatarUrl?: string;
    portfolioUrl?: string;
    needsProfileSetup?: boolean;
  }) => {
    setAuthSession((prev) =>
      prev
        ? {
            ...prev,
            displayName: updated.displayName,
            username: updated.username,
            avatarUrl: updated.avatarUrl,
            portfolioUrl: updated.portfolioUrl,
            needsProfileSetup:
              updated.needsProfileSetup !== undefined
                ? updated.needsProfileSetup
                : prev.needsProfileSetup,
          }
        : prev
    );
  };

  const activeSession: AuthSession | null =
    authSession ?? (isGuest ? GUEST_SESSION : null);

  useEffect(() => {
    let cancelled = false;
    void fetchPortfolioEngagement(authSession?.authUserId).then((snapshot) => {
      if (cancelled) return;
      if (snapshot.schemaReady) {
        setViewsByPortfolio(snapshot.viewsByPortfolio);
        setHeartsByPortfolio(snapshot.heartsByPortfolio);
        setCommentsByPortfolio(snapshot.commentsByPortfolio);
        setLikedIds(authSession?.authUserId ? snapshot.userLikedIds : {});
      } else if (!authSession?.authUserId) {
        setLikedIds({});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authSession?.authUserId]);

  useEffect(() => {
    if (!engagementNotice) return;
    const timer = window.setTimeout(() => setEngagementNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [engagementNotice]);

  const handleRecordView = useCallback(
    (portfolioId: string) => {
      if (!portfolioId) return;

      // Exclude owner self-views from incrementing view stats
      const target =
        publishedPortfolios.find((p) => p.id === portfolioId) ??
        STUDENT_PORTFOLIOS.find((p) => p.id === portfolioId);
      if (
        authSession?.authUserId &&
        target?.ownerUserId &&
        target.ownerUserId === authSession.authUserId
      ) {
        return;
      }

      // Cross-tab & same-device 24h cooldown (covers logged-in and unlogged tabs)
      if (!claimPortfolioViewSlot(portfolioId)) {
        return;
      }

      if (!isSupabaseConfigured) {
        setViewsByPortfolio((prev) => ({
          ...prev,
          [portfolioId]: (prev[portfolioId] ?? 0) + 1,
        }));
        return;
      }

      const viewerKey = getDeviceViewerKey();
      void incrementPortfolioView(portfolioId, viewerKey).then((serverCount) => {
        if (typeof serverCount === 'number' && serverCount >= 0) {
          setViewsByPortfolio((prev) => ({
            ...prev,
            [portfolioId]: serverCount,
          }));
        }
      });
    },
    [authSession?.authUserId, publishedPortfolios]
  );

  const handleToggleHeart = useCallback(
    (portfolioId: string) => {
      if (activeSession?.mode !== 'authenticated' || !activeSession.authUserId) {
        setEngagementNotice({
          kind: 'auth',
          message: 'Sign in with an account to heart student portfolios.',
        });
        return;
      }

      const authUserId = activeSession.authUserId;
      const currentlyLiked = Boolean(likedIds[portfolioId]);
      const nextLiked = !currentlyLiked;

      setLikedIds((prev) => ({ ...prev, [portfolioId]: nextLiked }));
      setHeartsByPortfolio((prev) => ({
        ...prev,
        [portfolioId]: Math.max(0, (prev[portfolioId] ?? 0) + (nextLiked ? 1 : -1)),
      }));

      void togglePortfolioHeart(portfolioId, authUserId, currentlyLiked).then(
        ({ error }) => {
          if (error) {
            setLikedIds((prev) => ({ ...prev, [portfolioId]: currentlyLiked }));
            setHeartsByPortfolio((prev) => ({
              ...prev,
              [portfolioId]: Math.max(
                0,
                (prev[portfolioId] ?? 0) + (currentlyLiked ? 1 : -1)
              ),
            }));
            setEngagementNotice({
              kind: 'error',
              message:
                error.includes('does not exist') || error.includes('permission')
                  ? 'Hearts table is not ready yet. Run supabase/schema.sql in Supabase SQL Editor.'
                  : error,
            });
          }
        }
      );
    },
    [activeSession, likedIds]
  );

  const handleCommentCountChange = useCallback(
    (portfolioId: string, count: number) => {
      setCommentsByPortfolio((prev) =>
        prev[portfolioId] === count ? prev : { ...prev, [portfolioId]: count }
      );
    },
    []
  );

  const combinedPortfolios = useMemo(
    () =>
      [...publishedPortfolios, ...STUDENT_PORTFOLIOS].map((item) => {
        const hydrated = hydratedDetailsById[item.id];
        return {
          ...item,
          portfolioHtml: hydrated?.portfolioHtml ?? item.portfolioHtml,
          uploadedFiles:
            hydrated?.uploadedFiles && hydrated.uploadedFiles.length > 0
              ? hydrated.uploadedFiles
              : item.uploadedFiles,
          entryFile: hydrated?.entryFile ?? item.entryFile,
          likes: heartsByPortfolio[item.id] ?? 0,
          views: viewsByPortfolio[item.id] ?? 0,
          commentsCount: commentsByPortfolio[item.id] ?? 0,
        };
      }),
    [
      publishedPortfolios,
      hydratedDetailsById,
      heartsByPortfolio,
      viewsByPortfolio,
      commentsByPortfolio,
    ]
  );

  // Resolve owner's private/draft portfolio when opening /review?id=portfolio-... directly
  useEffect(() => {
    if (
      (pathname !== '/review' && pathname !== '/tv') ||
      !reviewId ||
      !reviewId.startsWith('portfolio-') ||
      !authSession?.authUserId ||
      combinedPortfolios.some((item) => item.id === reviewId)
    ) {
      setPrivateReviewPortfolio(null);
      return;
    }

    let cancelled = false;
    void fetchMyPortfolioById(reviewId, authSession.authUserId).then((draft) => {
      if (!cancelled) {
        setPrivateReviewPortfolio(draft);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, reviewId, authSession?.authUserId, combinedPortfolios]);

  const reviewPortfolio = useMemo(() => {
    if (!reviewId) return combinedPortfolios[0];
    const matched = combinedPortfolios.find((item) => item.id === reviewId);
    if (matched) return matched;
    if (privateReviewPortfolio && privateReviewPortfolio.id === reviewId) {
      return {
        ...privateReviewPortfolio,
        likes: heartsByPortfolio[privateReviewPortfolio.id] ?? 0,
        views: viewsByPortfolio[privateReviewPortfolio.id] ?? 0,
        commentsCount: commentsByPortfolio[privateReviewPortfolio.id] ?? 0,
      };
    }
    return combinedPortfolios[0];
  }, [
    reviewId,
    combinedPortfolios,
    privateReviewPortfolio,
    heartsByPortfolio,
    viewsByPortfolio,
    commentsByPortfolio,
  ]);

  useEffect(() => {
    if (
      (pathname === '/review' || pathname === '/tv') &&
      reviewPortfolio?.hasUploadedHtml &&
      !reviewPortfolio.portfolioHtml
    ) {
      handleHydratePortfolioDetail(reviewPortfolio.id);
    }
  }, [
    pathname,
    reviewPortfolio?.id,
    reviewPortfolio?.hasUploadedHtml,
    reviewPortfolio?.portfolioHtml,
    handleHydratePortfolioDetail,
  ]);

  useEffect(() => {
    if (pathname !== '/review' || !reviewPortfolio?.id) return;
    if (skipNextReviewCountIdRef.current === reviewPortfolio.id) {
      skipNextReviewCountIdRef.current = null;
      return;
    }
    handleRecordView(reviewPortfolio.id);
  }, [pathname, reviewPortfolio?.id, handleRecordView]);

  return (
    <ThemeProvider>
      <AntigravityScrollProvider>
        <RouteScrollReset pathname={pathname} />
        <RouteErrorBoundary
          resetKey={`${pathname}:${reviewId ?? ''}`}
          onReturnGallery={() => navigate('/')}
        >
          {pathname === '/login' ? (
            <LoginPage
              session={activeSession}
              authLoading={authLoading}
              isPasswordRecovery={isPasswordRecovery}
              onContinueAsGuest={handleContinueAsGuest}
              onExitGuest={handleExitGuest}
              onLogout={handleLogout}
              onCompletePasswordRecovery={() => setIsPasswordRecovery(false)}
              onNavigateGallery={() => navigate('/')}
              onNavigateProfile={() => navigate('/profile')}
            />
          ) : pathname === '/onboarding' ? (
            <OnboardingPage
              session={activeSession}
              onCompleteOnboarding={handleProfileSaved}
              onRefreshGalleryPortfolios={refreshPublishedPortfolios}
              onSkipToGallery={() => navigate('/')}
              onNavigateLogin={() => navigate('/login')}
            />
          ) : pathname === '/profile' || pathname === '/upload' ? (
            <EditProfilePage
              session={activeSession}
              initialTab={pathname === '/upload' ? 'portfolios' : 'profile'}
              onProfileSaved={handleProfileSaved}
              onRefreshGalleryPortfolios={refreshPublishedPortfolios}
              onNavigateGallery={() => navigate('/')}
              onNavigateLogin={() => navigate('/login')}
              onReviewPortfolio={(portfolioId) => navigate('/review', portfolioId)}
              onSwitchAccount={handleSwitchAccount}
              onLogout={handleLogout}
            />
          ) : pathname === '/review' ? (
            <PortfolioReviewPage
              portfolio={reviewPortfolio}
              allPortfolios={combinedPortfolios}
              onSelectPortfolio={(next) => navigate('/review', next.id)}
              onNavigateGallery={() => navigate('/')}
            />
          ) : pathname === '/tv' ? (
            <TvFeedPage
              initialPortfolio={reviewPortfolio}
              allPortfolios={combinedPortfolios}
              onHydratePortfolioDetail={handleHydratePortfolioDetail}
            />
          ) : (
            <GalleryExperience
              session={activeSession}
              hasUploadedPortfolio={
                hasUploadedPortfolio ||
                (Boolean(authSession?.authUserId) &&
                  publishedPortfolios.some(
                    (item) => item.ownerUserId === authSession?.authUserId
                  ))
              }
              portfolios={combinedPortfolios}
              likedIds={likedIds}
              engagementNotice={engagementNotice}
              onDismissNotice={() => setEngagementNotice(null)}
              onToggleLike={handleToggleHeart}
              onRecordView={handleRecordView}
              onHydratePortfolioDetail={handleHydratePortfolioDetail}
              onCommentCountChange={handleCommentCountChange}
              onNavigateLogin={() => navigate('/login')}
              onNavigateProfile={() => navigate('/profile')}
              onNavigateOnboarding={() => navigate('/onboarding')}
              onNavigateUpload={() => navigate('/upload')}
              onReviewPortfolio={(item, fromModal) => {
                if (fromModal) {
                  skipNextReviewCountIdRef.current = item.id;
                }
                navigate('/review', item.id);
              }}
              onSwitchAccount={handleSwitchAccount}
              onLogout={handleLogout}
            />
          )}
        </RouteErrorBoundary>
      </AntigravityScrollProvider>
    </ThemeProvider>
  );
}
