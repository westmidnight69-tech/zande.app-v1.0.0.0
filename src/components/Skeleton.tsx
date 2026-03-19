export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-surface-muted rounded-lg ${className}`} />
  );
}

export function StatSkeleton() {
  return (
    <div className="bg-surface border border-border-subtle p-5 rounded-xl">
      <div className="flex justify-between mb-4">
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="w-12 h-3" />
      </div>
      <Skeleton className="w-20 h-3 mb-2" />
      <Skeleton className="w-28 h-6" />
    </div>
  );
}

export function InvoiceSkeleton() {
  return (
    <div className="px-4 py-4 border-b border-border-subtle/40">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2">
          <Skeleton className="w-16 h-2" />
          <Skeleton className="w-32 h-4" />
        </div>
        <div className="text-right space-y-2">
          <Skeleton className="w-24 h-4 ml-auto" />
          <Skeleton className="w-20 h-2 ml-auto" />
        </div>
      </div>
      <div className="flex justify-between">
        <Skeleton className="w-16 h-3 rounded" />
        <Skeleton className="w-24 h-2" />
      </div>
    </div>
  );
}

export function ClientSkeleton() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b border-border-subtle/40">
      <Skeleton className="size-11 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="w-32 h-4" />
        <Skeleton className="w-48 h-2" />
      </div>
      <div className="text-right space-y-2">
        <Skeleton className="w-16 h-4 ml-auto" />
        <Skeleton className="w-12 h-2 ml-auto" />
      </div>
    </div>
  );
}

export function AccountSectionSkeleton() {
  return (
    <div className="border-b border-border-subtle/40">
      <div className="px-6 py-4 bg-surface/20 flex items-center justify-between">
        <Skeleton className="w-32 h-3" />
        <Skeleton className="w-8 h-3" />
      </div>
      <div className="px-6 py-4 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="grid grid-cols-12 gap-4 items-center">
            <Skeleton className="col-span-2 h-3" />
            <Skeleton className="col-span-6 h-4" />
            <Skeleton className="col-span-4 h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExpenseSkeleton() {
  return (
    <div className="bg-surface/30 border border-border-subtle p-4 rounded-xl flex items-center gap-4">
      <Skeleton className="size-10 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="w-32 h-3" />
        <Skeleton className="w-24 h-2" />
      </div>
      <div className="text-right space-y-2">
        <Skeleton className="w-20 h-4 ml-auto" />
        <Skeleton className="w-16 h-2 ml-auto" />
      </div>
    </div>
  );
}

export function DocumentSkeleton() {
  return (
    <div className="bg-surface/30 border border-border-subtle p-4 rounded-xl flex items-center gap-4">
      <Skeleton className="size-10 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="w-40 h-3" />
        <Skeleton className="w-24 h-2" />
      </div>
      <Skeleton className="size-8 rounded-full flex-shrink-0" />
    </div>
  );
}
