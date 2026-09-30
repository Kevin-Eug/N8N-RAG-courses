---
name: doubt-driven-dev
description: Développement guidé par le doute. Avant, pendant et après une tâche de code, Claude traite ses propres certitudes comme des hypothèses, les vérifie par la moins chère des preuves (lire le code, exécuter, écrire un test qui échoue, relecture adverse à froid) et ne déclare rien « fait » ou « sûr » sans preuve. Utilise ce skill quand la personne demande de douter, de vérifier deux fois, d'être rigoureux, de ne rien supposer, quand l'enjeu est élevé (production, sécurité, authentification, paiement, données, migration, opération irréversible), quand le code est inconnu, ou quand elle dit « doubt driven », « doute de tout », « prouve-le », « es-tu sûr ? », « double-check ».
---

# Doubt-Driven Dev

Une réponse confiante n'est pas une réponse correcte. Au fil d'une session, des suppositions deviennent des « faits » sans que personne ne l'ait décidé : « cette fonction n'est appelée qu'ici », « cette option existe dans cette version », « le bug vient de là », « ça ne casse rien ». Le doute méthodique consiste à repérer ces affirmations au moment où elles se forment et à les vérifier tant que c'est encore bon marché.

Le doute n'est pas de l'hésitation. Tu avances vite sur ce qui est sûr et tu t'arrêtes net sur ce qui ne l'est pas. Un doute se termine toujours de l'une de ces trois façons : **vérifié**, **réfuté**, ou **assumé explicitement** (écrit comme risque résiduel).

## Échelle de certitude

Classe chaque affirmation qui compte :

| Niveau | Signifie | Exemple |
|---|---|---|
| **Vérifié** | tu l'as constaté dans cette session : sortie de commande, code lu, test exécuté | « Les 42 tests passent (sortie ci-dessus). » |
| **Inféré** | déduit d'éléments vérifiés, avec un raisonnement que tu peux montrer | « Seul `api/` importe ce module (grep), donc le renommage est local. » |
| **Supposé** | ni vu ni déduit : mémoire, habitude, « d'habitude ça marche comme ça » | « Cette lib gère sûrement les fuseaux horaires. » |

Une affirmation *supposée* dont dépend une décision non triviale doit monter d'un niveau avant que tu t'appuies dessus. Tes souvenirs d'une API, d'une version ou d'un comportement de framework sont par défaut des suppositions : ton entraînement date, le projet a peut-être une autre version.

## Quand douter, et avec quelle intensité

Pas à chaque frappe : si tu doutes de tout, tu ne livres rien. Une décision est **non triviale** si au moins un de ces points est vrai :

- elle ajoute ou modifie une logique conditionnelle ;
- elle traverse une frontière (module, service, API, processus) ;
- elle affirme une propriété que le compilateur ne vérifie pas (idempotence, concurrence, ordre, invariant, sécurité) ;
- sa justesse dépend d'un contexte invisible pour un futur lecteur ;
- elle est difficile ou impossible à annuler (déploiement, migration, suppression, API publique).

Adapte l'intensité à l'enjeu :

| Intensité | Quand | Ce que ça implique |
|---|---|---|
| **Léger** | changement local, réversible, bien testé | vérifier les faits clés, prouver le « fait » à la fin |
| **Standard** (défaut) | logique métier, plusieurs fichiers, code peu connu | + reformuler la demande, test qui échoue d'abord, registre des doutes |
| **Maximal** | prod, sécurité, données, argent, irréversible | + relecture adverse à froid de chaque décision non triviale, plan de retour arrière |

Ne doute pas des opérations mécaniques (renommer, formater, déplacer), des instructions claires de la personne, ni quand elle a explicitement demandé la vitesse plutôt que la vérification : dans ce dernier cas, signale en une ligne ce que tu n'as pas vérifié.

## Le cycle

### 1. Douter de la demande (avant de coder)

Le bug le plus cher est de résoudre parfaitement le mauvais problème.

- Reformule la demande en une ou deux phrases, avec le **critère de réussite** : comment on saura que c'est bon.
- Liste les ambiguïtés. Celles que le code, la doc ou l'historique peuvent trancher, tranche-les toi-même. Celles qui relèvent d'un choix (comportement attendu, compromis, périmètre), pose-les à la personne, en une seule fois et avec ta recommandation.
- Pour un bug : **reproduis-le avant de le corriger**. Un bug que tu n'as pas vu échouer, tu ne sauras pas que tu l'as corrigé.

### 2. Douter des décisions (pendant)

À chaque décision non triviale :

1. **Énonce l'affirmation** en une ou deux lignes, avec l'enjeu : `AFFIRMATION : le cache est sûr en lecture concurrente. ENJEU : sinon, données corrompues difficiles à détecter.` Si tu n'arrives pas à l'écrire aussi court, tu as une impression, pas une décision.
2. **Cherche la preuve la moins chère qui pourrait la réfuter**, pas celle qui la confirme. Voir `references/verifications.md` pour le catalogue par type d'affirmation (usage d'un symbole, API et versions, cause d'un bug, non-régression, performance, sécurité, migration…).
3. **Ordre de préférence** : exécuter > lire le code > lire la doc de la version installée > raisonner. Un test qui échoue avant ton changement et passe après est la meilleure forme de doute : c'est une tentative de réfutation qui a échoué.
4. En intensité maximale, ou si la preuve est impossible à obtenir par exécution, lance une **relecture adverse à froid** (voir plus bas).
5. Consigne le résultat dans le registre des doutes.

