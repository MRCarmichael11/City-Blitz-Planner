export default function DeclarationForm() {
  return (
    <div className="border rounded p-3 space-y-2">
      <h3 className="font-semibold">New Declaration</h3>
      <p className="text-sm text-muted-foreground">Attacker alliance, target faction/alliance, window, visibility, max participants.</p>
      {/* TODO: POST /api/orgs/[orgId]/declarations */}
      <div className="text-xs text-muted-foreground">Form placeholder (parity warning inline)</div>
    </div>
  );
}

