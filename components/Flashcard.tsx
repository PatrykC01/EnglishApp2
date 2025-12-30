import React, { useState, useRef } from 'react';
import { Word } from '../types';

interface FlashcardProps {
  word: Word;
  onResult: (correct: boolean) => void;
  imageUrl?: string;
}

const Flashcard: React.FC<FlashcardProps> = ({ word, onResult, imageUrl }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Touch/Mouse handlers for simple swipe logic
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startX = clientX;

    const handleMove = (moveEvent: TouchEvent | MouseEvent) => {
      const currentX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
      setDragX(currentX - startX);
    };

    const handleEnd = () => {
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);

      if (dragX > 100) {
        onResult(true); // Right swipe = Know
      } else if (dragX < -100) {
        onResult(false); // Left swipe = Don't Know
      }
      setDragX(0);
    };

    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
  };

  // Determine border color based on drag
  let borderColor = 'border-slate-200';
  let rotate = dragX / 15; // Reduced rotation sensitivity for larger cards
  if (dragX > 50) borderColor = 'border-green-400';
  if (dragX < -50) borderColor = 'border-red-400';

  return (
    <div className="perspective-1000 w-full max-w-sm md:max-w-2xl mx-auto h-[480px] md:h-[600px] cursor-pointer relative select-none">
       {/* Instruction Overlay on Drag */}
       {dragX > 50 && (
         <div className="absolute top-8 right-8 z-50 bg-green-500 text-white px-6 py-2 rounded-full text-lg font-bold shadow-xl animate-pulse">
           ZNAM
         </div>
       )}
       {dragX < -50 && (
         <div className="absolute top-8 left-8 z-50 bg-red-500 text-white px-6 py-2 rounded-full text-lg font-bold shadow-xl animate-pulse">
           NIE ZNAM
         </div>
       )}

      <div
        ref={cardRef}
        onClick={() => Math.abs(dragX) < 10 && setIsFlipped(!isFlipped)}
        onTouchStart={handleTouchStart}
        onMouseDown={handleTouchStart}
        className={`relative w-full h-full text-center transition-transform duration-500 transform-style-3d shadow-2xl rounded-3xl bg-white border-[1px] md:border-4 ${borderColor}`}
        style={{
          transform: `rotateY(${isFlipped ? 180 : 0}deg) translateX(${dragX}px) rotate(${rotate}deg)`,
        }}
      >
        {/* Front */}
        <div className="absolute w-full h-full backface-hidden flex flex-col items-center justify-center p-8 rounded-3xl bg-white bg-gradient-to-br from-white to-slate-50">
          <div className="absolute top-6 text-sm md:text-base uppercase tracking-[0.2em] text-slate-400 font-semibold">{word.category}</div>
          <h2 className="text-5xl md:text-7xl font-bold text-slate-800 mb-8">{word.polish}</h2>
          <div className="absolute bottom-8 flex flex-col items-center">
             <span className="text-xs md:text-sm text-slate-400 font-medium">Kliknij, aby odwrócić</span>
             <div className="w-12 h-1 bg-slate-200 rounded-full mt-2"></div>
          </div>
        </div>

        {/* Back */}
        <div className="absolute w-full h-full backface-hidden rotate-y-180 flex flex-col rounded-3xl bg-white overflow-hidden shadow-inner">
          {/* Image Section - Takes up 55% of height */}
          <div className="h-[55%] w-full bg-slate-100 relative">
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
             {/* Gradient overlay for text readability transition */}
             <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent"></div>
          </div>

          {/* Text Section - Takes remaining space */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-white relative">
              <h2 className="text-4xl md:text-6xl font-bold text-indigo-700 mb-3 md:mb-4">{word.english}</h2>
              {word.exampleSentence && (
                <div className="bg-indigo-50 px-4 py-3 rounded-xl max-w-[90%]">
                    <p className="text-indigo-800/80 italic text-sm md:text-lg font-medium leading-relaxed">
                        "{word.exampleSentence}"
                    </p>
                </div>
              )}
          </div>
        </div>
      </div>
      
      {/* Controls below card */}
      <div className="flex justify-between items-center mt-8 md:mt-10 px-8 md:px-20 max-w-2xl mx-auto w-full">
        <button 
            onClick={(e) => { e.stopPropagation(); onResult(false); setIsFlipped(false); }}
            className="group flex flex-col items-center gap-2 transition-transform hover:scale-105"
        >
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-2 border-red-100 bg-white group-hover:bg-red-50 group-hover:border-red-200 flex items-center justify-center shadow-md text-red-500 text-3xl md:text-4xl transition-colors">
                ✕
            </div>
            <span className="text-xs md:text-sm font-bold text-slate-400 group-hover:text-red-500 uppercase tracking-wide">Nie wiem</span>
        </button>
        
        <div className="text-xs text-slate-300 font-mono hidden md:block">SPACJA = ODWRÓĆ</div>

        <button 
            onClick={(e) => { e.stopPropagation(); onResult(true); setIsFlipped(false); }}
            className="group flex flex-col items-center gap-2 transition-transform hover:scale-105"
        >
             <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-2 border-green-100 bg-white group-hover:bg-green-50 group-hover:border-green-200 flex items-center justify-center shadow-md text-green-500 text-3xl md:text-4xl transition-colors">
                ✓
             </div>
             <span className="text-xs md:text-sm font-bold text-slate-400 group-hover:text-green-500 uppercase tracking-wide">Wiem</span>
        </button>
      </div>
    </div>
  );
};

export default Flashcard;
