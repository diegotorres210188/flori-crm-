import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals, pipelineStages } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const prospectoStage = db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.name, "Prospecto"))
    .get();

  const allContacts = db.select().from(contacts).all();

  if (!prospectoStage) return NextResponse.json(allContacts);

  // Contact IDs whose deal is still in Prospecto
  const inProspecto = new Set(
    db.select({ contactId: deals.contactId })
      .from(deals)
      .where(eq(deals.stageId, prospectoStage.id))
      .all()
      .map((d) => d.contactId)
  );

  // Contact IDs that have any deal at all
  const hasAnyDeal = new Set(
    db.select({ contactId: deals.contactId }).from(deals).all().map((d) => d.contactId)
  );

  // Show: contacts in Prospecto, OR contacts with no deal yet
  const result = allContacts.filter(
    (c) => inProspecto.has(c.id) || !hasAnyDeal.has(c.id)
  );

  return NextResponse.json(result);
}
