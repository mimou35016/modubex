import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl border-s-2 border-accent ps-5">
      <h1 className="font-mono text-5xl font-semibold tracking-tight">404</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        That page is not part of the foundation. It may belong to a module that is not installed yet.
      </p>
      <Link href="/" className={`${buttonVariants()} mt-5`}>
        Back to overview
      </Link>
    </div>
  );
}
