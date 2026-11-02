import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import { AgentRole } from '@agent-hub/shared';
import { X, Plus, Loader2 } from 'lucide-react';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [roleRequired, setRoleRequired] = useState<AgentRole>('backend');
  const [priority, setPriority] = useState<number>(2);

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      // Fetch default project
      const projectsRes = await apiRequest<{ projects: Array<{ id: string }> }>('/api/v1/projects');
      let projectId = projectsRes.projects[0]?.id;
      if (!projectId) {
        const newProj = await apiRequest<{ project: { id: string } }>('/api/v1/projects', {
          method: 'POST',
          body: { name: 'Main Workspace' },
        });
        projectId = newProj.project.id;
      }

      return apiRequest('/api/v1/tasks', {
        method: 'POST',
        body: {
          project_id: projectId,
          title,
          description,
          acceptance_criteria: acceptanceCriteria,
          role_required: roleRequired,
          priority,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setTitle('');
      setDescription('');
      setAcceptanceCriteria('');
      onClose();
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-hub-border bg-hub-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-hub-border pb-3">
          <h2 className="text-base font-bold text-hub-text">Create Coordination Task</h2>
          <button onClick={onClose} className="rounded p-1 text-hub-muted hover:text-hub-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) createTaskMutation.mutate();
          }}
          className="mt-4 space-y-4 text-xs"
        >
          <div>
            <label className="mb-1 block font-semibold text-hub-muted" htmlFor="modalTaskTitle">Task Title</label>
            <input
              id="modalTaskTitle"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement Optimistic Locking Engine"
              className="w-full rounded border border-hub-border bg-hub-bg px-3 py-2 text-hub-text focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-hub-muted" htmlFor="modalRoleRequired">Role Required</label>
              <select
                id="modalRoleRequired"
                value={roleRequired}
                onChange={(e) => setRoleRequired(e.target.value as AgentRole)}
                className="w-full rounded border border-hub-border bg-hub-bg px-2.5 py-1.5 text-hub-text focus:outline-none"
              >
                <option value="orchestrator">Orchestrator</option>
                <option value="backend">Backend</option>
                <option value="frontend">Frontend</option>
                <option value="qa">QA</option>
                <option value="devops">DevOps</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block font-semibold text-hub-muted" htmlFor="modalPriority">Priority</label>
              <select
                id="modalPriority"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10))}
                className="w-full rounded border border-hub-border bg-hub-bg px-2.5 py-1.5 text-hub-text focus:outline-none"
              >
                <option value={1}>P1 - High</option>
                <option value={2}>P2 - Normal</option>
                <option value={3}>P3 - Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block font-semibold text-hub-muted" htmlFor="modalDescription">Task Specification / Context</label>
            <textarea
              id="modalDescription"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of the expected code change..."
              className="w-full rounded border border-hub-border bg-hub-bg px-3 py-2 text-hub-text focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-semibold text-hub-muted" htmlFor="modalAcceptanceCriteria">Acceptance Criteria</label>
            <textarea
              id="modalAcceptanceCriteria"
              rows={2}
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
              placeholder="- [ ] Unit tests pass&#10;- [ ] Acceptance criteria met"
              className="w-full rounded border border-hub-border bg-hub-bg px-3 py-2 text-hub-text focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-hub-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-hub-border px-3 py-1.5 font-medium text-hub-muted hover:bg-hub-bg hover:text-hub-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTaskMutation.isPending || !title.trim()}
              className="flex items-center gap-1.5 rounded bg-hub-accent px-4 py-1.5 font-semibold text-white disabled:opacity-50"
            >
              {createTaskMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>Create Task</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
