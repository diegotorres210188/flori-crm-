"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, ExternalLink, CheckCircle, MessageCircle } from "lucide-react";
import { toast } from "sonner";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  score: number;
  temperature: string;
  notes: string | null;
  source: string | null;
}

interface LangTemplate { subject: string; body: string }
interface BilingualTemplate { es: LangTemplate; en: LangTemplate }

function parseNotes(notes: string | null) {
  if (!notes) return { behance: null, instagram: null, linkedin: null };
  // LinkedIn: explicit tag OR generic 🔗 link that points to linkedin.com
  const linkedinExplicit = notes.match(/LinkedIn:\s*(https?:\/\/[^\s\n]+)/)?.[1] ?? null;
  const linkedinFallback = notes.match(/🔗\s*(https?:\/\/(?:www\.)?linkedin\.com[^\s\n]+)/)?.[1] ?? null;
  return {
    behance: notes.match(/🌐\s*(https?:\/\/[^\s\n]+)/)?.[1] ?? null,
    instagram: notes.match(/Instagram:\s*(@[^\s\n]+)/)?.[1] ?? null,
    linkedin: linkedinExplicit ?? linkedinFallback,
  };
}

function scoreColor(score: number) {
  if (score >= 70) return "bg-green-100 text-green-800";
  if (score >= 45) return "bg-yellow-100 text-yellow-800";
  return "bg-orange-100 text-orange-800";
}

type Via = "email_es" | "email_en" | "behance" | "instagram" | "linkedin" | "manual";
interface Pending { contact: Contact; via: Via }

export default function ContactarPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [template, setTemplate] = useState<BilingualTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [marking, setMarking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, t] = await Promise.all([
        fetch("/api/contactar").then(r => r.json()),
        fetch("/api/settings/template").then(r => r.json()),
      ]);
      setContacts(c);
      setTemplate(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    withEmail: contacts.filter(c => !!c.email).length,
    manualOnly: contacts.filter(c => !c.email).length,
  }), [contacts]);

  const handleEmail = (contact: Contact, lang: "es" | "en") => {
    if (!template || !contact.email) return;
    const t = template[lang];
    const body = t.body.replace(/{nombre}/g, contact.name);
    window.open(
      `mailto:${contact.email}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(body)}`,
      "_blank"
    );
    setPending({ contact, via: `email_${lang}` });
  };

  const handlePlatform = (contact: Contact, via: "behance" | "instagram" | "linkedin" | "manual") => {
    const { behance, instagram, linkedin } = parseNotes(contact.notes);
    const urls: Record<string, string | null> = {
      behance,
      instagram: instagram ? `https://instagram.com/${instagram.replace("@", "")}` : null,
      linkedin,
      manual: null,
    };
    const url = urls[via];
    if (url) window.open(url, "_blank");
    setPending({ contact, via });
  };

  const confirmContacted = async () => {
    if (!pending) return;
    setMarking(true);
    try {
      const res = await fetch(`/api/contactar/${pending.contact.id}`, { method: "POST" });
      if (res.ok) {
        setContacts(prev => prev.filter(c => c.id !== pending.contact.id));
        toast.success(`${pending.contact.name} marcada como contactada`);
        setPending(null);
      }
    } finally {
      setMarking(false);
    }
  };

  const viaLabel: Record<Via, string> = {
    email_es: "mail (ES)", email_en: "mail (EN)",
    behance: "Behance", instagram: "Instagram", linkedin: "LinkedIn", manual: "otro medio",
  };
  const dialogTitle = pending?.via.startsWith("email") ? "¿Enviaste el mail?" : "¿La contactaste?";
  const dialogDesc = `¿Contactaste a ${pending?.contact.name} por ${pending ? viaLabel[pending.via] : ""}?`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contactar</h1>
        <p className="text-muted-foreground">Leads pendientes de primer contacto.</p>
      </div>

      {contacts.length > 0 && (
        <div className="flex gap-3 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{contacts.length}</strong> pendientes</span>
          <span>·</span>
          <span><strong className="text-foreground">{stats.withEmail}</strong> con email</span>
          <span>·</span>
          <span><strong className="text-foreground">{stats.manualOnly}</strong> solo Instagram</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Leads para contactar
            <Badge variant="secondary">{contacts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Cargando...</p>
          ) : contacts.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
              <p className="text-sm font-medium">Todo al día</p>
              <p className="text-sm text-muted-foreground">No hay leads pendientes de contactar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Links</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Contactar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map(c => {
                  const { behance, instagram, linkedin } = parseNotes(c.notes);
                  const hasAny = behance || instagram || linkedin || c.email;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        {c.email && <div className="text-xs text-muted-foreground mt-0.5">{c.email}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          {behance && <a href={behance} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1">Behance <ExternalLink className="h-3 w-3" /></a>}
                          {instagram && <a href={`https://instagram.com/${instagram.replace("@","")}`} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline text-xs flex items-center gap-1">{instagram} <ExternalLink className="h-3 w-3" /></a>}
                          {linkedin && <a href={linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline text-xs flex items-center gap-1">LinkedIn <ExternalLink className="h-3 w-3" /></a>}
                          {!hasAny && <span className="text-muted-foreground text-xs">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={scoreColor(c.score)}>{c.score}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1.5 justify-end flex-wrap">
                          {behance && <Button size="sm" variant="outline" onClick={() => handlePlatform(c, "behance")}><ExternalLink className="mr-1 h-3.5 w-3.5" />Behance</Button>}
                          {instagram && <Button size="sm" variant="outline" onClick={() => handlePlatform(c, "instagram")}><MessageCircle className="mr-1 h-3.5 w-3.5" />Instagram</Button>}
                          {linkedin && <Button size="sm" variant="outline" onClick={() => handlePlatform(c, "linkedin")}><ExternalLink className="mr-1 h-3.5 w-3.5" />LinkedIn</Button>}
                          {c.email && <>
                            <Button size="sm" onClick={() => handleEmail(c, "es")} disabled={!template}><Mail className="mr-1 h-3.5 w-3.5" />ES</Button>
                            <Button size="sm" variant="outline" onClick={() => handleEmail(c, "en")} disabled={!template}><Mail className="mr-1 h-3.5 w-3.5" />EN</Button>
                          </>}
                          {!hasAny && <Button size="sm" variant="outline" onClick={() => handlePlatform(c, "manual")}><MessageCircle className="mr-1.5 h-3.5 w-3.5" />Manual</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pending} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{dialogDesc}</p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setPending(null)} disabled={marking}>
              No todavía
            </Button>
            <Button onClick={confirmContacted} disabled={marking}>
              {marking ? "Guardando..." : "Sí, la contacté"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