### 3. Douter du « c'est fini » (après)

Avant d'écrire « fait », « corrigé », « ça marche », « les tests passent » :

- identifie la commande ou l'observation qui prouve chacune de ces affirmations ;
- exécute-la **maintenant**, en entier (pas une ancienne sortie, pas un sous-ensemble) ;
- lis la sortie : code de retour, nombre d'échecs, avertissements ;
- relis la demande reformulée à l'étape 1 et vérifie chaque critère de réussite, un par un ;
- revérifie le symptôme d'origine, pas seulement les tests.

Si tu écris « devrait », « normalement », « a priori », « ça semble » à propos de ton propre travail, c'est qu'une vérification manque : fais-la, ou déclare le point comme non vérifié.

## Relecture adverse à froid

Un relecteur qui a suivi ton raisonnement valide ton raisonnement. Pour qu'il doute vraiment, il doit arriver sans ton contexte et avec la mission de réfuter.

- **Donne-lui l'artefact et le contrat, pas ta conclusion.** Artefact : le diff ou la fonction, pas tout le fichier. Contrat : ce que le code doit garantir et les contraintes. Ne lui transmets ni ton affirmation, ni ta justification : sinon il te renvoie ton propre avis.
- **Si tu peux lancer un sous-agent**, utilise le prompt de `references/revue-adverse.md`. Sinon, fais une auto-relecture dégradée : réécris l'artefact et le contrat comme si tu les découvrais, applique la même grille, et indique que ce n'était pas une relecture à froid.
- **Trie chaque remarque** en relisant l'artefact (le relecteur manque de contexte, il peut se tromper) : contrat mal écrit → corrige le contrat ; problème réel → corrige le code ; compromis assumé → écris-le pour la personne ; bruit → écarte-le et demande-toi si un contrat plus précis l'aurait évité.
- **Trois cycles maximum.** Si des problèmes sérieux persistent après trois cycles, l'artefact n'est pas prêt ou il est trop gros : découpe-le ou remonte la question à la personne, n'entame pas un quatrième cycle seul.

Si sur deux cycles le relecteur a soulevé des points sérieux et que tu les as tous classés en bruit, tu ne doutes pas, tu te valides : arrête et montre les remarques à la personne.

## Registre des doutes

En intensité standard et maximale, tiens un registre court et montre-le dans ton compte rendu :

```
| Doute | Niveau initial | Preuve | Résultat |
|---|---|---|---|
| `parseDate` n'est utilisé que dans `billing/` | supposé | `grep -rn parseDate` | vérifié (2 appels) |
| la v3 de la lib accepte `timeout` | supposé | lockfile : v2.8 ; doc v2.8 | réfuté → option `ttl` |
| aucun appelant ne dépend de l'ancien format | inféré | pas de test couvrant l'export CSV | assumé, risque résiduel |
```

Garde-le à l'échelle de la tâche : trois à dix lignes, seulement les doutes qui ont compté.

## Compte rendu final

Termine par trois blocs courts :

- **Vérifié** : ce qui est prouvé, avec la preuve (commande et résultat).
- **Non vérifié** : ce que tu n'as pas pu prouver, et pourquoi.
- **Doutes résiduels** : les risques assumés, et le test qui les lèverait.

Pas de « tout est bon » sans ces trois blocs.

## Excuses à reconnaître

| Excuse | Réalité |
|---|---|
| « Je suis sûr, pas besoin de vérifier. » | La certitude est le moment où les angles morts se cachent. Si c'est sûr, la vérification prend dix secondes. |
| « Je connais cette API. » | Tu connais *une* version. Regarde celle du projet. |
| « Les tests passent, donc c'est bon. » | Les tests prouvent ce qu'ils testent. Qu'est-ce qu'ils ne couvrent pas ? |
| « Ça a marché tout à l'heure. » | Une sortie ancienne ne prouve rien sur le code actuel. Relance. |
| « Le sous-agent dit que c'est fait. » | Un compte rendu n'est pas une preuve. Regarde le diff et relance les tests. |
| « Le relecteur n'est pas d'accord, donc j'avais tort. » | Il manque de contexte. Son avis est une donnée : relis l'artefact, puis tranche. |
| « Douter ralentit. » | Déboguer une supposition fausse en production ralentit bien plus. Le doute est borné, le bug ne l'est pas. |

## Articulation avec d'autres skills

- **interview** doute du *projet* de la personne ; **doubt-driven-dev** doute de *ton propre travail* sur ce projet. L'un sert à décider quoi construire, l'autre à s'assurer que c'est bien construit.
- Un TDD rigoureux est du doute concret : le test rouge est la tentative de réfutation. Quand il s'applique, il suffit comme preuve pour les affirmations de comportement.
