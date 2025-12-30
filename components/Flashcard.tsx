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
    // Only drag if not flipped? Or always? Let's say drag triggers result
    // Usually swipe is only on front or back. Let's assume swipe works on both but triggers result.
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
  let rotate = dragX / 10;
  if (dragX > 50) borderColor = 'border-green-400';
  if (dragX < -50) borderColor = 'border-red-400';

  return (
    <div className="perspective-1000 w-full max-w-md mx-auto h-96 cursor-pointer relative select-none">
       {/* Instruction Overlay on Drag */}
       {dragX > 50 && (
         <div className="absolute top-4 right-4 z-50 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg animate-pulse">
           ZNAM
         </div>
       )}
       {dragX < -50 && (
         <div className="absolute top-4 left-4 z-50 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg animate-pulse">
           NIE ZNAM
         </div>
       )}

      <div
        ref={cardRef}
        onClick={() => Math.abs(dragX) < 10 && setIsFlipped(!isFlipped)}
        onTouchStart={handleTouchStart}
        onMouseDown={handleTouchStart}
        className={`relative w-full h-full text-center transition-transform duration-500 transform-style-3d shadow-xl rounded-2xl bg-white border-4 ${borderColor}`}
        style={{
          transform: `rotateY(${isFlipped ? 180 : 0}deg) translateX(${dragX}px) rotate(${rotate}deg)`,
        }}
      >
        {/* Front */}
        <div className="absolute w-full h-full backface-hidden flex flex-col items-center justify-center p-6 rounded-xl bg-white">
          <div className="text-sm uppercase tracking-wider text-slate-400 mb-2">{word.category}</div>
          <h2 className="text-4xl font-bold text-slate-800 mb-6">{word.polish}</h2>
          <p className="text-slate-400 text-sm mt-8 animate-pulse">Dotknij aby odwrócić</p>
        </div>

        {/* Back */}
        <div className="absolute w-full h-full backface-hidden rotate-y-180 flex flex-col items-center justify-center p-6 rounded-xl bg-indigo-50 overflow-hidden">
          {imageUrl && (
             <div className="w-32 h-32 mb-4 rounded-lg overflow-hidden shadow-inner bg-white">
                <img src={imageUrl} alt={word.english} className="w-full h-full object-cover" />
             </div>
          )}
          <h2 className="text-3xl font-bold text-indigo-700 mb-2">{word.english}</h2>
          {word.exampleSentence && (
            <p className="text-indigo-600/80 italic text-sm mt-2 px-4">"{word.exampleSentence}"</p>
          )}
        </div>
      </div>
      
      {/* Controls below card */}
      <div className="flex justify-between mt-8 px-4">
        <button 
            onClick={(e) => { e.stopPropagation(); onResult(false); setIsFlipped(false); }}
            className="flex flex-col items-center text-red-500 hover:scale-110 transition-transform"
        >
            <div className="w-14 h-14 rounded-full border-2 border-red-200 bg-white flex items-center justify-center shadow-sm text-2xl">✕</div>
            <span className="text-xs font-semibold mt-1">Nie wiem</span>
        </button>
        <button 
            onClick={(e) => { e.stopPropagation(); onResult(true); setIsFlipped(false); }}
            className="flex flex-col items-center text-green-500 hover:scale-110 transition-transform"
        >
             <div className="w-14 h-14 rounded-full border-2 border-green-200 bg-white flex items-center justify-center shadow-sm text-2xl">✓</div>
             <span className="text-xs font-semibold mt-1">Wiem</span>
        </button>
      </div>
    </div>
  );
};

export default Flashcard;