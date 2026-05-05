import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, activities, deals, pipelineStages } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const now = new Date();

  const contact = db.select().from(contacts).where(eq(contacts.id, id)).get();
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Find the "Contactado" pipeline stage by exact name
  const contactadoStage = db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.name, "Contactado"))
    .get();

  if (contactadoStage) {
    const updated = db
      .update(deals)
      .set({ stageId: contactadoStage.id, updatedAt: now })
      .where(eq(deals.contactId, id))
      .run();
    console.log(`[contactar] moved ${updated.changes} deal(s) to Contactado for contact ${id}`);
  } else {
    console.warn("[contactar] stage 'Contactado' not found in pipeline_stages");
  }

  db.insert(activities)
    .values({
      type: "email",
      description: "Mail de presentación enviado",
      contactId: id,
      completedAt: now,
      createdAt: now,
    })
    .run();

  return NextResponse.json({ ok: true });
}
