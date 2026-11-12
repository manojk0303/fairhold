"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui";
import type { Submission } from "@/lib/types";

type Body = { notes: string; links: string[]; image: Submission["image"] };

export function SubmitForm({
  onSubmit,
  busy,
  attempts,
  onCancel,
  initial,
}: {
  onSubmit: (b: Body) => void;
  busy: boolean;
  attempts: number;
  onCancel?: () => void;
  initial?: Submission | null;
}) {
  const [links, setLinks] = useState((initial?.links ?? []).join("\n"));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [image, setImage] = useState<Submission["image"]>(null);
  const [err, setErr] = useState<string | null>(null);
  const sample = typeof window !== "undefined" ? `${window.location.origin}/samples/bloom-and-rye` : "";

  const parsedLinks = links
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const badLink = parsedLinks.find((l) => !/^https?:\/\/\S+\.\S+|^https?:\/\/localhost/.test(l));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (badLink) return setErr(`“${badLink}” isn’t a full URL. Start it with https://`);
        setErr(null);
        onSubmit({ notes, links: parsedLinks, image });
      }}
    >
      <p className="font-semibold">{attempts > 0 ? "Submit a revised delivery" : "Submit your delivery for review"}</p>
      <div>
        <label className="label" htmlFor="links">
          Links to the work (live site, GitHub repo), one per line
        </label>
        <textarea id="links" className="field min-h-16 font-mono text-sm" value={links} onChange={(e) => setLinks(e.target.value)} />
        {sample && (
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs">
            <button type="button" className="text-accent hover:underline" onClick={() => setLinks(sample)}>
              Use the sample bakery site
            </button>
            <button type="button" className="text-accent hover:underline" onClick={() => setLinks(`${sample}?v=2`)}>
              Use the fixed version
            </button>
          </div>
        )}
      </div>
      <div>
        <label className="label" htmlFor="notes">
          Notes for the reviewer
        </label>
        <textarea
          id="notes"
          className="field min-h-20 text-sm"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What you built, where to find each part, anything the reviewer should know."
        />
      </div>
      <div>
        <label className="label" htmlFor="img">
          Image (optional: design, screenshot, logo)
        </label>
        <input
          id="img"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return setImage(null);
            if (f.size > 3_000_000) {
              setErr("Images must be under 3 MB.");
              e.target.value = "";
              return;
            }
            const reader = new FileReader();
            reader.onload = () => setImage({ name: f.name, mediaType: f.type, dataUrl: String(reader.result) });
            reader.readAsDataURL(f);
          }}
        />
      </div>
      {err && <p className="text-sm text-returned">{err}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy || (!parsedLinks.length && !image && notes.trim().length < 10)}>
          {busy && <Spinner />}
          Submit for AI review
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <p className="text-xs text-ink-3">The verifier opens every link and checks each criterion. A review takes about a minute.</p>
    </form>
  );
}
