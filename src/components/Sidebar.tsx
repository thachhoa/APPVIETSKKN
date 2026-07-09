import React from 'react';
import { 
  Award, FileText, CheckCircle2, Circle, Clock, Sparkles, 
  Download, Trophy, ArrowLeft, RefreshCw, AlertCircle, Presentation
} from 'lucide-react';
import { Initiative, SectionOutline } from '../types';

interface SidebarProps {
  initiative: Initiative;
  currentSectionId: string | null;
  onSelectSection: (id: string) => void;
  onTriggerEvaluation: () => void;
  onExportDocx: () => void;
  onExportPptx: () => void;
  onExportPdf: () => void;
  onResetProject: () => void;
  isEvaluating: boolean;
  isGeneratingSlides: boolean;
}

export default function Sidebar({
  initiative,
  currentSectionId,
  onSelectSection,
  onTriggerEvaluation,
  onExportDocx,
  onExportPptx,
  onExportPdf,
  onResetProject,
  isEvaluating,
  isGeneratingSlides
}: SidebarProps) {
  
  // Progress tracker
  const completedCount = initiative.outline.filter(s => s.status === 'completed').length;
  const progressPercent = Math.round((completedCount / initiative.outline.length) * 100);

  const getStatusIcon = (status: SectionOutline['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="text-emerald-500 shrink-0" size={16} />;
      case 'drafting':
        return <Clock className="text-amber-500 shrink-0 animate-pulse" size={16} />;
      case 'error':
        return <AlertCircle className="text-red-500 shrink-0 animate-bounce" size={16} />;
      default:
        return <Circle className="text-slate-300 shrink-0" size={16} />;
    }
  };

  const getStatusBadge = (status: SectionOutline['status']) => {
    switch (status) {
      case 'completed':
        return <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Đã xong</span>;
      case 'drafting':
        return <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Đang viết</span>;
      case 'error':
        return <span className="text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-semibold">Đã dừng do lỗi</span>;
      default:
        return <span className="text-[10px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full">Chưa soạn</span>;
    }
  };

  return (
    <aside id="sidebar-container" className="w-full md:w-[300px] h-auto md:h-screen border-b md:border-b-0 md:border-r border-slate-100 bg-white flex flex-col justify-between shrink-0 font-sans z-10">
      
      {/* Upper Half */}
      <div className="flex flex-col flex-1 min-h-0">
        
        {/* Branding Title */}
        <div className="p-5 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#FF6B00] flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20">
              S
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 tracking-tight font-display">SKKN 2026 PRO</h2>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">Phân khúc cao cấp</p>
            </div>
          </div>
          <button 
            id="reset-btn"
            onClick={onResetProject}
            title="Tạo đề tài mới"
            className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-50 rounded-lg"
          >
            <ArrowLeft size={16} />
          </button>
        </div>

        {/* Project Meta Card */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-100">
          <span className="text-[9px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            {initiative.category === 'bien-phap' ? 'Biện pháp sư phạm' : initiative.category === 'ho-so' ? 'Hồ sơ chủ nhiệm giỏi' : 'Sáng kiến kinh nghiệm'}
          </span>
          <h3 className="text-xs font-bold text-slate-800 leading-snug mt-1.5 line-clamp-2" title={initiative.title}>
            "{initiative.title}"
          </h3>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2.5 text-[10px] text-slate-500 border-t border-slate-100/50 pt-2 font-medium">
            <div className="truncate"><span className="text-slate-400 font-normal">Môn:</span> {initiative.subject}</div>
            <div className="truncate"><span className="text-slate-400 font-normal">Lớp:</span> {initiative.grade}</div>
            <div className="truncate"><span className="text-slate-400 font-normal">Tác giả:</span> {initiative.author}</div>
            <div className="truncate"><span className="text-slate-400 font-normal">Đơn vị:</span> {initiative.school}</div>
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold mb-1 uppercase">
              <span>Tiến độ soạn thảo</span>
              <span className="text-indigo-600">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#7C3AED] to-[#FF6B00] transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Section List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Các bước hoàn thiện</div>
          
          {(() => {
            const getIndentationStyles = (title: string) => {
              const trimmed = title.trim();
              const numMatch = trimmed.match(/^([0-9]+(\.[0-9]+)+)/);
              if (numMatch) {
                const dots = (numMatch[1].match(/\./g) || []).length;
                if (dots === 1) return { pl: "pl-6", size: "text-[11px]", isSub: true };
                if (dots >= 2) return { pl: "pl-10", size: "text-[10px]", isSub: true };
              }
              if (/^[a-z]\)/i.test(trimmed) || /^[a-z]\.\s/i.test(trimmed)) {
                return { pl: "pl-8", size: "text-[10.5px]", isSub: true };
              }
              return { pl: "pl-2", size: "text-xs", isSub: false };
            };

            return initiative.outline.map((section, index) => {
              const isSelected = currentSectionId === section.id;
              const styles = getIndentationStyles(section.vietnameseTitle);
              return (
                <button
                  key={section.id}
                  id={`sidebar-sec-${section.id}`}
                  onClick={() => onSelectSection(section.id)}
                  className={`w-full p-2.5 rounded-xl text-left flex items-start space-x-2 transition-all ${styles.pl} ${
                    isSelected 
                      ? 'bg-gradient-to-r from-indigo-50/50 to-white border border-[#7C3AED] shadow-sm text-slate-900 ring-1 ring-[#7C3AED]/10'
                      : 'bg-white border border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <div className="mt-0.5">
                    {getStatusIcon(section.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between space-x-1.5">
                      {!styles.isSub && (
                        <span className="text-[9px] font-semibold text-slate-400">Bước {index + 1}</span>
                      )}
                      {getStatusBadge(section.status)}
                    </div>
                    <div className={`font-bold leading-snug mt-0.5 ${styles.size} ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                      {section.vietnameseTitle}
                    </div>
                  </div>
                </button>
              );
            });
          })()}
        </div>
      </div>

      {/* Lower Half (Action Buttons) */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2">
        <button
          id="btn-evaluate"
          onClick={onTriggerEvaluation}
          disabled={isEvaluating}
          className="w-full bg-[#FF6B00] hover:bg-[#e05e00] text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-md shadow-orange-500/10 disabled:opacity-75 disabled:cursor-wait"
        >
          {isEvaluating ? (
            <>
              <RefreshCw className="animate-spin" size={14} />
              <span>Hội Đồng AI Đang Chấm Thi...</span>
            </>
          ) : (
            <>
              <Trophy size={14} />
              <span>Chấm thử & Biện luận Hội đồng</span>
            </>
          )}
        </button>

        <button
          id="btn-export-pptx"
          onClick={onExportPptx}
          disabled={isGeneratingSlides}
          className="w-full bg-[#3B82F6] hover:bg-[#2563EB] text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-md shadow-blue-500/10 disabled:opacity-75 disabled:cursor-wait"
        >
          {isGeneratingSlides ? (
            <>
              <RefreshCw className="animate-spin" size={14} />
              <span>AI Đang Thiết Kế Slide...</span>
            </>
          ) : (
            <>
              <Presentation size={14} />
              <span>Tạo Slide Thuyết Trình AI</span>
            </>
          )}
        </button>

        <button
          id="btn-export-pdf"
          onClick={onExportPdf}
          className="w-full bg-[#EF4444] hover:bg-[#DC2626] text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-md shadow-red-500/10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/></svg>
          <span>Xuất Bản Bản In / PDF Đầy Đủ</span>
        </button>

        <button
          id="btn-export-word"
          onClick={onExportDocx}
          className="w-full bg-[#7C3AED] hover:bg-[#6d28d9] text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-md shadow-indigo-500/10"
        >
          <Download size={14} />
          <span>Xuất File Word Đầy Đủ</span>
        </button>
      </div>

    </aside>
  );
}
