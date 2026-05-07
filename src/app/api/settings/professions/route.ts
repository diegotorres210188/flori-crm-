import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { crmSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const KEY = "prospecting_professions";

export interface ProfessionOption {
  value: string;
  label: string;
}

const DEFAULT: ProfessionOption[] = [
  { value: "ilustrador", label: "Ilustrador/a" },
  { value: "fotografo", label: "Fotógrafo/a" },
  { value: "disenador_grafico", label: "Diseñador/a gráfico/a" },
  { value: "motion_designer", label: "Motion designer / Animador/a" },
  { value: "artista_3d", label: "Artista 3D" },
  { value: "muralista", label: "Muralista / Arte urbano" },
  { value: "retratista", label: "Retratista" },
];

export async function GET() {
  const row = db.select().from(crmSettings).where(eq(crmSettings.key, KEY)).get();
  if (!row) return NextResponse.json(DEFAULT);
  try {
    return NextResponse.json(JSON.parse(row.value) as ProfessionOption[]);
  } catch {
    return NextResponse.json(DEFAULT);
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as ProfessionOption[];
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Expected array" }, { status: 400 });
  }
  const value = JSON.stringify(body);
  const existing = db.select().from(crmSettings).where(eq(crmSettings.key, KEY)).get();
  if (existing) {
    db.update(crmSettings).set({ value }).where(eq(crmSettings.key, KEY)).run();
  } else {
    db.insert(crmSettings).values({ key: KEY, value }).run();
  }
  return NextResponse.json({ ok: true });
}
