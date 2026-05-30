import { describe, expect, it, vi } from 'vitest';
import worker from '../worker.js';

function createEnv() {
  const values = new Map<string, string>();

  return {
    ASSETS: { fetch: vi.fn(async () => new Response('asset response')) },
    NOTIFY_TOKEN: 'test-token',
    TURNSTILE_SECRET: 'test-turnstile-secret',
    SUBSCRIPTIONS: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
    },
  };
}

const ctx = {
  passThroughOnException: vi.fn(),
  waitUntil: vi.fn(),
} as unknown as ExecutionContext;

describe('worker routes', () => {
  it('rejects subscribe without valid turnstile token', async () => {
    const env = createEnv();
    const request = new Request('https://example.com/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/webhook', type: 'webhook', turnstileToken: 'invalid' }),
    });

    const response = await worker.fetch(request, env, ctx);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'CAPTCHA verification failed' });
  });

  it('falls back to static assets for non-API requests', async () => {
    const env = createEnv();
    const request = new Request('https://example.com/');

    const response = await worker.fetch(request, env, ctx);

    expect(await response.text()).toBe('asset response');
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(request);
  });

  it('rejects notifications when the token is not configured', async () => {
    const env = { ...createEnv(), NOTIFY_TOKEN: undefined } as unknown as ReturnType<typeof createEnv>;
    const request = new Request('https://example.com/api/notify', {
      method: 'POST',
      headers: { Authorization: 'Bearer undefined' },
    });

    const response = await worker.fetch(request, env, ctx);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Server misconfigured' });
  });
});
