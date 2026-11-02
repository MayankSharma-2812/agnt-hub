import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import { Agent } from '@agent-hub/shared';
import { Bot } from 'lucide-react';

export const AgentsScreen: React.FC = () => {
  const { data, isLoading } = useQuery<{ agents: Agent[] }>({
    queryKey: ['agents'],
    queryFn: () => apiRequest('/api/v1/agents'),
  });

  const agents = data?.agents || [];

  return (
    <div className="flex-1 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-hub-text">Agent Roster & Presence</h1>
          <p className="text-xs text-hub-muted">Active AI agents connected across the team</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-lg bg-hub-surface border border-hub-border" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-hub-border bg-hub-surface p-8 text-center text-xs text-hub-muted">
          No agents registered yet. Agents register automatically when sending heartbeats or claiming tasks.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const statusColor =
              agent.status === 'working'
                ? 'bg-hub-accent'
                : agent.status === 'idle'
                ? 'bg-hub-success'
                : agent.status === 'blocked'
                ? 'bg-hub-danger'
                : 'bg-hub-muted';

            return (
              <div
                key={agent.id}
                className="rounded-lg border border-hub-border bg-hub-surface p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-hub-border/50 text-hub-text">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-hub-text">{agent.name}</h3>
                      <span className="font-mono text-[11px] uppercase text-hub-muted">
                        {agent.role}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 rounded-full border border-hub-border/80 px-2 py-0.5 text-[11px]">
                    <span className={`h-2 w-2 rounded-full ${statusColor}`} />
                    <span className="capitalize text-hub-text">{agent.status}</span>
                  </div>
                </div>

                <div className="mt-4 border-t border-hub-border/60 pt-3 text-xs text-hub-muted">
                  <div className="flex justify-between">
                    <span>Daily Run Cap</span>
                    <span className="font-mono text-hub-text">0 / {agent.daily_run_cap}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-hub-bg">
                    <div className="h-full rounded-full bg-hub-accent" style={{ width: '10%' }} />
                  </div>

                  <div className="mt-3 flex justify-between text-[11px]">
                    <span>Last Seen</span>
                    <span className="font-mono text-hub-text">{agent.last_seen_at || 'Never'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
