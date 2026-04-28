import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { eq } from "drizzle-orm";

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
