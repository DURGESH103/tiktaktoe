"use client";

import clsx from "clsx";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import type { ChatMessage } from "@/hooks/useRoomChat";
import { charCount, MAX_MESSAGE_CHARS, PICKER_EMOJIS, QUICK_REPLIES } from "@/lib/chat";
import { ERROR_COPY, type ErrorCode } from "@/lib/errors";
import { Portal } from "@/components/ui/Portal";
import type { Player } from "@/types/db";
import { MessageBubble } from "./MessageBubble";

interface Props {
  open: boolean;
  onClose: () => void;
  me: string;
  opponent?: Player;
  messages: ChatMessage[];
  opponentTyping: boolean;
  hideOpponent: boolean;
  onHideOpponent: (hide: boolean) => void;
  /** Room closed: history stays readable but sending is off. */
  readOnly: boolean;
  onSend: (text: string) => ErrorCode | null;
  onRetry: (key: string) => void;
  onTyping: () => void;
  /** History couldn't load (e.g. the chat migration hasn't been run). */
  loadError: { code: ErrorCode; detail: string } | null;
  // Layout (phones). The parent owns these so it can fit the board into the space above the sheet.
  isDesktop: boolean;
  /** Sheet height in px. */
  height: number;
  /** Keyboard height in px: the sheet sits right on top of it. */
  keyboard: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** "Your turn" chip in the header; `turnKey` changes when a move arrives, which makes it flash. */
  yourTurn: boolean;
  turnKey: number;
  /** Group table (Ludo): senders looked up by id, names shown on bubbles; "Mute" hides everyone else. */
  group?: { players: Record<string, Player>; typingFrom: string | null };
}

/**
 * Non-modal chat. Phones: a bottom sheet (45% high, drag or tap the handle for full height)
 * that sits on top of the keyboard. Desktop: a side panel. The board stays usable either way.
 */
export function ChatPanel(props: Props) {
  const { open, onClose, isDesktop, height, keyboard, expanded, onExpandedChange } = props;
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function onDragEnd(_: unknown, info: PanInfo) {
    const up = info.offset.y < -50 || info.velocity.y < -400;
    const down = info.offset.y > 50 || info.velocity.y > 400;
    if (up) onExpandedChange(true);
    else if (down) {
      if (expanded) onExpandedChange(false);
      else onClose();
    }
  }

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-modal="false"
            aria-labelledby="chat-title"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 36 }}
            drag={isDesktop ? false : "y"}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.25}
            onDragEnd={onDragEnd}
            style={{ "--kb": `${keyboard}px`, "--sheet-h": `${height}px` } as React.CSSProperties}
            className={clsx(
              "glass fixed inset-x-0 bottom-[var(--kb)] z-40 flex h-[var(--sheet-h)] flex-col rounded-t-4xl bg-bg/90 transition-[height] duration-300 ease-out motion-reduce:transition-none",
              "lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-20 lg:h-auto lg:w-[22rem] lg:rounded-4xl",
            )}
          >
            {/* Drag handle: drag up/down, or tap to toggle half ↔ full height. */}
            <button
              type="button"
              onPointerDown={(e) => drag.start(e)}
              onClick={() => onExpandedChange(!expanded)}
              aria-label={expanded ? "Shrink chat" : "Expand chat"}
              aria-expanded={expanded}
              className="flex h-10 w-full shrink-0 touch-none items-center justify-center lg:hidden"
            >
              <span className="h-1.5 w-10 rounded-full bg-fg/25" />
            </button>
            <ChatBody {...props} />
          </motion.section>
        )}
      </AnimatePresence>
    </Portal>
  );
}

