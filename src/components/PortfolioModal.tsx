import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  ExternalLink,
  Eye,
  Heart,
  LogIn,
  MessageCircle,
  Presentation,
  SmilePlus,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { StudentPortfolio } from '../data/portfolios';
import {
  addCommentReaction,
  addPortfolioComment,
  type AuthSession,
  COMMENT_REACTION_EMOJIS,
  type CommentReactionBucket,
  type CommentReactionEmoji,
  type CommentReactionsMap,
  deletePortfolioComment,
  extractMentionHandles,
  fetchPortfolioCommentReactions,
  fetchPortfolioComments,
  type MentionableUser,
  type PortfolioComment,
  sanitizeUsername,
  searchMentionableUsers,
  validateMentionedUsernames,
} from '../lib/supabase';
import {
  SmoothScrollArea,
  useAntigravityScroll,
} from './AntigravityScrollProvider';
import { MentionCommentComposer } from './MentionCommentComposer';
import { PortfolioThumbnailMedia } from './PortfolioThumbnailMedia';
import { SocialLinksBar } from './SocialLinksBar';
import { TechLogo } from './TechLogo';

interface PortfolioModalProps {
  portfolio: StudentPortfolio | null;
  allPortfolios: StudentPortfolio[];
  session: AuthSession | null;
  isLiked: boolean;
  onToggleLike: (id: string) => void;
  onNavigateLogin: () => void;
  onCommentCountChange: (portfolioId: string, count: number) => void;
  onClose: () => void;
  onNavigate: (portfolio: StudentPortfolio) => void;
  onReview: (portfolio: StudentPortfolio) => void;
}

const ANTIGRAVITY_EASE = [0.22, 1, 0.36, 1] as const;

function formatCommentTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString();
}

function getCommentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SE';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const MENTION_SPLIT_RE = /(@[a-z0-9][a-z0-9._-]{0,31})/gi;

