import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { crmSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const KEY = "contact_email_template";

export interface LangTemplate { subject: string; body: string }
export interface BilingualTemplate { es: LangTemplate; en: LangTemplate }

const DEFAULT: BilingualTemplate = {
  es: {
    subject: "Colaboración - Florencia Rigiroli, Ilustradora",
    body: `Hola {nombre},

Mi nombre es Florencia Rigiroli y soy ilustradora especializada en estilos botánicos, whimsical y naturales.

Me pongo en contacto porque creo que mi trabajo podría complementar el tuyo o ser de interés para tus proyectos.

Podés ver mi portfolio aquí: https://unfloripondio.myportfolio.com/work

¿Estarías interesada en colaborar o en saber más sobre mis servicios?

Saludos,
Florencia Rigiroli
Ilustradora`,
  },
  en: {
    subject: "Collaboration — Florencia Rigiroli, Illustrator",
    body: `Hi {nombre},

My name is Florencia Rigiroli and I'm an illustrator specializing in botanical, whimsical, and natural styles.

I'm reaching out because I believe my work could complement yours or be of interest for your projects.

You can view my portfolio here: https://unfloripondio.myportfolio.com/work

Would you be interested in collaborating or learning more about my services?

Best,
Florencia Rigiroli
Illustrator`,
  },
};

function parse(raw: string): BilingualTemplate {
  const parsed = JSON.parse(raw);
  // Backward compat: old format had {subject, body} at root
  if (parsed.subject && parsed.body) {
    return { es: { subject: parsed.subject, body: parsed.body }, en: DEFAULT.en };
  }
  return parsed as BilingualTemplate;
}

export async function GET() {
  const row = db.select().from(crmSettings).where(eq(crmSettings.key, KEY)).get();
  if (!row) return NextResponse.json(DEFAULT);
  try {
    return NextResponse.json(parse(row.value));
  } catch {
    return NextResponse.json(DEFAULT);
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as BilingualTemplate;
  const value = JSON.stringify(body);
  const existing = db.select().from(crmSettings).where(eq(crmSettings.key, KEY)).get();
  if (existing) {
    db.update(crmSettings).set({ value }).where(eq(crmSettings.key, KEY)).run();
  } else {
    db.insert(crmSettings).values({ key: KEY, value }).run();
  }
  return NextResponse.json({ ok: true });
}
