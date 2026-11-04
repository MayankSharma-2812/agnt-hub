import { useEffect, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getStoredAuth } from '../api/client.js';

export function useHubEvents() {
  const queryClient = useQueryClient();
  const auth = getStoredAuth();
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [lastEventId, setLastEventId] = useState<number | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const backoffRef = useRef<number>(1000);
  const eventSourceRef = useRef<EventSource | null>(null);

  const highlightTask = useCallback((taskId: string) => {
    setHighlightedTaskId(taskId);
    setTimeout(() => {
      setHighlightedTaskId((curr) => (curr === taskId ? null : curr));
    }, 2500);
  }, []);

  useEffect(() => {
    if (!auth?.token) return;

    let unmounted = false;
    const baseUrl = auth.hubUrl || (window.location.origin.includes('5173') ? 'http://localhost:3000' : window.location.origin);

    function connect() {
      if (unmounted) return;

      const url = new URL('/api/v1/events/stream', baseUrl);
      url.searchParams.set('token', auth!.token);
      if (lastEventId) {
        url.searchParams.set('since', String(lastEventId));
      }

      const es = new EventSource(url.toString());
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        backoffRef.current = 1000;
      };

      const handleEventMessage = (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data);
          if (event.id) setLastEventId(event.id);

          // Invalidate relevant queries based on event type
          if (event.type?.startsWith('task.')) {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            let payload: Record<string, unknown> = {};
            try {
              payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
            } catch {
              // ignore
            }
            if (payload?.taskId) {
              highlightTask(payload.taskId as string);
            }
          } else if (event.type?.startsWith('agent.')) {
            queryClient.invalidateQueries({ queryKey: ['agents'] });
          } else if (event.type?.startsWith('message.')) {
            queryClient.invalidateQueries({ queryKey: ['messages'] });
          } else if (event.type?.startsWith('lock.')) {
            queryClient.invalidateQueries({ queryKey: ['locks'] });
          }

          queryClient.invalidateQueries({ queryKey: ['events'] });
        } catch {
          // ignore keep-alive
        }
      };

      es.onmessage = handleEventMessage;

      const eventNames = [
        'task.created',
        'task.claimed',
        'task.status_changed',
        'task.updated',
        'task.deleted',
        'agent.registered',
        'agent.heartbeat',
        'agent.offline',
        'lock.acquired',
        'lock.released',
        'message.sent',
      ];
      for (const name of eventNames) {
        es.addEventListener(name, handleEventMessage as EventListener);
      }

      es.onerror = () => {
        setIsConnected(false);
        es.close();

        // Exponential backoff reconnect up to 15s
        const delay = Math.min(backoffRef.current * 1.5, 15000);
        backoffRef.current = delay;

        setTimeout(() => {
          if (!unmounted) connect();
        }, delay);
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [queryClient, lastEventId, highlightTask, auth?.token, auth?.hubUrl]);

  return {
    isConnected,
    highlightedTaskId,
  };
}
