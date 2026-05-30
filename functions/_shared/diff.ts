import type { FundData, FundChange } from './types.js';

export function detectChanges(oldFunds: FundData[], newFunds: FundData[]): FundChange[] {
  const oldMap = new Map(oldFunds.map(f => [f.code, f]));
  const changes: FundChange[] = [];

  for (const nf of newFunds) {
    const of = oldMap.get(nf.code);
    if (!of) continue;

    if (of.status !== nf.status || of.limitAmount !== nf.limitAmount) {
      changes.push({
        code: nf.code,
        name: nf.name,
        company: nf.company,
        old: { status: of.status, limitAmount: of.limitAmount },
        new: { status: nf.status, limitAmount: nf.limitAmount },
      });
    }
  }

  return changes;
}
