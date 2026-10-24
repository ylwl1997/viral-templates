/** Demo-only account data for P0 shells. */

export type CreationStatus = 'queued' | 'running' | 'ready' | 'failed';

export interface MockCreation {
  id: string;
  template_slug: string;
  template_name: string;
  template_name_zh: string;
  status: CreationStatus;
  created_at: string;
  note_en: string;
  note_zh: string;
}

export interface MockLedgerRow {
  id: string;
  at: string;
  delta: number;
  label_en: string;
  label_zh: string;
}

export const MOCK_CREDIT_BALANCE = 12;

export const MOCK_CREATIONS: MockCreation[] = [
  {
    id: 'job_demo_001',
    template_slug: 'bby-wow',
    template_name: 'Bby Wow',
    template_name_zh: 'Bby Wow',
    status: 'ready',
    created_at: '2026-10-24T08:12:00+08:00',
    note_en: 'Demo row — no video file attached yet.',
    note_zh: '演示条目 — 尚未附带视频文件。',
  },
  {
    id: 'job_demo_002',
    template_slug: 'kiss-cam',
    template_name: 'Kiss Cam',
    template_name_zh: 'Kiss Cam',
    status: 'running',
    created_at: '2026-10-24T14:40:00+08:00',
    note_en: 'Demo running state. Nothing is actually generating.',
    note_zh: '演示「生成中」状态。实际未在生成。',
  },
  {
    id: 'job_demo_003',
    template_slug: 'ceiling-fan',
    template_name: 'Ceiling Fan',
    template_name_zh: '吊扇',
    status: 'queued',
    created_at: '2026-10-24T15:05:00+08:00',
    note_en: 'Demo queued state.',
    note_zh: '演示「排队中」状态。',
  },
  {
    id: 'job_demo_004',
    template_slug: 'bby-wow',
    template_name: 'Bby Wow',
    template_name_zh: 'Bby Wow',
    status: 'failed',
    created_at: '2026-10-23T19:22:00+08:00',
    note_en: 'Demo failed state — sample error for UI.',
    note_zh: '演示「失败」状态 — 界面示例错误。',
  },
];

export const MOCK_LEDGER: MockLedgerRow[] = [
  {
    id: 'tx_demo_1',
    at: '2026-10-22T10:00:00+08:00',
    delta: 15,
    label_en: 'Starter pack (demo credit)',
    label_zh: '入门包（演示积分）',
  },
  {
    id: 'tx_demo_2',
    at: '2026-10-23T19:20:00+08:00',
    delta: -1,
    label_en: 'Generate attempt — Bby Wow (demo)',
    label_zh: '生成尝试 — Bby Wow（演示）',
  },
  {
    id: 'tx_demo_3',
    at: '2026-10-24T08:10:00+08:00',
    delta: -1,
    label_en: 'Generate attempt — Bby Wow (demo)',
    label_zh: '生成尝试 — Bby Wow（演示）',
  },
  {
    id: 'tx_demo_4',
    at: '2026-10-24T12:00:00+08:00',
    delta: -1,
    label_en: 'Generate attempt — Kiss Cam (demo)',
    label_zh: '生成尝试 — Kiss Cam（演示）',
  },
];

export function statusLabel(status: CreationStatus, lang: 'en' | 'zh'): string {
  const map = {
    queued: { en: 'Queued', zh: '排队中' },
    running: { en: 'Running', zh: '生成中' },
    ready: { en: 'Ready', zh: '已完成' },
    failed: { en: 'Failed', zh: '失败' },
  } as const;
  return map[status][lang];
}
