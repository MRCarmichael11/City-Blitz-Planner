export type OrgRules = {
  season?: string | null;
  s4_week?: number | null;
};

const keyFor = (orgId: string) => `org_rules_${orgId}`;

export function readOrgRules(orgId: string): OrgRules {
  if (!orgId) return {};
  try {
    const raw = localStorage.getItem(keyFor(orgId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OrgRules;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeOrgRules(orgId: string, rules: OrgRules): void {
  if (!orgId) return;
  try {
    localStorage.setItem(keyFor(orgId), JSON.stringify(rules));
  } catch {
    // ignore
  }
}

