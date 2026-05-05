#!/bin/bash
# Flori CRM — Arranca la app con Docker

ROOT="$HOME/Desktop/flori-crm-"

if [ ! -d "$ROOT" ]; then
  echo "ERROR: No se encontró la carpeta flori-crm- en el Escritorio."
  echo "Corré primero: git clone https://github.com/diegotorres210188/flori-crm-.git ~/Desktop/flori-crm-"
  read -p "Presioná Enter para cerrar..."
  exit 1
fi

# Abrir Docker Desktop si no está corriendo
if ! docker info >/dev/null 2>&1; then
  echo "→ Iniciando Docker Desktop..."
  open -a Docker
  echo "→ Esperando que Docker arranque..."
  until docker info >/dev/null 2>&1; do sleep 2; done
  echo "→ Docker listo."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Flori CRM"
echo "  Abriendo http://localhost:3000 ..."
echo "  Cerrá esta ventana para detener la app"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$ROOT"
docker compose up -d

sleep 2
open http://localhost:3000

echo ""
echo "App corriendo. Cerrá esta ventana cuando quieras detenerla."
read -p ""

docker compose down
