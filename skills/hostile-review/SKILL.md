---
name: hostile-review
description: Revue de code hostile d'un travail terminé (PR, diff, branche, commit, fichier, ou document technique comme une spec ou un plan de migration). Claude part du principe que le code est cassé et cherche à le prouver, par plusieurs angles d'attaque (saboteur, attaquant, exploitation en prod, mainteneur, procureur du contrat), ne retient que les problèmes appuyés par un scénario d'échec concret, puis contre-attaque ses propres trouvailles pour éliminer le bruit. Utilise ce skill quand la personne demande une revue sans complaisance, hostile, adverse, impitoyable, une « vraie » review, de démolir ou casser son code, de trouver ce qui va planter avant de merger, ou quand elle soupçonne une revue trop gentille, même sans le mot « hostile ».
---

# Hostile Review

Une revue ordinaire se demande si le code est bon. Une revue hostile part du principe qu'il est cassé et cherche à le prouver. Le code est coupable jusqu'à preuve du contraire ; ce qui survit à l'attaque peut être mergé.

Hostile envers l'artefact, jamais envers l'auteur. Le ton est sec et factuel : pas de « LGTM », pas de compliments en sandwich, pas d'insultes non plus. Tu attaques des lignes, pas des personnes.

Mais hostile ne veut pas dire malhonnête. Inventer des problèmes pour paraître exigeant est aussi inutile qu'une revue complaisante : ça noie les vrais défauts et apprend à l'auteur à ignorer la revue. La règle qui tient les deux ensemble :

> **Pas de scénario, pas de problème.** Chaque trouvaille doit dire *où* (fichier, ligne), *comment ça casse* (entrée ou situation, chemin suivi, conséquence observable) et *avec quelle confiance*. Une intuition sans scénario va dans les questions, pas dans les problèmes.

## Déroulé

### 1. Délimiter la cible

Identifie ce qui est revu, dans cet ordre :

- ce que la personne désigne (PR, branche, commit, fichier, document) ;
- sinon, dans un dépôt git : les changements non commités ; s'il n'y en a pas, la branche courante face à la branche principale (`git diff main...HEAD` ou équivalent) ; sinon le dernier commit ;
- sinon, ce qui a été collé ou joint.

Annonce en une ligne ce que tu revois et sa taille. Au-delà de ~800 lignes de diff, propose de découper par zone de risque plutôt que de tout survoler.

### 2. Établir le contrat

Tu ne peux pas dire qu'un code est faux sans savoir ce qu'il doit faire. Rassemble :

- ce que le changement **prétend** faire : description de PR, message de commit, ticket, demande de la personne ;
- ce qu'il **doit** respecter : conventions du projet (CLAUDE.md, AGENTS.md, config de lint, code voisin), interfaces existantes, contraintes de sécurité et de données.

Les affirmations de l'auteur sont des accusations à vérifier, pas des faits. Si le contrat est introuvable, déduis-le du code et signale que tu l'as déduit.

### 3. Lire en entier

Lis les fichiers modifiés en entier, pas seulement les lignes changées : les bugs se cachent dans la rencontre entre le nouveau code et l'ancien. Suis les appelants et les appelés au moins sur un niveau. Repère toutes les frontières de confiance traversées (entrée utilisateur, réseau, base, système de fichiers, environnement, autre service).

### 4. Attaquer

Choisis les angles selon le risque du changement, puis attaque avec chacun. Les grilles détaillées sont dans `references/angles-attaque.md`.

| Angle | Question | Toujours ? |
|---|---|---|
| **Saboteur** | Quelle entrée, quelle panne, quel ordre d'exécution casse ça ? | oui |
| **Procureur** | Le code fait-il réellement ce que l'auteur prétend, et tout ce qu'il prétend ? | oui |
| **Tests** | Si le code était faux, les tests échoueraient-ils ? | dès qu'il y a des tests ou qu'il devrait y en avoir |
| **Attaquant** | Comment j'utilise ça pour lire, écrire ou exécuter ce que je ne devrais pas ? | dès qu'une frontière de confiance est traversée |
| **Exploitation** | Que se passe-t-il au déploiement, à l'échelle, en cas d'incident, au retour arrière ? | code qui part en prod, migrations, config, infra |
| **Mainteneur** | Dans six mois, sans l'auteur, qu'est-ce que je vais casser en modifiant ça ? | changements structurants ou durables |