function renderCommentBodyWithMentions(
  body: string,
  portfoliosByUsername: Map<string, StudentPortfolio>,
  existingUsernamesLower: Set<string>,
  onNavigatePortfolio: (p: StudentPortfolio) => void
): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MENTION_SPLIT_RE.lastIndex = 0;

  while ((match = MENTION_SPLIT_RE.exec(body)) !== null) {
    const token = match[1];
    const start = match.index;
    const prevChar = start > 0 ? body[start - 1] : '';
    const isBoundary = start === 0 || /[\s([\]{}"',;:!?]/.test(prevChar);

    if (!isBoundary) {
      continue;
    }

    const handle = token.slice(1);
    const handleLower = handle.toLowerCase();
    const isExistingUser = existingUsernamesLower.has(handleLower);

    // Non-existent usernames must not render or behave as mentions
    if (!isExistingUser) {
      continue;
    }

    if (start > lastIndex) {
      nodes.push(body.slice(lastIndex, start));
    }

    const linkedPortfolio = portfoliosByUsername.get(handleLower);
    if (linkedPortfolio) {
      nodes.push(
        <button
          key={`${start}-${token}`}
          type="button"
          onClick={() => onNavigatePortfolio(linkedPortfolio)}
          title={`View ${linkedPortfolio.studentName}'s portfolio`}
          className="text-[var(--p-accent)] font-semibold hover:underline cursor-pointer"
        >
          {token}
        </button>
      );
    } else {
      nodes.push(
        <span
          key={`${start}-${token}`}
          className="text-[var(--p-accent)] font-semibold"
        >
          {token}
        </span>
      );
    }
    lastIndex = start + token.length;
  }

  if (lastIndex < body.length) {
    nodes.push(body.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : body;
}

function collectDescendantCommentIds(
  comments: PortfolioComment[],
  rootId: string
): Set<string> {
  const toDelete = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of comments) {
      if (
        c.parent_comment_id &&
        toDelete.has(c.parent_comment_id) &&
        !toDelete.has(c.id)
      ) {
        toDelete.add(c.id);
        changed = true;
      }
    }
  }
  return toDelete;
}

function applyOptimisticAddReaction(
  existing: CommentReactionBucket[],
  emoji: CommentReactionEmoji
): CommentReactionBucket[] {
  const found = existing.find((b) => b.emoji === emoji);
  if (found) {
    return existing.map((b) =>
      b.emoji === emoji ? { ...b, count: b.count + 1, reactedByMe: true } : b
    );
  }
  const inserted = [...existing, { emoji, count: 1, reactedByMe: true }];
  const order = new Map<CommentReactionEmoji, number>(
    COMMENT_REACTION_EMOJIS.map((e, i) => [e, i])
  );
  return inserted.sort(
    (a, b) => (order.get(a.emoji) ?? 99) - (order.get(b.emoji) ?? 99)
  );
}

interface ReplyTargetState {
  commentId: string;
  rootId: string;
  authorName: string;
  authorUsername?: string | null;
}

export const PortfolioModal: React.FC<PortfolioModalProps> = ({
  portfolio,
  allPortfolios,
  session,
  isLiked,
  onToggleLike,
  onNavigateLogin,
  onCommentCountChange,
  onClose,
  onNavigate,
  onReview,
}) => {
  const { pauseScroll, resumeScroll } = useAntigravityScroll();
  const [comments, setComments] = useState<PortfolioComment[]>([]);
  const [reactionsByComment, setReactionsByComment] =
    useState<CommentReactionsMap>({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTargetState | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [openPickerCommentId, setOpenPickerCommentId] = useState<string | null>(
    null
  );
  const [mentionDirectory, setMentionDirectory] = useState<MentionableUser[]>(
    []
  );

  useEffect(() => {
    if (!portfolio) return;
    pauseScroll();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      resumeScroll();
    };
  }, [portfolio, onClose, pauseScroll, resumeScroll]);

  useEffect(() => {
    if (!openPickerCommentId) return;
    const handleClickOutside = () => {
      setOpenPickerCommentId(null);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [openPickerCommentId]);

  useEffect(() => {
    if (!portfolio) {
      setComments([]);
      setReactionsByComment({});
      setCommentBody('');
      setCommentError(null);
      setReplyTarget(null);
      setReplyBody('');
      setOpenPickerCommentId(null);
      return;
    }

    let cancelled = false;
    setCommentsLoading(true);
    setCommentError(null);
    setReplyTarget(null);
    setReplyBody('');
    setOpenPickerCommentId(null);

    void Promise.all([
      fetchPortfolioComments(portfolio.id),
      fetchPortfolioCommentReactions(portfolio.id, session?.authUserId),
      searchMentionableUsers('', [], { limit: 50 }),
    ]).then(([commentsRes, reactionsRes, directoryUsers]) => {
      if (cancelled) return;
      setComments(commentsRes.comments);
      setReactionsByComment(reactionsRes.reactionsByComment);
      setMentionDirectory(directoryUsers);
      setCommentsLoading(false);
      if (commentsRes.error) {
        setCommentError(
          commentsRes.error.includes('does not exist') ||
            commentsRes.error.includes('permission')
            ? 'Comments table is not set up yet. Run the latest supabase/schema.sql in your Supabase SQL Editor.'
            : commentsRes.error
        );
      } else {
        onCommentCountChange(portfolio.id, commentsRes.comments.length);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [portfolio?.id, session?.authUserId, onCommentCountChange]);

  const isAuthenticated = session?.mode === 'authenticated';

  const portfoliosByUsername = useMemo(() => {
    const map = new Map<string, StudentPortfolio>();
    for (const p of allPortfolios) {
      const uname = p.username ? sanitizeUsername(p.username) : '';
      if (uname && !map.has(uname.toLowerCase())) {
        map.set(uname.toLowerCase(), p);
      }
    }
    return map;
  }, [allPortfolios]);

  const localMentionCandidates = useMemo<MentionableUser[]>(() => {
    const map = new Map<string, MentionableUser>();
    const addCandidate = (candidate: MentionableUser) => {
      const uname = sanitizeUsername(candidate.username);
      if (!uname) return;
      const key = uname.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { ...candidate, username: uname });
      }
    };

    for (const user of mentionDirectory) {
      addCandidate(user);
    }
    for (const p of allPortfolios) {
      if (p.username) {
        addCandidate({
          username: p.username,
          displayName: p.studentName,
          avatarUrl: p.avatarUrl,
          portfolioId: p.id,
        });
      }
    }
    for (const c of comments) {
      if (c.author_username) {
        addCandidate({
          username: c.author_username,
          displayName: c.author_name,
          avatarUrl: c.author_avatar_url ?? undefined,
        });
      }
    }
    if (session?.username) {
      addCandidate({
        username: session.username,
        displayName: session.displayName,
        avatarUrl: session.avatarUrl,
      });
    }
    return Array.from(map.values());
  }, [
    mentionDirectory,
    allPortfolios,
    comments,
    session?.username,
    session?.displayName,
    session?.avatarUrl,
  ]);

  const existingUsernamesLower = useMemo(() => {
    const set = new Set<string>();
    for (const user of localMentionCandidates) {
      set.add(user.username.toLowerCase());
    }
    return set;
  }, [localMentionCandidates]);

  // Verify any @mentions appearing in loaded comments so highlights reflect real users
  useEffect(() => {
    if (comments.length === 0) return;
    const handles = new Set<string>();
    for (const c of comments) {
      for (const h of extractMentionHandles(c.body)) {
        if (!existingUsernamesLower.has(h.toLowerCase())) {
          handles.add(h);
        }
      }
    }
    if (handles.size === 0) return;
    let cancelled = false;
    void validateMentionedUsernames(
      Array.from(handles),
      existingUsernamesLower
    ).then(({ verifiedUsers }) => {
      if (cancelled || verifiedUsers.length === 0) return;
      setMentionDirectory((prev) => {
        const seen = new Set(prev.map((u) => u.username.toLowerCase()));
        const additions = verifiedUsers.filter(
          (u) => !seen.has(u.username.toLowerCase())
        );
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [comments, existingUsernamesLower]);

  const { topLevelComments, repliesByRootId, commentById } = useMemo(() => {
    const byId = new Map<string, PortfolioComment>();
    for (const c of comments) {
      byId.set(c.id, c);
    }

    const resolveRootId = (comment: PortfolioComment): string => {
      let current: PortfolioComment = comment;
      const seen = new Set<string>([current.id]);
      while (current.parent_comment_id && byId.has(current.parent_comment_id)) {
        const parent = byId.get(current.parent_comment_id)!;
        if (seen.has(parent.id)) break;
        seen.add(parent.id);
        current = parent;
      }
      return current.id;
    };

    const topLevel: PortfolioComment[] = [];
    const repliesMap = new Map<string, PortfolioComment[]>();

    for (const c of comments) {
      if (!c.parent_comment_id || !byId.has(c.parent_comment_id)) {
        topLevel.push(c);
      } else {
        const rootId = resolveRootId(c);
        const bucket = repliesMap.get(rootId) ?? [];
        bucket.push(c);
        repliesMap.set(rootId, bucket);
      }
    }

    repliesMap.forEach((list) => {
      list.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

    return {
      topLevelComments: topLevel,
      repliesByRootId: repliesMap,
      commentById: byId,
    };
  }, [comments]);

  const verifyMentionsBeforePost = async (text: string): Promise<boolean> => {
    const mentioned = extractMentionHandles(text);
    if (mentioned.length === 0) return true;

    const { invalidHandles, verifiedUsers } = await validateMentionedUsernames(
      mentioned,
      existingUsernamesLower
    );

    if (verifiedUsers.length > 0) {
      setMentionDirectory((prev) => {
        const seen = new Set(prev.map((u) => u.username.toLowerCase()));
        const additions = verifiedUsers.filter(
          (u) => !seen.has(u.username.toLowerCase())
        );
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    }

    if (invalidHandles.length > 0) {
      const formatted = invalidHandles.map((h) => `@${h}`).join(', ');
      setCommentError(
        `Cannot mention ${formatted} because that user does not exist. Select a mentionable user from the @ suggestion list.`
      );
      return false;
    }

    return true;
  };

  const handleSubmitComment = async () => {
    if (!portfolio || !session || !isAuthenticated || commentSubmitting) return;
    if (!commentBody.trim()) return;

    setCommentSubmitting(true);
    setCommentError(null);

    const mentionsOk = await verifyMentionsBeforePost(commentBody);
    if (!mentionsOk) {
      setCommentSubmitting(false);
      return;
    }

    const { comment, error } = await addPortfolioComment(
      portfolio.id,
      session,
      commentBody
    );
    setCommentSubmitting(false);

    if (error || !comment) {
      setCommentError(error ?? 'Could not post comment.');
      return;
    }

    setCommentBody('');
    setComments((prev) => {
      const next = [comment, ...prev];
      onCommentCountChange(portfolio.id, next.length);
      return next;
    });
  };

  const handleOpenReply = (comment: PortfolioComment, rootId: string) => {
    if (!isAuthenticated) {
      setCommentError('Sign in with your account to reply to comments.');
      return;
    }
    setCommentError(null);
    if (replyTarget?.commentId === comment.id) {
      setReplyTarget(null);
      setReplyBody('');
      return;
    }
    setReplyTarget({
      commentId: comment.id,
      rootId,
      authorName: comment.author_name,
      authorUsername: comment.author_username,
    });
    setReplyBody(comment.author_username ? `@${comment.author_username} ` : '');
  };

  const handleSubmitReply = async () => {
    if (
      !portfolio ||
      !session ||
      !isAuthenticated ||
      !replyTarget ||
      replySubmitting ||
      !replyBody.trim()
    ) {
      return;
    }

    setReplySubmitting(true);
    setCommentError(null);

    const mentionsOk = await verifyMentionsBeforePost(replyBody);
    if (!mentionsOk) {
      setReplySubmitting(false);
      return;
    }

    const { comment, error } = await addPortfolioComment(
      portfolio.id,
      session,
      replyBody,
      replyTarget.commentId
    );
    setReplySubmitting(false);

    if (error || !comment) {
      setCommentError(error ?? 'Could not post reply.');
      return;
    }

    setReplyBody('');
    setReplyTarget(null);
    setComments((prev) => {
      const next = [...prev, comment];
      onCommentCountChange(portfolio.id, next.length);
      return next;
    });
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!portfolio || !session?.authUserId || deletingId) return;
    setDeletingId(commentId);
    const { error } = await deletePortfolioComment(commentId, session.authUserId);
    setDeletingId(null);

    if (error) {
      setCommentError(error);
      return;
    }

    setComments((prev) => {
      const idsToRemove = collectDescendantCommentIds(prev, commentId);
      const next = prev.filter((c) => !idsToRemove.has(c.id));
      onCommentCountChange(portfolio.id, next.length);
      if (replyTarget && idsToRemove.has(replyTarget.commentId)) {
        setReplyTarget(null);
        setReplyBody('');
      }
      return next;
    });
  };

  const handleAddReaction = async (
    commentId: string,
    emoji: CommentReactionEmoji
  ) => {
    if (!portfolio) return;
    if (!isAuthenticated || !session?.authUserId) {
      setCommentError('Sign in with your account to react to comments.');
      setOpenPickerCommentId(null);
      return;
    }

    const previousBuckets = reactionsByComment[commentId] ?? [];
    if (previousBuckets.some((b) => b.reactedByMe)) {
      setCommentError('You can only react once to a comment.');
      setOpenPickerCommentId(null);
      return;
    }

    setCommentError(null);
    setOpenPickerCommentId(null);

    // Optimistic one-time add
    setReactionsByComment((prev) => ({
      ...prev,
      [commentId]: applyOptimisticAddReaction(prev[commentId] ?? [], emoji),
    }));

    const { error, alreadyReacted } = await addCommentReaction(
      commentId,
      portfolio.id,
      session.authUserId,
      emoji
    );

    if (error) {
      if (alreadyReacted) {
        const refreshed = await fetchPortfolioCommentReactions(
          portfolio.id,
          session.authUserId
        );
        if (refreshed.schemaReady) {
          setReactionsByComment(refreshed.reactionsByComment);
        } else {
          setReactionsByComment((prev) => ({
            ...prev,
            [commentId]: previousBuckets,
          }));
        }
      } else {
        setReactionsByComment((prev) => ({
          ...prev,
          [commentId]: previousBuckets,
        }));
      }
      setCommentError(error);
    }
  };

  const currentIdx = portfolio
    ? allPortfolios.findIndex((p) => p.id === portfolio.id)
    : -1;
  const prevItem =
    allPortfolios[(currentIdx - 1 + allPortfolios.length) % allPortfolios.length];
  const nextItem = allPortfolios[(currentIdx + 1) % allPortfolios.length];

  const hasLiveSite = Boolean(portfolio?.portfolioUrl);

  return (
    <AnimatePresence>
      {portfolio && (
        <motion.div
          key="portfolio-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`${portfolio.studentName} portfolio preview`}
          data-lenis-prevent
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: ANTIGRAVITY_EASE }}
          className="fixed inset-0 z-50 bg-[var(--p-backdrop)] backdrop-blur-sm flex items-center justify-center p-3 md:p-6"
          onClick={onClose}
        >
          <motion.div
            key="portfolio-modal-panel"
            initial={{ opacity: 0, y: 22, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.99 }}
            transition={{ duration: 0.36, ease: ANTIGRAVITY_EASE }}
            className="w-full max-w-[1360px] h-[92vh] bg-[var(--p-surface-elevated)] rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-[var(--p-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Inspector Bar */}
            <div className="px-4 md:px-6 py-3.5 border-b border-[var(--p-border)] flex items-center justify-between gap-4 bg-[var(--p-surface-elevated)] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: portfolio.avatarColor }}
                >
                  {portfolio.avatarUrl ? (
                    <img
                      src={portfolio.avatarUrl}
                      alt={portfolio.studentName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    portfolio.initials
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-bold text-[var(--p-ink)] truncate">
                      {portfolio.studentName}
                    </h2>
                    {portfolio.username && (
                      <span className="text-[12px] text-[var(--p-muted)] hidden sm:inline whitespace-nowrap">
                        @{portfolio.username}
                      </span>
                    )}
                    <span className="text-[12px] text-[var(--p-muted)] hidden md:inline whitespace-nowrap">
                      · {portfolio.roleTitle}
                    </span>
                  </div>
                  <p className="text-[11px] font-[family-name:var(--font-mono)] text-[var(--p-muted)] truncate">
                    {portfolio.sourceType === 'upload'
                      ? `${portfolio.discipline} · Uploaded Website (${portfolio.entryFile || 'index.html'})`
                      : portfolio.isPublishedCommunity
                        ? `${portfolio.discipline} · Published Portfolio`
                        : `student-portfolios/${portfolio.folderName}/index.html`}
                  </p>
                </div>
              </div>

              {/* Live Engagement, Review & Close */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onToggleLike(portfolio.id)}
                  title={
                    isAuthenticated
                      ? isLiked
                        ? 'Remove heart'
                        : 'Heart this portfolio'
                      : 'Sign in to heart portfolios'
                  }
                  className={`h-9 px-3 rounded-lg border text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer tabular-nums ${
                    isLiked
                      ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/12 text-[var(--p-accent)]'
                      : 'border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-[var(--p-ink)] hover:bg-[var(--p-surface)]'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
                  <span>{portfolio.likes}</span>
                </button>

                <span
                  className="hidden sm:inline-flex h-9 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[13px] font-medium text-[var(--p-muted)] items-center gap-1.5 tabular-nums"
                  title="Comments"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{commentsLoading ? (portfolio.commentsCount ?? 0) : comments.length}</span>
                </span>

                <span
                  className="hidden sm:inline-flex h-9 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[13px] font-medium text-[var(--p-muted)] items-center gap-1.5 tabular-nums"
                  title="Total portfolio views"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{portfolio.views.toLocaleString()}</span>
                </span>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReview(portfolio);
                  }}
                  className="h-9 px-4 rounded-lg bg-[var(--p-accent)] text-[var(--p-accent-ink)] text-[13px] font-semibold hover:bg-[var(--p-accent-hover)] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Presentation className="w-3.5 h-3.5" />
                  <span>Review</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close preview modal"
                  className="w-9 h-9 rounded-lg border border-[var(--p-border)] text-[var(--p-ink)] hover:bg-[var(--p-surface)] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body: Editorial Showcase View */}
            <SmoothScrollArea
              resetKey={portfolio.id}
              className="flex-1 overflow-y-auto bg-[var(--p-bg)]"
              contentClassName="p-6 md:p-10"
            >
                <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Cover Media */}
                  <div className="lg:col-span-7">
                    <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden border border-[var(--p-border)] bg-[var(--p-surface)]">
                      <PortfolioThumbnailMedia
                        portfolioId={portfolio.id}
                        mode={portfolio.thumbnailMode}
                        title={portfolio.projectTitle}
                        studentName={portfolio.studentName}
                        username={portfolio.username}
                        discipline={portfolio.discipline}
                        projectSummary={portfolio.projectSummary}
                        skills={portfolio.skills}
                        avatarUrl={portfolio.avatarUrl}
                        avatarColor={portfolio.avatarColor}
                        initials={portfolio.initials}
                        thumbnail={portfolio.thumbnail}
                        fallbackGradient={portfolio.fallbackGradient}
                        portfolioHtml={portfolio.portfolioHtml}
                        portfolioUrl={portfolio.portfolioUrl}
                        lazy={false}
                        interactive={portfolio.thumbnailMode === 'live'}
                      />
                    </div>
                  </div>

                  {/* Profile & Description Details */}
                  <div className="lg:col-span-5 space-y-5">
                    <div className="flex items-center gap-3.5">
                      <span
                        className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-base font-bold text-white shrink-0"
                        style={{ backgroundColor: portfolio.avatarColor }}
                      >
                        {portfolio.avatarUrl ? (
                          <img
                            src={portfolio.avatarUrl}
                            alt={portfolio.studentName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          portfolio.initials
                        )}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-[20px] font-bold text-[var(--p-ink)] truncate">
                          {portfolio.studentName}
                        </h3>
                        <p className="text-[13px] text-[var(--p-muted)] truncate">
                          {portfolio.username ? `@${portfolio.username} · ` : ''}
                          {portfolio.roleTitle}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--p-muted)]">
                        {portfolio.discipline}
                      </div>
                      <h4 className="text-[22px] font-bold tracking-tight text-[var(--p-ink)] leading-snug">
                        {portfolio.projectTitle}
                      </h4>
                      <p className="text-[14px] text-[var(--p-ink-secondary)] leading-relaxed">
                        {portfolio.projectSummary}
                      </p>
                    </div>

                    {portfolio.bio && portfolio.bio !== portfolio.projectSummary && (
                      <div className="p-4 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)]">
                        <p className="text-[12px] font-semibold text-[var(--p-muted)] mb-1">
                          About {portfolio.firstName}
                        </p>
                        <p className="text-[13px] text-[var(--p-ink-secondary)] leading-relaxed">
                          {portfolio.bio}
                        </p>
                      </div>
                    )}

                    {portfolio.skills.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[12px] font-semibold text-[var(--p-muted)]">
                          Technical Stack
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {portfolio.skills.map((skill) => (
                            <span
                              key={skill}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[12px] font-medium text-[var(--p-ink)]"
                            >
                              <TechLogo name={skill} size={15} />
                              <span>{skill}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {portfolio.socialLinks && (
                      <div className="pt-2 space-y-2">
                        <p className="text-[12px] font-semibold text-[var(--p-muted)]">
                          Social & Contact Accounts
                        </p>
                        <SocialLinksBar
                          links={portfolio.socialLinks}
                          size="md"
                          showLabels
                        />
                      </div>
                    )}

                    {hasLiveSite && (
                      <div className="pt-2">
                        <a
                          href={portfolio.portfolioUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full h-11 px-4 rounded-lg bg-[var(--p-action)] text-[var(--p-action-ink)] text-[13px] font-semibold hover:bg-[var(--p-action-hover)] transition-colors inline-flex items-center justify-center gap-2"
                        >
                          <span>Visit External Portfolio Site</span>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comments Section */}
                <section className="max-w-4xl mx-auto mt-10 pt-8 border-t border-[var(--p-border)] space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-[var(--p-accent)]" />
                      <h3 className="text-[16px] font-bold text-[var(--p-ink)]">
                        Comments{' '}
                        <span className="text-[var(--p-muted)] font-medium tabular-nums">
                          ({commentsLoading ? (portfolio.commentsCount ?? 0) : comments.length})
                        </span>
                      </h3>
                    </div>
                  </div>

                  {isAuthenticated ? (
                    <div className="space-y-2.5">
                      <MentionCommentComposer
                        value={commentBody}
                        onChange={setCommentBody}
                        onSubmit={() => void handleSubmitComment()}
                        submitting={commentSubmitting}
                        placeholder={`Share feedback on ${portfolio.firstName}'s portfolio... Type @username to mention someone.`}
                        submitLabel="Post Comment"
                        localCandidates={localMentionCandidates}
                        rows={3}
                        footerLeft={
                          <span className="text-[12px] text-[var(--p-muted)] truncate">
                            Posting as{' '}
                            <strong className="text-[var(--p-ink)]">
                              {session.displayName}
                            </strong>
                          </span>
                        }
                      />
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-[13px] text-[var(--p-ink-secondary)]">
                        Sign in with your account to heart portfolios, comment, reply, and react.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigateLogin();
                        }}
                        className="h-9 px-4 rounded-lg bg-[var(--p-action)] hover:bg-[var(--p-action-hover)] text-[var(--p-action-ink)] text-[13px] font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Sign In</span>
                      </button>
                    </div>
                  )}

                  {commentError && (
                    <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-[13px] text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
                      <span>{commentError}</span>
                      {!isAuthenticated && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onNavigateLogin();
                          }}
                          className="px-3 py-1 rounded-md bg-[var(--p-action)] text-[var(--p-action-ink)] text-[12px] font-semibold shrink-0 cursor-pointer"
                        >
                          Sign In
                        </button>
                      )}
                    </div>
                  )}

                  {commentsLoading ? (
                    <div className="py-6 text-center text-[13px] text-[var(--p-muted)]">
                      Loading comments...
                    </div>
                  ) : comments.length === 0 ? (
                    <div className="py-8 text-center rounded-xl border border-dashed border-[var(--p-border)] text-[13px] text-[var(--p-muted)]">
                      No comments yet. Be the first to share feedback!
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {topLevelComments.map((rootComment) => {
                        const threadReplies =
                          repliesByRootId.get(rootComment.id) ?? [];
                        const isReplyBoxOpen =
                          replyTarget?.rootId === rootComment.id;

                        const renderSingleCommentCard = (
                          comment: PortfolioComment,
                          isReply: boolean
                        ) => {
                          const isCommentAuthor =
                            isAuthenticated &&
                            session?.authUserId === comment.author_user_id;
                          const isPortfolioOwner =
                            Boolean(portfolio.ownerUserId) &&
                            comment.author_user_id === portfolio.ownerUserId;
                          const parentComment =
                            isReply && comment.parent_comment_id
                              ? commentById.get(comment.parent_comment_id)
                              : undefined;
                          const showReplyingToLabel =
                            isReply &&
                            parentComment &&
                            parentComment.id !== rootComment.id;
                          const reactionBuckets =
                            reactionsByComment[comment.id] ?? [];
                          const userHasReacted = reactionBuckets.some(
                            (b) => b.reactedByMe
                          );
                          const pickerOpen =
                            !userHasReacted && openPickerCommentId === comment.id;

                          return (
                            <div
                              key={comment.id}
                              className={`${
                                isReply ? 'p-3.5' : 'p-4'
                              } rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] flex items-start gap-3`}
                            >
                              <span
                                className={`${
                                  isReply ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-[11px]'
                                } rounded-full overflow-hidden bg-[var(--p-action)] text-[var(--p-action-ink)] flex items-center justify-center font-bold shrink-0`}
                              >
                                {comment.author_avatar_url ? (
                                  <img
                                    src={comment.author_avatar_url}
                                    alt={comment.author_name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  getCommentInitials(comment.author_name)
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                    <span className="text-[13px] font-bold text-[var(--p-ink)] truncate">
                                      {comment.author_name}
                                    </span>
                                    {isPortfolioOwner && (
                                      <span
                                        title="Portfolio Owner"
                                        className="px-1.5 py-0.5 rounded border border-[var(--p-accent)]/35 bg-[var(--p-accent)]/12 text-[var(--p-accent)] text-[10px] font-bold uppercase tracking-wider shrink-0"
                                      >
                                        Owner
                                      </span>
                                    )}
                                    {comment.author_username && (
                                      <span className="text-[12px] text-[var(--p-muted)] truncate">
                                        @{comment.author_username}
                                      </span>
                                    )}
                                    {showReplyingToLabel && parentComment && (
                                      <span className="text-[11px] text-[var(--p-muted)] inline-flex items-center gap-1">
                                        <CornerDownRight className="w-3 h-3" />
                                        <span>to {parentComment.author_name}</span>
                                      </span>
                                    )}
                                    <span className="text-[11px] text-[var(--p-muted)] shrink-0">
                                      · {formatCommentTime(comment.created_at)}
                                    </span>
                                  </div>
                                  {isCommentAuthor && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleDeleteComment(comment.id)
                                      }
                                      disabled={deletingId === comment.id}
                                      title="Delete comment"
                                      aria-label="Delete comment"
                                      className="p-1.5 rounded-md text-[var(--p-muted)] hover:text-rose-600 hover:bg-[var(--p-surface)] cursor-pointer transition-colors disabled:opacity-40"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>

                                <p className="mt-1.5 text-[14px] text-[var(--p-ink-secondary)] leading-relaxed whitespace-pre-wrap break-words">
                                  {renderCommentBodyWithMentions(
                                    comment.body,
                                    portfoliosByUsername,
                                    existingUsernamesLower,
                                    onNavigate
                                  )}
                                </p>

                                {/* Reactions & Reply Bar */}
                                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 relative">
                                  {reactionBuckets.map((bucket) => {
                                    const lockedForMe =
                                      isAuthenticated && userHasReacted;
                                    return (
                                      <button
                                        key={bucket.emoji}
                                        type="button"
                                        disabled={lockedForMe}
                                        onClick={() =>
                                          void handleAddReaction(
                                            comment.id,
                                            bucket.emoji
                                          )
                                        }
                                        aria-pressed={bucket.reactedByMe}
                                        title={
                                          !isAuthenticated
                                            ? 'Sign in to react'
                                            : bucket.reactedByMe
                                              ? 'Your reaction (1 reaction per comment)'
                                              : userHasReacted
                                                ? 'You already reacted to this comment'
                                                : `React with ${bucket.emoji} (one-time)`
                                        }
                                        className={`h-7 px-2 rounded-md border text-[12px] font-medium inline-flex items-center gap-1 tabular-nums transition-colors ${
                                          bucket.reactedByMe
                                            ? 'border-[var(--p-accent)] bg-[var(--p-accent)]/12 text-[var(--p-ink)] cursor-default'
                                            : lockedForMe
                                              ? 'border-[var(--p-border)] bg-[var(--p-surface-subtle)] text-[var(--p-ink-secondary)] opacity-75 cursor-default'
                                              : 'border-[var(--p-border)] bg-[var(--p-surface-subtle)] hover:bg-[var(--p-surface)] text-[var(--p-ink-secondary)] cursor-pointer'
                                        }`}
                                      >
                                        <span>{bucket.emoji}</span>
                                        <span>{bucket.count}</span>
                                      </button>
                                    );
                                  })}

                                  {!userHasReacted && (
                                    <div
                                      className="relative"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!isAuthenticated) {
                                            setCommentError(
                                              'Sign in with your account to react to comments.'
                                            );
                                            return;
                                          }
                                          setOpenPickerCommentId((prev) =>
                                            prev === comment.id ? null : comment.id
                                          );
                                        }}
                                        aria-label="Add reaction (one per comment)"
                                        title="Add one reaction"
                                        className="h-7 px-2 rounded-md border border-[var(--p-border)] bg-[var(--p-surface-subtle)] hover:bg-[var(--p-surface)] text-[12px] text-[var(--p-muted)] hover:text-[var(--p-ink)] inline-flex items-center gap-1 cursor-pointer transition-colors"
                                      >
                                        <SmilePlus className="w-3.5 h-3.5" />
                                      </button>

                                      {pickerOpen && (
                                        <div
                                          role="menu"
                                          aria-label="Choose one reaction"
                                          className="absolute left-0 bottom-full mb-1.5 z-30 flex items-center gap-1 p-1 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] shadow-lg"
                                        >
                                          {COMMENT_REACTION_EMOJIS.map((emoji) => (
                                            <button
                                              key={emoji}
                                              type="button"
                                              onClick={() =>
                                                void handleAddReaction(
                                                  comment.id,
                                                  emoji
                                                )
                                              }
                                              className="w-8 h-8 rounded-lg flex items-center justify-center text-[16px] cursor-pointer transition-transform hover:scale-110 hover:bg-[var(--p-surface)]"
                                              aria-label={`React with ${emoji}`}
                                            >
                                              {emoji}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenReply(comment, rootComment.id)
                                    }
                                    className={`h-7 px-2.5 rounded-md text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors ${
                                      replyTarget?.commentId === comment.id
                                        ? 'text-[var(--p-accent)] bg-[var(--p-accent)]/10'
                                        : 'text-[var(--p-muted)] hover:text-[var(--p-ink)] hover:bg-[var(--p-surface)]'
                                    }`}
                                  >
                                    <CornerDownRight className="w-3 h-3" />
                                    <span>Reply</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        };

                        return (
                          <div key={rootComment.id} className="space-y-2.5">
                            {renderSingleCommentCard(rootComment, false)}

                            {(threadReplies.length > 0 || isReplyBoxOpen) && (
                              <div className="ml-5 sm:ml-9 pl-3.5 border-l-2 border-[var(--p-border)] space-y-2.5">
                                {threadReplies.map((reply) =>
                                  renderSingleCommentCard(reply, true)
                                )}

                                {isReplyBoxOpen && replyTarget && (
                                  <div className="p-3.5 rounded-xl border border-[var(--p-accent)]/35 bg-[var(--p-surface-subtle)] space-y-2">
                                    <div className="text-[12px] text-[var(--p-muted)] flex items-center gap-1.5">
                                      <CornerDownRight className="w-3.5 h-3.5 text-[var(--p-accent)]" />
                                      <span>
                                        Replying to{' '}
                                        <strong className="text-[var(--p-ink)]">
                                          {replyTarget.authorName}
                                        </strong>
                                      </span>
                                    </div>
                                    <MentionCommentComposer
                                      value={replyBody}
                                      onChange={setReplyBody}
                                      onSubmit={() => void handleSubmitReply()}
                                      submitting={replySubmitting}
                                      placeholder={`Reply to ${replyTarget.authorName}... Type @username to mention.`}
                                      submitLabel="Post Reply"
                                      localCandidates={localMentionCandidates}
                                      rows={2}
                                      autoFocus
                                      compact
                                      onCancel={() => {
                                        setReplyTarget(null);
                                        setReplyBody('');
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </SmoothScrollArea>

            {/* Bottom Prev/Next Cohort Strip */}
            <div className="px-4 md:px-6 py-2.5 border-t border-[var(--p-border)] bg-[var(--p-surface-elevated)] flex items-center justify-between gap-4 text-[13px] shrink-0">
              <button
                type="button"
                onClick={() => onNavigate(prevItem)}
                className="inline-flex items-center gap-1.5 text-[var(--p-ink-secondary)] hover:text-[var(--p-ink)] font-medium cursor-pointer truncate"
              >
                <ChevronLeft className="w-4 h-4 shrink-0" />
                <span className="truncate">Previous: {prevItem.studentName}</span>
              </button>
              <span className="text-[12px] text-[var(--p-muted)] font-[family-name:var(--font-mono)] tabular-nums hidden sm:inline">
                {currentIdx + 1} / {allPortfolios.length}
              </span>
              <button
                type="button"
                onClick={() => onNavigate(nextItem)}
                className="inline-flex items-center gap-1.5 text-[var(--p-ink-secondary)] hover:text-[var(--p-ink)] font-medium cursor-pointer truncate"
              >
                <span className="truncate">Next: {nextItem.studentName}</span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
