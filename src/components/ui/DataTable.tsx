import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Hide this column below the `md` breakpoint */
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty = "No records to show.",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Screen-reader caption */
  caption: string;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "px-5 py-3 font-semibold",
                  c.hideOnMobile && "hidden md:table-cell",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-5 py-10 text-center text-slate-500"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-slate-50/70">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-5 py-3.5 align-middle text-slate-700",
                      c.hideOnMobile && "hidden md:table-cell",
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
