import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import { Task, TaskStatus, Artifact, Message, Run } from '@agent-hub/shared';
import {
  X,
  GitBranch,
  ExternalLink,
  Check,
  Send,
} from 'lucide-react';

interface TaskDrawerProps {
  taskId: string;
  onClose: () => void;
}

export const TaskDrawer: React.FC<TaskDrawerProps> = ({ taskId, onClose }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'spec' | 'messages' | 'artifacts' | 'runs'>('spec');
  const [replyBody, setReplyBody] = useState('');

  const { data, isLoading } = useQuery<{
    task: Task;
    dependencies: Task[];
    messages: Message[];
    artifacts: Artifact[];
    runs: Run[];
  }>({
    queryKey: ['task', taskId],
    queryFn: () => apiRequest(`/api/v1/tasks/${taskId}`),
  });

  const task = data?.task;
  const messages = data?.messages || [];
  const artifacts = data?.artifacts || [];
  const runs = data?.runs || [];

  // Status transition mutation
  const transitionMutation = useMutation({
    mutationFn: ({ status, pr_url }: { status: TaskStatus; pr_url?: string }) =>
      apiRequest(`/api/v1/tasks/${taskId}/status`, {
        method: 'POST',
        body: { status, pr_url },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });

  // Post message mutation
  const messageMutation = useMutation({
    mutationFn: ({ body }: { body: string }) =>
      apiRequest('/api/v1/messages', {
        method: 'POST',
        body: {
          project_id: task?.project_id,
          task_id: taskId,
          kind: 'info',
          body,
        },
      }),
    onSuccess: () => {
      setReplyBody('');
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  if (isLoading || !task) {
    return (
      <div className="fixed inset-y-0 right-0 z-40 w-full border-l border-hub-border bg-hub-surface p-6 shadow-2xl sm:max-w-xl">
        <div className="flex h-full items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-hub-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-hub-border bg-hub-surface shadow-2xl sm:max-w-xl">
      {/* Drawer Header */}
      <div className="border-b border-hub-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-hub-accent/15 px-2 py-0.5 font-mono text-xs font-semibold text-hub-accent">
                {task.status.toUpperCase()}
              </span>
              <span className="font-mono text-xs text-hub-muted">v{task.version}</span>
            </div>
            <h2 className="mt-1 text-base font-bold text-hub-text">{task.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Drawer"
            className="rounded p-1 text-hub-muted hover:bg-hub-bg hover:text-hub-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Task Metadata details */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-hub-muted">
          {task.branch && (
            <div className="flex items-center gap-1 font-mono">
              <GitBranch className="h-3.5 w-3.5 text-hub-accent" />
              <span>{task.branch}</span>
            </div>
          )}
          {task.pr_url && (
            <a
              href={task.pr_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-hub-accent hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Pull Request</span>
            </a>
          )}
        </div>

        {/* Action Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hub-border/60 pt-3">
          {task.status === 'in_review' && (
            <button
              onClick={() => transitionMutation.mutate({ status: 'done' })}
              className="flex items-center gap-1 rounded bg-hub-success px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Approve & Mark Done</span>
            </button>
          )}

          {task.status === 'in_progress' && (
            <button
              onClick={() =>
                transitionMutation.mutate({
                  status: 'in_review',
                  pr_url: task.pr_url || 'https://github.com/org/repo/pull/1',
                })
              }
              className="flex items-center gap-1 rounded bg-hub-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              <span>Submit for Review</span>
            </button>
          )}

          {task.status === 'blocked' && (
            <button
              onClick={() => transitionMutation.mutate({ status: 'in_progress' })}
              className="rounded bg-hub-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              Unblock Task
            </button>
          )}
        </div>
      </div>

      {/* Drawer Tabs */}
      <div className="flex border-b border-hub-border px-4 text-xs font-medium">
        {[
          { id: 'spec' as const, label: 'Spec & Criteria' },
          { id: 'messages' as const, label: `Messages (${messages.length})` },
          { id: 'artifacts' as const, label: `Artifacts (${artifacts.length})` },
          { id: 'runs' as const, label: `Runs (${runs.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2.5 transition-colors ${
              activeTab === t.id
                ? 'border-hub-accent font-semibold text-hub-accent'
                : 'border-transparent text-hub-muted hover:text-hub-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-4 text-xs">
        {activeTab === 'spec' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-hub-text">Description</h3>
              <p className="mt-1 whitespace-pre-wrap rounded bg-hub-bg p-3 text-hub-muted">
                {task.description || 'No description provided.'}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-hub-text">Acceptance Criteria</h3>
              <p className="mt-1 whitespace-pre-wrap rounded bg-hub-bg p-3 text-hub-muted">
                {task.acceptance_criteria || 'No acceptance criteria recorded.'}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="flex h-full flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-hub-muted">No messages yet.</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="rounded border border-hub-border bg-hub-bg p-3">
                    <div className="flex items-center justify-between text-[11px] text-hub-muted">
                      <span className="font-semibold capitalize text-hub-accent">{m.kind}</span>
                      <span>{m.created_at}</span>
                    </div>
                    <p className="mt-1 text-hub-text">{m.body}</p>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (replyBody.trim()) messageMutation.mutate({ body: replyBody.trim() });
              }}
              className="mt-4 flex gap-2 border-t border-hub-border pt-3"
            >
              <input
                type="text"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a message or question..."
                className="flex-1 rounded border border-hub-border bg-hub-bg px-3 py-1.5 text-xs text-hub-text focus:outline-none"
              />
              <button
                type="submit"
                disabled={!replyBody.trim()}
                className="rounded bg-hub-accent px-3 py-1.5 font-semibold text-white disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        )}

        {activeTab === 'artifacts' && (
          <div className="space-y-3">
            {artifacts.length === 0 ? (
              <p className="text-hub-muted">No artifacts attached to this task.</p>
            ) : (
              artifacts.map((a) => (
                <div key={a.id} className="rounded border border-hub-border bg-hub-bg p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-hub-text">{a.title}</span>
                    <span className="rounded bg-hub-border px-1.5 py-0.5 text-[10px] uppercase text-hub-muted">
                      {a.kind}
                    </span>
                  </div>
                  <a
                    href={a.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-hub-accent hover:underline"
                  >
                    {a.uri}
                  </a>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'runs' && (
          <div className="space-y-3">
            {runs.length === 0 ? (
              <p className="text-hub-muted">No runs recorded.</p>
            ) : (
              runs.map((r) => (
                <div key={r.id} className="rounded border border-hub-border bg-hub-bg p-3 font-mono">
                  <div className="flex items-center justify-between text-hub-muted">
                    <span>Model: {r.model || 'default'}</span>
                    <span className="font-semibold text-hub-text uppercase">{r.status}</span>
                  </div>
                  {r.note && <p className="mt-1 text-hub-text font-sans">{r.note}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
