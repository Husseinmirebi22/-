import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export type ToastProps = {
  message: string;
  type?: 'success' | 'warn' | 'error';
};

export const Toast: React.FC<ToastProps> = ({ message, type = 'success' }) => {
  return (
    <div className={`fixed bottom-6 left-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl border shadow-2xl transition-all duration-300 animate-bounce ${
      type === 'success' ? 'bg-[#101c1a] border-emerald-800 text-emerald-400' :
      type === 'error' ? 'bg-[#221316] border-rose-900 text-rose-400' :
      'bg-[#1e1913] border-amber-800 text-amber-400'
    }`}>
      {type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
      <span className="font-medium text-sm">{message}</span>
    </div>
  );
};
