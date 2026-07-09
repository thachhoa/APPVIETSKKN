import React, { useState, useEffect } from 'react';
import { Sparkles, Trophy, RefreshCw, HelpCircle } from 'lucide-react';
import { Initiative, SectionOutline, Message, InitiativeCategory } from './types';
import InitialSetup from './components/InitialSetup';
import Sidebar from './components/Sidebar';
import MainEditor from './components/MainEditor';
import AIPanel from './components/AIPanel';
import EvaluationPanel from './components/EvaluationPanel';
import Header from './components/Header';
import SettingsModal from './components/SettingsModal';

const LOCAL_STORAGE_KEY = 'SKKN_2026_PRO_INITIATIVE';
const LOCAL_STORAGE_CHAT_KEY = 'SKKN_2026_PRO_CHAT_';

export default function App() {
  const [initiative, setInitiative] = useState<Initiative | null>(null);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isGeneratingSection, setIsGeneratingSection] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [apiKeyExists, setApiKeyExists] = useState(false);
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const key = localStorage.getItem('GEMINI_API_KEY') || '';
    if (key.trim().length > 0) {
      setApiKeyExists(true);
    } else {
      setApiKeyExists(false);
      setShowSettingsModal(true);
    }

    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setInitiative(parsed);
        if (parsed.outline && parsed.outline.length > 0) {
          setCurrentSectionId(parsed.outline[0].id);
          
          // Load chat history for this specific initiative
          const savedChat = localStorage.getItem(`${LOCAL_STORAGE_CHAT_KEY}${parsed.id}`);
          if (savedChat) {
            setChatHistory(JSON.parse(savedChat));
          }
        }
      } catch (e) {
        console.error('Lỗi load local storage:', e);
      }
    }
  }, []);

  // Save to local storage whenever initiative changes
  const saveInitiative = (updated: Initiative | null) => {
    setInitiative(updated);
    if (updated) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  };

  const handleSetupComplete = (data: {
    title: string;
    subject: string;
    grade: string;
    category: InitiativeCategory;
    author: string;
    school: string;
    analyzedData: any;
    uploadedSections?: { title: string; content: string }[];
  }) => {
    // Build initial outline from analysis và ghép nội dung gốc từ file Word
    const initialOutline: SectionOutline[] = data.analyzedData.standardOutlines.map((item: any) => {
      const matched = data.uploadedSections?.find(
        s => s.title.toLowerCase().trim() === item.vietnameseTitle.toLowerCase().trim() ||
             s.title.toLowerCase().trim() === item.title.toLowerCase().trim()
      );
      const content = matched ? matched.content : '';

      return {
        id: item.id,
        title: item.title,
        vietnameseTitle: item.vietnameseTitle,
        description: item.description,
        content: content,
        status: content ? ('completed' as const) : ('idle' as const),
        aiSuggestedMetrics: item.aiSuggestedMetrics || [],
        aiSuggestedEvidences: item.aiSuggestedEvidences || []
      };
    });

    const newInitiative: Initiative = {
      id: 'skkn_' + Date.now(),
      title: data.title,
      subject: data.subject,
      grade: data.grade,
      category: data.category,
      author: data.author,
      school: data.school,
      outline: initialOutline,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveInitiative(newInitiative);
    setCurrentSectionId(initialOutline[0]?.id || null);
    
    // Set up initial greeting message
    const welcomeMsg: Message = {
      id: 'welcome_' + Date.now(),
      sender: 'ai',
      text: `Xin chào Thầy/Cô ${data.author}! Tôi là Trợ lý AI SKKN 2026 PRO.\n\nTôi đã tạo cấu trúc khung 6 phần tối ưu dựa trên đề tài của Thầy/Cô. Thầy/Cô có thể nhấp vào bất kỳ phần nào bên trái để biên soạn, hoặc nhấp vào "Tự động viết bằng AI" để tôi soạn bản thảo mẫu kèm số liệu thực tế ngay lập tức nhé!`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };
    setChatHistory([welcomeMsg]);
    localStorage.setItem(`${LOCAL_STORAGE_CHAT_KEY}${newInitiative.id}`, JSON.stringify([welcomeMsg]));
  };

  const handleUpdateSectionContent = (id: string, content: string, status: SectionOutline['status']) => {
    if (!initiative) return;

    const updatedOutline = initiative.outline.map(sec => 
      sec.id === id ? { ...sec, content, status } : sec
    );

    const updated: Initiative = {
      ...initiative,
      outline: updatedOutline,
      updatedAt: new Date().toISOString()
    };

    saveInitiative(updated);
  };

  const handleGenerateSection = async (id: string): Promise<string> => {
    if (!initiative) return '';
    const section = initiative.outline.find(s => s.id === id);
    if (!section) return '';

    setIsGeneratingSection(true);
    // Mark as drafting first
    handleUpdateSectionContent(id, section.content, 'drafting');

    try {
      const apiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      const selectedModel = localStorage.getItem('GEMINI_SELECTED_MODEL') || 'gemini-3-flash-preview';

      const response = await fetch('/api/generate-section', {
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
          sectionId: id,
          sectionTitle: section.vietnameseTitle,
          description: section.description,
          existingContent: section.content || '',
          contextOutline: initiative.outline.map(s => ({ id: s.id, title: s.vietnameseTitle }))
        }),
      });

      const responseText = await response.text();
      if (!response.ok) {
        let errMsg = 'Lỗi từ dịch vụ soạn thảo AI';
        try {
          const errorData = JSON.parse(responseText);
          errMsg = errorData.error || errorData.details || errMsg;
        } catch {
          const cleanedText = responseText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          errMsg = cleanedText.slice(0, 150) || errMsg;
        }
        throw new Error(errMsg);
      }

      const data = JSON.parse(responseText);
      return data.content || '';
    } catch (error: any) {
      console.error('Lỗi khi soạn thảo bằng AI:', error);
      // Mark as error
      handleUpdateSectionContent(id, section.content, 'error');
      alert(`[LỖI API AI] ${error.message || error}`);
      return '';
    } finally {
      setIsGeneratingSection(false);
    }
  };

  const handleTriggerEvaluation = async () => {
    if (!initiative) return;

    setIsEvaluating(true);
    try {
      const apiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      const selectedModel = localStorage.getItem('GEMINI_SELECTED_MODEL') || 'gemini-3-flash-preview';

      const response = await fetch('/api/evaluate-initiative', {
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
          outline: initiative.outline
        }),
      });

      const responseText = await response.text();
      if (!response.ok) {
        let errMsg = 'Lỗi dịch vụ đánh giá của hội đồng';
        try {
          const errorData = JSON.parse(responseText);
          errMsg = errorData.error || errorData.details || errMsg;
        } catch {
          const cleanedText = responseText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          errMsg = cleanedText.slice(0, 150) || errMsg;
        }
        throw new Error(errMsg);
      }

      const data = JSON.parse(responseText);
      const updated: Initiative = {
        ...initiative,
        evaluation: data
      };

      saveInitiative(updated);
      setShowEvaluation(true);
    } catch (error: any) {
      console.error('Lỗi đánh giá hội đồng:', error);
      alert(`[LỖI API HỘI ĐỒNG] Không thể kết nối đến Hội đồng chấm điểm AI lúc này. Chi tiết: ${error.message || error}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!initiative) return;

    const userMsg: Message = {
      id: 'msg_u_' + Date.now(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    localStorage.setItem(`${LOCAL_STORAGE_CHAT_KEY}${initiative.id}`, JSON.stringify(updatedHistory));
    
    setIsSendingChat(true);

    const activeSection = initiative.outline.find(s => s.id === currentSectionId);

    try {
      const apiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      const selectedModel = localStorage.getItem('GEMINI_SELECTED_MODEL') || 'gemini-3-flash-preview';

      const response = await fetch('/api/chat-assistant', {
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
          sectionTitle: activeSection?.vietnameseTitle || 'Chung',
          content: activeSection?.content || '',
          chatHistory: chatHistory.slice(-6), // Send last 6 messages for context
          userMessage: text
        })
      });

      const responseText = await response.text();
      if (!response.ok) {
        let errMsg = 'Trợ lý AI bận';
        try {
          const errorData = JSON.parse(responseText);
          errMsg = errorData.error || errorData.details || errMsg;
        } catch {
          const cleanedText = responseText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          errMsg = cleanedText.slice(0, 150) || errMsg;
        }
        throw new Error(errMsg);
      }

      const data = JSON.parse(responseText);
      const aiMsg: Message = {
        id: 'msg_ai_' + Date.now(),
        sender: 'ai',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };

      const finalHistory = [...updatedHistory, aiMsg];
      setChatHistory(finalHistory);
      localStorage.setItem(`${LOCAL_STORAGE_CHAT_KEY}${initiative.id}`, JSON.stringify(finalHistory));
    } catch (error: any) {
      console.error('Lỗi chat assistant:', error);
      const errMsg: Message = {
        id: 'msg_ai_err_' + Date.now(),
        sender: 'ai',
        text: `[LỖI AI CHAT] Xin lỗi Thầy/Cô, không thể nhận phản hồi từ trợ lý. Chi tiết lỗi: ${error.message || error}`,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      setChatHistory(prev => [...prev, errMsg]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleExportDocx = async () => {
    if (!initiative) return;

    try {
      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initiative),
      });

      if (!response.ok) {
        throw new Error('Lỗi xuất tài liệu');
      }

      // Convert response to blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SANG_KIEN_KINH_NGHIEM_2026_${initiative.title.substring(0, 20).toUpperCase().replace(/[^A-Z0-9]/g, "_")}.doc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Lỗi xuất file Word:', error);
      alert('Có lỗi xảy ra khi xuất file Word. Thầy/Cô vui lòng thử lại.');
    }
  };

  const handleExportPdf = () => {
    if (!initiative) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Vui lòng cho phép trình duyệt hiển thị pop-up để tải file PDF.");
      return;
    }

    let sectionsHtml = '';
    initiative.outline.forEach((section) => {
      const isSub = section.vietnameseTitle.match(/^([0-9]+(\.[0-9]+)+)/) || /^[a-z]\)/i.test(section.vietnameseTitle.trim());
      const headingTag = isSub ? 'h3' : 'h2';
      
      let cleanContent = section.content || '<i>(Chưa soạn thảo nội dung cho phần này)</i>';
      cleanContent = cleanContent
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br/>')
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>');

      sectionsHtml += `
        <div class="section-container">
          <${headingTag} class="section-title">${section.vietnameseTitle}</${headingTag}>
          <div class="section-content">
            <p>${cleanContent}</p>
          </div>
        </div>
      `;
    });

    const htmlContent = `
      <html>
        <head>
          <title>${initiative.title}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap');
            @page {
              size: A4;
              margin: 20mm;
            }
            body {
              font-family: 'Times New Roman', Times, serif;
              line-height: 1.6;
              color: #111;
              padding: 0;
              margin: 0;
              font-size: 14pt;
            }
            .cover-page {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              height: 100vh;
              text-align: center;
              page-break-after: always;
              border: 3px double #111;
              padding: 40px;
              box-sizing: border-box;
              margin-bottom: 40px;
            }
            .school-header {
              font-size: 15pt;
              font-weight: bold;
              text-transform: uppercase;
              line-height: 1.4;
            }
            .title-box {
              margin: auto 0;
            }
            .doc-title {
              font-size: 20pt;
              font-weight: bold;
              text-transform: uppercase;
              margin-bottom: 25px;
              line-height: 1.3;
            }
            .doc-category {
              font-size: 16pt;
              font-weight: bold;
              color: #333;
              letter-spacing: 1px;
            }
            .meta-box {
              text-align: left;
              margin-left: 20%;
              font-size: 14pt;
              margin-bottom: 80px;
              line-height: 1.8;
            }
            .meta-line {
              margin-bottom: 8px;
            }
            .year-footer {
              font-size: 14pt;
              font-weight: bold;
            }
            .section-container {
              page-break-inside: avoid;
              margin-bottom: 30px;
            }
            h2.section-title {
              font-size: 16pt;
              font-weight: bold;
              color: #000;
              border-bottom: 1.5px solid #111;
              padding-bottom: 6px;
              margin-top: 40px;
              text-transform: uppercase;
            }
            h3.section-title {
              font-size: 14pt;
              font-weight: bold;
              color: #111;
              margin-top: 25px;
            }
            .section-content {
              margin-top: 15px;
              text-align: justify;
              text-indent: 1.27cm;
            }
            p {
              margin-top: 0;
              margin-bottom: 12px;
            }
            @media print {
              body {
                padding: 0;
              }
              .cover-page {
                height: 95vh;
              }
            }
          </style>
        </head>
        <body>
          <!-- Cover Page -->
          <div class="cover-page">
            <div class="school-header">
              ${initiative.school}<br/>
              ---***---
            </div>
            
            <div class="title-box">
              <div class="doc-title">${initiative.title}</div>
              <div class="doc-category">
                TÀI LIỆU: ${
                  initiative.category === 'bien-phap' 
                    ? 'BIỆN PHÁP SƯ PHẠM' 
                    : initiative.category === 'ho-so' 
                      ? 'HỒ SƠ GIÁO VIÊN CHỦ NHIỆM GIỎI' 
                      : 'SÁNG KIẾN KINH NGHIỆM'
                }
              </div>
            </div>

            <div class="meta-box">
              <div class="meta-line"><b>Tác giả:</b> ${initiative.author}</div>
              <div class="meta-line"><b>Môn học:</b> ${initiative.subject}</div>
              <div class="meta-line"><b>Khối lớp:</b> ${initiative.grade}</div>
              <div class="meta-line"><b>Đơn vị công tác:</b> ${initiative.school}</div>
            </div>

            <div class="year-footer">
              NĂM HỌC 2025 - 2026
            </div>
          </div>

          <!-- Document Contents -->
          ${sectionsHtml}

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleExportPptx = async () => {
    if (!initiative) return;

    setIsGeneratingSlides(true);
    try {
      const apiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      const selectedModel = localStorage.getItem('GEMINI_SELECTED_MODEL') || 'gemini-3-flash-preview';

      const response = await fetch('/api/generate-slides-outline', {
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
          outline: initiative.outline
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.details || 'Lỗi thiết kế slide thuyết trình từ AI');
      }

      const data = await response.json();
      if (data.slides && Array.isArray(data.slides)) {
        const { exportSlidesToPptx } = await import('./utils/pptxExport');
        exportSlidesToPptx(initiative.title, initiative.category, data.slides);
      } else {
        throw new Error('Dữ liệu slide trả về không đúng cấu trúc.');
      }
    } catch (error: any) {
      console.error('Lỗi khi thiết kế slide:', error);
      alert(`[LỖI AI SLIDES] Có lỗi xảy ra: ${error.message || error}`);
    } finally {
      setIsGeneratingSlides(false);
    }
  };

  const handleResetProject = () => {
    if (confirm('Thầy/Cô có chắc chắn muốn xóa dự án hiện tại để tạo đề tài mới không? Tất cả bản thảo hiện tại sẽ bị xóa.')) {
      if (initiative) {
        localStorage.removeItem(`${LOCAL_STORAGE_CHAT_KEY}${initiative.id}`);
      }
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setInitiative(null);
      setCurrentSectionId(null);
      setChatHistory([]);
    }
  };

  const handleClearHistory = () => {
    if (initiative && confirm('Xóa tất cả lịch sử chat của đề tài này?')) {
      setChatHistory([]);
      localStorage.removeItem(`${LOCAL_STORAGE_CHAT_KEY}${initiative.id}`);
    }
  };

  const activeSection = initiative
    ? (initiative.outline.find(sec => sec.id === currentSectionId) || initiative.outline[0])
    : null;

  return (
    <div id="app-root-container" className="min-h-screen w-full flex flex-col bg-[#F8FAFC] overflow-hidden">
      
      {/* Top Header */}
      <Header
        initiative={initiative}
        onOpenSettings={() => setShowSettingsModal(true)}
        hasApiKey={apiKeyExists}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden min-h-0">
        {!initiative ? (
          <InitialSetup onSetupComplete={handleSetupComplete} />
        ) : (
          <>
            {/* 1. Sidebar (Left column) */}
            <Sidebar
              initiative={initiative}
              currentSectionId={currentSectionId}
              onSelectSection={setCurrentSectionId}
              onTriggerEvaluation={handleTriggerEvaluation}
              onExportDocx={handleExportDocx}
              onExportPptx={handleExportPptx}
              onExportPdf={handleExportPdf}
              onResetProject={handleResetProject}
              isEvaluating={isEvaluating}
              isGeneratingSlides={isGeneratingSlides}
            />

            {/* 2. Main Editor (Middle column) */}
            {activeSection && (
              <MainEditor
                key={activeSection.id} // Re-render when section changes
                section={activeSection}
                onUpdateSectionContent={handleUpdateSectionContent}
                initiativeTitle={initiative.title}
                subject={initiative.subject}
                grade={initiative.grade}
                category={initiative.category}
                isGenerating={isGeneratingSection}
                onGenerateSection={handleGenerateSection}
              />
            )}

            {/* 3. AI Assistant Panel (Right column) */}
            <AIPanel
              chatHistory={chatHistory}
              onSendMessage={handleSendMessage}
              activeSectionTitle={activeSection?.vietnameseTitle || 'Chung'}
              isSending={isSendingChat}
              onClearHistory={handleClearHistory}
            />
          </>
        )}
      </div>

      {/* 4. Evaluation Overlay Panel (Modal overlay) */}
      {showEvaluation && initiative && initiative.evaluation && (
        <EvaluationPanel
          evaluation={initiative.evaluation}
          onClose={() => setShowEvaluation(false)}
          title={initiative.title}
          initiative={initiative}
        />
      )}

      {/* 5. Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        isMandatory={!apiKeyExists}
      />

    </div>
  );
}
