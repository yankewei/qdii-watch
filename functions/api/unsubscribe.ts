import type { WebhookSubscription } from '../_shared/types.js';

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    const data = await res.json() as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction<{ SUBSCRIPTIONS: KVNamespace; TURNSTILE_SECRET: string }> = async (context) => {
  const { request, env } = context;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
  if (!turnstileToken || !(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET))) {
    return new Response(JSON.stringify({ error: 'CAPTCHA verification failed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';

  if (!url) {
    return new Response(JSON.stringify({ error: 'Missing url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const existing = await env.SUBSCRIPTIONS.get('webhooks');
    if (!existing) {
      return new Response(JSON.stringify({ success: true, message: 'Not subscribed' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const subs: WebhookSubscription[] = JSON.parse(existing);
    const filtered = subs.filter(s => s.url !== url);

    if (filtered.length === subs.length) {
      return new Response(JSON.stringify({ success: true, message: 'Not subscribed' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await env.SUBSCRIPTIONS.put('webhooks', JSON.stringify(filtered));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to remove subscription' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
