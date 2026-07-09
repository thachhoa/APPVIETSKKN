import React, { useState } from 'react';
import { Sparkles, ArrowRight, Award, BookOpen, GraduationCap, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import { InitiativeCategory } from '../types';

interface InitialSetupProps {
  onSetupComplete: (data: {
    title: string;
    subject: string;
    grade: string;
    category: InitiativeCategory;
    author: string;
    school: string;
    analyzedData: any;
  }) => void;
}

const POPULAR_SUBJECTS = [
  'Toán học', 'Tiếng Việt / Ngữ văn', 'Tiếng Anh', 'Tự nhiên và Xã hội', 
  'Khoa học', 'Lịch sử và Địa lý', 'Đạo đức', 'Công nghệ', 'Tin học', 
  'Giáo dục thể chất', 'Hoạt động trải nghiệm'
];

const GRADES = [
  'Lớp 1', 'Lớp 2', 'Lớp 3', 'Lớp 4', 'Lớp 5', 
  'Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9', 
  'Lớp 10', 'Lớp 11', 'Lớp 12'
];

export default function InitialSetup({ onSetupComplete }: InitialSetupProps) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [category, setCategory] = useState<InitiativeCategory>('skkn');
  const [author, setAuthor] = useState('');
  const [school, setSchool] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const [useCustomOutline, setUseCustomOutline] = useState(false);
  const [customOutlineText, setCustomOutlineText] = useState('');
  const [customOutlineError, setCustomOutlineError] = useState('');
  const [parsingFile, setParsingFile] = useState(false);

  // Phase 1: Input form, Phase 2: AI Review & Confirmation
  const [phase, setPhase] = useState<'input' | 'review'>('input');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".txt") && !lowerName.endsWith(".docx") && !lowerName.endsWith(".pdf")) {
      setCustomOutlineError("Chỉ chấp nhận file văn bản dạng .docx, .pdf hoặc .txt.");
      return;
    }

    setParsingFile(true);
    setCustomOutlineError('');

    try {
      if (lowerName.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const text = evt.target?.result as string;
          if (text) {
            setCustomOutlineText(text);
            setCustomOutlineError('');
          }
          setParsingFile(false);
        };
        reader.onerror = () => {
          setCustomOutlineError("Không thể đọc file TXT.");
          setParsingFile(false);
        };
        reader.readAsText(file);
      } else {
        // Docx or PDF - send to server-side parse API
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const dataUrl = evt.target?.result as string;
            const base64Data = dataUrl.split(',')[1];

            const apiKey = localStorage.getItem('GEMINI_API_KEY') || '';
            const selectedModel = localStorage.getItem('GEMINI_SELECTED_MODEL') || 'gemini-3-flash-preview';

            const response = await fetch('/api/parse-document', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'x-gemini-key': apiKey,
                'x-gemini-model': selectedModel
              },
              body: JSON.stringify({
                base64: base64Data,
                fileName: file.name
              })
            });

            if (!response.ok) {
              let errMsg = "Lỗi xử lý file từ máy chủ";
              try {
                const errData = await response.json();
                errMsg = errData.error || errData.details || errMsg;
              } catch (e) {
                try {
                  const textErr = await response.text();
                  if (textErr.includes("API Key") || textErr.includes("api_key")) {
                    errMsg = "API Key không hợp lệ hoặc thiếu trong cấu hình.";
                  } else {
                    errMsg = textErr.slice(0, 150) || errMsg;
                  }
                } catch {
                  // Ignore
                }
              }
              throw new Error(errMsg);
            }

            let resData;
            try {
              resData = await response.json();
            } catch (e) {
              throw new Error("Phản hồi từ máy chủ không hợp lệ (Không phải cấu trúc JSON).");
            }
            if (resData.lines && resData.lines.length > 0) {
              // Join extracted lines
              setCustomOutlineText(resData.lines.join('\n'));
              setCustomOutlineError('');
            } else {
              throw new Error("Không tìm thấy cấu trúc dòng nào phù hợp trong tài liệu.");
            }
          } catch (innerErr: any) {
            setCustomOutlineError(innerErr.message || "Lỗi parse file.");
          } finally {
            setParsingFile(false);
          }
        };
        reader.onerror = () => {
          setCustomOutlineError("Không thể đọc file nhị phân.");
          setParsingFile(false);
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      setCustomOutlineError("Có lỗi xảy ra: " + err.message);
      setParsingFile(false);
    }
  };

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Vui lòng nhập tên đề tài sáng kiến');
      return;
    }

    const customOutlineLines = useCustomOutline && customOutlineText.trim()
      ? customOutlineText.split('\n').map(line => line.trim()).filter(line => line.length > 0)
      : [];

    if (useCustomOutline && customOutlineLines.length === 0) {
      setError('Vui lòng nhập hoặc tải cấu trúc khung tùy chỉnh trước khi tiếp tục');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const apiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      const selectedModel = localStorage.getItem('GEMINI_SELECTED_MODEL') || 'gemini-3-flash-preview';

      const response = await fetch('/api/analyze-topic', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-gemini-key': apiKey,
          'x-gemini-model': selectedModel
        },
        body: JSON.stringify({ 
          title, 
          subject, 
          grade, 
          category,
          customOutline: customOutlineLines
        }),
      });

      if (!response.ok) {
        let errMsg = "Không thể kết nối đến máy chủ AI";
        try {
          const errData = await response.json();
          errMsg = errData.error || errData.details || errMsg;
        } catch (e) {
          try {
            const textErr = await response.text();
            if (textErr.includes("API Key") || textErr.includes("api_key")) {
              errMsg = "API Key không hợp lệ hoặc thiếu trong cấu hình.";
            } else {
              errMsg = textErr.slice(0, 150) || errMsg;
            }
          } catch {
            // Ignore
          }
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      setAnalysisResult(data);
      setPhase('review');
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra trong quá trình phân tích. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAndProceed = () => {
    if (!analysisResult) return;
    onSetupComplete({
      title: analysisResult.analyzedTitle || title,
      subject: subject || 'Chung',
      grade: grade || 'Toàn trường',
      category,
      author: author || 'Thầy/Cô Giáo',
      school: school || 'Sở Giáo dục và Đào tạo',
      analyzedData: analysisResult
    });
  };

  return (
    <div id="initial-setup-container" className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-start md:justify-center py-6 md:py-12 px-4 sm:px-6 lg:px-8 font-sans overflow-y-auto">
      <div className="max-w-3xl w-full bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden transition-all duration-500">
        
        {/* Banner */}
        <div className="bg-gradient-to-r from-[#7C3AED] via-[#6366F1] to-[#FF6B00] px-8 py-10 text-white relative">
          <div className="absolute top-4 right-4 opacity-10 bg-white p-6 rounded-full translate-x-4 -translate-y-4">
            <Award size={120} />
          </div>
          <div className="flex items-center space-x-3 mb-2">
            <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-sm">
              SKKN 2026 PRO v3.5
            </span>
          </div>
          <h1 className="text-3xl font-bold font-display tracking-tight leading-tight">
            Trợ Lý Sáng Kiến Kinh Nghiệm & Biện Pháp Sư Phạm AI
          </h1>
          <p className="mt-2 text-white/90 text-sm max-w-xl">
            Tối ưu hóa quy trình viết Sáng kiến kinh nghiệm và Biện pháp sư phạm đạt chuẩn Bộ Giáo dục & Đào tạo Việt Nam với sức mạnh từ mô hình trí tuệ nhân tạo Gemini thế hệ mới.
          </p>
        </div>

        {phase === 'input' ? (
          <form onSubmit={handleStartAnalysis} className="p-8 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start space-x-3 text-sm animate-fade-in">
                <AlertCircle className="shrink-0 mt-0.5" size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                id="cat-skkn-btn"
                onClick={() => setCategory('skkn')}
                className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
                  category === 'skkn'
                    ? 'border-[#7C3AED] bg-indigo-50/40 text-slate-900 ring-2 ring-indigo-500/10'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${category === 'skkn' ? 'bg-[#7C3AED] text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <BookOpen size={16} />
                </div>
                <div className="font-semibold text-sm">Sáng kiến kinh nghiệm</div>
                <div className="text-xs text-slate-400 mt-1">Đề tài nghiên cứu sư phạm khoa học</div>
              </button>

              <button
                type="button"
                id="cat-bien-phap-btn"
                onClick={() => setCategory('bien-phap')}
                className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
                  category === 'bien-phap'
                    ? 'border-[#FF6B00] bg-orange-50/40 text-slate-900 ring-2 ring-orange-500/10'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${category === 'bien-phap' ? 'bg-[#FF6B00] text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Sparkles size={16} />
                </div>
                <div className="font-semibold text-sm">Biện pháp sư phạm</div>
                <div className="text-xs text-slate-400 mt-1">Sử dụng cho hội thi Giáo viên dạy giỏi</div>
              </button>

              <button
                type="button"
                id="cat-hoso-btn"
                onClick={() => setCategory('ho-so')}
                className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
                  category === 'ho-so'
                    ? 'border-indigo-600 bg-indigo-50/40 text-slate-900 ring-2 ring-indigo-500/10'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${category === 'ho-so' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <GraduationCap size={16} />
                </div>
                <div className="font-semibold text-sm">Hồ sơ GV Chủ nhiệm</div>
                <div className="text-xs text-slate-400 mt-1">Hồ sơ thi Giáo viên chủ nhiệm giỏi</div>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2" htmlFor="topic-title">
                  Tên đề tài / Ý tưởng sáng kiến ban đầu *
                </label>
                <textarea
                  id="topic-title"
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50/60 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#7C3AED] focus:bg-white text-sm text-slate-800 placeholder-slate-400 font-sans transition-all"
                  placeholder="Ví dụ: Một số biện pháp giúp học sinh học tốt môn Toán lớp 3 thông qua các trò chơi học tập"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2" htmlFor="subject-select">
                    Môn học / Chuyên môn
                  </label>
                  <div className="relative">
                    <select
                      id="subject-select"
                      className="w-full px-4 py-3 bg-slate-50/60 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#7C3AED] focus:bg-white text-sm text-slate-800 transition-all appearance-none"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    >
                      <option value="">-- Chọn môn học --</option>
                      {POPULAR_SUBJECTS.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2" htmlFor="grade-select">
                    Khối lớp giảng dạy
                  </label>
                  <select
                    id="grade-select"
                    className="w-full px-4 py-3 bg-slate-50/60 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#7C3AED] focus:bg-white text-sm text-slate-800 transition-all appearance-none"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                  >
                    <option value="">-- Chọn khối lớp --</option>
                    {GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2" htmlFor="author-input">
                    Họ và tên Tác giả
                  </label>
                  <input
                    type="text"
                    id="author-input"
                    className="w-full px-4 py-3 bg-slate-50/60 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#7C3AED] focus:bg-white text-sm text-slate-800 transition-all"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2" htmlFor="school-input">
                    Tên Đơn vị công tác (Trường học / Sở)
                  </label>
                  <input
                    type="text"
                    id="school-input"
                    className="w-full px-4 py-3 bg-slate-50/60 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#7C3AED] focus:bg-white text-sm text-slate-800 transition-all"
                    placeholder="Ví dụ: Trường Tiểu học Kim Đồng"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Custom Structure Option */}
            <div className="border border-slate-100 rounded-2xl bg-slate-50/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="use-custom-outline-checkbox"
                    checked={useCustomOutline}
                    onChange={(e) => {
                      setUseCustomOutline(e.target.checked);
                      if (!e.target.checked) {
                        setCustomOutlineText('');
                        setCustomOutlineError('');
                      }
                    }}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="use-custom-outline-checkbox" className="text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer select-none">
                    Sử dụng cấu trúc khung tùy chỉnh của Thầy/Cô (Không bắt buộc)
                  </label>
                </div>
              </div>

              {useCustomOutline && (
                <div className="space-y-4 animate-fade-in text-xs border-t border-slate-100 pt-4">
                  <p className="text-slate-500 leading-relaxed">
                    Sáng kiến của Thầy/Cô có cấu trúc chương/phần riêng theo quy định cụ thể của trường hay địa phương? Hãy nhập tên các phần hoặc tải lên file văn bản của mình. AI sẽ được tối ưu để biên soạn chính xác 100% theo các phần này.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-600" htmlFor="custom-outline-textarea">
                        Dán hoặc gõ danh sách (Mỗi dòng là một phần/chương):
                      </label>
                      <textarea
                        id="custom-outline-textarea"
                        rows={5}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-[#7C3AED] text-xs text-slate-800 placeholder-slate-400 font-sans transition-all"
                        placeholder="Ví dụ:&#10;Phần I: Mở đầu&#10;Phần II: Thực trạng áp dụng tại trường&#10;Phần III: Các biện pháp cải tiến giáo dục&#10;Phần IV: Kết quả khảo nghiệm thực nghiệm&#10;Phần V: Kết luận và Bài học kinh nghiệm"
                        value={customOutlineText}
                        onChange={(e) => {
                          setCustomOutlineText(e.target.value);
                          if (e.target.value.trim()) {
                            setCustomOutlineError('');
                          }
                        }}
                      />
                    </div>

                    <div className="flex flex-col justify-between space-y-2">
                      <div className="space-y-1.5">
                        <span className="block text-[11px] font-bold text-slate-600">
                          Hoặc chọn/kéo thả file cấu trúc chuẩn:
                        </span>
                        
                        <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-4 bg-white flex flex-col items-center justify-center text-center space-y-2 cursor-pointer transition-all relative group h-[105px]">
                          <input
                            type="file"
                            accept=".docx,.pdf,.txt"
                            onChange={handleFileUpload}
                            disabled={parsingFile}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10 disabled:cursor-not-allowed"
                          />
                          {parsingFile ? (
                            <div className="flex flex-col items-center justify-center space-y-1.5">
                              <RefreshCw size={20} className="text-indigo-600 animate-spin" />
                              <span className="text-[10px] font-bold text-slate-600 animate-pulse">Đang trích xuất cấu trúc đề tài...</span>
                              <span className="text-[8px] text-slate-400">AI đang xử lý tài liệu</span>
                            </div>
                          ) : (
                            <>
                              <div className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 flex items-center justify-center transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-upload-cloud"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
                              </div>
                              <span className="text-[10px] font-bold text-slate-600">Tải file Word (.docx), PDF (.pdf), TXT</span>
                              <span className="text-[8px] text-slate-400">Tự động trích xuất các tiêu đề/phần khung chuẩn</span>
                            </>
                          )}
                        </div>
                      </div>

                      {customOutlineError && (
                        <div className="text-[10px] text-red-500 font-semibold bg-red-50 border border-red-100 p-1.5 rounded-lg">
                          {customOutlineError}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4">
              <button
                type="submit"
                id="submit-analysis-btn"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#7C3AED] to-[#FF6B00] hover:from-[#6d28d9] hover:to-[#e05e00] text-white py-4 rounded-2xl font-semibold text-sm flex items-center justify-center space-x-2 transition-all duration-300 shadow-lg shadow-indigo-500/10 cursor-pointer disabled:opacity-75 disabled:cursor-wait"
              >
                {loading ? (
                  <>
                    <RefreshCw className="animate-spin" size={18} />
                    <span>AI Đang Phân Tích Tính Mới và Tính Thực Tiễn...</span>
                  </>
                ) : (
                  <>
                    <span>Bước 1: Chẩn Đoán & Tối Ưu Hóa Tên Đề Tài</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Phase 2: Review AI Analysis and Confirm */
          <div className="p-8 space-y-6">
            <div className="border border-emerald-100 bg-emerald-50/30 rounded-2xl p-6">
              <div className="flex items-center space-x-2 mb-3">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span className="text-emerald-700 font-semibold text-xs uppercase tracking-wider">AI Đã Hoàn Thành Chẩn Đoán Sáng Kiến</span>
              </div>
              
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tên Đề Tài Đã Được AI Tối Ưu Hóa Kỹ Thuật (Nên Dùng)</div>
                  <div className="text-base font-bold text-slate-800 leading-snug">
                    "{analysisResult.analyzedTitle}"
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="text-xs font-bold text-slate-700 mb-1 flex items-center space-x-1.5 text-indigo-700">
                      <Sparkles size={14} />
                      <span>Tính mới & Tính sáng tạo (Innovation)</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed text-justify">
                      {analysisResult.innovation}
                    </p>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="text-xs font-bold text-slate-700 mb-1 flex items-center space-x-1.5 text-amber-700">
                      <Award size={14} />
                      <span>Khả năng áp dụng thực tiễn (Practicality)</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed text-justify">
                      {analysisResult.practicality}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-slate-700 mb-1">Gợi ý cải tiến cốt lõi để nâng điểm Hội đồng:</div>
                  <ul className="space-y-1.5">
                    {analysisResult.suggestions?.map((sug: string, idx: number) => (
                      <li key={idx} className="text-xs text-slate-600 flex items-start space-x-1.5">
                        <span className="text-[#FF6B00] font-bold shrink-0">•</span>
                        <span>{sug}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Cấu trúc khung 6 phần được tạo tự động:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-2">
                {analysisResult.standardOutlines?.map((item: any, idx: number) => (
                  <div key={item.id} className="flex items-center space-x-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700">
                    <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800 shrink-0">{item.title}</span>
                    <span className="text-slate-400 truncate">| {item.description}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                id="back-input-btn"
                onClick={() => setPhase('input')}
                className="w-1/3 border border-slate-200 hover:border-slate-300 text-slate-600 font-semibold text-sm py-4 rounded-2xl flex items-center justify-center space-x-1.5 transition-all"
              >
                <span>Chỉnh sửa lại</span>
              </button>

              <button
                type="button"
                id="confirm-setup-btn"
                onClick={handleConfirmAndProceed}
                className="w-2/3 bg-gradient-to-r from-[#7C3AED] to-[#FF6B00] hover:from-[#6d28d9] hover:to-[#e05e00] text-white py-4 rounded-2xl font-semibold text-sm flex items-center justify-center space-x-1.5 transition-all duration-300 shadow-lg shadow-indigo-500/10 cursor-pointer"
              >
                <span>Vào Không Gian Soạn Thảo</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
