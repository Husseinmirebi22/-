/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AuditStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_APPLICABLE';
export type ItemPriority = 'MUST_HAVE' | 'SHOULD_HAVE' | 'NICE_TO_HAVE';
export type FileType = 'md' | 'json' | 'jsonl' | 'txt';

export interface AuditItem {
  id: string; // e.g. "1.1.1"
  name: string; // e.g., "عنوان الملف"
  chapter: number; // 1 to 10
  priority: ItemPriority;
  description: string;
  successCriteria: string;
  example?: string;
  status: AuditStatus;
  category?: string;
  reasoning?: string;
  recommendation?: string;
  lineNumbers?: number[];
}

export interface ChecklistChapter {
  id: number;
  title: string;
  description: string;
  categories?: string[];
}

export interface AuditReport {
  fileName: string;
  fileSize: number;
  fileType: FileType;
  fileGroup?: string;
  fileGroupEn?: string;
  complianceScore: number;
  date: string;
  summary: {
    passed: number;
    failed: number;
    partial: number;
    notApplicable: number;
    totalApplied: number;
  };
  items: AuditItem[];
  topFixes: {
    itemId: string;
    chapterId: number;
    name: string;
    priority: ItemPriority;
    recommendation: string;
  }[];
  cleanedContent?: string;
  yamlBoilerplate?: string;
}

export interface FileToAudit {
  id: string;
  name: string;
  content: string;
  size: number;
  type: FileType | 'unknown';
  report?: AuditReport;
  loading?: boolean;
  error?: string;
}

export interface AuditHistoryEntry {
  id: string;
  fileName: string;
  date: string;
  complianceScore: number;
  passedCount: number;
  failedCount: number;
  partialCount: number;
  fullReport?: AuditReport;
}
