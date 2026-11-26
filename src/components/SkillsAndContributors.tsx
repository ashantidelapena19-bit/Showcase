import React, { useMemo, useState } from 'react';
import { ArrowUpRight, FolderCode } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { StudentPortfolio } from '../data/portfolios';
import { aggregateTechStack, canonicalizeSkillName } from '../lib/techStack';
import { useAntigravityScroll } from './AntigravityScrollProvider';
import { SocialLinksBar } from './SocialLinksBar';
import { TechLogo } from './TechLogo';

interface SkillsAndContributorsProps {
  portfolios: StudentPortfolio[];
  selectedSkill: string | null;
  onSelectSkill: (skill: string | null) => void;
  onSelectPortfolio: (item: StudentPortfolio) => void;
}

const ANTIGRAVITY_EASE = [0.22, 1, 0.36, 1] as const;
const INITIAL_VISIBLE_TECH_LIMIT = 15;

export const SkillsAndContributors: React.FC<SkillsAndContributorsProps> = ({
  portfolios,
  selectedSkill,
  onSelectSkill,
  onSelectPortfolio,
}) => {
  const { scrollTo } = useAntigravityScroll();
  const shouldReduceMotion = useReducedMotion();
  const [stackScope, setStackScope] = useState<'all' | 'uploaded'>('all');
  const [showAllTech, setShowAllTech] = useState(false);

  const uploadedPortfolios = useMemo(
    () => portfolios.filter((p) => p.isPublishedCommunity),
    [portfolios]
  );

  const effectiveScope =
    stackScope === 'uploaded' && uploadedPortfolios.length > 0 ? 'uploaded' : 'all';

  const scopedPortfolios = useMemo(
    () => (effectiveScope === 'uploaded' ? uploadedPortfolios : portfolios),
    [effectiveScope, uploadedPortfolios, portfolios]
  );

  const liveTechStack = useMemo(
    () => aggregateTechStack(scopedPortfolios),
    [scopedPortfolios]
  );

  const visibleTechStack = useMemo(() => {
    if (showAllTech || liveTechStack.length <= INITIAL_VISIBLE_TECH_LIMIT) {
      return liveTechStack;
    }
    const topSlice = liveTechStack.slice(0, INITIAL_VISIBLE_TECH_LIMIT);
    if (!selectedSkill) return topSlice;
    const canonicalSelected = canonicalizeSkillName(selectedSkill).toLowerCase();
    const hasSelected = topSlice.some(
      (item) => item.name.toLowerCase() === canonicalSelected
    );
    if (hasSelected) return topSlice;
    const selectedItem = liveTechStack.find(
      (item) => item.name.toLowerCase() === canonicalSelected
    );
    return selectedItem ? [...topSlice.slice(0, -1), selectedItem] : topSlice;
  }, [liveTechStack, showAllTech, selectedSkill]);

  const canonicalSelectedSkill = selectedSkill
    ? canonicalizeSkillName(selectedSkill).toLowerCase()
    : null;

  return (
    <>
      {/* Dynamic Technical Stack Filter Matrix */}
      <section
        id="tech-stack"
        className="border-t border-[var(--p-border)] bg-[var(--p-surface-subtle)] py-16 transition-colors duration-200"
      >
        <div className="max-w-[1360px] mx-auto px-6 md:px-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.65, ease: ANTIGRAVITY_EASE }}
            className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-10"
          >
            <div>
              <h2 className="text-[24px] md:text-[28px] font-bold tracking-tight text-[var(--p-ink)]">
                Class A Technical Stack
              </h2>
              <p className="text-[15px] text-[var(--p-muted)] mt-1.5 max-w-2xl">
                Live stack computed from {scopedPortfolios.length}{' '}
                {effectiveScope === 'uploaded' ? 'uploaded' : 'showcased'}{' '}
                {scopedPortfolios.length === 1 ? 'portfolio' : 'portfolios'} ({liveTechStack.length}{' '}
                {liveTechStack.length === 1 ? 'technology' : 'technologies'}). Select any technology to filter the gallery.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
              {uploadedPortfolios.length > 0 && (
                <div
                  role="group"
                  aria-label="Technical stack portfolio source"
                  className="inline-flex items-center p-1 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)]"
                >
                  <button
                    type="button"
                    onClick={() => setStackScope('all')}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      effectiveScope === 'all'
                        ? 'bg-[var(--p-action)] text-[var(--p-action-ink)]'
                        : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                    }`}
                  >
                    All Showcase ({portfolios.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStackScope('uploaded')}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      effectiveScope === 'uploaded'
                        ? 'bg-[var(--p-action)] text-[var(--p-action-ink)]'
                        : 'text-[var(--p-muted)] hover:text-[var(--p-ink)]'
                    }`}
                  >
                    Uploaded ({uploadedPortfolios.length})
                  </button>
                </div>
              )}

              {selectedSkill && (
                <button
                  type="button"
                  onClick={() => onSelectSkill(null)}
                  className="px-4 py-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-[13px] font-medium text-[var(--p-ink)] hover:bg-[var(--p-surface)] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Reset Skill Filter
                </button>
              )}
            </div>
          </motion.div>

          {visibleTechStack.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {visibleTechStack.map((tech, idx) => {
                  const isActive =
                    canonicalSelectedSkill === tech.name.toLowerCase();
                  return (
                    <motion.button
                      key={tech.name}
                      type="button"
                      initial={{ opacity: 0, y: 22 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.15 }}
                      transition={{
                        duration: 0.55,
                        delay: (idx % 5) * 0.045,
                        ease: ANTIGRAVITY_EASE,
                      }}
                      whileHover={shouldReduceMotion ? undefined : { y: -3 }}
                      onClick={() => {
                        onSelectSkill(isActive ? null : tech.name);
                        scrollTo('#gallery', { offset: -84, duration: 1.15 });
                      }}
                      className={`text-left p-4 rounded-xl border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--p-accent)] flex items-center gap-3.5 ${
                        isActive
                          ? 'bg-[var(--p-action)] text-[var(--p-action-ink)] border-[var(--p-action)]'
                          : 'bg-[var(--p-surface-elevated)] text-[var(--p-ink)] border-[var(--p-border)] hover:border-[var(--p-border-strong)]'
                      }`}
                    >
                      <span
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                          isActive
                            ? 'bg-white/95 border-white/20 shadow-xs'
                            : 'bg-[var(--p-surface-subtle)] border-[var(--p-border)]'
                        }`}
                      >
                        <TechLogo name={tech.name} size={24} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[14px] truncate">
                            {tech.name}
                          </span>
                          <span
                            className={`text-[12px] font-[family-name:var(--font-mono)] tabular-nums shrink-0 ${
                              isActive ? 'opacity-80' : 'text-[var(--p-muted)]'
                            }`}
                          >
                            {tech.count}
                          </span>
                        </div>
                        <div
                          className={`text-[12px] mt-0.5 truncate ${
                            isActive ? 'opacity-75' : 'text-[var(--p-muted)]'
                          }`}
                        >
                          {tech.category}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {liveTechStack.length > INITIAL_VISIBLE_TECH_LIMIT && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllTech((prev) => !prev)}
                    className="px-4 py-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:bg-[var(--p-surface)] text-[13px] font-semibold text-[var(--p-ink)] transition-colors cursor-pointer"
                  >
                    {showAllTech
                      ? 'Show Top Technologies'
                      : `Show All ${liveTechStack.length} Technologies`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-center text-[14px] text-[var(--p-muted)]">
              No technical stack tags have been added to these portfolios yet.
            </div>
          )}
        </div>
      </section>

      {/* 3-Column Student Contributor Directory */}
      <section
        id="contributors"
        className="border-t border-[var(--p-border)] bg-[var(--p-bg)] py-16 transition-colors duration-200"
      >
        <div className="max-w-[1360px] mx-auto px-6 md:px-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.65, ease: ANTIGRAVITY_EASE }}
            className="mb-10"
          >
            <h2 className="text-[24px] md:text-[28px] font-bold tracking-tight text-[var(--p-ink)]">
              Individual Contributors & Portfolio Sites
            </h2>
            <p className="text-[15px] text-[var(--p-muted)] mt-1.5 max-w-2xl">
              Every Software Engineering Class A student authors and maintains an independent portfolio site inside the cohort directory.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {portfolios.map((student, idx) => (
              <motion.div
                key={student.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.12 }}
                transition={{
                  duration: 0.65,
                  delay: (idx % 3) * 0.07,
                  ease: ANTIGRAVITY_EASE,
                }}
                className="p-6 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] hover:border-[var(--p-border-strong)] transition-colors flex flex-col justify-between gap-5"
              >
                <div>
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center text-base font-bold text-white shrink-0 select-none"
                      style={{ backgroundColor: student.avatarColor }}
                    >
                      {student.avatarUrl ? (
                        <img
                          src={student.avatarUrl}
                          alt={student.studentName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        student.initials
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[16px] font-bold text-[var(--p-ink)] truncate">
                        {student.studentName}
                      </h3>
                      <p className="text-[13px] text-[var(--p-muted)] truncate">
                        {student.username ? `@${student.username}` : student.rollNumber} ·{' '}
                        {student.roleTitle}
                      </p>
                    </div>
                  </div>

                  <p className="text-[14px] text-[var(--p-ink-secondary)] mt-4 leading-relaxed">
                    {student.projectSummary}
                  </p>

                  {student.socialLinks && (
                    <div className="mt-3.5">
                      <SocialLinksBar links={student.socialLinks} size="sm" />
                    </div>
                  )}

                  <div className="mt-3 text-[12px] text-[var(--p-muted)]">
                    {student.highlights.join(' · ')}
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--p-border)] flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectPortfolio(student)}
                    className="text-[13px] font-semibold text-[var(--p-ink)] hover:text-[var(--p-accent)] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {student.portfolioUrl ? 'Preview Site' : 'View Portfolio'}
                  </button>
                  {student.portfolioUrl ? (
                    <a
                      href={student.portfolioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--p-muted)] hover:text-[var(--p-ink)] transition-colors whitespace-nowrap"
                    >
                      <span>
                        {student.isPublishedCommunity ? 'Open Site' : 'Open index.html'}
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <span className="text-[12px] text-[var(--p-muted)]">
                      Published Showcase
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Nested Architecture / Site Map Section */}
      <section
        id="structure"
        className="border-t border-[var(--p-border)] bg-[var(--p-surface-subtle)] py-14 transition-colors duration-200"
      >
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.68, ease: ANTIGRAVITY_EASE }}
          className="max-w-[1360px] mx-auto px-6 md:px-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
        >
          <div className="lg:col-span-5">
            <h2 className="text-[22px] font-bold tracking-tight text-[var(--p-ink)]">
              Nested Portfolio Architecture
            </h2>
            <p className="text-[14px] text-[var(--p-muted)] mt-2 leading-relaxed">
              The root gallery showcases every student’s work in a unified Dribbble-style grid while linking directly to each contributor’s standalone HTML site under{' '}
              <code className="font-[family-name:var(--font-mono)] text-[var(--p-ink)]">student-portfolios/</code>.
            </p>
          </div>

          <div className="lg:col-span-7 bg-[var(--p-surface-elevated)] border border-[var(--p-border)] rounded-xl p-5 font-[family-name:var(--font-mono)] text-[12px] text-[var(--p-ink-secondary)] space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-[var(--p-ink)]">
              <FolderCode className="w-4 h-4 text-[var(--p-accent)]" />
              <span>index.html (Class A Gallery Hub)</span>
            </div>
            <div className="pl-6 text-[var(--p-muted)]">student-portfolios/</div>
            <div className="pl-10 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {portfolios
                .filter((p) => !p.isPublishedCommunity)
                .map((p) => (
                  <a
                    key={p.id}
                    href={p.portfolioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--p-accent)] transition-colors truncate"
                  >
                    {p.folderName}/index.html
                  </a>
                ))}
            </div>
          </div>
        </motion.div>
      </section>
    </>
  );
};
