import React, { useState } from 'react';
import { geminiService } from '../services/gemini';
import { Word, WordStatus, LanguageLevel } from '../types';

interface AddWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (word: Word) => void;
  currentLevel: LanguageLevel;
}

const AddWordModal: React.FC<AddWordModalProps> = ({ isOpen, onClose, onSave, currentLevel }) => {
  const [polish, setPolish] = useState('');
  const [english, setEnglish] = useState('');
  const [category, setCategory] = useState('własne');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validation
    if (!polish.trim() && !english.trim()) {
        setError('Wpisz przynajmniej jedno słowo (polskie lub angielskie).');
        return;
    }

    setIsLoading(true);

    let finalPolish = polish.trim();
    let finalEnglish = english.trim();
    let finalExample = '';

    try {
        // Case 1: Only Polish -> Translate to EN & Generate Sentence
        if (!finalEnglish && finalPolish) {
            const result = await geminiService.translateWord(finalPolish, 'pl');
            finalEnglish = result.translation;
            finalExample = result.exampleSentence;
        } 
        // Case 2: Only English -> Translate to PL & Generate Sentence
        else if (!finalPolish && finalEnglish) {
            const result = await geminiService.translateWord(finalEnglish, 'en');
            finalPolish = result.translation;
            finalExample = result.exampleSentence;
        } 
        // Case 3: Both provided -> Generate ONLY the Example Sentence
        else if (finalPolish && finalEnglish) {
            finalExample = await geminiService.generateExampleSentence(finalEnglish);
        }

        // Create the word object
        const newWord: Word = {
            id: Math.random().toString(36).substr(2, 9),
            polish: finalPolish,
            english: finalEnglish,
            category: category || 'własne',
            level: currentLevel,
            status: WordStatus.New,
            nextReview: Date.now(),
            lastReview: null,
            attempts: 0,
            correct: 0,
            aiGenerated: false, // Explicitly false as it was user-initiated
            exampleSentence: finalExample || undefined
        };

        onSave(newWord);
        // Reset form
        setPolish('');
        setEnglish('');
        onClose();

    } catch (err) {
        console.error(err);
        setError('Błąd AI. Sprawdź klucz API lub wpisz oba tłumaczenia ręcznie.');
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
        <div className="p-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Dodaj nowe słowo</h2>
            <p className="text-sm text-slate-500 mb-6">
                Wpisz słowo po polsku LUB po angielsku (AI przetłumaczy). Jeśli wpiszesz oba, AI doda zdanie przykładowe!
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Po Polsku</label>
                    <input 
                        type="text" 
                        value={polish}
                        onChange={(e) => setPolish(e.target.value)}
                        placeholder="np. Samochód"
                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Po Angielsku</label>
                    <input 
                        type="text" 
                        value={english}
                        onChange={(e) => setEnglish(e.target.value)}
                        placeholder="np. Car"
                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Kategoria</label>
                    <input 
                        type="text" 
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="np. Dom"
                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>

                {error && <div className="text-red-500 text-sm">{error}</div>}

                <div className="flex gap-3 mt-6">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-600 font-medium hover:bg-slate-50 transition-colors"
                    >
                        Anuluj
                    </button>
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors flex justify-center items-center shadow-lg shadow-indigo-200"
                    >
                        {isLoading ? (
                            <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                        ) : (
                            'Zapisz'
                        )}
                    </button>
                </div>
            </form>
        </div>
      </div>
    </div>
  );
};

export default AddWordModal;
