#!/bin/bash

REPO_URL="https://github.com/diegotorres210188/flori-crm-.git"
APP_DIR="$HOME/Desktop/flori-crm-"
APP_URL="http://localhost:3000"

clear
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Flori CRM — Iniciando..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Verificar Docker instalado ─────────────────────────────────────────────
if [ ! -d "/Applications/Docker.app" ]; then
  echo "✗ Docker no está instalado."
  echo ""
  echo "  Instalalo desde: https://www.docker.com/products/docker-desktop"
  echo "  Luego volvé a abrir este acceso directo."
  echo ""
  open "https://www.docker.com/products/docker-desktop"
  read -p "Presioná Enter para cerrar..."
  exit 1
fi

# ── 2. Descargar o actualizar la app ──────────────────────────────────────────
if [ ! -d "$APP_DIR/.git" ]; then
  echo "→ Descargando Flori CRM por primera vez..."
  git clone "$REPO_URL" "$APP_DIR" 2>&1 | grep -v "^$"
  echo "→ Descarga completa."
else
  echo "→ Actualizando a la última versión..."
  git -C "$APP_DIR" pull --quiet
fi
echo ""

# ── 3. Abrir Docker Desktop si no está corriendo ──────────────────────────────
if ! docker info >/dev/null 2>&1; then
  echo "→ Abriendo Docker Desktop..."
  open -a Docker
  echo "→ Esperando que Docker arranque (puede tardar un minuto)..."
  WAIT=0
  until docker info >/dev/null 2>&1; do
    sleep 2
    WAIT=$((WAIT+2))
    if [ $WAIT -ge 120 ]; then
      echo "✗ Docker tardó demasiado. Abrilo manualmente y volvé a intentar."
      read -p "Presioná Enter para cerrar..."
      exit 1
    fi
  done
  echo "→ Docker listo."
  echo ""
fi

# ── 4. Construir y arrancar la app ────────────────────────────────────────────
cd "$APP_DIR"

if [ -z "$(docker images -q flori-crm- 2>/dev/null)" ]; then
  echo "→ Primera vez: construyendo la app (tarda unos minutos)..."
else
  echo "→ Iniciando Flori CRM..."
fi

docker compose up -d --build 2>&1 | grep -E "Building|built|Starting|Started|Error" | sed 's/^/   /'
echo ""

# ── 5. Esperar que la app esté lista ─────────────────────────────────────────
echo "→ Esperando que la app esté lista..."
WAIT=0
until curl -s "$APP_URL" >/dev/null 2>&1; do
  sleep 2
  WAIT=$((WAIT+2))
  if [ $WAIT -ge 120 ]; then
    echo "✗ La app no respondió. Revisá Docker Desktop."
    read -p "Presioná Enter para cerrar..."
    exit 1
  fi
done

# ── 6. Abrir el navegador ─────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Flori CRM está listo!"
echo "  Abriendo $APP_URL ..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
open "$APP_URL"

read -p "Presioná Enter para cerrar esta ventana..."
docker compose down
