import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobs, prospects } from "@/db/schema";
import { eq } from "drizzle-orm";

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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!Array.isArray(body.prospects)) {
    return NextResponse.json(
      { error: "El campo 'prospects' debe ser un array" },
      { status: 400 }
    );
  }

  try {
    const now = new Date();

    // Insert all prospects
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
          createdAt: now,
          updatedAt: now,
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
