export interface FundData {
  code: string;
  name: string;
  company: string;
  status: string;
  limitAmount: number | null;
  weeklyReturn: number | null;
  monthlyReturn: number | null;
  yearlyReturn: number | null;
}

export interface FundChange {
  code: string;
  name: string;
  company: string;
  old: { status: string; limitAmount: number | null };
  new: { status: string; limitAmount: number | null };
}

export interface WebhookSubscription {
  url: string;
  type: 'feishu' | 'dingtalk' | 'webhook';
  createdAt: string;
}

export interface NotifyPayload {
  changes: FundChange[];
}