**Attaque à froid si tu peux.** Si tu as écrit ou longuement discuté ce code dans cette session, tu partages les angles morts de l'auteur. Si tu peux lancer des sous-agents, confie chaque angle pertinent à un sous-agent avec le prompt de `references/prompt-attaquant.md`, le diff et le contrat, sans tes explications. Sinon, fais les attaques toi-même et indique dans le rapport que la revue n'est pas indépendante.

**Prouve quand c'est bon marché.** Pour un problème bloquant ou majeur, essaie de le démontrer : un test qui échoue, une commande, une requête, un calcul. Écris ces essais dans un dossier temporaire ou montre-les dans le rapport ; ne modifie pas le code revu, sauf si la personne le demande. Une trouvaille démontrée vaut plus que trois trouvailles plausibles.

### 5. Contre-attaquer tes trouvailles

Deviens l'avocat de l'auteur et essaie de démolir chaque trouvaille :

- le scénario est-il vraiment atteignable, ou une garde en amont l'empêche-t-elle ? Relis le code, ne te fie pas à ta mémoire ;
- le framework, le type, la base ou une validation existante ne gèrent-ils pas déjà le cas ?
- est-ce un vrai défaut, ou juste une autre façon de faire que la tienne ?

Supprime ce qui tombe. Baisse la sévérité de ce qui vacille. Ce qui reste est solide, et l'auteur ne pourra pas l'écarter d'un revers de main.

### 6. Classer et conclure

| Sévérité | Signifie |
|---|---|
| **Bloquant** | perte ou corruption de données, faille de sécurité, panne en prod, le changement ne fait pas ce qu'il prétend |
| **Majeur** | bug probable sur un cas réaliste, régression, test qui ne teste pas ce qu'il dit, dette qui va coûter cher vite |
| **Mineur** | défaut réel mais à faible impact ; limite-toi aux cinq plus utiles |
| **Question** | soupçon sans scénario démontré, ou choix que seul l'auteur peut justifier |

Une trouvaille relevée indépendamment par deux angles différents monte d'un cran.

Verdict :

- **BLOQUER** : au moins un bloquant ;
- **À CORRIGER** : des majeurs, pas de bloquant ;
- **ACCEPTABLE** : seulement des mineurs ou des questions.

Rédige le rapport selon `references/rapport.md`.

## Si tu ne trouves rien

C'est possible et ça doit se dire. N'invente rien. Écris plutôt ce que tu as attaqué et qui a tenu (« entrées vides et géantes, double exécution, panne du service de paiement, utilisateur non autorisé »), l'hypothèse la plus fragile sur laquelle le code repose, et ce que tu n'as pas pu vérifier. « Rien trouvé après avoir attaqué X, Y, Z » est une information ; « LGTM » n'en est pas une.

## Ce que tu ne fais pas

- Pas de remarques de style sauf si elles cachent un bug ou contredisent les conventions du projet : le linter est là pour ça.
- Pas de réécriture complète proposée à la place d'une trouvaille précise. Un correctif court en suggestion, oui ; un refactoring de goût, non.
- Pas de correction du code pendant la revue, sauf demande explicite. La revue produit un verdict ; la suite appartient à l'auteur.
- Pas de sévérité gonflée pour paraître rigoureux : un mineur présenté comme bloquant décrédibilise les vrais bloquants.

## Articulation avec les autres skills

- **interview** attaque le *projet* avant de le construire.
- **doubt-driven-dev** fait douter Claude de *son propre travail* pendant qu'il le fait.
- **hostile-review** attaque un *travail terminé*, le sien ou celui de quelqu'un d'autre, avant qu'il ne soit mergé ou livré.

Langue : rédige la revue dans la langue de la personne.
