// Tiny Supabase REST helper (no npm packages needed).
// Uses the SERVICE key, so it must only ever run inside a Vercel function.

function base() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  return {
    url: url.replace(/\/$/, "") + "/rest/v1",
    // New-style secret keys (sb_secret_...) go in the apikey header only;
    // legacy service_role keys are JWTs (start with "eyJ") and also need the Bearer header.
    headers: {
      apikey: key,
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
      "Content-Type": "application/json",
    },
  };
}

// Insert one row into a table.
export async function insertRow(table, row) {
  const { url, headers } = base();
  const r = await fetch(`${url}/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`Supabase insert failed: ${r.status} ${await r.text()}`);
}

// Count rows matching a PostgREST filter string, e.g. "visitor_hash=eq.abc&created_at=gte.2026-10-06T00:00:00Z"
export async function countRows(table, filter = "") {
  const { url, headers } = base();
  const q = `select=id&limit=1${filter ? "&" + filter : ""}`;
  const r = await fetch(`${url}/${table}?${q}`, { headers: { ...headers, Prefer: "count=exact" } });
  if (!r.ok) throw new Error(`Supabase count failed: ${r.status} ${await r.text()}`);
  const range = r.headers.get("content-range") || "*/0"; // e.g. "0-0/42"
  return parseInt(range.split("/")[1], 10) || 0;
}

// Select rows (used for stats).
export async function selectRows(table, query) {
  const { url, headers } = base();
  const r = await fetch(`${url}/${table}?${query}`, { headers });
  if (!r.ok) throw new Error(`Supabase select failed: ${r.status} ${await r.text()}`);
  return r.json();
}
