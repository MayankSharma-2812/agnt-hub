import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import { FileLock } from '@agent-hub/shared';
import { Unlock } from 'lucide-react';

interface ExtendedFileLock extends FileLock {
  agent_name?: string;
  member_name?: string;
}

export const LocksScreen: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ locks: ExtendedFileLock[] }>({
    queryKey: ['locks'],
    queryFn: () => apiRequest('/api/v1/locks'),
  });

  const locks = data?.locks || [];

  const releaseMutation = useMutation({
    mutationFn: (lockId: string) =>
      apiRequest(`/api/v1/locks/${lockId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locks'] });
    },
  });

  return (
    <div className="flex-1 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-hub-text">Active File Locks</h1>
          <p className="text-xs text-hub-muted">Locked path globs preventing simultaneous conflicting agent edits</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-hub-surface border border-hub-border" />
      ) : locks.length === 0 ? (
        <div className="rounded-lg border border-hub-border bg-hub-surface p-8 text-center text-xs text-hub-muted">
          No active file locks. All repository paths are currently unlocked.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-hub-border bg-hub-surface">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-hub-border bg-hub-bg text-hub-muted">
              <tr>
                <th className="p-3">Path Glob</th>
                <th className="p-3">Holder Agent</th>
                <th className="p-3">Task ID</th>
                <th className="p-3">Expires At</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hub-border text-hub-text">
              {locks.map((lock) => (
                <tr key={lock.id} className="hover:bg-hub-bg/50">
                  <td className="p-3 font-mono font-semibold text-hub-accent">{lock.path_glob}</td>
                  <td className="p-3">
                    <span className="font-semibold">{lock.agent_name || lock.agent_id}</span>
                  </td>
                  <td className="p-3 font-mono text-hub-muted">{lock.task_id || 'Global'}</td>
                  <td className="p-3 font-mono text-hub-muted">{lock.expires_at}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => releaseMutation.mutate(lock.id)}
                      className="inline-flex items-center gap-1 rounded border border-hub-border bg-hub-bg px-2.5 py-1 text-xs font-semibold text-hub-danger hover:bg-hub-danger/10"
                    >
                      <Unlock className="h-3 w-3" />
                      <span>Release</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
