"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Globe,
  Camera,
  Palette,
  Newspaper,
  Users,
} from "lucide-react";

const searchSchema = z.object({
  criteria: z
    .string()
    .min(3, "Ingresa al menos 3 caracteres")
    .max(1000, "Maximo 1000 caracteres"),
});

type SearchFormData = z.infer<typeof searchSchema>;

interface SourceStatuses {
  apollo: string;
  instagram: string;
  behance: string;
  google: string;
  news: string;
}

interface JobData {
  id: string;
  criteria: string;
  status: string;
  source_statuses: SourceStatuses | null;
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
  contactsJson: string | null;
  leadershipJson: string | null;
  fitScore: number;
  fitBreakdown: string | null;
  opportunitySignals: string | null;
  source: string | null;
  status: string;
}

const SOURCE_CONFIG = [
  { key: "apollo" as const, label: "Apollo", icon: Users },
  { key: "instagram" as const, label: "Instagram", icon: Camera },
  { key: "behance" as const, label: "Behance", icon: Palette },
  { key: "google" as const, label: "Google", icon: Globe },
  { key: "news" as const, label: "Noticias", icon: Newspaper },
];

function fitScoreColor(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800";
  if (score >= 60) return "bg-yellow-100 text-yellow-800";
  if (score >= 40) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

function SourceStatusIcon({ status }: { status: string }) {
  if (status === "done") {
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  }
  if (status === "failed") {
    return <XCircle className="h-4 w-4 text-red-600" />;
  }
  // pending or running
  return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
}

export default function ProspectingPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobData | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SearchFormData>({
    resolver: zodResolver(searchSchema),
  });

  const jobDone = job?.status === "done" || job?.status === "failed";

  // Poll job status
  useEffect(() => {
    if (!jobId || jobDone) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data: JobData = await res.json();
        setJob(data);
      } catch {
        // Silently retry on next interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, jobDone]);

  // Fetch prospects when job is done
  const fetchProspects = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/${id}/prospects`);
      if (res.ok) {
        const data = await res.json();
        setProspects(data);
      }
    } catch {
      // Will show empty results
    }
  }, []);

  useEffect(() => {
    if (job?.status === "done" && jobId) {
      fetchProspects(jobId);
    }
  }, [job?.status, jobId, fetchProspects]);

  const onSubmit = async (data: SearchFormData) => {
    setIsSubmitting(true);
    setError(null);
    setJob(null);
    setProspects([]);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: data.criteria }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Error al iniciar busqueda");
        setIsSubmitting(false);
        return;
      }

      const result = await res.json();
      setJobId(result.job_id);
      setJob({
        id: result.job_id,
        criteria: data.criteria,
        status: "pending",
        source_statuses: {
          apollo: "pending",
          instagram: "pending",
          behance: "pending",
          google: "pending",
          news: "pending",
        },
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Buscador de Prospectos
        </h1>
        <p className="text-muted-foreground">
          Encuentra nuevos prospectos usando inteligencia artificial
        </p>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nueva busqueda</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Textarea
                placeholder="Describe los prospectos que buscas. Ejemplo: Editoriales infantiles en Buenos Aires que publiquen libros ilustrados..."
                rows={3}
                {...register("criteria")}
              />
              {errors.criteria && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.criteria.message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Buscar prospectos
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-800">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Source Status */}
      {job && !jobDone && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Buscando prospectos...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {SOURCE_CONFIG.map(({ key, label, icon: Icon }) => {
                const status = job.source_statuses?.[key] ?? "pending";
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 text-sm"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="w-24 font-medium">{label}</span>
                    <SourceStatusIcon status={status} />
                    <span className="text-muted-foreground capitalize">
                      {status}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Failed */}
      {job?.status === "failed" && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-800">
              La busqueda fallo. Intenta de nuevo.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {job?.status === "done" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Resultados ({prospects.length} prospectos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {prospects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No se encontraron prospectos.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Industria</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Fit Score</TableHead>
                    <TableHead>Fuente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prospects.map((prospect) => (
                    <TableRow key={prospect.id}>
                      <TableCell className="font-medium">
                        {prospect.name}
                      </TableCell>
                      <TableCell className="capitalize">
                        {prospect.type ?? "—"}
                      </TableCell>
                      <TableCell>{prospect.industry ?? "—"}</TableCell>
                      <TableCell>{prospect.region ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={fitScoreColor(prospect.fitScore)}
                        >
                          {prospect.fitScore}
                        </Badge>
                      </TableCell>
                      <TableCell>{prospect.source ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
