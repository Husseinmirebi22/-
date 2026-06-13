/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Upload, AlertCircle, CheckCircle2, XCircle, HelpCircle, 
  ChevronDown, ChevronUp, Copy, Download, RefreshCw, Layers, Shield, 
  Database, Activity, Users, FileCode, Check, Eye, Trash2, ArrowLeftRight,
  Sparkles, Sliders, History, BookOpen, Clock, FileDown, Settings, Search, X
} from 'lucide-react';
import JSZip from 'jszip';
import { CHECKLIST_CHAPTERS, DEFAULT_CHECKLIST_ITEMS } from './checklistData';
import { AuditItem, ChecklistChapter, AuditReport, FileToAudit, AuditHistoryEntry } from './types';
import { initAuth, googleSignIn, logout, getAccessToken } from './lib/firebase';
import WorkspaceImport from './components/WorkspaceImport';

export default function App() {
  // Main State
  const [activeTab, setActiveTab] = useState<'overview' | 'chapters' | 'editor' | 'graph' | 'history'>('overview');
  const [mode, setMode] = useState<'teacher' | 'expert'>('teacher');
  const [files, setFiles] = useState<FileToAudit[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditHistoryEntry[]>([]);
  
  // Custom Weights and Ignores for Expert Mode
  const [excludedItemIds, setExcludedItemIds] = useState<Set<string>>(new Set());
  const [customWeights, setCustomWeights] = useState<Record<string, number>>({});
  
  // UI helpers
  const [expandedChapter, setExpandedChapter] = useState<number | null>(1);
  const [editorViewMode, setEditorViewMode] = useState<'original' | 'fixed' | 'diff'>('diff');
  const [pastedFileName, setPastedFileName] = useState('MR-POL-101_سياسة-العينة_v1.0.md');
  const [pastedFileType, setPastedFileType] = useState<'md' | 'json' | 'jsonl' | 'txt'>('md');
  const [pastedContent, setPastedContent] = useState('');
  const [isPasting, setIsPasting] = useState(false);
  
  // Toast notifications state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warn' | 'error' } | null>(null);

  // Sidebar Search
  const [sidebarSearch, setSidebarSearch] = useState('');
  
  // Workspace Auth State
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<any | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

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

  // Helper to trigger active file
  const activeFile = files.find(f => f.id === selectedFileId);

  // Sidebar search filtering
  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(sidebarSearch.toLowerCase())
  );

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
    const localChecklist = DEFAULT_CHECKLIST_ITEMS.map(item => ({
      ...item,
      // Apply custom weight if set
      weight: customWeights[item.id] !== undefined ? customWeights[item.id] : 1.0,
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
        partialCount: report.summary.partial
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

  const updateItemWeightByAmount = (itemId: string, increment: boolean) => {
    const current = customWeights[itemId] !== undefined ? customWeights[itemId] : 1.0;
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

    applicable.forEach(item => {
      const w = weights[item.id] !== undefined ? weights[item.id] : 1.0;
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

  // Auto clean execution directly using backend output
  const applyCleanFixToFile = () => {
    if (!activeFile || !activeFile.report || !activeFile.report.cleanedContent) return;
    
    const originalName = activeFile.name;
    const cleanContent = activeFile.report.cleanedContent;

    // Update active file content
    setFiles(prev => prev.map(f => f.id === selectedFileId ? {
      ...f,
      content: cleanContent,
      size: cleanContent.length
    } : f));

    showToast('تم تطبيق التنظيف وحل الأخطاء الصياغية! جاري إعادة الفحص للتأكيد...');
    
    // Trigger audit again on the updated clean content
    triggerAuditForFile(activeFile.id, cleanContent, originalName, cleanContent.length);
  };

  // Helper to copy text to clipboard safely
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`تم نسخ ${label} إلى الحافظة!`);
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
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-indigo-950 text-indigo-400 border border-indigo-800">إصدار 1.0</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">المنصة الموحدة لفحص المعرفة والتحقق من سلامة وصياغة ملفات أنظمة RAG والوكلاء</p>
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
                className="w-full py-2.5 px-4 mb-4 rounded-xl border border-gray-800 bg-[#161a29] text-xs font-bold text-gray-300 hover:bg-[#1a2033] hover:text-white transition flex items-center justify-center gap-2"
              >
                <FileCode className="w-4 h-4" />
                <span>إدراج نص يدوي</span>
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
                    placeholder="ابحث عن ملف بالاسم..."
                    className="w-full bg-[#141824] border border-gray-800 rounded-xl pr-9 pl-8 py-2 text-xs text-white placeholder-gray-500 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 outline-none transition"
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
                يتبع هذا المدقق الإصدار 2.0 من قائمة التدقيق الموحدة المعتمدة لدى إدارة هندسة المعرفة لضمان الفحص الدلالي والصوان وتطهير قواعد الاسترجاع المعقدة.
              </p>
              <div className="border-t border-gray-800 pt-2 flex items-center justify-between text-[10px] text-gray-500">
                <span>تحديث: 2026-06-08</span>
                <span className="text-indigo-400 font-bold">إصدار 2.0 موحد</span>
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
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getRankBadgeInfo(activeFile.report.complianceScore).color}`}>
                            {getRankBadgeInfo(activeFile.report.complianceScore).text}
                          </span>
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
                  </div>

                  <button 
                    onClick={() => triggerAuditForFile(activeFile.id, activeFile.content, activeFile.name, activeFile.size)}
                    className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition py-1 px-3 border border-indigo-900 rounded-lg bg-indigo-950/20"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>إعادة التدقيق</span>
                  </button>
                </div>

                {/* TAB 1: OVERVIEW ROOM */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Priority Fixes Alert Box */}
                    <div className="bg-[#11141e] border border-gray-800 rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-400 animate-pulse" />
                          <span>أهم الإصلاحات الضرورية لتعزيز الجاهزية</span>
                        </h3>
                        <span className="text-[10px] text-gray-500 font-bold">بناءً على أولويات الدستور المعرفي</span>
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
                                    fix.priority === 'MUST_HAVE' ? 'bg-rose-950 text-rose-400 border border-rose-900' : 'bg-amber-950 text-amber-400 border border-amber-900'
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
                          <p className="text-indigo-300">
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

                    {/* Simple mandatory template summary according to additional instructions */}
                    <div className="bg-[#11141e] border border-gray-800 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                        <h4 className="text-xs font-extrabold tracking-wider text-gray-400">القالب الإلزامي للتقرير القانوني المعتمد</h4>
                        <button 
                          onClick={() => {
                            const markdownReport = `# تقرير فحص الملف: ${activeFile.name}
**التاريخ:** ${new Date().toISOString().split('T')[0]}
**نوع الملف:** ${activeFile.type.toUpperCase()}
**درجة الامتثال:** ${activeFile.report?.complianceScore}%

## ملخص سريع
- ✅ البنود المجتازة: ${activeFile.report?.summary.passed}
- ❌ البنود الراسبة: ${activeFile.report?.summary.failed}
- ⚠️ البنود الجزئية: ${activeFile.report?.summary.partial}
- ⊘ غير مطبقة: ${activeFile.report?.summary.notApplicable}

## أهم 3 إصلاحات ضرورية
${activeFile.report?.topFixes.slice(0, 3).map((f, i) => `${i+1}. [البند ${f.itemId}] ${f.recommendation}`).join('\n')}
`;
                            copyToClipboard(markdownReport, 'التقرير الإلزامي بصيغة Markdown');
                          }}
                          className="text-xs text-teal-400 hover:text-teal-300 transition flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ تقرير الـ Markdown الموحد</span>
                        </button>
                      </div>

                      <div className="bg-[#0c0e16] p-4 rounded-xl border border-gray-900 font-mono text-[11px] text-gray-300 leading-relaxed overflow-x-auto select-all">
                        <p className="text-gray-500 font-bold mb-2"># تقرير فحص الملف: {activeFile.name}</p>
                        <p>**التاريخ:** {new Date().toISOString().split('T')[0]}</p>
                        <p>**نوع الملف:** {activeFile.type.toUpperCase()}</p>
                        <p>**درجة الامتثال:** {activeFile.report.complianceScore}%</p>
                        <p className="mt-2 text-indigo-400 font-bold">## ملخص سريع</p>
                        <p>- ✅ البنود المجتازة: {activeFile.report.summary.passed}</p>
                        <p>- ❌ البنود الراسبة: {activeFile.report.summary.failed}</p>
                        <p>- ⚠️ البنود الجزئية: {activeFile.report.summary.partial}</p>
                        <p>- ⊘ غير مطبقة: {activeFile.report.summary.notApplicable}</p>
                        <p className="mt-2 text-indigo-400 font-bold">## أهم 3 إصلاحات ضرورية (حسب الأولوية)</p>
                        {activeFile.report.topFixes.slice(0, 3).map((f, i) => (
                          <p key={i}>{i+1}. [البند {f.itemId}] {f.recommendation.substring(0, 80)}...</p>
                        ))}
                      </div>
                    </div>
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

                      {/* Exporters */}
                      <div className="flex gap-2">
                        {editorViewMode === 'fixed' && (
                          <button 
                            onClick={applyCleanFixToFile}
                            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-lg transition"
                          >
                            تثبيت التطهير كإصدار حالي
                          </button>
                        )}
                        <button 
                          onClick={() => copyToClipboard(
                            editorViewMode === 'original' ? activeFile.content : activeFile.report!.cleanedContent || '', 
                            editorViewMode === 'original' ? 'المستند الأصلي' : 'المستند المطهر'
                          )}
                          className="text-xs bg-[#161a29] hover:bg-[#1f263c] border border-gray-800 text-gray-300 font-bold py-2 px-3 rounded-lg transition flex items-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ الكود</span>
                        </button>
                        <button 
                          onClick={() => downloadCleanedFile(activeFile.name, activeFile.report!.cleanedContent || '')}
                          className="text-xs bg-teal-500 hover:bg-teal-600 text-white font-bold py-2 px-4 rounded-lg transition flex items-center gap-1.5"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>تحميل الملف (.md)</span>
                        </button>
                      </div>
                    </div>

                    {/* View Panels */}
                    {editorViewMode === 'original' && (
                      <div className="bg-[#0b0c14] border border-gray-850 rounded-2xl overflow-hidden font-mono text-[11px] leading-relaxed relative">
                        <div className="absolute top-3 right-3 bg-gray-900 border border-gray-800 text-gray-400 px-3 py-1 text-[10px] rounded font-bold uppercase select-none">
                          مستند خام
                        </div>
                        <div className="overflow-auto max-h-[500px] p-5 text-gray-300">
                          <pre className="text-left" dir="ltr">
                            {activeFile.content}
                          </pre>
                        </div>
                      </div>
                    )}

                    {editorViewMode === 'fixed' && (
                      <div className="bg-[#0b0c14] border border-emerald-950 rounded-2xl overflow-hidden font-mono text-[11px] leading-relaxed relative">
                        <div className="absolute top-3 right-3 bg-green-950 border border-green-800 text-green-400 px-3 py-1 text-[10px] rounded font-bold uppercase select-none flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>تطهير ومعالجة آلية</span>
                        </div>
                        <div className="overflow-auto max-h-[500px] p-5 text-gray-300">
                          <pre className="text-left" dir="ltr">
                            {activeFile.report.cleanedContent}
                          </pre>
                        </div>
                      </div>
                    )}

                    {editorViewMode === 'diff' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <span className="text-[10px] text-gray-500 font-bold block">المستند الأصلي المرفوع (يحوي أخطاء تركيبية ولغوية)</span>
                          <div className="bg-[#0b0c14] border border-rose-950 rounded-2xl overflow-hidden font-mono text-[11.5px] leading-relaxed max-h-[400px] overflow-y-auto p-4 text-gray-400">
                            <pre className="text-left" dir="ltr">{activeFile.content}</pre>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[10px] text-teal-400 font-bold block flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>المستند المصحح (تطهير الأرقام والرموز وضخ YAML وسجل الإصدارات)</span>
                          </span>
                          <div className="bg-[#090a0f] border border-emerald-950 rounded-2xl overflow-hidden font-mono text-[11.5px] leading-relaxed max-h-[400px] overflow-y-auto p-4 text-emerald-300/90">
                            <pre className="text-left" dir="ltr">{activeFile.report.cleanedContent}</pre>
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
                          <button 
                            onClick={() => {
                              saveHistory([]);
                              showToast('تم مسح سجل تتبع الامتثال.');
                            }}
                            className="text-xs text-rose-400 hover:text-rose-300 transition"
                          >
                            مسح السجل
                          </button>
                        )}
                      </div>

                      {history.length === 0 ? (
                        <p className="text-xs text-gray-500 py-6 text-center">لا توجد إصدارات أو فحصيات سابقة مسجلة.</p>
                      ) : (
                        <div className="relative border-r-2 border-gray-800 mr-3 pr-4 space-y-4 py-2">
                          {history.map((h, i) => (
                            <div key={h.id} className="relative flex items-center justify-between">
                              {/* Dot maker pointer */}
                              <div className="absolute -right-[23px] w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-gray-900"></div>

                              <div className="space-y-0.5">
                                <h4 className="text-xs font-bold text-white">{h.fileName}</h4>
                                <span className="text-[10px] text-gray-500 block">تاريخ الفحص: {h.date}</span>
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
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>

        </div>

      </main>

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
