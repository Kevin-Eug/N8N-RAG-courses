# N8N-RAG-courses

Dépôt de cours et d'expérimentations autour de **n8n** et des agents IA : des workflows n8n prêts à importer, et des skills pour Claude Code.

## Workflows n8n

| Workflow | Description |
|---|---|
| [Weekly Slack Digest](./workflows/weekly-slack-digest/) | Chaque vendredi à 19 h (heure de Paris), résume avec Gemini les messages de la semaine du canal Slack #général et envoie la synthèse par Gmail. Gère les nouvelles tentatives et envoie une alerte en cas d'échec. |
| [RAG Chinese Economy](./workflows/rag-chinese-economy/) | Chatbot RAG qui répond aux questions sur l'économie chinoise à partir d'un livre de référence, en citant les pages. Ingestion par paquets avec reprise, recherche hybride (vecteurs + mots-clés) dans Supabase, reranking et réponse par Gemini, avec historique de conversation. |

Chaque workflow a son propre dossier avec :
- un fichier `.json` à importer dans n8n (**Workflows → Import from File**) ;
- un fichier `.workflow.ts` au format [n8n Workflow SDK](https://www.npmjs.com/package/@n8n/workflow-sdk), utilisable avec [`n8ncli`](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli) ;
- un `README.md` qui explique le fonctionnement et l'installation.

Certains workflows ajoutent les fichiers dont ils ont besoin, par exemple un script SQL Supabase et une page de chat pour **RAG Chinese Economy**.

Les exports ne contiennent aucun identifiant ni aucune donnée personnelle : il faut connecter ses propres comptes (Slack, Gemini, Gmail, Supabase…) après l'import.

## Skills Claude Code

| Skill | À quoi il sert |
|---|---|
| [interview](./skills/interview/SKILL.md) | Challenger, creuser et explorer un projet (idée, MVP, pitch) jusqu'à le rendre clair et solide. |
| [doubt-driven-dev](./skills/doubt-driven-dev/SKILL.md) | Développer en traitant ses certitudes comme des hypothèses à vérifier, sans rien déclarer « fait » sans preuve. |
| [hostile-review](./skills/hostile-review/SKILL.md) | Revue de code sans complaisance qui cherche à prouver que le code est cassé avant de le fusionner. |

Pour utiliser un skill, copie son dossier dans `~/.claude/skills/` (tous tes projets) ou dans `.claude/skills/` à la racine d'un projet.

## Structure

```
.
├── skills/
│   ├── doubt-driven-dev/
│   ├── hostile-review/
│   └── interview/
└── workflows/
    ├── rag-chinese-economy/
    └── weekly-slack-digest/
```
