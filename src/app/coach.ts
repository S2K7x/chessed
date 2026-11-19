import { getLocale, t } from '../i18n';
import { CLASSIFIER_VERSION } from '../core/classify';
import { buildSheet, levelFromElo, PROMPT_VERSION, type FactSheet, type Level } from '../core/coach/sheet';
import { verifyCoachText, type CoachText } from '../core/coach/verify';
import type { Color } from '../core/eval';
import type { Game } from '../core/game';
import type { MoveReview } from '../core/review';
import { db, type Settings } from '../db/db';

export type CoachResult =
  | { status: 'ok'; text: CoachText; cached: boolean }
  | { status: 'rejected'; problems: string[] }
  | { status: 'error'; message: string };

export function coachLevel(settings: Settings, game: Game, myColor: Color | undefined): Level {
  if (settings.level !== 'auto') return settings.level;
  const elo = myColor ? game[myColor].elo : (game.white.elo ?? game.black.elo);
  return levelFromElo(elo);
}

export const coachAvailable = (s: Settings) => s.llmCoach && !!s.coachUrl.trim() && !!s.coachToken.trim();

async function callCoach(s: Settings, sheet: FactSheet, feedback: string[]): Promise<CoachText> {
  const res = await fetch(s.coachUrl.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.coachToken.trim()}` },
    body: JSON.stringify({ sheet, feedback }),
  });
  const data = (await res.json().catch(() => ({}))) as CoachText & { error?: string };
  if (!res.ok) throw new Error(data.error ?? t('coach.status', { status: res.status }));
  return data;
}

/**
 * Asks the language-model coach to rewrite the verified facts of a move, then
 * checks the answer against the board. One retry with the problems found;
 * after that the template explanation stays.
 */
export async function coachExplanation(
  m: MoveReview,
  game: Game,
  settings: Settings,
  ctx: { myColor: Color | undefined; opening?: string },
): Promise<CoachResult> {
  const move = game.moves.find((x) => x.ply === m.ply);
  if (!move) return { status: 'error', message: t('coach.unknownMove') };
  const level = coachLevel(settings, game, ctx.myColor);
  const key = `${move.fenBefore}|${m.uci}|${CLASSIFIER_VERSION}|${PROMPT_VERSION}|${level}|${getLocale()}`;
  const cached = await db.explanations.get(key);
  if (cached) return { status: 'ok', text: cached.text, cached: true };

  const { sheet, vocabulary } = buildSheet(m, {
    level,
    player: ctx.myColor === m.color ? 'you' : m.color,
    fenBefore: move.fenBefore,
    fenAfter: move.fenAfter,
    ...(ctx.opening ? { opening: ctx.opening } : {}),
  });
  const ids = sheet.facts.map((f) => f.id);
  try {
    let feedback: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await callCoach(settings, sheet, feedback);
      const verdict = verifyCoachText(text, vocabulary, ids);
      if (verdict.ok) {
        await db.explanations.put({ key, text, createdAt: Date.now() });
        return { status: 'ok', text, cached: false };
      }
      feedback = verdict.problems;
    }
    return { status: 'rejected', problems: feedback };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
