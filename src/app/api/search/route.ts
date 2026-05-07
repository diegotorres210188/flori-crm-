import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";

export async function POST(request: NextRequest) {
  let body: {
    criteria?: string;
    mode?: string;
    // Multi-select arrays (new)
    roles?: string[];
    specialties?: string[];
    locations?: string[];
    // Single-value legacy fields
    role?: string;
    specialty?: string;
    location?: string;
    industry?: string;
    style?: string;
    strict_geo?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const mode = body.mode === "people" ? "people" : "companies";

  // Normalize: prefer array fields, fall back to single-value legacy fields
  const roles = (body.roles?.length ? body.roles : body.role ? [body.role] : []).map((r) => r.trim()).filter(Boolean);
  const specialties = (body.specialties?.length ? body.specialties : body.specialty ? [body.specialty] : []).map((s) => s.trim()).filter(Boolean);
  const locations = (body.locations?.length ? body.locations : body.location ? [body.location] : ["argentina"]).map((l) => l.trim()).filter(Boolean);

  // Legacy single-value fields kept for companies mode
  const industry = body.industry?.trim() || "";
  const style = body.style?.trim() || "";
  const extra = body.criteria?.trim() || "";
  const strictGeo = !!body.strict_geo;

  if (mode === "people" && roles.length === 0) {
    return NextResponse.json(
      { error: "Selecciona un tipo de profesional" },
      { status: 400 }
    );
  }
  if (mode === "companies" && !industry && !style) {
    return NextResponse.json(
      { error: "Selecciona al menos un filtro de búsqueda" },
      { status: 400 }
    );
  }

  const criteriaJson = JSON.stringify({
    mode,
    query: extra,
    roles,
    specialties,
    locations,
    // Keep legacy single fields for backward compat with old worker versions
    role: roles[0] ?? "",
    specialty: specialties[0] ?? "",
    location: locations[0] ?? "argentina",
    industry,
    style,
    strict_geo: strictGeo,
  });

  try {
    const now = new Date();
    const job = db
      .insert(jobs)
      .values({
        criteria: criteriaJson,
        status: "pending",
        createdAt: now,
      })
      .returning()
      .get();

    // Fire n8n webhook if configured (optional — local scraper worker.py handles jobs otherwise)
    if (process.env.N8N_WEBHOOK_URL) {
      fetch(process.env.N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.id,
          criteria: criteriaJson,
          callback_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          secret: process.env.N8N_CALLBACK_SECRET || "",
        }),
      }).catch((err) => console.error("Webhook fire failed:", err));
    }

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
