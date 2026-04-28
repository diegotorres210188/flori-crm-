import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobs, prospects } from "@/db/schema";
import { eq, count } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = db.select().from(jobs).where(eq(jobs.id, id)).get();

  if (!job) {
    return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
  }

  const [prospectCountResult] = db
    .select({ value: count() })
    .from(prospects)
    .where(eq(prospects.jobId, id))
    .all();

  let sourceStatuses = null;
  try {
    sourceStatuses = job.sourceStatuses
      ? JSON.parse(job.sourceStatuses)
      : null;
  } catch {
    sourceStatuses = null;
  }

  return NextResponse.json({
    id: job.id,
    criteria: job.criteria,
    status: job.status,
    source_statuses: sourceStatuses,
    prospect_count: prospectCountResult?.value ?? 0,
    created_at: job.createdAt,
    finished_at: job.finishedAt,
  });
}
