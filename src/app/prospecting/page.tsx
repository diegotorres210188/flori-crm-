"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, CheckCircle2, Sparkles } from "lucide-react";

// ── Filter options ───────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: "ilustrador", label: "Ilustrador/a" },
  { value: "fotografo", label: "Fotógrafo/a" },
  { value: "disenador_grafico", label: "Diseñador/a gráfico/a" },
  { value: "motion_designer", label: "Motion designer / Animador/a" },
  { value: "artista_3d", label: "Artista 3D" },
  { value: "muralista", label: "Muralista / Arte urbano" },
  { value: "retratista", label: "Retratista" },
];

const SPECIALTY_OPTIONS = [
  { value: "", label: "Sin filtro de especialidad" },
  { value: "moda", label: "Moda / Textil" },
  { value: "editorial", label: "Editorial / Libros" },
  { value: "infantil", label: "Infantil / Niños" },
  { value: "packaging", label: "Packaging / Producto" },
  { value: "publicidad", label: "Publicidad / Branding" },
  { value: "musica", label: "Música / Entretenimiento" },
  { value: "naturaleza", label: "Naturaleza / Botánica" },
];

const LOCATION_OPTIONS = [
  { value: "argentina", label: "Argentina" },
  { value: "buenos_aires", label: "Buenos Aires" },
  { value: "latam", label: "Latinoamérica" },
  { value: "espana", label: "España" },
  { value: "global", label: "Global (sin filtro geo)" },
];

// ── Types ────────────────────────────────────────────────────────

interface JobData {
  id: string;
  criteria: string;
  status: string;
  prospect_count: number;
  created_at: string;
  finished_at: string | null;
}

interface Prospect {
  id: string;
  name: string;
  type: string | null;
  industry: string | null;
  region: string | null;
  fitScore: number;
  fitBreakdown: string | null;
  opportunitySignals: string | null;
  email: string | null;
  notes: string | null;
  source: string | null;
  status: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function fitScoreColor(score: number): string {
  if (score >= 70) return "bg-green-100 text-green-800";
  if (score >= 45) return "bg-yellow-100 text-yellow-800";
  if (score >= 25) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

function extractUrl(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/🌐\s*(https?:\/\/[^\s\n]+)/);
  return m ? m[1] : null;
}

function extractContactLines(notes: string | null): string[] {
  if (!notes) return [];
  return notes
    .split("\n")
    .slice(1)
    .filter((l) => l.trim().length > 0);
}

const SESSION_KEY = "prospecting_job_id";

// ── Component ────────────────────────────────────────────────────

export default function ProspectingPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobData | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [location, setLocation] = useState("argentina");
  const [strictGeo, setStrictGeo] = useState(false);
  const [keywords, setKeywords] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [enrichJobId, setEnrichJobId] = useState<string | null>(null);
  const [enrichStatus, setEnrichStatus] = useState<string>("idle");

