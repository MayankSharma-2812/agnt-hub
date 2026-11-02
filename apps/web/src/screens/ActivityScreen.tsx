import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import { Event } from '@agent-hub/shared';
import { ChevronRight } from 'lucide-react';

interface ActivityScreenProps {
  onSelectTask: (taskId: string) => void;
}

export const ActivityScreen: React.FC<ActivityScreenProps> = ({ onSelectTask }) => {
  const [filterType, setFilterType] = useState<string>('all');

  const { data, isLoading } = useQuery<{ events: Event[] }>({
    queryKey: ['events'],
    queryFn: () => apiRequest('/api/v1/events'),
  });

  const events = data?.events || [];

  const filtered = events.filter((e) => {
    if (filterType !== 'all' && !e.type.startsWith(filterType)) return false;
    return true;
  });

  return (
    <div className="flex-1 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-hub-text">Activity & Audit Log</h1>
          <p className="text-xs text-hub-muted">Live event stream emitted on every state mutation</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-hub-muted" htmlFor="eventFilterSelect">Filter:</label>
          <select
            id="eventFilterSelect"
            aria-label="Filter Events"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded border border-hub-border bg-hub-surface px-2.5 py-1 text-xs text-hub-text focus:outline-none"
          >
            <option value="all">All Events</option>
            <option value="task">Tasks</option>
            <option value="lock">Locks</option>
            <option value="agent">Agents</option>
            <option value="message">Messages</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded border border-hub-border bg-hub-surface" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-hub-border bg-hub-surface p-8 text-center text-xs text-hub-muted">
          No audit events recorded.
        </div>
      ) : (
        <div className="divide-y divide-hub-border rounded-lg border border-hub-border bg-hub-surface">
          {filtered.slice().reverse().map((ev) => {
            let payload: Record<string, unknown> = {};
            try {
              payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
            } catch {
              // ignore
            }

            const taskId = payload?.taskId as string | undefined;

            return (
              <div
                key={ev.id}
                className="flex items-center justify-between p-3.5 hover:bg-hub-bg/50 transition-colors text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-hub-muted">#{ev.id}</span>
                  <span className="rounded bg-hub-accent/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-hub-accent">
                    {ev.type}
                  </span>
                  <span className="text-hub-text font-mono truncate max-w-md">
                    {JSON.stringify(payload)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-hub-muted">
                  <span>{ev.created_at}</span>
                  {taskId && (
                    <button
                      onClick={() => onSelectTask(taskId)}
                      className="flex items-center gap-1 rounded border border-hub-border px-2 py-0.5 text-hub-accent hover:underline"
                    >
                      <span>Task</span>
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
