"use client";

import { useState } from "react";

type AppSettings = {
  motd: string;
  costThisMonth: number;
  fundedThisMonth: number;
  donateUrl?: string;
  supportEnabled: boolean;
  signupsEnabled: boolean;
  uploadsEnabled: boolean;
  shareHtmlNavigationEnabled: boolean;
  resumableThresholdBytes: number;
};



export default function AdminSettings({ initial }: { initial: AppSettings }) {
  const [motd, setMotd] = useState(initial.motd);
  const [cost, setCost] = useState(initial.costThisMonth);
  const [funded, setFunded] = useState(initial.fundedThisMonth);
  const [donateUrl, setDonateUrl] = useState(initial.donateUrl ?? "");
  const [supportEnabled, setSupportEnabled] = useState(initial.supportEnabled);
  const [signupsEnabled, setSignupsEnabled] = useState(initial.signupsEnabled);
  const [uploadsEnabled, setUploadsEnabled] = useState(initial.uploadsEnabled);
  const [shareHtmlNavigationEnabled, setShareHtmlNavigationEnabled] = useState(
    initial.shareHtmlNavigationEnabled,
  );
  const [resumableThresholdMb, setResumableThresholdMb] = useState(
    Math.max(1, Math.round(initial.resumableThresholdBytes / (1024 * 1024))),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    const response = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        motd,
        costThisMonth: Number(cost),
        fundedThisMonth: Number(funded),
        donateUrl: donateUrl || null,
        supportEnabled,
        signupsEnabled,
        uploadsEnabled,
        shareHtmlNavigationEnabled,
        resumableThresholdBytes: Math.max(1024 * 1024, Number(resumableThresholdMb) * 1024 * 1024),
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Unable to save settings.");
      return;
    }

    setSaved(true);
  }

  

  return (
    <section className="space-y-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-medium">Site settings</h2>
      <div className="space-y-2">
        <label className="text-xs text-neutral-500">MOTD</label>
        <textarea
          className="w-full rounded border px-3 py-2 text-xs"
          rows={3}
          value={motd}
          onChange={(event) => setMotd(event.target.value)}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          Cost this month
          <input
            className="rounded border px-3 py-2 text-xs"
            type="number"
            min={0}
            value={cost}
            onChange={(event) => setCost(Number(event.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Funded this month
          <input
            className="rounded border px-3 py-2 text-xs"
            type="number"
            min={0}
            value={funded}
            onChange={(event) => setFunded(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          Donate URL
          <input
            className="rounded border px-3 py-2 text-xs"
            placeholder="https://..."
            value={donateUrl}
            onChange={(event) => setDonateUrl(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Chunked upload threshold (MB)
          <input
            className="rounded border px-3 py-2 text-xs"
            type="number"
            min={1}
            value={resumableThresholdMb}
            onChange={(event) => setResumableThresholdMb(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={supportEnabled}
            onChange={(event) => setSupportEnabled(event.target.checked)}
          />
          Show support section
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={signupsEnabled}
            onChange={(event) => setSignupsEnabled(event.target.checked)}
          />
          Enable signups
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={uploadsEnabled}
            onChange={(event) => setUploadsEnabled(event.target.checked)}
          />
          Enable uploads
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={shareHtmlNavigationEnabled}
            onChange={(event) => setShareHtmlNavigationEnabled(event.target.checked)}
          />
          Keep `/share/...` URL on open (S3 backend only)
        </label>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded bg-black px-3 py-2 text-white"
        >
          Save settings
        </button>
        {saved ? <span className="text-emerald-600">Saved</span> : null}
        {error ? <span className="text-red-600">{error}</span> : null}
      </div>

    </section>
  );
}

