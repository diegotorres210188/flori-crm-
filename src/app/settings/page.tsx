"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  Kanban,
  Terminal,
  Zap,
  Webhook,
  Bell,
  Copy,
  Mail,
  Search,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { NotificationToggle } from "@/components/shared/NotificationToggle";
import type { CrmConfig } from "@/types";

interface ProfessionOption {
  value: string;
  label: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<CrmConfig | null>(null);
  const [stages, setStages] = useState<
    Array<{ id: string; name: string; color: string; order: number }>
  >([]);
  const [esSubject, setEsSubject] = useState("");
  const [esBody, setEsBody] = useState("");
  const [enSubject, setEnSubject] = useState("");
  const [enBody, setEnBody] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [professions, setProfessions] = useState<ProfessionOption[]>([]);
  const [savingProfessions, setSavingProfessions] = useState(false);
  const [newProfLabel, setNewProfLabel] = useState("");
  const [newProfValue, setNewProfValue] = useState("");

  useEffect(() => {
    fetch("/crm-config.json")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});

    fetch("/api/pipeline")
      .then((r) => r.json())
      .then(setStages);

    fetch("/api/settings/template")
      .then((r) => r.json())
      .then((t: { es: { subject: string; body: string }; en: { subject: string; body: string } }) => {
        setEsSubject(t.es.subject);
        setEsBody(t.es.body);
        setEnSubject(t.en.subject);
        setEnBody(t.en.body);
      });

