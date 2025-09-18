export default function InviteMaker() {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Invite Maker</h3>
      <p className="text-sm text-muted-foreground">Issue org-scoped invites for roles (server_admin, faction_leader, ...).</p>
      {/* TODO: POST /api/orgs/[orgId]/invites */}
      <div className="border rounded p-3">Invite form placeholder</div>
    </div>
  );
}

