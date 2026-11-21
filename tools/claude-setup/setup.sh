#!/usr/bin/env bash
# Configura Claude Code para todas las apps IstariCore. Se ejecuta UNA vez por ordenador:
#   bash tools/claude-setup/setup.sh
# - Instala los plugins a nivel de usuario (valen para cualquier repo).
# - Instala las reglas globales en ~/.claude/CLAUDE.md (guarda copia si ya existía).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
MARKET="claude-plugins-official"

PLUGINS=(
  frontend-design    # criterio visual
  context7           # documentación actualizada de librerías
  playwright         # abrir la app, pulsar, capturar
  superpowers        # planificar, TDD, depurar
  code-simplifier    # quitar complejidad
  typescript-lsp     # errores de tipos en vivo
  security-guidance  # avisos de seguridad (Firebase, auth)
  github             # PRs e incidencias
)

command -v claude >/dev/null || { echo "❌ No encuentro 'claude'. Instala Claude Code primero."; exit 1; }
echo "Claude Code $(claude --version)"

claude plugin marketplace list 2>/dev/null | grep -q "$MARKET" \
  || claude plugin marketplace add anthropics/claude-plugins-official
claude plugin marketplace update "$MARKET" || true

for p in "${PLUGINS[@]}"; do
  echo "→ $p"
  claude plugin install "$p@$MARKET" --scope user || echo "  ⚠️  $p no se pudo instalar; revísalo con /plugin"
done

# typescript-lsp necesita el servidor de lenguaje instalado aparte.
command -v typescript-language-server >/dev/null \
  || npm install -g typescript-language-server typescript \
  || echo "  ⚠️  Instala a mano: npm install -g typescript-language-server typescript (con sudo si tu npm global lo pide)"

mkdir -p ~/.claude
if [[ -f ~/.claude/CLAUDE.md ]] && ! cmp -s ~/.claude/CLAUDE.md "$DIR/CLAUDE-global.md"; then
  cp ~/.claude/CLAUDE.md ~/.claude/CLAUDE.md.bak-"$(date +%Y%m%d-%H%M%S)"
  echo "ℹ️  Había un ~/.claude/CLAUDE.md: copia guardada junto a él."
fi
cp "$DIR/CLAUDE-global.md" ~/.claude/CLAUDE.md

echo "✅ Listo. Abre Claude Code en cualquier repo y comprueba con /plugin y /memory."
echo "   El plugin github puede pedirte un token la primera vez."
