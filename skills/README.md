# Skills Flux

Skills Claude Code distribuables depuis le projet [Flux](https://flux.yoandev.co).

## yoandev-flux

Skill de veille tech francophone et internationale. Donne à un agent l'accès à l'index de Flux (80+ blogs, podcasts et chaînes YouTube agrégés quotidiennement) et lui explique comment composer des briefs matinaux, des recherches ad-hoc et des synthèses d'articles à partir de thématiques exprimées en langage naturel.

### Installation

```bash
npx skills add yoanbernabeu/Flux
```

Voir [skills.sh](https://skills.sh/) pour plus d'infos sur le CLI.

### Prérequis

- `curl` et `jq` dans le `PATH` (installés par défaut sur macOS, `apt install jq` sur Debian/Ubuntu).
- Un agent compatible Claude Code (ou équivalent) avec un outil de fetch de page web (`WebFetch`, `curl`, etc.).

### Usage

Une fois installée, la skill s'active automatiquement selon le contexte. Exemples de prompts qui la déclenchent :

- « Fais-moi ma newsletter du matin sur l'IA, Symfony et le DevOps »
- « Qu'est-ce qui s'est passé cette semaine en tech francophone ? »
- « Trouve-moi des articles récents sur Rust »
- « Résume-moi cet article : <url> »
- « Quelles sont les sources françaises qui publient sur le DevOps ? »

### Développement

La skill contient :

```
yoandev-flux/
├── SKILL.md                      # instructions pour l'agent
└── scripts/
    └── flux-discover.sh          # primitive de découverte (bash pur)
```

Pour tester la primitive directement :

```bash
./yoandev-flux/scripts/flux-discover.sh latest --days 3 --lang both --limit 5
./yoandev-flux/scripts/flux-discover.sh search "symfony" --days 30
./yoandev-flux/scripts/flux-discover.sh sources --lang fr
```
