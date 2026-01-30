export enum LanguageLevel {
  A1 = 'A1',
  A2 = 'A2',
  B1 = 'B1',
  B2 = 'B2',
  C1 = 'C1',
  C2 = 'C2',
}

export enum StudyMode {
  flashcards = 'flashcards',
  typing = 'typing',
  match = 'match',
  listening = 'listening',
}

export enum StudySource {
  All = 'all',
  Manual = 'manual',
  AiGenerated = 'ai',
}

export enum WordStatus {
  New = 'new',
  Learning = 'learning',
  Learned = 'learned',
}

export interface Word {
  id: string;
  polish: string;
  english: string;
  category: string;
  level: LanguageLevel;
  status: WordStatus;
  nextReview: number; // Timestamp
  lastReview: number | null; // Timestamp
  attempts: number;
  correct: number;
  imageUrl?: string;
  exampleSentence?: string;
  aiGenerated: boolean;
}

export interface Settings {
  userName: string;
  dailyGoal: number;
  level: LanguageLevel;
  aiProvider: 'gemini' | 'free' | 'pollinations' | 'deepai' | 'perplexity' | 'custom';
  imageProvider: 'auto' | 'pollinations' | 'hf_space' | 'custom' | 'gemini' | 'deepai' | 'huggingface';
  visualStyle: 'minimalist' | 'realistic' | 'cartoon' | 'pixel' | 'cyberpunk';
  aiModelType: 'flash' | 'pro';
  huggingFaceApiKey: string;
  deepAiApiKey: string;
  perplexityApiKey: string;
  pollinationsApiKey?: string;
  customApiKey: string;
  customApiBase: string;
  customModelName: string;
  enableTTS: boolean;
  enableSoundEffects: boolean;
  preferredStudySource: StudySource;
}

export interface AppStats {
  totalWords: number;
  learnedWords: number;
  streakDays: number;
  lastStudyDate: number;
}
