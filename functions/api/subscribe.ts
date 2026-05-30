import type { WebhookSubscription } from '../_shared/types.js';

const ALLOWED_DOMAINS = [
  'open.feishu.cn',
  'oapi.dingtalk.com',
];

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

function isAllowedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith('.open.feishu.cn') ||
           hostname.endsWith('.oapi.dingtalk.com') ||
           ALLOWED_DOMAINS.includes(hostname);
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
  const type = typeof body.type === 'string' ? body.type : '';

  if (!url || !type) {
    return new Response(JSON.stringify({ error: 'Missing url or type' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!url.startsWith('https://')) {
    return new Response(JSON.stringify({ error: 'URL must use HTTPS' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (type !== 'feishu' && type !== 'dingtalk' && type !== 'webhook') {
    return new Response(JSON.stringify({ error: 'Invalid type' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (type !== 'webhook' && !isAllowedDomain(url)) {
    return new Response(JSON.stringify({ error: 'Invalid webhook domain for the selected type' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const existing = await env.SUBSCRIPTIONS.get('webhooks');
    const subs: WebhookSubscription[] = existing ? JSON.parse(existing) : [];

    if (subs.some(s => s.url === url)) {
      return new Response(JSON.stringify({ success: true, message: 'Already subscribed' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    subs.push({
      url,
      type: type as 'feishu' | 'dingtalk' | 'webhook',
      createdAt: new Date().toISOString(),
    });

    await env.SUBSCRIPTIONS.put('webhooks', JSON.stringify(subs));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to save subscription' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
