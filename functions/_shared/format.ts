import type { FundChange } from './types.js';

export function formatStatus(status: string, limitAmount: number | null): string {
  if (status === 'open') return '开放申购';
  if (status === 'suspended') return '暂停申购';
  if (status === 'limited') {
    return limitAmount !== null ? `限额 ${limitAmount}元` : '限额';
  }
  return status;
}

function formatChangeLine(change: FundChange): string {
  const oldDesc = formatStatus(change.old.status, change.old.limitAmount);
  const newDesc = formatStatus(change.new.status, change.new.limitAmount);
  return `**${change.name}**\n> ${oldDesc} → ${newDesc}`;
}

function formatChangeLinePlain(change: FundChange): string {
  const oldDesc = formatStatus(change.old.status, change.old.limitAmount);
  const newDesc = formatStatus(change.new.status, change.new.limitAmount);
  return `${change.name}\n${oldDesc} → ${newDesc}`;
}

export function buildFeishuCard(changes: FundChange[], updatedAt: string) {
  const elements = changes.map(c => ({
    tag: 'div' as const,
    text: {
      tag: 'lark_md' as const,
      content: formatChangeLine(c),
    },
  }));

  elements.push({
    tag: 'note' as const,
    text: {
      tag: 'plain_text' as const,
      content: `更新时间：${new Date(updatedAt).toLocaleString('zh-CN')}`,
    },
  });

  return {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text' as const, content: 'QDII-Watch 限额变动提醒' },
        template: 'blue' as const,
      },
      elements,
    },
  };
}

export function buildDingtalkMarkdown(changes: FundChange[], updatedAt: string) {
  const lines = changes.map(c => formatChangeLine(c));
  const text = [
    '#### QDII-Watch 限额变动提醒',
    '',
    ...lines,
    '',
    '---',
    `更新时间：${new Date(updatedAt).toLocaleString('zh-CN')}`,
  ].join('\n');

  return {
    msgtype: 'markdown',
    markdown: {
      title: 'QDII-Watch 限额变动提醒',
      text,
    },
  };
}

export function buildGenericPayload(changes: FundChange[], updatedAt: string, url: string) {
  return {
    title: 'QDII-Watch 限额变动提醒',
    changes: changes.map(c => ({
      code: c.code,
      name: c.name,
      company: c.company,
      old: c.old,
      new: c.new,
    })),
    updatedAt,
    url,
  };
}
