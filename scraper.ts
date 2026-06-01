import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { detectChanges } from './functions/_shared/diff.js';
import { withRetry } from './functions/_shared/retry.js';

interface Fund {
  code: string;
  name: string;
  company: string;
}

interface FundData {
  code: string;
  name: string;
  company: string;
  status: 'open' | 'limited' | 'suspended' | 'unknown' | 'error';
  statusText: string;
  limitAmount: number | null;
  rawStatus: string;
  weeklyReturn: number | null;
  monthlyReturn: number | null;
  yearlyReturn: number | null;
}

const FUNDS: Fund[] = [
  { code: '270042', name: '广发纳指100ETF联接(QDII)A', company: '广发基金' },
  { code: '040046', name: '华安纳斯达克100ETF联接(QDII)A', company: '华安基金' },
  { code: '018043', name: '天弘纳斯达克100指数发起(QDII)A', company: '天弘基金' },
  { code: '016532', name: '嘉实纳斯达克100ETF发起联接(QDII)A', company: '嘉实基金' },
  { code: '000834', name: '大成纳斯达克100ETF联接(QDII)A', company: '大成基金' },
  { code: '160213', name: '国泰纳斯达克100指数(QDII)', company: '国泰基金' },
  { code: '016452', name: '南方纳斯达克100指数发起(QDII)A', company: '南方基金' },
  { code: '019547', name: '招商纳斯达克100ETF发起式联接(QDII)A', company: '招商基金' },
  { code: '016055', name: '博时纳斯达克100ETF发起式联接(QDII)A', company: '博时基金' },
  { code: '539001', name: '建信纳斯达克100指数(QDII)A', company: '建信基金' },
  { code: '019524', name: '华泰柏瑞纳斯达克100ETF发起式联接(QDII)A', company: '华泰柏瑞基金' },
  { code: '161130', name: '易方达纳斯达克100LOF', company: '易方达基金' },
  { code: '018966', name: '汇添富纳斯达克100ETF发起式联接(QDII)A', company: '汇添富基金' },
  { code: '019172', name: '摩根纳斯达克100指数(QDII)A', company: '摩根基金' },
  { code: '019736', name: '宝盈纳斯达克100指数发起(QDII)A', company: '宝盈基金' },
  { code: '019441', name: '万家纳斯达克100指数发起式(QDII)A', company: '万家基金' },
  { code: '015299', name: '华夏纳斯达克100ETF发起式联接(QDII)A', company: '华夏基金' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Referer': 'https://fund.eastmoney.com/',
};

async function fetchFundPage(code: string): Promise<string | null> {
  try {
    return await withRetry(async () => {
      const url = `https://fundf10.eastmoney.com/jjfl_${code}.html`;
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }, {
      maxRetries: 2,
      baseDelayMs: 800,
      shouldRetry: (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        return /HTTP|fetch|timeout|network|ECONNRESET|ETIMEDOUT/i.test(msg);
      },
    });
  } catch (e) {
    console.error(`[${code}] fetch error after retries:`, e);
    return null;
  }
}

function parseFundPage(html: string, code: string): FundData {
  const $ = cheerio.load(html);

  const result: FundData = {
    code,
    name: '',
    company: '',
    status: 'unknown',
    statusText: '',
    limitAmount: null,
    rawStatus: '',
    weeklyReturn: null,
    monthlyReturn: null,
    yearlyReturn: null,
  };

  // 提取申购状态
  let purchaseStatus = '';
  $('td.th.w110').each((_, el) => {
    const text = $(el).text().trim();
    if (text === '申购状态') {
      const val = $(el).next('td.w135').text().trim();
      if (val) purchaseStatus = val;
    }
  });

  if (!purchaseStatus) {
    const spanText = $('span').filter((_, el) => /限大额|开放申购|暂停申购|封闭期/.test($(el).text())).first().text().trim();
    if (spanText) purchaseStatus = spanText;
  }

  result.rawStatus = purchaseStatus;
  result.statusText = purchaseStatus;

  if (purchaseStatus.includes('暂停')) result.status = 'suspended';
  else if (purchaseStatus.includes('限大额') || purchaseStatus.includes('限额')) result.status = 'limited';
  else if (purchaseStatus.includes('开放')) result.status = 'open';
  else if (purchaseStatus.includes('封闭')) result.status = 'closed' as any;

  // 提取限额（仅限大额状态）
  if (result.status === 'limited') {
    $('td.th.w110').each((_, el) => {
      if ($(el).text().includes('日累计申购限额')) {
        const valText = $(el).next('td.w135').text().trim();
        const m = valText.match(/([\d,]+(?:\.\d+)?)/);
        if (m) result.limitAmount = parseFloat(m[1].replace(/,/g, ''));
      }
    });
  }

  return result;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchReturnRates(codes: string[]): Promise<Map<string, { weekly: number | null; monthly: number | null; yearly: number | null }>> {
  const map = new Map<string, { weekly: number | null; monthly: number | null; yearly: number | null }>();
  let firstDone = false;

  for (const code of codes) {
    const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jdzf&code=${code}&per=1`;

    try {
      const text = await withRetry(async () => {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      }, {
        maxRetries: 2,
        baseDelayMs: 800,
      });

      const fn = new Function(text + '; return apidata;');
      const data: { content: string } = fn();
      const html = data.content || '';
      const $ = cheerio.load(html);

      const result: { weekly: number | null; monthly: number | null; yearly: number | null } = {
        weekly: null,
        monthly: null,
        yearly: null,
      };

      const labelMap: Record<string, keyof typeof result> = {
        '近1周': 'weekly',
        '近1月': 'monthly',
        '近1年': 'yearly',
      };

      $('ul').each((_, ul) => {
        const title = $(ul).find('li.title').first().text().trim();
        const key = labelMap[title];
        if (!key) return;
        const valText = $(ul).find('li.tor').first().text().trim();
        const m = valText.match(/(-?[\d.]+)%/);
        if (m) result[key] = parseFloat(m[1]);
      });

      if (!firstDone) {
        console.log(`[收益率] ${code} -> 1周=${result.weekly}% 1月=${result.monthly}% 1年=${result.yearly}%`);
        firstDone = true;
      }

      map.set(code, result);
    } catch (e) {
      console.error(`[收益率] ${code} 获取失败:`, e);
    }

    await sleep(300);
  }

  console.log(`收益率数据: ${map.size}/${codes.length} 只基金获取成功`);
  return map;
}

async function main() {
  console.log('='.repeat(50));
  console.log('QDII-Watch 爬虫启动');
  console.log('='.repeat(50));

  const results: FundData[] = [];

  for (const fund of FUNDS) {
    const html = await fetchFundPage(fund.code);
    if (!html) {
      results.push({
        code: fund.code,
        name: fund.name,
        company: fund.company,
        status: 'error',
        statusText: '获取失败',
        limitAmount: null,
        rawStatus: '',
        weeklyReturn: null,
        monthlyReturn: null,
        yearlyReturn: null,
      });
      continue;
    }

    const parsed = parseFundPage(html, fund.code);
    parsed.name = fund.name;
    parsed.company = fund.company;
    results.push(parsed);
    console.log(`[${fund.code}] ${fund.name} -> status=${parsed.status}, limit=${parsed.limitAmount}`);
    await sleep(500);
  }

  // 获取收益率数据
  const codes = FUNDS.map(f => f.code);
  const returnMap = await fetchReturnRates(codes);
  for (const r of results) {
    const ret = returnMap.get(r.code);
    if (ret) {
      r.weeklyReturn = ret.weekly;
      r.monthlyReturn = ret.monthly;
      r.yearlyReturn = ret.yearly;
    } else {
      r.weeklyReturn = null;
      r.monthlyReturn = null;
      r.yearlyReturn = null;
    }
  }

  // 排序: open > limited > suspended > unknown > error
  const order = { open: 0, limited: 1, suspended: 2, unknown: 3, error: 4 };
  results.sort((a, b) => {
    const oa = order[a.status] ?? 99;
    const ob = order[b.status] ?? 99;
    if (oa !== ob) return oa - ob;
    return (a.limitAmount ?? Infinity) - (b.limitAmount ?? Infinity);
  });

  const data = {
    updatedAt: new Date().toISOString(),
    fundCount: results.length,
    funds: results,
  };

  const outDir = path.join(process.cwd(), 'docs', 'data');

  // 变化检测
  let changes = [];
  const oldFile = path.join(outDir, 'funds.json');
  if (fs.existsSync(oldFile)) {
    try {
      const oldData = JSON.parse(fs.readFileSync(oldFile, 'utf-8'));
      const oldFunds = oldData.funds || [];
      changes = detectChanges(oldFunds, results);
      if (changes.length > 0) {
        console.log(`\n检测到 ${changes.length} 只基金发生变化:`);
        changes.forEach((c: any) => {
          console.log(`  [${c.code}] ${c.name}: ${c.old.status}/${c.old.limitAmount} → ${c.new.status}/${c.new.limitAmount}`);
        });
      }
    } catch (e) {
      console.error('读取旧数据失败:', e);
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'funds.json');
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf-8');

  // 如果有变化，写入 changes.json 供 GitHub Actions 使用
  if (changes.length > 0) {
    const changesFile = path.join(outDir, 'changes.json');
    fs.writeFileSync(changesFile, JSON.stringify({ changes }, null, 2), 'utf-8');
    console.log(`变化详情已保存: ${changesFile}`);
  }

  console.log(`\n数据已保存: ${outFile}`);
  console.log(`更新时间: ${data.updatedAt}`);
  console.log(`基金数量: ${data.fundCount}`);

  const stats: Record<string, number> = {};
  results.forEach(f => { stats[f.status] = (stats[f.status] || 0) + 1; });
  console.log('状态统计:', stats);

  const errorRate = (stats.error || 0) / results.length;
  if (errorRate > 0.3) {
    console.error('错误率过高，请检查！');
    process.exit(1);
  }
}

main();
