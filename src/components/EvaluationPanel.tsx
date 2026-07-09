import React, { useState, useRef, useEffect } from 'react';
import { 
  Trophy, Star, Award, Shield, MessageSquare, AlertCircle, 
  ArrowLeft, CheckCircle2, ChevronRight, HelpCircle, Send, User, RefreshCw
} from 'lucide-react';
import { EvaluationResult, Initiative } from '../types';

interface EvaluationPanelProps {
  evaluation: EvaluationResult;
  onClose: () => void;
  title: string;
  initiative: Initiative;
}

export default function EvaluationPanel({
  evaluation,
  onClose,
  title,
  initiative
}: EvaluationPanelProps) {
  const [activeTab, setActiveTab] = useState<'criteria' | 'panel' | 'defense' | 'simulator'>('criteria');

  // Simulator States
  const [activeJudgeId, setActiveJudgeId] = useState('judge-1');
  const [simStarted, setSimStarted] = useState(false);
  const [simMessages, setSimMessages] = useState<any[]>([]);
  const [simInput, setSimInput] = useState('');
  const [isSimSending, setIsSimSending] = useState(false);
  const [simFinished, setSimFinished] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tự động cuộn xuống dưới cùng của khung chat giả lập
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simMessages, isSimSending]);

  const startSimulation = async () => {
    setSimStarted(true);
    setIsSimSending(true);
    setSimFinished(false);
    setSimMessages([]);

    try {
      const apiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      const selectedModel = localStorage.getItem('GEMINI_SELECTED_MODEL') || 'gemini-3-flash-preview';

      const response = await fetch('/api/simulate-defense', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-gemini-key': apiKey,
          'x-gemini-model': selectedModel
        },
        body: JSON.stringify({
          title: initiative.title,
          subject: initiative.subject,
          grade: initiative.grade,
          category: initiative.category,
          outline: initiative.outline,
          judgeId: activeJudgeId,
          chatHistory: [],
          userMessage: 'Xin chào hội đồng, tôi đã sẵn sàng báo cáo chuyên đề và trả lời các câu hỏi phản biện.'
        })
      });

      if (!response.ok) {
        throw new Error('Lỗi kết nối đến hội đồng ảo');
      }

      const data = await response.json();
      setSimMessages([
        {
          id: 'msg_judge_start',
          sender: 'judge',
          text: data.reply,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err: any) {
      console.error(err);
      alert('Không thể bắt đầu phản biện AI: ' + err.message);
      setSimStarted(false);
    } finally {
      setIsSimSending(false);
    }
  };

  const sendSimMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simInput.trim() || isSimSending) return;

    const userText = simInput;
    setSimInput('');

    const newMsg = {
      id: 'msg_u_' + Date.now(),
      sender: 'user' as const,
      text: userText,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    const updated = [...simMessages, newMsg];
    setSimMessages(updated);
    setIsSimSending(true);

    try {
      const apiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      const selectedModel = localStorage.getItem('GEMINI_SELECTED_MODEL') || 'gemini-3-flash-preview';

      const chatHistoryForServer = updated.map(m => ({
        sender: m.sender === 'user' ? 'user' : 'model',
        text: m.text
      }));

      const response = await fetch('/api/simulate-defense', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-gemini-key': apiKey,
          'x-gemini-model': selectedModel
        },
        body: JSON.stringify({
          title: initiative.title,
          subject: initiative.subject,
          grade: initiative.grade,
          category: initiative.category,
          outline: initiative.outline,
          judgeId: activeJudgeId,
          chatHistory: chatHistoryForServer.slice(-6),
          userMessage: userText
        })
      });

      if (!response.ok) {
        throw new Error('Lỗi phản hồi từ giám khảo');
      }

      const data = await response.json();
      setSimMessages(prev => [
        ...prev,
        {
          id: 'msg_judge_' + Date.now(),
          sender: 'judge' as const,
          text: data.reply,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err: any) {
      console.error(err);
      alert('Lỗi gửi tin nhắn phản biện: ' + err.message);
    } finally {
      setIsSimSending(false);
    }
  };

  const endSimulationAndGrade = async () => {
    if (confirm('Thầy/Cô có muốn kết thúc buổi bảo vệ để nhận kết quả đánh giá và nhận xét chung không?')) {
      setIsSimSending(true);
      
      try {
        const apiKey = localStorage.getItem('GEMINI_API_KEY') || '';
        const selectedModel = localStorage.getItem('GEMINI_SELECTED_MODEL') || 'gemini-3-flash-preview';

        const chatHistoryForServer = simMessages.map(m => ({
          sender: m.sender === 'user' ? 'user' : 'model',
          text: m.text
        }));

        const response = await fetch('/api/simulate-defense', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-gemini-key': apiKey,
            'x-gemini-model': selectedModel
          },
          body: JSON.stringify({
            title: initiative.title,
            subject: initiative.subject,
            grade: initiative.grade,
            category: initiative.category,
            outline: initiative.outline,
            judgeId: activeJudgeId,
            chatHistory: chatHistoryForServer,
            userMessage: 'Tôi xin phép kết thúc phần trả lời phản biện của mình. Xin hội đồng cho biết nhận xét tổng quát và số điểm đánh giá cho phần trả lời phản biện vừa rồi của tôi.'
          })
        });

        if (!response.ok) {
          throw new Error('Lỗi phản hồi từ giám khảo');
        }

        const data = await response.json();
        setSimMessages(prev => [
          ...prev,
          {
            id: 'msg_judge_end',
            sender: 'judge' as const,
            text: data.reply,
            timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setSimFinished(true);
      } catch (err: any) {
        console.error(err);
        alert('Lỗi nhận kết quả đánh giá: ' + err.message);
      } finally {
        setIsSimSending(false);
      }
    }
  };

  // Parse color or rating stars
  const renderStars = (rating: number) => {
    return (
      <div className="flex space-x-0.5">
        {[...Array(10)].map((_, idx) => (
          <Star 
            key={idx} 
            size={10} 
            className={`${idx < rating ? 'text-[#FF6B00] fill-[#FF6B00]' : 'text-slate-200'}`} 
          />
        ))}
      </div>
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (score >= 80) return 'text-indigo-600 bg-indigo-50 border-indigo-100';
    if (score >= 70) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-red-600 bg-red-50 border-red-100';
  };

  return (
    <div id="evaluation-panel-container" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-sans select-none">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/30">
          <div className="flex items-center space-x-3">
            <button 
              id="back-to-editor-btn"
              onClick={onClose}
              className="p-2 hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-all rounded-xl cursor-pointer"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <span className="text-[9px] bg-[#FF6B00]/10 text-[#FF6B00] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Đánh giá toàn diện
              </span>
              <h2 className="text-sm font-bold text-slate-800 mt-0.5 max-w-[500px] truncate">
                Đề tài: "{title}"
              </h2>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className={`px-4 py-2 rounded-2xl border flex items-center space-x-2 ${getScoreColor(evaluation.score)}`}>
              <Trophy size={16} className="shrink-0" />
              <span className="text-base font-extrabold">{evaluation.score}</span>
              <span className="text-xs font-semibold text-slate-400">/ 100đ</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex px-6 border-b border-slate-100 shrink-0 bg-slate-50/10">
          <button
            id="tab-criteria-btn"
            onClick={() => setActiveTab('criteria')}
            className={`px-5 py-4 text-xs font-bold border-b-2 transition-all relative ${
              activeTab === 'criteria' 
                ? 'border-[#7C3AED] text-indigo-900' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Tiêu chí Chấm Điểm
          </button>
          <button
            id="tab-panel-btn"
            onClick={() => setActiveTab('panel')}
            className={`px-5 py-4 text-xs font-bold border-b-2 transition-all relative ${
              activeTab === 'panel' 
                ? 'border-[#7C3AED] text-indigo-900' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Nhận Xét Hội Đồng
          </button>
          <button
            id="tab-defense-btn"
            onClick={() => setActiveTab('defense')}
            className={`px-5 py-4 text-xs font-bold border-b-2 transition-all relative ${
              activeTab === 'defense' 
                ? 'border-[#7C3AED] text-indigo-900' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Cơ sở Phản biện bảo vệ
          </button>
          <button
            id="tab-simulator-btn"
            onClick={() => setActiveTab('simulator')}
            className={`px-5 py-4 text-xs font-bold border-b-2 transition-all relative ${
              activeTab === 'simulator' 
                ? 'border-[#7C3AED] text-indigo-900' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Phòng phản biện giả lập (Hội đồng ảo)
          </button>
        </div>

        {/* Main scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-slate-50/30">
          
          {activeTab === 'criteria' && (
            <div className="space-y-6">
              
              {/* General Feedback summary */}
              <div className="bg-gradient-to-r from-indigo-50/80 to-purple-50/50 border border-indigo-100/50 rounded-2xl p-5 flex items-start space-x-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/10">
                  <Award size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Khảo luận của Trợ lý Hội đồng ảo</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed text-justify">
                    {evaluation.generalFeedback}
                  </p>
                </div>
              </div>

              {/* Grid of criterion */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Innovation */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-slate-800">1. Tính mới & Tính sáng tạo</span>
                      <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">{evaluation.criteria.innovation.score}đ</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-justify leading-relaxed">
                      {evaluation.criteria.innovation.feedback}
                    </p>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${evaluation.criteria.innovation.score}%` }}></div>
                  </div>
                </div>

                {/* 2. Practicality */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-slate-800">2. Tính thực tiễn & Khả thi</span>
                      <span className="text-xs font-extrabold text-[#FF6B00] bg-orange-50 px-2.5 py-0.5 rounded-full">{evaluation.criteria.practicality.score}đ</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-justify leading-relaxed">
                      {evaluation.criteria.practicality.feedback}
                    </p>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div className="bg-[#FF6B00] h-full rounded-full" style={{ width: `${evaluation.criteria.practicality.score}%` }}></div>
                  </div>
                </div>

                {/* 3. Methodology */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-slate-800">3. Tính khoa học & Sư phạm</span>
                      <span className="text-xs font-extrabold text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full">{evaluation.criteria.methodology.score}đ</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-justify leading-relaxed">
                      {evaluation.criteria.methodology.feedback}
                    </p>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div className="bg-[#7C3AED] h-full rounded-full" style={{ width: `${evaluation.criteria.methodology.score}%` }}></div>
                  </div>
                </div>

                {/* 4. Replicability */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-slate-800">4. Tính lan tỏa & Khả năng nhân rộng</span>
                      <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">{evaluation.criteria.replicability.score}đ</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-justify leading-relaxed">
                      {evaluation.criteria.replicability.feedback}
                    </p>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full" style={{ width: `${evaluation.criteria.replicability.score}%` }}></div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'panel' && (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Thành viên hội đồng thẩm định</div>
              
              <div className="grid grid-cols-1 gap-4">
                {evaluation.panelComments?.map((panel) => (
                  <div key={panel.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-start space-x-4">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${panel.avatarColor || 'from-slate-500 to-slate-700'} text-white font-extrabold flex items-center justify-center text-sm shrink-0 shadow-sm`}>
                      {panel.avatar}
                    </div>
                    <div className="flex-1 space-y-2 select-text">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-800">{panel.name}</h4>
                          <span className="text-[10px] text-slate-400 font-semibold">{panel.role}</span>
                        </div>
                        <div className="flex flex-col items-start sm:items-end mt-1 sm:mt-0">
                          {renderStars(panel.rating)}
                          <span className="text-[10px] text-slate-400 font-semibold mt-1">Xu hướng chấm: {panel.tone}</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed text-justify border-t border-slate-50 pt-2">
                        {panel.comment}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'defense' && (
            <div className="space-y-4 select-text">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start space-x-3 text-xs text-amber-700">
                <HelpCircle className="shrink-0 mt-0.5" size={14} />
                <div>
                  <span className="font-bold">Bí quyết bảo vệ sáng kiến: </span>
                  Dưới đây là 3 câu hỏi hóc búa nhất mà hội đồng giám khảo thường xuyên đặt ra cho các đề tài thuộc hướng nghiên cứu này, kèm theo gợi ý trả lời chuyên nghiệp giúp Thầy/Cô tự tin bảo vệ đề tài xuất sắc nhất.
                </div>
              </div>

              <div className="space-y-4">
                {evaluation.suggestedQuestions?.map((q, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2.5">
                    <div className="flex items-start space-x-2.5">
                      <span className="w-5 h-5 rounded-lg bg-orange-100 text-[#FF6B00] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        Q{idx + 1}
                      </span>
                      <h4 className="text-xs font-bold text-slate-800 leading-snug">
                        {q.question}
                      </h4>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl text-xs text-slate-600 leading-relaxed text-justify border-l-2 border-[#7C3AED]">
                      <span className="font-bold text-indigo-900 block mb-1">Gợi ý cách đối đáp thông minh:</span>
                      {q.suggestedAnswer}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'simulator' && (
            <div className="h-full flex flex-col min-h-0 bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
              {!simStarted ? (
                /* Setup Screen */
                <div className="flex-1 overflow-y-auto p-8 flex flex-col justify-center items-center text-center space-y-6 max-w-2xl mx-auto select-none">
                  <div className="w-14 h-14 bg-gradient-to-tr from-[#7C3AED] to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-md">
                    <MessageSquare size={26} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">Phòng Phản Biện Sáng Kiến Giả Lập</h3>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      Luyện tập trả lời trực tiếp các câu hỏi chất chất vấn từ hội đồng giám khảo ảo. AI sẽ tự động phân tích sáng kiến của bạn để đặt câu hỏi thử thách sát thực tế nhất.
                    </p>
                  </div>

                  <div className="w-full space-y-3">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">Chọn Giám khảo phản biện:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        {
                          id: "judge-1",
                          name: "ThS. Nguyễn Minh Tuấn",
                          role: "Chủ tịch Hội đồng",
                          desc: "Thực tế & Lan tỏa",
                          border: "border-orange-200 bg-orange-50/10 text-orange-700"
                        },
                        {
                          id: "judge-2",
                          name: "Cô Lê Thị Thanh Thủy",
                          role: "Ủy viên phản biện",
                          desc: "Sư phạm & Tỉ mỉ",
                          border: "border-indigo-200 bg-indigo-50/10 text-indigo-700"
                        },
                        {
                          id: "judge-3",
                          name: "ThS. Đỗ Quốc Anh",
                          role: "Ủy viên hội đồng",
                          desc: "Pháp lý & Công văn",
                          border: "border-emerald-200 bg-emerald-50/10 text-emerald-700"
                        }
                      ].map((judge) => {
                        const isSel = activeJudgeId === judge.id;
                        return (
                          <button
                            key={judge.id}
                            type="button"
                            onClick={() => setActiveJudgeId(judge.id)}
                            className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                              isSel 
                                ? 'border-[#7C3AED] ring-2 ring-[#7C3AED]/10 bg-indigo-50/10' 
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <span className="font-bold text-xs text-slate-800">{judge.name}</span>
                            <span className="text-[10px] text-slate-400 mt-1 font-medium">{judge.role}</span>
                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full mt-3 self-start ${isSel ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                              {judge.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={startSimulation}
                    className="bg-gradient-to-r from-[#7C3AED] to-[#FF6B00] hover:from-[#6d28d9] hover:to-[#e05e00] text-white px-8 py-3.5 rounded-2xl font-bold text-xs flex items-center space-x-1.5 transition-all shadow-lg shadow-indigo-500/10 cursor-pointer"
                  >
                    <span>Bước vào Phòng phản biện</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              ) : (
                /* Active Chat Interface */
                <div className="flex-1 flex flex-col min-h-0 bg-slate-50/10 h-full relative">
                  
                  {/* Chat Info Header */}
                  <div className="p-4 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                        {activeJudgeId === 'judge-1' ? 'NMT' : activeJudgeId === 'judge-2' ? 'LTT' : 'DQA'}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">
                          {activeJudgeId === 'judge-1' ? 'ThS. Nguyễn Minh Tuấn' : activeJudgeId === 'judge-2' ? 'Cô Lê Thị Thanh Thủy' : 'ThS. Đỗ Quốc Anh'}
                        </h4>
                        <span className="text-[9px] text-slate-400 font-semibold">Đang phản biện chuyên đề...</span>
                      </div>
                    </div>

                    {!simFinished && (
                      <button
                        onClick={endSimulationAndGrade}
                        disabled={isSimSending}
                        className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/50 px-3.5 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        Kết thúc & Chấm điểm
                      </button>
                    )}
                  </div>

                  {/* Messages Scroll Area */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0 select-text">
                    {simMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col max-w-[80%] ${
                          msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                        }`}
                      >
                        <div
                          className={`p-3 rounded-2xl text-[11px] leading-relaxed ${
                            msg.sender === 'user'
                              ? 'bg-gradient-to-r from-[#7C3AED] to-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-600/10'
                              : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none shadow-sm'
                          }`}
                        >
                          {msg.text.split('\n').map((line: string, i: number) => (
                            <p key={i} className={i > 0 ? 'mt-1' : ''}>{line}</p>
                          ))}
                        </div>
                        <span className="text-[8px] text-slate-400 mt-1 font-semibold">
                          {msg.timestamp}
                        </span>
                      </div>
                    ))}
                    {isSimSending && (
                      <div className="flex flex-col max-w-[80%] mr-auto items-start">
                        <div className="p-3 rounded-2xl bg-white border border-slate-100 rounded-tl-none shadow-sm flex items-center space-x-2">
                          <div className="flex space-x-1">
                            <span className="w-1.5 h-1.5 bg-[#7C3AED] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-1.5 h-1.5 bg-[#7C3AED] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-1.5 h-1.5 bg-[#7C3AED] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium">Giám khảo đang viết nhận xét...</span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input form */}
                  <div className="p-4 border-t border-slate-100 bg-white shrink-0">
                    {simFinished ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center space-x-1">
                          <CheckCircle2 size={12} />
                          <span>Buổi phản biện đã kết thúc và được lưu kết quả.</span>
                        </span>
                        <button
                          onClick={() => {
                            setSimStarted(false);
                            setSimMessages([]);
                            setSimFinished(false);
                          }}
                          className="flex items-center space-x-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                        >
                          <RefreshCw size={11} />
                          <span>Thực hiện buổi mới</span>
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={sendSimMessage} className="flex items-center space-x-2">
                        <input
                          type="text"
                          disabled={isSimSending}
                          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 focus:border-indigo-500 rounded-xl text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:bg-white text-slate-700 placeholder-slate-400 transition-all font-sans"
                          placeholder="Nhập câu trả lời bảo vệ của bạn..."
                          value={simInput}
                          onChange={(e) => setSimInput(e.target.value)}
                        />
                        <button
                          type="submit"
                          disabled={isSimSending || !simInput.trim()}
                          className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all cursor-pointer shadow-md shadow-indigo-600/10 shrink-0 disabled:opacity-50"
                        >
                          <Send size={12} />
                        </button>
                      </form>
                    )}
                  </div>

                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50/20">
          <button
            id="close-evaluation-btn"
            onClick={onClose}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md shadow-indigo-600/10"
          >
            Quay lại biên soạn bản thảo
          </button>
        </div>

      </div>
    </div>
  );
}