    fetch("/api/settings/professions")
      .then((r) => r.json())
      .then(setProfessions)
      .catch(() => {});
  }, []);

  const slugify = (text: string) =>
    text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const addProfession = () => {
    const label = newProfLabel.trim();
    if (!label) return;
    const value = newProfValue.trim() || slugify(label);
    if (professions.some((p) => p.value === value)) {
      toast.error("Ya existe una profesión con ese identificador");
      return;
    }
    setProfessions((prev) => [...prev, { value, label }]);
    setNewProfLabel("");
    setNewProfValue("");
  };

  const removeProfession = (value: string) => {
    setProfessions((prev) => prev.filter((p) => p.value !== value));
  };

  const saveProfessions = async () => {
    setSavingProfessions(true);
    try {
      await fetch("/api/settings/professions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(professions),
      });
      toast.success("Profesiones guardadas");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSavingProfessions(false);
    }
  };

  const saveTemplate = async () => {
    setSavingTemplate(true);
    try {
      await fetch("/api/settings/template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ es: { subject: esSubject, body: esBody }, en: { subject: enSubject, body: enBody } }),
      });
      toast.success("Plantillas guardadas");
    } finally {
      setSavingTemplate(false);
    }
  };

  const commands = [
    {
      name: "/setup",
      description: "Configurar CRM para tu negocio",
    },
    {
      name: "/add-lead",
      description: "Agregar un lead de forma conversacional",
    },
    {
      name: "/analyze-pipeline",
      description: "Analizar pipeline y obtener recomendaciones",
    },
    {
      name: "/daily-briefing",
      description: "Resumen diario de ventas",
    },
    {
      name: "/import-contacts",
      description: "Importar contactos desde CSV",
    },
    {
      name: "/customize",
      description: "Re-personalizar tu CRM",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuracion</h1>
        <p className="text-muted-foreground">
          Configuracion del CRM y comandos disponibles
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business config */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Negocio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {config ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="capitalize">{config.business.type}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Industria</span>
                  <span className="capitalize">{config.business.industry}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Equipo</span>
                  <span>{config.business.teamSize}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Idioma</span>
                  <span>
                    {config.preferences.language === "es" ? "Espanol" : "Ingles"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tema</span>
                  <span className="capitalize">{config.preferences.theme}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ejecuta <code>/setup</code> en Claude Code para configurar tu
                negocio.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pipeline stages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Kanban className="h-4 w-4" />
              Etapas del Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-sm flex-1">{stage.name}</span>
                  <Badge variant="outline" className="text-xs">
                    #{stage.order}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Usa <code>/customize</code> en Claude Code para modificar las
              etapas.
            </p>
          </CardContent>
        </Card>

        {/* Webhook config */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Webhook
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Recibe leads automaticamente desde formularios, landing pages, o cualquier herramienta que soporte webhooks.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-muted p-2 rounded font-mono truncate">
                  POST {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/webhook
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/api/webhook`
                    );
                    toast.success("URL copiada");
                  }}
                  className="p-2 rounded hover:bg-muted cursor-pointer"
                  title="Copiar URL"
                >
                  <Copy className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-xs font-mono">
                <p className="text-muted-foreground mb-1">Ejemplo:</p>
                <p>curl -X POST {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/webhook \</p>
                <p className="pl-4">-H &quot;Content-Type: application/json&quot; \</p>
                <p className="pl-4">-d &apos;{`{"name":"Juan","email":"j@test.com","phone":"555-1234"}`}&apos;</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Soporta campos en espanol e ingles: name/nombre, email/correo, phone/telefono, company/empresa, notes/notas
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notificaciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <NotificationToggle />
            <p className="text-xs text-muted-foreground">
              Las notificaciones te avisan cuando tienes seguimientos vencidos. Se verifican cada 5 minutos mientras el CRM esta abierto.
            </p>
          </CardContent>
        </Card>

        {/* Email templates */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Plantillas de mail de presentación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Usá <code>{"{nombre}"}</code> para insertar el nombre del destinatario. En la sección <strong>Contactar</strong> podés elegir qué idioma usar por lead.
            </p>

            <div className="space-y-4">
              <p className="text-sm font-medium">Español</p>
              <div className="space-y-2">
                <Label htmlFor="es-subject">Asunto</Label>
                <Input id="es-subject" value={esSubject} onChange={e => setEsSubject(e.target.value)} placeholder="Asunto en español" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="es-body">Cuerpo</Label>
                <Textarea id="es-body" value={esBody} onChange={e => setEsBody(e.target.value)} rows={8} className="font-mono text-sm" />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <p className="text-sm font-medium">English</p>
              <div className="space-y-2">
                <Label htmlFor="en-subject">Subject</Label>
                <Input id="en-subject" value={enSubject} onChange={e => setEnSubject(e.target.value)} placeholder="Subject in English" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="en-body">Body</Label>
                <Textarea id="en-body" value={enBody} onChange={e => setEnBody(e.target.value)} rows={8} className="font-mono text-sm" />
              </div>
            </div>

            <Button onClick={saveTemplate} disabled={savingTemplate}>
              {savingTemplate ? "Guardando..." : "Guardar plantillas"}
            </Button>
          </CardContent>
        </Card>

        {/* Prospecting professions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              Profesiones del Buscador
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Estas son las profesiones disponibles en el buscador de Behance. Podés agregar, editar o eliminar opciones.
            </p>

            {/* Current list */}
            <div className="space-y-2">
              {professions.map((p) => (
                <div key={p.value} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.value}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProfession(p.value)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <Separator />

            {/* Add new */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Agregar profesión</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="prof-label">Nombre visible</Label>
                  <Input
                    id="prof-label"
                    placeholder="Ej: Ceramista / Alfarero/a"
                    value={newProfLabel}
                    onChange={(e) => setNewProfLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addProfession()}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="prof-value">
                    Identificador <span className="text-muted-foreground font-normal text-xs">(opcional, se genera automático)</span>
                  </Label>
                  <Input
                    id="prof-value"
                    placeholder="Ej: ceramista"
                    value={newProfValue}
                    onChange={(e) => setNewProfValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addProfession()}
                  />
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addProfession}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            </div>

            <Button onClick={saveProfessions} disabled={savingProfessions}>
              {savingProfessions ? "Guardando..." : "Guardar profesiones"}
            </Button>
          </CardContent>
        </Card>

        {/* Claude Code commands */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Comandos de Claude Code
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Estos comandos estan disponibles cuando abres el proyecto en Claude
              Code. Escribe el comando directamente en el terminal de Claude
              Code.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {commands.map((cmd) => (
                <div
                  key={cmd.name}
                  className="flex items-start gap-3 p-3 rounded-lg border"
                >
                  <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <code className="text-sm font-semibold">{cmd.name}</code>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {cmd.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
