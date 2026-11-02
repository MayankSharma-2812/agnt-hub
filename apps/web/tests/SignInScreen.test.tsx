import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignInScreen } from '../src/screens/SignInScreen.js';

describe('SignInScreen', () => {
  it('renders sign in form with Hub URL and Bearer token inputs', () => {
    const handleSuccess = vi.fn();
    render(<SignInScreen onSignInSuccess={handleSuccess} />);

    expect(screen.getByText('Agent Hub')).toBeDefined();
    expect(screen.getByLabelText(/Hub URL/i)).toBeDefined();
    expect(screen.getByLabelText(/Bearer API Token/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Sign In to Hub/i })).toBeDefined();
  });

  it('validates health and auth token against server and calls onSignInSuccess on valid credentials', async () => {
    const handleSuccess = vi.fn();

    const mockFetch = vi.fn((url: string) => {
      if (url.endsWith('/health')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'ok' }) });
      }
      if (url.endsWith('/api/v1/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ member: { id: 'm1', name: 'admin', is_admin: 1 } }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    vi.stubGlobal('fetch', mockFetch);

    render(<SignInScreen onSignInSuccess={handleSuccess} />);

    const tokenInput = screen.getByLabelText(/Bearer API Token/i);
    fireEvent.change(tokenInput, { target: { value: 'test_token_123' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In to Hub/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledTimes(1);
    });

    vi.unstubAllGlobals();
  });

  it('displays error message if token is rejected with 401', async () => {
    const handleSuccess = vi.fn();

    const mockFetch = vi.fn((url: string) => {
      if (url.endsWith('/health')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'ok' }) });
      }
      if (url.endsWith('/api/v1/me')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    vi.stubGlobal('fetch', mockFetch);

    render(<SignInScreen onSignInSuccess={handleSuccess} />);

    const tokenInput = screen.getByLabelText(/Bearer API Token/i);
    fireEvent.change(tokenInput, { target: { value: 'bad_token' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In to Hub/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Invalid or revoked API token/i)).toBeDefined();
      expect(handleSuccess).not.toHaveBeenCalled();
    });

    vi.unstubAllGlobals();
  });
});
