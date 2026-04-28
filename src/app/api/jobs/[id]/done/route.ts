import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobs, prospects } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

interface IncomingProspect {
  name: string;
  type?: string;
  industry?: string;
  region?: string;
  contactsJson?: string;
  leadershipJson?: string;
  fitScore?: number;
  fitBreakdown?: string;
  opportunitySignals?: string;
  source?: string;
  status?: string;
  email?: string;
  linkedinUrl?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.N8N_CALLBACK_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const job = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!job) {
    return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
  }

  let body: {
    prospects?: IncomingProspect[];
    source_statuses?: Record<string, string>;
    status?: string; // "failed" from Error Trigger workflow
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  // Handle explicit failure status from Error Trigger workflow
  if (body.status === "failed") {
    db.update(jobs)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(jobs.id, id))
      .run();
    return NextResponse.json({ success: true, status: "failed" });
  }

  if (!Array.isArray(body.prospects)) {
    return NextResponse.json(
      { error: "El campo 'prospects' debe ser un array" },
      { status: 400 }
    );
  }

  try {
    const now = new Date();

    // Upsert all prospects — conflict on email+linkedin_url
    // status (crmStatus) and notes are intentionally excluded from SET — never overwrite user edits
    for (const p of body.prospects) {
      db.insert(prospects)
        .values({
          jobId: id,
          name: p.name,
          type: p.type || null,
          industry: p.industry || null,
          region: p.region || null,
          contactsJson: p.contactsJson || null,
          leadershipJson: p.leadershipJson || null,
          fitScore: p.fitScore ?? 0,
          fitBreakdown: p.fitBreakdown || null,
          opportunitySignals: p.opportunitySignals || null,
          source: p.source || null,
          status: p.status || "new",
          email: p.email || null,
          linkedinUrl: p.linkedinUrl || null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [prospects.email, prospects.linkedinUrl],
          set: {
            name: sql`excluded.name`,
            type: sql`excluded.type`,
            industry: sql`excluded.industry`,
            region: sql`excluded.region`,
            contactsJson: sql`excluded.contacts_json`,
            leadershipJson: sql`excluded.leadership_json`,
            fitScore: sql`excluded.fit_score`,
            fitBreakdown: sql`excluded.fit_breakdown`,
            opportunitySignals: sql`excluded.opportunity_signals`,
            source: sql`excluded.source`,
            email: sql`excluded.email`,
            linkedinUrl: sql`excluded.linkedin_url`,
            updatedAt: sql`excluded.updated_at`,
            // status (crmStatus) and notes intentionally excluded — never overwrite user edits
          },
        })
        .run();
    }

    // Update job status
    db.update(jobs)
      .set({
        status: "done",
        sourceStatuses: body.source_statuses
          ? JSON.stringify(body.source_statuses)
          : '{"apollo":"done","instagram":"done","behance":"done","google":"done","news":"done"}',
        prospectCount: body.prospects.length,
        finishedAt: now,
      })
      .where(eq(jobs.id, id))
      .run();

    return NextResponse.json({
      success: true,
      prospects_inserted: body.prospects.length,
    });
  } catch (error) {
    // Mark job as failed on error
    db.update(jobs)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(jobs.id, id))
      .run();

    return NextResponse.json(
      {
        error: `Error al procesar callback: ${error instanceof Error ? error.message : "Unknown"}`,
      },
      { status: 500 }
    );
  }
}
