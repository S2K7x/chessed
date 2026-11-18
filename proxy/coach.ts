import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

/**
 * Writes a pedagogical explanation of one move from a fact sheet built by the
 * app (src/core/coach/sheet.ts). The model only rewrites verified facts; the
 * app checks the answer again (src/core/coach/verify.ts) before showing it.
 */

export const DEFAULT_COACH_MODEL = 'claude-opus-5-5';

export const CoachTextSchema = z.object({
  headline: z.string(),
  explanation: z.string(),
  why_better: z.string(),
  lesson: z.string(),
  cited_facts: z.array(z.string()),
});
export type CoachText = z.infer<typeof CoachTextSchema>;

export const SYSTEM_PROMPT = `You are a chess coach. You explain one move of the player's game in plain English, for a player of a given level.

You receive a fact sheet in JSON. Everything in it was computed by a chess engine and checked on the board.

Rules:
1. Use only what the fact sheet contains. Every move, square, piece placement and number you write must appear in it. Never invent a threat, a variation, a piece or an evaluation, and never add moves to a line.
2. Do not contradict the move's classification.
3. Address the player as "you" when "player" is "you"; otherwise name the side (White or Black).
4. Adapt to "level":
   - beginner: simple words, one idea, explain any chess term in a few words, at most one short line of moves;
   - intermediate: name the tactical pattern, show one short line;
   - advanced: be concise; you may connect the facts into a plan.
5. Fields:
   - headline: at most 12 words.
   - explanation: 2 to 4 sentences on what the move did and what it allowed or missed.
   - why_better: 1 or 2 sentences on the better move, from the facts; an empty string when the move was good.
   - lesson: one practical habit for the next games, based on the sheet's lesson, worded for this level.
   - cited_facts: the ids of the facts you used.
6. If "feedback" lists problems with a previous answer, fix every one of them.`;

export interface CoachRequest {
  sheet: unknown;
  feedback?: string[];
}

export async function writeExplanation(client: Anthropic, model: string, req: CoachRequest): Promise<CoachText> {
  const message = await client.beta.messages.parse({
    model,
    max_tokens: 4000,
    // Opt-in server-side fallback: if the model declines, the API re-runs the
    // request on a fallback model chosen for the refusal category.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    cache_control: { type: 'ephemeral' },
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low', format: betaZodOutputFormat(CoachTextSchema) },
    messages: [{ role: 'user', content: JSON.stringify({ fact_sheet: req.sheet, feedback: req.feedback ?? [] }) }],
  });
  if (message.stop_reason === 'refusal') throw new CoachError('The model declined to write this explanation.', 502);
  if (message.stop_reason === 'max_tokens') throw new CoachError('The explanation was cut off.', 502);
  if (!message.parsed_output) throw new CoachError('The model returned no usable explanation.', 502);
  return message.parsed_output;
}

export class CoachError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
