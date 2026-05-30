import { describe, it, expect } from 'vitest';
import { detectChanges } from '../functions/_shared/diff.js';
import type { FundData } from '../functions/_shared/types.js';

describe('detectChanges', () => {
  it('returns empty array when no changes', () => {
    const funds: FundData[] = [
      { code: '000001', name: 'Test Fund', company: 'Test', status: 'open', limitAmount: null },
    ];
    expect(detectChanges(funds, funds)).toEqual([]);
  });

  it('detects status change', () => {
    const oldFunds: FundData[] = [
      { code: '000001', name: 'Test Fund', company: 'Test', status: 'open', limitAmount: null },
    ];
    const newFunds: FundData[] = [
      { code: '000001', name: 'Test Fund', company: 'Test', status: 'suspended', limitAmount: null },
    ];
    const changes = detectChanges(oldFunds, newFunds);
    expect(changes).toHaveLength(1);
    expect(changes[0].old.status).toBe('open');
    expect(changes[0].new.status).toBe('suspended');
  });

  it('detects limit amount change', () => {
    const oldFunds: FundData[] = [
      { code: '000001', name: 'Test Fund', company: 'Test', status: 'limited', limitAmount: 200 },
    ];
    const newFunds: FundData[] = [
      { code: '000001', name: 'Test Fund', company: 'Test', status: 'limited', limitAmount: 100 },
    ];
    const changes = detectChanges(oldFunds, newFunds);
    expect(changes).toHaveLength(1);
    expect(changes[0].old.limitAmount).toBe(200);
    expect(changes[0].new.limitAmount).toBe(100);
  });

  it('ignores funds not in old data', () => {
    const oldFunds: FundData[] = [];
    const newFunds: FundData[] = [
      { code: '000001', name: 'Test Fund', company: 'Test', status: 'open', limitAmount: null },
    ];
    expect(detectChanges(oldFunds, newFunds)).toEqual([]);
  });

  it('ignores funds not in new data', () => {
    const oldFunds: FundData[] = [
      { code: '000001', name: 'Test Fund', company: 'Test', status: 'open', limitAmount: null },
    ];
    const newFunds: FundData[] = [];
    expect(detectChanges(oldFunds, newFunds)).toEqual([]);
  });
});
