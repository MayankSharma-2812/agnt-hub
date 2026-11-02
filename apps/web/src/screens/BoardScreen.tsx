import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import { Task, TaskStatus } from '@agent-hub/shared';
import {
  GitBranch,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Layers,
  ChevronRight,
  Plus,
} from 'lucide-react';

interface BoardScreenProps {
  onSelectTask: (taskId: string) => void;
  onNewTask: () => void;
  highlightedTaskId: string | null;
  searchQuery: string;
}

const COLUMNS: { id: TaskStatus; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'ready', label: 'Ready', icon: Clock },
  { id: 'claimed', label: 'Claimed', icon: Layers },
  { id: 'in_progress', label: 'In Progress', icon: GitBranch },
  { id: 'blocked', label: 'Blocked', icon: AlertOctagon },
  { id: 'in_review', label: 'In Review', icon: ChevronRight },
  { id: 'done', label: 'Done', icon: CheckCircle2 },
];

const ROLE_COLORS: Record<string, string> = {
  orchestrator: 'bg-role-orchestrator/20 text-role-orchestrator border-role-orchestrator/30',
  backend: 'bg-role-backend/20 text-role-backend border-role-backend/30',
  frontend: 'bg-role-frontend/20 text-role-frontend border-role-frontend/30',
  qa: 'bg-role-qa/20 text-role-qa border-role-qa/30',
  devops: 'bg-role-devops/20 text-role-devops border-role-devops/30',
  reviewer: 'bg-role-reviewer/20 text-role-reviewer border-role-reviewer/30',
};

export const BoardScreen: React.FC<BoardScreenProps> = ({
  onSelectTask,
  onNewTask,
  highlightedTaskId,
  searchQuery,
}) => {
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedMobileColumn, setSelectedMobileColumn] = useState<TaskStatus>('ready');

  // Fetch tasks
  const { data, isLoading } = useQuery<{ tasks: Task[] }>({
    queryKey: ['tasks'],
    queryFn: () => apiRequest('/api/v1/tasks'),
  });

  const tasks = data?.tasks ?? [];

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (roleFilter !== 'all' && t.role_required !== roleFilter) return false;
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Task transition mutation
  const transitionMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      apiRequest(`/api/v1/tasks/${taskId}/status`, {
        method: 'POST',
        body: { status },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      transitionMutation.mutate({ taskId, status: targetStatus });
    }
  };

  return (
    <div className="flex flex-1 flex-col p-4">
      {/* Top Filter Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-hub-muted" htmlFor="roleFilterSelect">Role Filter:</label>
          <select
            id="roleFilterSelect"
            aria-label="Role Filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded border border-hub-border bg-hub-surface px-2.5 py-1 text-xs text-hub-text focus:outline-none"
          >
            <option value="all">All Roles</option>
            <option value="orchestrator">Orchestrator</option>
            <option value="backend">Backend</option>
            <option value="frontend">Frontend</option>
            <option value="qa">QA</option>
            <option value="devops">DevOps</option>
            <option value="reviewer">Reviewer</option>
          </select>
        </div>

        {/* Mobile column selector for 390px width */}
        <div className="flex w-full items-center gap-1 overflow-x-auto sm:hidden">
          {COLUMNS.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedMobileColumn(c.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                selectedMobileColumn === c.id
                  ? 'bg-hub-accent text-white'
                  : 'bg-hub-surface text-hub-muted'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban Board Grid */}
      <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.id);
          const Icon = col.icon;
          const isMobileVisible = selectedMobileColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`flex flex-col rounded-lg border border-hub-border bg-hub-surface/40 p-2.5 transition-colors ${
                isMobileVisible ? 'flex' : 'hidden sm:flex'
              }`}
            >
              {/* Column Header */}
              <div className="mb-3 flex items-center justify-between border-b border-hub-border/60 pb-2">
                <div className="flex items-center gap-1.5 font-semibold text-hub-text text-xs">
                  <Icon className="h-3.5 w-3.5 text-hub-muted" />
                  <span>{col.label}</span>
                </div>
                <span className="rounded-full bg-hub-border/60 px-2 py-0.5 text-[11px] font-mono text-hub-muted">
                  {colTasks.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                {isLoading && (
                  <div className="space-y-2">
                    <div className="h-20 animate-pulse rounded-md bg-hub-border/40" />
                    <div className="h-20 animate-pulse rounded-md bg-hub-border/40" />
                  </div>
                )}

                {!isLoading && colTasks.length === 0 && (
                  <div className="flex flex-1 flex-col items-center justify-center p-4 text-center text-xs text-hub-muted">
                    <p>No tasks</p>
                    {col.id === 'ready' && (
                      <button
                        onClick={onNewTask}
                        className="mt-2 flex items-center gap-1 text-hub-accent hover:underline"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Create one</span>
                      </button>
                    )}
                  </div>
                )}

                {colTasks.map((task) => {
                  const isHighlighted = highlightedTaskId === task.id;
                  const isBlocked = task.status === 'blocked';
                  const roleClass = task.role_required
                    ? ROLE_COLORS[task.role_required]
                    : 'bg-hub-border/40 text-hub-muted border-hub-border';

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                      onClick={() => onSelectTask(task.id)}
                      className={`group relative cursor-pointer rounded-md border p-3 shadow-sm transition-all hover:border-hub-accent/70 hover:shadow-md ${
                        isHighlighted ? 'card-highlight' : ''
                      } ${
                        isBlocked
                          ? 'border-hub-danger/80 bg-hub-danger/10'
                          : 'border-hub-border bg-hub-surface'
                      }`}
                    >
                      <h4 className="line-clamp-2 text-xs font-semibold text-hub-text">
                        {task.title}
                      </h4>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 pt-1 text-[11px]">
                        <span
                          className={`rounded border px-1.5 py-0.5 font-medium ${roleClass}`}
                        >
                          {task.role_required || 'any'}
                        </span>

                        <div className="flex items-center gap-2 text-hub-muted">
                          {task.branch && (
                            <span title={`Branch: ${task.branch}`}>
                              <GitBranch className="h-3 w-3 text-hub-accent" />
                            </span>
                          )}
                          <span className="font-mono text-[10px]">v{task.version}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
