export default function AllianceRepsManager() {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Alliance Representatives</h3>
      <p className="text-sm text-muted-foreground">Assign per-alliance reps (leader/member/viewer).</p>
      {/* TODO: manage via /api/orgs/[orgId]/alliances/[allianceId]/reps */}
      <div className="border rounded p-3">Reps manager placeholder</div>
    </div>
  );
}

