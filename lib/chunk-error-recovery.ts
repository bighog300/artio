'use client';

import { useEffect } from 'react';

export function ChunkErrorRecovery() {
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      if (
        event.error?.name === 'ChunkLoadError' ||
        event.message?.includes('Loading chunk') ||
        event.message?.includes('ChunkLoadError')
      ) {
        const key = 'chunk_error_reloaded_at';
        const last = sessionStorage.getItem(key);
        const now = Date.now();

        // Only auto-reload once per 30 seconds to prevent infinite loops.
        if (!last || now - parseInt(last, 10) > 30_000) {
          sessionStorage.setItem(key, String(now));
          window.location.reload();
        }
      }
    };

    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  return null;
}
