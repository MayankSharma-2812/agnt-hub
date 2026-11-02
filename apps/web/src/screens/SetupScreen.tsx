import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, getStoredAuth } from '../api/client.js';
import { Key, Copy, Check, Terminal, Plus } from 'lucide-react';

export const SetupScreen: React.FC = () => {
  const auth = getStoredAuth();
  const [copiedMcp, setCopiedMcp] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  const mcpSnippet = JSON.stringify(
    {
      mcpServers: {
        'agent-hub': {
          command: 'node',
          args: ['/path/to/agent-hub/packages/mcp-shim/dist/index.js'],
          env: {
            HUB_URL: auth?.hubUrl || 'http://localhost:3000',
            HUB_TOKEN: auth?.token || 'PASTE_TOKEN_HERE',
            HUB_AGENT_NAME: 'backend-agent',
          },
        },
      },
    },
    null,
    2,
  );

  const issueTokenMutation = useMutation({
    mutationFn: async (memberName: string) => {
      // 1. Create member
      const memberRes = await apiRequest<{ member: { id: string } }>('/api/v1/admin/members', {
        method: 'POST',
        body: { name: memberName },
      });
      // 2. Issue token
      const tokenRes = await apiRequest<{ token: string }>('/api/v1/admin/tokens', {
        method: 'POST',
        body: { action: 'create', member_id: memberRes.member.id, label: `${memberName} Token` },
      });
      return tokenRes.token;
    },
    onSuccess: (token) => {
      setGeneratedToken(token);
      setNewMemberName('');
    },
  });

  const handleCopyMcp = () => {
    navigator.clipboard.writeText(mcpSnippet);
    setCopiedMcp(true);
    setTimeout(() => setCopiedMcp(false), 2000);
  };

  const handleCopyToken = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <div className="flex-1 p-6 text-xs">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-hub-text">Setup & Client Integrations</h1>
        <p className="text-hub-muted">Configuration snippets for Antigravity MCP and new team members</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Antigravity MCP Configuration */}
        <div className="rounded-lg border border-hub-border bg-hub-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-hub-text">
              <Terminal className="h-4 w-4 text-hub-accent" />
              <span>Antigravity Config (`mcp_config.json`)</span>
            </div>
            <button
              onClick={handleCopyMcp}
              className="flex items-center gap-1 rounded border border-hub-border bg-hub-bg px-2.5 py-1 text-hub-accent hover:opacity-90"
            >
              {copiedMcp ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span>{copiedMcp ? 'Copied' : 'Copy Snippet'}</span>
            </button>
          </div>

          <p className="mb-3 text-hub-muted">
            Add this configuration to <code className="text-hub-text font-mono">~/.gemini/config/mcp_config.json</code> on each teammate's laptop.
          </p>

          <pre className="overflow-x-auto rounded border border-hub-border bg-hub-bg p-3 font-mono text-[11px] text-hub-text">
            {mcpSnippet}
          </pre>
        </div>

        {/* Member & Token Management */}
        <div className="rounded-lg border border-hub-border bg-hub-surface p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold text-hub-text">
            <Key className="h-4 w-4 text-hub-accent" />
            <span>Issue New Member Token (Admin)</span>
          </div>

          <p className="mb-3 text-hub-muted">
            Create an API bearer token for a team member to connect their agent.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newMemberName.trim()) issueTokenMutation.mutate(newMemberName.trim());
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="Teammate Name (e.g. Member B)"
              className="flex-1 rounded border border-hub-border bg-hub-bg px-3 py-1.5 text-xs text-hub-text focus:outline-none"
            />
            <button
              type="submit"
              disabled={issueTokenMutation.isPending || !newMemberName.trim()}
              className="flex items-center gap-1 rounded bg-hub-accent px-3 py-1.5 font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Generate</span>
            </button>
          </form>

          {generatedToken && (
            <div className="mt-4 rounded border border-hub-success/40 bg-hub-success/10 p-3">
              <div className="flex items-center justify-between text-hub-success">
                <span className="font-semibold">New Bearer Token Generated</span>
                <button
                  onClick={handleCopyToken}
                  className="flex items-center gap-1 rounded border border-hub-success/30 px-2 py-0.5"
                >
                  {copiedToken ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="mt-1 font-mono break-all text-[11px] text-hub-text">{generatedToken}</p>
              <p className="mt-1 text-[10px] text-hub-muted">Save this now; tokens cannot be retrieved again.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
