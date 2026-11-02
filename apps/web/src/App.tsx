import React, { useState, useEffect } from 'react';
import { getStoredAuth, StoredAuth } from './api/client.js';
import { useHubEvents } from './hooks/useHubEvents.js';
import { Header } from './components/Header.js';
import { SignInScreen } from './screens/SignInScreen.js';
import { BoardScreen } from './screens/BoardScreen.js';
import { AgentsScreen } from './screens/AgentsScreen.js';
import { InboxScreen } from './screens/InboxScreen.js';
import { LocksScreen } from './screens/LocksScreen.js';
import { ActivityScreen } from './screens/ActivityScreen.js';
import { SetupScreen } from './screens/SetupScreen.js';
import { TaskDrawer } from './screens/TaskDrawer.js';
import { NewTaskModal } from './components/NewTaskModal.js';
import { CrazyCalculator } from './components/CrazyCalculator.js';

export const App: React.FC = () => {
  const [auth, setAuth] = useState<StoredAuth | null>(() => getStoredAuth());
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [currentTab, setCurrentTab] = useState<string>('board');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { isConnected, highlightedTaskId } = useHubEvents();

  // Apply theme class to document
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  // Global keyboard shortcuts
  useEffect(() => {
    let lastKey = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const now = Date.now();
      const key = e.key.toLowerCase();

      // Sequence: g then b, g then a, g then i
      if (lastKey === 'g' && now - lastKeyTime < 800) {
        if (key === 'b') {
          setCurrentTab('board');
          e.preventDefault();
        } else if (key === 'a') {
          setCurrentTab('agents');
          e.preventDefault();
        } else if (key === 'i') {
          setCurrentTab('inbox');
          e.preventDefault();
        }
      }

      if (key === 'n') {
        setIsNewTaskOpen(true);
        e.preventDefault();
      }

      if (key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search');
        searchInput?.focus();
      }

      lastKey = key;
      lastKeyTime = now;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!auth) {
    return <SignInScreen onSignInSuccess={() => setAuth(getStoredAuth())} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-hub-bg text-hub-text">
      <Header
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onNewTask={() => setIsNewTaskOpen(true)}
        onSearch={() => {
          const query = prompt('Search tasks by title:', searchQuery);
          if (query !== null) setSearchQuery(query);
        }}
        onOpenCalculator={() => setIsCalculatorOpen(true)}
        isConnected={isConnected}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        auth={auth}
        onSignOut={() => setAuth(null)}
      />

      <main className="flex flex-1 flex-col">
        {currentTab === 'board' && (
          <BoardScreen
            onSelectTask={(id) => setSelectedTaskId(id)}
            onNewTask={() => setIsNewTaskOpen(true)}
            highlightedTaskId={highlightedTaskId}
            searchQuery={searchQuery}
          />
        )}
        {currentTab === 'agents' && <AgentsScreen />}
        {currentTab === 'inbox' && <InboxScreen />}
        {currentTab === 'locks' && <LocksScreen />}
        {currentTab === 'activity' && <ActivityScreen onSelectTask={(id) => setSelectedTaskId(id)} />}
        {currentTab === 'setup' && <SetupScreen />}
      </main>

      {/* Task Detail Drawer */}
      {selectedTaskId && (
        <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      )}

      {/* New Task Modal */}
      <NewTaskModal isOpen={isNewTaskOpen} onClose={() => setIsNewTaskOpen(false)} />

      {/* Crazy Calculator Modal */}
      <CrazyCalculator isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
    </div>
  );
};
