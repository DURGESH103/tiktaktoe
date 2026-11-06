"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { TypingDots } from "@/components/chat/ChatPanel";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { maskProfanity } from "@/lib/profanity";
import type { Player } from "@/types/db";
import { questionText } from "../lib/compat";
import { charLength, cleanText, MAX_ANSWER_CHARS, memoryVoteState } from "../lib/memories";
import type { CoupleAnswer, CoupleQuestion, CoupleRound, CoupleSession, Lang } from "../types";

interface Props {
  session: CoupleSession;
  round: CoupleRound;
  question: CoupleQuestion;
  me?: Player;
  partner?: Player;
  mySeat: "X" | "O";
  mine: CoupleAnswer | null;
  /** Only available after the reveal (RLS). */
  theirs: CoupleAnswer | null;
  lang: Lang;
  busy: boolean;
  onSubmit: (text: string) => Promise<boolean | null | undefined>;
  onVote: (matched: boolean) => void;
  onSave: () => void;
  onNext: () => void;
}

/** One Memories prompt: write → wait → side-by-side reveal → "We matched ✅" vote → save / next. */
export function MemoriesRound(props: Props) {
  const { session, round, question, partner, mySeat, mine, lang } = props;
  const partnerName = partner?.name ?? "your partner";
  const revealed = !!round.revealed_at;
  const partnerAnswered = mySeat === "X" ? round.o_answered : round.x_answered;
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [round.id]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>
          Memory {session.current_round} of {session.total_rounds}
        </span>
        <span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-semibold text-accent" aria-label={`${session.points} points`}>
          {session.points} pts
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={round.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
          <GlassCard className="flex flex-col items-center gap-2 p-5 text-center">
            <span className="text-3xl" aria-hidden>
              📸
            </span>
            <h2 className="font-display text-2xl font-bold leading-snug">{questionText(question, lang)}</h2>
          </GlassCard>
        </motion.div>
      </AnimatePresence>

      {/* Keyed by round: if the partner moves on before I see the reveal, the next question must start
          fresh (it used to keep my previous picks and step). */}
      {revealed ? (
        <Reveal key={round.id} {...props} partnerName={partnerName} />
      ) : mine && !editing ? (
        <Waiting key={round.id} {...props} partnerName={partnerName} onChange={() => setEditing(true)} />
      ) : (
        <Write key={round.id} {...props} partnerName={partnerName} partnerAnswered={partnerAnswered} onDone={() => setEditing(false)} />
      )}
    </div>
  );
}

function Write({ mine, busy, partnerName, partnerAnswered, onSubmit, onDone }: Props & { partnerName: string; partnerAnswered: boolean; onDone: () => void }) {
  const [text, setText] = useState(mine?.text_answer ?? "");
  const clean = cleanText(text);
  const len = charLength(clean);
  const tooLong = len > MAX_ANSWER_CHARS;

  async function lockIn() {
    if (!clean || tooLong) return;
    if (await onSubmit(clean)) onDone();
  }

  return (
    <div className="flex flex-col gap-3">
      {partnerAnswered && (
        <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="status" className="self-center rounded-full bg-ok/15 px-3 py-1 text-sm font-semibold text-ok">
          {partnerName} has written theirs ✓ — your turn!
        </motion.p>
      )}
      <label htmlFor="memory-answer" className="font-display text-lg font-semibold">
        How do you remember it?
      </label>
      <textarea
        id="memory-answer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={`Write it your way… ${partnerName} can't see it until you've both answered.`}
        aria-invalid={tooLong}
        aria-describedby="memory-count"
        // 16px+ text stops iOS from zooming in on focus.
        className="glass min-h-28 w-full resize-none rounded-2xl p-4 text-base leading-relaxed text-fg placeholder:text-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <p id="memory-count" className={clsx("-mt-1 text-right text-xs", tooLong ? "text-danger" : "text-muted")}>
        {len}/{MAX_ANSWER_CHARS}
      </p>
      <Button variant="romance" size="lg" disabled={!clean || tooLong} loading={busy} onClick={lockIn}>
        Lock in 💌
      </Button>
    </div>
  );
}

