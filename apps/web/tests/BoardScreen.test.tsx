import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BoardScreen } from '../src/screens/BoardScreen.js';

describe('BoardScreen', () => {
  it('renders all 6 kanban columns (Ready, Claimed, In Progress, Blocked, In Review, Done)', () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <BoardScreen
          onSelectTask={vi.fn()}
          onNewTask={vi.fn()}
          highlightedTaskId={null}
          searchQuery=""
        />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Claimed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In Review').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Done').length).toBeGreaterThan(0);
  });
});