  // Restore active job from session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return;
    (async () => {
      try {
        const [jobRes, prospectsRes] = await Promise.all([
          fetch(`/api/jobs/${saved}`),
          fetch(`/api/jobs/${saved}/prospects`),
        ]);
        if (!jobRes.ok) { sessionStorage.removeItem(SESSION_KEY); return; }
        const jobData: JobData = await jobRes.json();
        setJobId(saved);
        setJob(jobData);
        if (prospectsRes.ok) {
          const data: Prospect[] = await prospectsRes.json();
          data.sort((a, b) => b.fitScore - a.fitScore);
          setProspects(data);
        }
      } catch { sessionStorage.removeItem(SESSION_KEY); }
    })();
  }, []);

  const jobDone = job?.status === "done" || job?.status === "failed";
  const isSearchRunning = job && !jobDone;

  const fetchProspects = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/${id}/prospects`);
      if (res.ok) {
        const data: Prospect[] = await res.json();
        data.sort((a, b) => b.fitScore - a.fitScore);
        setProspects(data);
      }
    } catch { /* retry */ }
  }, []);

  useEffect(() => {
    if (!jobId || jobDone) return;
    const poll = async () => {
      try {
        const [jobRes, prospectsRes] = await Promise.all([
          fetch(`/api/jobs/${jobId}`),
          fetch(`/api/jobs/${jobId}/prospects`),
        ]);
        if (jobRes.ok) setJob(await jobRes.json());
        if (prospectsRes.ok) {
          const data: Prospect[] = await prospectsRes.json();
          data.sort((a, b) => b.fitScore - a.fitScore);
          setProspects(data);
        }
      } catch { /* retry */ }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [jobId, jobDone]);

  useEffect(() => {
    if (job?.status === "done" && jobId) {
      fetchProspects(jobId);
      sessionStorage.removeItem(SESSION_KEY);
    }
    if (job?.status === "failed") sessionStorage.removeItem(SESSION_KEY);
  }, [job?.status, jobId, fetchProspects]);

  useEffect(() => {
    if (!enrichJobId || enrichStatus !== "running") return;
    const poll = async () => {
      try {
        const [enrichRes, prospectsRes] = await Promise.all([
          fetch(`/api/jobs/${enrichJobId}`),
          jobId ? fetch(`/api/jobs/${jobId}/prospects`) : Promise.resolve(null),
        ]);
        if (enrichRes.ok) {
          const data: JobData = await enrichRes.json();
          if (data.status === "done" || data.status === "failed") {
            setEnrichStatus(data.status === "done" ? "done" : "failed");
          }
        }
        if (prospectsRes && prospectsRes.ok) {
          const data: Prospect[] = await prospectsRes.json();
          data.sort((a, b) => b.fitScore - a.fitScore);
          setProspects(data);
        }
      } catch { /* retry */ }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [enrichJobId, enrichStatus, jobId]);

  const roleLabel = ROLE_OPTIONS.find((o) => o.value === role)?.label ?? "profesionales";

  const handleSearch = async () => {
    if (!role) {
      setError("Seleccioná un tipo de profesional.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setJob(null);
    setProspects([]);
    setSelectedIds(new Set());
    setEnrichJobId(null);
    setEnrichStatus("idle");
    sessionStorage.removeItem(SESSION_KEY);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "people",
          role,
          specialty,
          location,
          strict_geo: strictGeo,
          criteria: keywords.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Error al iniciar busqueda");
        setIsSubmitting(false);
        return;
      }

      const result = await res.json();
      sessionStorage.setItem(SESSION_KEY, result.job_id);
      setJobId(result.job_id);
      setJob({
        id: result.job_id,
        criteria: "",
        status: "pending",
        prospect_count: 0,
        created_at: new Date().toISOString(),
        finished_at: null,
      });
    } catch {
      setError("Error de conexion. Verifica que el servidor este corriendo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEnrich = async () => {
    if (!jobId || selectedIds.size === 0) return;
    const toEnrich = prospects
      .filter((p) => selectedIds.has(p.id))
      .map((p) => ({ name: p.name, url: extractUrl(p.notes) ?? "" }))
      .filter((p) => p.url.length > 0);

    if (toEnrich.length === 0) {
      setError("Los prospectos seleccionados no tienen URL para enriquecer.");
      return;
    }

    setEnrichStatus("running");
    setEnrichJobId(null);
    setSelectedIds(new Set());

    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, prospects: toEnrich }),
      });
      if (res.ok) {
        const data = await res.json();
        setEnrichJobId(data.job_id);
      } else {
        setEnrichStatus("idle");
        setError("Error al iniciar enriquecimiento.");
      }
    } catch {
      setEnrichStatus("idle");
      setError("Error de conexion.");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(
      selectedIds.size === prospects.length
        ? new Set()
        : new Set(prospects.map((p) => p.id))
    );
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Buscador de Profesionales en Behance</h1>
        <p className="text-muted-foreground">
          Busca fotógrafos, ilustradores, diseñadores y otros creativos por especialidad y ubicación
        </p>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nueva busqueda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Filters grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Profesión / Puesto</Label>
              <Select value={role} onValueChange={(v) => setRole(v ?? "")} disabled={!!isSearchRunning}>
                <SelectTrigger>
                  <SelectValue placeholder="¿Qué profesional buscás?" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Especialidad / Industria</Label>
              <Select value={specialty} onValueChange={(v) => setSpecialty(v ?? "")} disabled={!!isSearchRunning}>
                <SelectTrigger>
                  <SelectValue placeholder="Especialidad (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {SPECIALTY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Ubicación</Label>
              <Select value={location} onValueChange={(v) => setLocation(v ?? "argentina")} disabled={!!isSearchRunning}>
                <SelectTrigger>
                  <SelectValue placeholder="Ubicación…" />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Keywords + strict geo */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">
                Palabras clave <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                placeholder="Ej: comisiones abiertas, acuarela, surface design…"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={!!isSearchRunning}
              />
              <p className="text-xs text-muted-foreground">Refinan la búsqueda en Behance y priorizan perfiles que las mencionen</p>
            </div>

            {location !== "global" && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={strictGeo}
                  onCheckedChange={(v) => setStrictGeo(!!v)}
                  disabled={!!isSearchRunning}
                />
                <span className="text-sm text-muted-foreground">
                  Filtrar estrictamente por ubicación
                  <span className="ml-1 text-xs">(excluye perfiles sin ubicación declarada)</span>
                </span>
              </label>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button onClick={handleSearch} disabled={isSubmitting || !!isSearchRunning}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Buscar en Behance
          </Button>
        </CardContent>
      </Card>

      {/* Status cards */}
      {isSearchRunning && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
              <div>
                <p className="font-medium">
                  {prospects.length === 0 ? "Buscando en Behance..." : "Visitando perfiles..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {prospects.length > 0
                    ? `${prospects.length} ${roleLabel.toLowerCase()} encontrados hasta ahora`
                    : "Tarda 1-3 minutos. Los resultados aparecen a medida que se encuentran."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {enrichStatus === "running" && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600 shrink-0" />
              <div>
                <p className="font-medium text-blue-900">Buscando datos de contacto...</p>
                <p className="text-sm text-blue-700">Visitando perfiles en profundidad.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {enrichStatus === "done" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="text-sm font-medium text-green-800">Enriquecimiento completado</p>
            </div>
          </CardContent>
        </Card>
      )}

      {job?.status === "done" && enrichStatus === "idle" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="text-sm font-medium text-green-800">
                Busqueda completada — {prospects.length} {roleLabel.toLowerCase()} encontrados
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {job?.status === "failed" && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-800">La busqueda fallo. Intenta de nuevo.</p>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {prospects.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                Profesionales encontrados
                <Badge variant="secondary">{prospects.length}</Badge>
                {isSearchRunning && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </CardTitle>
              {jobDone && enrichStatus !== "running" && (
                <div className="flex items-center gap-3">
                  {selectedIds.size > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {selectedIds.size} seleccionada{selectedIds.size > 1 ? "s" : ""}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selectedIds.size === 0}
                    onClick={handleEnrich}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Enriquecer seleccionadas
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {jobDone && enrichStatus !== "running" && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={prospects.length > 0 && selectedIds.size === prospects.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Nombre</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Señales</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects.map((p) => {
                  const url = extractUrl(p.notes);
                  const contactLines = extractContactLines(p.notes);
                  const showCheckbox = jobDone && enrichStatus !== "running";
                  return (
                    <TableRow key={p.id} className={selectedIds.has(p.id) ? "bg-muted/40" : ""}>
                      {showCheckbox && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(p.id)}
                            onCheckedChange={() => toggleSelect(p.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">
                            {p.name}
                          </a>
                        ) : p.name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.region ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {contactLines.length > 0 ? (
                          <div className="space-y-0.5">
                            {contactLines.slice(0, 4).map((line, i) => (
                              <p key={i} className="text-xs text-muted-foreground">{line}</p>
                            ))}
                          </div>
                        ) : p.email ? (
                          <a href={`mailto:${p.email}`} className="hover:underline text-blue-600 text-xs">
                            {p.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {p.opportunitySignals ?? p.fitBreakdown ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={fitScoreColor(p.fitScore)}>
                          {p.fitScore}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
