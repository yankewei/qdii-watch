import type { FundChange, NotifyPayload, WebhookSubscription } from '../_shared/types.js';
import { buildFeishuCard, buildDingtalkMarkdown, buildGenericPayload } from '../_shared/format.js';

async function sendWebhook(url: string, body: unknown, timeoutMs = 10000): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    clearTimeout(timeout);
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }
}

function buildPayload(sub: WebhookSubscription, changes: FundChange[], updatedAt: string, siteUrl: string): unknown {
  if (sub.type === 'feishu') {
    return buildFeishuCard(changes, updatedAt);
  }
  if (sub.type === 'dingtalk') {
    return buildDingtalkMarkdown(changes, updatedAt);
  }
  return buildGenericPayload(changes, updatedAt, siteUrl);
}

export const onRequestPost: PagesFunction<{ SUBSCRIPTIONS: KVNamespace; NOTIFY_TOKEN: string }> = async (context) => {
  const { request, env } = context;

  if (!env.NOTIFY_TOKEN) {
    console.error('Missing NOTIFY_TOKEN');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const auth = request.headers.get('Authorization');
  const expected = `Bearer ${env.NOTIFY_TOKEN}`;
  if (!auth || auth !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: NotifyPayload;
  try {
    payload = await request.json() as NotifyPayload;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!Array.isArray(payload.changes) || payload.changes.length === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const existing = await env.SUBSCRIPTIONS.get('webhooks');
    if (!existing) {
      return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const subs: WebhookSubscription[] = JSON.parse(existing);
    const updatedAt = new Date().toISOString();
    const siteUrl = 'https://qdii-watch.r9bs9sftjf.workers.dev';

    const results = await Promise.all(
      subs.map(async (sub) => {
        const body = buildPayload(sub, payload.changes, updatedAt, siteUrl);
        const result = await sendWebhook(sub.url, body);
        return { url: sub.url, ...result };
      })
    );

    const sent = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    const failedDetails = results.filter(r => !r.ok).map(r => ({ url: r.url, error: r.error }));
    if (failedDetails.length > 0) {
      console.error('Failed webhooks:', JSON.stringify(failedDetails));
    }

    return new Response(JSON.stringify({ sent, failed, failures: failedDetails }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Notify error:', e);
    return new Response(JSON.stringify({ error: 'Failed to send notifications' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
