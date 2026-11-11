import { Button } from "./Button";

export function pageHref(base: string, params: Record<string, string | undefined>, page: number) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export function parsePage(v: string | undefined) {
  const n = Number.parseInt(v ?? "1", 10);
  return Number.isFinite(n) && n > 0 && n < 10000 ? n : 1;
}

/** Previous / next links for server-paginated lists. Filters are kept in the query string. */
export function Pagination({
  base,
  params,
  page,
  total,
  size,
}: {
  base: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  size: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
      <span className="text-slate-500">
        Page {page} of {pages} · {total} total
      </span>
      <span className="flex gap-2">
        {page > 1 ? <Button href={pageHref(base, params, page - 1)} variant="secondary" size="sm">Previous</Button> : null}
        {page < pages ? <Button href={pageHref(base, params, page + 1)} variant="secondary" size="sm">Next</Button> : null}
      </span>
    </nav>
  );
}
