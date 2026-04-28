import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";

export async function POST(request: NextRequest) {
  let body: { criteria?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body.criteria || body.criteria.trim().length === 0) {
    return NextResponse.json(
      { error: "El campo 'criteria' es requerido" },
      { status: 400 }
    );
  }

  try {
    const now = new Date();
    const job = db
      .insert(jobs)
      .values({
        criteria: body.criteria.trim(),
        status: "pending",
        createdAt: now,
      })
      .returning()
      .get();

    // Fire and forget — don't await
    fetch(process.env.N8N_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: job.id, criteria: body.criteria.trim() }),
    }).catch((err) => console.error("Webhook fire failed:", err));

    return NextResponse.json({ job_id: job.id }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Error al crear job: ${error instanceof Error ? error.message : "Unknown"}`,
      },
      { status: 500 }
    );
  }
}
