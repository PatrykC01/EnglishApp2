import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import StudySession from './views/StudySession';
import { Word, Settings, AppStats, StudyMode, WordStatus, LanguageLevel } from './types';
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
  
  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const loadedWords = storageService.getWords();
    setWords(loadedWords);
    updateStats(loadedWords);
  }, []);

  const updateStats = (currentWords: Word[]) => {
    const newStats: AppStats = {
      totalWords: currentWords.length,
      learnedWords: currentWords.filter(w => w.status === WordStatus.Learned).length,
      streakDays: stats.streakDays, // Logic needed to check dates
      lastStudyDate: stats.lastStudyDate
    };
    setStats(newStats);
    storageService.saveStats(newStats);
  };

  const startSession = (mode: StudyMode) => {
    // SRS Algorithm (Simplified): Pick 'New' words or 'Learning' words due for review
    const now = Date.now();
    const dueWords = words.filter(w => w.nextReview <= now || w.status === WordStatus.New)
                          .sort((a, b) => a.nextReview - b.nextReview)
                          .slice(0, 10); // Limit to 10 for a session

    if (dueWords.length === 0) {
        alert("Wszystkie słówka powtórzone! Dodaj nowe.");
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
            // Simple SRS Logic
            const isCorrect = res.correct;
            let nextReview = Date.now();
            let status = word.status;

            if (isCorrect) {
                // If correct, push review out. 1 day -> 3 days -> 7 days
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
                // If wrong, reset or keep short
                nextReview += 10 * 60 * 1000; // 10 minutes
                return { 
                    ...word, 
                    correct: 0, // Reset streak 
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

  const handleGenerateWords = async (category: string) => {
      setIsGenerating(true);
      try {
          // If free provider, we can't really generate well. 
          if (settings.aiProvider === 'free') {
              alert("Proszę wybrać dostawcę Gemini w ustawieniach, aby generować słowa.");
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

  if (isStudying) {
      return (
          <div className="h-screen bg-white">
              <StudySession 
                mode={studyMode} 
                words={sessionWords} 
                onComplete={handleSessionComplete}
                onExit={() => setIsStudying(false)}
              />
          </div>
      );
  }

  // --- DASHBOARD VIEW ---
  const renderDashboard = () => (
    <div className="space-y-6">
       <header className="mb-8">
           <h2 className="text-3xl font-bold text-slate-800">Cześć, {settings.userName}! 👋</h2>
           <p className="text-slate-500">Gotowy na dzisiejszą dawkę wiedzy?</p>
       </header>

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
           <h3 className="text-xl font-bold text-slate-800 mb-4">Tryby Nauki</h3>
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
  const renderWordList = () => (
      <div className="space-y-4">
          <h2 className="text-2xl font-bold mb-4">Baza Słów ({words.length})</h2>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {words.map((word, idx) => (
                  <div key={word.id} className={`p-4 flex justify-between items-center ${idx !== words.length-1 ? 'border-b border-slate-100' : ''}`}>
                      <div>
                          <div className="font-bold text-slate-800">{word.english}</div>
                          <div className="text-sm text-slate-500">{word.polish}</div>
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
              {words.length === 0 && <div className="p-8 text-center text-slate-400">Brak słów. Użyj generatora AI!</div>}
          </div>
      </div>
  );

  // --- SETTINGS VIEW ---
  const renderSettings = () => (
      <div className="space-y-6 max-w-lg">
          <h2 className="text-2xl font-bold">Ustawienia</h2>
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold mb-4 text-slate-700">Integracja AI</h3>
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm text-slate-500 mb-1">Dostawca (Tekst)</label>
                      <select 
                        value={settings.aiProvider}
                        onChange={(e) => {
                            const newSettings = { ...settings, aiProvider: e.target.value as any };
                            setSettings(newSettings);
                            storageService.saveSettings(newSettings);
                        }}
                        className="w-full p-2 border rounded-lg"
                      >
                          <option value="free">Darmowy (Tylko podstawy)</option>
                          <option value="gemini">Google Gemini (Pełna moc)</option>
                      </select>
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
                                 <div className="text-[10px] opacity-70">Szybki, większe limity</div>
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
                                 <div className="text-[10px] opacity-70">Lepsza jakość, mniejsze limity</div>
                             </button>
                          </div>
                           <div className="mt-2 text-xs text-slate-400">
                               API Google Gemini jest aktywne. Jeśli wystąpi błąd "429 Quota", przełącz na Flash lub odczekaj chwilę.
                           </div>
                      </div>
                  )}
                  
                  <hr className="my-4 border-slate-100" />
                  
                  <div>
                       <h4 className="text-sm font-semibold text-slate-700 mb-2">Generowanie Obrazów (Hugging Face)</h4>
                       <p className="text-xs text-slate-500 mb-3">
                           Podaj swój klucz API z <a href="https://huggingface.co/settings/tokens" target="_blank" className="text-indigo-600 underline">huggingface.co</a>, aby używać modelu Stable Diffusion 2.1 (Wyższa jakość).
                           Bez klucza używany będzie Pollinations.ai.
                       </p>
                       <label className="block text-sm text-slate-500 mb-1">Klucz API Hugging Face (Opcjonalne)</label>
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
                          <div className="mt-2 text-xs text-green-600">✅ Klucz zapisany. Używanie Stable Diffusion via Vercel Proxy.</div>
                       ) : (
                          <div className="mt-2 text-xs text-blue-500">ℹ️ Brak klucza. Używanie darmowego Pollinations.ai.</div>
                       )}
                   </div>
              </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold mb-4 text-slate-700">Preferencje</h3>
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm text-slate-500 mb-1">Twoje Imię</label>
                      <input 
                         type="text" 
                         value={settings.userName}
                         onChange={(e) => {
                             const newSettings = { ...settings, userName: e.target.value };
                             setSettings(newSettings);
                             storageService.saveSettings(newSettings);
                         }}
                         className="w-full p-2 border rounded-lg"
                       />
                  </div>
                  <div>
                      <label className="block text-sm text-slate-500 mb-1">Poziom (CEFR)</label>
                      <select 
                        value={settings.level}
                        onChange={(e) => {
                            const newSettings = { ...settings, level: e.target.value as LanguageLevel };
                            setSettings(newSettings);
                            storageService.saveSettings(newSettings);
                        }}
                        className="w-full p-2 border rounded-lg"
                      >
                          {Object.values(LanguageLevel).map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                  </div>
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
        {/* Placeholder for Study Tab entry if clicked directly */}
        {activeTab === 'study' && (
            <div className="text-center py-20">
                <h2 className="text-2xl font-bold mb-4">Wybierz tryb z Dashboardu</h2>
                <button onClick={() => setActiveTab('dashboard')} className="text-indigo-600 underline">Wróć</button>
            </div>
        )}
    </Layout>
  );
};

export default App;
