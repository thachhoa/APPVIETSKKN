import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, MessageSquare, AlertCircle, Trash2 } from 'lucide-react';
import { Message } from '../types';

interface AIPanelProps {
  chatHistory: Message[];
  onSendMessage: (text: string) => void;
  activeSectionTitle: string;
  isSending: boolean;
  onClearHistory: () => void;
}

const QUICK_ACTIONS = [
  { label: 'Sửa văn phong học thuật', prompt: 'Hãy giúp tôi trau chuốt lại đoạn văn trên theo phong cách học thuật, chuẩn mực khoa học sư phạm Việt Nam.' },
  { label: 'Thêm số liệu mẫu', prompt: 'Hãy thiết kế giúp tôi một bảng biểu số liệu khảo sát thực tế (trước và sau) cho phần này dưới dạng bảng Markdown.' },
  { label: 'Gợi ý giải pháp sáng tạo', prompt: 'Hãy gợi ý cho tôi 3 giải pháp đổi mới phương pháp giảng dạy cực kỳ sáng tạo cho đề tài này.' },
  { label: 'Viết lời kết chuẩn', prompt: 'Hãy soạn giúp tôi một lời kết luận và bài học kinh nghiệm sâu sắc cho đề tài này.' }
];

export default function AIPanel({
  chatHistory,
  onSendMessage,
  activeSectionTitle,
  isSending,
  onClearHistory
}: AIPanelProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isSending]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  const handleActionClick = (prompt: string) => {
    onSendMessage(prompt);
  };

  return (
    <div id="ai-panel-container" className="w-full md:w-[320px] h-[500px] md:h-screen border-t md:border-t-0 md:border-l border-slate-100 bg-white flex flex-col justify-between shrink-0 font-sans">
      
      {/* Header */}
      <div className="p-4 border-b border-slate-50 flex items-center justify-between shrink-0 bg-slate-50/50">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#7C3AED] to-indigo-600 flex items-center justify-center text-white">
            <Sparkles size={12} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800">Trợ lý học thuật AI</h3>
            <p className="text-[9px] text-slate-400 font-semibold uppercase">Theo ngữ cảnh: {activeSectionTitle}</p>
          </div>
        </div>

        {chatHistory.length > 0 && (
          <button 
            id="clear-chat-btn"
            onClick={onClearHistory}
            className="text-slate-400 hover:text-red-500 transition-colors p-1 hover:bg-slate-100 rounded-md"
            title="Xóa lịch sử chat"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Messages list (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-slate-50/20">
        {chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-3">
              <MessageSquare size={20} />
            </div>
            <h4 className="text-xs font-bold text-slate-700">Trao đổi sư phạm</h4>
            <p className="text-[10px] text-slate-400 mt-1 max-w-[180px] leading-relaxed mx-auto">
              Hỏi bất kỳ điều gì, AI sẽ tư vấn dựa trên ngữ cảnh phần sáng kiến bạn đang chọn.
            </p>
          </div>
        ) : (
          chatHistory.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col max-w-[85%] ${
                msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
              }`}
            >
              <div 
                className={`p-3 rounded-2xl text-[11px] leading-relaxed select-text ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-600/10'
                    : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none shadow-sm'
                }`}
              >
                {/* Parse newline simple formatting in messages */}
                {msg.text.split('\n').map((line, i) => (
                  <p key={i} className={i > 0 ? 'mt-1' : ''}>{line}</p>
                ))}
              </div>
              <span className="text-[8px] text-slate-400 mt-1 font-semibold">
                {msg.timestamp}
              </span>
            </div>
          ))
        )}

        {isSending && (
          <div className="flex flex-col max-w-[85%] mr-auto items-start">
            <div className="p-3 rounded-2xl bg-white border border-slate-100 rounded-tl-none shadow-sm flex items-center space-x-2">
              <div className="flex space-x-1">
                <span className="w-1.5 h-1.5 bg-[#7C3AED] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-[#7C3AED] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-[#7C3AED] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Trợ lý đang phân tích...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Footer controls & prompt suggestions */}
      <div className="p-4 border-t border-slate-100 bg-white shrink-0 space-y-3">
        {/* Quick action buttons */}
        {chatHistory.length === 0 && (
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Gợi ý hành động nhanh</span>
            <div className="grid grid-cols-1 gap-1.5">
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={i}
                  id={`ai-quick-action-${i}`}
                  onClick={() => handleActionClick(action.prompt)}
                  className="text-left px-2.5 py-1.5 bg-slate-50 border border-slate-100 hover:border-slate-200 hover:bg-slate-100 rounded-xl text-[10px] text-slate-600 font-medium transition-all truncate"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input form */}
        <form onSubmit={handleSend} className="flex items-center space-x-2">
          <input
            type="text"
            id="ai-panel-input"
            disabled={isSending}
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-100 focus:border-indigo-500 rounded-xl text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:bg-white text-slate-700 placeholder-slate-400 transition-all font-sans"
            placeholder="Nhập nội dung hỏi trợ lý AI..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button
            type="submit"
            id="ai-panel-send-btn"
            disabled={isSending || !inputText.trim()}
            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all cursor-pointer shadow-md shadow-indigo-600/10 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={12} />
          </button>
        </form>
      </div>

    </div>
  );
}
