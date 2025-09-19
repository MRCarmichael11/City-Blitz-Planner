import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

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

    // Fallback to direct Postgres connection with service role creds
    const dbHost = process.env.SUPABASE_DB_HOST;
    const dbPort = Number(process.env.SUPABASE_DB_PORT || 6543);
    const dbName = process.env.SUPABASE_DB_NAME || 'postgres';
    const dbUser = process.env.SUPABASE_DB_USER || 'postgres';
    const dbPass = process.env.SUPABASE_DB_PASSWORD;
    if (!dbHost || !dbPass) return res.status(500).json({ error: 'missing_db_env' });
    const client = new Client({ host: dbHost, port: dbPort, database: dbName, user: dbUser, password: dbPass, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      await client.query(sql);
      await client.query(`select pg_notify('pgrst', 'reload schema');`);
    } finally {
      await client.end();
    }
    return res.status(200).json({ ok: true, method: 'direct_pg' });
  } catch (e: any) {
    return res.status(500).json({ error: 'unexpected', detail: e?.message || String(e) });
  }
}

