import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'study', label: 'Nauka', icon: '🎓' },
    { id: 'words', label: 'Baza Słów', icon: '📚' },
    { id: 'settings', label: 'Ustawienia', icon: '⚙️' },
  ];

  return (
    // Use h-full here because body already has the correct --app-height
    <div className="flex flex-col md:flex-row h-full bg-slate-50 overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-slate-200 shadow-sm z-10 h-full">
        <div className="p-6">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
            AI Vocab
          </h1>
          <p className="text-xs text-slate-500 mt-1">Inteligentna nauka</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-indigo-50 text-indigo-700 font-medium shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content Area - Critical fix: flex-1 allows it to take remaining space, relative for positioning */}
      <main className="flex-1 flex flex-col relative w-full h-full overflow-hidden">
        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden w-full h-full pb-24 md:pb-0 pt-safe">
            <div className="max-w-5xl mx-auto p-4 md:p-8 min-h-full">
              {children}
            </div>
        </div>

        {/* Mobile Bottom Nav - Fixed and Safe Area Aware */}
        <nav className="md:hidden absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around items-center z-50 pb-safe pt-2 px-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center p-2 rounded-lg w-full h-[60px] ${
                activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              <span className="text-2xl mb-1">{tab.icon}</span>
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
};

export default Layout;
