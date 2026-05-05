"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserPlus, Trash2, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Mail, Star, Zap } from "lucide-react";
import { formatDistanceToNow, isToday } from "date-fns";
import { es } from "date-fns/locale";

interface PreLead {
  id: string;
  name: string;
  email: string | null;
  region: string | null;
  fitScore: number;
  fitBreakdown: string | null;
  opportunitySignals: string | null;
  notes: string | null;
  source: string | null;
  status: string;
  createdAt: string;
}

function parseNotes(notes: string | null) {
  if (!notes) return {} as Record<string, string | null>;
  return {
    behance: notes.match(/🌐\s*(https?:\/\/[^\s\n]+)/)?.[1] ?? null,
    instagram: notes.match(/Instagram:\s*(@[^\s\n]+)/)?.[1] ?? null,
    bio: notes.match(/💬\s*([^\n]+)/)?.[1] ?? null,
    location: notes.match(/📍\s*([^\n]+)/)?.[1] ?? null,
    portfolio: notes.match(/🔗\s*(https?:\/\/[^\s\n]+)/)?.[1] ?? null,
  };
}

function scoreColor(score: number) {
  if (score >= 70) return "bg-green-100 text-green-800";
  if (score >= 45) return "bg-yellow-100 text-yellow-800";
  return "bg-orange-100 text-orange-800";
}

function sourceInfo(source: string | null) {
  if (!source) return null;
  const s = source.toLowerCase();
  if (s.includes("job")) return { label: "Job Board", cls: "bg-blue-100 text-blue-800" };
  if (s.includes("project") || s.includes("behance")) return { label: "Proyectos", cls: "bg-purple-100 text-purple-800" };
  if (s.includes("duck") || s.includes("ddg") || s.includes("google")) return { label: "DuckDuckGo", cls: "bg-gray-100 text-gray-700" };
  return { label: source, cls: "bg-gray-100 text-gray-700" };
}

type SortField = "fitScore" | "createdAt" | "name";

function SortIcon({ field, active, dir }: { field: SortField; active: SortField; dir: "asc" | "desc" }) {
  if (field !== active) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40 inline" />;
  return dir === "asc"
    ? <ArrowUp className="ml-1 h-3 w-3 inline" />
    : <ArrowDown className="ml-1 h-3 w-3 inline" />;
}

