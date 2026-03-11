import { Skeleton } from '@/components/ui/skeleton';

export default function MyDashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}
