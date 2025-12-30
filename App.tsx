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
  
  // Study Session State
  const [isStudying, setIsStudying] = useState(false);
  const [studyMode, setStudyMode] = useState<StudyMode>(StudyMode.Flashcards);
  const [sessionWords, setSessionWords] = useState<Word[]>([]);
  
  // Generation & Modal State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Word List Filter State
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

  // Logic to filter words based on settings
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
    const eligibleWords = getEligibleWords; // use memoized result

    // Filter by Due Date (SRS)
    const dueWords = eligibleWords.filter(w => w.nextReview <= now || w.status === WordStatus.New)
                          .sort((a, b) => a.nextReview - b.nextReview)
                          .slice(0, 10); // Limit to 10

    if (dueWords.length === 0) {
        const sourceText = settings.preferredStudySource === StudySource.Manual ? 'ręcznych' :
                           settings.preferredStudySource === StudySource.AiGenerated ? 'wygenerowanych przez AI' : 'wszystkich';
        
        // Try fallback to just random learning if SRS is empty but we have words
        const fallbackWords = eligibleWords.sort(() => 0.5 - Math.random()).slice(0, 10);
        
        if (fallbackWords.length > 0) {
             if (confirm(`Brak słów wymagających powtórki w kategorii: ${sourceText}. Czy chcesz uruchomić tryb swobodny z ${fallbackWords.length} słowami?`)) {
                 setSessionWords(fallbackWords);
                 setStudyMode(mode);
                 setIsStudying(true);
             }
             return;
        }

        alert(`Brak dostępnych słówek w kategorii: ${sourceText}. Dodaj nowe słowa lub zmień filtr.`);
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
                return { 
                    ...word, 
                    correct: word.correct + 1, 
                    attempts: word.attempts + 1, 
                    lastReview: Date.now(),
                    nextReview,
                    status
                };
            } else {
                nextReview += 10 * 60 * 1000; // 10 minutes
                return { 
                    ...word, 
                    correct: 0, 
                    attempts: word.attempts + 1,
                    lastReview: Date.now(),
                    nextReview,
                    status: WordStatus.Learning
                };
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
    // Update master list and save to storage
    const newMasterList = words.map(w => w.id === updatedWord.id ? updatedWord : w);
    setWords(newMasterList);
    storageService.saveWords(newMasterList);
    
    // Update current session list if we are studying, so the user sees the new data (e.g. image) immediately if they cycle back
    if (isStudying) {
        setSessionWords(prev => prev.map(w => w.id === updatedWord.id ? updatedWord : w));
    }
  };

  const handleGenerateWords = async (category: string) => {
      setIsGenerating(true);
      try {
          if (settings.aiProvider === 'free') {
              alert("Proszę wybrać dostawcę Gemini w ustawieniach, aby generować słowa (Darmowy tryb obsługuje tylko generowanie obrazków, nie słów).");
              setIsGenerating(false);
              return;
          }

          const existingEnglish = words.map(w => w.english);
          const newWords = await geminiService.generateWords(category, settings.level, 5, existingEnglish);
          
          if (newWords.length > 0) {
              const merged = [...words, ...newWords];
              setWords(merged);
              storageService.saveWords(merged);
              updateStats(merged);
              alert(`Dodano ${newWords.length} słów!`);
          }
      } catch (e) {
          alert("Błąd generowania. Sprawdź konfigurację API Key lub limity.");
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

  // --- DASHBOARD VIEW ---
  const renderDashboard = () => (
    <div className="space-y-6">
       <header className="mb-8 flex justify-between items-center">
           <div>
             <h2 className="text-3xl font-bold text-slate-800">Cześć, {settings.userName}! 👋</h2>
             <p className="text-slate-500">Gotowy na dzisiejszą dawkę wiedzy?</p>
           </div>
           <button 
             onClick={() => setIsAddModalOpen(true)}
             className="bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center"
           >
             <span className="text-xl mr-2">+</span> Dodaj Słowo
           </button>
       </header>

       {/* Stats Grid */}
       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
               <div className="text-3xl font-bold text-indigo-600 mb-1">{stats.totalWords}</div>
               <div className="text-sm text-slate-400">Wszystkie słowa</div>
           </div>
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
               <div className="text-3xl font-bold text-green-600 mb-1">{stats.learnedWords}</div>
               <div className="text-sm text-slate-400">Nauczone</div>
           </div>
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
               <div className="text-3xl font-bold text-orange-500 mb-1">
                 {words.filter(w => w.nextReview <= Date.now() && w.status !== WordStatus.New).length}
               </div>
               <div className="text-sm text-slate-400">Do powtórki</div>
           </div>
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
               <div className="text-3xl font-bold text-blue-500 mb-1">
                  {words.filter(w => w.status === WordStatus.New).length}
               </div>
               <div className="text-sm text-slate-400">Nowe</div>
           </div>
       </div>

       <div className="mt-8">
           <div className="flex justify-between items-end mb-4">
               <h3 className="text-xl font-bold text-slate-800">Tryby Nauki</h3>
               
               {/* Source Filter Selector */}
               <div className="flex bg-slate-100 p-1 rounded-lg">
                   {[
                       { val: StudySource.All, label: 'Wszystkie' },
                       { val: StudySource.Manual, label: 'Moje' },
                       { val: StudySource.AiGenerated, label: 'AI' }
                   ].map(opt => (
                       <button
                           key={opt.val}
                           onClick={() => {
                               const newS = { ...settings, preferredStudySource: opt.val };
                               setSettings(newS);
                               storageService.saveSettings(newS);
                           }}
                           className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                               settings.preferredStudySource === opt.val
                               ? 'bg-white text-indigo-700 shadow-sm'
                               : 'text-slate-500 hover:text-slate-700'
                           }`}
                       >
                           {opt.label}
                       </button>
                   ))}
               </div>
           </div>
           
           <div className="text-sm text-slate-500 mb-4 px-1">
              Dostępne słowa w wybranym trybie: <span className="font-bold text-indigo-600">{getEligibleWords.length}</span>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <button onClick={() => startSession(StudyMode.Flashcards)} className="flex items-center p-6 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]">
                   <div className="text-4xl mr-4">🃏</div>
                   <div className="text-left">
                       <div className="font-bold text-lg">Fiszki</div>
                       <div className="text-indigo-100 text-sm">Klasyczna nauka z gestami</div>
                   </div>
               </button>
               
               <button onClick={() => startSession(StudyMode.Match)} className="flex items-center p-6 bg-white border border-slate-200 text-slate-800 rounded-2xl hover:border-indigo-300 transition-all hover:bg-slate-50">
                   <div className="text-4xl mr-4">🧩</div>
                   <div className="text-left">
                       <div className="font-bold text-lg">Dopasowywanie</div>
                       <div className="text-slate-500 text-sm">Połącz pary słów</div>
                   </div>
               </button>

               <button onClick={() => startSession(StudyMode.Typing)} className="flex items-center p-6 bg-white border border-slate-200 text-slate-800 rounded-2xl hover:border-indigo-300 transition-all hover:bg-slate-50">
                   <div className="text-4xl mr-4">⌨️</div>
                   <div className="text-left">
                       <div className="font-bold text-lg">Pisanie</div>
                       <div className="text-slate-500 text-sm">Ćwicz poprawną pisownię</div>
                   </div>
               </button>
               
               <button onClick={() => startSession(StudyMode.Listening)} className="flex items-center p-6 bg-white border border-slate-200 text-slate-800 rounded-2xl hover:border-indigo-300 transition-all hover:bg-slate-50">
                   <div className="text-4xl mr-4">🎧</div>
                   <div className="text-left">
                       <div className="font-bold text-lg">Słuchanie</div>
                       <div className="text-slate-500 text-sm">Rozumienie ze słuchu (TTS)</div>
                   </div>
               </button>
           </div>
       </div>

       {/* Quick Add / Generator */}
       <div className="mt-8 bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
           <div className="flex justify-between items-center mb-4">
               <h3 className="text-lg font-bold text-indigo-900">✨ AI Generator Słów</h3>
               {isGenerating && <span className="text-sm text-indigo-600 animate-pulse">Generowanie...</span>}
           </div>
           <div className="flex gap-2 overflow-x-auto pb-2">
               {['Biznes', 'Podróże', 'Jedzenie', 'Technologia', 'Dom', 'Natura'].map(cat => (
                   <button 
                    key={cat} 
                    disabled={isGenerating}
                    onClick={() => handleGenerateWords(cat)}
                    className="px-4 py-2 bg-white text-indigo-600 rounded-full text-sm font-medium hover:bg-indigo-600 hover:text-white transition-colors border border-indigo-200"
                   >
                       + {cat}
                   </button>
               ))}
           </div>
       </div>
    </div>
  );

  // --- WORDS LIST VIEW ---
  const renderWordList = () => {
      // Filter list based on UI selection in Word List tab
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
                 {/* List Filter */}
                 <select 
                    value={listFilter}
                    onChange={(e) => setListFilter(e.target.value as StudySource)}
                    className="p-2 border border-slate-300 rounded-lg text-sm bg-white"
                 >
                     <option value={StudySource.All}>Wszystkie</option>
                     <option value={StudySource.Manual}>Tylko moje</option>
                     <option value={StudySource.AiGenerated}>Tylko AI</option>
                 </select>

                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 flex-1 md:flex-none text-center"
                >
                    + Dodaj
                </button>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {filteredList.map((word, idx) => (
                  <div key={word.id} className={`p-4 flex justify-between items-center ${idx !== filteredList.length-1 ? 'border-b border-slate-100' : ''}`}>
                      <div>
                          <div className="font-bold text-slate-800">{word.english}</div>
                          <div className="text-sm text-slate-500">{word.polish}</div>
                          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                              {word.aiGenerated ? '✨ AI' : '👤 Ręczne'} 
                              <span className="text-slate-300">|</span> 
                              Kat: {word.category}
                          </div>
                      </div>
                      <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                              word.status === WordStatus.New ? 'bg-blue-100 text-blue-700' :
                              word.status === WordStatus.Learned ? 'bg-green-100 text-green-700' :
                              'bg-yellow-100 text-yellow-700'
                          }`}>
                              {word.status}
                          </span>
                          <button 
                            onClick={() => {
                                const newWords = words.filter(w => w.id !== word.id);
                                setWords(newWords);
                                storageService.saveWords(newWords);
                                updateStats(newWords);
                            }}
                            className="text-slate-300 hover:text-red-500"
                          >
                              🗑️
                          </button>
                      </div>
                  </div>
              ))}
              {filteredList.length === 0 && (
                  <div className="p-8 text-center text-slate-400">
                      Brak słów spełniających kryteria.
                  </div>
              )}
          </div>
      </div>
  )};

  // --- SETTINGS VIEW ---
  const renderSettings = () => (
      <div className="space-y-6 max-w-lg">
          <h2 className="text-2xl font-bold">Ustawienia</h2>
          {/* Keep existing settings rendering code... (simplified for brevity, assume layout from previous but updated) */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold mb-4 text-slate-700">Integracja AI</h3>
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm text-slate-500 mb-1">Dostawca (Główny)</label>
                      <select 
                        value={settings.aiProvider}
                        onChange={(e) => {
                            const newSettings = { ...settings, aiProvider: e.target.value as any };
                            setSettings(newSettings);
                            storageService.saveSettings(newSettings);
                        }}
                        className="w-full p-2 border rounded-lg bg-white"
                      >
                          <option value="gemini">Google Gemini (Tekst + Obraz)</option>
                          <option value="pollinations">Pollinations.ai (Tylko Obrazy, Darmowe)</option>
                          <option value="free">Tryb Offline / Podstawowy</option>
                      </select>
                      <p className="text-xs text-slate-400 mt-1">
                        {settings.aiProvider === 'gemini' && "Wymaga API Key. Najlepsza jakość i generowanie słów."}
                        {settings.aiProvider === 'pollinations' && "Darmowe generowanie obrazków w stylu Craiyon/Flux. Generowanie słów niedostępne."}
                        {settings.aiProvider === 'free' && "Brak AI. Tylko ręczne dodawanie."}
                      </p>
                  </div>

                   {/* Model Selection for Gemini */}
                  {settings.aiProvider === 'gemini' && (
                      <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Model Gemini</label>
                          <div className="flex gap-2">
                             <button
                                onClick={() => {
                                    const newSettings = { ...settings, aiModelType: 'flash' as const };
                                    setSettings(newSettings);
                                    storageService.saveSettings(newSettings);
                                }}
                                className={`flex-1 py-2 px-3 rounded-md text-sm transition-colors ${
                                    settings.aiModelType === 'flash' 
                                    ? 'bg-white border-2 border-indigo-500 text-indigo-700 shadow-sm' 
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                             >
                                 ⚡ Flash
                             </button>
                             <button
                                onClick={() => {
                                    const newSettings = { ...settings, aiModelType: 'pro' as const };
                                    setSettings(newSettings);
                                    storageService.saveSettings(newSettings);
                                }}
                                className={`flex-1 py-2 px-3 rounded-md text-sm transition-colors ${
                                    settings.aiModelType === 'pro' 
                                    ? 'bg-white border-2 border-indigo-500 text-indigo-700 shadow-sm' 
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                             >
                                 🧠 Pro
                             </button>
                          </div>
                      </div>
                  )}

                  {settings.aiProvider !== 'pollinations' && (
                  <>
                    <hr className="my-4 border-slate-100" />
                    <div>
                         <h4 className="text-sm font-semibold text-slate-700 mb-2">Alternatywne Obrazy (Hugging Face)</h4>
                         <input 
                           type="password" 
                           value={settings.huggingFaceApiKey}
                           placeholder="hf_..."
                           onChange={(e) => {
                               const newSettings = { ...settings, huggingFaceApiKey: e.target.value };
                               setSettings(newSettings);
                               storageService.saveSettings(newSettings);
                           }}
                           className="w-full p-2 border rounded-lg bg-slate-50 font-mono text-sm"
                         />
                         {settings.huggingFaceApiKey ? (
                            <div className="mt-2 text-xs text-green-600">✅ Klucz zapisany.</div>
                         ) : (
                            <div className="mt-2 text-xs text-blue-500">ℹ️ Brak klucza. Jeśli Gemini zawiedzie, użyte zostanie Pollinations.</div>
                         )}
                     </div>
                  </>
                  )}
              </div>
          </div>
          
           <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
               <h3 className="font-bold mb-4 text-slate-700">Dane</h3>
               <button 
                onClick={() => {
                    const csvContent = "data:text/csv;charset=utf-8," + words.map(w => `${w.english},${w.polish},${w.category}`).join("\n");
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", "slownictwo.csv");
                    document.body.appendChild(link);
                    link.click();
                }}
                className="text-indigo-600 font-medium hover:underline"
               >
                   Eksportuj do CSV
               </button>
           </div>
      </div>
  );

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'words' && renderWordList()}
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'study' && (
            <div className="text-center py-20">
                <h2 className="text-2xl font-bold mb-4">Wybierz tryb z Dashboardu</h2>
                <button onClick={() => setActiveTab('dashboard')} className="text-indigo-600 underline">Wróć</button>
            </div>
        )}

        <AddWordModal 
            isOpen={isAddModalOpen} 
            onClose={() => setIsAddModalOpen(false)} 
            onSave={handleManualAddWord}
            currentLevel={settings.level}
        />
    </Layout>
  );
};

export default App;
