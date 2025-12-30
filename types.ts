export enum LanguageLevel {
  A1 = 'A1',
  A2 = 'A2',
  B1 = 'B1',
  B2 = 'B2',
  C1 = 'C1',
  C2 = 'C2',
}

export enum StudyMode {
  Flashcards = 'flashcards',
  Typing = 'typing',
  Match = 'match',
  Listening = 'listening',
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
  aiProvider: 'gemini' | 'free';
  aiModelType: 'flash' | 'pro'; // New setting
  huggingFaceApiKey: string;
  enableTTS: boolean;
  enableSoundEffects: boolean;
}

export interface AppStats {
  totalWords: number;
  learnedWords: number;
  streakDays: number;
  lastStudyDate: number;
}
