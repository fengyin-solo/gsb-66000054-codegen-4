import type { ExecutionHistoryItem } from '../store/interview';

export interface ReportTestCase {
  passed: boolean;
  input: string;
  expected: string;
  actual?: string;
}

export interface ReportCurrentResult {
  title: string;
  type: 'run' | 'submit';
  success: boolean;
  output?: string;
  error?: string;
  runtime?: number;
  memory?: number;
  testResults?: ReportTestCase[];
  language: string;
}

export interface BuildReportOptions {
  scope: 'current' | 'history';
  failedOnly: boolean;
  problemTitle?: string;
  timeLimit: number;
  memoryLimit: number;
  current?: ReportCurrentResult | null;
  historyItems?: ExecutionHistoryItem[];
  generatedAt?: Date;
}

// 与页面 SubmissionResult 中 STATUS_CONFIG 的文案保持一致
const STATUS_LABELS: Record<string, string> = {
  running: '运行中',
  pending: '等待中',
  success: '通过',
  failed: '失败',
};

const getHistoryStatusKey = (item: ExecutionHistoryItem): string =>
  item.status || (item.passedCount === item.totalCount && item.totalCount > 0 ? 'success' : 'failed');

const isRunningStatus = (statusKey: string): boolean => statusKey === 'running' || statusKey === 'pending';

const passRateOf = (item: ExecutionHistoryItem): number =>
  item.totalCount > 0 ? (item.passedCount / item.totalCount) * 100 : 0;

const typeLabel = (type: 'run' | 'submit'): string => (type === 'submit' ? '提交' : '运行');

const formatTime = (dateString: string): string =>
  new Date(dateString).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const formatDateTime = (date: Date): string =>
  date.toLocaleString('zh-CN', { hour12: false });

const pushCodeBlock = (lines: string[], label: string, value: string): void => {
  lines.push(`- ${label}:`, '', '```', value, '```', '');
};

const appendCaseSections = (
  lines: string[],
  testResults: ReportTestCase[] | undefined,
  failedOnly: boolean,
  heading: string,
): void => {
  if (!testResults || testResults.length === 0) {
    return;
  }
  const entries = testResults
    .map((test, index) => ({ test, index }))
    .filter(({ test }) => !failedOnly || !test.passed);

  const scopeLabel = failedOnly ? '失败用例' : '测试用例';
  lines.push(`${heading} ${scopeLabel}（${entries.length}/${testResults.length}）`, '');
  if (entries.length === 0) {
    lines.push(failedOnly ? '全部通过，无失败用例。' : '无测试用例。', '');
    return;
  }
  entries.forEach(({ test, index }) => {
    lines.push(`${heading}# 用例 ${index + 1}（${test.passed ? '通过' : '失败'}）`, '');
    pushCodeBlock(lines, '输入', test.input || '(空)');
    pushCodeBlock(lines, '期望输出', test.expected || '(空)');
    pushCodeBlock(lines, '实际输出', test.actual || '—');
  });
};

const buildCurrentSection = (
  current: ReportCurrentResult,
  failedOnly: boolean,
  timeLimit: number,
  memoryLimit: number,
): string[] => {
  const lines: string[] = [];
  const testResults = current.testResults;
  const total = testResults?.length ?? 0;
  const passed = testResults?.filter(t => t.passed).length ?? 0;

  lines.push(`## 当前结果（${typeLabel(current.type)}）`, '');
  lines.push('| 项目 | 结果 |', '| --- | --- |');
  lines.push(`| 语言 | ${current.language} |`);
  if (testResults && total > 0) {
    lines.push(`| 状态 | ${current.success && passed === total ? '全部通过' : '部分通过'} |`);
    lines.push(`| 通过数 | ${passed}/${total} |`);
  } else {
    lines.push(`| 状态 | ${current.success ? '执行成功' : '执行失败'} |`);
  }
  if (current.runtime !== undefined) {
    lines.push(`| 运行时间 | ${current.runtime}ms（限制 ${timeLimit}ms） |`);
  }
  if (current.memory !== undefined) {
    lines.push(`| 内存 | ${current.memory}MB（限制 ${memoryLimit}MB） |`);
  }
  lines.push('');

  if (current.error) {
    lines.push('### 错误信息', '', '```', current.error, '```', '');
  }
  if (current.output && !testResults) {
    lines.push('### 运行输出', '', '```', current.output, '```', '');
  }

  appendCaseSections(lines, testResults, failedOnly, '###');
  return lines;
};

