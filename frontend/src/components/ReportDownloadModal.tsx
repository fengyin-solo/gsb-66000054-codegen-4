import React, { useEffect, useMemo, useState } from 'react';
import { useInterviewStore, ExecutionHistoryItem } from '../store/interview';
import { useToastStore } from '../store/toast';
import {
  buildExecutionReport,
  buildReportFilename,
  downloadTextFile,
  ReportTestCase,
} from '../utils/reportGenerator';

interface CurrentResultData {
  title: string;
  type: 'run' | 'submit';
  success: boolean;
  output?: string;
  error?: string;
  runtime?: number;
  memory?: number;
  testResults?: ReportTestCase[];
}

interface ReportDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentResult: CurrentResultData;
  initialScope: 'current' | 'history';
  initialHistoryCount: number;
}

const HISTORY_COUNT_OPTIONS = [3, 5, 10];

const STATUS_META: Record<string, { color: string; icon: string; label: string }> = {
  running: { color: '#2196f3', icon: '⏳', label: '运行中' },
  pending: { color: '#ff9800', icon: '◷', label: '等待中' },
  success: { color: '#4caf50', icon: '✓', label: '通过' },
  failed: { color: '#f44336', icon: '✗', label: '失败' },
};

const getStatusKey = (item: ExecutionHistoryItem): string =>
  item.status || (item.passedCount === item.totalCount && item.totalCount > 0 ? 'success' : 'failed');

const formatTime = (dateString: string): string =>
  new Date(dateString).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const OptionButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: '4px 12px',
      borderRadius: '4px',
      border: active ? '1px solid #2196f3' : '1px solid #444',
      background: active ? 'rgba(33, 150, 243, 0.15)' : 'transparent',
      color: active ? '#64b5f6' : '#888',
      fontSize: '12px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'all 0.2s',
    }}
  >
    {children}
  </button>
);

const HistoryPreviewRow: React.FC<{
  item: ExecutionHistoryItem;
  isLatest: boolean;
  failedOnly: boolean;
}> = ({ item, isLatest, failedOnly }) => {
  const statusKey = getStatusKey(item);
  const meta = STATUS_META[statusKey] || STATUS_META.failed;
  const running = statusKey === 'running' || statusKey === 'pending';
  const testResults = item.result?.testResults || [];
  const failedIndices = testResults
    .map((test, index) => ({ test, index }))
    .filter(({ test }) => !test.passed)
    .map(({ index }) => index + 1);

  let caseSummary: { text: string; color: string };
  if (running) {
    caseSummary = { text: '执行中，报告中将标记为运行中', color: '#888' };
  } else if (testResults.length === 0) {
    caseSummary = { text: '无用例结果，报告将包含输出/错误信息', color: '#888' };
  } else if (failedOnly) {
    caseSummary = failedIndices.length > 0
      ? { text: `失败用例 ${failedIndices.length} 个（#${failedIndices.join('、#')}）`, color: '#f44336' }
      : { text: '无失败用例', color: '#4caf50' };
  } else {
    caseSummary = { text: `包含全部 ${testResults.length} 个用例（失败 ${failedIndices.length} 个）`, color: '#bbb' };
  }

  return (
    <div style={{
      padding: '8px 10px',
      borderRadius: '6px',
      border: `1px solid ${isLatest ? meta.color + '55' : '#333'}`,
      background: '#1a1a1a',
      marginBottom: '6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
        <span style={{ color: meta.color, fontWeight: 700 }}>{meta.icon}</span>
        <span style={{
          padding: '1px 6px',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 700,
          background: item.type === 'submit' ? 'rgba(33, 150, 243, 0.2)' : 'rgba(156, 39, 176, 0.2)',
          color: item.type === 'submit' ? '#64b5f6' : '#ba68c8',
        }}>
          {item.type === 'submit' ? '提交' : '运行'}
        </span>
        <span style={{ color: '#888', fontFamily: 'monospace', fontSize: '11px' }}>
          {formatTime(item.timestamp)}
        </span>
        <span style={{ color: '#666', fontSize: '11px', textTransform: 'uppercase' }}>{item.language}</span>
        {isLatest && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '10px',
            color: '#ff9800',
            fontWeight: 700,
          }}>
            最新
          </span>
        )}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginTop: '6px',
        fontSize: '11px',
        fontFamily: 'monospace',
        color: '#bbb',
        flexWrap: 'wrap',
      }}>
        <span style={{ color: meta.color, fontWeight: 600 }}>
          {running ? '---' : `${item.passedCount}/${item.totalCount || '-'} 通过`}
        </span>
        {item.runtime !== undefined && !running && (
          <span style={{ color: '#2196f3' }}>⏱ {item.runtime}ms</span>
        )}
        {item.memory !== undefined && !running && (
          <span style={{ color: '#9c27b0' }}>💾 {item.memory}MB</span>
        )}
        <span style={{ color: caseSummary.color, fontFamily: 'sans-serif' }}>{caseSummary.text}</span>
      </div>
    </div>
  );
};