function ChatBody({
  onClose,
  me,
  opponent,
  messages,
  opponentTyping,
  hideOpponent,
  onHideOpponent,
  readOnly,
  onSend,
  onRetry,
  onTyping,
  loadError,
  yourTurn,
  turnKey,
  group,
}: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const oppName = group ? "Everyone else" : (opponent?.name ?? "Opponent");
  const typingName = group ? (group.players[group.typingFrom ?? ""]?.name ?? "Someone") : oppName;

  const visible = hideOpponent ? messages.filter((m) => m.sender_id === me) : messages;
  const hiddenCount = messages.length - visible.length;
  const count = charCount(text.trim());
  const tooLong = count > MAX_MESSAGE_CHARS;

  // Desktop: jump straight into typing. Phone: focus the title, so the keyboard doesn't pop up uninvited.
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) inputRef.current?.focus();
    else headingRef.current?.focus();
  }, []);

  // Stick to the newest message, including status changes (e.g. a "tap to retry" line appearing under it).
  const lastState = visible.length ? `${visible.length}:${visible[visible.length - 1].status}` : "0";
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastState, opponentTyping]);

  function submit(value = text) {
    const err = onSend(value);
    if (err) {
      setError(ERROR_COPY[err].body);
      return;
    }
    setError(null);
    if (value === text) setText("");
    setPicker(false);
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  return (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 px-4 pb-2 lg:pt-3">
        {opponent && !group && <AvatarBadge avatar={opponent.avatar} color={opponent.color} size="sm" />}
        <div className="min-w-0 flex-1">
          <h2 id="chat-title" ref={headingRef} tabIndex={-1} className="truncate font-display text-lg font-semibold leading-tight outline-none">
            {group ? "Table chat" : `Chat with ${oppName}`}
          </h2>
          <AnimatePresence>
            {yourTurn && (
              <motion.span
                key={turnKey}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: [0.6, 1.15, 1], opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                className="mt-0.5 inline-block rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent"
              >
                Your turn
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={() => onHideOpponent(!hideOpponent)}
          aria-pressed={hideOpponent}
          className={clsx(
            "min-h-12 rounded-2xl px-3 text-xs font-semibold transition-colors",
            hideOpponent ? "bg-warn/15 text-warn" : "text-muted hover:bg-fg/[0.06]",
          )}
        >
          {hideOpponent ? "Muted" : "Mute"} <span className="sr-only">{oppName}&apos;s messages and reactions for this game</span>
        </button>
        <button type="button" onClick={onClose} aria-label="Close chat" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl hover:bg-fg/[0.06]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {loadError && (
        <p role="alert" className="mx-4 mb-2 rounded-2xl bg-danger/10 px-3 py-2 text-xs text-fg">
          {loadError.code === "NOT_SET_UP" ? "Chat isn't set up on the server yet." : "Couldn't load messages."}
          {process.env.NODE_ENV === "development" && (
            <code className="mt-1 block break-all text-[10px] text-danger">
              {loadError.detail}
              {loadError.code === "NOT_SET_UP" && " → run supabase/migrations/20261104000600_room_messages.sql in the Supabase SQL Editor"}
            </code>
          )}
        </p>
      )}

      {hideOpponent && (
        <p className="mx-4 mb-2 rounded-2xl bg-warn/10 px-3 py-2 text-xs text-fg">
          {oppName}&apos;s messages and reactions are hidden for this game{hiddenCount > 0 && ` (${hiddenCount} hidden)`}.{" "}
          <button type="button" onClick={() => onHideOpponent(false)} className="font-semibold underline">
            Show
          </button>
        </p>
      )}

      {/* Messages */}
      <ol
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Messages"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 pb-2"
      >
        {visible.length === 0 && (
          <li className="m-auto max-w-[16rem] py-4 text-center text-sm text-muted">
            Say hi 👋 Messages are saved with this game and only {group ? "the players at this table" : "you two"} can see them.
          </li>
        )}
        {visible.map((m) => (
          <MessageBubble
            key={m.key}
            message={m}
            mine={m.sender_id === me}
            sender={m.sender_id === me ? undefined : group ? group.players[m.sender_id] : opponent}
            showName={!!group}
            onRetry={onRetry}
          />
        ))}
      </ol>

      <AnimatePresence>
        {opponentTyping && !hideOpponent && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex shrink-0 items-center gap-1.5 px-5 pb-1 text-xs text-muted"
            aria-live="polite"
          >
            <TypingDots /> {typingName} is typing…
          </motion.p>
        )}
      </AnimatePresence>

      {readOnly ? (
        <p className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 text-center text-sm text-muted">This room is closed. Chat is read-only.</p>
      ) : (
        <div className="flex shrink-0 flex-col gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-1 lg:pb-3">
          {/* Emoji picker toggle + quick replies: one sideways-scrolling row, faded at the edge. */}
          <div
            role="group"
            aria-label="Emoji and quick replies"
            className="-mx-3 flex gap-2 overflow-x-auto overscroll-x-contain px-3 pr-10 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              type="button"
              onClick={() => setPicker((p) => !p)}
              aria-expanded={picker}
              aria-label="Emoji picker"
              className={clsx(
                "grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line/10 text-xl",
                picker ? "bg-accent/20" : "bg-fg/[0.04] hover:bg-fg/[0.08]",
              )}
            >
              <span aria-hidden>😊</span>
            </button>
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => submit(q)}
                className="min-h-12 shrink-0 whitespace-nowrap rounded-full border border-line/10 bg-fg/[0.04] px-4 text-sm hover:bg-fg/[0.08]"
              >
                {q}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {picker && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div role="group" aria-label="Emoji" className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto rounded-2xl bg-fg/[0.04] p-1 sm:grid-cols-8">
                  {PICKER_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => insertEmoji(e)}
                      aria-label={`Insert ${e}`}
                      className="grid min-h-12 place-items-center rounded-xl text-2xl hover:bg-fg/[0.08]"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <p role="alert" className="px-1 text-xs text-danger">
              {error}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-center gap-1.5"
          >
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <input
              id="chat-input"
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
                if (e.target.value) onTyping();
              }}
              placeholder="Message…"
              autoComplete="off"
              enterKeyHint="send"
              aria-invalid={tooLong}
              aria-describedby={count > MAX_MESSAGE_CHARS - 40 ? "chat-count" : undefined}
              // 16px+ text stops iOS from zooming in on focus.
              className="min-h-12 min-w-0 flex-1 rounded-2xl bg-fg/[0.06] px-4 text-base text-fg placeholder:text-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <button
              type="submit"
              disabled={!text.trim() || tooLong}
              aria-label="Send message"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-pink-600 text-white disabled:opacity-40"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
          {count > MAX_MESSAGE_CHARS - 40 && (
            <p id="chat-count" className={clsx("-mt-1 px-1 text-right text-xs", tooLong ? "text-danger" : "text-muted")}>
              {count}/{MAX_MESSAGE_CHARS}
            </p>
          )}
        </div>
      )}
    </>
  );
}

export function TypingDots() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
