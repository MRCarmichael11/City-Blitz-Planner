import { getBracket } from '@/lib/brackets';

export default function StepTop20Ranker() {
  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Step 3 — Top-20 Ranker</h2>
      <p className="text-sm text-muted-foreground">Drag to order 1..20 per faction. Others remain unranked (Bracket 3).</p>
      {/* TODO: draggable list by faction, persist rank via PUT /api/orgs/[orgId]/alliances/[allianceId]/rank */}
      <div className="flex gap-2 text-xs">
        <span className="px-2 py-1 rounded border">B1 = 1–10</span>
        <span className="px-2 py-1 rounded border">B2 = 11–20</span>
        <span className="px-2 py-1 rounded border">B3 = null or &gt;20</span>
      </div>
      <div className="border rounded p-3">Ranker placeholder (uses getBracket for chips)</div>
    </div>
  );
}

