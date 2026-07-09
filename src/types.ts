export type InitiativeCategory = 'skkn' | 'bien-phap' | 'ho-so';

export interface SectionOutline {
  id: string;
  title: string;
  vietnameseTitle: string;
  description: string;
  content: string;
  status: 'pending' | 'drafting' | 'completed' | 'error';
  aiSuggestedMetrics?: string[];
  aiSuggestedEvidences?: string[];
}

export interface PanelMember {
  id: string;
  name: string;
  role: string; // e.g. "Hiệu trưởng", "Chuyên viên Phòng GD", "Thanh tra Sở GD"
  avatar: string;
  avatarColor: string;
  tone: string; // e.g. strict, encouraging, detail-oriented
  comment: string;
  rating: number;
}

export interface EvaluationResult {
  score: number;
  criteria: {
    innovation: { score: number; feedback: string }; // Tính mới
    practicality: { score: number; feedback: string }; // Tính thực tiễn
    methodology: { score: number; feedback: string }; // Tính khoa học / Sư phạm
    replicability: { score: number; feedback: string }; // Tính lan tỏa / Áp dụng
    presentation: { score: number; feedback: string }; // Hình thức & Minh chứng
  };
  panelComments: PanelMember[];
  suggestedQuestions: {
    question: string;
    suggestedAnswer: string;
  }[];
  generalFeedback: string;
}

export interface Initiative {
  id: string;
  title: string;
  subject: string;
  grade: string;
  category: InitiativeCategory;
  author: string;
  school: string;
  outline: SectionOutline[];
  evaluation?: EvaluationResult;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  contextSectionId?: string;
}
