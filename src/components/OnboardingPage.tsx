import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  Code2,
  Compass,
  Loader2,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { Discipline } from '../data/portfolios';
import {
  type AuthSession,
  type UserProfileRecord,
  deriveDefaultUsernameFromEmail,
  fetchMyFullProfile,
  sanitizeUsername,
  saveUserProfileAndPortfolio,
} from '../lib/supabase';
import { TechLogo } from './TechLogo';

interface OnboardingPageProps {
  session: AuthSession | null;
  onCompleteOnboarding: (updated: {
    displayName: string;
    username?: string;
    avatarUrl?: string;
    portfolioUrl?: string;
    needsProfileSetup: boolean;
  }) => void;
  onRefreshGalleryPortfolios: () => Promise<void>;
  onSkipToGallery: () => void;
  onNavigateLogin: () => void;
}

const ANTIGRAVITY_EASE = [0.22, 1, 0.36, 1] as const;

const WEB_TECH_GROUPS: {
  id: string;
  title: string;
  subtitle: string;
  items: string[];
}[] = [
  {
    id: 'markup-styling',
    title: 'Web Markup & Styling',
    subtitle: 'Structure and style modern web interfaces',
    items: ['HTML', 'CSS', 'Tailwind CSS', 'Sass / SCSS', 'Bootstrap'],
  },
  {
    id: 'web-languages',
    title: 'Web Programming Languages',
    subtitle: 'Core languages for browser and web server logic',
    items: ['JavaScript', 'TypeScript', 'PHP', 'Python', 'Ruby'],
  },
  {
    id: 'web-frameworks',
    title: 'Web Frameworks, Runtimes & Data',
    subtitle: 'Optional tools you build web projects with',
    items: [
      'React',
      'Next.js',
      'Vue',
      'Svelte',
      'Angular',
      'Node.js',
      'Express',
      'Vite',
      'PostgreSQL',
    ],
  },
];

interface LevelOption {
  id: 'beginner' | 'intermediate' | 'advanced';
  label: string;
  badge: string;
  description: string;
}

const EXPERIENCE_LEVELS: LevelOption[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    badge: 'Foundations',
    description: 'Learning HTML, CSS, responsive layouts, and core JavaScript.',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    badge: 'Builder',
    description: 'Building multi-page web apps, components, and API integrations.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    badge: 'Production',
    description: 'Architecting full-stack web systems, auth, and performance.',
  },
];

interface FocusOption {
  id: 'frontend' | 'fullstack' | 'backend' | 'ui';
  label: string;
  roleTitle: string;
  discipline: Exclude<Discipline, 'All'>;
  description: string;
}

const WEB_FOCUS_OPTIONS: FocusOption[] = [
  {
    id: 'frontend',
    label: 'Frontend Web Developer',
    roleTitle: 'Frontend Web Developer',
    discipline: 'UI / Design',
    description: 'Interactive interfaces, accessibility, and browser UI.',
  },
  {
    id: 'fullstack',
    label: 'Full-Stack Web Developer',
    roleTitle: 'Full-Stack Web Developer',
    discipline: 'Full-Stack',
    description: 'End-to-end web apps from UI components to databases.',
  },
  {
    id: 'backend',
    label: 'Backend & Web APIs',
    roleTitle: 'Backend Web Developer',
    discipline: 'Full-Stack',
    description: 'Server routes, authentication, and database design.',
  },
  {
    id: 'ui',
    label: 'UI & CSS Design Engineer',
    roleTitle: 'UI / Design Engineer',
    discipline: 'UI / Design',
    description: 'Typography, CSS architecture, motion, and design systems.',
  },
];

const CORE_COMFORT_OPTIONS = [
  {
    id: 'markup',
    label: 'Semantic HTML, CSS & Responsive Layouts',
  },
  {
    id: 'components',
    label: 'JavaScript DOM, State & Reusable Components',
  },
  {
    id: 'fullstack-apis',
    label: 'REST APIs, Authentication & Web Databases',
  },
] as const;

