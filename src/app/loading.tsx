export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl" aria-busy="true">
      <div className="h-1.5 w-28 rounded-full bg-border" />
      <div className="mt-6 h-10 w-2/3 rounded bg-border/60" />
      <div className="mt-3 h-4 w-1/2 rounded bg-border/60" />
      <div className="mt-10 h-64 rounded-lg border bg-surface" />
    </div>
  );
}
