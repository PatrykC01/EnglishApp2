import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Word, StudyMode } from '../types';
import Flashcard from '../components/Flashcard';
import { geminiService } from '../services/gemini';

interface StudySessionProps {
  mode: StudyMode;
  words: Word[];
  onComplete: (results: { wordId: string; correct: boolean }[]) => void;
  onUpdateWord?: (word: Word) => void;
  onExit: () => void;
}

interface MatchCard {
  id: string;
  wordId: string;
  text: string;
  state: 'default' | 'selected' | 'matched' | 'wrong';
}

const StudySession: React.FC<StudySessionProps> = ({ mode, words, onComplete, onUpdateWord, onExit }) => {
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

  // Audio State
  const hasAutoPlayedRef = useRef(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const currentWord = words[currentIndex];

  // Load voices on mount (Critical for Mobile)
  useEffect(() => {
    const loadVoices = () => {
        const available = window.speechSynthesis.getVoices();
        if (available.length > 0) {
            setVoices(available);
        }
    };

    loadVoices();
    
    // Chrome/Android loads voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Load image when word changes
  useEffect(() => {
    hasAutoPlayedRef.current = false;

    if (currentWord && (mode === StudyMode.flashcards || mode === StudyMode.typing || mode === StudyMode.listening)) {
        setCurrentImage(undefined);
        
        if (currentWord.imageUrl) {
            setCurrentImage(currentWord.imageUrl);
        } else {
            geminiService.generateImage(currentWord.english, currentWord.exampleSentence)
                .then(url => {
                    setCurrentImage(url);
                    if (onUpdateWord) {
                        onUpdateWord({ ...currentWord, imageUrl: url });
                    }
                })
                .catch(err => console.error(err));
        }
    }
  }, [currentWord, mode]); 

  const handleRegenerateImage = () => {
     if (!currentWord) return;
     setCurrentImage(undefined);
     geminiService.generateImage(currentWord.english, currentWord.exampleSentence)
        .then(url => {
            setCurrentImage(url);
            if (onUpdateWord) {
                onUpdateWord({ ...currentWord, imageUrl: url });
            }
        })
        .catch(err => console.error(err));
  };

  // Initialize Match Mode
  useEffect(() => {
    if (mode === StudyMode.match && words.length > 0) {
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

  // Robust TTS function
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;

    // Retry getting voices if state is empty (sometimes happens on first click)
    let availableVoices = voices;
    if (availableVoices.length === 0) {
        availableVoices = window.speechSynthesis.getVoices();
    }

    // Cancel current
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.85; // Slower is better for learning
    u.volume = 1.0; 

    // Mobile Strategy: Try to find a high quality or local voice
    const preferredVoice = 
        availableVoices.find(v => v.lang === 'en-US' && v.localService) || // Prefer offline/fast voice
        availableVoices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
        availableVoices.find(v => v.lang.startsWith('en'));

    if (preferredVoice) {
        u.voice = preferredVoice;
    }

    // Small timeout ensures the cancellation finished and audio context is ready
    setTimeout(() => {
        window.speechSynthesis.speak(u);
    }, 10);
  }, [voices]);

  // Auto-play for Listening Mode
  useEffect(() => {
    if (mode === StudyMode.listening && currentWord && !hasAutoPlayedRef.current) {
        // Reduced timeout to try and catch the "user gesture" window if possible,
        // though on strict mobile browsers this might still fail, requiring the button.
        const timer = setTimeout(() => {
            speak(currentWord.english);
            hasAutoPlayedRef.current = true;
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [currentWord, mode, speak]);


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
          setMatchCards(prev => prev.map(c => c.id === clickedCard.id ? { ...c, state: 'selected' } : c));
      } else {
          setIsProcessingMatch(true);
          
          if (selected.wordId === clickedCard.wordId) {
              setMatchCards(prev => prev.map(c => 
                  (c.id === clickedCard.id || c.id === selected.id) ? { ...c, state: 'matched' } : c
              ));
              setIsProcessingMatch(false);

              const remaining = matchCards.filter(c => c.state !== 'matched' && c.id !== clickedCard.id && c.id !== selected.id);
              if (remaining.length === 0) {
                  const matchResults = words.map(w => ({
                      wordId: w.id,
                      correct: !matchMistakes.has(w.id)
                  }));
                  setTimeout(() => onComplete(matchResults), 1000);
              }
          } else {
              setMatchMistakes(prev => {
                  const newSet = new Set(prev);
                  newSet.add(selected.wordId);
                  newSet.add(clickedCard.wordId);
                  return newSet;
              });
              setMatchCards(prev => prev.map(c => 
                  (c.id === clickedCard.id || c.id === selected.id) ? { ...c, state: 'wrong' } : c
              ));
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

  if (mode === StudyMode.flashcards) {
    return (
      <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
        <div className="w-full flex justify-between items-center p-4 z-10">
             <button onClick={onExit} className="text-slate-400 hover:text-slate-600 flex items-center gap-1">
               <span className="text-xl">✕</span> Zakończ
             </button>
             <div className="bg-white px-4 py-1 rounded-full text-slate-500 font-medium shadow-sm border border-slate-100">
               {currentIndex + 1} / {words.length}
             </div>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center relative w-full">
            <Flashcard 
                word={currentWord} 
                onResult={handleNext} 
                imageUrl={currentImage}
                onRegenerateImage={handleRegenerateImage}
            />
             <p className="mt-8 text-xs text-slate-400 hidden md:block">Przesuń w prawo jeśli umiesz, w lewo jeśli nie.</p>
        </div>
      </div>
    );
  }

  if (mode === StudyMode.typing) {
    const checkTyping = async () => {
        setTypingFeedback('neutral');
        setTypingMessage('Sprawdzanie...');
        
        const cleanInput = typingInput.trim().toLowerCase();
        const cleanTarget = currentWord.english.trim().toLowerCase();

        if (cleanInput === cleanTarget) {
            setTypingFeedback('correct');
            setTypingMessage('Idealnie!');
            setTimeout(() => handleNext(true), 1000);
            return;
        }

        const result = await geminiService.checkTranslation(currentWord.polish, typingInput);
        
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

  if (mode === StudyMode.listening) {
    return (
        <div className="flex flex-col items-center h-full justify-center max-w-md mx-auto px-4">
            <div className="w-full flex justify-end mb-4 absolute top-4 right-4">
                 <button onClick={onExit} className="text-slate-400 px-4">✕</button>
            </div>

            <div className="text-center mb-8">
                <button 
                    onClick={(e) => {
                        e.preventDefault();
                        // Force a direct retry if voices were empty previously
                        speak(currentWord.english);
                    }}
                    className="w-32 h-32 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-5xl mb-4 mx-auto hover:bg-indigo-200 hover:scale-105 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                    🔊
                </button>
                <p className="text-slate-500">Kliknij, aby odsłuchać</p>
                <div className="text-xs text-slate-300 mt-2">{currentIndex + 1} / {words.length}</div>
            </div>

            <input 
                type="text" 
                value={typingInput}
                onChange={(e) => setTypingInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        const isCorrect = typingInput.trim().toLowerCase() === currentWord.english.toLowerCase();
                        if(isCorrect) {
                            setTypingFeedback('correct');
                            // Delay slightly longer to read the success message
                            setTimeout(() => handleNext(true), 2000);
                        } else {
                            setTypingFeedback('wrong');
                            setTimeout(() => handleNext(false), 2500);
                        }
                    }
                }}
                className={`w-full p-4 text-center text-xl rounded-xl border-2 outline-none mb-4 transition-colors ${
                    typingFeedback === 'wrong' ? 'border-red-500 bg-red-50' : 
                    typingFeedback === 'correct' ? 'border-green-500 bg-green-50' : 'border-slate-200 focus:border-indigo-500'
                }`}
                placeholder="Co usłyszałeś?"
                autoFocus
            />
            
            <button 
                onClick={() => {
                     const isCorrect = typingInput.trim().toLowerCase() === currentWord.english.toLowerCase();
                     if(isCorrect) {
                        setTypingFeedback('correct');
                        setTimeout(() => handleNext(true), 2000);
                     } else {
                        setTypingFeedback('wrong');
                        setTimeout(() => handleNext(false), 2500);
                     }
                }}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200"
            >
                Sprawdź
            </button>
            
            {/* Visual Feedback Area */}
            <div className="h-16 mt-4 text-center flex items-center justify-center">
                {typingFeedback === 'wrong' && (
                    <div className="animate-shake">
                         <div className="text-red-500 font-bold text-lg">Błąd!</div>
                         <div className="text-slate-500">Poprawnie: <span className="font-semibold text-slate-800">{currentWord.english}</span></div>
                    </div>
                )}
                {typingFeedback === 'correct' && (
                    <div className="animate-bounce">
                         <div className="text-green-600 font-bold text-2xl">Świetnie! 🎉</div>
                         <div className="text-slate-500">{currentWord.english}</div>
                    </div>
                )}
            </div>
        </div>
    );
  }

  if (mode === StudyMode.match) {
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
