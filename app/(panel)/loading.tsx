export default function PanelLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Yuklanmoqda">
      <div className="h-9 w-72 animate-pulse rounded-xl bg-surface-2" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}
