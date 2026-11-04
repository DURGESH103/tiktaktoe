import "server-only";

/**
 * Calls a public RPC as the anon role from the server (link previews, metadata).
 * Returns null on any failure so a preview can fall back to generic text.
 */
export async function rpcAsAnon<T>(fn: string, args: Record<string, unknown>, revalidate = 60): Promise<T | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T | null;
  } catch {
    return null;
  }
}
