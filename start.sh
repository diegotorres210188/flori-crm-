#!/bin/bash
# Flori Prospector — Arranca el CRM y el scraper juntos

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Verificaciones ────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js no encontrado. Instalá desde https://nodejs.org"
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  echo "ERROR: Python 3 no encontrado. Instalá desde https://www.python.org"
  exit 1
fi

if [ ! -f "$ROOT/scraper/.env" ]; then
  echo "ERROR: Falta scraper/.env con CRM_SECRET. Copiá scraper/.env.example y completalo."
  exit 1
fi

# ── Cleanup al salir ──────────────────────────────────────────────────────────
SCRAPER_PID=""
CRM_PID=""
cleanup() {
  echo ""
  echo "→ Deteniendo..."
  [ -n "$SCRAPER_PID" ] && kill "$SCRAPER_PID" 2>/dev/null || true
  [ -n "$CRM_PID" ]    && kill "$CRM_PID"    2>/dev/null || true
  wait 2>/dev/null || true
  echo "Cerrado."
}
trap cleanup EXIT INT TERM

# ── Dependencias node ─────────────────────────────────────────────────────────
cd "$ROOT"
if [ ! -d "node_modules" ]; then
  echo "→ Instalando dependencias del CRM (primera vez)..."
  npm install
fi

if [ ! -f "data/crm.db" ]; then
  echo "→ Creando base de datos..."
  npm run init:seed
fi

# ── Arrancar CRM ──────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Flori Prospector CRM"
echo "  Abrí http://localhost:3000 en tu navegador"
echo "  Presioná Ctrl+C para detener todo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

npm run dev &
CRM_PID=$!

# Instalar deps Python en paralelo mientras el CRM arranca
echo "→ Verificando dependencias del scraper..."
pip3 install -q -r "$ROOT/scraper/requirements.txt" 2>&1 | grep -v "already satisfied" || true

# Esperar a que el CRM esté listo (hasta 40s)
echo "→ Esperando que el CRM arranque..."
for i in $(seq 1 40); do
  if curl -s http://localhost:3000/api/followups >/dev/null 2>&1; then
    echo "→ CRM listo."
    break
  fi
  sleep 1
done

# ── Arrancar scraper ──────────────────────────────────────────────────────────
echo "→ Iniciando scraper de Behance..."
python3 "$ROOT/scraper/worker.py" &
SCRAPER_PID=$!

wait $CRM_PID
