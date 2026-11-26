import React, { useRef } from 'react';
import { ExternalLink, Eye, Heart, MessageCircle } from 'lucide-react';
import {
  motion,
  MotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react';
import { StudentPortfolio } from '../data/portfolios';
import { PortfolioThumbnailMedia } from './PortfolioThumbnailMedia';

interface ShotCardProps {
  item: StudentPortfolio;
  index?: number;
  columnLagY?: MotionValue<number>;
  isLiked: boolean;
  canHeart?: boolean;
  onToggleLike: (id: string) => void;
  onSelectPortfolio: (item: StudentPortfolio) => void;
}

const ANTIGRAVITY_EASE = [0.22, 1, 0.36, 1] as const;

function formatCompactCount(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1)}k`;
}

export const ShotCard: React.FC<ShotCardProps> = ({
  item,
  index = 0,
  columnLagY,
  isLiked,
  canHeart = true,
  onToggleLike,
  onSelectPortfolio,
}) => {
  const cardRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const displayLikes = item.likes;
  const displayComments = item.commentsCount ?? 0;

  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ['start end', 'end start'],
  });

  // Lenis already drives smooth damped scrollY each RAF frame; mapping directly
  // avoids ~25+ extra concurrent spring loops competing on 60Hz frames.
  const imageParallaxY = useTransform(scrollYProgress, [0, 1], [-10, 10]);

  return (
    <motion.article
      ref={cardRef}
      className="flex flex-col"
    >
      <motion.div
        style={shouldReduceMotion ? undefined : { y: columnLagY }}
        className="flex flex-col will-change-transform"
      >
        <motion.div
          initial={{ opacity: 0, y: 34, scale: 0.985 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.12 }}
          transition={{
            duration: 0.72,
            delay: (index % 3) * 0.075,
            ease: ANTIGRAVITY_EASE,
          }}
          className="flex flex-col"
        >
          {/* 4:3 Dribbble Shot Container */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectPortfolio(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectPortfolio(item);
              }
            }}
            aria-label={`Preview ${item.studentName}'s portfolio: ${item.projectTitle}`}
            className="group relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-[var(--p-surface)] border border-[var(--p-border)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--p-accent)]"
          >
            <div className="relative z-10 w-full h-full">
              <PortfolioThumbnailMedia
                portfolioId={item.id}
                mode={item.thumbnailMode}
                title={item.projectTitle}
                studentName={item.studentName}
                username={item.username}
                discipline={item.discipline}
                projectSummary={item.projectSummary}
                skills={item.skills}
                avatarUrl={item.avatarUrl}
                avatarColor={item.avatarColor}
                initials={item.initials}
                thumbnail={item.thumbnail}
                fallbackGradient={item.fallbackGradient}
                portfolioHtml={item.portfolioHtml}
                portfolioUrl={item.portfolioUrl}
                parallaxY={imageParallaxY}
              />
            </div>

            {/* Hover Reveal Scrim */}
            <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#0D0C22]/85 via-[#0D0C22]/20 to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-200 flex items-end justify-between p-4 gap-3">
              <div className="min-w-0 text-left">
                <h3 className="text-white font-semibold text-[15px] leading-snug truncate">
                  {item.projectTitle}
                </h3>
                <p className="text-white/80 text-[12px] truncate mt-0.5">
                  {item.skills.slice(0, 3).join(' · ')}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLike(item.id);
                  }}
                  aria-label={
                    !canHeart
                      ? `Sign in to heart ${item.projectTitle}`
                      : isLiked
                        ? `Remove heart from ${item.projectTitle}`
                        : `Heart ${item.projectTitle}`
                  }
                  title={
                    !canHeart
                      ? 'Sign in to heart portfolios'
                      : isLiked
                        ? 'Remove heart'
                        : 'Heart portfolio'
                  }
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                    isLiked
                      ? 'bg-[var(--p-accent)] text-[var(--p-accent-ink)]'
                      : 'bg-white text-[#0D0C22] hover:bg-[#F3F3F6]'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                </button>
                {item.portfolioUrl && (
                  <a
                    href={item.portfolioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Open ${item.studentName}'s standalone portfolio in new tab`}
                    className="w-9 h-9 rounded-full bg-white text-[#0D0C22] hover:bg-[#F3F3F6] flex items-center justify-center transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Dribbble-Style Clean Metadata Footer Row (Zero Pill Capsules) */}
          <div className="flex items-center justify-between gap-3 mt-2.5 px-0.5">
            <button
              type="button"
              onClick={() => onSelectPortfolio(item)}
              className="flex items-center gap-2 min-w-0 text-left group/meta cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--p-accent)] rounded"
            >
              <span
                className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold text-white shrink-0 select-none"
                style={{ backgroundColor: item.avatarColor }}
                aria-hidden="true"
              >
                {item.avatarUrl ? (
                  <img
                    src={item.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  item.initials
                )}
              </span>
              <span className="text-[14px] font-semibold text-[var(--p-ink)] group-hover/meta:text-[var(--p-accent)] transition-colors truncate">
                {item.studentName}
              </span>
              <span className="hidden xl:inline text-[12px] text-[var(--p-muted)] whitespace-nowrap shrink-0">
                · {item.username ? `@${item.username}` : item.discipline}
              </span>
            </button>

            <div className="flex items-center gap-3 text-[12px] font-medium text-[var(--p-muted)] shrink-0 tabular-nums">
              <button
                type="button"
                onClick={() => onToggleLike(item.id)}
                aria-label={`Heart count ${displayLikes}`}
                title={!canHeart ? 'Sign in to heart portfolios' : undefined}
                className={`inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  isLiked ? 'text-[var(--p-accent)]' : 'hover:text-[var(--p-ink)]'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
                <span>{displayLikes}</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectPortfolio(item)}
                aria-label={`${displayComments} comments`}
                title="View comments"
                className="inline-flex items-center gap-1 hover:text-[var(--p-ink)] transition-colors cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{displayComments}</span>
              </button>
              <span className="inline-flex items-center gap-1" aria-label={`${item.views} views`}>
                <Eye className="w-3.5 h-3.5 text-[var(--p-muted)]" />
                <span>{formatCompactCount(item.views)}</span>
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </motion.article>
  );
};
