import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceRole) return res.status(500).json({ error: 'missing_supabase_env' });

    const schemaPath = path.join(process.cwd(), 'public', 'supabase-schema.sql');
    if (!fs.existsSync(schemaPath)) return res.status(500).json({ error: 'schema_not_found' });
    const sql = fs.readFileSync(schemaPath, 'utf-8');

    const queryPayload = { query: sql };

    const applyResp = await fetch(`${supabaseUrl}/postgres/v1/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRole,
        'Authorization': `Bearer ${serviceRole}`
      },
      body: JSON.stringify(queryPayload)
    });

    if (!applyResp.ok) {
      const text = await applyResp.text();
      return res.status(500).json({ error: 'apply_failed', detail: text });
    }

    // Reload PostgREST schema cache
    const reload = await fetch(`${supabaseUrl}/postgres/v1/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRole,
        'Authorization': `Bearer ${serviceRole}`
      },
      body: JSON.stringify({ query: `select pg_notify('pgrst', 'reload schema');` })
    });
    if (!reload.ok) {
      const text = await reload.text();
      return res.status(500).json({ error: 'reload_failed', detail: text });
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: 'unexpected', detail: e?.message || String(e) });
  }
}

