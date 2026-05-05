import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { prospects, contacts, deals, pipelineStages } from "@/db/schema";
import { eq, inArray, asc } from "drizzle-orm";

export async function POST(request: NextRequest) {
  let body: { ids: string[]; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { ids, action } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids requerido" }, { status: 400 });
  }

  const rows = db.select().from(prospects).where(inArray(prospects.id, ids)).all();
  const firstStage = db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).get();
  const now = new Date();
  let promoted = 0;

  // Discard action — just mark as rejected
  if (action === "discard") {
    for (const p of rows) {
      db.update(prospects).set({ status: "rejected", updatedAt: now }).where(eq(prospects.id, p.id)).run();
    }
    return NextResponse.json({ discarded: rows.length });
  }

  for (const p of rows) {
    if (p.status === "converted") continue;

    // Parse Instagram from notes
    const igMatch = p.notes?.match(/Instagram:\s*(@[^\s\n]+)/);
    const instagram = igMatch?.[1] ?? null;

    // Build notes for contact
    const noteLines: string[] = [];
    if (p.notes) noteLines.push(p.notes);
    if (p.linkedinUrl) noteLines.push(`LinkedIn: ${p.linkedinUrl}`);
    if (p.fitBreakdown) noteLines.push(`Fit: ${p.fitBreakdown}`);

    // Create contact
    const contact = db
      .insert(contacts)
      .values({
        name: p.name,
        email: p.email ?? null,
        phone: null,
        source: "prelead",
        temperature: "cold",
        score: p.fitScore ?? 0,
        notes: noteLines.join("\n").slice(0, 3000),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    if (!contact) continue;

    // Create deal in first pipeline stage
    if (firstStage) {
      db.insert(deals)
        .values({
          title: p.name,
          contactId: contact.id,
          stageId: firstStage.id,
          probability: p.fitScore ?? 0,
          notes: p.opportunitySignals ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    // Mark prospect as converted
    db.update(prospects)
      .set({ status: "converted", updatedAt: now })
      .where(eq(prospects.id, p.id))
      .run();

    promoted++;
  }

  return NextResponse.json({ promoted });
}
