import React from 'react';
import {
  LayoutGrid,
  Bot,
  Inbox,
  Lock,
  Activity,
  Settings,
  Sun,
  Moon,
  Plus,
  Search,
  WifiOff,
  LogOut,
  Calculator,
} from 'lucide-react';
import { clearStoredAuth, StoredAuth } from '../api/client.js';

interface HeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onNewTask: () => void;
  onSearch: () => void;
  onOpenCalculator?: () => void;
  isConnected: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  auth: StoredAuth;
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  onNewTask,
  onSearch,
  onOpenCalculator,
  isConnected,
  theme,
  onToggleTheme,
  auth,
  onSignOut,
}) => {
  const navItems = [
    { id: 'board', label: 'Board', icon: LayoutGrid, shortcut: 'g b' },
    { id: 'agents', label: 'Agents', icon: Bot, shortcut: 'g a' },
    { id: 'inbox', label: 'Inbox', icon: Inbox, shortcut: 'g i' },
    { id: 'locks', label: 'Locks', icon: Lock },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'setup', label: 'Setup', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-hub-border bg-hub-surface px-4 py-2.5 transition-colors">
      {!isConnected && (
        <div className="mb-2 flex items-center justify-between rounded bg-hub-danger/20 px-3 py-1.5 text-xs text-hub-danger">
          <div className="flex items-center gap-1.5">
            <WifiOff className="h-4 w-4 animate-pulse" />
            <span>Hub server disconnected. Retrying connection...</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Logo and Brand */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-bold tracking-tight text-hub-text">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-hub-accent font-mono text-sm text-white">
              AH
            </span>
            <span>Agent Hub</span>
          </div>

          {/* Navigation Items */}
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-hub-accent/15 text-hub-accent'
                      : 'text-hub-muted hover:bg-hub-bg hover:text-hub-text'
                  }`}
                  title={item.shortcut ? `Shortcut: ${item.shortcut}` : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onSearch}
            className="flex items-center gap-1.5 rounded-md border border-hub-border bg-hub-bg px-2.5 py-1.5 text-xs text-hub-muted hover:text-hub-text"
            title="Search (/)"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="rounded border border-hub-border px-1 font-mono text-[10px]">/</kbd>
          </button>

          <button
            onClick={onNewTask}
            className="flex items-center gap-1.5 rounded-md bg-hub-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            title="New Task (n)"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Task</span>
            <kbd className="hidden rounded bg-white/20 px-1 font-mono text-[10px] sm:inline">n</kbd>
          </button>

          {onOpenCalculator && (
            <button
              onClick={onOpenCalculator}
              className="flex items-center gap-1.5 rounded-md border border-purple-500/40 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-400 hover:bg-purple-500/20"
              title="Open Crazy Calculator"
            >
              <Calculator className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Crazy Calc</span>
            </button>
          )}

          <button
            onClick={onToggleTheme}
            className="rounded-md border border-hub-border bg-hub-surface p-1.5 text-hub-muted hover:text-hub-text"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <div className="hidden items-center gap-1.5 border-l border-hub-border pl-2 sm:flex">
            <span className="h-2 w-2 rounded-full bg-hub-success" />
            <span className="text-xs text-hub-muted">{auth.memberName || 'Member'}</span>
          </div>

          <button
            onClick={() => {
              clearStoredAuth();
              onSignOut();
            }}
            className="rounded-md border border-hub-border p-1.5 text-hub-muted hover:text-hub-danger"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile nav selector at 390px */}
      <div className="mt-2.5 flex overflow-x-auto border-t border-hub-border pt-2 sm:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
                isActive ? 'bg-hub-accent/20 text-hub-accent' : 'text-hub-muted'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
