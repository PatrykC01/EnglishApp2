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
  imageProvider: 'pollinations',
  visualStyle: 'minimalist',
  aiModelType: 'flash',
  huggingFaceApiKey: '',
  deepAiApiKey: '',
  perplexityApiKey: '',
  customApiKey: '',
  customApiBase: '',
  customModelName: '',
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
      const words = data ? JSON.parse(data) : SEED_WORDS;
      return words.map((w: any) => ({
        ...w,
        aiGenerated: w.aiGenerated === true
      }));
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
      const loadedSettings = data ? JSON.parse(data) : {};
      
      const merged = { ...DEFAULT_SETTINGS, ...loadedSettings };

      // FORCE MIGRATION: If user is on the broken 'hf_space' (ByteDance/SDXL-Lightning often 503s), switch them to Pollinations
      if (merged.imageProvider === 'hf_space') {
          console.warn("Migrating from broken hf_space to pollinations");
          merged.imageProvider = 'pollinations';
          // Save immediately so we don't migrate every time
          localStorage.setItem(KEYS.SETTINGS, JSON.stringify(merged));
      }

      return merged;
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

  // --- Backup & Restore Features ---
  
  getAllData: () => {
    return {
      words: storageService.getWords(),
      settings: storageService.getSettings(),
      stats: storageService.getStats(),
      timestamp: Date.now(),
      version: 1
    };
  },

  importData: (data: any) => {
    if (!data || !Array.isArray(data.words)) {
      throw new Error("Nieprawidłowy format pliku kopii zapasowej.");
    }
    
    // Save Words
    localStorage.setItem(KEYS.WORDS, JSON.stringify(data.words));
    
    // Save Settings (merge to ensure new keys exist)
    const currentSettings = storageService.getSettings();
    const newSettings = { ...currentSettings, ...(data.settings || {}) };
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(newSettings));

    // Save Stats
    if (data.stats) {
      localStorage.setItem(KEYS.STATS, JSON.stringify(data.stats));
    }
    
    // Optional: Try to migrate cached images keys if we ever implement complex caching logic
    // For now, browser cache handles the images themselves based on URLs.
  }
};