const GOAL_SUGGESTIONS = [
  'Interactive developer portfolio site',
  'Full-stack web app with auth & database',
  'Accessible responsive UI component library',
  'Fast REST API & web dashboard',
];

export const OnboardingPage: React.FC<OnboardingPageProps> = ({
  session,
  onCompleteOnboarding,
  onRefreshGalleryPortfolios,
  onSkipToGallery,
  onNavigateLogin,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const isAuthenticated = session?.mode === 'authenticated';

  const [loadingProfile, setLoadingProfile] = useState(false);
  const [existingRecord, setExistingRecord] = useState<UserProfileRecord | null>(null);

  const [displayName, setDisplayName] = useState(session?.displayName ?? '');
  const [username, setUsername] = useState(
    session?.username?.trim() ||
      (session?.email ? deriveDefaultUsernameFromEmail(session.email) : '')
  );
  const [selectedTech, setSelectedTech] = useState<string[]>(['HTML', 'CSS', 'JavaScript']);
  const [levelId, setLevelId] = useState<LevelOption['id']>('beginner');
  const [focusId, setFocusId] = useState<FocusOption['id']>('frontend');
  const [comfortId, setComfortId] = useState<(typeof CORE_COMFORT_OPTIONS)[number]['id']>('markup');
  const [buildingGoal, setBuildingGoal] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!session || session.mode !== 'authenticated') return;
    let active = true;
    setLoadingProfile(true);
    void fetchMyFullProfile(session).then(({ profile }) => {
      if (!active) return;
      setLoadingProfile(false);
      if (!profile) {
        setDisplayName(session.displayName);
        setUsername(deriveDefaultUsernameFromEmail(session.email));
        return;
      }
      setExistingRecord(profile);
      setDisplayName(profile.display_name?.trim() || session.displayName);
      setUsername(
        profile.username?.trim() || deriveDefaultUsernameFromEmail(session.email)
      );
      if (Array.isArray(profile.skills) && profile.skills.length > 0) {
        setSelectedTech(profile.skills);
      }
      if (profile.bio?.trim()) {
        setBuildingGoal(profile.bio.trim());
      }
    });
    return () => {
      active = false;
    };
  }, [session]);

  const sanitizedHandle = useMemo(() => sanitizeUsername(username), [username]);
  const selectedLevel = useMemo(
    () => EXPERIENCE_LEVELS.find((item) => item.id === levelId) ?? EXPERIENCE_LEVELS[0],
    [levelId]
  );
  const selectedFocus = useMemo(
    () => WEB_FOCUS_OPTIONS.find((item) => item.id === focusId) ?? WEB_FOCUS_OPTIONS[0],
    [focusId]
  );
  const selectedComfort = useMemo(
    () => CORE_COMFORT_OPTIONS.find((item) => item.id === comfortId) ?? CORE_COMFORT_OPTIONS[0],
    [comfortId]
  );

  const toggleTech = (tech: string) => {
    setSelectedTech((prev) =>
      prev.includes(tech) ? prev.filter((item) => item !== tech) : [...prev, tech]
    );
  };

  const integratedBio = useMemo(() => {
    const customNote = buildingGoal.trim();
    const stackSummary = selectedTech.slice(0, 5).join(', ');
    if (customNote) {
      return customNote;
    }
    return `${selectedLevel.label} ${selectedFocus.roleTitle} working with ${
      stackSummary || 'HTML, CSS, and JavaScript'
    }. Comfortable with ${selectedComfort.label.toLowerCase()}.`;
  }, [buildingGoal, selectedTech, selectedLevel, selectedFocus, selectedComfort]);

  const integratedRoleTitle = useMemo(
    () => `${selectedLevel.label} ${selectedFocus.roleTitle}`,
    [selectedLevel.label, selectedFocus.roleTitle]
  );

  const integratedHighlights = useMemo(() => {
    const list = [
      `${selectedLevel.label} Level · ${selectedFocus.label}`,
      `Core Web Strength: ${selectedComfort.label}`,
    ];
    if (selectedTech.length > 0) {
      list.push(`Web Stack: ${selectedTech.slice(0, 6).join(', ')}`);
    }
    if (buildingGoal.trim()) {
      list.push(`Current Focus: ${buildingGoal.trim()}`);
    }
    return list;
  }, [selectedLevel.label, selectedFocus.label, selectedComfort.label, selectedTech, buildingGoal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || session.mode !== 'authenticated') return;

    setErrorMsg(null);
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setErrorMsg('Please enter your name so classmates recognize your profile.');
      return;
    }

    const finalHandle = sanitizeUsername(username);
    if (finalHandle.length < 2) {
      setErrorMsg('Choose a username of at least 2 characters (letters, numbers, ".", "_", or "-").');
      return;
    }

    if (selectedTech.length === 0) {
      setErrorMsg('Select at least one web programming or markup language you use.');
      return;
    }

    setSaving(true);
    try {
      const { profile, error } = await saveUserProfileAndPortfolio(session, {
        username: finalHandle,
        displayName: trimmedName,
        avatarUrl: existingRecord?.avatar_url ?? session.avatarUrl ?? '',
        bio: integratedBio,
        roleTitle: integratedRoleTitle,
        discipline: selectedFocus.discipline,
        projectTitle:
          existingRecord?.project_title?.trim() || `${trimmedName} Portfolio`,
        projectSummary:
          existingRecord?.project_summary?.trim() || integratedBio,
        coverImageUrl: existingRecord?.cover_image_url ?? '',
        portfolioUrl: existingRecord?.portfolio_url ?? session.portfolioUrl ?? '',
        skills: selectedTech,
        highlights: integratedHighlights,
        socialLinks: existingRecord?.social_links ?? {},
        isPublished: Boolean(existingRecord?.is_published),
        onboardingCompleted: true,
      });

      if (error || !profile) {
        setErrorMsg(error ?? 'Could not save your developer profile. Please try again.');
        return;
      }

      onCompleteOnboarding({
        displayName: profile.display_name || trimmedName,
        username: profile.username ?? finalHandle,
        avatarUrl: profile.avatar_url ?? undefined,
        portfolioUrl: profile.portfolio_url ?? undefined,
        needsProfileSetup: false,
      });

      await onRefreshGalleryPortfolios();
      onSkipToGallery();
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated || !session) {
    return (
      <div className="min-h-screen bg-[var(--p-bg)] text-[var(--p-ink)] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] p-7 text-center space-y-4 shadow-lg">
          <h1 className="text-[20px] font-bold">Sign in to configure your profile</h1>
          <p className="text-[14px] text-[var(--p-muted)] leading-relaxed">
            Create or sign in to a cohort account to set your username, web development languages, and developer profile.
          </p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={onNavigateLogin}
              className="h-10 px-5 rounded-lg bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] text-[13px] font-semibold cursor-pointer transition-colors"
            >
              Go to Login
            </button>
            <button
              type="button"
              onClick={onSkipToGallery}
              className="h-10 px-4 rounded-lg border border-[var(--p-border)] hover:bg-[var(--p-surface)] text-[13px] font-medium cursor-pointer transition-colors"
            >
              Back to Gallery
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--p-bg)] text-[var(--p-ink)] transition-colors duration-200">
      <header className="sticky top-0 z-20 border-b border-[var(--p-border)] bg-[var(--p-header-bg)] backdrop-blur-md">
        <div className="max-w-[1180px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-[17px] font-extrabold tracking-tight font-[family-name:var(--font-display)]">
              SE Class A
            </span>
            <span className="text-[12px] text-[var(--p-muted)] hidden sm:inline">
              · Web Developer Profile Setup
            </span>
          </div>

          <button
            type="button"
            onClick={onSkipToGallery}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--p-ink-secondary)] hover:text-[var(--p-ink)] cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Skip for now</span>
          </button>
        </div>
      </header>

      <main className="max-w-[1180px] mx-auto px-6 md:px-10 py-8 md:py-12">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: ANTIGRAVITY_EASE }}
          className="mb-8 max-w-2xl"
        >
          <p className="text-[13px] font-semibold text-[var(--p-accent)] flex items-center gap-1.5 mb-2">
            <Sparkles className="w-4 h-4" />
            <span>Welcome to Software Engineering Class A</span>
          </p>
          <h1 className="text-[clamp(1.75rem,3vw,2.4rem)] font-bold tracking-tight leading-[1.15]">
            Configure your{' '}
            <span className="font-[family-name:var(--font-serif-editorial)] italic font-medium">
              web developer
            </span>{' '}
            profile
          </h1>
          <p className="text-[15px] text-[var(--p-muted)] mt-2.5 leading-relaxed">
            Set your display name, @username, web programming &amp; markup stack, and answer a few quick level questions. Your answers populate your cohort profile automatically.
          </p>
        </motion.div>

        {loadingProfile ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-[var(--p-muted)]">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--p-accent)]" />
            <span className="text-[14px]">Loading your account details...</span>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            {/* Left / Main Setup Form */}
            <div className="lg:col-span-8 space-y-6">
              {errorMsg && (
                <div
                  role="alert"
                  className="p-4 rounded-xl border border-red-600/40 bg-red-500/10 text-[13px] text-red-700 dark:text-red-300 leading-relaxed"
                >
                  {errorMsg}
                </div>
              )}

              {/* Section 1: Name & Username */}
              <section className="p-6 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] space-y-5">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-[var(--p-accent)]/12 text-[var(--p-accent)] text-[12px] font-bold flex items-center justify-center">
                    1
                  </span>
                  <div>
                    <h2 className="text-[16px] font-bold text-[var(--p-ink)]">
                      Your Name &amp; Username
                    </h2>
                    <p className="text-[12px] text-[var(--p-muted)]">
                      Used across your portfolio card, comments, and @mentions
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="onboarding-name"
                      className="block text-[13px] font-semibold text-[var(--p-ink)] mb-1.5"
                    >
                      Full Name
                    </label>
                    <input
                      id="onboarding-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g., Elena Smith"
                      className="w-full h-11 px-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)] focus:ring-3 focus:ring-[var(--p-accent)]/15"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="onboarding-username"
                      className="block text-[13px] font-semibold text-[var(--p-ink)] mb-1.5"
                    >
                      Username
                    </label>
                    <div className="relative">
                      <AtSign className="w-4 h-4 text-[var(--p-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="onboarding-username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={deriveDefaultUsernameFromEmail(session.email)}
                        className="w-full h-11 pl-9 pr-3.5 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[14px] font-[family-name:var(--font-mono)] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)] focus:ring-3 focus:ring-[var(--p-accent)]/15"
                      />
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-[var(--p-muted)] leading-snug">
                      Defaulted from <span className="font-medium text-[var(--p-ink-secondary)]">{session.email}</span>. Saved as{' '}
                      <span className="font-[family-name:var(--font-mono)] text-[var(--p-ink)]">
                        @{sanitizedHandle || 'username'}
                      </span>
                    </p>
                  </div>
                </div>
              </section>

              {/* Section 2: Web Development Languages & Markup */}
              <section className="p-6 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] space-y-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-[var(--p-accent)]/12 text-[var(--p-accent)] text-[12px] font-bold flex items-center justify-center">
                      2
                    </span>
                    <div>
                      <h2 className="text-[16px] font-bold text-[var(--p-ink)]">
                        Web Languages &amp; Markup You Use
                      </h2>
                      <p className="text-[12px] text-[var(--p-muted)]">
                        Focused on web development — select all technologies in your workflow
                      </p>
                    </div>
                  </div>
                  <span className="text-[12px] font-semibold text-[var(--p-accent)] tabular-nums">
                    {selectedTech.length} selected
                  </span>
                </div>

                <div className="space-y-5">
                  {WEB_TECH_GROUPS.map((group) => (
                    <div key={group.id} className="space-y-2.5">
                      <div>
                        <h3 className="text-[13px] font-semibold text-[var(--p-ink)]">
                          {group.title}
                        </h3>
                        <p className="text-[11.5px] text-[var(--p-muted)]">{group.subtitle}</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {group.items.map((tech) => {
                          const active = selectedTech.includes(tech);
                          return (
                            <button
                              key={tech}
                              type="button"
                              aria-pressed={active}
                              onClick={() => toggleTech(tech)}
                              className={`px-3 py-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                active
                                  ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/10 text-[var(--p-ink)] shadow-xs'
                                  : 'border-[var(--p-border)] bg-[var(--p-bg)] text-[var(--p-ink-secondary)] hover:border-[var(--p-border-strong)] hover:text-[var(--p-ink)]'
                              }`}
                            >
                              <span className="flex items-center gap-2.5 min-w-0">
                                <TechLogo name={tech} size={20} />
                                <span className="text-[13px] font-medium truncate">{tech}</span>
                              </span>
                              <span
                                className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                  active
                                    ? 'bg-[var(--p-accent)] border-[var(--p-accent)] text-[var(--p-accent-ink)]'
                                    : 'border-[var(--p-border-strong)]'
                                }`}
                              >
                                {active && <Check className="w-3 h-3" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Section 3: Basic Web Developer Level Questions */}
              <section className="p-6 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] space-y-6">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-[var(--p-accent)]/12 text-[var(--p-accent)] text-[12px] font-bold flex items-center justify-center">
                    3
                  </span>
                  <div>
                    <h2 className="text-[16px] font-bold text-[var(--p-ink)]">
                      Quick Developer Level Questions
                    </h2>
                    <p className="text-[12px] text-[var(--p-muted)]">
                      Integrated directly into your profile role, bio, and highlights
                    </p>
                  </div>
                </div>

                {/* Q1: Skill Level */}
                <div className="space-y-2.5">
                  <p className="text-[13px] font-semibold text-[var(--p-ink)]">
                    What is your current web development experience level?
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {EXPERIENCE_LEVELS.map((opt) => {
                      const active = levelId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setLevelId(opt.id)}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                            active
                              ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/10'
                              : 'border-[var(--p-border)] bg-[var(--p-bg)] hover:border-[var(--p-border-strong)]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[14px] font-bold text-[var(--p-ink)]">
                              {opt.label}
                            </span>
                            <span className="text-[11px] font-semibold text-[var(--p-accent)]">
                              {opt.badge}
                            </span>
                          </div>
                          <p className="text-[12px] text-[var(--p-muted)] leading-snug">
                            {opt.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Q2: Primary Web Focus */}
                <div className="space-y-2.5">
                  <p className="text-[13px] font-semibold text-[var(--p-ink)]">
                    Which web development role fits you best right now?
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {WEB_FOCUS_OPTIONS.map((opt) => {
                      const active = focusId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setFocusId(opt.id)}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                            active
                              ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/10'
                              : 'border-[var(--p-border)] bg-[var(--p-bg)] hover:border-[var(--p-border-strong)]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13.5px] font-bold text-[var(--p-ink)]">
                              {opt.label}
                            </span>
                            {active && <Check className="w-4 h-4 text-[var(--p-accent)] shrink-0" />}
                          </div>
                          <p className="text-[12px] text-[var(--p-muted)] leading-snug">
                            {opt.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Q3: Core Web Comfort */}
                <div className="space-y-2.5">
                  <p className="text-[13px] font-semibold text-[var(--p-ink)]">
                    What are you most comfortable building today?
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {CORE_COMFORT_OPTIONS.map((opt) => {
                      const active = comfortId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setComfortId(opt.id)}
                          className={`px-3.5 py-2.5 rounded-xl border text-left text-[13px] font-medium transition-all flex items-center justify-between gap-3 cursor-pointer ${
                            active
                              ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/10 text-[var(--p-ink)]'
                              : 'border-[var(--p-border)] bg-[var(--p-bg)] text-[var(--p-ink-secondary)] hover:border-[var(--p-border-strong)]'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {active && <Check className="w-4 h-4 text-[var(--p-accent)] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Q4: Short Bio / Current Focus */}
                <div className="space-y-2">
                  <label
                    htmlFor="onboarding-goal"
                    className="block text-[13px] font-semibold text-[var(--p-ink)]"
                  >
                    What are you learning or building next? (Integrates into your profile bio)
                  </label>
                  <textarea
                    id="onboarding-goal"
                    rows={3}
                    value={buildingGoal}
                    onChange={(e) => setBuildingGoal(e.target.value)}
                    placeholder="Optional — leave blank to auto-generate a clean web developer bio from your answers above."
                    className="w-full p-3.5 rounded-xl border border-[var(--p-border)] bg-[var(--p-bg)] text-[13.5px] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)] focus:ring-3 focus:ring-[var(--p-accent)]/15 resize-none"
                  />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {GOAL_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() =>
                          setBuildingGoal(
                            `Building ${suggestion.toLowerCase()} with ${selectedTech
                              .slice(0, 3)
                              .join(', ')}.`
                          )
                        }
                        className="px-2.5 py-1 rounded-md border border-[var(--p-border)] bg-[var(--p-surface)] text-[11.5px] text-[var(--p-ink-secondary)] hover:text-[var(--p-ink)] hover:border-[var(--p-border-strong)] cursor-pointer transition-colors"
                      >
                        + {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={onSkipToGallery}
                  className="h-12 px-5 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[14px] font-medium text-[var(--p-ink)] cursor-pointer transition-colors"
                >
                  Remind me later on Home
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-12 px-6 rounded-xl bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] text-[14px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  <span>Save &amp; Complete Profile</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right Column: Live Profile Integration Preview */}
            <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
              <div className="p-5 rounded-2xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] space-y-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 text-[12px] font-semibold text-[var(--p-muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-[var(--p-accent)]" />
                    <span>Live Profile Preview</span>
                  </span>
                  <span>{selectedFocus.discipline}</span>
                </div>

                <div className="flex items-center gap-3">
                  {session.avatarUrl ? (
                    <img
                      src={session.avatarUrl}
                      alt={displayName || session.displayName}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-full object-cover border border-[var(--p-border)] shrink-0"
                    />
                  ) : (
                    <span className="w-12 h-12 rounded-full bg-[var(--p-accent)] text-[var(--p-accent-ink)] text-[14px] font-bold flex items-center justify-center shrink-0">
                      {(displayName || session.displayName).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-[var(--p-ink)] truncate">
                      {displayName.trim() || session.displayName}
                    </p>
                    <p className="text-[12px] font-[family-name:var(--font-mono)] text-[var(--p-accent)] truncate">
                      @{sanitizedHandle || 'username'}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--p-surface-subtle)] border border-[var(--p-border)] space-y-1.5">
                  <p className="text-[12.5px] font-semibold text-[var(--p-ink)]">
                    {integratedRoleTitle}
                  </p>
                  <p className="text-[12.5px] text-[var(--p-ink-secondary)] leading-relaxed">
                    {integratedBio}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--p-ink)]">
                    <Code2 className="w-3.5 h-3.5 text-[var(--p-accent)]" />
                    <span>Selected Web Stack</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTech.length > 0 ? (
                      selectedTech.map((tech) => (
                        <span
                          key={tech}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--p-border)] bg-[var(--p-bg)] text-[11.5px] font-medium text-[var(--p-ink)]"
                        >
                          <TechLogo name={tech} size={14} />
                          <span>{tech}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-[12px] text-[var(--p-muted)]">
                        Select at least 1 web technology
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--p-border)] space-y-1.5">
                  <p className="text-[11.5px] font-semibold text-[var(--p-muted)]">
                    Profile Highlights Added
                  </p>
                  <ul className="space-y-1 text-[12px] text-[var(--p-ink-secondary)]">
                    {integratedHighlights.slice(0, 3).map((item) => (
                      <li key={item} className="flex items-start gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>
          </form>
        )}
      </main>
    </div>
  );
};
