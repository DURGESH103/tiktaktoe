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
 * The shared chat (same components and messages table as Tic-Tac-Toe) wired up for a Couple room:
 * floating button with unread badge, sheet/side panel, sound + vibration for new messages.
 * `onOpenChange` lets the room shrink its content above the sheet on phones.
 */
export function CoupleChat({
  roomId,
  me,
  partner,
  partnerId,
  hidePartner,
  onHidePartner,
  readOnly,
  onAnnounce,
  onOpenChange,
  onLayout,
}: {
  roomId: string;
  me: string;
  partner?: Player;
  partnerId: string | null;
  hidePartner: boolean;
  onHidePartner: (hide: boolean) => void;
  readOnly: boolean;
  onAnnounce: (text: string) => void;
  onOpenChange?: (open: boolean) => void;
  /** Visible height above the sheet (px) while it's open on a phone; null when closed or on desktop. */
  onLayout?: (aboveSheet: number | null) => void;
}) {
  const { feedback } = useSettings();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const hideRef = useRef(hidePartner);
  hideRef.current = hidePartner;
  const buttonRef = useRef<HTMLButtonElement>(null);

  const onLive = useCallback(() => {
    if (hideRef.current || openRef.current) return;
    feedback("message", "message");
    onAnnounce(`New message from ${partner?.name ?? "your partner"}.`);
  }, [feedback, onAnnounce, partner?.name]);
  const chat = useRoomChat(roomId, me, partnerId, onLive);

  // Unread = their messages newer than what I last saw with the chat open (remembered per room).
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
  const unread = open || hidePartner || lastRead === null ? 0 : chat.messages.filter((m) => m.sender_id === partnerId && m.created_at > lastRead).length;

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const viewport = useVisualViewport();
  const visibleH = viewport.height || 800;
  const sheetH = expanded ? visibleH - 56 : Math.round(Math.max(visibleH * 0.45, Math.min(260, visibleH - 160)));

  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);
  useEffect(() => onLayout?.(open && !isDesktop ? visibleH - sheetH : null), [open, isDesktop, visibleH, sheetH, onLayout]);

  const close = useCallback(() => {
    setOpen(false);
    setExpanded(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  return (
    <>
      <Portal>
        <AnimatePresence>
          {!open && <ChatButton ref={buttonRef} unread={unread} typing={chat.opponentTyping && !hidePartner} onClick={() => setOpen(true)} />}
        </AnimatePresence>
      </Portal>
      <ChatPanel
        open={open}
        onClose={close}
        me={me}
        opponent={partner}
        messages={chat.messages}
        opponentTyping={chat.opponentTyping}
        hideOpponent={hidePartner}
        onHideOpponent={onHidePartner}
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
        yourTurn={false}
        turnKey={0}
      />
    </>
  );
}
