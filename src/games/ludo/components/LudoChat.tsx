"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatButton } from "@/components/chat/ChatButton";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useSettings } from "@/components/providers/SettingsProvider";
import { Portal } from "@/components/ui/Portal";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useRoomChat } from "@/hooks/useRoomChat";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import type { Player } from "@/types/db";

/**
 * The shared chat (same components and messages table as Tic-Tac-Toe and Couple) as a group chat
 * for everyone at a Ludo table. `onLayout` lets the room fit the board into the space above the sheet.
 */
export function LudoChat({
  roomId,
  me,
  players,
  otherIds,
  hideOthers,
  onHideOthers,
  readOnly,
  onAnnounce,
  onLayout,
  yourTurn,
  turnKey,
}: {
  roomId: string;
  me: string;
  players: Record<string, Player>;
  /** Everyone else seated at the table. */
  otherIds: string[];
  hideOthers: boolean;
  onHideOthers: (hide: boolean) => void;
  readOnly: boolean;
  onAnnounce: (text: string) => void;
  /** Visible height above the sheet (px) while it's open on a phone; null when closed or on desktop. */
  onLayout?: (aboveSheet: number | null) => void;
  /** "Your turn" chip in the chat header; flashes again when `turnKey` changes. */
  yourTurn: boolean;
  turnKey: number;
}) {
  const { feedback } = useSettings();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const hideRef = useRef(hideOthers);
  hideRef.current = hideOthers;
  const playersRef = useRef(players);
  playersRef.current = players;
  const buttonRef = useRef<HTMLButtonElement>(null);

  const onLive = useCallback(
    (m: { sender_id: string }) => {
      if (hideRef.current || openRef.current) return;
      feedback("message", "message");
      onAnnounce(`New message from ${playersRef.current[m.sender_id]?.name ?? "a player"}.`);
    },
    [feedback, onAnnounce],
  );
  const chat = useRoomChat(roomId, me, otherIds, onLive);

  // Unread = others' messages newer than what I last saw with the chat open (remembered per room).
  const [lastRead, setLastRead] = useState<string | null>(null);
  useEffect(() => {
    try {
      setLastRead(localStorage.getItem(`chat-read:${roomId}`) ?? "");
    } catch {
      setLastRead("");
    }
  }, [roomId]);
  const newest = chat.messages.at(-1)?.created_at ?? "";
  useEffect(() => {
    if (!open || lastRead === null || !newest || newest <= lastRead) return;
    setLastRead(newest);
    try {
      localStorage.setItem(`chat-read:${roomId}`, newest);
    } catch {}
  }, [open, newest, lastRead, roomId]);
  const unread = open || hideOthers || lastRead === null ? 0 : chat.messages.filter((m) => m.sender_id !== me && m.created_at > lastRead).length;

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const viewport = useVisualViewport();
  const visibleH = viewport.height || 800;
  const sheetH = expanded ? visibleH - 56 : Math.round(Math.max(visibleH * 0.4, Math.min(240, visibleH - 160)));

  useEffect(() => onLayout?.(open && !isDesktop ? visibleH - sheetH : null), [open, isDesktop, visibleH, sheetH, onLayout]);
  useEffect(() => () => onLayout?.(null), [onLayout]);

  const close = useCallback(() => {
    setOpen(false);
    setExpanded(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  return (
    <>
      <Portal>
        <AnimatePresence>
          {!open && <ChatButton ref={buttonRef} unread={unread} typing={chat.opponentTyping && !hideOthers} onClick={() => setOpen(true)} />}
        </AnimatePresence>
      </Portal>
      <ChatPanel
        open={open}
        onClose={close}
        me={me}
        messages={chat.messages}
        opponentTyping={chat.opponentTyping}
        hideOpponent={hideOthers}
        onHideOpponent={onHideOthers}
        readOnly={readOnly}
        onSend={chat.send}
        onRetry={chat.retry}
        onTyping={chat.sendTyping}
        loadError={chat.loadError}
        isDesktop={isDesktop}
        height={sheetH}
        keyboard={viewport.keyboard}
        expanded={expanded}
        onExpandedChange={setExpanded}
        yourTurn={yourTurn}
        turnKey={turnKey}
        group={{ players, typingFrom: chat.typingFrom }}
      />
    </>
  );
}
