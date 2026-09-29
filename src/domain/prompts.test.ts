import { PROMPTS, randomPrompt } from './prompts';

describe('randomPrompt', () => {
  test('picks the first prompt when random() returns 0', () => {
    expect(randomPrompt(() => 0)).toBe(PROMPTS[0]);
  });

  test('picks the last prompt when random() returns just under 1', () => {
    expect(randomPrompt(() => 0.999999)).toBe(PROMPTS[PROMPTS.length - 1]);
  });

  test('every prompt is reachable by some random() value', () => {
    const reached = new Set(
      PROMPTS.map((_, i) => randomPrompt(() => i / PROMPTS.length)),
    );
    expect(reached.size).toBe(PROMPTS.length);
  });

  test('defaults to Math.random when no source is given', () => {
    expect(PROMPTS).toContain(randomPrompt());
  });
});

describe('PROMPTS', () => {
  test('has exactly 30 prompts, all distinct and non-empty', () => {
    expect(PROMPTS).toHaveLength(30);
    expect(new Set(PROMPTS).size).toBe(30);
    for (const prompt of PROMPTS) {
      expect(prompt.trim().length).toBeGreaterThan(0);
    }
  });
});
