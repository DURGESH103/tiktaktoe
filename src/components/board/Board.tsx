"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { useRef, useState } from "react";
import type { CellValue } from "@/types/db";
import { OMark, XMark } from "./Marks";
import { WinStrike } from "./WinStrike";

interface BoardProps {
  cells: CellValue[];
  /** True when the local player may place a mark right now. */
  interactive: boolean;
  winningLine: number[] | null;
  onPlay: (cell: number) => void;
  /** Index of a cell to briefly shake (e.g. a rejected move). */
  shakeCell?: number | null;
  /** Exact board size in px (compact layout while chatting); otherwise it fills the column. */
  fitSize?: number;
}

const ARROWS: Record<string, number> = { ArrowUp: -3, ArrowDown: 3, ArrowLeft: -1, ArrowRight: 1 };

export function Board({ cells, interactive, winningLine, onPlay, shakeCell, fitSize }: BoardProps) {
  const [focus, setFocus] = useState(4);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Roving tabindex: one tab stop for the whole grid, arrow keys move between cells.
  function onKeyDown(e: React.KeyboardEvent, i: number) {
    let next = i;
    if (e.key in ARROWS) {
      const d = ARROWS[e.key];
      const col = i % 3;
      if ((d === -1 && col === 0) || (d === 1 && col === 2)) return;
      next = i + d;
    } else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 8;
    else return;
    if (next < 0 || next > 8) return;
    e.preventDefault();
    setFocus(next);
    refs.current[next]?.focus();
  }

  return (
    <motion.div
      role="grid"
      aria-label="Tic-tac-toe board"
      className={clsx(
        "glass relative mx-auto grid aspect-square grid-cols-3 grid-rows-3 gap-2 rounded-4xl p-2 sm:gap-3 sm:p-3",
        !fitSize && "w-full max-w-[min(92vw,26rem)]",
      )}
      initial={{ opacity: 0, scale: 0.92, rotateX: 18 }}
      animate={{ opacity: 1, scale: 1, rotateX: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      style={{ transformPerspective: 900, ...(fitSize && { width: fitSize, height: fitSize }) }}
    >
      {[0, 1, 2].map((row) => (
        <div role="row" key={row} className="contents">
          {[0, 1, 2].map((col) => {
            const i = row * 3 + col;
            const v = cells[i];
            const winning = winningLine?.includes(i) ?? false;
            const playable = interactive && v === null;
            return (
              // Outer wrapper owns the staggered entrance; the button owns tap/shake/win motion.
              <motion.div
                key={i}
                className="grid"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.12 + 0.035 * i, type: "spring", stiffness: 380, damping: 24 }}
              >
                <motion.button
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  type="button"
                  role="gridcell"
                  tabIndex={focus === i ? 0 : -1}
                  aria-label={`Row ${row + 1}, column ${col + 1}, ${v ?? "empty"}`}
                  aria-disabled={!playable}
                  onFocus={() => setFocus(i)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onClick={() => playable && onPlay(i)}
                  animate={shakeCell === i ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0, scale: winning ? 1.04 : 1 }}
                  transition={{ x: { duration: 0.4 }, default: { type: "spring", stiffness: 420, damping: 22 } }}
                  whileTap={playable ? { scale: 0.9 } : undefined}
                  whileHover={playable ? { scale: 1.03 } : undefined}
                  className={clsx(
                    "relative grid min-h-12 min-w-12 place-items-center rounded-2xl sm:rounded-3xl",
                    "transition-colors duration-200",
                    winning
                      ? v === "X"
                        ? "bg-x/15 ring-2 ring-x/60"
                        : "bg-o/15 ring-2 ring-o/60"
                      : "bg-fg/[0.04]",
                    playable ? "cursor-pointer hover:bg-fg/[0.08]" : "cursor-default",
                  )}
                >
                  {v === "X" && <XMark className="h-[78%] w-[78%]" />}
                  {v === "O" && <OMark className="h-[78%] w-[78%]" />}
                </motion.button>
              </motion.div>
            );
          })}
        </div>
      ))}
      {winningLine && cells[winningLine[0]] && <WinStrike line={winningLine} mark={cells[winningLine[0]]!} />}
    </motion.div>
  );
}
