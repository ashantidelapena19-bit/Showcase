import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AtSign, Send, X } from 'lucide-react';
import {
  type MentionableUser,
  sanitizeUsername,
  searchMentionableUsers,
} from '../lib/supabase';

interface MentionCommentComposerProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  placeholder: string;
  submitLabel: string;
  submittingLabel?: string;
  localCandidates: MentionableUser[];
  rows?: number;
  autoFocus?: boolean;
  onCancel?: () => void;
  footerLeft?: React.ReactNode;
  compact?: boolean;
}

interface ActiveMentionToken {
  start: number;
  end: number;
  query: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SE';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function findMentionTokenAtCursor(
  text: string,
  cursorPos: number
): ActiveMentionToken | null {
  const safeCursor = Math.max(0, Math.min(cursorPos, text.length));
  const before = text.slice(0, safeCursor);
  const match = before.match(/(?:^|[\s(])(@([a-z0-9._-]{0,32}))$/i);
  if (!match) return null;
  const fullToken = match[1]; // includes '@'
  const query = match[2] ?? '';
  const start = safeCursor - fullToken.length;
  return { start, end: safeCursor, query };
}

function filterLocalMentionCandidates(
  query: string,
  candidates: MentionableUser[]
): MentionableUser[] {
  const normalized = query.trim().replace(/^@+/, '').toLowerCase();
  const deduped = new Map<string, MentionableUser>();
  for (const c of candidates) {
    const uname = sanitizeUsername(c.username);
    if (!uname) continue;
    const key = uname.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, { ...c, username: uname });
    }
  }
  const list = Array.from(deduped.values());
  const filtered = normalized
    ? list.filter(
        (u) =>
          u.username.toLowerCase().includes(normalized) ||
          u.displayName.toLowerCase().includes(normalized)
      )
    : list;

  return filtered
    .sort((a, b) => {
      if (normalized) {
        const aPrefix = a.username.toLowerCase().startsWith(normalized) ? 0 : 1;
        const bPrefix = b.username.toLowerCase().startsWith(normalized) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      }
      return a.username.localeCompare(b.username);
    })
    .slice(0, 15);
}

