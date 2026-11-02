import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import { Message } from '@agent-hub/shared';

export const InboxScreen: React.FC = () => {
  const [kindFilter, setKindFilter] = useState<string>('all');

  const { data, isLoading } = useQuery<{ messages: Message[] }>({
    queryKey: ['messages'],
    queryFn: () => apiRequest('/api/v1/messages'),
  });

  const messages = data?.messages || [];

  const filtered = messages.filter((m) => {
    if (kindFilter !== 'all' && m.kind !== kindFilter) return false;
    return true;
  });

  return (
    <div className="flex-1 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-hub-text">Inbox & Coordination Messages</h1>
          <p className="text-xs text-hub-muted">Direct agent questions, blockers, and handoffs</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-hub-muted" htmlFor="kindFilterSelect">Kind:</label>
          <select
            id="kindFilterSelect"
            aria-label="Message Kind"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="rounded border border-hub-border bg-hub-surface px-2.5 py-1 text-xs text-hub-text focus:outline-none"
          >
            <option value="all">All Messages</option>
            <option value="blocker">Blockers</option>
            <option value="question">Questions</option>
            <option value="handoff">Handoffs</option>
            <option value="info">Info</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-hub-surface border border-hub-border" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-hub-border bg-hub-surface p-8 text-center text-xs text-hub-muted">
          No messages found.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((msg) => {
            const isBlocker = msg.kind === 'blocker';
            const isQuestion = msg.kind === 'question';

            return (
              <div
                key={msg.id}
                className={`rounded-lg border p-4 transition-colors ${
                  isBlocker
                    ? 'border-hub-danger/60 bg-hub-danger/10'
                    : 'border-hub-border bg-hub-surface'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-hub-muted">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        isBlocker
                          ? 'bg-hub-danger text-white'
                          : isQuestion
                          ? 'bg-hub-warning text-white'
                          : 'bg-hub-border text-hub-text'
                      }`}
                    >
                      {msg.kind}
                    </span>
                    {msg.task_id && (
                      <span className="font-mono text-hub-accent">Task #{msg.task_id.slice(-6)}</span>
                    )}
                  </div>
                  <span>{msg.created_at}</span>
                </div>

                <p className="mt-2 text-sm text-hub-text">{msg.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
