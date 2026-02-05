// services/srs.ts
import { Word, WordStatus } from '../types';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

// Proste SRS oparte o liczbę kolejnych poprawnych odpowiedzi (word.correct).
// Nie dodaje nowych pól do Word, więc eksport/import zostaje kompatybilny.
export function applySrsResult(word: Word, isCorrect: boolean, now = Date.now()): Word {
  const attempts = (word.attempts ?? 0) + 1;

  // NEW words też powinny przechodzić w Learning po pierwszej interakcji
  const base: Word = {
    ...word,
    attempts,
    lastReview: now,
    status: word.status === WordStatus.Learned ? WordStatus.Learned : WordStatus.Learning,
  };

  if (!isCorrect) {
    // Krótka powtórka po błędzie (zostawiamy Twoje 10 minut)
    return {
      ...base,
      correct: 0,
      nextReview: now + 10 * MINUTE,
      status: WordStatus.Learning,
    };
  }

  const prevCorrect = word.correct ?? 0;
  const newCorrect = prevCorrect + 1;

  // Rosnące interwały (w dniach). Możesz je potem łatwo tuningować.
  const intervalsDays = [1, 3, 7, 14, 30, 60];
  const idx = Math.min(newCorrect - 1, intervalsDays.length - 1);
  const nextReview = now + intervalsDays[idx] * DAY;

  // Czytelny próg "learned" — np. po 5 kolejnych poprawnych.
  const learnedThreshold = 5;
  const status = newCorrect >= learnedThreshold ? WordStatus.Learned : WordStatus.Learning;

  return {
    ...base,
    correct: newCorrect,
    nextReview,
    status,
  };
}
