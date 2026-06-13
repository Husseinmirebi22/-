import React from 'react';
import { AuditHistoryEntry } from '../types';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

export default function CompareView({ itemA, itemB }: { itemA: AuditHistoryEntry, itemB: AuditHistoryEntry }) {
  if (!itemA.fullReport || !itemB.fullReport) return null;

  // Let's ensure A is the older, B is the newer based on date or just visual ordering
  // We will assume A is the left side, B is the right side
  const rA = itemA.fullReport;
  const rB = itemB.fullReport;

  const scoreDiff = rB.complianceScore - rA.complianceScore;

  // Items intersection
  const itemsA = rA.items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {} as Record<string, any>);
  const itemsB = rB.items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {} as Record<string, any>);
  
  const allIds = Array.from(new Set([...Object.keys(itemsA), ...Object.keys(itemsB)])).sort();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS': return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
      case 'FAIL': return <XCircle className="w-3 h-3 text-rose-500" />;
      case 'PARTIAL': return <AlertCircle className="w-3 h-3 text-amber-500" />;
      default: return <span className="text-gray-500 text-[10px]">--</span>;
    }
  };

  return (
    <div className="bg-[#141824] border border-gray-800 rounded-xl p-5 mt-6 space-y-4">
      <h3 className="text-sm font-bold text-white mb-2">مقارنة النتائج الجانبية</h3>
      
      <div className="grid grid-cols-2 gap-4 border-b border-gray-800 pb-4">
        {/* Item A summary */}
        <div className="bg-[#1c2234] border border-gray-700 p-4 rounded-xl text-center relative">
          <p className="text-xs text-gray-400 mb-1 truncate">{itemA.fileName}</p>
          <p className="text-2xl font-mono font-black text-white">{rA.complianceScore}%</p>
          <div className="flex justify-center gap-3 mt-2 text-[10px]">
             <span className="text-emerald-400">✅ {rA.summary.passed}</span>
             <span className="text-rose-450">❌ {rA.summary.failed}</span>
             <span className="text-amber-400">⚠️ {rA.summary.partial}</span>
          </div>
        </div>

        {/* Item B summary */}
        <div className="bg-[#1c2234] border border-gray-700 p-4 rounded-xl text-center relative">
          <p className="text-xs text-gray-400 mb-1 truncate">{itemB.fileName}</p>
          <div className="flex items-center justify-center gap-2">
            <p className="text-2xl font-mono font-black text-white">{rB.complianceScore}%</p>
            {scoreDiff !== 0 && (
              <span className={`text-xs font-bold ${scoreDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {scoreDiff > 0 ? '+' : ''}{scoreDiff}%
              </span>
            )}
          </div>
          <div className="flex justify-center gap-3 mt-2 text-[10px]">
             <span className="text-emerald-400">✅ {rB.summary.passed}</span>
             <span className="text-rose-450">❌ {rB.summary.failed}</span>
             <span className="text-amber-400">⚠️ {rB.summary.partial}</span>
          </div>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto pr-2 space-y-2">
        <h4 className="text-xs font-bold text-gray-300 sticky top-0 bg-[#141824] py-2 z-10">الفرق بين البنود (تطور الامتثال)</h4>
        {allIds.map(id => {
          const iA = itemsA[id];
          const iB = itemsB[id];
          const sA = iA?.status || 'NOT_APPLICABLE';
          const sB = iB?.status || 'NOT_APPLICABLE';
          if (sA === sB && sA === 'NOT_APPLICABLE') return null;

          const changed = sA !== sB;

          return (
            <div key={id} className={`flex items-center text-xs p-2 rounded-lg border ${changed ? 'bg-indigo-950/20 border-indigo-900/50' : 'bg-[#0a0c12] border-gray-800'}`}>
              <div className="w-1/2 flex items-start gap-2 pr-2">
                <div className="mt-0.5">{getStatusIcon(sA)}</div>
                <div>
                  <p className={`line-clamp-1 ${iA ? 'text-gray-300' : 'text-gray-600'}`}>{iA ? iA.name : (iB?.name || id)}</p>
                  <p className="text-[9px] text-gray-500 font-mono mt-0.5">{sA}</p>
                </div>
              </div>
              <div className="w-px h-6 bg-gray-700 mx-2"></div>
              <div className="w-1/2 flex items-start gap-2 pl-2">
                <div className="mt-0.5">{getStatusIcon(sB)}</div>
                <div>
                  <p className={`line-clamp-1 ${iB ? 'text-gray-300' : 'text-gray-600'}`}>{iB ? iB.name : (iA?.name || id)}</p>
                  <p className="text-[9px] text-gray-500 font-mono mt-0.5">{sB}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
