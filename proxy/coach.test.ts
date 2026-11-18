import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { CoachError, SYSTEM_PROMPT, writeExplanation } from './coach';
import worker from './worker';

const answer = { headline: 'Your queen was left hanging', explanation: 'x', why_better: 'y', lesson: 'z', cited_facts: ['F1'] };

function fakeClient(response: object, calls: unknown[] = []): Anthropic {
  return {
    beta: {
      messages: {
        parse: async (params: unknown) => {
          calls.push(params);
          return response;
        },
      },
    },
  } as unknown as Anthropic;
}

describe('writeExplanation', () => {
  it('sends the fact sheet with a JSON schema and returns the parsed answer', async () => {
    const calls: Record<string, unknown>[] = [];
    const out = await writeExplanation(fakeClient({ stop_reason: 'end_turn', parsed_output: answer }, calls), 'claude-opus-5-5', {
      sheet: { level: 'beginner' },
      feedback: ['square h4 is not in the fact sheet'],
    });
    expect(out).toEqual(answer);
    const p = calls[0]!;
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.system).toBe(SYSTEM_PROMPT);
    expect(p.fallbacks).toBe('default');
    expect((p.output_config as { effort: string }).effort).toBe('low');
    const content = (p.messages as { content: string }[])[0]!.content;
    expect(JSON.parse(content)).toEqual({ fact_sheet: { level: 'beginner' }, feedback: ['square h4 is not in the fact sheet'] });
  });

  it('reports refusals and truncated answers', async () => {
    await expect(writeExplanation(fakeClient({ stop_reason: 'refusal', parsed_output: null }), 'm', { sheet: {} })).rejects.toThrow(CoachError);
    await expect(writeExplanation(fakeClient({ stop_reason: 'max_tokens', parsed_output: null }), 'm', { sheet: {} })).rejects.toThrow(/cut off/);
  });
});

describe('worker /coach', () => {
  const post = (headers: Record<string, string> = {}) =>
    new Request('https://proxy.example/coach', { method: 'POST', headers, body: JSON.stringify({ sheet: {} }) });

  it('is disabled without secrets', async () => {
    expect((await worker.fetch(post(), {})).status).toBe(503);
  });

  it('rejects requests without the coach token', async () => {
    const env = { ANTHROPIC_API_KEY: 'k', COACH_TOKEN: 'secret' };
    expect((await worker.fetch(post(), env)).status).toBe(401);
    expect((await worker.fetch(post({ Authorization: 'Bearer wrong' }), env)).status).toBe(401);
  });

  it('answers CORS preflights', async () => {
    const res = await worker.fetch(new Request('https://proxy.example/coach', { method: 'OPTIONS' }), {});
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });
});