export const MentionCommentComposer: React.FC<MentionCommentComposerProps> = ({
  value,
  onChange,
  onSubmit,
  submitting = false,
  placeholder,
  submitLabel,
  submittingLabel = 'Posting...',
  localCandidates,
  rows = 3,
  autoFocus = false,
  onCancel,
  footerLeft,
  compact = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeToken, setActiveToken] = useState<ActiveMentionToken | null>(null);
  const [suggestions, setSuggestions] = useState<MentionableUser[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [autoFocus]);

  const syncTokenFromSelection = useCallback(
    (nextText: string, cursorPos: number) => {
      const token = findMentionTokenAtCursor(nextText, cursorPos);
      setActiveToken(token);
      if (!token) {
        setSuggestions([]);
        setLoadingSuggestions(false);
        return;
      }
      setSuggestions(filterLocalMentionCandidates(token.query, localCandidates));
      setHighlightedIdx(0);
    },
    [localCandidates]
  );

  // Query Supabase mention directory when @token is active
  useEffect(() => {
    if (!activeToken) return;
    let cancelled = false;
    setLoadingSuggestions(true);
    const timer = window.setTimeout(() => {
      void searchMentionableUsers(activeToken.query, localCandidates, {
        limit: 15,
      })
        .then((results) => {
          if (cancelled) return;
          setSuggestions(results);
          setHighlightedIdx(0);
        })
        .finally(() => {
          if (!cancelled) setLoadingSuggestions(false);
        });
    }, 90);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeToken?.query, activeToken?.start, localCandidates]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!activeToken) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveToken(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [activeToken]);

  const insertMention = (user: MentionableUser) => {
    const el = textareaRef.current;
    const token = activeToken;
    if (!token) return;

    const insertion = `@${user.username} `;
    const nextValue =
      value.slice(0, token.start) + insertion + value.slice(token.end);
    const nextCursor = token.start + insertion.length;

    onChange(nextValue);
    setActiveToken(null);
    setSuggestions([]);

    window.requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };

  const handleInsertAtSymbol = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const needsLeadingSpace = start > 0 && !/[\s(]/.test(value[start - 1]);
    const inserted = needsLeadingSpace ? ' @' : '@';
    const nextValue = value.slice(0, start) + inserted + value.slice(end);
    const nextCursor = start + inserted.length;
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCursor, nextCursor);
      syncTokenFromSelection(nextValue, nextCursor);
    });
  };

  const showDropdown = Boolean(activeToken);

  return (
    <div ref={containerRef} className="relative space-y-2.5">
      <div className="relative">
        <textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={(e) => {
            const nextVal = e.target.value;
            const cursor = e.target.selectionStart ?? nextVal.length;
            onChange(nextVal);
            syncTokenFromSelection(nextVal, cursor);
          }}
          onClick={(e) => {
            const cursor = e.currentTarget.selectionStart ?? value.length;
            syncTokenFromSelection(value, cursor);
          }}
          onKeyUp={(e) => {
            if (
              ['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)
            ) {
              return;
            }
            const cursor = e.currentTarget.selectionStart ?? value.length;
            syncTokenFromSelection(value, cursor);
          }}
          onKeyDown={(e) => {
            if (showDropdown) {
              if (e.key === 'ArrowDown' && suggestions.length > 0) {
                e.preventDefault();
                setHighlightedIdx((prev) => (prev + 1) % suggestions.length);
                return;
              }
              if (e.key === 'ArrowUp' && suggestions.length > 0) {
                e.preventDefault();
                setHighlightedIdx(
                  (prev) => (prev - 1 + suggestions.length) % suggestions.length
                );
                return;
              }
              if (
                suggestions.length > 0 &&
                ((e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) ||
                  e.key === 'Tab')
              ) {
                e.preventDefault();
                const chosen = suggestions[highlightedIdx] ?? suggestions[0];
                if (chosen) insertMention(chosen);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                setActiveToken(null);
                return;
              }
            }

            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onSubmit();
            }
          }}
          maxLength={1500}
          placeholder={placeholder}
          className={`w-full rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] text-[var(--p-ink)] placeholder:text-[var(--p-muted)] focus:outline-none focus:border-[var(--p-accent)] resize-y ${
            compact ? 'p-3 text-[13px]' : 'p-3.5 text-[14px]'
          }`}
        />

        {showDropdown && activeToken && (
          <div
            role="listbox"
            aria-label="Mentionable users"
            className="absolute left-0 right-0 sm:right-auto sm:w-80 mt-1.5 z-30 rounded-xl border border-[var(--p-border)] bg-[var(--p-surface-elevated)] shadow-xl overflow-hidden"
          >
            <div className="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--p-muted)] border-b border-[var(--p-border)] bg-[var(--p-surface-subtle)]">
              <span>Mentionable users</span>
              <span className="font-normal">Existing members only</span>
            </div>

            {suggestions.length > 0 ? (
              <div className="max-h-56 overflow-y-auto py-1">
                {suggestions.map((user, idx) => {
                  const active = idx === highlightedIdx;
                  return (
                    <button
                      key={user.username}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(user);
                      }}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      className={`w-full px-3 py-2 text-left flex items-center gap-2.5 cursor-pointer transition-colors ${
                        active
                          ? 'bg-[var(--p-accent)]/12 text-[var(--p-ink)]'
                          : 'hover:bg-[var(--p-surface)] text-[var(--p-ink)]'
                      }`}
                    >
                      <span className="w-7 h-7 rounded-full overflow-hidden bg-[var(--p-action)] text-[var(--p-action-ink)] flex items-center justify-center text-[10px] font-bold shrink-0">
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={user.displayName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          getInitials(user.displayName)
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate">
                          {user.displayName}
                        </div>
                        <div className="text-[11px] text-[var(--p-accent)] truncate">
                          @{user.username}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : loadingSuggestions ? (
              <div className="px-3 py-3 text-[12px] text-[var(--p-muted)]">
                Searching existing users...
              </div>
            ) : (
              <div className="px-3 py-3 text-[12px] text-[var(--p-muted)] leading-relaxed">
                {activeToken.query
                  ? `No existing user matches "@${activeToken.query}". Mentions are only available for registered users.`
                  : 'No mentionable users found yet. Users appear here once they have a @username.'}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <button
            type="button"
            onClick={handleInsertAtSymbol}
            title="Show mentionable users (@username)"
            className="h-7 px-2 rounded-md border border-[var(--p-border)] bg-[var(--p-surface-subtle)] hover:bg-[var(--p-surface)] text-[11px] font-semibold text-[var(--p-ink-secondary)] inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0"
          >
            <AtSign className="w-3 h-3 text-[var(--p-accent)]" />
            <span>Mention</span>
          </button>
          {footerLeft}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="h-8 px-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-subtle)] hover:bg-[var(--p-surface)] text-[12px] font-medium text-[var(--p-ink)] inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          )}
          <button
            type="button"
            disabled={submitting || !value.trim()}
            onClick={onSubmit}
            className={`${
              compact ? 'h-8 px-3.5 text-[12px]' : 'h-9 px-4 text-[13px]'
            } rounded-lg bg-[var(--p-accent)] hover:bg-[var(--p-accent-hover)] text-[var(--p-accent-ink)] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed transition-colors`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>{submitting ? submittingLabel : submitLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
