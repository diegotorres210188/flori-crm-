import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobs, prospects } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface IncomingProspect {
  name: string;
  type?: string;
  industry?: string;
  region?: string;
  fitScore?: number;
  fitBreakdown?: string;
  opportunitySignals?: string;
  source?: string;
  email?: string;
  notes?: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const results = db
    .select()
    .from(prospects)
    .where(eq(prospects.jobId, id))
    .all();

  return NextResponse.json(results);
}

// Upsert prospects without marking the job done — used for incremental updates
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = request.headers.get("authorization");
  const validSecrets = [
    process.env.N8N_CALLBACK_SECRET,
    process.env.SCRAPER_SECRET,
  ].filter(Boolean);
  if (!validSecrets.some((s) => authHeader === `Bearer ${s}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const job = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { prospects?: IncomingProspect[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const items = body.prospects ?? [];
  const now = new Date();
  let upserted = 0;

  for (const p of items) {
    if (!p.name) continue;

    // Skip if already converted (check by name across all jobs)
    const alreadyConverted = db
      .select({ id: prospects.id })
      .from(prospects)
      .where(and(eq(prospects.name, p.name), eq(prospects.status, "converted")))
      .get();
    if (alreadyConverted) continue;

    // Dedup within this job by name
    const existing = db
      .select({ id: prospects.id })
      .from(prospects)
      .where(and(eq(prospects.jobId, id), eq(prospects.name, p.name)))
      .get();

    if (existing) {
      db.update(prospects)
        .set({
          type: p.type ?? null,
          industry: p.industry ?? null,
          fitScore: p.fitScore ?? 0,
          fitBreakdown: p.fitBreakdown ?? null,
          opportunitySignals: p.opportunitySignals ?? null,
          source: p.source ?? null,
          email: p.email ?? null,
          notes: p.notes ?? null,
          updatedAt: now,
        })
        .where(eq(prospects.id, existing.id))
        .run();
    } else {
      db.insert(prospects)
        .values({
          jobId: id,
          name: p.name,
          type: p.type ?? null,
          industry: p.industry ?? null,
          region: p.region ?? null,
          fitScore: p.fitScore ?? 0,
          fitBreakdown: p.fitBreakdown ?? null,
          opportunitySignals: p.opportunitySignals ?? null,
          source: p.source ?? null,
          status: "new",
          email: p.email ?? null,
          notes: p.notes ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    upserted++;
  }

  return NextResponse.json({ upserted });
}
