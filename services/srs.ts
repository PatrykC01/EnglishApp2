import { Word, WordStatus } from '../types';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

// Proste SRS oparte o liczbę kolejnych poprawnych odpowiedzi (word.correct).
// Nie dodaje nowych pól do Word, więc eksport/import zostaje kompatybilny.
export function applySrsResult(word: Word, isCorrect: boolean, now = Date.now()): Word {
  const attempts = (word.attempts ?? 0) + 1;

  // Bazowy obiekt - aktualizujemy metadane użycia
  const base: Word = {
    ...word,
    attempts,
    lastReview: now,
  };

  if (!isCorrect) {
    // Krótka powtórka po błędzie (zostawiamy Twoje 10 minut)
    // Resetujemy licznik poprawnych odpowiedzi (correct streak)
    return {
      ...base,
      correct: 0,
      nextReview: now + 10 * MINUTE,
      status: WordStatus.Learning,
    };
  }

  const prevCorrect = word.correct ?? 0;
  const newCorrect = prevCorrect + 1;

  // Rosnące interwały (w dniach).
  // 1 sukces -> 1 dzień
  // 2 sukcesy -> 3 dni
  // 3 sukcesy -> 7 dni, itd.
  const intervalsDays = [1, 3, 7, 14, 30, 60];
  
  // Pobieramy odpowiedni interwał. Jeśli użytkownik ma więcej sukcesów niż tablica,
  // bierzemy ostatnią wartość (60 dni).
  // newCorrect - 1, ponieważ tablice są indeksowane od 0.
  // np. newCorrect = 1 (pierwszy raz dobrze) -> index 0 -> 1 dzień.
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