const buildHistorySection = (
  items: ExecutionHistoryItem[],
  failedOnly: boolean,
): string[] => {
  const lines: string[] = [];
  lines.push(`## 历史对比（最近 ${items.length} 次执行记录）`, '');

  // 与页面 comparisonData 的最佳值计算逻辑保持一致
  const runtimes = items.map(i => i.runtime).filter((r): r is number => r !== undefined);
  const memories = items.map(i => i.memory).filter((m): m is number => m !== undefined);
  const passRates = items.map(passRateOf).filter(r => r > 0);
  const bestRuntime = runtimes.length > 0 ? Math.min(...runtimes) : undefined;
  const bestMemory = memories.length > 0 ? Math.min(...memories) : undefined;
  const bestPassRate = passRates.length > 0 ? Math.max(...passRates) : undefined;

  lines.push('### 结果对比', '');
  lines.push(
    '| 记录 | 时间 | 类型 | 语言 | 状态 | 通过数 | 通过率 | 运行时间 | 内存 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  items.forEach((item, idx) => {
    const statusKey = getHistoryStatusKey(item);
    const running = isRunningStatus(statusKey);
    const rate = passRateOf(item);
    const bestMark = (isBest: boolean) => (isBest ? ' 🏆' : '');
    const cells = [
      `#${idx + 1}${idx === 0 ? '（最新）' : ''}`,
      formatTime(item.timestamp),
      typeLabel(item.type),
      item.language,
      STATUS_LABELS[statusKey] || statusKey,
      running ? '—' : `${item.passedCount}/${item.totalCount || '-'}`,
      running ? '—' : `${Math.round(rate)}%${bestMark(bestPassRate !== undefined && rate === bestPassRate && rate > 0)}`,
      running ? '—' : item.runtime !== undefined ? `${item.runtime}ms${bestMark(item.runtime === bestRuntime)}` : '-',
      running ? '—' : item.memory !== undefined ? `${item.memory}MB${bestMark(item.memory === bestMemory)}` : '-',
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  });
  lines.push('');

  const bestParts: string[] = [];
  if (bestRuntime !== undefined) bestParts.push(`最快耗时 ${bestRuntime}ms`);
  if (bestMemory !== undefined) bestParts.push(`最低内存 ${bestMemory}MB`);
  if (bestPassRate !== undefined) bestParts.push(`最高通过率 ${Math.round(bestPassRate)}%`);
  if (bestParts.length > 0) {
    lines.push(`🏆 最佳表现：${bestParts.join(' · ')}`, '');
  }

  lines.push('### 各记录用例明细', '');
  items.forEach((item, idx) => {
    const statusKey = getHistoryStatusKey(item);
    const running = isRunningStatus(statusKey);
    lines.push(
      `#### 记录 #${idx + 1}${idx === 0 ? '（最新）' : ''} · ${formatTime(item.timestamp)} · ${typeLabel(item.type)} · ${item.language}`,
      '',
    );
    if (running) {
      lines.push('执行中，暂无结果。', '');
      return;
    }
    const meta: string[] = [
      `状态：${STATUS_LABELS[statusKey] || statusKey}`,
      `通过数：${item.passedCount}/${item.totalCount || '-'}`,
    ];
    if (item.runtime !== undefined) meta.push(`运行时间：${item.runtime}ms`);
    if (item.memory !== undefined) meta.push(`内存：${item.memory}MB`);
    lines.push(meta.join(' · '), '');

    const result = item.result;
    if (result?.testResults && result.testResults.length > 0) {
      appendCaseSections(lines, result.testResults, failedOnly, '#####');
    } else if (result?.error) {
      pushCodeBlock(lines, '错误信息', result.error);
    } else if (result?.output) {
      pushCodeBlock(lines, '输出', result.output);
    } else {
      lines.push('无用例结果。', '');
    }
  });

  return lines;
};

export const buildExecutionReport = (options: BuildReportOptions): string => {
  const {
    scope,
    failedOnly,
    problemTitle,
    timeLimit,
    memoryLimit,
    current,
    historyItems = [],
    generatedAt = new Date(),
  } = options;

  if (scope === 'current' && !current) {
    throw new Error('当前还没有可导出的运行或提交结果');
  }
  if (scope === 'history' && historyItems.length === 0) {
    throw new Error('暂无执行历史记录，无法生成报告');
  }

  const lines: string[] = [];
  lines.push('# 代码执行报告', '');
  lines.push(`- 生成时间：${formatDateTime(generatedAt)}`);
  if (problemTitle) {
    lines.push(`- 题目：${problemTitle}`);
  }
  lines.push(
    `- 报告范围：${scope === 'current' && current
      ? `当前结果（${typeLabel(current.type)}）`
      : `历史对比（最近 ${historyItems.length} 次执行记录）`}`,
  );
  lines.push(`- 用例明细：${failedOnly ? '仅失败用例' : '全部用例'}`);
  lines.push(`- 限制：时间 ${timeLimit}ms · 内存 ${memoryLimit}MB`);
  lines.push('', '---', '');

  if (scope === 'current' && current) {
    lines.push(...buildCurrentSection(current, failedOnly, timeLimit, memoryLimit));
  } else {
    lines.push(...buildHistorySection(historyItems, failedOnly));
  }

  lines.push('---', '', '> 本报告由代码面试平台生成，数据与页面「当前结果 / 历史对比」展示一致。', '');
  return lines.join('\n');
};

export const buildReportFilename = (date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `execution-report-${stamp}.md`;
};

export const downloadTextFile = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
};
