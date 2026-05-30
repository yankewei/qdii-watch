import { describe, it, expect } from 'vitest';
import { formatStatus, buildFeishuCard, buildDingtalkMarkdown, buildGenericPayload } from '../functions/_shared/format.js';
import type { FundChange } from '../functions/_shared/types.js';

describe('formatStatus', () => {
  it('formats open status', () => {
    expect(formatStatus('open', null)).toBe('开放申购');
  });

  it('formats suspended status', () => {
    expect(formatStatus('suspended', null)).toBe('暂停申购');
  });

  it('formats limited with amount', () => {
    expect(formatStatus('limited', 200)).toBe('限额 200元');
  });

  it('formats limited without amount', () => {
    expect(formatStatus('limited', null)).toBe('限额');
  });
});

describe('buildFeishuCard', () => {
  it('returns valid card structure', () => {
    const changes: FundChange[] = [
      {
        code: '000001',
        name: 'Test Fund',
        company: 'Test',
        old: { status: 'open', limitAmount: null },
        new: { status: 'limited', limitAmount: 100 },
      },
    ];
    const card = buildFeishuCard(changes, '2026-05-30T08:00:00Z');
    expect(card.msg_type).toBe('interactive');
    expect(card.card.header.title.content).toBe('QDII-Watch 限额变动提醒');
    expect(card.card.elements.length).toBeGreaterThan(0);
  });
});

describe('buildDingtalkMarkdown', () => {
  it('returns valid markdown structure', () => {
    const changes: FundChange[] = [
      {
        code: '000001',
        name: 'Test Fund',
        company: 'Test',
        old: { status: 'open', limitAmount: null },
        new: { status: 'limited', limitAmount: 100 },
      },
    ];
    const md = buildDingtalkMarkdown(changes, '2026-05-30T08:00:00Z');
    expect(md.msgtype).toBe('markdown');
    expect(md.markdown.title).toBe('QDII-Watch 限额变动提醒');
    expect(md.markdown.text).toContain('Test Fund');
  });
});
