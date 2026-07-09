import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Save, Edit, Eye, Check, AlertCircle, RefreshCw,
  Table, List, CheckCircle2, Circle, FileText, ChevronRight
} from 'lucide-react';
import { SectionOutline } from '../types';

interface MainEditorProps {
  key?: string;
  section: SectionOutline;
  onUpdateSectionContent: (id: string, content: string, status: SectionOutline['status']) => void;
  initiativeTitle: string;
  subject: string;
  grade: string;
  category: string;
  isGenerating: boolean;
  onGenerateSection: (id: string) => Promise<string>;
}

export default function MainEditor({
  section,
  onUpdateSectionContent,
  initiativeTitle,
  subject,
  grade,
  category,
  isGenerating,
  onGenerateSection
}: MainEditorProps) {
  const [content, setContent] = useState(section.content);
  const [mode, setMode] = useState<'edit' | 'preview'>('preview');
  const [status, setStatus] = useState<SectionOutline['status']>(section.status);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state with section prop
  useEffect(() => {
    setContent(section.content);
    setStatus(section.status);
    setMode(section.content ? 'preview' : 'edit');
  }, [section]);

  const handleSave = () => {
    onUpdateSectionContent(section.id, content, status);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleAutoDraft = async () => {
    const generated = await onGenerateSection(section.id);
    if (generated) {
      setContent(generated);
      setStatus('completed');
      onUpdateSectionContent(section.id, generated, 'completed');
      setMode('preview');
    }
  };

  const handleStatusChange = (newStatus: SectionOutline['status']) => {
    setStatus(newStatus);
    onUpdateSectionContent(section.id, content, newStatus);
  };

  // Custom Inline Markdown Parser supporting lists and tables
  const renderMarkdown = (md: string) => {
    if (!md) {
      return `
        <div class="text-center py-16 px-4">
          <div class="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
          </div>
          <h3 class="font-bold text-slate-800 text-sm">Chưa có nội dung chi tiết</h3>
          <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Hãy nhấp vào nút "Viết tự động bằng AI" ở góc phải, hoặc chuyển sang chế độ "Biên soạn" để tự viết nội dung của riêng bạn.</p>
        </div>
      `;
    }

    let html = md;
    
    // Safety escape for standard HTML, keeping tags we generate
    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Convert markdown tables
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = '';
    const processedLines = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
        // Check if divider line
        if (cells.every(c => c.startsWith('-') || c.endsWith('-'))) {
          return '';
        }
        
        if (!inTable) {
          inTable = true;
          tableHtml = '<div class="overflow-x-auto my-4"><table class="w-full border-collapse border border-slate-200 rounded-lg">';
        }
        
        const isHeader = !tableHtml.includes('<tbody>') && !tableHtml.includes('</thead>') && !tableHtml.includes('<tr>');
        let rowHtml = '<tr>';
        cells.forEach(cell => {
          rowHtml += isHeader 
            ? `<th class="border border-slate-200 bg-slate-50 text-slate-800 text-xs font-bold text-left p-3">${cell}</th>` 
            : `<td class="border border-slate-200 text-slate-600 text-xs p-3">${cell}</td>`;
        });
        rowHtml += '</tr>';
        
        if (isHeader) {
          tableHtml += '<thead>' + rowHtml + '</thead><tbody>';
        } else {
          tableHtml += rowHtml;
        }
        return '';
      } else {
        if (inTable) {
          inTable = false;
          const finishedTable = tableHtml + '</tbody></table></div>';
          tableHtml = '';
          return finishedTable + '\n' + line;
        }
      }
      return line;
    });

    html = processedLines.join('\n');

    // Headers
    html = html.replace(/^### (.*?)$/gm, '<h3 class="font-display font-bold text-slate-700 text-sm mt-4 mb-2">$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2 class="font-display font-bold text-slate-800 text-base mt-6 mb-3 border-b border-slate-100 pb-1">$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1 class="font-display font-bold text-slate-900 text-lg mt-8 mb-4 border-b border-slate-200 pb-2">$1</h1>');

    // Bullet lists
    html = html.replace(/^\s*-\s+(.*?)$/gm, '<li class="text-slate-600 text-xs ml-4 my-1 list-disc">$1</li>');

    // Bold and Italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em class="italic text-slate-700">$1</em>');

    // Paragraph splits
    const paragraphs = html.split('\n\n').map(p => {
      const pt = p.trim();
      if (!pt) return '';
      if (pt.startsWith('<h') || pt.startsWith('<li') || pt.startsWith('<div') || pt.startsWith('<table') || pt.startsWith('<tr')) {
        return pt;
      }
      return `<p class="leading-relaxed text-xs text-slate-600 mb-4 text-justify">${pt.replace(/\n/g, '<br>')}</p>`;
    });

    return paragraphs.filter(Boolean).join('\n');
  };

  return (
    <div id="editor-container" className="flex-1 h-auto md:h-screen flex flex-col bg-[#F8FAFC] min-w-0 font-sans">
      
      {/* Editor Control Header */}
      <div className="p-5 border-b border-slate-100 bg-white flex items-center justify-between shadow-sm shrink-0 z-10">
        <div>
          <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            {section.title}
          </span>
          <h2 className="text-base font-bold text-slate-800 mt-1">
            {section.vietnameseTitle}
          </h2>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Status Selectors */}
          <div className="flex items-center bg-slate-50 border border-slate-100 p-1 rounded-xl">
            <button
              onClick={() => handleStatusChange('pending')}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center space-x-1.5 transition-all ${
                status === 'pending'
                  ? 'bg-white text-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Circle size={10} />
              <span>Chờ soạn</span>
            </button>
            <button
              onClick={() => handleStatusChange('drafting')}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center space-x-1.5 transition-all ${
                status === 'drafting'
                  ? 'bg-amber-100/70 text-amber-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Circle className="text-amber-500 fill-amber-500" size={10} />
              <span>Đang viết</span>
            </button>
            <button
              onClick={() => handleStatusChange('completed')}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center space-x-1.5 transition-all ${
                status === 'completed'
                  ? 'bg-emerald-100/70 text-emerald-800 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <CheckCircle2 className="text-emerald-500" size={10} />
              <span>Đã hoàn thành</span>
            </button>
            {status === 'error' && (
              <button
                onClick={() => handleStatusChange('error')}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center space-x-1.5 bg-red-100 text-red-800 shadow-sm animate-pulse"
              >
                <AlertCircle className="text-red-500" size={10} />
                <span>Đã dừng do lỗi</span>
              </button>
            )}
          </div>

          <div className="h-6 w-px bg-slate-200"></div>

          {/* Toggle View Mode */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setMode('edit')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                mode === 'edit' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Chế độ Biên soạn"
            >
              <Edit size={14} />
            </button>
            <button
              onClick={() => setMode('preview')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                mode === 'preview' ? 'bg-white text-[#FF6B00] shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Chế độ Xem trước"
            >
              <Eye size={14} />
            </button>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-md shadow-indigo-600/10"
          >
            {saveSuccess ? (
              <>
                <Check size={14} />
                <span>Đã lưu</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>Lưu lại</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Body - Left Canvas, Right Prompt Helpers */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden">
        
        {/* Editor Workspace (Paper representation) */}
        <div className="flex-1 overflow-y-auto p-8 flex justify-center">
          <div className="w-full max-w-2xl flex flex-col h-full">
            
            {/* Guide Card of active section */}
            <div className="mb-4 bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-start space-x-3 text-xs text-slate-500">
              <AlertCircle className="text-indigo-500 shrink-0 mt-0.5" size={14} />
              <div>
                <span className="font-bold text-slate-700">Yêu cầu hội đồng: </span>
                {section.description}
              </div>
            </div>

            {/* Paper Sheet container */}
            <div className="editor-paper flex-1 min-h-[600px] rounded-3xl p-8 mb-8 flex flex-col select-text">
              {mode === 'edit' ? (
                <textarea
                  id="section-textarea"
                  className="w-full flex-1 bg-transparent border-0 outline-none resize-none text-xs text-slate-700 leading-relaxed font-sans placeholder-slate-400"
                  placeholder="Hãy bắt đầu soạn thảo nội dung khoa học chuẩn mực ở đây..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              ) : (
                <div 
                  id="section-preview"
                  className="markdown-body flex-1 overflow-y-auto select-text prose max-w-none text-justify"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Sidebar helper panels (Right inner column) */}
        <div className="w-full lg:w-64 border-t lg:border-t-0 lg:border-l border-slate-100 bg-white p-5 flex flex-col space-y-4 overflow-y-auto shrink-0 select-none">
          
          {/* AI Generator Button */}
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Trợ lý đặc hiệu</h4>
            <button
              id="btn-auto-draft"
              onClick={handleAutoDraft}
              disabled={isGenerating}
              className="w-full bg-gradient-to-r from-[#7C3AED] to-[#FF6B00] hover:from-[#6d28d9] hover:to-[#e05e00] text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-indigo-500/10 cursor-pointer disabled:opacity-75 disabled:cursor-wait"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="animate-spin" size={14} />
                  <span>AI Đang soạn văn bản...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Tự động viết bằng AI</span>
                </>
              )}
            </button>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              AI sẽ phân tích đề tài để viết từ 600 - 1000 từ chuẩn mực sư phạm và tạo bảng biểu số liệu tự động.
            </p>
          </div>

          <hr className="border-slate-100" />

          {/* Suggested Indicators */}
          {section.aiSuggestedMetrics && section.aiSuggestedMetrics.length > 0 && (
            <div>
              <div className="flex items-center space-x-1.5 mb-2 text-[#FF6B00]">
                <Table size={12} />
                <h4 className="text-[10px] font-bold uppercase tracking-wider">Chỉ số số liệu đề xuất</h4>
              </div>
              <div className="space-y-1.5">
                {section.aiSuggestedMetrics.map((met, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (mode === 'edit') {
                        setContent(prev => prev + `\n- Bảng số liệu khảo sát: ${met}\n`);
                      }
                    }}
                    className="w-full text-left p-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] text-slate-600 font-medium hover:border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                    title="Nhấp để chèn vào nội dung (Chế độ biên soạn)"
                  >
                    {met}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Evidences */}
          {section.aiSuggestedEvidences && section.aiSuggestedEvidences.length > 0 && (
            <div>
              <div className="flex items-center space-x-1.5 mb-2 text-indigo-600">
                <FileText size={12} />
                <h4 className="text-[10px] font-bold uppercase tracking-wider">Minh chứng cần chuẩn bị</h4>
              </div>
              <div className="space-y-1.5">
                {section.aiSuggestedEvidences.map((evi, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (mode === 'edit') {
                        setContent(prev => prev + `\n- Minh chứng trực quan: ${evi}\n`);
                      }
                    }}
                    className="w-full text-left p-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] text-slate-600 font-medium hover:border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                    title="Nhấp để chèn vào nội dung (Chế độ biên soạn)"
                  >
                    {evi}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
