import { NextResponse } from "next/server";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { ne } from "drizzle-orm";

export async function GET() {
  const rows = db
    .select()
    .from(prospects)
    .where(ne(prospects.status, "converted"))
    .all();

  // Deduplicate by Behance URL across jobs — keep highest score
  const byUrl = new Map<string, typeof rows[0]>();
  const noUrl: typeof rows = [];

  for (const r of rows) {
    const m = r.notes?.match(/🌐\s*(https?:\/\/[^\s\n]+)/);
    const url = m?.[1] ?? null;
    if (!url) { noUrl.push(r); continue; }
    const existing = byUrl.get(url);
    if (!existing || (r.fitScore ?? 0) > (existing.fitScore ?? 0)) {
      byUrl.set(url, r);
    }
  }

  const result = [...byUrl.values(), ...noUrl].sort(
    (a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)
  );

  return NextResponse.json(result);
}
