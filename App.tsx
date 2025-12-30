import React, { useState, useEffect, useMemo } from 'react';
import Layout from './components/Layout';
import StudySession from './views/StudySession';
import AddWordModal from './components/AddWordModal';
import { Word, Settings, AppStats, StudyMode, WordStatus, LanguageLevel, StudySource } from './types';
import { storageService } from './services/storage';
import { geminiService } from './services/gemini';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [words, setWords] = useState<Word[]>([]);
  const [settings, setSettings] = useState<Settings>(storageService.getSettings());
  const [stats, setStats] = useState<AppStats>(storageService.getStats());
  
  const [isStudying, setIsStudying] = useState(false);
  const [studyMode, setStudyMode] = useState<StudyMode>(StudyMode.flashcards);
  const [sessionWords, setSessionWords] = useState<Word[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [listFilter, setListFilter] = useState<StudySource>(StudySource.All);

  useEffect(() => {
    const loadedWords = storageService.getWords();
    setWords(loadedWords);
    updateStats(loadedWords);
  }, []);

  const updateStats = (currentWords: Word[]) => {
    const newStats: AppStats = {
      totalWords: currentWords.length,
      learnedWords: currentWords.filter(w => w.status === WordStatus.Learned).length,
      streakDays: stats.streakDays, 
      lastStudyDate: stats.lastStudyDate
    };
    setStats(newStats);
    storageService.saveStats(newStats);
  };

  const getEligibleWords = useMemo(() => {
    if (settings.preferredStudySource === StudySource.Manual) {
        return words.filter(w => w.aiGenerated === false);
    } else if (settings.preferredStudySource === StudySource.AiGenerated) {
        return words.filter(w => w.aiGenerated === true);
    }
    return words;
  }, [words, settings.preferredStudySource]);

  const startSession = (mode: StudyMode) => {
    const now = Date.now();
    const eligibleWords = getEligibleWords;
    const dueWords = eligibleWords.filter(w => w.nextReview <= now || w.status === WordStatus.New)
                          .sort((a, b) => a.nextReview - b.nextReview)
                          .slice(0, 10);

    if (dueWords.length === 0) {
        const fallbackWords = eligibleWords.sort(() => 0.5 - Math.random()).slice(0, 10);
        if (fallbackWords.length > 0) {
             if (confirm(`Brak powtórek na dziś. Czy chcesz uruchomić tryb swobodny z losowymi słowami?`)) {
                 setSessionWords(fallbackWords);
                 setStudyMode(mode);
                 setIsStudying(true);
             }
             return;
        }
        alert(`Baza słówek jest pusta lub wybrany filtr nie zwraca wyników.`);
        return;
    }

    setSessionWords(dueWords);
    setStudyMode(mode);
    setIsStudying(true);
  };

  const handleSessionComplete = (results: { wordId: string; correct: boolean }[]) => {
    const updatedWords = words.map(word => {
        const res = results.find(r => r.wordId === word.id);
        if (res) {
            const isCorrect = res.correct;
            let nextReview = Date.now();
            let status = word.status;

            if (isCorrect) {
                const days = word.correct === 0 ? 1 : word.correct === 1 ? 3 : 7;
                nextReview += days * 24 * 60 * 60 * 1000;
                status = word.correct > 3 ? WordStatus.Learned : WordStatus.Learning;
                return { ...word, correct: word.correct + 1, attempts: word.attempts + 1, lastReview: Date.now(), nextReview, status };
            } else {
                nextReview += 10 * 60 * 1000;
                return { ...word, correct: 0, attempts: word.attempts + 1, lastReview: Date.now(), nextReview, status: WordStatus.Learning };
            }
        }
        return word;
    });

    setWords(updatedWords);
    storageService.saveWords(updatedWords);
    updateStats(updatedWords);
    setIsStudying(false);
  };

  const handleWordUpdate = (updatedWord: Word) => {
    const newMasterList = words.map(w => w.id === updatedWord.id ? updatedWord : w);
    setWords(newMasterList);
    storageService.saveWords(newMasterList);
    if (isStudying) {
        setSessionWords(prev => prev.map(w => w.id === updatedWord.id ? updatedWord : w));
    }
  };

  const handleGenerateWords = async (category: string) => {
      setIsGenerating(true);
      try {
          const existingEnglish = words.map(w => w.english);
          const newWords = await geminiService.generateWords(category, settings.level, 5, existingEnglish);
          if (newWords.length > 0) {
              const merged = [...words, ...newWords];
              setWords(merged);
              storageService.saveWords(merged);
              updateStats(merged);
          }
      } catch (e) {
          alert("Błąd generowania. Sprawdź konfigurację API w Ustawieniach.");
          console.error(e);
      } finally {
          setIsGenerating(false);
      }
  };
  
  const handleManualAddWord = (newWord: Word) => {
      const merged = [newWord, ...words];
      setWords(merged);
      storageService.saveWords(merged);
      updateStats(merged);
  };

  if (isStudying) {
      return (
          <div className="h-screen bg-white">
              <StudySession 
                mode={studyMode} 
                words={sessionWords} 
                onComplete={handleSessionComplete}
                onUpdateWord={handleWordUpdate}
                onExit={() => setIsStudying(false)}
              />
          </div>
      );
  }

  const renderDashboard = () => (
    <div className="space-y-6">
       <header className="mb-8 flex justify-between items-center">
           <div>
             <h2 className="text-3xl font-bold text-slate-800">Cześć, {settings.userName}! 👋</h2>
             <p className="text-slate-500">Gotowy na dzisiejszą dawkę wiedzy?</p>
           </div>
           <button onClick={() => setIsAddModalOpen(true)} className="bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">+ Dodaj Słowo</button>
       </header>

       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div className="text-3xl font-bold text-indigo-600 mb-1">{stats.totalWords}</div><div className="text-sm text-slate-400">Wszystkie słowa</div></div>
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div className="text-3xl font-bold text-green-600 mb-1">{stats.learnedWords}</div><div className="text-sm text-slate-400">Nauczone</div></div>
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div className="text-3xl font-bold text-orange-500 mb-1">{words.filter(w => w.nextReview <= Date.now() && w.status !== WordStatus.New).length}</div><div className="text-sm text-slate-400">Do powtórki</div></div>
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div className="text-3xl font-bold text-blue-500 mb-1">{words.filter(w => w.status === WordStatus.New).length}</div><div className="text-sm text-slate-400">Nowe</div></div>
       </div>

       <div className="mt-8">
           <div className="flex justify-between items-end mb-4">
               <h3 className="text-xl font-bold text-slate-800">Tryby Nauki</h3>
               <div className="flex bg-slate-100 p-1 rounded-lg">
                   {[{ val: StudySource.All, label: 'Wszystkie' }, { val: StudySource.Manual, label: 'Moje' }, { val: StudySource.AiGenerated, label: 'AI' }].map(opt => (
                       <button key={opt.val} onClick={() => { const newS = { ...settings, preferredStudySource: opt.val }; setSettings(newS); storageService.saveSettings(newS); }} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${settings.preferredStudySource === opt.val ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{opt.label}</button>
                   ))}
               </div>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <button onClick={() => startSession(StudyMode.flashcards)} className="flex items-center p-6 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"><div className="text-4xl mr-4">🃏</div><div className="text-left"><div className="font-bold text-lg">Fiszki</div><div className="text-indigo-100 text-sm">Klasyczna nauka z gestami</div></div></button>
               <button onClick={() => startSession(StudyMode.match)} className="flex items-center p-6 bg-white border border-slate-200 text-slate-800 rounded-2xl hover:border-indigo-300 transition-all hover:bg-slate-50"><div className="text-4xl mr-4">🧩</div><div className="text-left"><div className="font-bold text-lg">Dopasowywanie</div><div className="text-slate-500 text-sm">Połącz pary słów</div></div></button>
               <button onClick={() => startSession(StudyMode.typing)} className="flex items-center p-6 bg-white border border-slate-200 text-slate-800 rounded-2xl hover:border-indigo-300 transition-all hover:bg-slate-50"><div className="text-4xl mr-4">⌨️</div><div className="text-left"><div className="font-bold text-lg">Pisanie</div><div className="text-slate-500 text-sm">Ćwicz poprawną pisownię</div></div></button>
               <button onClick={() => startSession(StudyMode.listening)} className="flex items-center p-6 bg-white border border-slate-200 text-slate-800 rounded-2xl hover:border-indigo-300 transition-all hover:bg-slate-50"><div className="text-4xl mr-4">🎧</div><div className="text-left"><div className="font-bold text-lg">Słuchanie</div><div className="text-slate-500 text-sm">Rozumienie ze słuchu (TTS)</div></div></button>
           </div>
       </div>

       <div className="mt-8 bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
           <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-indigo-900">✨ AI Generator Słów</h3>{isGenerating && <span className="text-sm text-indigo-600 animate-pulse">Generowanie...</span>}</div>
           <div className="flex gap-2 overflow-x-auto pb-2">
               {['Biznes', 'Podróże', 'Jedzenie', 'Technologia', 'Dom', 'Natura'].map(cat => (
                   <button key={cat} disabled={isGenerating} onClick={() => handleGenerateWords(cat)} className="px-4 py-2 bg-white text-indigo-600 rounded-full text-sm font-medium hover:bg-indigo-600 hover:text-white transition-colors border border-indigo-200 whitespace-nowrap">+ {cat}</button>
               ))}
           </div>
       </div>
    </div>
  );

  const renderWordList = () => {
      const filteredList = words.filter(w => {
          if (listFilter === StudySource.Manual) return !w.aiGenerated;
          if (listFilter === StudySource.AiGenerated) return w.aiGenerated;
          return true;
      });

      return (
      <div className="space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <h2 className="text-2xl font-bold">Baza Słów ({filteredList.length})</h2>
            <div className="flex gap-2 w-full md:w-auto">
                 <select value={listFilter} onChange={(e) => setListFilter(e.target.value as StudySource)} className="p-2 border border-slate-300 rounded-lg text-sm bg-white"><option value={StudySource.All}>Wszystkie</option><option value={StudySource.Manual}>Tylko moje</option><option value={StudySource.AiGenerated}>Tylko AI</option></select>
                <button onClick={() => setIsAddModalOpen(true)} className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700"> + Dodaj </button>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {filteredList.map((word, idx) => (
                  <div key={word.id} className={`p-4 flex justify-between items-center ${idx !== filteredList.length-1 ? 'border-b border-slate-100' : ''}`}>
                      <div><div className="font-bold text-slate-800">{word.english}</div><div className="text-sm text-slate-500">{word.polish}</div></div>
                      <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${word.status === WordStatus.New ? 'bg-blue-100 text-blue-700' : word.status === WordStatus.Learned ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{word.status}</span>
                          <button onClick={() => { const newWords = words.filter(w => w.id !== word.id); setWords(newWords); storageService.saveWords(newWords); updateStats(newWords); }} className="text-slate-300 hover:text-red-500">🗑️</button>
                      </div>
                  </div>
              ))}
          </div>
      </div>
  )};

  const renderSettings = () => (
      <div className="space-y-6 max-w-lg pb-10">
          <h2 className="text-2xl font-bold">Ustawienia</h2>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold mb-4 text-slate-700">Główny Dostawca AI</h3>
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm text-slate-500 mb-1">Wybierz silnik</label>
                      <select value={settings.aiProvider} onChange={(e) => { const newS = { ...settings, aiProvider: e.target.value as any }; setSettings(newS); storageService.saveSettings(newS); }} className="w-full p-2 border rounded-lg bg-white">
                          <option value="gemini">Google Gemini</option>
                          <option value="perplexity">Perplexity AI</option>
                          <option value="custom">Własne API (np. subnp.com / Kie-API)</option>
                          <option value="pollinations">Pollinations (Tylko obrazy)</option>
                          <option value="free">Tryb podstawowy (Offline)</option>
                      </select>
                  </div>

                  {settings.aiProvider === 'custom' && (
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 space-y-3">
                         <h4 className="text-sm font-semibold text-amber-900 mb-2">Konfiguracja Własnego API</h4>
                         <div>
                            <label className="text-[10px] uppercase text-amber-600 font-bold block mb-1">Endpoint URL (Base)</label>
                            <input type="text" value={settings.customApiBase} placeholder="np. https://api.subnp.com/v1" onChange={(e) => { const newS = { ...settings, customApiBase: e.target.value }; setSettings(newS); storageService.saveSettings(newS); }} className="w-full p-2 border rounded-lg bg-white text-sm" />
                         </div>
                         <div>
                            <label className="text-[10px] uppercase text-amber-600 font-bold block mb-1">Klucz API</label>
                            <input type="password" value={settings.customApiKey} placeholder="API Key" onChange={(e) => { const newS = { ...settings, customApiKey: e.target.value }; setSettings(newS); storageService.saveSettings(newS); }} className="w-full p-2 border rounded-lg bg-white font-mono text-sm" />
                         </div>
                         <div>
                            <label className="text-[10px] uppercase text-amber-600 font-bold block mb-1">Model (Tekst/Obraz)</label>
                            <input type="text" value={settings.customModelName} placeholder="np. gpt-4o lub flux-1" onChange={(e) => { const newS = { ...settings, customModelName: e.target.value }; setSettings(newS); storageService.saveSettings(newS); }} className="w-full p-2 border rounded-lg bg-white text-sm" />
                         </div>
                         <p className="text-[10px] text-amber-700 italic">Uwaga: Endpoint powinien być zgodny ze standardem OpenAI (/chat/completions).</p>
                    </div>
                  )}

                  {settings.aiProvider === 'perplexity' && (
                    <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                         <h4 className="text-sm font-semibold text-indigo-900 mb-2">Perplexity API Key</h4>
                         <input type="password" value={settings.perplexityApiKey} placeholder="pplx-..." onChange={(e) => { const newS = { ...settings, perplexityApiKey: e.target.value }; setSettings(newS); storageService.saveSettings(newS); }} className="w-full p-2 border rounded-lg bg-white font-mono text-sm" />
                    </div>
                  )}

                  <hr className="border-slate-100" />
                  
                  <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">Alternatywni Dostawcy Obrazów</h4>
                      <p className="text-xs text-slate-400 mb-3">Zostaną użyci jako fallback, jeśli główny dostawca nie wygeneruje obrazu.</p>
                      <div className="space-y-3">
                         <input type="password" value={settings.deepAiApiKey} placeholder="DeepAI API Key" onChange={(e) => { const newS = { ...settings, deepAiApiKey: e.target.value }; setSettings(newS); storageService.saveSettings(newS); }} className="w-full p-2 border rounded-lg bg-slate-50 text-sm" />
                         <input type="password" value={settings.huggingFaceApiKey} placeholder="Hugging Face API Key" onChange={(e) => { const newS = { ...settings, huggingFaceApiKey: e.target.value }; setSettings(newS); storageService.saveSettings(newS); }} className="w-full p-2 border rounded-lg bg-slate-50 text-sm" />
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'words' && renderWordList()}
        {activeTab === 'settings' && renderSettings()}
        <AddWordModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSave={handleManualAddWord} currentLevel={settings.level} />
    </Layout>
  );
};

export default App;
