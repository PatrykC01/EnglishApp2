import React, { useState, useEffect, useCallback } from 'react';
import { Word, StudyMode } from '../types';
import Flashcard from '../components/Flashcard';
import { geminiService } from '../services/gemini';

interface StudySessionProps {
  mode: StudyMode;
  words: Word[];
  onComplete: (results: { wordId: string; correct: boolean }[]) => void;
  onExit: () => void;
}

interface MatchCard {
  id: string;
  wordId: string;
  text: string;
  state: 'default' | 'selected' | 'matched' | 'wrong';
}

const StudySession: React.FC<StudySessionProps> = ({ mode, words, onComplete, onExit }) => {
  // General State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<{ wordId: string; correct: boolean }[]>([]);
  const [currentImage, setCurrentImage] = useState<string | undefined>(undefined);
  
  // Typing Mode State
  const [typingInput, setTypingInput] = useState('');
  const [typingFeedback, setTypingFeedback] = useState<'neutral' | 'correct' | 'wrong'>('neutral');
  const [typingMessage, setTypingMessage] = useState<string>('');

  // Match Mode State
  const [matchCards, setMatchCards] = useState<MatchCard[]>([]);
  const [matchMistakes, setMatchMistakes] = useState<Set<string>>(new Set());
  const [isProcessingMatch, setIsProcessingMatch] = useState(false);

  const currentWord = words[currentIndex];

  // Load image when word changes (only for non-grid modes)
  useEffect(() => {
    if (currentWord && (mode === StudyMode.Flashcards || mode === StudyMode.Typing || mode === StudyMode.Listening)) {
        setCurrentImage(undefined);
        if (currentWord.imageUrl) {
            setCurrentImage(currentWord.imageUrl);
        } else {
            // Generate on the fly
            geminiService.generateImage(currentWord.english, currentWord.polish)
                .then(url => setCurrentImage(url))
                .catch(err => console.error(err));
        }
    }
  }, [currentWord, mode]);

  // Initialize Match Mode
  useEffect(() => {
    if (mode === StudyMode.Match && words.length > 0) {
        const cards: MatchCard[] = [];
        words.forEach(w => {
            cards.push({ id: `pl-${w.id}`, wordId: w.id, text: w.polish, state: 'default' });
            cards.push({ id: `en-${w.id}`, wordId: w.id, text: w.english, state: 'default' });
        });
        
        // Shuffle
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        
        setMatchCards(cards);
        setMatchMistakes(new Set());
        setResults([]);
    }
  }, [mode, words]);

  // TTS Helper
  const speak = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        window.speechSynthesis.speak(u);
    }
  }, []);

  const handleNext = (correct: boolean) => {
    const newResults = [...results, { wordId: currentWord.id, correct }];
    setResults(newResults);

    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setTypingInput('');
      setTypingFeedback('neutral');
      setTypingMessage('');
    } else {
      onComplete(newResults);
    }
  };

  // Match Mode Handler
  const handleCardClick = (clickedCard: MatchCard) => {
      if (isProcessingMatch || clickedCard.state === 'matched' || clickedCard.state === 'wrong' || clickedCard.state === 'selected') {
          return;
      }

      const selected = matchCards.find(c => c.state === 'selected');

      if (!selected) {
          // Select the first card
          setMatchCards(prev => prev.map(c => c.id === clickedCard.id ? { ...c, state: 'selected' } : c));
      } else {
          // Second card clicked
          setIsProcessingMatch(true);
          
          if (selected.wordId === clickedCard.wordId) {
              // Match found
              setMatchCards(prev => prev.map(c => 
                  (c.id === clickedCard.id || c.id === selected.id) ? { ...c, state: 'matched' } : c
              ));
              setIsProcessingMatch(false);

              // Check completion
              const remaining = matchCards.filter(c => c.state !== 'matched' && c.id !== clickedCard.id && c.id !== selected.id);
              if (remaining.length === 0) {
                  // Compile results: words with no mistakes are correct
                  const matchResults = words.map(w => ({
                      wordId: w.id,
                      correct: !matchMistakes.has(w.id)
                  }));
                  setTimeout(() => onComplete(matchResults), 1000);
              }
          } else {
              // No Match
              // Record mistake
              setMatchMistakes(prev => new Set(prev).add(selected.wordId).add(clickedCard.wordId));

              // Show Error State
              setMatchCards(prev => prev.map(c => 
                  (c.id === clickedCard.id || c.id === selected.id) ? { ...c, state: 'wrong' } : c
              ));

              // Reset after delay
              setTimeout(() => {
                  setMatchCards(prev => prev.map(c => 
                      (c.id === clickedCard.id || c.id === selected.id) ? { ...c, state: 'default' } : c
                  ));
                  setIsProcessingMatch(false);
              }, 1000);
          }
      }
  };

  // --- RENDERERS ---

  if (mode === StudyMode.Flashcards) {
    return (
      <div className="flex flex-col items-center h-full justify-center">
        <div className="w-full flex justify-between items-center mb-6 px-4">
             <button onClick={onExit} className="text-slate-400 hover:text-slate-600">✕ Zakończ</button>
             <div className="text-slate-500 font-medium">{currentIndex + 1} / {words.length}</div>
        </div>
        <Flashcard 
            word={currentWord} 
            onResult={handleNext} 
            imageUrl={currentImage}
        />
        <p className="mt-8 text-xs text-slate-400">Przesuń w prawo jeśli umiesz, w lewo jeśli nie.</p>
      </div>
    );
  }

  if (mode === StudyMode.Typing) {
    const checkTyping = async () => {
        setTypingFeedback('neutral');
        setTypingMessage('Sprawdzanie...');
        
        // 1. First, try simple strict equality to save API calls
        const cleanInput = typingInput.trim().toLowerCase();
        const cleanTarget = currentWord.english.trim().toLowerCase();

        if (cleanInput === cleanTarget) {
            setTypingFeedback('correct');
            setTypingMessage('Idealnie!');
            setTimeout(() => handleNext(true), 1000);
            return;
        }

        // 2. If strict check fails, ask AI (for synonyms/typos)
        const result = await geminiService.checkTranslation(currentWord.polish, typingInput);
        
        // 3. Handle AI Error (Fallback to strict check result, which we already know is false here)
        if (result.feedback === 'AI_ERROR') {
             setTypingFeedback('wrong');
             setTypingMessage('Błędnie (AI niedostępne, wymagane dokładne tłumaczenie)');
             setTimeout(() => handleNext(false), 2000);
             return;
        }

        if (result.isCorrect) {
            setTypingFeedback('correct');
            setTypingMessage(result.feedback || 'Dobrze!');
            setTimeout(() => handleNext(true), 1000);
        } else {
            setTypingFeedback('wrong');
            setTypingMessage(result.feedback || 'Spróbuj jeszcze raz');
            setTimeout(() => handleNext(false), 2500);
        }
    };

    return (
      <div className="flex flex-col items-center h-full justify-center max-w-md mx-auto px-4">
         <div className="mb-8 w-full">
            <div className="flex justify-between mb-4">
                <button onClick={onExit} className="text-slate-400">✕</button>
                <span>{currentIndex + 1} / {words.length}</span>
            </div>
            {currentImage && <img src={currentImage} className="w-32 h-32 mx-auto rounded-lg object-cover mb-4 shadow-sm" alt="hint" />}
            <h2 className="text-3xl font-bold text-center mb-2">{currentWord.polish}</h2>
            <p className="text-center text-slate-400 text-sm">Przetłumacz na angielski</p>
         </div>

         <input 
            type="text" 
            value={typingInput}
            onChange={(e) => setTypingInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && checkTyping()}
            className={`w-full p-4 text-center text-xl rounded-xl border-2 outline-none transition-all ${
                typingFeedback === 'neutral' ? 'border-slate-200 focus:border-indigo-500' :
                typingFeedback === 'correct' ? 'border-green-500 bg-green-50 text-green-700' :
                'border-red-500 bg-red-50 text-red-700'
            }`}
            placeholder="Wpisz słowo..."
            autoFocus
         />
         
         <button 
            onClick={checkTyping}
            className="mt-6 w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
         >
            Sprawdź
         </button>
         
         <div className="mt-4 text-center min-h-[1.5rem]">
             {typingFeedback === 'wrong' && (
                 <div className="text-red-500 font-medium animate-shake">
                     {typingMessage} <br/>
                     <span className="text-sm text-slate-500">Poprawnie: {currentWord.english}</span>
                 </div>
             )}
             {typingFeedback === 'correct' && (
                 <div className="text-green-600 font-medium">
                     {typingMessage}
                 </div>
             )}
         </div>
      </div>
    );
  }

  if (mode === StudyMode.Listening) {
    return (
        <div className="flex flex-col items-center h-full justify-center max-w-md mx-auto px-4">
            <div className="text-center mb-8">
                <button 
                    onClick={() => speak(currentWord.english)}
                    className="w-24 h-24 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-4xl mb-4 mx-auto hover:bg-indigo-200 hover:scale-105 transition-all shadow-md"
                >
                    🔊
                </button>
                <p className="text-slate-500">Naciśnij i posłuchaj</p>
            </div>

            <input 
                type="text" 
                value={typingInput}
                onChange={(e) => setTypingInput(e.target.value)}
                className="w-full p-4 text-center text-xl rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none mb-4"
                placeholder="Co usłyszałeś?"
            />
            
            <button 
                onClick={() => {
                     const isCorrect = typingInput.trim().toLowerCase() === currentWord.english.toLowerCase();
                     if(isCorrect) {
                        speak("Correct!");
                        handleNext(true);
                     } else {
                        setTypingFeedback('wrong');
                        speak(`Incorrect. The word was ${currentWord.english}`);
                        setTimeout(() => handleNext(false), 2000);
                     }
                }}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold"
            >
                Sprawdź
            </button>
            {typingFeedback === 'wrong' && <p className="mt-2 text-red-500">{currentWord.english}</p>}
        </div>
    );
  }

  if (mode === StudyMode.Match) {
      return (
          <div className="flex flex-col items-center h-full pt-4 md:pt-10 px-2">
              <div className="w-full max-w-3xl flex justify-between items-center mb-6 px-2">
                  <button onClick={onExit} className="text-slate-400 hover:text-slate-600">✕ Zakończ</button>
                  <div className="text-indigo-600 font-bold">Dopasuj pary</div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-3xl pb-10">
                  {matchCards.map((card) => (
                      <button
                          key={card.id}
                          onClick={() => handleCardClick(card)}
                          disabled={card.state === 'matched'}
                          className={`
                              h-24 md:h-32 rounded-xl text-lg font-medium p-2 shadow-sm border-2 transition-all transform duration-200
                              flex items-center justify-center text-center break-words
                              ${card.state === 'default' ? 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:-translate-y-1' : ''}
                              ${card.state === 'selected' ? 'bg-indigo-600 border-indigo-600 text-white scale-105 shadow-md' : ''}
                              ${card.state === 'matched' ? 'bg-green-100 border-green-200 text-green-400 opacity-50 scale-95' : ''}
                              ${card.state === 'wrong' ? 'bg-red-100 border-red-400 text-red-700 animate-pulse' : ''}
                          `}
                      >
                          {card.text}
                      </button>
                  ))}
              </div>
          </div>
      );
  }

  return <div>Unknown Mode</div>;
};

export default StudySession;
