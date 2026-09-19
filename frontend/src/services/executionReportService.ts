import { ExecutionHistoryItem, ExecutionResult } from '../store/interview';
import { LANGUAGE_CONFIGS } from '../types';

export type ReportTestCase = NonNullable<ExecutionResult['testResults']>[number];
export type ReportFilter = 'all' | 'passed' | 'failed';

export interface CurrentReportOptions {
  kind: 'current';
  title: string;
  type: 'run' | 'submit';
  language: string;
  result: ExecutionResult;
  filter: ReportFilter;
  problemTitle?: string;
  timeLimit?: number;
  memoryLimit?: number;
  generatedAt?: Date;
}

export interface HistoryReportOptions {
  kind: 'history';
  items: ExecutionHistoryItem[];
  compareCount: number;
  totalHistoryCount: number;
  selected: ExecutionHistoryItem | null;
  problemTitle?: string;
  timeLimit?: number;
  memoryLimit?: number;
  generatedAt?: Date;
}

export type ReportOptions = CurrentReportOptions | HistoryReportOptions;

const SEPARATOR = '----------------------------------------';
const DOUBLE_SEPARATOR = '========================================';

export const getLanguageLabel = (language: string): string =>
  LANGUAGE_CONFIGS.find(l => l.value === language)?.label || language;

const TYPE_LABELS: Record<'run' | 'submit', string> = {
  run: '运行',
  submit: '提交',
};

const STATUS_LABELS: Record<ExecutionHistoryItem['status'], string> = {
  pending: '等待中',
  running: '运行中',
  success: '通过',
  failed: '失败',
};

/** 与页面保持一致的状态判定逻辑 */
export const getItemStatus = (item: ExecutionHistoryItem): ExecutionHistoryItem['status'] =>
  item.status || (item.passedCount === item.totalCount && item.totalCount > 0 ? 'success' : 'failed');

export const isItemRunning = (item: ExecutionHistoryItem): boolean => {
  const status = getItemStatus(item);
  return status === 'running' || status === 'pending';
};

const FILTER_LABELS: Record<ReportFilter, string> = {
  all: '全部',
  passed: '通过',
  failed: '失败',
};

const pad = (n: number) => String(n).padStart(2, '0');

