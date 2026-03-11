'use client';

import { useEffect } from 'react';
import { ErrorCard } from '@/components/ui/error-card';

export default function MyDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-6">
      <ErrorCard
        title="Dashboard unavailable"
        message="We couldn't load your publisher dashboard. This is usually temporary — please try again."
        onRetry={reset}
      />
    </div>
  );
}
