import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const projectRef = process.env.SUPABASE_PROJECT_REF;
    const supabasePat = process.env.SUPABASE_PAT;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
    // Prefer Management API if PAT + project ref are present; else fallback to project Postgres API

    // Load schema SQL (try filesystem, else fetch over HTTP)
    let sql = '';
    try {
      const schemaPath = path.join(process.cwd(), 'public', 'supabase-schema.sql');
      sql = fs.readFileSync(schemaPath, 'utf-8');
    } catch {
      const origin = (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') || supabaseUrl || '';
      if (!origin) return res.status(500).json({ error: 'schema_not_found' });
      const resp = await fetch(`${origin}/supabase-schema.sql`);
      if (!resp.ok) return res.status(500).json({ error: 'schema_fetch_failed' });
      sql = await resp.text();
    }

    if (projectRef && supabasePat) {
      // Use Management API
      const apply = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/db/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabasePat}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
      });
      const text = await apply.text();
      if (!apply.ok) return res.status(500).json({ error: 'apply_failed', detail: text });
      // Reload via management API
      const reload = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/db/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabasePat}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: `select pg_notify('pgrst', 'reload schema');` })
      });
      const rtext = await reload.text();
      if (!reload.ok) return res.status(500).json({ error: 'reload_failed', detail: rtext });
      return res.status(200).json({ ok: true, method: 'management_api' });
    }

    // Fallback to project Postgres API with service role
    if (!supabaseUrl || !serviceRole) return res.status(500).json({ error: 'missing_supabase_env' });
    const applyResp = await fetch(`${supabaseUrl}/postgres/v1/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRole,
        'Authorization': `Bearer ${serviceRole}`
      },
      body: JSON.stringify({ query: sql })
    });
    const atext = await applyResp.text();
    if (!applyResp.ok) return res.status(500).json({ error: 'apply_failed', detail: atext });
    const reload = await fetch(`${supabaseUrl}/postgres/v1/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRole,
        'Authorization': `Bearer ${serviceRole}`
      },
      body: JSON.stringify({ query: `select pg_notify('pgrst', 'reload schema');` })
    });
    const t2 = await reload.text();
    if (!reload.ok) return res.status(500).json({ error: 'reload_failed', detail: t2 });

    return res.status(200).json({ ok: true, method: 'project_postgres_api' });
  } catch (e: any) {
    return res.status(500).json({ error: 'unexpected', detail: e?.message || String(e) });
  }
}