/** "Waiting for durgesh to answer…" with their avatar, like the Compatibility Test. */
function Waiting({ mine, partner, partnerName, onChange }: Props & { partnerName: string; onChange: () => void }) {
  return (
    <GlassCard className="flex flex-col items-center gap-4 p-6 text-center" role="status" aria-live="polite">
      <div className="relative grid h-20 w-20 place-items-center">
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-accent/50"
          animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
        {partner && <AvatarBadge avatar={partner.avatar} color={partner.color} size="lg" />}
      </div>
      <p className="flex items-center gap-2 font-display text-lg font-semibold">
        Waiting for {partnerName} to answer <TypingDots />
      </p>
      <p className="text-sm text-muted">
        You wrote: <strong className="text-fg">“{mine?.text_answer}”</strong>
      </p>
      <Button variant="ghost" onClick={onChange}>
        Change my answer
      </Button>
    </GlassCard>
  );
}

function Reveal({ session, round, me, partner, mySeat, mine, theirs, busy, partnerName, onVote, onSave, onNext }: Props & { partnerName: string }) {
  const v = memoryVoteState(round, mySeat);
  const last = session.current_round >= session.total_rounds;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <AnswerCard player={me} label="You" text={mine?.text_answer ?? ""} delay={0.1} />
        <AnswerCard player={partner} label={partner?.name ?? "Partner"} text={theirs?.text_answer ?? ""} delay={0.35} />
      </div>

      <AnimatePresence mode="wait">
        {!v.decided ? (
          <motion.div key="vote" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.8 } }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
            <p className="text-center font-display text-lg font-semibold">Did you remember it the same way?</p>
            <div role="group" aria-label="Did you match?" className="grid grid-cols-2 gap-2">
              <Button variant={v.myVote === true ? "romance" : "secondary"} aria-pressed={v.myVote === true} disabled={busy} onClick={() => onVote(true)}>
                We matched ✅
              </Button>
              <Button variant={v.myVote === false ? "romance" : "secondary"} aria-pressed={v.myVote === false} disabled={busy} onClick={() => onVote(false)}>
                Different
              </Button>
            </div>
            <p className="text-center text-sm text-muted" role="status" aria-live="polite">
              {v.myVote === null
                ? v.partnerVoted
                  ? `${partnerName} has voted — your call!`
                  : "Points only if you both say “We matched”."
                : v.partnerVoted
                  ? "Counting votes…"
                  : `Waiting for ${partnerName} to vote…`}
            </p>
          </motion.div>
        ) : (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col gap-2">
            <p
              role="status"
              className={clsx("rounded-2xl p-3 text-center font-semibold", v.matched ? "bg-ok/15 text-ok" : "bg-fg/[0.06] text-fg")}
            >
              {v.matched ? "You both remembered it! +20 💞" : "You remember it differently — that's okay 🙂"}
            </p>
            <Button variant="secondary" onClick={onSave}>
              Save to Our Memories 📸
            </Button>
            <Button variant="romance" size="lg" loading={busy} onClick={onNext} data-autofocus>
              {last ? "See our memories score 💞" : "Next memory →"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Card that flips over to show what a player wrote (masked by the bad-word filter, shown as text, never HTML). */
function AnswerCard({ player, label, text, delay }: { player?: Player; label: string; text: string; delay: number }) {
  return (
    <div className="[perspective:900px]">
      <motion.div
        className="grid [transform-style:preserve-3d]"
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={{ delay, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <div aria-hidden className="glass col-start-1 row-start-1 grid min-h-36 place-items-center rounded-3xl [backface-visibility:hidden]">
          <span className="text-4xl">💌</span>
        </div>
        <div className="glass col-start-1 row-start-1 flex min-h-36 flex-col items-center gap-2 rounded-3xl bg-accent/10 p-3 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
          {player && <AvatarBadge avatar={player.avatar} color={player.color} size="sm" />}
          <span className="text-xs text-muted">{label}</span>
          <span className="break-words text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{maskProfanity(text)}</span>
        </div>
      </motion.div>
    </div>
  );
}
