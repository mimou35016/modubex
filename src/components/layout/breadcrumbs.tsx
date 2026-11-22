import { cn } from "@/lib/utils";

export function Breadcrumbs({ label, className }: { label: string; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("font-mono text-xs text-muted", className)}>
      <ol className="flex items-center gap-2">
        <li>{label}</li>
      </ol>
    </nav>
  );
}
