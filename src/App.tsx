/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Upload, AlertCircle, CheckCircle2, XCircle, HelpCircle, 
  ChevronDown, ChevronUp, Copy, Download, RefreshCw, Layers, Shield, 
  Database, Activity, Users, FileCode, Check, Eye, Trash2, ArrowLeftRight,
  Sparkles, Sliders, History, BookOpen, Clock, FileDown, Settings, Search, X, Mail, CheckSquare, StickyNote, ListChecks, Link, Sun, Moon,
  AlertTriangle, ShieldCheck, Fingerprint, TerminalSquare
} from 'lucide-react';
import JSZip from 'jszip';
import { CHECKLIST_CHAPTERS, DEFAULT_CHECKLIST_ITEMS } from './checklistData';
import { AuditItem, ChecklistChapter, AuditReport, FileToAudit, AuditHistoryEntry } from './types';
import { initAuth, googleSignIn, logout, getAccessToken } from './lib/firebase';
import WorkspaceImport from './components/WorkspaceImport';
import CompareView from './components/CompareView';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import extDatabase from './file_extensions_reference_db_v2.1.json';
import enrichedDatabase from './extensions_enriched_v2.1.json';

export default function App() {
  // Main State
  const [activeTab, setActiveTab] = useState<'overview' | 'chapters' | 'editor' | 'graph' | 'history' | 'steps' | 'community'>('overview');
  const [mode, setMode] = useState<'teacher' | 'expert'>('teacher');
  const [files, setFiles] = useState<FileToAudit[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditHistoryEntry[]>([]);
  
  // Community Proposal Generator & Validator State
  const [proposalExt, setProposalExt] = useState('yaml');
  const [proposalGroup, setProposalGroup] = useState<number>(8);
  const [proposalDesc, setProposalDesc] = useState('صيغة تبادل وتخزين بيانات مهيكلة غنية تدعم مفاتيح التكوين والروابط المنطقية لسهولة القراءة دلالياً.');
  const [proposalSource, setProposalSource] = useState('https://yaml.org/spec/1.2.2/');
  const [proposalMime, setProposalMime] = useState('application/x-yaml');
  const [proposalType, setProposalType] = useState('نصية ودلالية مهيكلة للـ RAG');
  const [simLog, setSimLog] = useState<string[]>([]);
  const [simStatus, setSimStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  
  // Custom Weights and Ignores for Expert Mode
  const [excludedItemIds, setExcludedItemIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('sfa_excluded_items');
      if (saved) return new Set<string>(JSON.parse(saved));
    } catch(e) {}
    return new Set();
  });
  const [customWeights, setCustomWeights] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('sfa_custom_weights');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return {};
  });

  useEffect(() => {
    localStorage.setItem('sfa_excluded_items', JSON.stringify(Array.from(excludedItemIds)));
  }, [excludedItemIds]);

  useEffect(() => {
    localStorage.setItem('sfa_custom_weights', JSON.stringify(customWeights));
  }, [customWeights]);
  
  const [patternSearchText, setPatternSearchText] = useState('');
  const [patternSearchCategory, setPatternSearchCategory] = useState<'PII' | 'PASSWORD' | 'CUSTOM'>('CUSTOM');
  
  // UI helpers
  const [expandedChapter, setExpandedChapter] = useState<number | null>(1);
  const [editorViewMode, setEditorViewMode] = useState<'original' | 'fixed' | 'diff'>('diff');
  const [editorTheme, setEditorTheme] = useState<'dark' | 'light'>('dark');
  const [pastedFileName, setPastedFileName] = useState('MR-POL-101_سياسة-العينة_v1.0.md');
  const [pastedFileType, setPastedFileType] = useState<'md' | 'json' | 'jsonl' | 'txt'>('md');
  const [pastedContent, setPastedContent] = useState('');
  const [isPasting, setIsPasting] = useState(false);
  const [isUrlImportOpen, setIsUrlImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [urlImportLoading, setUrlImportLoading] = useState(false);
  
  // Toast notifications state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warn' | 'error' } | null>(null);

  // Sidebar Search
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  
  // Workspace Auth State
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<any | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Compare state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [pendingExportAction, setPendingExportAction] = useState<{action: () => void, name: string} | null>(null);
  const [activeReviewStage, setActiveReviewStage] = useState<number>(1);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleEmail, setScheduleEmail] = useState('');
  const [scheduleCron, setScheduleCron] = useState('0 9 * * *');
  const [isScheduling, setIsScheduling] = useState(false);

  const toggleCompareSelect = (id: string) => {
    setSelectedCompareIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      }
      if (prev.length < 2) {
        return [...prev, id];
      }
      return prev;
    });
  };

  // Load history from localStorage on initialization
  useEffect(() => {
    initAuth(
      (user, token) => {
        setAuthUser(user);
        setAuthToken(token);
        setNeedsAuth(false);
      },
      () => {
        setAuthUser(null);
        setAuthToken(null);
        setNeedsAuth(true);
      }
    );

    const saved = localStorage.getItem('smart_file_auditor_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setAuthToken(result.accessToken);
        setAuthUser(result.user);
        setNeedsAuth(false);
        showToast('تم تسجيل الدخول بنجاح مع Google Workspace', 'success');
        
        // Ensure user is synced with backend Cloud SQL db (Call an API if we exposed one, but for now we rely on the app starting up properly)
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      if (err?.code !== 'auth/popup-closed-by-user') {
        showToast('فشل تسجيل الدخول.', 'error');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setAuthUser(null);
    setAuthToken(null);
    setNeedsAuth(true);
  };

  // Save history to storage helper
  const saveHistory = (newHistory: AuditHistoryEntry[]) => {
    setHistory(newHistory);
    localStorage.setItem('smart_file_auditor_history', JSON.stringify(newHistory));
  };

  const showToast = (message: string, type: 'success' | 'warn' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const submitScheduleReport = async () => {
    if (!scheduleEmail || !authToken) {
      showToast('الرجاء التأكد من البريد الإلكتروني وتسجيل الدخول', 'error');
      return;
    }
    setIsScheduling(true);
    try {
      const reportMarkdown = history.map(h => 
        `تقرير ${h.fileName} (${h.date})\\nدرجة الامتثال: ${h.complianceScore}%\\nنجاح: ${h.passedCount} | فشل: ${h.failedCount}\\n---`
      ).join('\\n\\n') || 'لا توجد بيانات امتثال حالية.';
      
      const payload = {
        accessToken: authToken,
        emailTo: scheduleEmail,
        subject: 'تقرير الامتثال الدوري - Smart File Auditor',
        reportContent: `<h3>مرحباً! هذا تقرير الامتثال الدوري لملفات فريقك:</h3><pre>${reportMarkdown}</pre>`,
        scheduleString: scheduleCron,
        jobId: 'team-compliance-report'
      };

      const res = await fetch('/api/compliance/schedule-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "فشل جدولة التقرير");
      }
      showToast('تمت جدولة إرسال التقرير الدوري بنجاح!');
      setIsScheduleModalOpen(false);
    } catch (err: any) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      setIsScheduling(false);
    }
  };

  // Helper to trigger active file
  const activeFile = files.find(f => f.id === selectedFileId);

  // Sidebar search filtering with autocomplete based on type, status, or group from enriched Database
  const filteredFiles = files.filter(file => {
    const q = sidebarSearch.toLowerCase().trim();
    if (!q) return true;

    // Check if it's a specific "status:" or "حالة:" search
    if (q.startsWith('حالة:') || q.startsWith('status:')) {
      const statusTerm = q.replace(/^(حالة:|status:)/, '').trim().toUpperCase();
      if (!file.report) return false;
      const score = file.report.complianceScore;
      if (statusTerm === 'PASS' || statusTerm === 'ناجح') {
        return score >= 80;
      } else if (statusTerm === 'FAIL' || statusTerm === 'راسب') {
        return score < 50;
      } else if (statusTerm === 'PARTIAL' || statusTerm === 'جزئي') {
        return score >= 50 && score < 80;
      }
    }

    // Check if it's a specific "type:" or "نوع:"
    if (q.startsWith('نوع:') || q.startsWith('type:')) {
      const typeTerm = q.replace(/^(نوع:|type:)/, '').trim();
      const ext = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
      const enriched = enrichedDatabase?.extensions?.find((e: any) => e.extension === ext);
      if (!enriched) return file.type?.toLowerCase().includes(typeTerm) || ext.includes(typeTerm);
      return (
        enriched.type?.toLowerCase().includes(typeTerm) ||
        enriched.group_name?.toLowerCase().includes(typeTerm) ||
        enriched.mime_type?.toLowerCase().includes(typeTerm) ||
        file.type?.toLowerCase().includes(typeTerm)
      );
    }

    // Check if it's a specific "امتداد:" or "ext:" or "extension:"
    if (q.startsWith('امتداد:') || q.startsWith('ext:') || q.startsWith('extension:')) {
      const extTerm = q.replace(/^(امتداد:|ext:|extension:)/, '').trim();
      const ext = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
      return ext === extTerm;
    }

    // Fallback: general search (name, or found extension group)
    const ext = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
    const enriched = enrichedDatabase?.extensions?.find((e: any) => e.extension === ext);
    const inEnriched = enriched ? (
      enriched.type?.toLowerCase().includes(q) ||
      enriched.group_name?.toLowerCase().includes(q)
    ) : false;

    // Report status fallback
    let isStatusMatch = false;
    if (file.report) {
      const score = file.report.complianceScore;
      if (q === 'ناجح' || q === 'pass') isStatusMatch = score >= 80;
      else if (q === 'راسب' || q === 'fail') isStatusMatch = score < 50;
      else if (q === 'جزئي' || q === 'partial') isStatusMatch = score >= 50 && score < 80;
    }

    return (
      file.name.toLowerCase().includes(q) ||
      file.type?.toLowerCase().includes(q) ||
      inEnriched ||
      isStatusMatch
    );
  });

  const getAutocompleteSuggestions = () => {
    // Generate dynamic suggestions based on active files
    const activeExtensions = Array.from(new Set(files.map(f => f.name.substring(f.name.lastIndexOf('.') + 1).toLowerCase())));
    const suggestions: { label: string; value: string; category: string }[] = [];

    // Add status suggestion
    suggestions.push({ label: 'مستندات مجتازة الفحص (ناجح)', value: 'حالة: ناجح', category: 'الحالة (Status)' });
    suggestions.push({ label: 'مستندات تحتوي أخطاء جسيمة (راسب)', value: 'حالة: راسب', category: 'الحالة (Status)' });
    suggestions.push({ label: 'مستندات بمراتب وسيطة (جزئي)', value: 'حالة: جزئي', category: 'الحالة (Status)' });

    // Add extension & type suggestions from enriched DB for our active files
    activeExtensions.forEach((ext: any) => {
      suggestions.push({ label: `كل ملفات الامتداد .${(ext || '').toUpperCase()}`, value: `امتداد: ${ext}`, category: 'الامتداد (Extension)' });
      
      const enriched = enrichedDatabase?.extensions?.find((e: any) => e.extension === ext);
      if (enriched) {
        suggestions.push({ label: `مستندات من تصنيف: ${enriched.type}`, value: `نوع: ${enriched.type}`, category: 'التصنيف (Type)' });
        suggestions.push({ label: `مجموعة البيانات: ${enriched.group_name}`, value: `نوع: ${enriched.group_name}`, category: 'المجموعة (Group)' });
      }
    });

    // Also add general medical/scientific classifications as static helper suggestions
    suggestions.push({ label: 'الملفات والمسوحات الطبية (MRI/CT/EEG/DICOM)', value: 'نوع: طبي', category: 'البيانات الطبية (Medical)' });
    suggestions.push({ label: 'البيانات الهندسية والفلكية والمناخية', value: 'نوع: علمي', category: 'البيانات العلمية (Scientific)' });

    // Filter based on currently typed text
    const typed = sidebarSearch.toLowerCase().trim();
    if (!typed) return suggestions.slice(0, 5); // top 5 general defaults
    
    return suggestions.filter(s => 
      s.label.toLowerCase().includes(typed) || 
      s.value.toLowerCase().includes(typed) || 
      s.category.toLowerCase().includes(typed)
    ).slice(0, 6);
  };

  const handleUrlImport = async () => {
    if (!importUrl) return;
    try {
      setUrlImportLoading(true);
      const res = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "فشل جلب الملف من الرابط");
      }
      
      const { fileName, content } = await res.json();
      
      const newFile: FileToAudit = {
        id: Math.random().toString(36).substring(7),
        name: fileName,
        content,
        size: content.length,
        type: fileName.endsWith('.json') ? 'json' : fileName.endsWith('.jsonl') ? 'jsonl' : fileName.endsWith('.txt') ? 'txt' : 'md'
      };

      setFiles(prev => [...prev, newFile]);
      setSelectedFileId(newFile.id);
      showToast('تم استيراد الملف من الرابط بنجاح!');
      triggerAuditForFile(newFile.id, newFile.content, newFile.name, newFile.size);
      
      setImportUrl('');
      setIsUrlImportOpen(false);
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ أثناء جلب الملف من الرابط.', 'error');
      console.error(err);
    } finally {
      setUrlImportLoading(false);
    }
  };

  // Handle single or multiple file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    await processUploadedFileList(Array.from(uploadedFiles));
  };

  const processUploadedFileList = async (fileList: File[]) => {
    const newFiles: FileToAudit[] = [];

    for (const file of fileList) {
      const isZip = file.name.endsWith('.zip');
      
      if (isZip) {
        try {
          showToast('جاري استخراج وفك ملف الـ ZIP...', 'warn');
          const zip = await JSZip.loadAsync(file);
          const zipEntries = Object.keys(zip.files).filter(name => !zip.files[name].dir);
          
          for (const entryName of zipEntries) {
            const entry = zip.files[entryName];
            const nameLower = entry.name.toLowerCase();
            const isSupported = nameLower.endsWith('.md') || nameLower.endsWith('.json') || nameLower.endsWith('.jsonl') || nameLower.endsWith('.txt');
            
            if (isSupported) {
              const text = await entry.async('text');
              const ext = entryName.substring(entryName.lastIndexOf('.') + 1).toLowerCase() as any;
              newFiles.push({
                id: Math.random().toString(36).substring(7),
                name: entry.name.split('/').pop() || entry.name,
                content: text,
                size: text.length,
                type: ext
              });
            }
          }
          showToast(`تم استخراج ${newFiles.length} ملفات بنقرة واحدة!`);
        } catch (err) {
          showToast('فشل فك ضغط ملف الـ ZIP.', 'error');
          console.error(err);
        }
      } else {
        const text = await file.text();
        const ext = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase() as any;
        newFiles.push({
          id: Math.random().toString(36).substring(7),
          name: file.name,
          content: text,
          size: file.size,
          type: ['md', 'json', 'jsonl', 'txt'].includes(ext) ? ext : 'unknown'
        });
      }
    }

    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
      setSelectedFileId(newFiles[0].id);
      // Run automatic local audit immediately for user experience
      triggerAuditForFile(newFiles[0].id, newFiles[0].content, newFiles[0].name, newFiles[0].size);
    }
  };

  // Run audit through Express backend (syntactic + Gemini semantic AI combined)
  const triggerAuditForFile = async (id: string, content: string, name: string, size: number) => {
    // Set loading
    setFiles(prev => prev.map(f => f.id === id ? { ...f, loading: true, error: undefined } : f));
    
    // Prepare checklist database
    const defaultWeight = (priority: string) => {
      if (priority === 'MUST_HAVE') return 10.0;
      if (priority === 'SHOULD_HAVE') return 5.0;
      if (priority === 'NICE_TO_HAVE') return 2.0;
      return 1.0;
    };

    const localChecklist = DEFAULT_CHECKLIST_ITEMS.map(item => ({
      ...item,
      // Apply custom weight if set, otherwise use priority-based weight
      weight: customWeights[item.id] !== undefined ? customWeights[item.id] : defaultWeight(item.priority),
      // Ignore if set in expert state
      status: excludedItemIds.has(item.id) ? 'NOT_APPLICABLE' as const : 'NOT_APPLICABLE' as const
    }));

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: name,
          content,
          size,
          checklistItems: localChecklist
        })
      });

      if (!response.ok) {
        throw new Error('فشل الاتصال بمركب الفحص الخلفي.');
      }

      const report: AuditReport = await response.json();

      // Update file state with report
      setFiles(prev => prev.map(f => f.id === id ? { ...f, report, loading: false } : f));
      
      // Save to global audit version progress tree if not exists
      const newHistoryEntry: AuditHistoryEntry = {
        id: Math.random().toString(36).substring(7),
        fileName: name,
        date: new Date().toLocaleDateString('ar-EG'),
        complianceScore: report.complianceScore,
        passedCount: report.summary.passed,
        failedCount: report.summary.failed,
        partialCount: report.summary.partial,
        fullReport: report,
      };
      
      saveHistory([newHistoryEntry, ...history]);
      showToast('اكتمل تدقيق الملف بنجاح!');

    } catch (err: any) {
      console.error(err);
      setFiles(prev => prev.map(f => f.id === id ? { ...f, loading: false, error: 'فشل الفحص الدلالي الذكي. يرجى مراجعة خيارات مفتاح API.' } : f));
      if (err?.message !== 'Failed to fetch') {
         showToast('حدث خطأ في معالجة التدقيق السحابي.', 'error');
      }
    }
  };

  // Paste handler
  const handlePasteSubmit = () => {
    if (!pastedContent.trim()) {
      showToast('المحتوى فارغ! انسخ بعض البيانات أولاً.', 'error');
      return;
    }

    const newFile: FileToAudit = {
      id: Math.random().toString(36).substring(7),
      name: pastedFileName,
      content: pastedContent,
      size: pastedContent.length,
      type: pastedFileType
    };

    setFiles(prev => [...prev, newFile]);
    setSelectedFileId(newFile.id);
    setIsPasting(false);
    showToast('تم استقبال النص المنسوخ؛ جاري إطلاق المدقق..');
    triggerAuditForFile(newFile.id, newFile.content, newFile.name, newFile.size);
  };

  // Erase all files list
  const clearFileList = () => {
    setFiles([]);
    setSelectedFileId(null);
    showToast('تم تفريغ قائمة ملفات الفحص الحالية.');
  };

  // Erase specific file
  const removeFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFiles(prev => prev.filter(f => f.id !== id));
    if (selectedFileId === id) {
      const remaining = files.filter(f => f.id !== id);
      setSelectedFileId(remaining.length > 0 ? remaining[0].id : null);
    }
    showToast('تم حذف المستند.');
  };

  // Expert mode rules modifier helpers
  const toggleExcludeItem = (itemId: string) => {
    const updated = new Set<string>(excludedItemIds);
    if (updated.has(itemId)) {
      updated.delete(itemId);
      showToast('تمت إعادة إدخال البند لتقييم الالتزام.');
    } else {
      updated.add(itemId);
      showToast('تم حجب وتجاوز البند من حساب الدرجة.');
    }
    setExcludedItemIds(updated);
    
    // Recalculate score immediately based on current report items
    if (activeFile && activeFile.report) {
      const items = activeFile.report.items.map(item => {
        if (item.id === itemId) {
          return { ...item, status: updated.has(itemId) ? ('NOT_APPLICABLE' as const) : item.status };
        }
        return item;
      });
      recalculateCustomScore(items, updated);
    }
  };

  const handleExpertPatternSearch = () => {
    if (!activeFile || !activeFile.report || !patternSearchText) return;

    try {
      const regex = new RegExp(patternSearchText, 'i');
      const hasPattern = regex.test(activeFile.content);

      const newItemId = `S-CUSTOM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      let label = patternSearchCategory === 'PII' ? 'بيانات شخصية (بحث دوري)' : 
                  patternSearchCategory === 'PASSWORD' ? 'كلمات مرور مشفرة (بحث دوري)' : 
                  'حساسية أمنية مخصصة';

      const newAuditItem: AuditItem = {
        id: newItemId,
        name: `بحث الخبير: ${label}`,
        chapter: 7,
        priority: 'MUST_HAVE',
        description: `تم إضافته يدوياً بواسطة الخبير: البحث عن النمط (${patternSearchText})`,
        successCriteria: `يجب ألا يحتوي الملف على الأنماط المطابقة لـ /${patternSearchText}/`,
        status: hasPattern ? 'FAIL' : 'PASS',
        category: 'Security',
        reasoning: hasPattern ? `تم تطابق النمط المطلوب في المستند.` : `لم يتم العثور على النمط في المستند.`,
        recommendation: hasPattern ? 'مراجعة وتطهير المستند من هذه المقتطفات السرية أو الحساسة، وإزالتها تماماً.' : undefined
      };

      const updatedItems = [...activeFile.report.items, newAuditItem];
      recalculateCustomScore(updatedItems, excludedItemIds);
      showToast(hasPattern ? 'تحذير: تم العثور على النمط المحدد في الملف!' : 'آمن: لم يتم العثور على النمط.');
      setPatternSearchText('');
    } catch (e) {
      showToast('رسالة خطأ: النمط/التعبير النمطي (Regex) غير صالح.');
    }
  };

  const updateItemWeightByAmount = (itemId: string, increment: boolean) => {
    let current = 1.0;
    if (customWeights[itemId] !== undefined) {
      current = customWeights[itemId];
    } else {
      const item = DEFAULT_CHECKLIST_ITEMS.find(i => i.id === itemId);
      if (item) {
        if (item.priority === 'MUST_HAVE') current = 10.0;
        else if (item.priority === 'SHOULD_HAVE') current = 5.0;
        else if (item.priority === 'NICE_TO_HAVE') current = 2.0;
      }
    }

    let next = increment ? current + 0.5 : current - 0.5;
    if (next < 0) next = 0;
    
    const updatedWeights = { ...customWeights, [itemId]: next };
    setCustomWeights(updatedWeights);
    showToast(`تم تعديل وزن البند إلى ${next}x`);

    if (activeFile && activeFile.report) {
      recalculateCustomScore(activeFile.report.items, excludedItemIds, updatedWeights);
    }
  };

  // Recalculates compliance with weights and ignores dynamically for instant feedback
  const recalculateCustomScore = (
    currentItems: AuditItem[], 
    ignores: Set<string>, 
    weights: Record<string, number> = customWeights
  ) => {
    if (!activeFile || !activeFile.report) return;

    const modifiedItems = currentItems.map(item => {
      const status = ignores.has(item.id) ? 'NOT_APPLICABLE' as const : item.status;
      return { ...item, status };
    });

    const applicable = modifiedItems.filter(i => i.status !== 'NOT_APPLICABLE');
    
    let totalScoreVal = 0;
    let totalWeight = 0;

    const defaultWeight = (item: AuditItem) => {
      if (item.priority === 'MUST_HAVE') return 10.0;
      if (item.priority === 'SHOULD_HAVE') return 5.0;
      if (item.priority === 'NICE_TO_HAVE') return 2.0;
      return 1.0;
    };

    applicable.forEach(item => {
      const w = weights[item.id] !== undefined ? weights[item.id] : defaultWeight(item);
      let points = 0;
      if (item.status === 'PASS') points = 1.0;
      else if (item.status === 'PARTIAL') points = 0.5;
      
      totalScoreVal += points * w;
      totalWeight += w;
    });

    const customScore = totalWeight > 0 ? Math.round((totalScoreVal / totalWeight) * 100) : 0;

    setFiles(prev => prev.map(f => f.id === selectedFileId ? {
      ...f,
      report: {
        ...f.report!,
        complianceScore: customScore,
        summary: {
          ...f.report!.summary,
          passed: modifiedItems.filter(i => i.status === 'PASS').length,
          failed: modifiedItems.filter(i => i.status === 'FAIL').length,
          partial: modifiedItems.filter(i => i.status === 'PARTIAL').length,
          notApplicable: modifiedItems.filter(i => i.status === 'NOT_APPLICABLE').length,
        },
        items: modifiedItems
      }
    } : f));
  };

  // Auto clean execution directly using backend output and frontend formatting
  const applyCleanFixToFile = () => {
    if (!activeFile || !activeFile.report || !activeFile.report.cleanedContent) return;
    
    const originalName = activeFile.name;
    let cleanContent = activeFile.report.cleanedContent;

    // Advanced YAML Front Matter formatting & injection (G-28)
    const hasFrontMatter = cleanContent.startsWith('---');
    if (!hasFrontMatter) {
      const today = new Date().toISOString().split('T')[0];
      const yamlBlueprint = `---
title: "${originalName.replace(/\.[^/.]+$/, "")}"
doc_id: "DOC-${Math.random().toString(36).substring(2, 8).toUpperCase()}"
version: "1.0"
last_updated: "${today}"
owner: "إدارة هندسة المعرفة"
tags: []
audience: []
type: "مرجع"
summary: "تمت المعالجة تلقائياً بواسطة المدقق الذكي."
output_format: "نص سردي"
security_level: "عام"
---

`;
      cleanContent = yamlBlueprint + cleanContent;
    } else {
      // Ensure specific fields exist if there is a front matter block
      const frontMatterEnd = cleanContent.indexOf('---', 3);
      if (frontMatterEnd !== -1) {
        let fmBlock = cleanContent.substring(3, frontMatterEnd);
        if (!fmBlock.includes('security_level:')) fmBlock += '\nsecurity_level: "عام"';
        if (!fmBlock.includes('doc_id:')) fmBlock += `\ndoc_id: "DOC-${Math.random().toString(36).substring(2, 8).toUpperCase()}"`;
        cleanContent = '---\n' + fmBlock.trim() + '\n---\n' + cleanContent.substring(frontMatterEnd + 3).trimStart();
      }
    }

    // Update active file content
    setFiles(prev => prev.map(f => f.id === selectedFileId ? {
      ...f,
      content: cleanContent,
      size: cleanContent.length
    } : f));

    showToast('تم تطبيق التنظيف وتنسيق YAML الأمثل وحل الأخطاء الصياغية! جاري إعادة الفحص...');
    
    // Trigger audit again on the updated clean content
    triggerAuditForFile(activeFile.id, cleanContent, originalName, cleanContent.length);
  };

  // Helper to copy text to clipboard safely
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`تم نسخ ${label} إلى الحافظة!`);
  };

  const handleSimulatePipeline = () => {
    if (!proposalExt.trim()) {
      showToast('الرجاء إدخال امتداد الملف أولاً لإتمام المحاكاة.', 'error');
      return;
    }
    setSimStatus('running');
    setSimLog([]);
    
    const extRaw = proposalExt.trim().toLowerCase().replace(/^\./, '');
    
    const logs = [
      `[Runner] البدء في تشغيل سكريبت التحقق التلقائي لدمج المساهمة...`,
      `[Runner] استقبال طلب سحب Pull Request رقم #204 دمج فرع feature/${extRaw} إلى dev...`,
      `[CI/CD] جاري فحص وجود الامتداد في قاعدة البيانات المرجعية لمنع التكرار...`
    ];
    
    setTimeout(() => {
      // Check duplicate
      let duplicateGroup: string | null = null;
      if (extDatabase && extDatabase.groups) {
        const found = extDatabase.groups.find((g: any) => g.extensions.includes(extRaw));
        if (found) {
          duplicateGroup = found.name;
        }
      }
      
      if (duplicateGroup) {
        setSimLog([
          ...logs,
          `[🚨 خطأ تكرار] الامتداد .${extRaw} موجود مسبقاً في مجموعة: "${duplicateGroup}".`,
          `[CI/CD] تم إلغاء الدمج ورفض الطلب تلقائياً لدرء تكرار البيانات المعرفية في المنظومة.`,
          `❌ فشلت السلسلة الأمنية التلقائية للبناء (CI/CD Pipeline Failed).`
        ]);
        setSimStatus('failed');
        showToast('فشلت محاكاة الدمج لوجود امتداد مكرر!', 'error');
      } else {
        const nextLogs = [
          ...logs,
          `[✓ فريد] تم تأكيد فرادة وحصر الامتداد .${extRaw} (غير موجود مسبقاً).`,
          `[CI/CD] جاري التحقق من سلامة وصحة مستند المقترح proposal.md وكمال حقول البيانات الوصفية...`,
          `[MIME Check] تم تحديد MIME Type للامتداد بـ: "${proposalMime || 'غير محدد'}" (MIME سليم).`,
          `[Metadata Check] نوع البيانات المستهدفة: [${proposalType}].`,
          `[Source Check] رابط مصدر التوثيق: "${proposalSource || ''}"...`
        ];
        
        setTimeout(() => {
          if (!proposalSource || proposalSource.length < 5) {
            setSimLog([
              ...nextLogs,
              `[🚨 خطأ مصادر] لم يتم العثور على رابط مصدر توثيق تقني صريح أو السند موثق برابط غير مكتمل.`,
              `[CI/CD] تم الرفض: يجب تزويدنا بسند أو رابط تقني رسمي (رابط رسمي، لقطة شاشة، ورقة علمية) في ملف المقترح.`,
              `❌ فشلت السلسلة الأمنية التلقائية للبناء لقلة المصادر.`
            ]);
            setSimStatus('failed');
            showToast('فشل الدمج: يرجى كتابة رابط مرجع تقني صالح!', 'warn');
          } else {
            setSimLog([
              ...nextLogs,
              `[✓ موثق] تم فحص المصدر المرفق ووجد متطابقاً مع المعايير الشاملة.`,
              `[CI/CD] جاري فحص تكامل كود واستحداث ملف JSON المرتبط في /extensions...`,
              `[✓ سليم] محاكاة الإضافة في extensions/_${extRaw}.json متوافقة مع المجموعات الـ 22.`,
              `[Merge Approved] توافق كامل! جميع الفحوصات الـ 3 اجتازت بنجاح (تنسيق JSON، والفرادة، والبيانات الوصفية ومحلل المصادر).`,
              `🎉 تم قبول الدمج تلقائياً (Pull Request Merged to dev) والملف تم نقله لقائمة الشرف!`
            ]);
            setSimStatus('success');
            showToast('اكتملت محاكاة الدمج والتحقق بنجاح فائق!', 'success');
          }
        }, 1200);
      }
    }, 1000);
  };

  // Download audited version
  const downloadCleanedFile = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `audited_${fileName}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('جاري البدء بتحميل المستند المعتمد.');
  };

  const handleExportWithValidation = (actionName: string, actionFn: () => void) => {
    const hasCriticalErrors = activeFile?.report?.topFixes.some((f) => f.priority === 'MUST_HAVE');
    if (hasCriticalErrors) {
      setPendingExportAction({ action: actionFn, name: actionName });
    } else {
      actionFn();
    }
  };

  const exportToTasks = async (fixes: any[]) => {
    if (needsAuth || !authUser) {
      showToast('يجب تسجيل الدخول باستخدام Google Workspace لإنشاء المهام.', 'warn');
      return;
    }
    try {
      showToast('جاري تصدير المهام...', 'warn');
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      for (const fix of fixes) {
        await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: `إصلاح: ${fix.name}`,
            notes: `${fix.recommendation}\n\n[تم الاستخراج آليا من مدقق ملفات RAG]`
          })
        });
      }
      showToast('تم تصدير المهام بنجاح إلى Google Tasks!', 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء الاتصال بخدمة Tasks.', 'error');
    }
  };

  const saveToKeep = async (title: string, content: string) => {
    if (needsAuth || !authUser) {
      showToast('يجب تسجيل الدخول باستخدام Google Workspace لإنشاء الملاحظات.', 'warn');
      return;
    }
    try {
      showToast('جاري الحفظ في Keep...', 'warn');
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch("https://keep.googleapis.com/v1/notes", {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: `ملف مدقق: ${title}`,
          body: {
            text: {
              text: content
            }
          }
        })
      });
      if (!res.ok) throw new Error('Failed to save to Keep');
      showToast('تم حفظ الملف كمسودة في Google Keep!', 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء الحفظ في Keep. تأكد من تفعيل الأذونات.', 'error');
    }
  };

  const shareViaEmail = async (fileName: string, score: number, fileContent: string) => {
    if (needsAuth || !authUser) {
      showToast('يجب تسجيل الدخول باستخدام Google Workspace لمشاركة التقارير.', 'warn');
      return;
    }
    
    try {
      showToast('جاري إرسال البريد...', 'warn');
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const subject = `تقرير تدقيق: ${fileName} [درجة: ${score}%]`;
      
      const emailLines = [
        `To: ${authUser.email}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
        '',
        `مرحباً، مرفق لكم تقرير امتثال لملف ${fileName}.`,
        `الدرجة الحالية: ${score}%`,
        '',
        'المحتوى المدقق:',
        '------------------',
        fileContent
      ];
      
      const rawEmail = btoa(unescape(encodeURIComponent(emailLines.join('\r\n')))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw: rawEmail
        })
      });
      
      if (!res.ok) {
        throw new Error('Failed to send email');
      }
      
      showToast('تم إرسال التقرير المؤرشف بنجاح عبر البريد الإلكتروني!', 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء إرسال البريد عبر Gmail. تأكد من الأذونات.', 'error');
    }
  };

  // Get rank badge based on compliance score
  const getRankBadgeInfo = (score: number) => {
    if (score >= 95) return { text: "جاهزية كاملة وفائقة للـ RAG", color: "text-green-400 bg-green-950/40 border-green-800" };
    if (score >= 85) return { text: "جاهزية معيارية عالية", color: "text-emerald-400 bg-emerald-950/30 border-emerald-800" };
    if (score >= 70) return { text: "امتثال جزئي - يحتاج مراجعة", color: "text-amber-400 bg-amber-950/30 border-amber-800" };
    return { text: "ضعيف ومرفوض - أصلح الأخطاء", color: "text-rose-400 bg-rose-950/40 border-rose-900" };
  };

  // Drag and drop helper reference
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      await processUploadedFileList(Array.from(droppedFiles));
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f14] text-gray-200 font-sans antialiased selection:bg-teal-500/30 selection:text-teal-300" dir="rtl">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 left-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl border shadow-2xl transition-all duration-300 animate-bounce ${
          toast.type === 'success' ? 'bg-[#101c1a] border-emerald-800 text-emerald-400' :
          toast.type === 'error' ? 'bg-[#221316] border-rose-900 text-rose-400' :
          'bg-[#1e1913] border-amber-800 text-amber-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span className="font-medium text-sm">{toast.message}</span>
        </div>
      )}

      {/* Header Panel */}
      <header className="border-b border-gray-800/80 bg-[#11141e] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-teal-500/10">
              <Shield className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-sans tracking-tight text-white">مدقق الملفات الذكي</h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-teal-950 text-teal-400 border border-teal-800 animate-pulse">إصدار 2.0</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">المنصة الموحدة للفحص المعرفي وتقييم التضمين والتكامل مع Google Workspace للوكلاء وأنظمة RAG</p>
            </div>
          </div>

          {/* Global Controller Margin */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Mode Selectors */}
            <div className="bg-[#181d2c] border border-gray-800 p-1 rounded-xl flex items-center">
              <button 
                onClick={() => setMode('teacher')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  mode === 'teacher' 
                    ? 'bg-gradient-to-l from-teal-500 to-teal-600 text-white shadow-md' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>وضع المرشد (التعليمي)</span>
              </button>
              <button 
                onClick={() => setMode('expert')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  mode === 'expert' 
                    ? 'bg-gradient-to-l from-indigo-500 to-indigo-600 text-white shadow-md' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>وضع الخبير المطور</span>
              </button>
            </div>

            {/* AI Active Glow Badge */}
            {activeFile?.report?.aiActivated ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-teal-800 bg-teal-950/30 text-teal-400 text-xs font-mono font-bold animate-pulse">
                <Sparkles className="w-3.5 h-3.5" />
                <span>الفحص الدلالي نشط</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-800 bg-gray-900/60 text-gray-400 text-xs font-mono">
                <Clock className="w-3.5 h-3.5" />
                <span>فحص تركيبي محلي</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Core Multi File Browser with Drag & Drop */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Right Sidebar - File Manager */}
          <div className="lg:col-span-1 space-y-6">
          
            {/* Workspace Auth Profile */}
            <div className="bg-[#11141e] border border-gray-800/80 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center justify-between">
                <span>صلة أمان Google Workspace</span>
              </h3>
              
              {needsAuth || !authUser ? (
                <button 
                  onClick={handleGoogleLogin} 
                  disabled={isLoggingIn}
                  className="w-full py-2.5 px-4 rounded-xl border border-gray-800 bg-[#161a29] text-xs font-bold text-gray-300 hover:bg-[#1a2033] hover:text-white transition flex items-center justify-center gap-2"
                >
                  {isLoggingIn ? 'جاري الاتصال...' : 'Sign in with Google'}
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {authUser.photoURL ? (
                      <img src={authUser.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-gray-700" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-900 border border-indigo-700 flex items-center justify-center text-xs">{authUser.email?.charAt(0).toUpperCase()}</div>
                    )}
                    <div className="flex-1 overflow-hidden">
                      <p className="text-xs text-white truncate font-bold">{authUser.displayName || 'Google User'}</p>
                      <p className="text-[10px] text-gray-400 truncate">{authUser.email}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400 mb-2">
                    <span className="flex items-center gap-1 bg-[#1a2033] px-2 py-1 rounded"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Drive</span>
                    <span className="flex items-center gap-1 bg-[#1a2033] px-2 py-1 rounded"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Docs</span>
                    <span className="flex items-center gap-1 bg-[#1a2033] px-2 py-1 rounded"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Sheets</span>
                    <span className="flex items-center gap-1 bg-[#1a2033] px-2 py-1 rounded"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Gmail</span>
                  </div>
                  <button 
                    onClick={handleGoogleLogout} 
                    className="w-full py-1.5 px-4 rounded-lg bg-gray-900 text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition"
                  >
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </div>

            <div className="bg-[#11141e] border border-gray-800/80 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center justify-between">
                <span>ملفات المعرفة الحالية</span>
                {files.length > 0 && (
                  <button onClick={clearFileList} className="text-xs text-rose-400 hover:text-rose-300 transition flex items-center gap-1">
                    <Trash2 className="w-3 h-3" />
                    <span>تفريغ</span>
                  </button>
                )}
              </h3>

              {/* Drag and drop upload block */}
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-gray-800 hover:border-teal-500/40 rounded-xl p-4 text-center cursor-pointer bg-[#0f111a] hover:bg-teal-950/5 transition duration-250 relative group mb-4"
              >
                <input 
                  type="file" 
                  id="file-upload" 
                  onChange={handleFileChange} 
                  multiple 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                />
                <Upload className="w-6 h-6 mx-auto mb-2 text-gray-500 group-hover:text-teal-400 transition" />
                <span className="block text-xs font-bold text-gray-400 group-hover:text-gray-200 transition">ارفع ملف أو أرشيف (.ZIP)</span>
                <span className="block text-[10px] text-gray-500 mt-1">Markdown, JSON, JSONL, TXT</span>
              </div>

              {/* Paste Text manually block toggler */}
              <button 
                onClick={() => setIsPasting(!isPasting)}
                className="w-full py-2.5 px-4 mb-2 rounded-xl border border-gray-800 bg-[#161a29] text-xs font-bold text-gray-300 hover:bg-[#1a2033] hover:text-white transition flex items-center justify-center gap-2"
              >
                <FileCode className="w-4 h-4" />
                <span>إدراج نص يدوي</span>
              </button>

              {/* URL Import block toggler */}
              <button 
                onClick={() => setIsUrlImportOpen(!isUrlImportOpen)}
                className="w-full py-2.5 px-4 mb-4 rounded-xl border border-gray-800 bg-[#161a29] text-xs font-bold text-gray-300 hover:bg-[#1a2033] hover:text-white transition flex items-center justify-center gap-2"
              >
                <Link className="w-4 h-4" />
                <span>استيراد من رابط (URL)</span>
              </button>

              {/* Workspace Import (Only shows if authenticated) */}
              {!needsAuth && authUser && (
                <WorkspaceImport onFilesImported={(newFiles) => {
                  setFiles(prev => [...prev, ...newFiles]);
                  setSelectedFileId(newFiles[0].id);
                  showToast(`تم استيراد ${newFiles.length} ملف من Workspace`);
                  triggerAuditForFile(newFiles[0].id, newFiles[0].content, newFiles[0].name, newFiles[0].size);
                }} />
              )}

              {/* Paste Form Dialog inside layout */}
              {isPasting && (
                <div className="bg-[#141824] border border-gray-800 p-4 rounded-xl mb-4 space-y-3 relative">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">اسم الملف المستعار:</label>
                    <input 
                      type="text" 
                      value={pastedFileName} 
                      onChange={(e) => setPastedFileName(e.target.value)}
                      className="w-full bg-[#1c2234] border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-teal-500 outline-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">صيغة الملف الاستراتيجية:</label>
                    <select 
                      value={pastedFileType} 
                      onChange={(e) => setPastedFileType(e.target.value as any)}
                      className="w-full bg-[#1c2234] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white focus:border-teal-500 outline-none"
                    >
                      <option value="md">Markdown (.md)</option>
                      <option value="json">JSON (.json)</option>
                      <option value="jsonl">JSONL (.jsonl)</option>
                      <option value="txt">Text (.txt)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">محتوى الملف:</label>
                    <textarea 
                      placeholder="الصق مستند السياسة أو البيانات هنا..."
                      value={pastedContent}
                      onChange={(e) => setPastedContent(e.target.value)}
                      rows={6}
                      className="w-full bg-[#1c2234] border border-gray-800 rounded-lg p-2 text-xs text-white font-mono focus:border-teal-500 outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handlePasteSubmit} className="flex-1 py-1.5 bg-teal-500 hover:bg-teal-600 text-white font-bold text-xs rounded-lg transition">استيراد وفحص</button>
                    <button onClick={() => setIsPasting(false)} className="px-3 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs rounded-lg transition">إلغاء</button>
                  </div>
                </div>
              )}

              {/* URL Import Form Dialog */}
              {isUrlImportOpen && (
                <div className="bg-[#141824] border border-gray-800 p-4 rounded-xl mb-4 space-y-3 relative">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">الرابط المباشر (URL):</label>
                    <input 
                      type="url" 
                      placeholder="https://example.com/file.md"
                      value={importUrl} 
                      onChange={(e) => setImportUrl(e.target.value)}
                      className="w-full bg-[#1c2234] border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-teal-500 outline-none" 
                    />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleUrlImport} 
                      disabled={urlImportLoading || !importUrl}
                      className="flex-1 py-1.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition"
                    >
                      {urlImportLoading ? 'جاري الاستيراد...' : 'استيراد وفحص'}
                    </button>
                    <button onClick={() => setIsUrlImportOpen(false)} className="px-3 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs rounded-lg transition">إلغاء</button>
                  </div>
                </div>
              )}

              {/* Sidebar Search Input */}
              {files.length > 0 && (
                <div className="relative mb-4">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                    placeholder="ابحث بـ الاسم، حالة: ناجح، نوع: طبي..."
                    className="w-full bg-[#141824] border border-gray-800 rounded-xl pr-9 pl-8 py-2 text-xs text-white placeholder-gray-500 focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5]/20 outline-none transition"
                  />
                  {sidebarSearch && (
                    <button
                      onClick={() => setSidebarSearch('')}
                      className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-500 hover:text-gray-300 transition"
                      title="مسح البحث"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isSearchFocused && (
                    <div className="absolute left-0 right-0 mt-1 bg-[#10131f] border border-gray-800 rounded-xl shadow-xl z-50 overflow-hidden text-right leading-relaxed max-h-60 overflow-y-auto">
                      <div className="p-2 border-b border-gray-800 bg-[#0d0f17] text-[10px] text-gray-400 font-bold flex justify-between items-center direction-rtl">
                        <span>مقترحات الربط التلقائي والبحث</span>
                        <button type="button" onMouseDown={() => setIsSearchFocused(false)} className="hover:text-white">إغلاق</button>
                      </div>
                      {getAutocompleteSuggestions().map((s, idx) => (
                        <div
                          key={idx}
                          onMouseDown={() => {
                            setSidebarSearch(s.value);
                            setIsSearchFocused(false);
                          }}
                          className="p-2 hover:bg-[#161a29] cursor-pointer border-b border-gray-900/50 last:border-0 flex flex-col transition text-right"
                        >
                          <span className="text-xs text-gray-200 font-semibold">{s.label}</span>
                          <span className="text-[9px] text-[#2dd4bf] font-mono mt-0.5">{s.category} • {s.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* List of active files */}
              {files.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border border-gray-900 rounded-xl bg-[#0d0f17]">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">لا يوجد ملفات محملة حالياً للتدقيق.</p>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border border-gray-800 border-dashed rounded-xl bg-[#141824]/30">
                  <Search className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                  <p className="text-xs font-semibold">لا توجد نتائج تطابق "{sidebarSearch}"</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
                  {filteredFiles.map(file => {
                    const isSelected = selectedFileId === file.id;
                    return (
                      <div 
                        key={file.id}
                        onClick={() => setSelectedFileId(file.id)}
                        className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between group ${
                          isSelected 
                            ? 'bg-[#182133] border-indigo-500 text-indigo-300 shadow-sm' 
                            : 'bg-[#141823]/50 border-gray-800 hover:border-gray-700 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-400' : 'text-gray-400'}`} />
                          <div className="min-w-0">
                            <p className="text-xs truncate font-semibold">{file.name}</p>
                            <span className="text-[10px] text-gray-500 block">{(file.size / 1024).toFixed(1)} ك.ب</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {file.loading ? (
                            <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                          ) : file.report ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold font-mono ${
                              file.report.complianceScore >= 85 ? 'bg-green-950 text-green-400' : 'bg-rose-950 text-rose-400'
                            }`}>
                              {file.report.complianceScore}%
                            </span>
                          ) : null}

                          <button 
                            onClick={(e) => removeFile(file.id, e)}
                            className="text-gray-500 hover:text-rose-400 transition opacity-0 group-hover:opacity-100 p-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Helper Protocol card */}
            <div className="bg-[#11141e]/70 border border-gray-800/80 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-teal-400" />
                <span>البروتوكول المعياري</span>
              </h4>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                يتبع هذا المدقق الإصدار 2.1 الأحدث من قائمة التدقيق الموحدة المعتمدة لدى إدارة هندسة المعرفة لضمان الفحص الدلالي والصوان وتطهير قواعد الاسترجاع المعقدة (ويشمل دعم Graph RAG والأمن المتقدم).
              </p>
              <div className="border-t border-gray-800 pt-2 flex items-center justify-between text-[10px] text-gray-500">
                <span>تحديث: 2026-06-21</span>
                <span className="text-indigo-400 font-bold">إصدار 2.1 الموحد</span>
              </div>
            </div>
          </div>

          {/* Left Panel - Active Auditor Workspace */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* If no file is audited yet */}
            {!activeFile ? (
              <div className="bg-[#11141e] border border-gray-800 rounded-3xl p-12 text-center shadow-lg">
                <div className="w-20 h-20 bg-gradient-to-tr from-gray-800 to-gray-700/50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Database className="w-10 h-10 text-gray-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">مرحباً بك في مستشار هندسة المعرفة الذكي</h2>
                <p className="text-sm text-gray-400 max-w-lg mx-auto leading-relaxed mb-6">
                  ارفع مستند سياسة أو ملف تدريب، أو الصق محتواه يدوياً. وسيتولى محرك التدقيق اختبار الملف آلياً ودلالياً وفقاً لأبواب البروتوكول الموحدة العشرة وحساب درجة الامتثال بدقة.
                </p>
                
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <button 
                    onClick={() => {
                      const sampleContent = `---
title: "سياسة السفر الداخلي"
doc_id: "HR-POL-102"
version: "1.0"
last_updated: "2026-06-01"
owner: "الموارد البشرية"
tags: [سفر, بدلات]
audience: [جميع_الموظفين]
type: سياسة
summary: "توضح السياسة آلية السفر."
output_format: "نقاط محددة"
security_level: داخلي
---

# سياسة السفر الداخلي 🚀

هذه السياسة تحدد الإجراءات. 

## شروط السفر
1. السفر بالدرجة الاقتصادية.  
2. يجب أن نوافق قبل السفر بـ 15 يوماً.  

## أسئلة متوقعة
أشياء وأسئلة شائعة..`;
                      const sampleFile: FileToAudit = {
                        id: 'sample',
                        name: 'HR-POL-102_Sample_v1.0.md',
                        content: sampleContent,
                        size: sampleContent.length,
                        type: 'md'
                      };
                      setFiles([sampleFile]);
                      setSelectedFileId('sample');
                      triggerAuditForFile('sample', sampleContent, sampleFile.name, sampleContent.length);
                    }}
                    className="px-5 py-3 rounded-xl bg-gradient-to-l from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold text-xs select-none shadow-md transition"
                  >
                    تجربة ملف عينة سريع
                  </button>
                </div>
              </div>
            ) : activeFile.loading ? (
              <div className="bg-[#11141e] border border-gray-800 rounded-3xl p-24 text-center">
                <RefreshCw className="w-12 h-12 text-teal-400 animate-spin mx-auto mb-6" />
                <h3 className="text-lg font-bold text-white mb-2">جاري استدعاء الوعي اللغوي لـ Gemini...</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                  يقوم المدقق بفحص التراكيب المعرفية والتأكد من تماسك الفقرات وخلوها من الكليشيهات اللغوية وسلامتها من حقن الاختراقات البرمجية..
                </p>
              </div>
            ) : !activeFile.report ? (
              <div className="bg-[#11141e] border border-gray-800 rounded-3xl p-12 text-center">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">الملف بانتظار إطلاق الفحص والتدقيق</h3>
                <p className="text-xs text-gray-400 mb-6">يمكنك مراجعة المستند أو تعديله قبل دفع المعالجة.</p>
                <button 
                  onClick={() => triggerAuditForFile(activeFile.id, activeFile.content, activeFile.name, activeFile.size)}
                  className="px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white font-bold text-xs rounded-lg transition"
                >
                  إطلاق الفحص الشامل للجاهزية
                </button>
              </div>
            ) : (
              // FULL AUDITED REPORT VIEW
              <div className="space-y-6">
                
                {/* Visual score banner and summary metrics */}
                <div className="bg-gradient-to-r from-[#141a29] to-[#121624] border border-gray-805/85 rounded-3xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl -z-10"></div>
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-505/5 rounded-full blur-3xl -z-10"></div>

                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    {/* Gauge and rating score */}
                    <div className="flex items-center gap-5">
                      <div className="relative w-28 h-28 flex items-center justify-center">
                        {/* Circle background */}
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="56" cy="56" r="48" fill="transparent" stroke="#161b2d" strokeWidth="10" />
                          <circle 
                            cx="56" 
                            cy="56" 
                            r="48" 
                            fill="transparent" 
                            stroke={
                              activeFile.report.complianceScore >= 85 ? "#10b981" : 
                              activeFile.report.complianceScore >= 70 ? "#f59e0b" : "#f43f5e"
                            } 
                            strokeWidth="10" 
                            strokeDasharray={2 * Math.PI * 48}
                            strokeDashoffset={2 * Math.PI * 48 * (1 - activeFile.report.complianceScore / 100)}
                            className="transition-all duration-1000 ease-out"
                          />
                        </svg>
                        <span className="absolute text-2xl font-black font-sans text-white">{activeFile.report.complianceScore}%</span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 font-mono">درجة الامتثال الكلية محسوبة</span>
                        <h2 className="text-lg font-black text-white mt-1">تقرير فحص الملف: {activeFile.name}</h2>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getRankBadgeInfo(activeFile.report.complianceScore).color}`}>
                            {getRankBadgeInfo(activeFile.report.complianceScore).text}
                          </span>
                          {activeFile.report.fileGroup && (
                            <span 
                              title={`المصنف المرجعي: ${activeFile.report.fileGroupEn || ""}`}
                              className="px-3 py-1 rounded-full text-xs font-bold border border-indigo-500/20 bg-indigo-500/10 text-indigo-300"
                            >
                              📂 {activeFile.report.fileGroup}
                            </span>
                          )}
                          <span className="text-xs text-gray-400 font-mono">{(activeFile.size / 1024).toFixed(1)} ك.ب</span>
                        </div>
                      </div>
                    </div>

                    {/* Numeric breakdown cards */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="p-3 rounded-2xl bg-[#0f1118] border border-gray-800 text-center min-w-[70px]">
                        <span className="block text-xs font-bold text-emerald-400">{activeFile.report.summary.passed}</span>
                        <span className="text-[10px] text-gray-500 mt-1 block">مجتاز ✅</span>
                      </div>
                      <div className="p-3 rounded-2xl bg-[#0f1118] border border-gray-800 text-center min-w-[70px]">
                        <span className="block text-xs font-bold text-rose-400">{activeFile.report.summary.failed}</span>
                        <span className="text-[10px] text-gray-500 mt-1 block">راسب ❌</span>
                      </div>
                      <div className="p-3 rounded-2xl bg-[#0f1118] border border-gray-800 text-center min-w-[70px]">
                        <span className="block text-xs font-bold text-amber-400">{activeFile.report.summary.partial}</span>
                        <span className="text-[10px] text-gray-500 mt-1 block">جزئي ⚠️</span>
                      </div>
                      <div className="p-3 rounded-2xl bg-[#0f1118] border border-gray-800 text-center min-w-[70px]">
                        <span className="block text-xs font-bold text-gray-400">{activeFile.report.summary.notApplicable}</span>
                        <span className="text-[10px] text-gray-500 mt-1 block">مستثنى ⊘</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Navigation Tab Bar inside results */}
                <div className="border-b border-gray-800 flex items-center justify-between">
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setActiveTab('overview')}
                      className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition select-none ${
                        activeTab === 'overview' ? 'border-teal-500 text-teal-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <Activity className="w-4 h-4" />
                      <span>نظرة عامة</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('chapters')}
                      className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition select-none ${
                        activeTab === 'chapters' ? 'border-teal-500 text-teal-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <Layers className="w-4 h-4" />
                      <span>قسيمة الأبواب العشرة</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('editor')}
                      className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition select-none ${
                        activeTab === 'editor' ? 'border-teal-500 text-teal-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <FileCode className="w-4 h-4" />
                      <span>مقارنة المحتوى والـ Diff</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('graph')}
                      className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition select-none ${
                        activeTab === 'graph' ? 'border-teal-500 text-teal-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <Database className="w-4 h-4" />
                      <span>مستكشف الكيانات (Graph)</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('history')}
                      className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition select-none ${
                        activeTab === 'history' ? 'border-teal-500 text-teal-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <History className="w-4 h-4" />
                      <span>تسلسل التحديثات والـ KPI</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('steps')}
                      className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition select-none ${
                        activeTab === 'steps' ? 'border-teal-500 text-teal-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <ListChecks className="w-4 h-4" />
                      <span>خطوات المراجعة</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('community')}
                      className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition select-none ${
                        activeTab === 'community' ? 'border-teal-500 text-teal-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>مستودع المعرفة والدعم</span>
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => shareViaEmail(activeFile.name, activeFile.report!.complianceScore, activeFile.report!.cleanedContent || activeFile.content)}
                      className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition py-1 px-3 border border-rose-900 rounded-lg bg-rose-950/20"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>إرسال التقرير</span>
                    </button>
                    <button 
                      onClick={() => saveToKeep(activeFile.name, activeFile.report!.cleanedContent || activeFile.content)}
                      className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition py-1 px-3 border border-amber-900 rounded-lg bg-amber-950/20"
                    >
                      <StickyNote className="w-3.5 h-3.5" />
                      <span>Keep</span>
                    </button>
                    <button 
                      onClick={() => copyToClipboard(activeFile.report!.cleanedContent || activeFile.content, 'الملف المدقق')}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition py-1 px-3 border border-gray-800 rounded-lg bg-gray-900/50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ النص</span>
                    </button>
                    <button 
                      onClick={() => triggerAuditForFile(activeFile.id, activeFile.content, activeFile.name, activeFile.size)}
                      className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition py-1 px-3 border border-indigo-900 rounded-lg bg-indigo-950/20"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>إعادة التدقيق</span>
                    </button>
                  </div>
                </div>

                {/* TAB 1: OVERVIEW ROOM */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Deep Structural Profiling Card (الاستقبال والتحليل الهيكلي العميق) */}
                    {(() => {
                      const text = activeFile.content || "";
                      const charCount = text.length;
                      const wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
                      const paragraphCount = text.split(/\n\s*\n/).filter(Boolean).length;
                      const estChunks = Math.ceil(charCount / 512) || 1;
                      
                      // Naming rating
                      const nameWithNoExt = activeFile.name.substring(0, activeFile.name.lastIndexOf('.'));
                      const namingRegex = /^[A-Z0-9-]+_[A-Za-z0-9\u0600-\u06FF-]+_v\d+(\.\d+)?$/;
                      const isNamingValid = namingRegex.test(nameWithNoExt);
                      
                      return (
                        <div className="bg-[#11141e] border border-gray-800 rounded-2xl p-5 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl -z-10 animate-pulse"></div>
                          
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4 mb-4">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-teal-400 font-mono tracking-wider">الاستقبال والتحليل الهيكلي العميق (إصدار 2.0)</span>
                              <h3 className="text-sm font-bold text-white mt-0.5 flex items-center gap-1.5">
                                <Database className="w-4 h-4 text-teal-400" />
                                <span>بطاقة الخصائص والأوزان الرقمية للمستند</span>
                              </h3>
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono bg-[#0c0e16] px-2.5 py-1 rounded border border-gray-850">
                              MIME / Class: {activeFile.type === 'md' ? 'text/markdown' : activeFile.type === 'json' ? 'application/json' : 'text/plain'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-[#141824] p-3 rounded-xl border border-gray-850/60">
                              <span className="text-[10px] text-gray-500 block font-bold">الحجم الكلي</span>
                              <span className="text-sm font-mono font-bold text-white mt-1 block">{(activeFile.size / 1024).toFixed(2)} ك.ب</span>
                              <span className="text-[9px] text-gray-400 mt-1 block">{charCount.toLocaleString()} حرف</span>
                            </div>

                            <div className="bg-[#141824] p-3 rounded-xl border border-gray-850/60">
                              <span className="text-[10px] text-gray-500 block font-bold">عدد الكلمات والفقرات</span>
                              <span className="text-sm font-mono font-bold text-white mt-1 block">{wordCount.toLocaleString()} كلمة</span>
                              <span className="text-[9px] text-gray-400 mt-1 block">{paragraphCount} فقرة دلالية</span>
                            </div>

                            <div className="bg-[#141824] p-3 rounded-xl border border-gray-850/60">
                              <span className="text-[10px] text-gray-500 block font-bold">التجزئة والتقطيع المقترح (Chunking)</span>
                              <span className="text-sm font-mono font-bold text-white mt-1 block">~ {estChunks} مقطع (Chunk)</span>
                              <span className="text-[9px] text-teal-450 mt-1 block font-sans">تداخل مستهدف: 15%</span>
                            </div>

                            <div className="bg-[#141824] p-3 rounded-xl border border-gray-850/60">
                              <span className="text-[10px] text-gray-500 block font-bold">بروتوكول تسمية الملف</span>
                              <span className={`text-xs font-bold mt-1.5 inline-flex items-center gap-1 ${isNamingValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isNamingValid ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>مطابق للتسمية M_H</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>غير مطابق - يحتاج تعديل</span>
                                  </>
                                )}
                              </span>
                              <span className="text-[9px] text-gray-500 mt-1 block truncate" dir="ltr">{activeFile.name}</span>
                            </div>
                          </div>

                          {/* Enriched Database Properties Block */}
                          {(() => {
                            const ext = activeFile.name.substring(activeFile.name.lastIndexOf('.') + 1).toLowerCase();
                            const enriched = enrichedDatabase?.extensions?.find((e: any) => e.extension === ext);
                            if (!enriched) return null;
                            return (
                              <div className="mt-4 bg-[#141a29]/80 border border-indigo-900/60 p-4 rounded-xl text-right">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400">
                                  <Sparkles className="w-4 h-4 text-indigo-400" />
                                  <span>بروتوكول الامتدادات المثرية v2.1: المعرف الفريد [{enriched.extension_id}]</span>
                                </div>
                                <p className="text-[11px] text-gray-400 mt-1">يعود هذا الملف لعائلة: <strong>{enriched.group_name}</strong>. يملك دعماً وتصنيفاً خاصاً طبقاً للدستور المعرفي الموحد.</p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 text-xs text-gray-300 border-t border-gray-800/60 pt-3">
                                  <div>
                                    <span className="text-gray-500 font-semibold block text-[10px]">النوع دلالياً</span>
                                    <span className="font-mono text-gray-200 mt-1 block font-semibold">{enriched.type}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 font-semibold block text-[10px]">أدوات وطريقة المعالجة</span>
                                    <span className="text-gray-200 mt-1 block font-semibold">أداة: {enriched.extraction_tool || 'نص مباشر'} • طريقة: {enriched.extraction_method || 'سردي'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 font-semibold block text-[10px]">ملاحظات الفحص ونقاط التضمين</span>
                                    <span className="text-gray-200 mt-1 block font-semibold">{enriched.notes}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}

                    {/* Security and Protection Shield (إخفاء PII ومكافحة حقن الأوامر) */}
                    {(() => {
                      if (!activeFile.report) return null;
                      const securityItems = activeFile.report.items.filter(it => it.id === 'S-02' || it.id === 'S-06');
                      if (securityItems.length === 0) return null;

                      const hasSecurityFail = securityItems.some(it => it.status === 'FAIL');
                      
                      return (
                        <div className={`border rounded-2xl p-5 relative overflow-hidden ${hasSecurityFail ? 'bg-rose-950/20 border-rose-900' : 'bg-emerald-950/10 border-emerald-900/50'}`}>
                          <div className={`absolute top-0 left-0 w-32 h-32 rounded-full blur-3xl -z-10 ${hasSecurityFail ? 'bg-rose-500/10 animate-pulse' : 'bg-emerald-500/5'}`}></div>
                          
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                            <div>
                              <span className={`text-[10px] uppercase font-bold font-mono tracking-wider ${hasSecurityFail ? 'text-rose-400' : 'text-emerald-400'}`}>
                                نظام الحماية والمناعة (Security Shield 2.1)
                              </span>
                              <h3 className="text-sm font-bold text-white mt-0.5 flex items-center gap-1.5">
                                {hasSecurityFail ? <AlertTriangle className="w-4 h-4 text-rose-500" /> : <ShieldCheck className="w-4 h-4 text-emerald-500" />}
                                <span>حالة التدقيق الأمني لبيانات المستند</span>
                              </h3>
                            </div>
                            {hasSecurityFail && (
                              <span className="text-[10px]text-rose-200 bg-rose-500/20 px-3 py-1.5 rounded-full border border-rose-500/30 font-bold flex items-center gap-1.5 animate-pulse">
                                <span>⚠️ خطأ حرج (MUST_HAVE) أمني</span>
                              </span>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {securityItems.map(sec => (
                              <div key={sec.id} className="bg-[#141824]/60 p-3.5 rounded-xl border border-gray-850/60 flex flex-col justify-between">
                                <div>
                                  <div className="flex items-start justify-between">
                                    <span className="text-[11px] text-gray-300 font-bold flex items-center gap-1 mb-1.5">
                                      {sec.id === 'S-06' ? <TerminalSquare className="w-3.5 h-3.5 text-amber-500" /> : <Fingerprint className="w-3.5 h-3.5 text-blue-400" />}
                                      <span>{sec.name}</span>
                                    </span>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                                      sec.status === 'PASS' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                      sec.status === 'FAIL' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
                                      'bg-gray-800 text-gray-400 border-gray-700'
                                    }`}>
                                      {sec.status === 'PASS' ? 'آمن ومجتاز' : sec.status === 'FAIL' ? 'خطر - لم يجتز' : 'غير مختبر'}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-gray-500 leading-relaxed mt-2">{sec.description}</p>
                                </div>
                                {sec.status === 'FAIL' && sec.recommendation && (
                                  <div className="mt-3 bg-rose-500/10 border border-rose-500/20 p-2 rounded text-[10px] text-rose-300">
                                    <span className="font-bold block mb-0.5 text-rose-400">التوصية الأمنية:</span>
                                    {sec.recommendation}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Interactive 5-Stage Audit Pipeline (مسار المراجعة والاعتماد خماسي المراحل الثابت) */}
                    {(() => {
                      // Help calculate subsets for stages
                      const getStageItemsWithProg = (idPrefixes: string[]) => {
                        const items = activeFile.report?.items || [];
                        const stageItems = items.filter(it => idPrefixes.some(pref => it.id.startsWith(pref)));
                        const applicable = stageItems.filter(it => it.status !== 'NOT_APPLICABLE');
                        if (applicable.length === 0) return { items: stageItems, prog: 100, passed: 0, total: 0 };
                        
                        const passed = applicable.filter(it => it.status === 'PASS').length;
                        const partial = applicable.filter(it => it.status === 'PARTIAL').length;
                        const scoreVal = passed + (partial * 0.5);
                        const calculatedProg = Math.round((scoreVal / applicable.length) * 100);
                        return { items: stageItems, prog: calculatedProg, passed: passed, total: applicable.length };
                      };

                      const stageData = [
                        {
                          id: 1,
                          title: "المرحلة الأولى: التحليل الهيكلي وتدقيق البيانات الوصفية",
                          sub: "تطوير الهيكل، وتدقيق YAML والترميز المرجعي وحقول التسمية",
                          prefixes: ['1.1', '1.2', '1.3', '2.1'],
                          icon: Database,
                          desc: "تتضمن هذه المرحلة التحقق من توفر ترويسة YAML متطابقة مع الدستور المعرفي، بالإضافة إلى التسمية الموحدة للمستند وصيغة الملف والترميزات القياسية في البابين الأول والثاني.",
                          color: "from-teal-500/10 to-teal-500/5",
                          border: "border-teal-500/30"
                        },
                        {
                          id: 2,
                          title: "المرحلة الثانية: التدقيق المعرفي واللغوي (خلو الـ Clichés والهلوسات)",
                          sub: "تنقية المصطلحات اللغوية، تصفية الكليشيهات وزيادة الكثافة المعرفية دلالياً",
                          prefixes: ['3.1', '3.2', '4.1', '4.2'],
                          icon: BookOpen,
                          desc: "تركز المرحلة الثانية على جودة الصياغة، إزالة الهلوسات المعرفية والكتابة الصحفية/العامة أو الكليشيهات العاطفية التي تؤثر على جودة المتجهات الدلالية.",
                          color: "from-[#4f46e5]/10 to-[#4f46e5]/5",
                          border: "border-indigo-500/30"
                        },
                        {
                          id: 3,
                          title: "المرحلة الثالثة: التقطيع الدلالي وجاهزية الـ Chunking لـ RAG",
                          sub: "توزيع الحدود الهرمية، تجنب بتر الأفكار، وترتيب العناوين ووسوم Markdown",
                          prefixes: ['5.1', '5.2', '2.2', '2.3', '2.4'],
                          icon: Layers,
                          desc: "تدرس هذه المرحلة قابلية المستند للتقطيع دون فقدان السياق؛ بفحص الهرمية العناوين وتجانس حجم الفقرات وعدم كسر الجمل مع بقاء المعنى كاملاً داخل المقطع الواحد.",
                          color: "from-[#ec4899]/10 to-[#ec4899]/5",
                          border: "border-pink-500/30"
                        },
                        {
                          id: 4,
                          title: "المرحلة الرابعة: الفلترة الأمنية ومكافحة التسميم والـ PII",
                          sub: "فحص وتطهير الترويدات أو حقن التوجيه والتسريبات وتصنيف السرية",
                          prefixes: ['7.1', '7.2'],
                          icon: Shield,
                          desc: "مرحلة الأمان الصارمة: تكشف عن محاولات حقن التوجيهات (Prompt Injections)، وتصفي البيانات الحساسة أو الشخصية (PII) وتحظر سيناريوهات تسميم البيانات قبل الرفع للمحرك.",
                          color: "from-amber-500/10 to-amber-500/5",
                          border: "border-amber-500/30"
                        },
                        {
                          id: 5,
                          title: "المرحلة الخامسة: تمثيل الكيانات والرسم المعرفي والاعتماد المعرفي",
                          sub: "استخلاص كيانات Graph RAG، وبناء الصلات، واعتماد النسخة النظيفة المعتمدة",
                          prefixes: ['6.1', '6.2', '8.1', '9.1', '9.2', '10.1'],
                          icon: Sliders,
                          desc: "تتوج المراجعة باستخلاص الكيانات دلالياً (Graph RAG) وبناء علاقات ثنائية الاتجاه، ثم تسليم النسخة المطهرة الخالية تماماً من العيوب المعرفية للإنتاج.",
                          color: "from-emerald-500/10 to-emerald-500/5",
                          border: "border-emerald-500/30"
                        }
                      ];

                      // Core computed info for active selected stage
                      const activeStageObj = stageData.find(s => s.id === activeReviewStage) || stageData[0];
                      const activeStats = getStageItemsWithProg(activeStageObj.prefixes);

                      return (
                        <div className="bg-[#11141e] border border-gray-800 rounded-2xl p-5 space-y-5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-teal-400 font-mono tracking-wider">سير عمل المراجعة والاعتماد خماسي المراحل (إصدار 2.0)</span>
                              <h3 className="text-sm font-bold text-white mt-0.5">خطوات التدقيق ومستويات الجاهزية الرقمية للمستند</h3>
                              <p className="text-xs text-gray-400 mt-1 leading-normal">
                                يمر الملف تلقائياً بخمس فلاتر تدقيق هندسية متتالية لضمان استقرار المعارف وملائمتها للاسترجاع المحوسب.
                              </p>
                            </div>
                            <span className="text-[11px] font-bold text-gray-400 bg-[#0d0f17] px-3 py-1.5 rounded-lg border border-gray-850">
                              مكتمل: {stageData.filter(s => getStageItemsWithProg(s.prefixes).prog === 100).length} / 5 مراحل
                            </span>
                          </div>

                          {/* Horizontal stepper track with scores */}
                          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 relative">
                            {stageData.map((stg) => {
                              const stats = getStageItemsWithProg(stg.prefixes);
                              const isSelected = activeReviewStage === stg.id;
                              
                              return (
                                <button
                                  key={stg.id}
                                  onClick={() => setActiveReviewStage(stg.id)}
                                  className={`p-3.5 rounded-xl border text-right transition flex flex-col justify-between h-28 relative overflow-hidden group select-none ${
                                    isSelected 
                                      ? 'bg-[#151c2f] border-teal-500 text-white shadow-md shadow-teal-500/5' 
                                      : 'bg-[#0f1118] border-gray-800/80 text-gray-400 hover:bg-[#121622] hover:border-gray-750'
                                  }`}
                                >
                                  {/* Progress bar inside button as ambient background */}
                                  <div 
                                    className="absolute bottom-0 right-0 h-1 bg-gradient-to-l from-teal-500 to-indigo-500 transition-all duration-500"
                                    style={{ width: `${stats.prog}%` }}
                                  ></div>

                                  <div className="flex items-center justify-between w-full">
                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-mono font-extrabold ${
                                      isSelected ? 'bg-[#0f1220] text-teal-400 border border-teal-800/60' : 'bg-gray-850 text-gray-500'
                                    }`}>
                                      {stg.id}
                                    </span>
                                    <span className={`text-[10px] font-mono font-bold ${
                                      stats.prog >= 85 ? 'text-emerald-400' : stats.prog >= 70 ? 'text-amber-400' : 'text-rose-400'
                                    }`}>
                                      {stats.prog}%
                                    </span>
                                  </div>

                                  <div>
                                    <span className="text-[10px] font-bold block truncate mt-1 text-white select-none">
                                      {stg.title.split(': ')[1]}
                                    </span>
                                    <span className="text-[9px] text-gray-500 block truncate select-none mt-0.5">
                                      {stats.passed} من {stats.total} بنود نشطة
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Stage details panel showing applicable criteria */}
                          <div className={`p-4 rounded-xl border bg-gradient-to-b ${activeStageObj.color} ${activeStageObj.border} space-y-4`}>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-800/50 pb-2.5">
                              <div className="flex items-center gap-2">
                                <activeStageObj.icon className="w-5 h-5 text-teal-400" />
                                <div>
                                  <h4 className="text-xs font-bold text-white">{activeStageObj.title}</h4>
                                  <p className="text-[10px] text-gray-400">{activeStageObj.sub}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2.5 py-1 rounded-full font-bold font-mono ${
                                  activeStats.prog >= 85 ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/60' : 
                                  activeStats.prog >= 70 ? 'bg-amber-950 text-amber-400 border border-amber-900/60' : 
                                  'bg-rose-950 text-rose-400 border border-rose-900/60'
                                }`}>
                                  درجة الجاهزية: {activeStats.prog}%
                                </span>
                              </div>
                            </div>

                            <p className="text-xs text-gray-300 leading-relaxed">{activeStageObj.desc}</p>

                            {/* Sub items in this stage */}
                            <div className="space-y-2">
                              <span className="text-[10px] font-extrabold uppercase text-gray-400">البنود المشمولة بهذه المرحلة المعتمدة:</span>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                {activeStats.items.map((it) => (
                                  <div key={it.id} className="p-2.5 bg-[#0e111a]/80 rounded-lg border border-gray-850 flex items-start justify-between gap-3 font-sans hover:border-gray-800 transition">
                                    <div className="space-y-0.5 min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] font-mono font-bold text-teal-400">{it.id}</span>
                                        <span className="font-extrabold text-white text-[11px] truncate">{it.name}</span>
                                      </div>
                                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{it.description}</p>
                                    </div>
                                    <span className={`text-[10px] font-bold whitespace-nowrap px-1.5 py-0.5 rounded ${
                                      it.status === 'PASS' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-950' : 
                                      it.status === 'FAIL' ? 'bg-rose-950/40 text-rose-400 border border-rose-950' :
                                      it.status === 'PARTIAL' ? 'bg-amber-950/40 text-amber-400 border border-amber-950' : 
                                      'bg-gray-900/65 text-gray-400 border border-gray-800'
                                    }`}>
                                      {it.status === 'PASS' ? 'مجتاز ✓' : it.status === 'FAIL' ? 'راسب ✗' : it.status === 'PARTIAL' ? 'جزئياً ⚠️' : 'مستثنى ⊘'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Priority Fixes Alert Box */}
                    <div className="bg-[#11141e] border border-gray-800 rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-400 animate-pulse" />
                          <span>أهم الإصلاحات الضرورية لتعزيز الجاهزية</span>
                        </h3>
                        <div className="flex items-center gap-3">
                          {activeFile.report.topFixes.length > 0 && (
                            <button
                              onClick={() => exportToTasks(activeFile.report!.topFixes)}
                              className="text-[10px] bg-[#1c2234] hover:bg-[#252d43] border border-indigo-900 text-indigo-400 font-bold py-1 px-3 rounded-md transition flex items-center gap-1.5"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                              <span>إرسال كمهام Tasks</span>
                            </button>
                          )}
                          <span className="text-[10px] text-gray-500 font-bold">بناءً على أولويات الدستور المعرفي</span>
                        </div>
                      </div>

                      {activeFile.report.topFixes.length === 0 ? (
                        <div className="p-4 text-center rounded-xl bg-emerald-950/20 border border-emerald-900/60 text-emerald-400 flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="text-xs font-bold">مستند استثنائي! متوافق كلياً مع جميع المتطلبات الصارمة للتسميمة والهيكل.</span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activeFile.report.topFixes.map((fix, idx) => (
                            <div key={idx} className="p-4 rounded-xl bg-[#141824] border border-gray-800 hover:border-gray-700/80 transition flex flex-col md:flex-row md:items-start justify-between gap-3 group relative">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">البند {fix.itemId}</span>
                                  <h4 className="text-xs font-bold text-white">{fix.name || `فشل في تدرج البند`}</h4>
                                  <span className={`text-[10px] scale-90 px-1.5 py-0.5 rounded font-bold ${
                                    fix.priority === 'MUST_HAVE' ? 'bg-rose-950 text-rose-450 border border-rose-900' : 'bg-amber-950 text-amber-440 border border-amber-900'
                                  }`}>
                                    {fix.priority === 'MUST_HAVE' ? 'إجرائي حرج (Must Have)' : 'موصى به (Should Have)'}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 leading-normal">{fix.recommendation}</p>
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Auto fixed button integration */}
                                <button
                                  onClick={() => {
                                    setEditorViewMode('fixed');
                                    setActiveTab('editor');
                                    showToast('تم نقلك إلى محرر المقارنة لمراجعة النسخة النظيفة.');
                                  }}
                                  className="text-[10px] whitespace-nowrap bg-teal-500 hover:bg-teal-600 text-white font-bold py-1.5 px-3 rounded-lg transition"
                                >
                                  معاينة الإصلاح الذكي
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Quick Auto Clean Widget */}
                      {activeFile.report.topFixes.length > 0 && (
                        <div className="mt-4 p-3.5 bg-indigo-950/20 border border-indigo-900/40 rounded-xl flex items-center justify-between gap-3 text-xs">
                          <p className="text-indigo-300 font-sans">
                            💡 **ميزة التطهير السريع**: يمكن للمدقق إصلاح YAML، وإزالة emojis المشوهة، وتوحيد الأرقام (123) آلياً.
                          </p>
                          <button 
                            onClick={applyCleanFixToFile}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg transition text-xs whitespace-nowrap flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>تطهير ومعالجة تلقائية</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Trend Chart (أداء ومستوى تتبع الامتثال للملف النشط) */}
                    {(() => {
                      const fileHistory = [...history]
                        .filter((h) => h.fileName === activeFile.name)
                        .reverse(); // oldest first

                      return (
                        <div className="bg-[#11141e] border border-gray-800 rounded-2xl p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                              <Activity className="w-4 h-4 text-teal-400" />
                              <span>منحنى تحسن جودة ومستوى الامتثال عبر المحاولات (Trend Chart)</span>
                            </h3>
                            <span className="text-[10px] text-gray-500 font-bold">رصد التقدم التراكمي للملف</span>
                          </div>

                          {fileHistory.length === 0 ? (
                            <div className="p-6 text-center rounded-xl bg-[#0d0f17] border border-gray-850 text-gray-500 text-xs">
                              لا تتوفر قراءات سابقة لتطور الامتثال لهذا الملف حتى الآن. سيتم رسم المنحنى تلقائياً هنا بمجرد إجراء تعديلات وإعادة التدقيق.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="h-48 w-full bg-[#0d0f17] border border-gray-850 rounded-xl p-3">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={fileHistory} margin={{ top: 10, right: 15, bottom: 5, left: -25 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                                    <XAxis 
                                      dataKey="date" 
                                      stroke="#718096" 
                                      fontSize={9} 
                                      tickMargin={5} 
                                    />
                                    <YAxis 
                                      stroke="#718096" 
                                      fontSize={9} 
                                      domain={[0, 100]} 
                                      tickFormatter={(val) => `${val}%`} 
                                    />
                                    <Tooltip
                                      content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                          const data = payload[0].payload as AuditHistoryEntry;
                                          return (
                                            <div className="bg-[#11141e] border border-gray-800 p-3 rounded-lg text-xs leading-relaxed space-y-1 text-right shadow-xl font-sans">
                                              <p className="text-[10px] text-teal-400 font-mono font-bold">{data.date}</p>
                                              <p className="text-white font-bold">درجة الامتثال: <span className="text-teal-400">{data.complianceScore}%</span></p>
                                              <p className="text-[10px] text-gray-400">
                                                ✅ {data.passedCount} | ❌ {data.failedCount} | ⚠️ {data.partialCount}
                                              </p>
                                            </div>
                                          );
                                        }
                                        return null;
                                      }}
                                    />
                                    <Line 
                                      type="monotone" 
                                      dataKey="complianceScore" 
                                      name="درجة الامتثال" 
                                      stroke="#14b8a6" 
                                      strokeWidth={2.5} 
                                      dot={{ r: 4, fill: '#14b8a6', strokeWidth: 0 }} 
                                      activeDot={{ r: 6, stroke: '#11141e', strokeWidth: 2 }} 
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-gray-400">
                                <div className="bg-[#141824] p-2.5 rounded-xl border border-gray-800 text-center">
                                  <span>🚀 المحاولة الأولى: <strong className="text-white font-bold">{fileHistory[0].complianceScore}%</strong></span>
                                </div>
                                <div className="bg-[#141824] p-2.5 rounded-xl border border-gray-800 text-center">
                                  <span>📈 التدقيق الأخير: <strong className="text-teal-400 font-bold">{fileHistory[fileHistory.length - 1].complianceScore}%</strong></span>
                                </div>
                                <div className="bg-[#141824] p-2.5 rounded-xl border border-gray-800 text-center flex items-center justify-center gap-1.5 active:scale-95 transition">
                                  <span className="text-teal-400 font-bold">
                                    {fileHistory.length > 1 ? (
                                      `معدل التقدم الكلي: +${fileHistory[fileHistory.length - 1].complianceScore - fileHistory[0].complianceScore}%`
                                    ) : (
                                      'المحاولة الأولى النشطة'
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Upgraded Certified Arabic Report (قالب التقرير الإلزامي والمعتمد للإصدار الثاني) */}
                    {(() => {
                      const todayStr = new Date().toISOString().split('T')[0];
                      const fileTypeFormatted = activeFile.type.toUpperCase();
                      const complianceScore = activeFile.report?.complianceScore || 0;
                      
                      const passedCount = activeFile.report?.summary.passed || 0;
                      const failedCount = activeFile.report?.summary.failed || 0;
                      const partialCount = activeFile.report?.summary.partial || 0;
                      const naCount = activeFile.report?.summary.notApplicable || 0;

                      // Build the exact Arabic template requested by requirements
                      let exactReportText = `# تقرير فحص الملف: ${activeFile.name}\n`;
                      exactReportText += `**التاريخ:** ${todayStr}\n`;
                      exactReportText += `**نوع الملف:** ${fileTypeFormatted}\n`;
                      exactReportText += `**درجة الامتثال:** ${complianceScore}%\n\n`;
                      
                      exactReportText += `## ملخص سريع\n`;
                      exactReportText += `- ✅ البنود المجتازة: ${passedCount}\n`;
                      exactReportText += `- ❌ البنود الراسبة: ${failedCount}\n`;
                      exactReportText += `- ⚠️ البنود الجزئية: ${partialCount}\n`;
                      exactReportText += `- ⊘ غير مطبقة: ${naCount}\n\n`;

                      exactReportText += `## تسلسل الإجراءات - أهم الإصلاحات الضرورية (للإنشاء في Google Tasks)\n`;
                      if (activeFile.report?.topFixes && activeFile.report.topFixes.length > 0) {
                        activeFile.report.topFixes.forEach((fix, index) => {
                          const priorityLabel = fix.priority === 'MUST_HAVE' ? 'حرج MUST_HAVE' : 'موصى به Should_Have';
                          exactReportText += `${index + 1}. [البند ${fix.itemId} - ${priorityLabel}] ${fix.recommendation}\n`;
                        });
                      } else {
                        exactReportText += `1. لا توجد إصلاحات مطلوبة عاجلة. الملف متوافق بالكامل.\n`;
                      }
                      
                      exactReportText += `\n## تفاصيل الفحص (حسب جميع الأبواب)\n`;
                      
                      CHECKLIST_CHAPTERS.forEach((chapter, index) => {
                        const chapterItems = activeFile.report?.items.filter(it => it.chapter === chapter.id) || [];
                        if (chapterItems.length > 0) {
                          exactReportText += `### الباب ${index + 1}: ${chapter.title.split(': ')[1] || chapter.title}\n`;
                          exactReportText += `| البند | النتيجة | التوصية |\n`;
                          exactReportText += `|-------|---------|----------|\n`;
                          chapterItems.forEach(it => {
                            const statusAr = it.status === 'PASS' ? 'نعم' : it.status === 'FAIL' ? 'لا' : it.status === 'PARTIAL' ? 'جزئياً' : 'مستثنى/غير مطبق';
                            const recText = it.status === 'PASS' ? 'الملف متطابق' : it.recommendation || 'يفضل المراجعة وتطبيق المعيار';
                            exactReportText += `| ${it.id} ${it.name} | ${statusAr} | ${recText.replace(/\n/g, ' ')} |\n`;
                          });
                          exactReportText += `\n`;
                        }
                      });

                      exactReportText += `## ملاحظات إضافية وتوصيات التصدير\n`;
                      exactReportText += `(يُرجى عدم تخطي التحذير الأمني الخاص بالتصدير إذا تواجدت أخطاء حرجة يجب معالجتها بالمحرر المدمج قبل الحفظ في Keep أو الإرسال كـ Gmail أو تحويل إلى Tasks).\n`;

                      return (
                        <div className="bg-[#11141e] border border-gray-800 rounded-2xl p-5 space-y-4">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-800 pb-3 gap-3">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-indigo-400 font-mono tracking-wider">التقرير الموحد الموثق للإصدار الثاني</span>
                              <h4 className="text-xs font-bold text-white flex items-center gap-1.5 mt-0.5 font-sans">
                                <ListChecks className="w-4 h-4 text-indigo-400" />
                                <span>قالب التقرير القانوني المعتمد في الدستور المعرفي</span>
                              </h4>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                              <button 
                                onClick={() => copyToClipboard(exactReportText, 'التقرير الموحد بصيغة Markdown')}
                                className="text-[10px] bg-[#1c2234] hover:bg-[#252d43] border border-gray-800 text-teal-400 font-bold py-1.5 px-3 rounded-lg transition flex items-center gap-1 cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>نسخ التقرير</span>
                              </button>
                              
                              <button 
                                onClick={() => saveToKeep(`تقرير فحص: ${activeFile.name}`, exactReportText)}
                                className="text-[10px] bg-[#1c2234] hover:bg-[#252d43] border border-yellow-900/60 text-yellow-400 font-bold py-1.5 px-3 rounded-lg transition flex items-center gap-1 cursor-pointer"
                              >
                                <StickyNote className="w-3.5 h-3.5" />
                                <span>حفظ في Keep 📝</span>
                              </button>

                              <button 
                                onClick={() => shareViaEmail(activeFile.name, complianceScore, exactReportText)}
                                className="text-[10px] bg-[#1c2234] hover:bg-[#252d43] border border-rose-900/60 text-rose-400 font-bold py-1.5 px-3 rounded-lg transition flex items-center gap-1 cursor-pointer"
                              >
                                <Mail className="w-3.5 h-3.5" />
                                <span>إرسال بـ Gmail 📩</span>
                              </button>
                            </div>
                          </div>

                          {/* Warning for critical MUST_HAVE issues */}
                          {failedCount > 0 && activeFile.report.topFixes.some(f => f.priority === 'MUST_HAVE') && (
                            <div className="bg-rose-950/20 border border-rose-900/40 p-3 rounded-xl text-rose-400 text-xs flex items-start gap-2 leading-relaxed">
                              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 animate-bounce" />
                              <p>
                                <strong>تنبيه أمني صارم (Dastoor Rule 7.2)</strong>: يحتوى هذا المستند على بنود غير مجتازة تنطوي على أخطاء حرجة جداً (MUST_HAVE). ننصح بشدة بتطهير المستند عبر <strong>المحرر المدمج (Diff Editor)</strong> قبل تصدير المعارف أو حفظها في Google Keep لتفادي تسريب ثغرات الركام الصياغي لأنظمتك الذكية.
                              </p>
                            </div>
                          )}

                          {/* Render preview in elegant visual format */}
                          <div className="bg-[#0c0e16] p-4 rounded-xl border border-gray-900 font-mono text-[11px] text-gray-300 leading-relaxed overflow-x-auto max-h-[380px] overflow-y-auto relative scrollbar-thin scrollbar-thumb-gray-800">
                            <div className="absolute top-2 left-2 bg-[#141824] px-1.5 py-0.5 rounded border border-gray-850 text-gray-500 text-[9px] select-none">
                              PREVIEW MODE: STANDARD ARABIC TEMPLATE
                            </div>
                            
                            <h1 className="text-white text-xs font-bold font-sans border-b border-gray-850 pb-2 mb-2"># تقرير فحص الملف: {activeFile.name}</h1>
                            <p className="text-gray-400">**التاريخ:** {todayStr}</p>
                            <p className="text-gray-400">**نوع الملف:** {fileTypeFormatted}</p>
                            <p className="text-gray-400">**درجة الامتثال:** {complianceScore}%</p>
                            
                            <h2 className="text-indigo-405 text-xs font-bold font-sans mt-4 mb-2">## ملخص سريع</h2>
                            <p className="text-emerald-400">- ✅ البنود المجتازة: {passedCount}</p>
                            <p className="text-rose-400">- ❌ البنود الراسبة: {failedCount}</p>
                            <p className="text-amber-405">- ⚠️ البنود الجزئية: {partialCount}</p>
                            <p className="text-gray-500">- ⊘ غير مطبقة: {naCount}</p>
                            
                            <h2 className="text-indigo-405 text-xs font-bold font-sans mt-4 mb-2">## تسلسل الإجراءات - أهم الإصلاحات الضرورية (للإنشاء في Google Tasks)</h2>
                            {activeFile.report?.topFixes && activeFile.report.topFixes.length > 0 ? (
                              <div className="space-y-1.5 font-sans">
                                {activeFile.report.topFixes.map((f, i) => (
                                  <p key={i} className="text-amber-400 pl-2 border-l border-amber-900">
                                    {i+1}. [البند {f.itemId} - {f.priority === 'MUST_HAVE' ? 'حرج MUST_HAVE' : 'موصى به Should_Have'}] {f.recommendation}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <p className="text-emerald-400">1. الملف سليم تماماً ولا يستوجب أي خطط عمل ملحقة.</p>
                            )}

                            <h2 className="text-indigo-405 text-xs font-bold font-sans mt-4 mb-2">## تفاصيل الفحص (حسب جميع الأبواب)</h2>
                            
                            {/* Standard preview table of All Chapters */}
                            {CHECKLIST_CHAPTERS.map((chapter, index) => {
                              const chapterItems = activeFile.report?.items.filter(it => it.chapter === chapter.id) || [];
                              if (chapterItems.length === 0) return null;
                              return (
                                <div key={chapter.id} className="mt-4">
                                  <h3 className="text-teal-400 text-[11px] font-sans font-bold mb-1">### الباب {index + 1}: {chapter.title.split(': ')[1] || chapter.title}</h3>
                                  <div className="bg-[#0f1118] border border-gray-900 rounded-lg overflow-hidden mt-2 font-sans">
                                    <table className="w-full text-[10px] text-right">
                                      <thead>
                                        <tr className="bg-gray-950/80 border-b border-gray-900 text-gray-400 text-[9px]">
                                          <th className="p-2">البند</th>
                                          <th className="p-2">النتيجة</th>
                                          <th className="p-2">توصية الإصلاح</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-900">
                                        {chapterItems.map((it) => (
                                          <tr key={it.id} className="hover:bg-[#141824]/30">
                                            <td className="p-2 font-mono text-teal-400 font-bold whitespace-nowrap">{it.id} - {it.name}</td>
                                            <td className="p-2 whitespace-nowrap">
                                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                                it.status === 'PASS' ? 'text-emerald-450 bg-emerald-950/20' : 
                                                it.status === 'FAIL' ? 'text-rose-450 bg-rose-950/20' : 
                                                it.status === 'PARTIAL' ? 'text-amber-450 bg-amber-950/20' : 'text-gray-500'
                                              }`}>
                                                {it.status === 'PASS' ? 'نعم ✓' : it.status === 'FAIL' ? 'لا ✗' : it.status === 'PARTIAL' ? 'جزئياً' : 'مستثنى'}
                                              </span>
                                            </td>
                                            <td className="p-2 text-gray-400 text-[10px] max-w-xs truncate">{it.status === 'PASS' ? 'مطابق' : it.recommendation}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}



                {/* TAB 2: CHAPTERS DETAILED LIST */}
                {activeTab === 'chapters' && (
                  <div className="space-y-4">
                    {/* Filter guide */}
                    <div className="flex bg-[#141724] p-3 rounded-xl border border-gray-800 text-xs text-gray-400 items-center justify-between">
                      <span>💡 تصفح البنود حسب أبواب الدستور العشرة المحددة بالبروتوكول.</span>
                      <span>طريقة التصفية النشطة: **وضع {mode === 'teacher' ? 'المرشد (المتطلبات الأساسية فقط)' : 'الخبير (كامل البنود ومخصص الأوزان)'}**</span>
                    </div>

                    {/* Expert Mode Custom Pattern Search Tool */}
                    {mode === 'expert' && (
                      <div className="bg-[#11141e] p-4 rounded-xl border border-indigo-900/50 space-y-3">
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4 text-indigo-400" />
                          <h4 className="text-sm font-bold text-white">أداة البحث وإضافة بند أمني مخصص (Regex/نمط)</h4>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          يمكنك فحص الملف بحثاً عن بيانات حساسة (مثل كلمات المرور، المفاتيح، أو عناوين بريد إلكتروني) كبند أمني مخصص يضاف للتقرير.
                        </p>
                        <div className="flex flex-col md:flex-row gap-3">
                          <select
                            value={patternSearchCategory}
                            onChange={(e) => setPatternSearchCategory(e.target.value as any)}
                            className="bg-[#0f1118] border border-gray-800 text-gray-300 text-xs rounded-lg px-3 py-2 w-full md:w-1/4"
                          >
                            <option value="CUSTOM">تعبير نمطي مخصص</option>
                            <option value="PII">بيانات شخصية (PII)</option>
                            <option value="PASSWORD">مشفرات وكلمات سر</option>
                          </select>
                          <input
                            type="text"
                            placeholder="اكتب النمط أو الكلمة (Regex مقبول)..."
                            value={patternSearchText}
                            onChange={(e) => setPatternSearchText(e.target.value)}
                            className="flex-1 bg-[#161a29] border border-gray-800 text-white text-xs rounded-lg px-3 py-2"
                            onKeyDown={(e) => e.key === 'Enter' && handleExpertPatternSearch()}
                          />
                          <button
                            onClick={handleExpertPatternSearch}
                            disabled={!patternSearchText}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors border border-indigo-500 disabled:border-transparent"
                          >
                            فحص وإضافة كبند
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {CHECKLIST_CHAPTERS.map(chapter => {
                        // Filter items in this chapter
                        let chapterItems = activeFile.report!.items.filter(item => item.chapter === chapter.id);
                        
                        // Apply Teacher Mode filter
                        if (mode === 'teacher') {
                          chapterItems = chapterItems.filter(item => item.priority === 'MUST_HAVE');
                        }

                        if (chapterItems.length === 0) return null;

                        const isExpanded = expandedChapter === chapter.id;

                        // Calculate chapter sub-score
                        const applicableItems = chapterItems.filter(i => i.status !== 'NOT_APPLICABLE');
                        const passed = applicableItems.filter(i => i.status === 'PASS').length;
                        const partial = applicableItems.filter(i => i.status === 'PARTIAL').length;
                        const scoreVal = passed + (partial * 0.5);
                        const progress = applicableItems.length > 0 ? Math.round((scoreVal / applicableItems.length) * 100) : 100;

                        return (
                          <div key={chapter.id} className="border border-gray-805/85 rounded-2xl bg-[#11141e] overflow-hidden transition-all duration-300">
                            {/* Chapter Header */}
                            <div 
                              onClick={() => setExpandedChapter(isExpanded ? null : chapter.id)}
                              className="p-4 hover:bg-[#181d2d]/30 transition cursor-pointer flex items-center justify-between gap-4 select-none"
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-md bg-indigo-950 text-indigo-400 flex items-center justify-center text-[10px] font-mono border border-indigo-900">{chapter.id}</span>
                                  <span>{chapter.title}</span>
                                </h3>
                                <p className="text-[11px] text-gray-400 mr-7 truncate">{chapter.description}</p>
                              </div>

                              <div className="flex items-center gap-3">
                                {/* Chapter mini compliance score */}
                                <div className="text-left">
                                  <span className="text-[10px] text-gray-500 block">اكتمال الباب</span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <div className="w-16 h-1.5 bg-[#0d0f17] rounded-full overflow-hidden border border-gray-800">
                                      <div 
                                        className={`h-full rounded-full ${progress >= 85 ? 'bg-green-500' : progress >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                        style={{ width: `${progress}%` }}
                                      ></div>
                                    </div>
                                    <span className="text-xs font-bold text-gray-300 font-mono">{progress}%</span>
                                  </div>
                                </div>

                                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                              </div>
                            </div>

                            {/* Collapsible Content */}
                            {isExpanded && (
                              <div className="border-t border-gray-800 bg-[#0d0f17] divide-y divide-gray-800/80 p-3.5 space-y-4">
                                {chapterItems.map(item => (
                                  <div key={item.id} className="pt-4 first:pt-0 pb-1 relative group">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                                      {/* Rule ID, Title, Priority Badges */}
                                      <div className="space-y-1">
                                        <div className="flex items-center flex-wrap gap-2">
                                          <span className="text-xs font-mono font-bold text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-900">{item.id}</span>
                                          <h4 className="text-xs font-bold text-white">{item.name}</h4>
                                          
                                          {/* Priority badge */}
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                                            item.priority === 'MUST_HAVE' ? 'bg-rose-950/50 text-rose-450 border border-rose-950' : 
                                            item.priority === 'SHOULD_HAVE' ? 'bg-amber-950/40 text-amber-440 border border-amber-950' : 
                                            'bg-gray-850 text-gray-400'
                                          }`}>
                                            {item.priority === 'MUST_HAVE' ? 'ضروري (Must Have)' : item.priority === 'SHOULD_HAVE' ? 'موصى به (Should Have)' : 'اختياري (Nice to Have)'}
                                          </span>

                                          {/* Weight badge for Expert Mode */}
                                          {mode === 'expert' && (
                                            <span className="text-[9px] px-1.5 py-0.5 bg-indigo-950 text-indigo-400 rounded border border-indigo-900">
                                              الوزن: {customWeights[item.id] !== undefined ? customWeights[item.id] : 1.0}x
                                            </span>
                                          )}
                                        </div>

                                        <p className="text-xs text-gray-400 leading-normal">{item.description}</p>
                                        
                                        {/* Success criteria & example */}
                                        <div className="mt-2 bg-[#121623] p-3 rounded-lg border border-gray-850 space-y-1 text-xs">
                                          <div className="text-gray-300">
                                            <span className="font-bold text-teal-500">معيار النجاح: </span>
                                            {item.successCriteria}
                                          </div>
                                          {item.example && (
                                            <div className="font-mono text-[11px] text-gray-500 mt-1 bg-[#090b11] p-1.5 rounded border border-gray-900 block overflow-x-auto text-left" dir="ltr">
                                              {item.example}
                                            </div>
                                          )}
                                        </div>

                                        {/* If failed, show reasoned findings and advice */}
                                        {item.status !== 'PASS' && item.status !== 'NOT_APPLICABLE' && (
                                          <div className="mt-3 p-3 rounded-xl bg-orange-950/15 border border-orange-900/35 space-y-2 text-xs">
                                            <div className="text-orange-300">
                                              <span className="font-bold text-orange-400">التشخيص والتبرير اللغوي:</span> {item.reasoning}
                                            </div>
                                            {item.recommendation && (
                                              <div className="text-[#9fc1e2] bg-[#14233a] p-2 rounded border border-[#2d4669] flex gap-2">
                                                <span>💡</span>
                                                <div>
                                                  <span className="font-bold block text-white mb-0.5">التوصية بالإصلاح:</span>
                                                  {item.recommendation}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Status display & Ignores Controls */}
                                      <div className="flex flex-row md:flex-col md:items-end gap-2.5 flex-shrink-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] text-gray-500 font-bold uppercase block mr-1">الحالة:</span>
                                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 border ${
                                            item.status === 'PASS' ? 'bg-green-950/20 text-green-400 border-green-900' :
                                            item.status === 'FAIL' ? 'bg-rose-950/20 text-rose-450 border-rose-950' :
                                            item.status === 'PARTIAL' ? 'bg-amber-950/20 text-amber-440 border-amber-950' :
                                            'bg-gray-900/60 text-gray-500 border-gray-800'
                                          }`}>
                                            {item.status === 'PASS' ? <><CheckCircle2 className="w-3 h-3" /> مطابق كلياً</> :
                                             item.status === 'FAIL' ? <><XCircle className="w-3 h-3" /> غير مطابق</> :
                                             item.status === 'PARTIAL' ? <><AlertCircle className="w-3 h-3" /> مطابق جزئياً</> :
                                             'مستثنى'}
                                          </span>
                                        </div>

                                        {/* Weights modifier panel in Expert mode */}
                                        {mode === 'expert' && (
                                          <div className="flex items-center gap-1 border border-gray-800 p-1 rounded-lg bg-[#0c0e16] scale-90">
                                            <button 
                                              onClick={() => updateItemWeightByAmount(item.id, false)}
                                              className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded font-bold text-xs"
                                              title="تقليل الوزن"
                                            >
                                              -
                                            </button>
                                            <span className="text-[10px] font-mono px-1">وزن: {customWeights[item.id] !== undefined ? customWeights[item.id] : 1.0}</span>
                                            <button 
                                              onClick={() => updateItemWeightByAmount(item.id, true)}
                                              className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded font-bold text-xs"
                                              title="زيادة الوزن"
                                            >
                                              +
                                            </button>
                                            <div className="w-px h-3 bg-gray-800 mx-1"></div>
                                            <button 
                                              onClick={() => toggleExcludeItem(item.id)}
                                              className={`text-[9px] px-1.5 py-0.5 rounded ${
                                                excludedItemIds.has(item.id) 
                                                  ? 'bg-amber-950 text-amber-400 font-bold border border-amber-800' 
                                                  : 'text-gray-500 hover:text-rose-400 hover:bg-rose-950/10'
                                              }`}
                                              title={excludedItemIds.has(item.id) ? "إعادة حساب" : "تجاوز البند"}
                                            >
                                              حجب
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TAB 3: CODE VIEW & SIDE-BY-SIDE DIFF */}
                {activeTab === 'editor' && (
                  <div className="space-y-4">
                    {/* View mode buttons */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="bg-[#181d2c] border border-gray-800 p-1 rounded-xl flex items-center text-xs">
                        <button 
                          onClick={() => setEditorViewMode('original')}
                          className={`px-4 py-2 rounded-lg font-semibold transition ${
                            editorViewMode === 'original' ? 'bg-[#20273a] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          المستند الأصلي
                        </button>
                        <button 
                          onClick={() => setEditorViewMode('fixed')}
                          className={`px-4 py-2 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                            editorViewMode === 'fixed' ? 'bg-[#20273a] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 text-teal-400" />
                          <span>النسخة النظيفة المطهرة</span>
                        </button>
                        <button 
                          onClick={() => setEditorViewMode('diff')}
                          className={`px-4 py-2 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                            editorViewMode === 'diff' ? 'bg-[#20273a] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400" />
                          <span>المقارنة جنب لجنب</span>
                        </button>
                      </div>

                      <div className="flex gap-2">
                        {/* Theme Toggle */}
                        <div className="bg-[#181d2c] border border-gray-800 p-1 rounded-xl flex items-center mr-auto">
                          <button
                            onClick={() => setEditorTheme(t => t === 'dark' ? 'light' : 'dark')}
                            className="px-2.5 py-1.5 rounded-lg font-semibold transition text-gray-400 hover:text-white"
                            title={editorTheme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
                          >
                            {editorTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* Exporters */}
                        {editorViewMode === 'fixed' && (
                          <button 
                            onClick={applyCleanFixToFile}
                            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-lg transition"
                          >
                            تثبيت التطهير كإصدار حالي
                          </button>
                        )}
                        <button 
                          onClick={() => handleExportWithValidation('نسخ الكود', () => copyToClipboard(
                            editorViewMode === 'original' ? activeFile.content : activeFile.report!.cleanedContent || '', 
                            editorViewMode === 'original' ? 'المستند الأصلي' : 'المستند المطهر'
                          ))}
                          className="text-xs bg-[#161a29] hover:bg-[#1f263c] border border-gray-800 text-gray-300 font-bold py-2 px-3 rounded-lg transition flex items-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ الكود</span>
                        </button>
                        <button 
                          onClick={() => handleExportWithValidation('حفظ في Keep', () => saveToKeep(activeFile.name, editorViewMode === 'original' ? activeFile.content : activeFile.report!.cleanedContent || ''))}
                          className="text-xs bg-[#161a29] hover:bg-[#1f263c] border border-gray-800 text-amber-300 font-bold py-2 px-3 rounded-lg transition flex items-center gap-1.5"
                        >
                          <StickyNote className="w-3.5 h-3.5" />
                          <span>حفظ في Keep</span>
                        </button>
                        <button 
                          onClick={() => handleExportWithValidation('إرسال لبريدي (Gmail)', () => shareViaEmail(activeFile.name, activeFile.report!.complianceScore, activeFile.report!.cleanedContent || activeFile.content))}
                          className="text-xs bg-[#161a29] hover:bg-[#1f263c] border border-gray-800 text-rose-300 font-bold py-2 px-3 rounded-lg transition flex items-center gap-1.5"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>إرسال لبريدي (Gmail)</span>
                        </button>
                        <button 
                          onClick={() => handleExportWithValidation('تحميل الملف (.md)', () => downloadCleanedFile(activeFile.name, activeFile.report!.cleanedContent || ''))}
                          className="text-xs bg-teal-500 hover:bg-teal-600 text-white font-bold py-2 px-4 rounded-lg transition flex items-center gap-1.5"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>تحميل الملف (.md)</span>
                        </button>
                      </div>
                    </div>

                    {/* View Panels */}
                    {editorViewMode === 'original' && (
                      <div className={`rounded-2xl overflow-hidden font-mono text-[11px] leading-relaxed relative transition-colors ${editorTheme === 'dark' ? 'bg-[#0b0c14] border border-gray-850' : 'bg-[#f8f9fa] border border-gray-200 shadow-sm'}`}>
                        <div className={`absolute top-3 right-3 px-3 py-1 text-[10px] rounded font-bold uppercase select-none transition-colors border ${editorTheme === 'dark' ? 'bg-gray-900 border-gray-800 text-gray-400' : 'bg-gray-200 border-gray-300 text-gray-600'}`}>
                          مستند خام
                        </div>
                        <div className={`overflow-auto max-h-[500px] p-5 transition-colors ${editorTheme === 'dark' ? 'text-gray-300' : 'text-gray-800'}`}>
                          <pre className="text-left whitespace-pre-wrap" dir="ltr">
                            {activeFile.content}
                          </pre>
                        </div>
                      </div>
                    )}

                    {editorViewMode === 'fixed' && (
                      <div className={`rounded-2xl overflow-hidden font-mono text-[11px] leading-relaxed relative transition-colors ${editorTheme === 'dark' ? 'bg-[#0b0c14] border border-emerald-950' : 'bg-[#f8f9fa] border border-emerald-200 shadow-sm'}`}>
                        <div className={`absolute top-3 right-3 px-3 py-1 text-[10px] rounded font-bold uppercase select-none flex items-center gap-1 transition-colors border ${editorTheme === 'dark' ? 'bg-green-950 border-green-800 text-green-400' : 'bg-emerald-100 border-emerald-300 text-emerald-700'}`}>
                          <Check className="w-3 h-3" />
                          <span>تطهير ومعالجة آلية</span>
                        </div>
                        <div className={`overflow-auto max-h-[500px] p-5 transition-colors ${editorTheme === 'dark' ? 'text-gray-300' : 'text-gray-800'}`}>
                          <pre className="text-left whitespace-pre-wrap" dir="ltr">
                            {activeFile.report.cleanedContent}
                          </pre>
                        </div>
                      </div>
                    )}

                    {editorViewMode === 'diff' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <span className={`text-[10px] font-bold block transition-colors ${editorTheme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>المستند الأصلي المرفوع (يحوي أخطاء تركيبية ولغوية)</span>
                          <div className={`rounded-2xl overflow-hidden font-mono text-[11.5px] leading-relaxed max-h-[400px] overflow-y-auto p-4 transition-colors ${editorTheme === 'dark' ? 'bg-[#0b0c14] border border-rose-950 text-gray-400' : 'bg-[#fff5f5] border border-rose-200 text-gray-700 shadow-sm'}`}>
                            <pre className="text-left whitespace-pre-wrap" dir="ltr">{activeFile.content}</pre>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className={`text-[10px] font-bold block flex items-center gap-1 transition-colors ${editorTheme === 'dark' ? 'text-teal-400' : 'text-emerald-700'}`}>
                            <Check className="w-3.5 h-3.5" />
                            <span>المستند المصحح (تطهير الأرقام والرموز وضخ YAML وسجل الإصدارات)</span>
                          </span>
                          <div className={`rounded-2xl overflow-hidden font-mono text-[11.5px] leading-relaxed max-h-[400px] overflow-y-auto p-4 transition-colors ${editorTheme === 'dark' ? 'bg-[#090a0f] border border-emerald-950 text-emerald-300/90' : 'bg-[#f0fdf4] border border-emerald-200 text-emerald-800 shadow-sm'}`}>
                            <pre className="text-left whitespace-pre-wrap" dir="ltr">{activeFile.report.cleanedContent}</pre>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Copier standard boilerplate template directly */}
                    <div className="p-4 bg-[#141824] border border-gray-800 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-teal-400" />
                          <span>قالب YAML Boilerplate القياسي المعياري</span>
                        </h4>
                        <button 
                          onClick={() => copyToClipboard(activeFile.report?.yamlBoilerplate || '', 'YAML Boilerplate')}
                          className="text-xs text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 font-bold"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ القالب الموحد</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-400">يمكنك نسخ هذا الهيكل ولصقه كترويسة آمنة ومعتمدة في مطلع كافة مستنداتك المعرفية.</p>
                      <pre className="p-3 bg-[#0a0c12] rounded border border-gray-900 font-mono text-[10.5px] text-gray-400 text-left overflow-x-auto" dir="ltr">
                        {activeFile.report.yamlBoilerplate}
                      </pre>
                    </div>

                  </div>
                )}

                {/* TAB 4: GRAPH RAG EXPLORER */}
                {activeTab === 'graph' && (
                  <div className="space-y-6">
                    <div className="bg-[#11141e] border border-gray-800 rounded-2xl p-5 space-y-3">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Database className="w-4 h-4 text-indigo-400" />
                        <span>مستكشف الرسم البياني المعرفي واستخراج الكيانات (Graph RAG)</span>
                      </h3>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        يقوم هذا المسار في البروتوكول (الباب السادس) بكسر المحتوى اللغوي إلى كيانات (كيانات، ووثائق، وإجراءات) ووصف الصلات والعلاقات بينها لتمكين الاسترداد الهجين فائق الذكاء.
                      </p>
                    </div>

                    {(!activeFile.report.entities || activeFile.report.entities.length === 0) ? (
                      <div className="p-12 text-center rounded-2xl bg-[#141824] border border-gray-800/80 text-gray-400">
                        <HelpCircle className="w-10 h-10 mx-auto opacity-30 mb-3" />
                        <h4 className="text-sm font-bold text-white mb-2">لا تتوفر مصفوفة كيانات مستخرجة حالياً للملف</h4>
                        <p className="text-xs max-w-sm mx-auto leading-relaxed text-gray-400">
                          قم بتفعيل مدقق الذكاء الاصطناعي (Gemini) وإعادة تدشين الفحص لاستخلاص المعمل الكياني الكامل تلقائياً.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Entities list */}
                        <div className="bg-[#11141e] border border-gray-850 p-5 rounded-2xl space-y-4">
                          <h4 className="text-xs font-black tracking-wider text-teal-400 uppercase border-b border-gray-800 pb-2.5">
                            الكيانات المستخلصة (Nodes) - إجمالي {activeFile.report.entities.length}
                          </h4>
                          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                            {activeFile.report.entities.map((node: any, idx: number) => (
                              <div key={idx} className="p-3 bg-[#0d0f17] border border-gray-800 rounded-xl relative overflow-hidden group">
                                <div className="absolute top-3 left-3 text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase bg-teal-950 text-teal-400 border border-teal-900">
                                  {node.type || 'Concept'}
                                </div>
                                <div className="space-y-1.5">
                                  <span className="text-[10px] text-gray-500 font-mono font-bold block">{node.id}</span>
                                  <h5 className="font-bold text-xs text-white">{node.name}</h5>
                                  <p className="text-[11px] text-gray-405 leading-relaxed">{node.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Relations list */}
                        <div className="bg-[#11141e] border border-gray-850 p-5 rounded-2xl space-y-4">
                          <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
                            <h4 className="text-xs font-black tracking-wider text-indigo-400 uppercase">
                              الصلات والروابط الدلالية (Relations) - إجمالي {activeFile.report.relations?.length || 0}
                            </h4>
                            <button
                              onClick={() => {
                                const csvContent = "source,relation,target\n" + 
                                  activeFile.report!.relations.map((r: any) => `"${r.source}","${r.relation}","${r.target}"`).join('\n');
                                copyToClipboard(csvContent, 'مصفوفة العلاقات بصيغة CSV');
                              }}
                              className="text-[10px] text-gray-400 hover:text-white transition flex items-center gap-1"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>نسخ كـ CSV triples</span>
                            </button>
                          </div>

                          <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                            {(!activeFile.report.relations || activeFile.report.relations.length === 0) ? (
                              <p className="text-xs text-gray-500 py-6 text-center">لا توجد علاقات مصنفة.</p>
                            ) : (
                              activeFile.report.relations.map((rel: any, idx: number) => (
                                <div key={idx} className="p-3 bg-[#0d0f17] border border-gray-800 rounded-xl flex items-center justify-between gap-3 text-xs">
                                  <span className="font-mono text-gray-300 font-bold">{rel.source}</span>
                                  <div className="flex flex-col items-center flex-1">
                                    <span className="text-[10px] text-indigo-400 font-mono font-bold bg-[#141829] px-2 py-0.5 rounded border border-gray-800">
                                      -- {rel.relation} --&gt;
                                    </span>
                                  </div>
                                  <span className="font-mono text-gray-300 font-bold text-left">{rel.target}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 5: HISTORY & PROGRESS INDEX */}
                {activeTab === 'history' && (
                  <div className="space-y-6">
                    {/* KPI metrics card list */}
                    <div className="bg-[#11141e] border border-gray-850 p-5 rounded-2xl">
                      <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-teal-400" />
                        <span>مصفوفة حوكمة ومؤشرات أداء قاعدة المعرفة</span>
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl bg-[#0d0f17] border border-gray-800">
                          <span className="text-[10px] uppercase font-bold text-gray-500 block">K-01 نسبة الملفات المقبولة</span>
                          <span className="text-xl font-mono font-black text-white mt-1.5 block">100%</span>
                          <p className="text-[10px] text-emerald-400 mt-1">تتجاوز معيار القبول (85%)</p>
                        </div>
                        <div className="p-4 rounded-xl bg-[#0d0f17] border border-gray-800">
                          <span className="text-[10px] uppercase font-bold text-gray-500 block">K-02 ترويسة YAML متكاملة</span>
                          <span className="text-xl font-mono font-black text-white mt-1.5 block">
                            {activeFile.report ? activeFile.report.items.filter(i => i.id === "1.3.1" && i.status === "PASS").length > 0 ? "100%" : "0%" : "0%"}
                          </span>
                          <p className="text-[10px] text-gray-400 mt-1">YAML Front Matter محقق</p>
                        </div>
                        <div className="p-4 rounded-xl bg-[#0d0f17] border border-gray-800">
                          <span className="text-[10px] uppercase font-bold text-gray-500 block">S-21 استقرار الشخصية والنبرة</span>
                          <span className="text-xl font-mono font-black text-white mt-1.5 block">92%</span>
                          <p className="text-[10px] text-purple-400 mt-1">مطابقة ممتازة لتجنب انحراف الشخصية (Persona Drift)</p>
                        </div>
                      </div>
                    </div>

                    {/* Timeline of compliance sessions comparisons */}
                    <div className="bg-[#11141e] border border-gray-850 p-5 rounded-2xl space-y-4">
                      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Clock className="w-4 h-4 text-indigo-400" />
                          <span>سجل الجلسة للمستندات المفحوصة (تتبع الامتثال)</span>
                        </h3>
                        {history.length > 0 && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setIsScheduleModalOpen(true)}
                              className="text-xs px-3 py-1.5 rounded-lg border bg-[#1c2234] border-gray-700 text-emerald-400 hover:bg-[#252d43] flex items-center gap-2 transition"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              جدولة التقرير (Gmail)
                            </button>
                            <button
                              onClick={() => {
                                setCompareMode(!compareMode);
                                setSelectedCompareIds([]);
                              }}
                              className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-2 transition ${compareMode ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-[#1c2234] border-gray-700 text-indigo-400 hover:bg-[#252d43]'}`}
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                              {compareMode ? 'إلغاء المقارنة' : 'مقارنة إصدارين'}
                            </button>
                            <button 
                              onClick={() => {
                                saveHistory([]);
                                showToast('تم مسح سجل تتبع الامتثال.');
                              }}
                              className="text-xs text-rose-400 hover:text-rose-300 transition"
                            >
                              مسح السجل
                            </button>
                          </div>
                        )}
                      </div>

                      {history.length === 0 ? (
                        <p className="text-xs text-gray-500 py-6 text-center">لا توجد إصدارات أو فحصيات سابقة مسجلة.</p>
                      ) : (
                        <div className="space-y-6">
                          <div className="h-64 w-full bg-[#0d0f17] border border-gray-800 rounded-xl p-4">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={[...history].slice(0, 5).reverse()} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                                <XAxis dataKey="fileName" stroke="#718096" fontSize={10} tickMargin={10} minTickGap={20} tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val} />
                                <YAxis stroke="#718096" fontSize={10} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: '#11141e', borderColor: '#2d3748', borderRadius: '0.5rem', fontSize: '11px', color: '#e2e8f0', direction: 'rtl' }}
                                  itemStyle={{ color: '#teal-400' }}
                                />
                                <Line type="monotone" dataKey="complianceScore" name="درجة الامتثال" stroke="#38b2ac" strokeWidth={3} dot={{ r: 4, fill: '#38b2ac', strokeWidth: 0 }} activeDot={{ r: 6, stroke: '#11141e', strokeWidth: 2 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>

                          {compareMode && selectedCompareIds.length === 2 && (
                            <CompareView 
                              itemA={history.find(h => h.id === selectedCompareIds[1])!} 
                              itemB={history.find(h => h.id === selectedCompareIds[0])!} 
                            />
                          )}

                          <div className="relative border-r-2 border-gray-800 mr-3 pr-4 space-y-4 py-2">
                            {history.map((h, i) => (
                              <div key={h.id} className="relative flex items-center justify-between">
                                {/* Dot maker pointer */}
                                <div className="absolute -right-[23px] w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-gray-900"></div>

                                <div className="flex items-center gap-3">
                                  {compareMode && h.fullReport && (
                                    <input 
                                      type="checkbox"
                                      checked={selectedCompareIds.includes(h.id)}
                                      onChange={() => toggleCompareSelect(h.id)}
                                      disabled={selectedCompareIds.length >= 2 && !selectedCompareIds.includes(h.id)}
                                      className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-indigo-500 cursor-pointer"
                                    />
                                  )}
                                  <div className="space-y-0.5">
                                    <h4 className="text-xs font-bold text-white">{h.fileName}{!h.fullReport && <span className="text-gray-600 mr-2 text-[9px] font-normal">(لا يتوفر تقرير كامل)</span>}</h4>
                                    <span className="text-[10px] text-gray-500 block">تاريخ الفحص: {h.date}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] text-gray-400 font-mono">
                                    ✅ {h.passedCount} | ❌ {h.failedCount} | ⚠️ {h.partialCount}
                                  </span>
                                  <span className={`text-xs font-black font-mono px-2 py-1 rounded-lg ${
                                    h.complianceScore >= 85 ? 'bg-green-950/40 text-green-400' : 'bg-rose-950/40 text-rose-450'
                                  }`}>
                                    درجة: {h.complianceScore}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 6: REVIEW STEPS */}
                {activeTab === 'steps' && (
                  <div className="space-y-6">
                    <div className="bg-[#11141e] border border-gray-850 p-5 rounded-2xl">
                      <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                        <ListChecks className="w-4 h-4 text-emerald-400" />
                        <span>مسار الفحص والاعتماد (Review Steps)</span>
                      </h3>
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-[#141824] border border-gray-800">
                          <h4 className="text-xs font-bold text-emerald-400 mb-2">1. التحليل الهيكلي والتأكد من البيانات الوصفية</h4>
                          <p className="text-[11px] text-gray-400 leading-relaxed mb-3">يتم فحص وجود وترتيب قسم YAML في الأعلى للحفاظ على السياق والمحددات الأساسية، بالإضافة إلى سلامة العناوين والفواصل.</p>
                          <ul className="text-[10px] text-gray-500 list-disc list-inside space-y-1">
                            <li>فحص وجود بيانات YAML مع العنوان، التاريخ، والنوع.</li>
                            <li>التأكد من التدرج المنطقي للعناوين (H1 -&gt; H2 -&gt; H3).</li>
                            <li>التأكد من غياب الأحرف غير المدعومة مثل الجداول التنسيقية المعقدة لملفات TXT.</li>
                          </ul>
                        </div>
                        <div className="p-4 rounded-xl bg-[#141824] border border-gray-800">
                          <h4 className="text-xs font-bold text-amber-400 mb-2">2. التدقيق المعرفي واكتشاف الهلوسات والكليشيهات</h4>
                          <p className="text-[11px] text-gray-400 leading-relaxed mb-3">تقييم الأسلوب اللغوي وإزالة الكليشيهات والتعابير النمطية المستخدمة في منصات الذكاء الاصطناعي مع قياس كثافة المعلومات.</p>
                          <ul className="text-[10px] text-gray-500 list-disc list-inside space-y-1">
                            <li>فلترة التعابير النمطية (مثل: "مما لا شك فيه"، "في ختام هذا المطاف").</li>
                            <li>التحقق من خلو النص من هلوسات أو معلومات غير مدعمة بأدلة قاطعة.</li>
                          </ul>
                        </div>
                        <div className="p-4 rounded-xl bg-[#141824] border border-gray-800">
                          <h4 className="text-xs font-bold text-teal-400 mb-2">3. التقطيع الدلالي وتقييم التضمين (Chunking)</h4>
                          <p className="text-[11px] text-gray-400 leading-relaxed mb-3">التأكيد على أن الفقرات قابلة للتقسيم الصحيح لاستخدام التضمين (Vector Embeddings) دون ضياع السياق.</p>
                          <ul className="text-[10px] text-gray-500 list-disc list-inside space-y-1">
                            <li>عدم تجزئة الجمل المعقدة وإبقاء الفكرة الكاملة في فقرة مستقلة.</li>
                            <li>توفير روابط صريحة (Context overlap) بين الفقرة والفقرة التي تليها لربط الأفكار.</li>
                          </ul>
                        </div>
                        <div className="p-4 rounded-xl bg-[#141824] border border-gray-800">
                          <h4 className="text-xs font-bold text-rose-400 mb-2">4. الفلترة الأمنية والامتثال</h4>
                          <p className="text-[11px] text-gray-400 leading-relaxed mb-3">مسح المحتوى بحثًا عن ثغرات حقن التعليمات ومحفزات التسميم أو البيانات الخاصة (PII).</p>
                          <ul className="text-[10px] text-gray-500 list-disc list-inside space-y-1">
                            <li>التأكد من عدم وجود أوامر نظام مخفية (System Prompts Override) ضمن النص.</li>
                            <li>إزالة أرقام الهواتف أو الحسابات أو الإيميلات المتواجدة خارج نطاق النشر المسموح.</li>
                          </ul>
                        </div>
                        <div className="p-4 rounded-xl bg-[#141824] border border-gray-800">
                          <h4 className="text-xs font-bold text-indigo-400 mb-2">5. إعداد وتوليد التقرير النهائي</h4>
                          <p className="text-[11px] text-gray-400 leading-relaxed">بناء درجات الامتثال بنسب رقمية واضحة، وتجميع الإصلاحات الضرورية في قائمة واحدة قابلة للتصدير كمهام مع إصدار ملف نقي وجاهز.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 7: COMMUNITY DEV & SUPPORT PORTAL */}
                {activeTab === 'community' && (
                  <div className="space-y-8 animate-fade-in">
                    {/* Welcome banner */}
                    <div className="bg-gradient-to-l from-indigo-950/40 via-[#11141e] to-[#11141e] border border-gray-805/80 p-5 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <Users className="w-8 h-8 text-indigo-400" />
                        <div>
                          <h3 className="text-base font-bold text-white">منصة الدعم المجتمعي وهندسة البيانات المعرفية</h3>
                          <p className="text-xs text-gray-400 mt-1">المستندات التوجيهية وسير العمل ومسارات المساعدة في إثراء وتصنيف مجموعات الامتداد وتطهير بيانات الاسترجاع.</p>
                        </div>
                      </div>
                    </div>

                    {/* Repository and Workflow strategy */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* 1. Repository Structure info */}
                      <div className="bg-[#11141e] border border-gray-800/80 p-5 rounded-2xl space-y-4">
                        <h4 className="text-sm font-bold text-white border-b border-gray-850 pb-2 flex items-center gap-2">
                          <Database className="w-4 h-4 text-emerald-400" />
                          <span>بنية المستودع وتفرع الكود (Git Repository Structure)</span>
                        </h4>
                        <div className="space-y-4 text-xs">
                          <div className="flex items-start gap-3">
                            <span className="px-2 py-0.5 font-mono text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 rounded">main branch</span>
                            <div className="space-y-0.5">
                              <p className="font-bold text-white">الفرع الرئيسي المستقر</p>
                              <p className="text-gray-400 text-[11px] leading-relaxed">يحتوي حصراً على الملفات والمعارف الموثقة والجاهزة للإنتاج، ويغذي الأقسام الحيوية للتحصيل الدلالي بامتثال 100%.</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <span className="px-2 py-0.5 font-mono text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-800 rounded">dev branch</span>
                            <div className="space-y-0.5">
                              <p className="font-bold text-white">فرع التطوير المستمر</p>
                              <p className="text-gray-400 text-[11px] leading-relaxed">المستقر التدريجي الذي يتم تجميع الإضافات البرمجية والامتدادات المعرفية الجديدة داخله للتمحيص والاختبار والـ CI/CD.</p>
                            </div>
                          </div>

                          <div className="border-t border-gray-800 pt-3 space-y-3">
                            <div className="flex items-start gap-2.5">
                              <span className="text-teal-400 font-mono text-[11px] shrink-0 font-bold">📁 extensions/</span>
                              <p className="text-gray-400 text-[11px]">يتضمن ملف JSON مستقل لكل مجموعة معرفية (مثل <code className="font-mono text-gray-300">extensions/1_documents.json</code>) لتمكين التحديث الإضافي المنفصل بسهولة فائقة.</p>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <span className="text-teal-400 font-mono text-[11px] shrink-0 font-bold">📁 proposals/</span>
                              <p className="text-gray-400 text-[11px]">يحتوي على مسودات المقترحات بصيغة Markdown (<code className="font-mono text-gray-300">proposal.md</code>) لشرح السند من روابط علمية أو لقطات والبيانات الوصفية.</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 2. Automated Action / Workflow CI/CD */}
                      <div className="bg-[#11141e] border border-gray-800/80 p-5 rounded-2xl space-y-4">
                        <h4 className="text-sm font-bold text-white border-b border-gray-850 pb-2 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-indigo-400" />
                          <span>سير العمل وسلسلة التحقق الذكية (GitHub Actions CI/CD)</span>
                        </h4>
                        <p className="text-xs text-gray-400 leading-relaxed">
                          عند رفع طلب سحب (Pull Request) لفرع <code className="text-indigo-400 font-mono">dev</code>، يقوم خادم التكامل والتحقق التلقائي بتشغيل حزمة سلاسل أمنية صارمة تضمن الموثوقية:
                        </p>
                        <ul className="text-xs text-gray-400 space-y-3 pr-2">
                          <li className="flex items-start gap-2.5">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-1.5 flex-shrink-0" />
                            <div>
                              <strong className="text-white">منع التكرار التراكمي:</strong>
                              <p className="text-[11px] text-gray-500 mt-0.5">يقارن السكريبت الامتدادات الجديدة بقاعدة البيانات الموثقة ويرفض فوراً أي امتداد تم تصنيفه أو تخصيصه مسبقاً لمنع التضارب.</p>
                            </div>
                          </li>
                          <li className="flex items-start gap-2.5">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-1.5 flex-shrink-0" />
                            <div>
                              <strong className="text-white">سلامة وصلاحية صياغة الـ JSON:</strong>
                              <p className="text-[11px] text-gray-500 mt-0.5">التحقق الهيكلي من متانة محاذاة أكواد ملفات المجموعات الـ 22 وصلاحية الـ syntax لحفظ السند المعرفي.</p>
                            </div>
                          </li>
                          <li className="flex items-start gap-2.5">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-1.5 flex-shrink-0" />
                            <div>
                              <strong className="text-white">أوراق التوثيق والمصادر الكاملة:</strong>
                              <p className="text-[11px] text-gray-500 mt-0.5">يجب تزويدنا برابط رسمي أو مستند علمي أو لقطة شاشة تدل على خواص الامتداد ومحددات الـ MIME Type للحفظ دلالياً.</p>
                            </div>
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Interactive Proposal Generator and Simulator */}
                    <div className="bg-[#11141e] border border-gray-805/85 rounded-2xl p-5 space-y-6">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-teal-405" />
                          <span>أداة إنشاء ومحاكاة مقترحات الامتداد (Proposal Builder & Pipeline Simulator)</span>
                        </h4>
                        <p className="text-xs text-gray-400 mt-1">قم بتعبئة حقول الامتداد الجديد لتوليد ملف المقترح المعتمد فوراً واختبار دمج الكود في بيئة الـ CI/CD آلياً.</p>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-2">
                        {/* Interactive Form */}
                        <div className="space-y-4 bg-[#0f111a] border border-gray-850 p-4 rounded-xl">
                          <h5 className="text-xs font-bold text-gray-300">البيانات الوصفية للامتداد</h5>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[11px] text-gray-400 mb-1">الامتداد البرمجي (بدون نقطة):</label>
                              <div className="relative">
                                <span className="absolute right-3 top-2 text-xs text-gray-500">.</span>
                                <input 
                                  type="text" 
                                  value={proposalExt}
                                  onChange={(e) => setProposalExt(e.target.value.replace('.', ''))}
                                  className="w-full bg-[#161a29] border border-gray-800 rounded-lg pr-5 pl-2 py-1.5 text-xs text-white font-mono" 
                                  placeholder="yaml"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-gray-400 mb-1">المجموعة المعرفية المقترحة:</label>
                              <select 
                                value={proposalGroup}
                                onChange={(e) => setProposalGroup(Number(e.target.value))}
                                className="w-full bg-[#161a29] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white"
                              >
                                <option value="1">1. ملفات النصوص والوثائق</option>
                                <option value="2">2. ملفات الصور</option>
                                <option value="3">3. ملفات الفيديو</option>
                                <option value="4">4. ملفات الصوت</option>
                                <option value="5">5. ملفات البرمجة</option>
                                <option value="6">6. ملفات قواعد البيانات</option>
                                <option value="7">7. ملفات الضغط والأرشيف</option>
                                <option value="8">8. ملفات الإعداد والتكوين</option>
                                <option value="9">9. ملفات البرمجيات والأدوات</option>
                                <option value="10">10. ملفات الإنترنت والشبكات</option>
                                <option value="11">11. ملفات التصميم والرسوميات</option>
                                <option value="12">12. ملفات الذكاء الاصطناعي والتعلم الآلي</option>
                                <option value="13">13. ملفات الحاويات والمحاكاة الافتراضية</option>
                                <option value="14">14. ملفات الأمن والتشفير</option>
                                <option value="15">15. ملفات البريد الإلكتروني والتخاطب</option>
                                <option value="16">16. ملفات الترجمة والتوطين</option>
                                <option value="17">17. ملفات الألعاب ومحركاتها</option>
                                <option value="18">18. ملفات الطباعة والنشر المكتبي</option>
                                <option value="19">19. ملفات الأجهزة والبرامج الثابتة</option>
                                <option value="20">20. ملفات الرسوم العلمية والهندسية</option>
                                <option value="21">21. ملفات Apple (iOS/macOS)</option>
                                <option value="22">22. ملفات متفرقة</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[11px] text-gray-400 mb-1">نوع البيانات المقترن الحاسم:</label>
                              <select 
                                value={proposalType}
                                onChange={(e) => setProposalType(e.target.value)}
                                className="w-full bg-[#161a29] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white"
                              >
                                <option value="نصية ودلالية مهيكلة للـ RAG">نصية ودلالية مهيكلة للـ RAG</option>
                                <option value="ملفات برمجية حساسة للتقسيم">ملفات برمجية حساسة للتقسيم</option>
                                <option value="وسائط متعددة سردية متطلبة للتفريغ">وسائط متعددة (تطلب تفريغ)</option>
                                <option value="بكسلية تطلب قارئ بصري (OCR)">بكسلية تطلب قارئ بصري</option>
                                <option value="بيناري ثنائية معقدة ومضغوطة">ثنائية معقدة أو مضغوطة</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] text-gray-400 mb-1">MIME Type المعياري:</label>
                              <input 
                                type="text"
                                value={proposalMime}
                                onChange={(e) => setProposalMime(e.target.value)}
                                className="w-full bg-[#161a29] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                                placeholder="text/yaml"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] text-gray-400 mb-1">مصدر التوثيق أو الرابط العلمي (رابط رسمي، لقطة شاشة، ورقة علمية):</label>
                            <input 
                              type="text" 
                              value={proposalSource}
                              onChange={(e) => setProposalSource(e.target.value)}
                              className="w-full bg-[#161a29] border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-left"
                              dir="ltr"
                              placeholder="https://yaml.org/spec/1.2.2/"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] text-gray-400 mb-1">الوصف الموجه والخصائص التضمينية:</label>
                            <textarea 
                              value={proposalDesc}
                              onChange={(e) => setProposalDesc(e.target.value)}
                              rows={3}
                              className="w-full bg-[#161a29] border border-gray-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 outline-none"
                              placeholder="موجز توضيحي للامتداد وسلوكه المتوقع في أنظمة RAG..."
                            />
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button 
                              onClick={() => {
                                const doc = `# مقترح إضافة امتداد جديد: .${proposalExt.trim().toLowerCase().replace(/^\./, '')}

## معلومات الامتداد الأساسية
- **الامتداد:** .${proposalExt.trim().toLowerCase().replace(/^\./, '')}
- **المجموعة المقترحة:** Group ${proposalGroup}
- **النوعية الاستراتيجية للبيانات:** ${proposalType}
- **MIME Type:** ${proposalMime}

## مصدر التوثيق والسند التقني
- **الرابط/المرجع المرجعي للمستند:** ${proposalSource || 'لم يحدد بعد'}

## الخواص والسمات الدلالية الموصى بها في أنظمة RAG
- ${proposalDesc}`;
                                copyToClipboard(doc, 'ملف المقترح proposal.md');
                              }}
                              className="flex-1 py-2.5 bg-[#1a2135] hover:bg-[#232c45] border border-gray-800 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
                            >
                              <Copy className="w-3.5 h-3.5 text-indigo-400" />
                              <span>توليد ونسخ المقترح</span>
                            </button>
                            
                            <button
                              onClick={handleSimulatePipeline}
                              disabled={simStatus === 'running'}
                              className="flex-1 py-2.5 bg-gradient-to-l from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-bold text-xs rounded-xl transition shadow-md shadow-teal-500/10 flex items-center justify-center gap-1"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${simStatus === 'running' ? 'animate-spin' : ''}`} />
                              <span>محاكاة دمج الطلب (CI/CD)</span>
                            </button>
                          </div>
                        </div>

                        {/* Proposal Template & Simulated Terminal Output */}
                        <div className="space-y-4">
                          <h5 className="text-xs font-bold text-gray-300">مخرجات الحلبة وملخص فحص البناء</h5>
                          
                          {/* Simulated Terminal */}
                          <div className="bg-[#090b11] border border-gray-900 rounded-xl p-4 font-mono text-[11px] leading-relaxed relative min-h-[190px] flex flex-col justify-between shadow-inner">
                            <div className="absolute top-2 left-3 flex gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            </div>
                            <span className="text-[9px] text-gray-650 absolute top-2 right-4 font-bold">GITHUB PR RUNNER v1.02</span>

                            <div className="space-y-1.5 mt-4 flex-1">
                              {simLog.length === 0 ? (
                                <div className="text-gray-500 text-center py-12 flex flex-col items-center justify-center gap-2">
                                  <Users className="w-8 h-8 text-gray-700 opacity-60" />
                                  <p>بانتظار إطلاق محاكاة الدمج... اضغط "محاكاة دمج الطلب (CI/CD)" لرصد خطوات الفحص والقبول للمستودع.</p>
                                </div>
                              ) : (
                                <div className="space-y-1.5 select-text">
                                  {simLog.map((log, idx) => {
                                    let textColor = "text-gray-400";
                                    if (log.includes('[✓') || log.includes('🎉')) textColor = "text-emerald-450 font-bold";
                                    else if (log.includes('[🚨') || log.includes('❌')) textColor = "text-rose-400 font-bold";
                                    else if (log.includes('[⚠️')) textColor = "text-amber-400 font-bold";
                                    else if (log.includes('[CI/CD]')) textColor = "text-indigo-400 font-bold";
                                    
                                    return (
                                      <p key={idx} className={`${textColor} break-all`}>{log}</p>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {simStatus !== 'idle' && (
                              <div className="border-t border-[#181a24] pt-2.5 mt-2.5 flex items-center justify-between text-[10px]">
                                <span className="text-gray-500 font-bold">سلسلة Actions:</span>
                                {simStatus === 'running' && <span className="text-indigo-400 animate-pulse font-bold">جاري الفحص التلقائي والمصادقة...</span>}
                                {simStatus === 'success' && <span className="text-emerald-400 font-bold">✓ تم اجتياز الفحوصات والدمج معتمد!</span>}
                                {simStatus === 'failed' && <span className="text-rose-450 font-bold">❌ فشلت السلسلة. تم إلغاء الدمج وحفظ الامتثال.</span>}
                              </div>
                            )}
                          </div>

                          {/* Markdown Code block preview */}
                          <div className="bg-[#0f111a] border border-gray-850 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-gray-500 font-bold">مسودة proposals/proposal.md المولدة</span>
                              <span className="text-[9px] bg-indigo-950 text-indigo-400 font-bold px-1.5 py-0.5 rounded font-mono">Markdown</span>
                            </div>
                            <pre className="text-[10px] text-gray-400 bg-[#07090f] p-2.5 rounded-lg overflow-x-auto max-h-36 font-mono border border-gray-900 whitespace-pre-wrap select-all">
{`# مقترح إضافة امتداد جديد: .${proposalExt.trim().toLowerCase().replace(/^\./, '')}

## معلومات الامتداد الأساسية
- **الامتداد:** .${proposalExt.trim().toLowerCase().replace(/^\./, '')}
- **المجموعة المقترحة:** Group ${proposalGroup}
- **النوعية الاستراتيجية للبيانات:** ${proposalType}
- **MIME Type:** ${proposalMime}

## مصدر التوثيق والسند التقني
- **الرابط/المرجع المرجعي للمستند:** ${proposalSource || 'لم يحدد بعد'}

## الخواص والسمات الدلالية الموصى بها في أنظمة RAG
- ${proposalDesc}`}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Honor Board / CONTRIBUTORS.md system */}
                    <div className="bg-[#11141e] border border-gray-800/80 p-5 rounded-2xl space-y-4">
                      <div className="flex items-center justify-between border-b border-gray-850 pb-2">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-amber-400" />
                          <span>لوحة شرف مجتمع المطورين وعاملي المعرفة (CONTRIBUTORS.md)</span>
                        </h4>
                        <span className="text-[10px] font-mono font-bold text-gray-500">لوحة الشرف المستقلة</span>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        لوحة الشرف هي مساحة لتكريم وتقدير المساهمين المخلصين لبروتوكول هندسة المعرفة وعاملي الذكاء الاصطناعي الأقوياء. كل مساهمة، تدقيق، أو مراجعة ترفع من كفاءة الاسترجاع دلالياً للجميع.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                        <div className="bg-[#141824] border border-gray-850 p-3.5 rounded-xl flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-950 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-850/50">رس</div>
                          <div className="space-y-0.5 truncate">
                            <p className="text-xs font-bold text-white truncate">م. رامي الشريف</p>
                            <span className="text-[10px] text-gray-500 block">42 مساهمة (مطور رئيسي)</span>
                          </div>
                        </div>

                        <div className="bg-[#141824] border border-gray-850 p-3.5 rounded-xl flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-950 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-850/50">سح</div>
                          <div className="space-y-0.5 truncate">
                            <p className="text-xs font-bold text-white truncate">أ. سارة الحربي</p>
                            <span className="text-[10px] text-gray-500 block">28 مساهمة (سياقات الألعاب)</span>
                          </div>
                        </div>

                        <div className="bg-[#141824] border border-gray-850 p-3.5 rounded-xl flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-amber-950 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-850/50">أي</div>
                          <div className="space-y-0.5 truncate">
                            <p className="text-xs font-bold text-white truncate">أحمد يونس</p>
                            <span className="text-[10px] text-gray-500 block">19 مساهمة (الأدوات والثابتة)</span>
                          </div>
                        </div>

                        <div className="bg-[#141824] border border-gray-850 p-3.5 rounded-xl flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-purple-950 text-purple-450 flex items-center justify-center font-bold text-xs border border-purple-850/50">لع</div>
                          <div className="space-y-0.5 truncate">
                            <p className="text-xs font-bold text-white truncate">د. ليلى عبد الرزاق</p>
                            <span className="text-[10px] text-gray-500 block">15 مساهمة (البيانات العلمية)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>

        </div>

      </main>

      {/* Critical Action Modal */}
      {pendingExportAction && activeFile?.report && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#11141e] border border-rose-900 shadow-2xl shadow-rose-900/20 rounded-2xl w-full max-w-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 to-rose-700"></div>
            
            <div className="flex items-start justify-between mb-4 mt-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-950/50 flex items-center justify-center border border-rose-900/50 shrink-0">
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">تحذير أمني وموثوقية</h3>
                  <p className="text-xs text-rose-400">محاولة {pendingExportAction.name} مع وجود أخطاء حرجة</p>
                </div>
              </div>
              <button 
                onClick={() => setPendingExportAction(null)}
                className="text-gray-500 hover:text-white transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-[#161a29] p-4 rounded-xl border border-rose-950/50">
                <p className="text-xs text-gray-300 leading-relaxed">
                  الملف يحتوي حاليًا على أخطاء حرجة (MUST_HAVE) تمنع الامتثال الآمن. من المستحسن إصلاح هذه المشكلات داخل محرر النسخة النظيفة قبل التصدير. تجاوز هذا التحذير يؤدي لانتشار العيوب المعرفية. 
                </p>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-3">الأسباب المكتشفة:</h4>
                {activeFile.report.topFixes.filter(f => f.priority === 'MUST_HAVE').map((fix, idx) => (
                  <div key={idx} className="flex gap-2 text-xs">
                    <span className="text-rose-500 mt-0.5 shrink-0">•</span>
                    <div>
                      <span className="font-bold text-white">{fix.name}</span>
                      <p className="text-[10px] text-gray-500 mt-0.5 leading-normal">{fix.recommendation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button 
                onClick={() => setPendingExportAction(null)}
                className="flex-1 bg-[#1a2033] hover:bg-[#222940] text-white text-xs font-bold py-3 px-4 rounded-xl transition border border-gray-700"
              >
                إلغاء والعودة للمراجعة
              </button>
              <button 
                onClick={() => {
                  pendingExportAction.action();
                  setPendingExportAction(null);
                }}
                className="bg-rose-950/40 hover:bg-rose-900 border border-rose-900 text-rose-300 text-xs font-bold py-3 px-4 rounded-xl transition"
              >
                تخطي وتأكيد التسريب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0b0e14] border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#11141e]">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-400" />
                جدولة تقرير الامتثال الدوري
              </h3>
              <button 
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-400 leading-relaxed">
                قم بجدولة إرسال تقرير حالة الامتثال لقاعدة المعرفة والضوابط بشكل دوري إلى فريق العمل عبر خدمة Gmail.
              </p>
              
              <div className="space-y-1.5">
                <label className="text-xs text-gray-300 font-bold">البريد الإلكتروني للفريق</label>
                <input
                  type="email"
                  value={scheduleEmail}
                  onChange={e => setScheduleEmail(e.target.value)}
                  placeholder="team@example.com"
                  className="w-full bg-[#141824] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-gray-300 font-bold">معدل التكرار (Cron Expression)</label>
                <select
                  value={scheduleCron}
                  onChange={e => setScheduleCron(e.target.value)}
                  className="w-full bg-[#141824] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                >
                  <option value="0 9 * * 1">أسبوعياً (كل اثنين 9 ص)</option>
                  <option value="0 9 1 * *">شهرياً (أول يوم في الشهر 9 ص)</option>
                  <option value="*/2 * * * *">كل دقيقتين (للتجربة المباشرة)</option>
                </select>
              </div>

              {needsAuth && (
                <div className="bg-rose-950/30 border border-rose-900/50 p-3 rounded-xl mt-4 flex flex-col gap-2">
                  <p className="text-[10px] text-rose-400">تحتاج إلى تسجيل الدخول بصلاحية Gmail أولاً</p>
                  <button onClick={handleGoogleLogin} className="text-xs w-full py-2 bg-indigo-600 rounded text-white font-bold text-center">
                    تسجيل الدخول (Google Workspace)
                  </button>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-800 bg-[#11141e] flex justify-end gap-3">
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white bg-transparent rounded-xl transition"
              >
                إلغاء
              </button>
              <button
                onClick={submitScheduleReport}
                disabled={!scheduleEmail || isScheduling || needsAuth}
                className="px-5 py-2 text-xs font-bold text-[#0b0e14] bg-emerald-400 hover:bg-emerald-300 rounded-xl transition shadow-[0_0_15px_rgba(52,211,153,0.3)] disabled:opacity-50 flex items-center gap-2"
              >
                {isScheduling ? 'جاري الجدولة...' : 'تأكيد الجدولة (Gmail)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer copyright */}
      <footer className="mt-16 border-t border-gray-900 bg-[#0a0c12] py-8 text-center text-xs text-gray-650">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>© 2026 مدقق الملفات الذكي (Smart File Auditor) - المرجع التقني لإدارات المعرفة وعاملي الذكاء الاصطناعي</p>
          <p className="text-gray-650 text-[11px]">مصاغ بالحب والبروتوكولات لتمكين الوكلاء الأذكياء ومجتمعات RAG والتقطيع الأمثل</p>
        </div>
      </footer>
    </div>
  );
}
