"use client";

import { useState, useRef } from "react";
import useSWR from "swr";
import { commentsApi, usersApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Comment, User } from "@wiki/types";
import {
  MessageSquare, ChevronDown, ChevronUp, Send, Reply,
  CheckCheck, Trash2, CornerDownRight,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import clsx from "clsx";

interface Props { documentId: string; defaultOpen?: boolean }

// ─── Mention helpers ──────────────────────────────────────────────────────

/** Render a comment body, turning @Name tokens into highlighted spans */
function RenderBody({ body }: { body: string }) {
  const parts = body.split(/(@\w[\w\s]*?\b)/g);
  return (
    <p className="mt-1.5 ml-8 text-sm text-foreground/80 whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="text-primary font-semibold">{part}</span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

// ─── Mention-aware composer ───────────────────────────────────────────────

interface ComposerProps {
  documentId: string;
  parentId?: string;
  placeholder?: string;
  initialValue?: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

function MentionComposer({
  documentId: _documentId,
  parentId: _parentId,
  placeholder,
  initialValue = "",
  onSubmit,
  onCancel,
  submitLabel: _submitLabel,
}: ComposerProps) {
  const [body, setBody] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  // Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: allUsers = [] } = useSWR<User[]>("users", usersApi.list);

  const filteredUsers = mentionQuery !== null
    ? allUsers.filter(
        (u) =>
          u.status === "active" &&
          u.name.toLowerCase().includes(mentionQuery.toLowerCase()),
      ).slice(0, 6)
    : [];

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);

    const cursor = e.target.selectionStart ?? 0;
    // Find the last @ before cursor that hasn't been closed by a space after a name
    const textUpToCursor = val.slice(0, cursor);
    const match = textUpToCursor.match(/@([\w ]*)$/);
    if (match) {
      setMentionQuery(match[1] ?? "");
      setMentionStart(cursor - (match[1]?.length ?? 0) - 1);
      setSelectedIdx(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(user: User) {
    const before = body.slice(0, mentionStart);
    const after = body.slice(textareaRef.current?.selectionStart ?? mentionStart + (mentionQuery?.length ?? 0) + 1);
    const mention = `@${user.name} `;
    const newBody = before + mention + after;
    setBody(newBody);
    setMentionQuery(null);
    // Restore focus and move cursor after mention
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + mention.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && filteredUsers.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => (i + 1) % filteredUsers.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => (i - 1 + filteredUsers.length) % filteredUsers.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(filteredUsers[selectedIdx]!); return; }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void doSubmit();
    }
  }

  async function doSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setBody("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative">
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Add a comment… (type @ to mention)"}
            rows={2}
            className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-card text-foreground outline-none focus:border-primary resize-none placeholder:text-muted-foreground transition-colors"
          />

          {/* Mention dropdown */}
          {mentionQuery !== null && filteredUsers.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute bottom-full mb-1 left-0 w-56 bg-card border border-border rounded-lg shadow-lg py-1 z-50"
            >
              <p className="text-[10px] text-muted-foreground px-3 pt-1 pb-0.5 uppercase tracking-wide font-semibold">Mention</p>
              {filteredUsers.map((u, i) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                  className={clsx(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                    i === selectedIdx
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/80 hover:bg-muted dark:hover:bg-accent",
                  )}
                >
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="font-medium truncate text-xs">{u.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                  </div>
                </button>
              ))}
              {filteredUsers.length === 0 && mentionQuery.length > 0 && (
                <p className="text-xs text-muted-foreground px-3 py-2">No users found</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={doSubmit}
            disabled={submitting || !body.trim()}
            className="p-2 rounded-lg bg-primary text-white hover:bg-[#e0470f] disabled:opacity-40 transition-colors"
            title="Send (⌘↵)"
          >
            {submitting ? <Spinner size={14} /> : <Send size={14} />}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-[11px] text-muted-foreground hover:text-muted-foreground text-center">
              Cancel
            </button>
          )}
        </div>
      </div>

      {body.length === 0 && (
        <p className="text-[10px] text-muted-foreground mt-1">Type <kbd className="bg-muted px-1 rounded">@</kbd> to mention · <kbd className="bg-muted px-1 rounded">⌘↵</kbd> to send</p>
      )}
    </div>
  );
}

// ─── Comment item ─────────────────────────────────────────────────────────

function CommentItem({
  comment, documentId, mutate, onReply, isTopLevel,
}: {
  comment: Comment;
  documentId: string;
  mutate: () => void;
  onReply?: () => void;
  isTopLevel?: boolean;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const isAuthor = user?.id === comment.authorId;

  async function handleResolve() {
    setLoading(true);
    try { await commentsApi.update(documentId, comment.id, { resolved: !comment.resolved }); mutate(); }
    finally { setLoading(false); }
  }

  async function handleDelete() {
    if (!confirm("Delete this comment?")) return;
    await commentsApi.delete(documentId, comment.id);
    mutate();
  }

  return (
    <div className="px-4 py-3 group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {comment.authorName.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-foreground/80 truncate">{comment.authorName}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {new Date(comment.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
          {comment.resolved && (
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">Resolved</span>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onReply && (
            <button type="button" onClick={onReply} title="Reply" className="p-1 rounded text-muted-foreground hover:text-primary">
              <Reply size={12} />
            </button>
          )}
          {isTopLevel && (
            <button type="button" onClick={handleResolve} disabled={loading} title={comment.resolved ? "Unresolve" : "Resolve"} className="p-1 rounded text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400">
              <CheckCheck size={12} />
            </button>
          )}
          {isAuthor && (
            <>
              <button type="button" onClick={() => setEditing((v) => !v)} className="p-1 rounded text-muted-foreground hover:text-foreground text-[11px] font-medium">Edit</button>
              <button type="button" onClick={handleDelete} className="p-1 rounded text-muted-foreground hover:text-red-500"><Trash2 size={12} /></button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-2 ml-8">
          <MentionComposer
            documentId={documentId}
            initialValue={comment.body}
            submitLabel="Save"
            onSubmit={async (trimmed) => {
              setLoading(true);
              try { await commentsApi.update(documentId, comment.id, { body: trimmed }); mutate(); setEditing(false); }
              finally { setLoading(false); }
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <RenderBody body={comment.body} />
      )}
    </div>
  );
}

// ─── Thread ───────────────────────────────────────────────────────────────

function Thread({ comment, documentId, mutate }: { comment: Comment; documentId: string; mutate: () => void }) {
  const [replying, setReplying] = useState(false);

  return (
    <div className={clsx("border-t border-border", comment.resolved && "opacity-60")}>
      <CommentItem comment={comment} documentId={documentId} mutate={mutate} onReply={() => setReplying((v) => !v)} isTopLevel />

      {comment.replies && comment.replies.length > 0 && (
        <div className="pl-6 border-l-2 border-border ml-4 mb-1">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} documentId={documentId} mutate={mutate} />
          ))}
        </div>
      )}

      {replying && (
        <div className="px-4 pb-3 pl-10">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
            <CornerDownRight size={11} />
            Replying to <span className="font-medium text-muted-foreground">{comment.authorName}</span>
          </div>
          <MentionComposer
            documentId={documentId}
            parentId={comment.id}
            placeholder={`Reply to ${comment.authorName}… (@ to mention)`}
            onSubmit={async (body) => {
              await commentsApi.create(documentId, { body, parentId: comment.id });
              mutate();
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────

export function CommentsPanel({ documentId, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const { data: comments = [], mutate, isLoading } = useSWR<Comment[]>(
    open ? `comments:${documentId}` : null,
    () => commentsApi.list(documentId),
  );

  const topLevel = comments.filter((c) => !c.parentId);

  return (
    <div className="flex flex-col h-full">
      {/* Only show the toggle header when not embedded in the drawer (defaultOpen=false) */}
      {!defaultOpen && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-muted text-sm font-medium text-foreground/80 hover:bg-accent transition-colors"
        >
          <span className="flex items-center gap-2">
            <MessageSquare size={14} />
            Comments
            {topLevel.length > 0 && (
              <span className="text-xs bg-border text-muted-foreground px-1.5 py-0.5 rounded-full font-mono leading-none">
                {topLevel.length}
              </span>
            )}
          </span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}

      {open && (
        <div className={clsx("bg-card", defaultOpen && "flex flex-col flex-1")}>
          {isLoading && <div className="flex justify-center py-6"><Spinner size={14} /></div>}

          {!isLoading && topLevel.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No comments yet. Start the discussion!</p>
          )}

          {topLevel.map((comment) => (
            <Thread key={comment.id} comment={comment} documentId={documentId} mutate={mutate} />
          ))}

          <div className={clsx("border-t border-border px-4 py-3", defaultOpen && "sticky bottom-0 bg-card")}>
            <MentionComposer
              documentId={documentId}
              onSubmit={async (body) => {
                await commentsApi.create(documentId, { body });
                mutate();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
