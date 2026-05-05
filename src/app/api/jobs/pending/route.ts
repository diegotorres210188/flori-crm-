import { NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

// GET /api/jobs/pending
// Returns the oldest pending job and marks it as running.
// Used by the local Python scraper worker (worker.py).
export async function GET() {
  const job = db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "pending"))
    .orderBy(asc(jobs.createdAt))
    .limit(1)
    .get();

  if (!job) {
    return new NextResponse(null, { status: 204 });
  }

  db.update(jobs)
    .set({ status: "running" })
    .where(eq(jobs.id, job.id))
    .run();

  return NextResponse.json({ id: job.id, criteria: job.criteria });
}
