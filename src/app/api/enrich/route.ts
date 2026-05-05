import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";

interface ProspectToEnrich {
  name: string;
  url: string;
}

export async function POST(request: NextRequest) {
  let body: { job_id?: string; prospects?: ProspectToEnrich[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.job_id || !Array.isArray(body.prospects) || body.prospects.length === 0) {
    return NextResponse.json(
      { error: "job_id y prospects son requeridos" },
      { status: 400 }
    );
  }

  const criteria = JSON.stringify({
    __type: "enrich",
    source_job_id: body.job_id,
    prospects: body.prospects,
  });

  const job = db
    .insert(jobs)
    .values({ criteria, status: "pending", createdAt: new Date() })
    .returning()
    .get();

  return NextResponse.json({ job_id: job.id }, { status: 202 });
}
