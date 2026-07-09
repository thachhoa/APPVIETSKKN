import React, { useState, useEffect } from 'react';
import { X, Key, Cpu, ExternalLink, Check, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMandatory?: boolean;
}

const MODELS = [
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash (Preview)',
    desc: 'Mô hình mặc định. Tốc độ xử lý cực nhanh, phản hồi tức thì, phù hợp cho soạn thảo văn bản nhanh.',
    badge: 'Mặc định'
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro (Preview)',
    desc: 'Mô hình cao cấp nhất. Phân tích ngữ cảnh sâu sắc, lập luận sư phạm vững chắc, soạn bài chất lượng cao.',
    badge: 'Học thuật cao'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    desc: 'Mô hình ổn định, tối ưu hóa hiệu năng và độ chính xác của các bảng số liệu giáo dục.',
    badge: 'Ổn định'
  }
];

export default function SettingsModal({ isOpen, onClose, isMandatory = false }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    const savedKey = localStorage.getItem('GEMINI_API_KEY') || '';
    const savedModel = localStorage.getItem('GEMINI_SELECTED_MODEL') || 'gemini-3-flash-preview';
    setApiKey(savedKey);
    setSelectedModel(savedModel);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setValidationError('Vui lòng nhập API Key để tiếp tục sử dụng ứng dụng.');
      return;
    }
    
    // Save to local storage
    localStorage.setItem('GEMINI_API_KEY', apiKey.trim());
    localStorage.setItem('GEMINI_SELECTED_MODEL', selectedModel);
    
    setValidationError('');
    setSaveSuccess(true);
    
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
      // Reload page to refresh system state and trigger re-render
      window.location.reload();
    }, 1000);
  };

  return (
    <div id="settings-modal-overlay" className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in animate-duration-200">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-indigo-600 flex items-center justify-center text-white">
              <Key size={14} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 font-display">Cấu Hình AI & API Key</h3>
              <p className="text-[10px] text-slate-400 font-medium">Thiết lập kết nối với Google Gemini</p>
            </div>
          </div>
          {!isMandatory && (
            <button
              id="close-settings-btn"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5 flex-1 select-none">
          {isMandatory && (
            <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-start space-x-3 text-xs text-red-700 animate-pulse">
              <AlertCircle className="shrink-0 mt-0.5" size={16} />
              <div>
                <span className="font-bold">Yêu cầu thiết lập: </span>
                Vui lòng nhập API Key cá nhân của bạn để khởi chạy không gian biên soạn SKKN. Hệ thống sẽ lưu trữ khóa này cục bộ trên trình duyệt của bạn một cách bảo mật.
              </div>
            </div>
          )}

          {validationError && (
            <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex items-start space-x-2 text-xs text-red-700">
              <AlertCircle className="shrink-0 mt-0.5" size={14} />
              <span>{validationError}</span>
            </div>
          )}

          {/* API Key Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider" htmlFor="api-key-input">
                Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center space-x-1"
              >
                <span>Lấy API key miễn phí</span>
                <ExternalLink size={10} />
              </a>
            </div>
            <input
              id="api-key-input"
              type="password"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#7C3AED] focus:bg-white text-xs text-slate-800 placeholder-slate-400 font-sans transition-all"
              placeholder="Dán mã API Key của bạn tại đây (AIzaSy...)"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (e.target.value.trim()) setValidationError('');
              }}
              required
            />
          </div>

          {/* Model selection cards */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Lựa Chọn Mô Hình Trí Tuệ Nhân Tạo (AI Model)
            </label>
            <div className="grid grid-cols-1 gap-3">
              {MODELS.map((model) => {
                const isSelected = selectedModel === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    id={`model-card-${model.id}`}
                    onClick={() => setSelectedModel(model.id)}
                    className={`w-full p-4 rounded-2xl border text-left flex items-start space-x-3 transition-all cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? 'border-[#7C3AED] bg-indigo-50/20 ring-2 ring-indigo-500/10'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-[#7C3AED] bg-[#7C3AED] text-white' : 'border-slate-300 bg-white'}`}>
                      {isSelected && <Check size={10} strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-slate-800">{model.name}</span>
                        <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          model.id === 'gemini-3-flash-preview'
                            ? 'bg-indigo-50 text-indigo-700'
                            : model.id === 'gemini-3-pro-preview'
                            ? 'bg-orange-50 text-[#FF6B00]'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {model.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{model.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              id="save-settings-btn"
              className="w-full bg-gradient-to-r from-[#7C3AED] to-[#FF6B00] hover:from-[#6d28d9] hover:to-[#e05e00] text-white py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-lg shadow-indigo-500/10 cursor-pointer"
            >
              {saveSuccess ? (
                <>
                  <Check size={14} />
                  <span>Đã lưu thành công!</span>
                </>
              ) : (
                <>
                  <Cpu size={14} />
                  <span>Lưu Cấu Hình & Bắt Đầu</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
