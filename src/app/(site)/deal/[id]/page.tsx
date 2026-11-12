import { Suspense } from "react";
import { DealRoom } from "@/components/deal/DealRoom";

export default function DealPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-6 py-16 text-ink-2">Loading agreement…</div>}>
      <DealRoom />
    </Suspense>
  );
}
