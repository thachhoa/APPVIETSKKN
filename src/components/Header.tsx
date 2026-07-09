import React from 'react';
import { Settings, Key, ExternalLink, Award, User, BookOpen } from 'lucide-react';
import { Initiative } from '../types';

interface HeaderProps {
  initiative: Initiative | null;
  onOpenSettings: () => void;
  hasApiKey: boolean;
}

export default function Header({ initiative, onOpenSettings, hasApiKey }: HeaderProps) {
  return (
    <header id="app-header" className="w-full bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0 z-20 shadow-sm font-sans select-none">
      
      {/* Left side: Logo & Branding */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#FF6B00] flex items-center justify-center text-white font-extrabold shadow-md shadow-indigo-500/20 text-xs">
          SK
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-sm font-black text-slate-800 font-display tracking-tight">SKKN 2026 PRO</h1>
            <span className="text-[8px] bg-red-50 text-red-600 border border-red-100 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider scale-90">
              Vercel Edition
            </span>
          </div>
          <p className="text-[9px] text-slate-400 font-medium">Trợ Lý AI Soạn Sách & Sáng Kiến Kinh Nghiệm</p>
        </div>
      </div>

      {/* Middle side: Active Initiative Info */}
      {initiative && (
        <div className="hidden lg:flex items-center space-x-2 bg-slate-50 border border-slate-100/50 px-4 py-1.5 rounded-2xl max-w-md xl:max-w-xl truncate">
          <BookOpen size={12} className="text-[#7C3AED] shrink-0" />
          <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Đề tài đang mở:</span>
          <span className="text-[10px] font-semibold text-slate-700 truncate" title={initiative.title}>
            "{initiative.title}"
          </span>
        </div>
      )}

      {/* Right side: API Key Status & Settings button */}
      <div className="flex items-center space-x-4">
        
        {/* red label warning to get API Key */}
        <div className="flex items-center space-x-2">
          {!hasApiKey ? (
            <a 
              href="https://aistudio.google.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-red-500 font-extrabold flex items-center space-x-1.5 animate-pulse bg-red-50 hover:bg-red-100 border border-red-200/50 px-3 py-1.5 rounded-xl transition-all"
            >
              <Key size={11} className="shrink-0" />
              <span>Lấy API key để sử dụng app</span>
              <ExternalLink size={8} className="shrink-0" />
            </a>
          ) : (
            <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold px-2.5 py-1.5 rounded-xl flex items-center space-x-1.5">
              <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping"></span>
              <span>API Key đã kích hoạt</span>
            </span>
          )}
        </div>

        {/* Settings Action Button */}
        <button
          id="header-settings-btn"
          onClick={onOpenSettings}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-600 hover:text-slate-800 rounded-xl transition-all text-[10px] font-bold cursor-pointer"
        >
          <Settings size={12} />
          <span>Cấu hình AI</span>
        </button>

      </div>

    </header>
  );
}
