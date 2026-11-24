"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl border-l-2 border-accent ps-5">
      <h1 className="text-2xl font-semibold tracking-tight">Something broke.</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        The request failed. The server log has the structured error entry. Try again, or check the
        setup steps in the README.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
