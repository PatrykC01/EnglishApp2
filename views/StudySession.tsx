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
  // Added 'correct' state for visual feedback before hiding
  state: 'default' | 'selected' | 'matched' | 'wrong' | 'correct';
}

const StudySession: React.FC<StudySessionProps> = ({ mode, words, onComplete, onUpdateWord, onExit }) => {
  // General State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<{ wordId: string; correct: boolean }[]>([]);
  const [currentImage, setCurrentImage] = useState<string | undefined>(undefined);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false); // New state for mobile unlock
  
  // Typing Mode State
  const [typingInput, setTypingInput] = useState('');
  const [typingFeedback, setTypingFeedback] = useState<'neutral' | 'correct' | 'wrong'>('neutral');
  const [typingMessage, setTypingMessage] = useState<string>('');

  // Match Mode State
  const [matchCards, setMatchCards] = useState<MatchCard[]>([]);
  const [matchMistakes, setMatchMistakes] = useState<Set<string>>(new Set());
  const [isProcessingMatch, setIsProcessingMatch] = useState(false);

  // Audio Refs
  const hasAutoPlayedRef = useRef(false);
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);

  const currentWord = words[currentIndex];

  // --- AUDIO LOGIC ---

  const playFallbackAudio = useCallback((text: string) => {
      try {
          if (fallbackAudioRef.current) {
              fallbackAudioRef.current.pause();
              fallbackAudioRef.current = null;
          }
          // Using StreamElements as robust fallback
          const url = `https://api.streamelements.com/kappa/v2/speech?voice=Joanna&text=${encodeURIComponent(text)}`;
          const audio = new Audio(url);
          fallbackAudioRef.current = audio;
          audio.play().catch(e => console.error("Fallback audio play failed", e));
      } catch (e) {
          console.error("Fallback setup failed", e);
      }
  }, []);

  const speak = useCallback((text: string) => {
    // 1. Try Native Web Speech API
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Critical for iOS queue clearing

        // iOS sometimes needs a nudge to resume
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }

        const voices = window.speechSynthesis.getVoices();
        const u = new SpeechSynthesisUtterance(text);
        
        // Mobile optimization: slightly slower
        u.rate = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 0.7 : 0.9;
        u.lang = 'en-US';

        // Select best voice
        const preferredVoice = voices.find(v => v.lang === 'en-US' && v.localService) || 
                               voices.find(v => v.lang === 'en-US') ||
                               voices.find(v => v.lang.startsWith('en'));
        
        if (preferredVoice) u.voice = preferredVoice;

        u.onerror = () => {
            // If native fails, use fallback immediately
            console.warn("Native TTS error, switching to fallback");
            playFallbackAudio(text);
        };

        // If no voices loaded yet (common on Android Chrome first load), force fallback or wait
        if (voices.length === 0 && !/iPhone|iPad/i.test(navigator.userAgent)) {
             // On Android, if voices are empty, native often fails silently. Use fallback.
             console.warn("No native voices found, using fallback");
             playFallbackAudio(text);
             return;
        }

        window.speechSynthesis.speak(u);
    } else {
        // 2. Browser doesn't support TTS at all
        playFallbackAudio(text);
    }
  }, [playFallbackAudio]);

  // Initial Audio Unlock (For Mobile)
  const unlockAudio = () => {
      if ('speechSynthesis' in window) {
          // Play silent sound to unlock AudioContext/TTS
          const u = new SpeechSynthesisUtterance('');
          u.volume = 0;
          window.speechSynthesis.speak(u);
      }
      // Also trigger an empty audio element play for fallback unlock
      const silentAudio = new Audio();
      silentAudio.play().catch(() => {});
      
      setIsAudioUnlocked(true);
  };

  // --- EFFECTS ---

  // Image Generation
  useEffect(() => {
    let isMounted = true;
    hasAutoPlayedRef.current = false;

    if (currentWord && (mode === StudyMode.flashcards || mode === StudyMode.typing || mode === StudyMode.listening)) {
        
        if (currentWord.imageUrl) {
            if (isMounted) setCurrentImage(currentWord.imageUrl);
        } else {
            if (isMounted) setCurrentImage(undefined);
            
            geminiService.generateImage(currentWord.english, currentWord.exampleSentence)
                .then(url => {
                    if (isMounted) {
                        setCurrentImage(url);
                        if (onUpdateWord) {
                            onUpdateWord({ ...currentWord, imageUrl: url });
                        }
                    }
                })
                .catch(err => console.error(err));
        }
    }
    
    return () => { isMounted = false; };
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

  // Match Mode Setup
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

  // Auto-play Effect
  useEffect(() => {
    if (mode === StudyMode.listening && isAudioUnlocked && currentWord && !hasAutoPlayedRef.current) {
        const timer = setTimeout(() => {
            speak(currentWord.english);
            hasAutoPlayedRef.current = true;
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [currentWord, mode, isAudioUnlocked, speak]);

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

  // Match Mode Logic
  const handleCardClick = (clickedCard: MatchCard) => {
      // Ignore click if we are processing, or card is already matched/wrong/selected/correct
      if (isProcessingMatch || clickedCard.state === 'matched' || clickedCard.state === 'wrong' || clickedCard.state === 'selected' || clickedCard.state === 'correct') return;

      const selected = matchCards.find(c => c.state === 'selected');

      if (!selected) {
          setMatchCards(prev => prev.map(c => c.id === clickedCard.id ? { ...c, state: 'selected' } : c));
      } else {
          setIsProcessingMatch(true);
          
          if (selected.wordId === clickedCard.wordId) {
              // --- CORRECT MATCH ---
              // 1. Mark as 'correct' (Green visual feedback)
              setMatchCards(prev => prev.map(c => (c.id === clickedCard.id || c.id === selected.id) ? { ...c, state: 'correct' } : c));
              
              // 2. Wait, then hide (mark as 'matched')
              setTimeout(() => {
                  setMatchCards(prev => prev.map(c => (c.id === clickedCard.id || c.id === selected.id) ? { ...c, state: 'matched' } : c));
                  setIsProcessingMatch(false);
                  
                  // Check win condition
                  const remaining = matchCards.filter(c => c.state !== 'matched' && c.state !== 'correct' && c.id !== clickedCard.id && c.id !== selected.id);
                  if (remaining.length === 0) {
                      const matchResults = words.map(w => ({ wordId: w.id, correct: !matchMistakes.has(w.id) }));
                      setTimeout(() => onComplete(matchResults), 500);
                  }
              }, 600); // 600ms delay to see the green success state

          } else {
              // --- WRONG MATCH ---
              setMatchMistakes(prev => { const newSet = new Set(prev); newSet.add(selected.wordId); newSet.add(clickedCard.wordId); return newSet; });
              setMatchCards(prev => prev.map(c => (c.id === clickedCard.id || c.id === selected.id) ? { ...c, state: 'wrong' } : c));
              
              setTimeout(() => {
                  setMatchCards(prev => prev.map(c => (c.id === clickedCard.id || c.id === selected.id) ? { ...c, state: 'default' } : c));
                  setIsProcessingMatch(false);
              }, 1000);
          }
      }
  };

  // --- RENDERERS ---

  // UNLOCK SCREEN for Listening Mode
  if (mode === StudyMode.listening && !isAudioUnlocked) {
      return (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <h2 className="text-2xl font-bold mb-4 text-slate-800">Tryb Słuchania 🎧</h2>
              <p className="text-slate-500 mb-8 max-w-xs">Włączymy dźwięk, abyś mógł słyszeć wymowę. Kliknij przycisk poniżej.</p>
              <button 
                  onClick={unlockAudio}
                  className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 hover:scale-105 transition-transform"
              >
                  Startuj! ▶️
              </button>
              <button onClick={onExit} className="mt-8 text-slate-400 text-sm">Anuluj</button>
          </div>
      );
  }

  // Common Header for all modes within StudySession
  const renderHeader = () => (
      <div className="w-full flex justify-between items-center p-4 z-20 shrink-0">
          <button onClick={onExit} className="text-slate-400 hover:text-slate-600 flex items-center gap-1 p-2">
              <span className="text-xl">✕</span> Zakończ
          </button>
          <div className="bg-white px-4 py-1 rounded-full text-slate-500 font-medium shadow-sm border border-slate-100">
              {currentIndex + 1} / {words.length}
          </div>
      </div>
  );

  if (mode === StudyMode.flashcards) {
    return (
      <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
        {renderHeader()}
        {/* Added pb-8 for safe area */}
        <div className="flex-1 flex flex-col items-center justify-center relative w-full px-2 pb-8">
            <Flashcard word={currentWord} onResult={handleNext} imageUrl={currentImage} onRegenerateImage={handleRegenerateImage} />
            <p className="mt-2 text-xs text-slate-400 hidden md:block">Przesuń w prawo jeśli umiesz, w lewo jeśli nie.</p>
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
             setTypingFeedback('wrong'); setTypingMessage('Błędnie (AI niedostępne)'); setTimeout(() => handleNext(false), 2000); return;
        }

        if (result.isCorrect) {
            setTypingFeedback('correct'); setTypingMessage(result.feedback || 'Dobrze!'); setTimeout(() => handleNext(true), 1000);
        } else {
            setTypingFeedback('wrong'); setTypingMessage(result.feedback || 'Spróbuj jeszcze raz'); setTimeout(() => handleNext(false), 2500);
        }
    };

    return (
      <div className="flex flex-col h-full bg-slate-50">
         {renderHeader()}
         <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto px-4 w-full">
            <div className="mb-4 w-full text-center">
                {currentImage && <img src={currentImage} className="w-32 h-32 mx-auto rounded-lg object-cover mb-4 shadow-sm" alt="hint" />}
                <h2 className="text-3xl font-bold text-center mb-2">{currentWord.polish}</h2>
                <p className="text-center text-slate-400 text-sm">Przetłumacz na angielski</p>
            </div>
            <input type="text" value={typingInput} onChange={(e) => setTypingInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && checkTyping()} className={`w-full p-4 text-center text-xl rounded-xl border-2 outline-none transition-all ${typingFeedback === 'neutral' ? 'border-slate-200 focus:border-indigo-500' : typingFeedback === 'correct' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700'}`} placeholder="Wpisz słowo..." autoFocus />
            <button onClick={checkTyping} className="mt-6 w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">Sprawdź</button>
            <div className="mt-4 text-center min-h-[1.5rem]">{typingFeedback === 'wrong' && (<div className="text-red-500 font-medium animate-shake">{typingMessage} <br/><span className="text-sm text-slate-500">Poprawnie: {currentWord.english}</span></div>)}{typingFeedback === 'correct' && (<div className="text-green-600 font-medium">{typingMessage}</div>)}</div>
         </div>
      </div>
    );
  }

  if (mode === StudyMode.listening) {
    return (
        <div className="flex flex-col h-full bg-slate-50">
            {renderHeader()}
            <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto px-4 w-full">
                <div className="text-center mb-8">
                    <button 
                        onClick={(e) => {
                            e.preventDefault();
                            speak(currentWord.english);
                        }}
                        className="w-32 h-32 rounded-full bg-indigo-100 text-indigo-600 flex flex-col items-center justify-center mb-4 mx-auto hover:bg-indigo-200 hover:scale-105 transition-all shadow-md active:scale-95 cursor-pointer relative"
                    >
                        <span className="text-5xl mb-2">🔊</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">Odsłuchaj</span>
                        <span className="absolute w-full h-full rounded-full border-4 border-indigo-200 animate-ping opacity-20 pointer-events-none"></span>
                    </button>
                </div>

                <input 
                    type="text" 
                    value={typingInput}
                    onChange={(e) => setTypingInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            const isCorrect = typingInput.trim().toLowerCase() === currentWord.english.toLowerCase();
                            if(isCorrect) { setTypingFeedback('correct'); setTimeout(() => handleNext(true), 2000); } 
                            else { setTypingFeedback('wrong'); setTimeout(() => handleNext(false), 2500); }
                        }
                    }}
                    className={`w-full p-4 text-center text-xl rounded-xl border-2 outline-none mb-4 transition-colors ${typingFeedback === 'wrong' ? 'border-red-500 bg-red-50' : typingFeedback === 'correct' ? 'border-green-500 bg-green-50' : 'border-slate-200 focus:border-indigo-500'}`}
                    placeholder="Co usłyszałeś?"
                    autoFocus
                />
                
                <button 
                    onClick={() => {
                        const isCorrect = typingInput.trim().toLowerCase() === currentWord.english.toLowerCase();
                        if(isCorrect) { setTypingFeedback('correct'); setTimeout(() => handleNext(true), 2000); } 
                        else { setTypingFeedback('wrong'); setTimeout(() => handleNext(false), 2500); }
                    }}
                    className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                >
                    Sprawdź
                </button>
                
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
        </div>
    );
  }

  if (mode === StudyMode.match) {
      return (
          // Fixed height layout for Match mode
          <div className="flex flex-col w-full h-full bg-slate-50">
              <div className="w-full flex justify-between items-center p-4 shrink-0 relative z-20 bg-slate-50">
                  <button onClick={onExit} className="text-slate-400 hover:text-slate-600 flex items-center gap-1"><span className="text-xl">✕</span> Zakończ</button>
                  <div className="text-indigo-600 font-bold">Dopasuj pary</div>
              </div>
              
              {/* Added pt-8 to prevent clipping on hover lift */}
              <div className="flex-1 overflow-y-auto px-2 pt-8 pb-24 w-full flex flex-col items-center">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-3xl">
                      {matchCards.map((card) => {
                          if (card.state === 'matched') return null;
                          
                          let cardStyle = 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:-translate-y-1';
                          
                          if (card.state === 'selected') {
                              cardStyle = 'bg-indigo-600 border-indigo-600 text-white scale-105 shadow-md';
                          } else if (card.state === 'wrong') {
                              cardStyle = 'bg-red-100 border-red-400 text-red-700 animate-pulse';
                          } else if (card.state === 'correct') {
                              cardStyle = 'bg-green-100 border-green-500 text-green-700 scale-105 shadow-md';
                          }

                          return (
                              <button
                                  key={card.id}
                                  onClick={() => handleCardClick(card)}
                                  className={`min-h-[6rem] rounded-xl text-lg font-medium p-2 shadow-sm border-2 transition-all transform duration-200 flex items-center justify-center text-center break-words hyphens-auto ${cardStyle}`}
                                  lang={card.id.startsWith('en') ? 'en' : 'pl'}
                              >
                                  {card.text}
                              </button>
                          );
                      })}
                  </div>
              </div>
          </div>
      );
  }

  return <div>Unknown Mode</div>;
};

export default StudySession;
