import { describe, it, expect } from 'vitest';
import { withRetry } from '../functions/_shared/retry.js';

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('retries on failure then succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return 'ok';
    }, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws after max retries exceeded', async () => {
    await expect(
      withRetry(async () => {
        throw new Error('always fail');
      }, { maxRetries: 2, baseDelayMs: 10 }),
    ).rejects.toThrow('always fail');
  });

  it('respects shouldRetry predicate', async () => {
    let attempts = 0;
    await expect(
      withRetry(async () => {
        attempts++;
        throw new Error('skip');
      }, {
        maxRetries: 3,
        baseDelayMs: 10,
        shouldRetry: (err) => !(err instanceof Error && err.message === 'skip'),
      }),
    ).rejects.toThrow('skip');
    expect(attempts).toBe(1);
  });

  it('delays increase exponentially', async () => {
    const delays: number[] = [];
    let lastTime = Date.now();

    await expect(
      withRetry(async () => {
        const now = Date.now();
        delays.push(now - lastTime);
        lastTime = now;
        throw new Error('fail');
      }, { maxRetries: 2, baseDelayMs: 50 }),
    ).rejects.toThrow('fail');

    // 第一次立即执行（无延迟），第二次有延迟，第三次有更大延迟
    expect(delays.length).toBe(3);
    expect(delays[0]).toBeLessThan(20);
    expect(delays[1]).toBeGreaterThanOrEqual(40);
    expect(delays[2]).toBeGreaterThanOrEqual(80);
  });
});
