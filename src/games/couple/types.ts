export type Lang = "en" | "hi";
export type CoupleMode = "compatibility" | "memories" | "questions" | "challenges";
export type CompatTitle = "soulmates" | "perfect_chaos" | "still_learning";

export interface CoupleQuestion {
  id: number;
  mode: CoupleMode;
  category: string;
  level: "fun" | "deep" | "future" | null;
  text_en: string;
  text_hi: string;
  options: { en: string; hi: string }[] | null;
}

export interface CoupleSession {
  id: string;
  room_id: string;
  mode: CoupleMode;
  category: string | null;
  status: "active" | "finished" | "abandoned";
  started_by: string | null;
  current_round: number;
  total_rounds: number;
  points: number;
  compat_pct: number | null;
  result: { x_correct: number; o_correct: number; same_answers: number; title: CompatTitle } | null;
  started_at: string;
  ended_at: string | null;
}

export interface CoupleRound {
  id: string;
  session_id: string;
  room_id: string;
  idx: number;
  question_id: number;
  x_answered: boolean;
  o_answered: boolean;
  revealed_at: string | null;
}

export interface CoupleAnswer {
  round_id: string;
  player_id: string;
  self_answer: number | null;
  guess_answer: number | null;
  text_answer: string | null;
  created_at: string;
}
