export default function StepAlliances() {
  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Step 2 — Alliances</h2>
      <p className="text-sm text-muted-foreground">Add alliances per server (Tag, Name). Rank remains null until Step 3.</p>
      {/* TODO: implement CRUD against /api/orgs/[orgId]/servers/[serverId]/alliances */}
      <div className="border rounded p-3">Form placeholder</div>
    </div>
  );
}

