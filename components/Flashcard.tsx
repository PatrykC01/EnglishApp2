import React, { useState, useRef, useEffect } from 'react';
import { Word } from '../types';

interface FlashcardProps {
  word: Word;
  onResult: (correct: boolean) => void;
  imageUrl?: string;
  onRegenerateImage?: () => void;
}

const Flashcard: React.FC<FlashcardProps> = ({ word, onResult, imageUrl, onRegenerateImage }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [exitX, setExitX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Ref to track drag value inside event closures
  const xRef = useRef(0);
  
  // Reset state when word changes
  useEffect(() => {
    setIsFlipped(false);
    setDragX(0);
    xRef.current = 0;
    setExitX(null);
    setIsDragging(false);
  }, [word]);

  const triggerResult = (correct: boolean) => {
      // Prevent multiple triggers
      if (exitX !== null) return;

      // Animate out (Fly away)
      const flyValue = correct ? window.innerWidth : -window.innerWidth;
      setExitX(flyValue);
      
      // Wait for animation then call callback
      setTimeout(() => {
          onResult(correct);
      }, 300);
  };

  // Keyboard Navigation
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (exitX !== null || (e.target as HTMLElement).tagName === 'INPUT') return;

          if (e.code === 'Space') {
              e.preventDefault();
              setIsFlipped(prev => !prev);
          } else if (e.code === 'ArrowRight') {
              triggerResult(true);
          } else if (e.code === 'ArrowLeft') {
              triggerResult(false);
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exitX]);

  // Touch/Mouse handlers
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;

    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const startX = clientX;

    const handleMove = (moveEvent: TouchEvent | MouseEvent) => {
      const currentX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
      const val = currentX - startX;
      xRef.current = val;
      setDragX(val);
    };

    const handleEnd = () => {
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      
      setIsDragging(false);
      
      if (xRef.current > 100) {
        triggerResult(true); // Right swipe = Know
      } else if (xRef.current < -100) {
        triggerResult(false); // Left swipe = Don't Know
      } else {
        setDragX(0); // Snap back
        xRef.current = 0;
      }
    };

    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
  };

  // Determine border color based on drag
  let borderColor = 'border-slate-200';
  const effectiveX = exitX !== null ? exitX : dragX;
  const rotate = effectiveX / 15;
  
  if (effectiveX > 50) borderColor = 'border-green-400';
  if (effectiveX < -50) borderColor = 'border-red-400';

  return (
    // Changed fixed height to responsive (vh) and added max-w constraint for better margins
    <div className="perspective-1000 w-full max-w-[85vw] md:max-w-2xl mx-auto h-[55vh] min-h-[350px] md:h-[600px] cursor-pointer relative select-none">
       {/* Instruction Overlay on Drag */}
       {effectiveX > 50 && (
         <div className="absolute top-8 right-8 z-50 bg-green-500 text-white px-6 py-2 rounded-full text-lg font-bold shadow-xl animate-pulse">
           ZNAM
         </div>
       )}
       {effectiveX < -50 && (
         <div className="absolute top-8 left-8 z-50 bg-red-500 text-white px-6 py-2 rounded-full text-lg font-bold shadow-xl animate-pulse">
           NIE ZNAM
         </div>
       )}

      <div
        onClick={() => Math.abs(dragX) < 10 && setIsFlipped(!isFlipped)}
        onTouchStart={handleTouchStart}
        onMouseDown={handleTouchStart}
        className={`relative w-full h-full text-center transform-style-3d shadow-xl rounded-3xl bg-white border-[1px] md:border-4 ${borderColor}`}
        style={{
          transform: `translateX(${effectiveX}px) rotate(${rotate}deg) rotateY(${isFlipped ? 180 : 0}deg)`,
          transition: isDragging ? 'none' : 'transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {/* Front */}
        <div className="absolute w-full h-full backface-hidden flex flex-col items-center justify-center p-4 md:p-8 rounded-3xl bg-white bg-gradient-to-br from-white to-slate-50">
          <div className="absolute top-6 text-xs md:text-base uppercase tracking-[0.2em] text-slate-400 font-semibold">{word.category}</div>
          
          {/* Added break-words and responsive text sizing to fix overflow */}
          <h2 className="text-3xl sm:text-4xl md:text-7xl font-bold text-slate-800 mb-8 break-words max-w-full px-2 leading-tight">
            {word.polish}
          </h2>

          <div className="absolute bottom-6 md:bottom-8 flex flex-col items-center">
             <span className="text-[10px] md:text-sm text-slate-400 font-medium uppercase tracking-wide">Dotknij aby odwrócić</span>
             <div className="w-8 h-1 bg-slate-200 rounded-full mt-2"></div>
          </div>
        </div>

        {/* Back */}
        <div className="absolute w-full h-full backface-hidden rotate-y-180 flex flex-col rounded-3xl bg-white overflow-hidden shadow-inner">
          {/* Image Section - Takes up 50% of height on mobile to save space */}
          <div className="h-[50%] md:h-[55%] w-full bg-slate-100 relative group">
             {imageUrl ? (
                <img 
                    src={imageUrl} 
                    alt={word.english} 
                    className="w-full h-full object-cover" 
                />
             ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50">
                    <span className="text-4xl">🖼️</span>
                </div>
             )}
             
             {onRegenerateImage && (
                 <button 
                    onClick={(e) => { e.stopPropagation(); onRegenerateImage(); }}
                    className="absolute top-4 right-4 bg-white/80 p-2 rounded-full shadow-md hover:bg-white transition-all text-slate-600 hover:text-indigo-600"
                    title="Odśwież obrazek"
                 >
                     🔄
                 </button>
             )}
             <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent"></div>
          </div>

          {/* Text Section */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 bg-white relative">
              <h2 className="text-3xl md:text-6xl font-bold text-indigo-700 mb-2 md:mb-4 break-words max-w-full text-center leading-tight">{word.english}</h2>
              {word.exampleSentence && (
                <div className="bg-indigo-50 px-3 py-2 rounded-xl max-w-[95%]">
                    <p className="text-indigo-800/80 italic text-xs md:text-lg font-medium leading-relaxed">
                        "{word.exampleSentence}"
                    </p>
                </div>
              )}
          </div>
        </div>
      </div>
      
      {/* Controls below card - Reduced margins */}
      <div className="flex justify-between items-center mt-4 md:mt-10 px-4 md:px-20 max-w-2xl mx-auto w-full">
        <button 
            onClick={(e) => { e.stopPropagation(); triggerResult(false); }}
            className="group flex flex-col items-center gap-1 md:gap-2 transition-transform hover:scale-105 active:scale-95"
        >
            <div className="w-14 h-14 md:w-20 md:h-20 rounded-full border-2 border-red-100 bg-white group-hover:bg-red-50 group-hover:border-red-200 flex items-center justify-center shadow-md text-red-500 text-2xl md:text-4xl transition-colors">
                ✕
            </div>
            <span className="text-[10px] md:text-sm font-bold text-slate-400 group-hover:text-red-500 uppercase tracking-wide">Nie wiem</span>
        </button>
        
        <div className="text-xs text-slate-300 font-mono hidden md:block">
            ← NIE WIEM | SPACJA | WIEM →
        </div>

        <button 
            onClick={(e) => { e.stopPropagation(); triggerResult(true); }}
            className="group flex flex-col items-center gap-1 md:gap-2 transition-transform hover:scale-105 active:scale-95"
        >
             <div className="w-14 h-14 md:w-20 md:h-20 rounded-full border-2 border-green-100 bg-white group-hover:bg-green-50 group-hover:border-green-200 flex items-center justify-center shadow-md text-green-500 text-2xl md:text-4xl transition-colors">
                ✓
             </div>
             <span className="text-[10px] md:text-sm font-bold text-slate-400 group-hover:text-green-500 uppercase tracking-wide">Wiem</span>
        </button>
      </div>
    </div>
  );
};

export default Flashcard;
