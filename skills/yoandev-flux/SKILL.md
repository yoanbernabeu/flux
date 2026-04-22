---
name: yoandev-flux
description: Veille tech francophone et internationale via Flux (flux.yoandev.co), qui agrège 80+ blogs, podcasts et chaînes YouTube dev/IA/DevOps. Utilise cette skill dès que l'utilisateur demande son brief / newsletter / veille du matin, veut savoir "ce qui s'est passé cette semaine en tech", cherche des articles récents sur un sujet technique (IA, Symfony, Rust, PHP, DevOps, Cloud, etc.), demande un résumé de l'actualité dev, ou veut écouter/regarder des podcasts ou vidéos tech récents. Également quand l'utilisateur donne des thématiques en langage naturel ("fais-moi un brief sur l'IA et le backend PHP des 3 derniers jours") — la skill découvre les articles, l'agent sélectionne et synthétise.
---

# yoandev-flux — Veille tech via Flux

Flux (https://flux.yoandev.co) agrège chaque jour les articles, podcasts et vidéos de 80+ sources tech francophones et internationales. Cette skill donne accès à ce corpus pour faire de la veille personnalisée, des briefs matinaux et des recherches ad-hoc.

## Philosophie

La skill fournit **une primitive de découverte** (un script bash qui interroge l'index Flux). Tout le reste — filtrage sémantique par thème, sélection éditoriale, synthèse — est fait par l'agent en langage naturel. Pas d'arguments `--themes` à mémoriser, pas de config : l'utilisateur parle normalement, l'agent compose.

**Flux ne stocke jamais le contenu complet des articles**, uniquement les métadonnées (titre, snippet, URL, date, source, catégories). Pour lire le fond d'un article, il faut aller chercher son `link` avec un outil de fetch (`WebFetch`, `curl`, équivalent).

## Prérequis

- `curl` et `jq` dans le PATH. Ils sont installés par défaut sur macOS et la plupart des distributions Linux. Sinon : `brew install jq` / `apt install jq`.
- Un outil de fetch de page web. Par ordre de préférence : `WebFetch` (natif Claude Code), `curl`, ou tout équivalent disponible dans l'agent.

## La primitive de découverte

Le script `scripts/flux-discover.sh` expose trois commandes qui retournent toujours du JSON.

```bash
scripts/flux-discover.sh latest [--days N] [--lang fr|en|both] [--limit N]
scripts/flux-discover.sh search "<query>" [--days N] [--lang fr|en|both] [--limit N]
scripts/flux-discover.sh sources [--lang fr|en|both]
```

Options :
- `--days N` — fenêtre temporelle (défaut `7`)
- `--lang` — `fr` = francophones, `en` = internationaux, `both` = les deux (défaut `both`)
- `--limit N` — nombre max d'articles (défaut `100`, mettre `0` pour illimité)

Chaque article renvoyé contient :

| Champ | Description |
|---|---|
| `title` | Titre de l'article |
| `description` | Snippet court (150-500 chars), **pas le contenu complet** |
| `link` | URL publique de l'article — à fetcher pour le contenu complet |
| `pubDate` | ISO 8601 UTC |
| `source` | Nom lisible de la source (ex : `"Simon Willison's Weblog"`) |
| `sourceUrl` | URL du flux RSS d'origine (rarement utile directement) |
| `categories` | Array de tags thématiques (ex : `["Programmation", "IA"]`) |
| `type` | `"blog"` / `"podcast"` / `"youtube"` |
| `lang` | `"fr"` ou `"en"` |
| `audioUrl`, `duration` | Présents pour les podcasts |
| `videoId` | Présent pour les vidéos YouTube |
| `image` | URL de l'image de preview (optionnelle) |

## Récupérer le contenu complet d'un article

Quand l'utilisateur veut un résumé, un brief ou une analyse, il faut aller chercher le contenu réel de l'article (pas juste le `description`, qui n'est qu'un snippet).

**Pour `type: "blog"`** — fetcher le `link` avec l'outil disponible, dans cet ordre :

1. **`WebFetch`** si disponible (Claude Code) — donne directement le texte/markdown extrait proprement de la page. Chemin recommandé.
2. **`curl -sL <link>`** en fallback, puis extraction du contenu principal (soit par l'intelligence du modèle sur le HTML brut, soit via un outil de readability si l'environnement en a un).
3. Si les deux échouent (paywall, site down, anti-bot) : indiquer à l'utilisateur que le contenu n'a pas pu être récupéré et se contenter du `description` + `link`. **Ne jamais inventer le contenu d'un article qu'on n'a pas pu lire.**

**Pour `type: "podcast"` ou `type: "youtube"`** — inutile de fetcher quoi que ce soit. Le `description` contient déjà le résumé utile (description d'épisode, description de vidéo). Proposer systématiquement le `link` pour écouter/regarder, et `audioUrl` pour les podcasts qu'on veut embarquer directement.

## Pattern : brief matinal personnalisé

Quand l'utilisateur demande "fais-moi mon brief", "ma newsletter du matin", "ce qui s'est passé cette semaine sur X", etc. :

1. **Appeler `flux-discover.sh latest`** avec une fenêtre cohérente : `--days 1` à `--days 7` selon la demande. Défaut raisonnable : `--days 3`.
2. **Filtrer sémantiquement** les articles selon les thèmes évoqués par l'utilisateur. Ne pas se contenter d'un match textuel plat — utiliser `title`, `description` et `categories` pour juger de la pertinence réelle. Un article "AI-generated code quality" est pertinent pour le thème "IA" même si le mot "IA" n'apparaît pas.
3. **Sélectionner 5 à 8 articles**, en privilégiant la diversité des sources (éviter 5 articles d'un même blog). Panacher blogs + podcasts + vidéos quand c'est pertinent.
4. **Pour chaque article `blog` retenu** : fetcher le `link` (WebFetch prioritaire) pour lire le contenu réel avant de synthétiser.
5. **Pour les podcasts/vidéos retenus** : s'appuyer sur le `description`, sans fetch.
6. **Composer un brief en markdown** structuré par thème demandé, avec pour chaque article :
   - Titre en lien cliquable vers `link`
   - 2-4 phrases qui résument le **fond** (pas juste le début de l'article)
   - `source`, `type` et date entre parenthèses à la fin
7. Terminer par une section "Autres lectures" qui liste rapidement 3-5 articles pertinents non détaillés (titre + lien + source).

## Pattern : recherche ad-hoc

Quand l'utilisateur demande "trouve-moi des articles sur X" ou "qu'est-ce qui s'est dit récemment sur Y" :

1. `flux-discover.sh search "X" --days 30` (fenêtre plus large qu'un brief).
2. Si peu ou pas de résultats, élargir à `--days 90` ou faire une recherche par mot-clé connexe.
3. Lister les résultats : titre, source, date, lien. Grouper par `type` si utile.
4. Proposer : "veux-tu que j'approfondisse un ou plusieurs de ces articles ?"

Si aucun résultat pertinent : le dire honnêtement. Ne pas synthétiser à partir de rien.

## Pattern : approfondissement

Quand l'utilisateur pointe un article (via lien ou référence) :

1. Fetcher le `link` (WebFetch prioritaire).
2. Rédiger une synthèse structurée : contexte, points-clés, conclusion, éventuels extraits marquants. Garder le lien cliquable vers l'original.

## Pattern : exploration du paysage

Quand l'utilisateur demande "quelles sont les sources francophones sur le DevOps ?" ou "qui publie sur l'IA en français ?" :

1. `flux-discover.sh sources --lang fr` pour avoir la liste dédoublonnée.
2. Croiser avec `flux-discover.sh search "<thème>" --days 90` pour identifier qui a réellement produit sur le sujet récemment.

## Principes transversaux

- **Citer les sources en cliquable** : l'utilisateur doit pouvoir revenir à l'article d'origine en un clic.
- **Respecter la langue de sortie** : par défaut, répondre dans la langue de l'utilisateur (français souvent). Pour un article anglais synthétisé à un francophone, traduire la synthèse.
- **Honnêteté sur les échecs** : si un fetch échoue, le dire, passer à l'article suivant. Ne jamais halluciner le contenu d'un article inaccessible.
- **Pas de redondance** : si deux articles traitent du même sujet, n'en détailler qu'un (le plus complet ou le plus récent), mentionner l'autre brièvement.
- **Latence à connaître** : Flux tourne en indexation quotidienne (~4 UTC). Les articles publiés après ce run apparaissent le lendemain. Ne pas promettre à l'utilisateur une fraîcheur à la minute.

## Dépannage

- Le script retourne `[]` : soit rien ne match (élargir `--days`, assouplir le terme de recherche), soit l'endpoint est indisponible (rare — Netlify). Vérifier avec `curl -I https://flux.yoandev.co/search-index.json`.
- `jq: error` parsing : un article a un `pubDate` malformé. Le script l'ignore silencieusement, ce n'est pas bloquant.
- Un site bloque le fetch : noter la source dans la synthèse ("Article inaccessible en fetch direct — voir lien ci-dessus"), continuer.
