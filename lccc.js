/**
 * GB Electricity — LCCC proxy
 *
 * Cloudflare Pages Function. The browser calls /api/lccc on the same origin.
 * We resolve the current JSON Data Store resource from the dataset slug rather
 * than hard-coding a resource UUID, then query that resource server-side.
 */
const ALLOWED = new Set([
  "actual-cfd-generation-and-avoided-ghg-emissions",
  "cfd-contract-portfolio-status"
]);

const LCCC = "https://dp.lowcarboncontracts.uk/api/3/action";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const dataset = url.searchParams.get("dataset");

  if (!ALLOWED.has(dataset)) {
    return json({ success:false, error:"Dataset not permitted" }, 400);
  }

  try {
    const packageRes = await fetch(
      `${LCCC}/package_show?id=${encodeURIComponent(dataset)}`,
      { headers: { Accept:"application/json" } }
    );
    if (!packageRes.ok) throw new Error(`LCCC package_show HTTP ${packageRes.status}`);

    const pkg = await packageRes.json();
    const resources = pkg?.result?.resources || [];

    // Prefer an active JSON Data Store resource. This avoids stale UUIDs when
    // LCCC republishes a dataset.
    const resource =
      resources.find(r => String(r.format || "").toUpperCase() === "JSON" && r.datastore_active !== false) ||
      resources.find(r => String(r.format || "").toUpperCase() === "JSON");

    if (!resource?.id) throw new Error("No JSON Data Store resource found");

    const qs = new URLSearchParams();
    qs.set("resource_id", resource.id);

    // Only pass the query options the dashboard actually uses.
    for (const key of ["limit","sort","offset","q"]) {
      const value = url.searchParams.get(key);
      if (value) qs.set(key, value);
    }

    const dataRes = await fetch(
      `${LCCC}/datastore_search?${qs.toString()}`,
      { headers: { Accept:"application/json" } }
    );
    if (!dataRes.ok) throw new Error(`LCCC datastore_search HTTP ${dataRes.status}`);

    const data = await dataRes.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "content-type":"application/json; charset=utf-8",
        "cache-control":"public, max-age=300, s-maxage=300"
      }
    });
  } catch (err) {
    return json({
      success:false,
      error: err instanceof Error ? err.message : String(err)
    }, 502);
  }
}

function json(body, status=200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" }
  });
}
