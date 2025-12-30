import { Word, Settings, AppStats, LanguageLevel, WordStatus, StudySource } from '../types';

const KEYS = {
  WORDS: 'vocab_words',
  SETTINGS: 'vocab_settings',
  STATS: 'vocab_stats',
};

const DEFAULT_SETTINGS: Settings = {
  userName: 'Uczeń',
  dailyGoal: 10,
  level: LanguageLevel.B1,
  aiProvider: 'free',
  aiModelType: 'flash',
  huggingFaceApiKey: '',
  enableTTS: true,
  enableSoundEffects: true,
  preferredStudySource: StudySource.All,
};

const DEFAULT_STATS: AppStats = {
  totalWords: 0,
  learnedWords: 0,
  streakDays: 0,
  lastStudyDate: 0,
};

// Seed data for first launch
const SEED_WORDS: Word[] = [
  { id: '1', polish: 'dom', english: 'house', category: 'dom', level: LanguageLevel.A1, status: WordStatus.New, nextReview: Date.now(), lastReview: null, attempts: 0, correct: 0, aiGenerated: false },
  { id: '2', polish: 'kot', english: 'cat', category: 'zwierzęta', level: LanguageLevel.A1, status: WordStatus.New, nextReview: Date.now(), lastReview: null, attempts: 0, correct: 0, aiGenerated: false },
  { id: '3', polish: 'samochód', english: 'car', category: 'transport', level: LanguageLevel.A1, status: WordStatus.New, nextReview: Date.now(), lastReview: null, attempts: 0, correct: 0, aiGenerated: false },
  { id: '4', polish: 'praca', english: 'job', category: 'praca', level: LanguageLevel.A1, status: WordStatus.New, nextReview: Date.now(), lastReview: null, attempts: 0, correct: 0, aiGenerated: false },
  { id: '5', polish: 'szczęście', english: 'happiness', category: 'emocje', level: LanguageLevel.B1, status: WordStatus.New, nextReview: Date.now(), lastReview: null, attempts: 0, correct: 0, aiGenerated: false },
];

export const storageService = {
  getWords: (): Word[] => {
    try {
      const data = localStorage.getItem(KEYS.WORDS);
      return data ? JSON.parse(data) : SEED_WORDS;
    } catch {
      return SEED_WORDS;
    }
  },

  saveWords: (words: Word[]) => {
    localStorage.setItem(KEYS.WORDS, JSON.stringify(words));
  },

  getSettings: (): Settings => {
    try {
      const data = localStorage.getItem(KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings: (settings: Settings) => {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  },

  getStats: (): AppStats => {
    try {
      const data = localStorage.getItem(KEYS.STATS);
      return data ? JSON.parse(data) : DEFAULT_STATS;
    } catch {
      return DEFAULT_STATS;
    }
  },

  saveStats: (stats: AppStats) => {
    localStorage.setItem(KEYS.STATS, JSON.stringify(stats));
  },
};
