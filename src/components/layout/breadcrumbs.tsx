"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buildBreadcrumbTrail, type BreadcrumbLabels } from "./breadcrumb-trail";

type Props = {
  rootLabel: string;
  labels: BreadcrumbLabels;
  className?: string;
};

export function Breadcrumbs({ rootLabel, labels, className }: Props) {
  const pathname = usePathname();
  const trail = buildBreadcrumbTrail(pathname, rootLabel, labels);

  return (
    <nav aria-label="Breadcrumb" className={cn("font-mono text-xs text-muted", className)}>
      <ol className="flex flex-wrap items-center gap-2">
        {trail.map((item, index) => (
          <li key={`${item.href}:${index}`} className="flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-muted">
                /
              </span>
            ) : null}
            {index === trail.length - 1 ? (
              <span aria-current="page" className="font-medium text-foreground">
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="hover:text-foreground hover:underline">
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
