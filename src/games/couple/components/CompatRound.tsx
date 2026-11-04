"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { TypingDots } from "@/components/chat/ChatPanel";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Player } from "@/types/db";
import { optionText, questionText } from "../lib/compat";
import type { CoupleAnswer, CoupleQuestion, CoupleRound, CoupleSession, Lang } from "../types";

interface Props {
  session: CoupleSession;
  round: CoupleRound;
  question: CoupleQuestion;
  me?: Player;
  partner?: Player;
  /** My seat in the room: X answered flags and scoring are per seat. */
  mySeat: "X" | "O";
  mine: CoupleAnswer | null;
  /** Only available after the reveal (RLS). */
  theirs: CoupleAnswer | null;
  lang: Lang;
  busy: boolean;
  onSubmit: (self: number, guess: number) => Promise<boolean | null | undefined>;
  onNext: () => void;
}

/**
 * One Compatibility question: "About you" → "Guess your partner's answer" → waiting → flip reveal.
 */
export function CompatRound(props: Props) {
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
          Question {session.current_round} of {session.total_rounds}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-fg/10" aria-hidden>
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-pink-500"
            initial={false}
            animate={{ width: `${((session.current_round - (revealed ? 0 : 1)) / session.total_rounds) * 100}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={round.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
          <GlassCard className="flex flex-col gap-1 p-5 text-center">
            <h2 className="font-display text-2xl font-bold leading-snug">{questionText(question, lang)}</h2>
          </GlassCard>
        </motion.div>
      </AnimatePresence>

      {revealed ? (
        <Reveal {...props} />
      ) : mine && !editing ? (
        <Waiting {...props} partnerName={partnerName} onChange={() => setEditing(true)} />
      ) : (
        <AnswerSteps {...props} partnerName={partnerName} partnerAnswered={partnerAnswered} onDone={() => setEditing(false)} />
      )}
    </div>
  );
}

function AnswerSteps({
  question,
  mine,
  lang,
  busy,
  partnerName,
  partnerAnswered,
  onSubmit,
  onDone,
}: Props & { partnerName: string; partnerAnswered: boolean; onDone: () => void }) {
  const [step, setStep] = useState<"self" | "guess">("self");
  const [self, setSelf] = useState<number | null>(mine?.self_answer ?? null);
  const [guess, setGuess] = useState<number | null>(mine?.guess_answer ?? null);
  const options = question.options ?? [];

  async function lockIn() {
    if (self == null || guess == null) return;
    if (await onSubmit(self, guess)) onDone();
  }

  return (
    <div className="flex flex-col gap-3">
      {partnerAnswered && (
        <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="status" className="self-center rounded-full bg-ok/15 px-3 py-1 text-sm font-semibold text-ok">
          {partnerName} has answered ✓ — your turn!
        </motion.p>
      )}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">{step === "self" ? "About you" : `Guess ${partnerName}'s answer`}</h3>
        {step === "guess" && (
          <button type="button" onClick={() => setStep("self")} className="min-h-12 rounded-xl px-2 text-sm font-semibold text-accent">
            ← My answer
          </button>
        )}
      </div>
      <div role="radiogroup" aria-label={step === "self" ? "Your answer" : `Your guess for ${partnerName}`} className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        {options.map((_, i) => {
          const chosen = step === "self" ? self === i : guess === i;
          return (
            <motion.button
              key={`${step}-${i}`}
              type="button"
              role="radio"
              aria-checked={chosen}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                if (step === "self") {
                  setSelf(i);
                  setTimeout(() => setStep("guess"), 180);
                } else setGuess(i);
              }}
              className={clsx(
                "glass min-h-14 rounded-2xl px-4 py-3 text-left font-semibold transition-colors",
                chosen ? "bg-accent/20 ring-2 ring-accent" : "hover:bg-fg/[0.06]",
              )}
            >
              {optionText(question, i, lang)}
            </motion.button>
          );
        })}
      </div>
      {step === "guess" && (
        <Button variant="romance" size="lg" disabled={self == null || guess == null} loading={busy} onClick={lockIn}>
          Lock in 💘
        </Button>
      )}
    </div>
  );
}

/** "Waiting for durgesh to answer…" with their avatar, so whoever finishes first knows what's happening. */
function Waiting({ question, mine, partner, lang, partnerName, onChange }: Props & { partnerName: string; onChange: () => void }) {
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
        You said <strong className="text-fg">{optionText(question, mine?.self_answer, lang)}</strong> and guessed{" "}
        <strong className="text-fg">{optionText(question, mine?.guess_answer, lang)}</strong>.
      </p>
      <Button variant="ghost" onClick={onChange}>
        Change my answer
      </Button>
    </GlassCard>
  );
}

function Reveal({ session, question, me, partner, mine, theirs, lang, busy, onNext }: Props) {
  const iGuessedRight = mine?.guess_answer != null && mine.guess_answer === theirs?.self_answer;
  const theyGuessedRight = theirs?.guess_answer != null && theirs.guess_answer === mine?.self_answer;
  const last = session.current_round >= session.total_rounds;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <FlipCard player={me} label="You" text={optionText(question, mine?.self_answer, lang)} delay={0.1} />
        <FlipCard player={partner} label={partner?.name ?? "Partner"} text={optionText(question, theirs?.self_answer, lang)} delay={0.35} />
      </div>
      <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex flex-col gap-2">
        <GuessRow label={`You guessed ${partner?.name ?? "your partner"} would say`} text={optionText(question, mine?.guess_answer, lang)} right={iGuessedRight} />
        <GuessRow label={`${partner?.name ?? "Your partner"} guessed you'd say`} text={optionText(question, theirs?.guess_answer, lang)} right={theyGuessedRight} />
      </motion.ul>
      <Button variant="romance" size="lg" loading={busy} onClick={onNext} data-autofocus>
        {last ? "See our result 💞" : "Next question →"}
      </Button>
    </div>
  );
}

/** Card that flips over to show a player's own answer. */
function FlipCard({ player, label, text, delay }: { player?: Player; label: string; text: string; delay: number }) {
  return (
    <div className="h-36 [perspective:900px]">
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={{ delay, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <div aria-hidden className="glass absolute inset-0 grid place-items-center rounded-3xl [backface-visibility:hidden]">
          <span className="text-4xl">💌</span>
        </div>
        <div className="glass absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl bg-accent/10 p-3 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
          {player && <AvatarBadge avatar={player.avatar} color={player.color} size="sm" />}
          <span className="text-xs text-muted">{label}</span>
          <span className="font-display font-semibold leading-tight">{text}</span>
        </div>
      </motion.div>
    </div>
  );
}

function GuessRow({ label, text, right }: { label: string; text: string; right: boolean }) {
  return (
    <li className={clsx("flex items-center gap-3 rounded-2xl p-3", right ? "bg-ok/10" : "bg-danger/10")}>
      <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-full text-white", right ? "bg-ok" : "bg-danger")} aria-hidden>
        {right ? "✓" : "✗"}
      </span>
      <span className="min-w-0 text-sm">
        <span className="text-muted">{label}: </span>
        <strong>{text}</strong>
        <span className="sr-only">{right ? ", correct" : ", not quite"}</span>
      </span>
    </li>
  );
}