export default function PreLeadsPage() {
  const [preleads, setPreleads] = useState<PreLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filterEmail, setFilterEmail] = useState(false);
  const [sortField, setSortField] = useState<SortField>("fitScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detail, setDetail] = useState<PreLead | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/preleads");
      if (res.ok) setPreleads(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const base = filterEmail ? preleads.filter(p => !!p.email) : preleads;
    return [...base].sort((a, b) => {
      let diff = 0;
      if (sortField === "fitScore") diff = (a.fitScore ?? 0) - (b.fitScore ?? 0);
      else if (sortField === "createdAt") diff = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
      else diff = a.name.localeCompare(b.name);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [preleads, filterEmail, sortField, sortDir]);

  const stats = useMemo(() => ({
    withEmail: preleads.filter(p => !!p.email).length,
    highScore: preleads.filter(p => (p.fitScore ?? 0) >= 70).length,
    today: preleads.filter(p => isToday(new Date(p.createdAt))).length,
  }), [preleads]);

  const cycleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const toggle = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds(selectedIds.size === rows.length ? new Set() : new Set(rows.map(p => p.id)));

  const selectHighScore = () =>
    setSelectedIds(new Set(preleads.filter(p => (p.fitScore ?? 0) >= 70).map(p => p.id)));

  const promote = async () => {
    if (selectedIds.size === 0) return;
    setPromoting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/preleads/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      if (res.ok) {
        const data = await res.json();
        setMsg(`${data.promoted} ilustradoras convertidas a leads`);
        setSelectedIds(new Set());
        await load();
      }
    } finally {
      setPromoting(false);
    }
  };

  const discard = async () => {
    if (selectedIds.size === 0) return;
    await fetch("/api/preleads/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selectedIds], action: "discard" }),
    });
    setSelectedIds(new Set());
    await load();
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pre-leads</h1>
          <p className="text-muted-foreground">Ilustradoras encontradas en Behance. Seleccioná las que querés contactar.</p>
        </div>

        {preleads.length > 0 && (
          <div className="flex gap-3 text-sm text-muted-foreground">
            <span><strong className="text-foreground">{stats.withEmail}</strong> con email</span>
            <span>·</span>
            <span><strong className="text-foreground">{stats.highScore}</strong> score alto</span>
            <span>·</span>
            <span><strong className="text-foreground">{stats.today}</strong> encontradas hoy</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                Ilustradoras encontradas
                <Badge variant="secondary">{rows.length}</Badge>
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant={filterEmail ? "default" : "outline"} onClick={() => setFilterEmail(v => !v)}>
                  <Mail className="mr-1 h-3 w-3" />
                  Solo con email
                </Button>
                {stats.highScore > 0 && (
                  <Button size="sm" variant="outline" onClick={selectHighScore}>
                    <Star className="mr-1 h-3 w-3" />
                    Score ≥ 70
                  </Button>
                )}
                {selectedIds.size > 0 && (
                  <>
                    <span className="text-sm text-muted-foreground">{selectedIds.size} seleccionada{selectedIds.size > 1 ? "s" : ""}</span>
                    <Button size="sm" variant="outline" onClick={discard} disabled={promoting}>
                      <Trash2 className="mr-1 h-3 w-3" />
                      Descartar
                    </Button>
                    <Button size="sm" onClick={promote} disabled={promoting}>
                      <UserPlus className="mr-1 h-3 w-3" />
                      {promoting ? "Convirtiendo..." : "Convertir a lead"}
                    </Button>
                  </>
                )}
              </div>
            </div>
            {msg && <p className="text-sm text-green-700 mt-1">{msg}</p>}
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Cargando...</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {filterEmail ? "Ninguna con email. Probá desactivar el filtro." : "No hay pre-leads todavía. Hacé una búsqueda en el Buscador."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={rows.length > 0 && selectedIds.size === rows.length} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => cycleSort("name")}>
                      Nombre / Behance <SortIcon field="name" active={sortField} dir={sortDir} />
                    </TableHead>
                    <TableHead>Instagram</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Señales</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Fuente</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => cycleSort("createdAt")}>
                      Fecha <SortIcon field="createdAt" active={sortField} dir={sortDir} />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => cycleSort("fitScore")}>
                      Score <SortIcon field="fitScore" active={sortField} dir={sortDir} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(p => {
                    const { behance, instagram, location } = parseNotes(p.notes);
                    const src = sourceInfo(p.source);
                    return (
                      <TableRow
                        key={p.id}
                        className={`cursor-pointer ${selectedIds.has(p.id) ? "bg-muted/40" : ""}`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('[role="checkbox"]')) return;
                          setDetail(p);
                        }}
                      >
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                        </TableCell>
                        <TableCell className="font-medium">
                          {behance ? (
                            <a href={behance} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              {p.name} <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : p.name}
                        </TableCell>
                        <TableCell>
                          {instagram ? (
                            <a href={`https://instagram.com/${instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline text-sm flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              {instagram} <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.email ? (
                            <a href={`mailto:${p.email}`} className="text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>{p.email}</a>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px]">
                          {p.opportunitySignals ? (
                            <span className="flex items-start gap-1">
                              <Zap className="h-3 w-3 text-yellow-500 mt-0.5 shrink-0" />
                              <span className="line-clamp-2">{p.opportunitySignals}</span>
                            </span>
                          ) : <span>—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {location ?? p.region ?? "—"}
                        </TableCell>
                        <TableCell>
                          {src ? (
                            <Badge variant="secondary" className={`text-xs ${src.cls}`}>{src.label}</Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(p.createdAt), { locale: es, addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          {p.fitBreakdown ? (
                            <Tooltip>
                              <TooltipTrigger render={<span className="cursor-help" />}>
                                <Badge variant="secondary" className={scoreColor(p.fitScore)}>{p.fitScore}</Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[260px] whitespace-pre-wrap">{p.fitBreakdown}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge variant="secondary" className={scoreColor(p.fitScore)}>{p.fitScore}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Sheet open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
          <SheetContent className="overflow-y-auto">
            {detail && <PreLeadDetail prelead={detail} />}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}

function PreLeadDetail({ prelead: p }: { prelead: PreLead }) {
  const { behance, instagram, bio, location, portfolio } = parseNotes(p.notes);
  const src = sourceInfo(p.source);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 flex-wrap pr-8">
          {p.name}
          <Badge variant="secondary" className={scoreColor(p.fitScore)}>{p.fitScore}</Badge>
          {src && <Badge variant="secondary" className={src.cls}>{src.label}</Badge>}
        </SheetTitle>
      </SheetHeader>

      <div className="mt-6 space-y-5 px-4 pb-8">
        <section className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Links</p>
          <div className="space-y-1.5 text-sm">
            {behance && <a href={behance} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Behance</a>}
            {instagram && <a href={`https://instagram.com/${instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-pink-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" /> {instagram}</a>}
            {portfolio && <a href={portfolio} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Portfolio</a>}
            {p.email && <a href={`mailto:${p.email}`} className="flex items-center gap-2 text-blue-600 hover:underline"><Mail className="h-3.5 w-3.5" /> {p.email}</a>}
            {!behance && !instagram && !portfolio && !p.email && <p className="text-sm text-muted-foreground">Sin links disponibles</p>}
          </div>
        </section>

        {(location ?? p.region) && (
          <section>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Ubicación</p>
            <p className="text-sm">{location ?? p.region}</p>
          </section>
        )}

        {bio && (
          <section>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Bio</p>
            <p className="text-sm text-muted-foreground">{bio}</p>
          </section>
        )}

        {p.opportunitySignals && (
          <section>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Señales de oportunidad</p>
            <p className="text-sm">{p.opportunitySignals}</p>
          </section>
        )}

        {p.fitBreakdown && (
          <section>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Detalle del score</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.fitBreakdown}</p>
          </section>
        )}

        <section>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Encontrada</p>
          <p className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(p.createdAt), { locale: es, addSuffix: true })}</p>
        </section>
      </div>
    </>
  );
}
