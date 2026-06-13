import React, { useState } from 'react';
import { Download, FileText, CheckCircle2, ChevronRight, RefreshCw, Layers } from 'lucide-react';
import { getAccessToken } from '../lib/firebase';
import { FileToAudit } from '../types';

export default function WorkspaceImport({ 
  onFilesImported 
}: { 
  onFilesImported: (files: FileToAudit[]) => void 
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFromDrive = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Fetch recent text/md/json files from Google Drive
      const res = await fetch("https://www.googleapis.com/drive/v3/files?q=mimeType='text/plain' or mimeType='application/json'&orderBy=modifiedTime desc&pageSize=5&fields=files(id,name,mimeType)", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch from Drive');
      const data = await res.json();
      
      const newFiles: FileToAudit[] = [];
      for (const file of data.files || []) {
        // Fetch content for each file
        const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (contentRes.ok) {
          const content = await contentRes.text();
          let ext = 'txt';
          if (file.name.endsWith('.md')) ext = 'md';
          else if (file.name.endsWith('.json')) ext = 'json';
          else if (file.name.endsWith('.jsonl')) ext = 'jsonl';

          newFiles.push({
            id: file.id,
            name: `Drive: ${file.name}`,
            content,
            size: content.length,
            type: ext as any
          });
        }
      }
      
      if (newFiles.length > 0) {
        onFilesImported(newFiles);
      } else {
        setError('لم يتم العثور على ملفات نصية متوافقة في حساب Drive الخاص بك.');
      }
    } catch (err: any) {
      console.error(err);
      setError('حدث خطأ أثناء الاتصال بـ Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  const importFromDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // 1. First get latest docs using Drive API
      const res = await fetch("https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document'&orderBy=modifiedTime desc&pageSize=3&fields=files(id,name)", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch docs list');
      const data = await res.json();

      const newFiles: FileToAudit[] = [];
      for (const doc of data.files || []) {
        // 2. Export Google Doc to plain text
        const exportRes = await fetch(`https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=text/plain`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (exportRes.ok) {
          const content = await exportRes.text();
          newFiles.push({
            id: doc.id,
            name: `Docs: ${doc.name}.txt`,
            content,
            size: content.length,
            type: 'txt'
          });
        }
      }
      
      if (newFiles.length > 0) {
        onFilesImported(newFiles);
      } else {
        setError('لا توجد مستندات Google حديثة.');
      }
    } catch (err: any) {
      console.error(err);
      setError('حدث خطأ أثناء استيراد المستندات.');
    } finally {
      setLoading(false);
    }
  };

  const importFromSheets = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch("https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name)", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch spreadsheet list');
      const data = await res.json();

      const newFiles: FileToAudit[] = [];
      for (const sheet of data.files || []) {
        // Export to CSV
        const exportRes = await fetch(`https://www.googleapis.com/drive/v3/files/${sheet.id}/export?mimeType=text/csv`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (exportRes.ok) {
          const content = await exportRes.text();
          newFiles.push({
            id: sheet.id,
            name: `Sheets: ${sheet.name}.csv`,
            content,
            size: content.length,
            type: 'txt'
          });
        }
      }
      
      if (newFiles.length > 0) {
        onFilesImported(newFiles);
      } else {
        setError('لا توجد جداول بيانات قريبة.');
      }
    } catch (err: any) {
      console.error(err);
      setError('حدث خطأ أثناء استيراد جداول البيانات.');
    } finally {
      setLoading(false);
    }
  };

  const importFromGmail = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Fetch recent messages
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch emails');
      const data = await res.json();

      const newFiles: FileToAudit[] = [];
      for (const msg of data.messages || []) {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const subjectHeader = msgData.payload.headers.find((h: any) => h.name === 'Subject');
          const subject = subjectHeader ? subjectHeader.value : 'Email No Subject';
          
          let content = msgData.snippet;
          // Try to decode basic body
          if (msgData.payload.parts) {
            const txtPart = msgData.payload.parts.find((p: any) => p.mimeType === 'text/plain');
            if (txtPart && txtPart.body && txtPart.body.data) {
              content = atob(txtPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            }
          } else if (msgData.payload.body && msgData.payload.body.data) {
             content = atob(msgData.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          }

          newFiles.push({
            id: msg.id,
            name: `Gmail: ${subject}.txt`,
            content,
            size: content.length,
            type: 'txt'
          });
        }
      }
      
      if (newFiles.length > 0) {
        onFilesImported(newFiles);
      } else {
        setError('لا توجد رسائل بريد إلكتروني حديثة.');
      }
    } catch (err: any) {
      console.error(err);
      setError('حدث خطأ أثناء استيراد البريد. تأكد من الأذونات.');
    } finally {
      setLoading(false);
    }
  };

  const importFromChat = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Using Google Chat APIs
      const res = await fetch("https://chat.googleapis.com/v1/spaces", {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error('Failed to fetch chat spaces');
      const data = await res.json();
      
      const newFiles: FileToAudit[] = [];
      for (const space of (data.spaces || []).slice(0, 1)) {
        const msgRes = await fetch(`https://chat.googleapis.com/v1/${space.name}/messages?pageSize=20`, {
           headers: { Authorization: `Bearer ${token}` }
        });
        if (msgRes.ok) {
           const msgData = await msgRes.json();
           const msgs = (msgData.messages || []).map((m: any) => `[${m.createTime}] ${m.sender?.displayName || 'User'}: ${m.text}`).join('\n');
           if (msgs) {
             newFiles.push({
               id: space.name,
               name: `Chat: ${space.displayName || 'Direct Message'}.txt`,
               content: msgs,
               size: msgs.length,
               type: 'txt'
             });
           }
        }
      }

      if (newFiles.length > 0) {
        onFilesImported(newFiles);
      } else {
        setError('لا توجد محادثات قابلة للاستيراد.');
      }
    } catch (err: any) {
      console.error(err);
      setError('حدث خطأ أثناء استيراد الرسائل. تأكد من الأذونات.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#141824] border border-gray-800 rounded-xl p-4 mt-4 space-y-3">
      <h4 className="text-xs font-bold text-gray-300 mb-2">استيراد مباشر من Workspace</h4>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={importFromDrive}
          disabled={loading}
          className="py-2 px-3 rounded-lg bg-[#1c2234] border border-gray-700 hover:bg-[#252d43] hover:border-gray-600 transition flex flex-col items-center justify-center gap-1 text-teal-400"
        >
          <Layers className="w-4 h-4" />
          <span className="text-[10px] font-bold">Google Drive</span>
        </button>
        <button
          onClick={importFromDocs}
          disabled={loading}
          className="py-2 px-3 rounded-lg bg-[#1c2234] border border-gray-700 hover:bg-[#252d43] hover:border-gray-600 transition flex flex-col items-center justify-center gap-1 text-blue-400"
        >
          <FileText className="w-4 h-4" />
          <span className="text-[10px] font-bold">Google Docs</span>
        </button>
        <button
          onClick={importFromSheets}
          disabled={loading}
          className="py-2 px-3 rounded-lg bg-[#1c2234] border border-gray-700 hover:bg-[#252d43] hover:border-gray-600 transition flex flex-col items-center justify-center gap-1 text-emerald-400"
        >
          <Layers className="w-4 h-4" />
          <span className="text-[10px] font-bold">Google Sheets</span>
        </button>
        <button
          onClick={importFromGmail}
          disabled={loading}
          className="py-2 px-3 rounded-lg bg-[#1c2234] border border-gray-700 hover:bg-[#252d43] hover:border-gray-600 transition flex flex-col items-center justify-center gap-1 text-rose-400"
        >
          <Layers className="w-4 h-4" />
          <span className="text-[10px] font-bold">Gmail</span>
        </button>
        <button
          onClick={importFromChat}
          disabled={loading}
          className="py-2 px-3 rounded-lg bg-[#1c2234] border border-gray-700 hover:bg-[#252d43] hover:border-gray-600 transition flex flex-col items-center justify-center gap-1 text-green-500 col-span-2"
        >
          <Layers className="w-4 h-4" />
          <span className="text-[10px] font-bold">Google Chat</span>
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 text-[10px] text-gray-500 mt-2">
          <RefreshCw className="w-3 h-3 animate-spin" /> جاري التنزيل...
        </div>
      )}

      {error && (
        <div className="text-[10px] text-rose-400 bg-rose-950/30 border border-rose-900/50 p-2 rounded text-center mt-2">
          {error}
        </div>
      )}
    </div>
  );
}