export const formatFullTime = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const fileTime = (date: Date): string =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
  `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

const indentBlock = (text: string | undefined, prefix = '    '): string => {
  if (text === undefined || text === '') return `${prefix}—`;
  return text.split('\n').map(line => `${prefix}${line}`).join('\n');
};

const formatPercent = (value: number | undefined, limit: number | undefined): string => {
  if (value === undefined || !limit || limit <= 0) return '';
  return ` (限制 ${limit}，占比 ${Math.round((value / limit) * 100)}%)`;
};

const renderTestCase = (tc: ReportTestCase, index: number): string => {
  const lines = [
    `测试用例 ${index + 1} [${tc.passed ? '通过' : '失败'}]`,
    '  输入:',
    indentBlock(tc.input, '    '),
    '  期望输出:',
    indentBlock(tc.expected, '    '),
    '  实际输出:',
    indentBlock(tc.actual, '    '),
  ];
  return lines.join('\n');
};

const renderFailedCases = (testResults: ReportTestCase[]): string => {
  const failed = testResults
    .map((tc, idx) => ({ tc, idx }))
    .filter(({ tc }) => !tc.passed);

  if (failed.length === 0) return '无失败用例。';

  return failed.map(({ tc, idx }) => renderTestCase(tc, idx)).join('\n\n');
};

const buildCurrentReport = (options: CurrentReportOptions): string => {
  const { title, type, language, result, filter } = options;
  const generatedAt = options.generatedAt ?? new Date();
  const testResults = result.testResults;
  const totalCount = testResults?.length || 0;
  const passedCount = testResults?.filter(t => t.passed).length || 0;
  const failedCount = totalCount - passedCount;

  const filteredResults = (testResults || []).filter(t => {
    if (filter === 'passed') return t.passed;
    if (filter === 'failed') return !t.passed;
    return true;
  });

  const lines: string[] = [
    DOUBLE_SEPARATOR,
    '代码执行报告 · 当前结果',
    DOUBLE_SEPARATOR,
    `报告生成时间: ${formatFullTime(generatedAt)}`,
    `结果名称: ${title}`,
    `执行类型: ${TYPE_LABELS[type]}`,
    `编程语言: ${getLanguageLabel(language)}`,
  ];
  if (options.problemTitle) lines.push(`题目: ${options.problemTitle}`);

  lines.push(
    '',
    SEPARATOR,
    '执行概览',
    SEPARATOR,
  );

  if (totalCount > 0) {
    const statusText = result.success
      ? `成功（全部通过 ${passedCount}/${totalCount}）`
      : `失败（${passedCount}/${totalCount} 通过）`;
    lines.push(
      `执行状态: ${statusText}`,
      `通过用例: ${passedCount} / ${totalCount}`,
      `失败用例: ${failedCount}`,
    );
  } else {
    lines.push(
      `执行状态: ${result.success ? '成功' : '失败'}`,
      '通过用例: 无（本次执行未返回测试用例结果）',
    );
  }

  lines.push(
    `运行时间: ${result.runtime !== undefined ? `${result.runtime} ms${formatPercent(result.runtime, options.timeLimit)}` : '—'}`,
    `内存占用: ${result.memory !== undefined ? `${result.memory} MB${formatPercent(result.memory, options.memoryLimit)}` : '—'}`,
  );

  if (testResults && testResults.length > 0) {
    lines.push(
      '',
      SEPARATOR,
      `测试用例列表（筛选：${FILTER_LABELS[filter]}）`,
      SEPARATOR,
    );

    if (filteredResults.length > 0) {
      const rendered = filteredResults.map(tc => {
        const originalIndex = testResults.findIndex(t => t === tc);
        return renderTestCase(tc, originalIndex);
      });
      lines.push(rendered.join('\n\n'));
    } else {
      lines.push('没有符合筛选条件的测试用例。');
    }

    // 筛选为“通过”时列表中不含失败项，单独补充完整的失败用例详情，
    // 保证报告始终包含失败用例的输入、期望与实际。
    if (filter !== 'failed' && failedCount > 0) {
      lines.push(
        '',
        SEPARATOR,
        `失败用例详情（共 ${failedCount} 个）`,
        SEPARATOR,
        renderFailedCases(testResults),
      );
    }
  }

  if (result.output) {
    lines.push(
      '',
      SEPARATOR,
      '运行输出',
      SEPARATOR,
      result.output,
    );
  }

  if (result.error) {
    lines.push(
      '',
      SEPARATOR,
      '错误信息',
      SEPARATOR,
      result.error,
    );
  }

  return lines.join('\n');
};

const buildHistoryReport = (options: HistoryReportOptions): string => {
  const { items, compareCount, totalHistoryCount, selected } = options;
  const generatedAt = options.generatedAt ?? new Date();

  const runtimes = items.map(i => i.runtime).filter((r): r is number => r !== undefined);
  const memories = items.map(i => i.memory).filter((m): m is number => m !== undefined);
  const passRates = items
    .map(i => (i.totalCount > 0 ? (i.passedCount / i.totalCount) * 100 : 0))
    .filter(r => r > 0);
  const bestRuntime = runtimes.length > 0 ? Math.min(...runtimes) : undefined;
  const bestMemory = memories.length > 0 ? Math.min(...memories) : undefined;
  const bestPassRate = passRates.length > 0 ? Math.max(...passRates) : undefined;

  const lines: string[] = [
    DOUBLE_SEPARATOR,
    '代码执行报告 · 历史对比',
    DOUBLE_SEPARATOR,
    `报告生成时间: ${formatFullTime(generatedAt)}`,
  ];
  if (options.problemTitle) lines.push(`题目: ${options.problemTitle}`);
  lines.push(
    `执行记录总数: ${totalHistoryCount}`,
    `本次对比范围: 最近 ${compareCount} 次执行记录（实际 ${items.length} 条）`,
  );
  if (selected) lines.push(`选中记录: ${formatFullTime(new Date(selected.timestamp))} 的${TYPE_LABELS[selected.type]}记录`);

  lines.push(
    '',
    SEPARATOR,
    '结果对比概览',
    SEPARATOR,
  );

  if (items.length === 0) {
    lines.push('暂无可对比的执行记录。');
  } else {
    lines.push('序号    时间                类型  编程语言       状态    通过数    运行时间    内存      通过率');
    items.forEach((item, idx) => {
      // 与页面柱状图编号一致：最新一条编号最大
      const serial = `#${items.length - idx}`;
      const status = getItemStatus(item);
      const running = isItemRunning(item);
      const passRate = item.totalCount > 0 ? Math.round((item.passedCount / item.totalCount) * 100) : 0;
      const runtimeText = running || item.runtime === undefined ? '—' : `${item.runtime}ms`;
      const memoryText = running || item.memory === undefined ? '—' : `${item.memory}MB`;
      const countText = running ? '—' : `${item.passedCount}/${item.totalCount || '-'}`;
      const tags = [
        idx === 0 ? '[最新]' : '',
        !running && item.runtime !== undefined && item.runtime === bestRuntime ? '[🏆最短耗时]' : '',
        !running && item.memory !== undefined && item.memory === bestMemory ? '[🏆最少内存]' : '',
        !running && passRate > 0 && passRate === bestPassRate ? '[🏆最高通过率]' : '',
      ].filter(Boolean).join('');

      lines.push(
        [
          serial.padEnd(7),
          formatFullTime(new Date(item.timestamp)).padEnd(19),
          TYPE_LABELS[item.type].padEnd(5),
          getLanguageLabel(item.language).padEnd(14),
          STATUS_LABELS[status].padEnd(7),
          countText.padEnd(9),
          runtimeText.padEnd(11),
          memoryText.padEnd(9),
          running ? '—' : `${passRate}%`,
          tags,
        ].join(' '),
      );
    });

    lines.push('');
    lines.push(`最佳通过率: ${bestPassRate !== undefined ? `${Math.round(bestPassRate)}%` : '—'}`);
    lines.push(`最短运行时间: ${bestRuntime !== undefined ? `${bestRuntime} ms` : '—'}`);
    lines.push(`最少内存占用: ${bestMemory !== undefined ? `${bestMemory} MB` : '—'}`);
  }

  lines.push(
    '',
    SEPARATOR,
    '对比范围失败用例详情',
    SEPARATOR,
  );

  const finishedWithCases = items.filter(
    item => !isItemRunning(item) && item.result.testResults && item.result.testResults.some(tc => !tc.passed),
  );

  if (finishedWithCases.length === 0) {
    if (items.some(item => isItemRunning(item))) {
      lines.push('对比范围内存在仍在执行的记录，暂无失败用例数据；待执行完成后可重新下载报告。');
    } else {
      lines.push('对比范围内的执行记录均无失败用例。');
    }
  } else {
    finishedWithCases.forEach((item, sectionIdx) => {
      const idx = items.findIndex(i => i.id === item.id);
      const serial = `#${items.length - idx}`;
      const failedCount = item.result.testResults!.filter(tc => !tc.passed).length;
      if (sectionIdx > 0) lines.push('');
      lines.push(
        `[${serial}] ${formatFullTime(new Date(item.timestamp))} ${TYPE_LABELS[item.type]} · ` +
        `${getLanguageLabel(item.language)} · ${STATUS_LABELS[getItemStatus(item)]} ` +
        `(${item.passedCount}/${item.totalCount} 通过，失败 ${failedCount} 个)` +
        (idx === 0 ? ' [最新]' : ''),
      );
      if (item.runtime !== undefined) {
        lines.push(`运行时间: ${item.runtime} ms${formatPercent(item.runtime, options.timeLimit)}`);
      }
      if (item.memory !== undefined) {
        lines.push(`内存占用: ${item.memory} MB${formatPercent(item.memory, options.memoryLimit)}`);
      }
      lines.push('');
      lines.push(renderFailedCases(item.result.testResults!));
    });
  }

  if (selected) {
    const status = getItemStatus(selected);
    const running = isItemRunning(selected);
    lines.push(
      '',
      SEPARATOR,
      `选中记录详情 · ${formatFullTime(new Date(selected.timestamp))} ${TYPE_LABELS[selected.type]}`,
      SEPARATOR,
      `编程语言: ${getLanguageLabel(selected.language)}`,
      `执行状态: ${STATUS_LABELS[status]}`,
    );

    if (running) {
      lines.push('该记录仍在执行中，结果尚未生成，执行完成后可重新下载报告。');
    } else {
      lines.push(
        `通过用例: ${selected.totalCount > 0 ? `${selected.passedCount} / ${selected.totalCount}` : '无（未返回测试用例结果）'}`,
        `运行时间: ${selected.runtime !== undefined ? `${selected.runtime} ms${formatPercent(selected.runtime, options.timeLimit)}` : '—'}`,
        `内存占用: ${selected.memory !== undefined ? `${selected.memory} MB${formatPercent(selected.memory, options.memoryLimit)}` : '—'}`,
      );

      if (selected.result.testResults && selected.result.testResults.length > 0) {
        lines.push('');
        lines.push(selected.result.testResults.map((tc, idx) => renderTestCase(tc, idx)).join('\n\n'));
      }
      if (selected.result.output) {
        lines.push('', '运行输出:', selected.result.output);
      }
      if (selected.result.error) {
        lines.push('', '错误信息:', selected.result.error);
      }
    }
  }

  return lines.join('\n');
};

export const buildReport = (options: ReportOptions): string => {
  const content = options.kind === 'current'
    ? buildCurrentReport(options)
    : buildHistoryReport(options);
  // BOM 保证 Windows 记事本等工具正确识别 UTF-8 中文
  return '﻿' + content;
};

export const buildReportFileName = (options: ReportOptions, date = new Date()): string => {
  const scope = options.kind === 'current' ? 'current' : 'history';
  return `execution-report-${scope}-${fileTime(date)}.txt`;
};

/**
 * 生成执行报告并触发浏览器下载。
 * 任何环节失败都会抛出异常，由调用方提示并支持重试。
 */
export const downloadReport = async (options: ReportOptions): Promise<void> => {
  const date = options.generatedAt ?? new Date();
  const content = buildReport(options);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildReportFileName(options, date);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
