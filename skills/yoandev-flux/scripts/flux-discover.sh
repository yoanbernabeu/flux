#!/usr/bin/env bash
# flux-discover.sh — primitive de découverte pour la skill yoandev-flux
#
# Interroge l'index de Flux (https://flux.yoandev.co) et renvoie une liste
# d'articles filtrés au format JSON, trié du plus récent au plus ancien.
#
# Flux est un agrégateur de 80+ flux tech (blogs, podcasts, chaînes YouTube)
# francophones et internationaux, mis à jour quotidiennement.
#
# Usage :
#   flux-discover.sh latest [--days N] [--lang fr|en|both] [--limit N]
#   flux-discover.sh search "<query>" [--days N] [--lang fr|en|both] [--limit N]
#   flux-discover.sh sources [--lang fr|en|both]
#
# Ce script se limite volontairement à la DÉCOUVERTE. Pour obtenir le contenu
# complet d'un article, l'agent doit aller fetcher le champ `link` avec
# l'outil qu'il a sous la main (WebFetch, curl, etc.).

set -euo pipefail

FLUX_FR_URL="${FLUX_FR_URL:-https://flux.yoandev.co/search-index.json}"
FLUX_EN_URL="${FLUX_EN_URL:-https://flux.yoandev.co/world/search-index.json}"

usage() {
    cat >&2 <<'EOF'
Usage:
  flux-discover.sh latest [--days N] [--lang fr|en|both] [--limit N]
  flux-discover.sh search "<query>" [--days N] [--lang fr|en|both] [--limit N]
  flux-discover.sh sources [--lang fr|en|both]

Options:
  --days N    Fenêtre temporelle en jours (défaut: 7)
  --lang      fr = francophones, en = internationaux, both = les deux (défaut: both)
  --limit N   Nombre max d'articles retournés (défaut: 100, 0 = illimité)

Sortie: JSON array trié par pubDate DESC.
EOF
    exit 1
}

die() { echo "error: $*" >&2; exit 2; }

command -v curl >/dev/null || die "curl est requis"
command -v jq >/dev/null || die "jq est requis (macOS: 'brew install jq', Debian: 'apt install jq')"

CMD="${1:-}"
[ -z "$CMD" ] && usage
shift || true

QUERY=""
case "$CMD" in
    search)
        QUERY="${1:-}"
        [ -z "$QUERY" ] && { echo "error: search demande une requête" >&2; usage; }
        shift
        ;;
    latest|sources)
        ;;
    *)
        usage
        ;;
esac

DAYS=7
LANG="both"
LIMIT=100

while [ $# -gt 0 ]; do
    case "$1" in
        --days)
            DAYS="${2:-}"
            [[ "$DAYS" =~ ^[0-9]+$ ]] || die "--days attend un entier"
            shift 2
            ;;
        --lang)
            LANG="${2:-}"
            case "$LANG" in fr|en|both) ;; *) die "--lang attend fr, en ou both" ;; esac
            shift 2
            ;;
        --limit)
            LIMIT="${2:-}"
            [[ "$LIMIT" =~ ^[0-9]+$ ]] || die "--limit attend un entier"
            shift 2
            ;;
        *)
            usage
            ;;
    esac
done

fetch_index() {
    local url="$1"
    # --fail: erreur HTTP -> exit code non-zero ; on masque le stderr de curl
    # et on retourne un tableau vide si l'endpoint est down, pour rester robuste.
    curl -fsSL --max-time 30 "$url" 2>/dev/null || echo "[]"
}

case "$LANG" in
    fr)
        INDEXES=$(fetch_index "$FLUX_FR_URL" | jq '[.[] | . + {lang: "fr"}]')
        ;;
    en)
        INDEXES=$(fetch_index "$FLUX_EN_URL" | jq '[.[] | . + {lang: "en"}]')
        ;;
    both)
        FR_DATA=$(fetch_index "$FLUX_FR_URL")
        EN_DATA=$(fetch_index "$FLUX_EN_URL")
        INDEXES=$(jq -n \
            --argjson fr "$FR_DATA" \
            --argjson en "$EN_DATA" \
            '($fr | map(. + {lang: "fr"})) + ($en | map(. + {lang: "en"}))')
        ;;
esac

# Commande sources : renvoie la liste dédoublonnée des sources, triée
if [ "$CMD" = "sources" ]; then
    echo "$INDEXES" | jq '[.[] | {source, sourceUrl, type, lang}] | unique_by(.source) | sort_by(.source)'
    exit 0
fi

NOW_EPOCH=$(date -u +%s)
CUTOFF_EPOCH=$((NOW_EPOCH - DAYS * 86400))

FILTERED=$(echo "$INDEXES" | jq --argjson cutoff "$CUTOFF_EPOCH" '
    [ .[] | select(
        (try ((.pubDate // "") | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) catch 0) >= $cutoff
    ) ]
    | sort_by(.pubDate) | reverse
')

if [ "$CMD" = "search" ]; then
    Q_LOWER=$(printf '%s' "$QUERY" | tr '[:upper:]' '[:lower:]')
    FILTERED=$(echo "$FILTERED" | jq --arg q "$Q_LOWER" '
        [ .[] | select(
            (.title | ascii_downcase | contains($q)) or
            ((.description // "") | ascii_downcase | contains($q)) or
            (.source | ascii_downcase | contains($q)) or
            ((.categories // []) | map(ascii_downcase) | any(. | contains($q)))
        ) ]
    ')
fi

if [ "$LIMIT" -gt 0 ]; then
    FILTERED=$(echo "$FILTERED" | jq --argjson n "$LIMIT" '.[:$n]')
fi

echo "$FILTERED"