export const ReportDownloadModal: React.FC<ReportDownloadModalProps> = ({
  isOpen,
  onClose,
  currentResult,
  initialScope,
  initialHistoryCount,
}) => {
  const { executionHistory, currentProblem, language } = useInterviewStore();
  const toast = useToastStore();
  const [scope, setScope] = useState<'current' | 'history'>(initialScope);
  const [historyCount, setHistoryCount] = useState<number>(initialHistoryCount);
  const [failedOnly, setFailedOnly] = useState<boolean>(true);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setScope(initialScope);
      setHistoryCount(initialHistoryCount);
      setFailedOnly(true);
      setDownloadError(null);
    }
  }, [isOpen, initialScope, initialHistoryCount]);

  const historyItems = useMemo(
    () => executionHistory.slice(0, historyCount),
    [executionHistory, historyCount],
  );

  const timeLimit = currentProblem?.timeLimit || 1000;
  const memoryLimit = currentProblem?.memoryLimit || 128;

  const currentCases = useMemo(() => currentResult.testResults || [], [currentResult]);
  const visibleCurrentCases = useMemo(
    () => currentCases
      .map((test, index) => ({ test, index }))
      .filter(({ test }) => !failedOnly || !test.passed),
    [currentCases, failedOnly],
  );

  const emptyReason = scope === 'history' && historyItems.length === 0
    ? '无法生成报告：暂无执行历史记录。请先运行或提交代码，待产生执行记录后再导出。'
    : null;

  const handleDownload = () => {
    setDownloadError(null);
    try {
      const content = buildExecutionReport({
        scope,
        failedOnly,
        problemTitle: currentProblem?.title,
        timeLimit,
        memoryLimit,
        current: scope === 'current' ? { ...currentResult, language } : undefined,
        historyItems: scope === 'history' ? historyItems : undefined,
      });
      downloadTextFile(buildReportFilename(), content);
      toast.success('执行报告已生成并开始下载');
      onClose();
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : '生成或下载文件时出错，请重试');
    }
  };

  if (!isOpen) return null;

  const currentPassed = currentCases.filter(t => t.passed).length;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#2d2d2d',
        borderRadius: '8px',
        padding: '20px 24px',
        width: '620px',
        maxWidth: '92vw',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #444',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>📄 导出执行报告</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#3a3a3a'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#888', width: '64px' }}>报告范围</span>
          <OptionButton active={scope === 'current'} onClick={() => setScope('current')}>
            当前结果
          </OptionButton>
          <OptionButton active={scope === 'history'} onClick={() => setScope('history')}>
            历史对比
          </OptionButton>
          {scope === 'history' && (
            <>
              <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>最近</span>
              <select
                value={historyCount}
                onChange={(e) => setHistoryCount(Number(e.target.value))}
                style={{
                  padding: '3px 8px',
                  background: '#1e1e1e',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {HISTORY_COUNT_OPTIONS.map(n => (
                  <option key={n} value={n}>{n} 次</option>
                ))}
              </select>
              <span style={{ fontSize: '12px', color: '#888' }}>执行记录</span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <span style={{ fontSize: '12px', color: '#888', width: '64px' }}>用例明细</span>
          <OptionButton active={failedOnly} onClick={() => setFailedOnly(true)}>
            仅失败用例
          </OptionButton>
          <OptionButton active={!failedOnly} onClick={() => setFailedOnly(false)}>
            全部用例
          </OptionButton>
        </div>

        <div style={{
          flex: 1,
          minHeight: '120px',
          overflowY: 'auto',
          background: '#222',
          border: '1px solid #3a3a3a',
          borderRadius: '6px',
          padding: '10px 12px',
          marginBottom: '12px',
        }}>
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', fontWeight: 500 }}>
            报告内容预览（与文件内容一致）
          </div>

          {emptyReason ? (
            <div style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: '#ff9800',
              fontSize: '13px',
              lineHeight: 1.7,
            }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📭</div>
              {emptyReason}
            </div>
          ) : scope === 'current' ? (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                fontSize: '12px',
                color: '#bbb',
                marginBottom: '10px',
                fontFamily: 'monospace',
              }}>
                <span style={{ color: '#fff', fontWeight: 600 }}>
                  {currentResult.title}（{currentResult.type === 'submit' ? '提交' : '运行'}）
                </span>
                <span style={{ textTransform: 'uppercase' }}>{language}</span>
                {currentCases.length > 0 && (
                  <span style={{ color: currentResult.success ? '#4caf50' : '#f44336', fontWeight: 600 }}>
                    {currentPassed}/{currentCases.length} 通过
                  </span>
                )}
                {currentResult.runtime !== undefined && (
                  <span style={{ color: '#2196f3' }}>⏱ {currentResult.runtime}ms</span>
                )}
                {currentResult.memory !== undefined && (
                  <span style={{ color: '#9c27b0' }}>💾 {currentResult.memory}MB</span>
                )}
              </div>
              {currentCases.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#888' }}>
                  本次执行无测试用例结果，报告将包含运行输出/错误信息。
                </div>
              ) : visibleCurrentCases.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#4caf50' }}>
                  全部通过，无失败用例，报告中用例明细为空。
                </div>
              ) : (
                visibleCurrentCases.map(({ test, index }) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      background: '#1a1a1a',
                      border: `1px solid ${test.passed ? 'rgba(76, 175, 80, 0.25)' : 'rgba(244, 67, 54, 0.25)'}`,
                      marginBottom: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ color: test.passed ? '#4caf50' : '#f44336', fontWeight: 700 }}>
                      {test.passed ? '✓' : '✗'}
                    </span>
                    <span style={{ color: '#ddd' }}>用例 {index + 1}</span>
                    <span style={{ color: test.passed ? '#4caf50' : '#f44336', fontSize: '11px' }}>
                      {test.passed ? '通过' : '失败'}
                    </span>
                    <span style={{
                      color: '#666',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}>
                      {test.input}
                    </span>
                  </div>
                ))
              )}
            </>
          ) : (
            <>
              {historyItems.map((item, idx) => (
                <HistoryPreviewRow
                  key={item.id}
                  item={item}
                  isLatest={idx === 0}
                  failedOnly={failedOnly}
                />
              ))}
            </>
          )}
        </div>

        {downloadError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '8px 12px',
            marginBottom: '12px',
            background: 'rgba(244, 67, 54, 0.1)',
            border: '1px solid rgba(244, 67, 54, 0.3)',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#e57373',
          }}>
            <span>下载失败：{downloadError}</span>
            <button
              onClick={handleDownload}
              style={{
                padding: '4px 14px',
                borderRadius: '4px',
                border: '1px solid rgba(244, 67, 54, 0.5)',
                background: 'rgba(244, 67, 54, 0.15)',
                color: '#ef9a9a',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              重试
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            flex: 1,
            fontSize: '11px',
            color: '#666',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {emptyReason ? '未生成文件' : `文件：${buildReportFilename()}`}
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #555',
              background: 'transparent',
              color: '#ccc',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            取消
          </button>
          <button
            onClick={handleDownload}
            disabled={!!emptyReason}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              border: 'none',
              background: emptyReason ? '#555' : '#4caf50',
              color: emptyReason ? '#888' : '#fff',
              cursor: emptyReason ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              opacity: emptyReason ? 0.7 : 1,
            }}
          >
            ⬇ 生成并下载
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportDownloadModal;
