"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Spinner } from "./ui";

export function DemoButton({ className = "btn btn-primary" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await api<{ dealId: string; clientToken: string }>("/api/demo", {});
            router.push(`/deal/${r.dealId}?t=${r.clientToken}`);
          } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy && <Spinner />}
        Try the bakery demo
      </button>
      {err && <p className="mt-2 text-sm text-returned">{err}</p>}
    </div>
  );
}
