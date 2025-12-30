export function normalizeTeamName(name: string | null | undefined): string {
  if (!name) return '';
  const n = name.toLowerCase();

  // Legacy/season-specific names (S3 and earlier) -> season-agnostic labels
  if (n.includes('anubis')) return 'Blue Team';
  if (n.includes('puss')) return 'Red Team';

  return name;
}

