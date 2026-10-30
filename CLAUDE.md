# CLAUDE.md — Site d'organisation des études

Ce fichier est la spécification complète du projet. Lis-le entièrement avant d'écrire la moindre ligne de code. En cas de doute, pose la question avant de coder.

---

## 1. Présentation du projet

Application web installable (PWA) qui aide un étudiant à organiser son travail sur la semaine et sur la durée : agenda des devoirs, plans de révision, QCM générés par IA, flash cards à répétition espacée, prise de notes par matière, enregistrement et transcription de cours.

- **Nom de travail** : Études (nom définitif à valider)
- **Domaine** : jadecaruana.fr (déjà acquis)
- **Titulaire** : Jade CARUANA
- **Langue de l'interface** : français uniquement en V1
- **Utilisateurs cibles** : étudiants d'écoles de commerce, dont des étudiants en Bachelor avec cours en anglais

---

## 2. Objectifs

1. Centraliser cours, devoirs, révisions et notes au même endroit.
2. Transformer automatiquement les cours en outils de révision (QCM, fiches, cartes mentales).
3. Suivre sa progression et repérer ses erreurs récurrentes.
4. Garder un coût d'usage maîtrisé.

---

## 3. Stack technique recommandée

Propositions à valider avant de démarrer. Si tu proposes une alternative plus simple, explique pourquoi.

- **Frontend** : React + Vite, en PWA (manifest, service worker, installable sur l'écran d'accueil). TypeScript.
- **Style** : Tailwind CSS, avec des composants maison. Pas de bibliothèque UI lourde.
- **Backend et base** : Supabase (base PostgreSQL, authentification email et mot de passe, Storage pour les fichiers, Edge Functions pour les appels IA).
- **Hébergement frontend** : Vercel ou Netlify.
- **IA (texte)** : fournisseur à choisir parmi OpenAI, Anthropic ou Google. Le code doit isoler l'appel IA derrière une seule couche (un module `ai/`) pour pouvoir changer de fournisseur.
- **Transcription audio** : service à choisir (Whisper via API par défaut). Même principe : une seule couche `transcription/`.
- **Intégration Outlook** : Microsoft Graph, authentification OAuth, lecture du calendrier en V1.
- **Emails** : service transactionnel (Resend ou équivalent) pour les notifications.
- **Variables d'environnement** : jamais de clé en dur. Fournir un fichier `.env.example` avec les noms des variables, sans valeurs.

---

## 4. Utilisateurs, espaces et comptes

- Connexion par **email et mot de passe**. Pas de connexion sociale en V1.
- Un compte peut être rattaché à **plusieurs espaces** (un par établissement : TBS, puis Hull).
- **Espaces étanches** : matières, cours, notes, agendas, QCM, fiches et transcriptions sont liés à un espace. Aucune donnée ne passe d'un espace à l'autre, sauf via une action explicite de l'utilisateur.
- Un espace peut être renommé, archivé ou supprimé.
- Chaque ligne de données porte un `space_id` et un `user_id`. Activer la Row Level Security (RLS) de Supabase sur toutes les tables.

---

## 5. Modules fonctionnels

### 5.1 Accueil

Au lancement, afficher quatre blocs :
1. **Prochaines échéances** (les 5 devoirs les plus proches, avec compte à rebours).
2. **Devoirs du jour**.
3. **Avancement des révisions** (pourcentage par matière).
4. **Dernière session de révision en cours**, avec bouton « Reprendre ».

### 5.2 Agenda et devoirs

- Ajout manuel d'un devoir : matière, titre, description, date limite, durée estimée (optionnelle), statut (`à faire`, `en cours`, `fait`).
- **Planification automatique optionnelle** : à partir de l'échéance et des créneaux libres, répartir le travail sur les jours disponibles. Proposer le découpage. L'utilisateur accepte, modifie ou refuse. Ne jamais planifier sans validation.
- **Vues** : jour, semaine, mois, liste.
- **Synchronisation Outlook** : lecture des événements du calendrier (cours), affichés dans l'agenda avec la couleur de la matière. Écriture des devoirs vers Outlook : **non en V1**.
- **Notifications par email** pour les échéances proches (J-3, J-1 par défaut, réglables).

### 5.3 Matières

- Création libre, avec nom et **couleur choisie** par l'utilisateur.
- Chaque matière regroupe : cours, PDF, notes, QCM, fiches, cartes mentales, ressources, transcriptions.
- Une palette de couleurs prédéfinies est proposée, mais l'utilisateur peut choisir une couleur libre.

### 5.4 Plans de révision et flash cards

**Plan de révision**
- Création de sessions par matière, avec couleur et checklist.
- Chaque item de checklist peut être coché ; la progression est calculée automatiquement.

**Flash cards**
- Création manuelle, ou génération IA à partir d'un cours ou d'une note.
- **Répétition espacée** : implémenter l'algorithme SM-2. Chaque carte a un intervalle, un facteur de facilité et une date de prochaine révision.
- Boutons de réponse : « Je ne savais pas », « Difficile », « Bien », « Facile ».
- Les cartes dues sont proposées chaque jour.

**Révision des erreurs**
- Toute question de QCM ratée est ajoutée à une session « Erreurs » par matière.
- Cette session se retire une fois la question réussie deux fois de suite.

### 5.5 QCM et entraînements

**Import**
- Import d'un cours (texte ou PDF). Extraction du texte côté serveur (bibliothèque PDF).
- Possibilité de sélectionner plusieurs cours d'une même matière pour la génération.

**Génération IA**
- Paramètres : nombre de questions (5 à 50), difficulté (facile, moyen, difficile), type (QCM à 4 choix, vrai ou faux).
- Sortie **structurée en JSON** : question, choix, bonne réponse, explication, notion associée.
- Valider le JSON avant enregistrement. En cas d'échec, réessayer une fois, puis signaler l'erreur à l'utilisateur.
- **Ne jamais montrer les réponses avant la fin de la session.**

**Session**
- Questions présentées une à une.
- **Correction et explications affichées à la fin de la session**, avec score.
- Chaque réponse est enregistrée (date, bonne ou mauvaise, temps de réponse).

**Entraînements TAGE MAGE et TOEIC**
- Banques de questions générées dans le format de chaque test (sections, nombre de questions, temps imparti).
- Ne jamais reprendre des sujets officiels publiés. Les questions sont générées à partir de modèles de consignes.
- Mode chronométré (V3).

### 5.6 Statistiques et analyse des erreurs

- Taux de réussite par matière, par QCM et par notion, avec courbe d'évolution.
- Temps passé par matière et par session (chronomètre de session, arrêt automatique après inactivité de 10 minutes).
- **Analyse des erreurs** : notions les plus souvent ratées, avec suggestion d'une révision ciblée.
- **Série de jours consécutifs** de révision (affichage simple, sans pression).

### 5.7 Prise de notes

- **Éditeur complet** : texte enrichi (gras, italique, titres, listes, citations), tableaux, formules mathématiques (KaTeX), images, pièces jointes.
- Notes **rattachées à une matière**.
- **Export** en PDF et en DOCX, à la demande (génération côté serveur ou via une bibliothèque côté client).
- **Génération IA** à partir d'une note :
  - **Fiche de révision** : résumé structuré avec titres et points clés.
  - **Carte mentale** : structure JSON hiérarchique, rendue visuellement, **éditable** (ajout, suppression, déplacement de nœuds).
- **Règle de conservation** : une génération **ne modifie jamais la note d'origine**. Chaque fiche ou carte mentale est une entité séparée, avec sa date de création, et peut être éditée indépendamment.
- Si la note d'origine est modifiée plus tard, proposer (sans l'imposer) de regénérer la fiche.

### 5.8 Enregistrement et transcription de cours

**Entrée**
- Enregistrement **depuis le navigateur** (API MediaRecorder), à la demande, avec affichage clair du voyant d'enregistrement.
- **Import** d'un fichier audio ou vidéo (mp3, m4a, wav, mp4, mov). Pas de limite de taille imposée, mais avertir l'utilisateur au-delà de 500 Mo.

**Transcription**
- Langue détectée ou choisie par l'utilisateur (français, anglais).
- La transcription est enregistrée dans la matière, rattachée au cours, avec horodatage.
- **Pas de traduction intégrée**. Un bouton « Copier » permet de la coller dans un outil externe.

**Cycle de vie de l'audio**
- Après transcription réussie, deux options au choix de l'utilisateur, réglables dans les paramètres :
  1. **Supprimer l'audio** immédiatement.
  2. **Envoyer l'audio par email** à l'utilisateur, puis le supprimer du stockage.
- **Compression** : quand un cours est terminé ou n'est plus utilisé, proposer de compresser l'audio (format plus léger, par exemple Opus à débit réduit).
- L'audio compressé reste **réutilisable** pour les révisions d'examens finaux : il peut être restauré à la demande.
- La transcription est **toujours conservée** dans l'espace de l'utilisateur.

**Droits** : l'école autorise les enregistrements et la transcription. Ne rien diffuser à des tiers.

### 5.9 Bibliothèque de ressources

- Éléments rangés par matière : PDF, liens, vidéos (lien externe), documents.
- Recherche par mots-clés dans les titres, les descriptions et le contenu extrait des PDF.

### 5.10 Recherche globale

- Barre de recherche accessible partout.
- Recherche dans cours, notes, fiches, QCM, transcriptions et ressources.
- Filtre par matière et par type.
- Surlignage des termes trouvés dans le résultat.

### 5.11 Paramètres

- Thème (clair crème par défaut).
- Notifications (activation, délais).
- Cycle de vie de l'audio (supprimer, envoyer par email).
- Export complet de toutes les données (archive ZIP : JSON + fichiers).
- Suppression de compte, avec effacement effectif après 30 jours.
- Corbeille et sauvegarde (voir section 7).

---

## 6. Modèle de données (indicatif)

Tables principales, toutes avec `id`, `space_id`, `user_id`, `created_at`, `updated_at`, `deleted_at` (pour la corbeille) :

- `spaces`, `subjects` (nom, couleur)
- `assignments` (matière, titre, description, échéance, durée estimée, statut)
- `study_plans`, `plan_items`
- `flashcards` (recto, verso, intervalle, facteur, prochaine_révision)
- `flashcard_reviews`
- `quizzes`, `quiz_questions`, `quiz_sessions`, `quiz_answers`
- `notes` (contenu riche, matière)
- `note_outputs` (type : fiche ou carte mentale, contenu, note_source_id, date)
- `recordings` (durée, statut, emplacement audio, cycle de vie)
- `transcriptions` (texte, langue, horodatage, course_id)
- `resources` (type, url ou chemin, matière)
- `calendar_links` (token OAuth chiffré, dernière synchro)

---

## 7. Sauvegarde, corbeille et sécurité

- **Sauvegarde automatique** : base sauvegardée selon la politique Supabase, avec export complet hebdomadaire à la demande de l'utilisateur. Versions des notes conservées.
- **Corbeille** : tout élément supprimé (note, devoir, QCM, fiche, ressource) passe en `deleted_at`. Il reste récupérable pendant **30 jours**, puis un job purge définitivement.
- **Suppression de compte** : effacement effectif après 30 jours, avec mail de confirmation.
- **Export** : archive ZIP complète (JSON pour les données, fichiers originaux, transcriptions en `.txt`).
- **Chiffrement** : HTTPS partout, données chiffrées au repos (Supabase), tokens OAuth chiffrés en base.
- **RLS** : aucune table sans politique de sécurité.
- **Secrets** : aucune clé dans le code front. Les appels IA et la transcription passent exclusivement par des Edge Functions.

---

## 8. Direction artistique

**Principe** : épuré et ludique. Beaucoup d'espace blanc, des formes arrondies, des couleurs vives utilisées avec parcimonie, des micro-animations qui récompensent sans distraire.

### Palette
- **Fond principal** : crème clair, `#FBF6EC` (à utiliser comme couleur de base).
- **Surfaces** (cartes) : blanc cassé, `#FFFDF8`, avec bordure fine `#EADFC8`.
- **Texte principal** : brun très foncé, `#2B2118`.
- **Texte secondaire** : `#7A6B58`.
- **Accent principal** : corail, `#F26B4F`.
- **Couleurs de matière** (palette proposée, l'utilisateur peut en choisir d'autres) : `#F26B4F` corail, `#F5B841` ambre, `#5CB58A` vert sauge, `#4F9BD9` bleu, `#9B7FD6` lavande, `#E97BAE` rose, `#3FB8B0` turquoise.
- **Succès** : vert `#5CB58A`. **Erreur** : rouge doux `#E0584B`, jamais agressif.

### Typographie
- **Titres** : une police arrondie et chaleureuse (Fredoka, Nunito ou équivalent via Google Fonts).
- **Texte** : une police lisible (Inter ou Nunito).
- Tailles généreuses, hiérarchie nette, interligne confortable.

### Formes et composants
- Coins très arrondis (16 à 24 px) sur les cartes et boutons.
- Ombres douces, peu marquées.
- Icônes simples, à trait épais, cohérentes (Lucide ou équivalent).
- Boutons principaux pleins en corail, boutons secondaires en contour.

### Ludique (sans surcharger)
- **Barres de progression** colorées par matière, avec animation à la mise à jour.
- **Badges** légers pour la série de jours et les paliers de révision (sans son, sans pop-up intrusive).
- **Confettis discrets** uniquement après une session réussie à plus de 80 %.
- **Micro-animations** de 150 à 250 ms sur les actions (cocher, valider, retourner une carte).
- **Mode focus** : écran épuré pendant une session de révision.
- Respecter `prefers-reduced-motion` : désactiver les animations si l'utilisateur le demande.

### Accessibilité
- Contrastes suffisants (WCAG AA minimum), y compris sur le fond crème.
- Navigation au clavier complète.
- Textes alternatifs sur les images et icônes.

---

## 9. Responsive et PWA

- **Mobile first** : toutes les vues doivent être utilisables au pouce.
- Navigation : barre inférieure sur mobile, menu latéral sur ordinateur.
- **Manifest** : nom, icônes, couleur de thème crème, mode `standalone`.
- **Service worker** : mise en cache de l'interface pour un démarrage rapide. Pas de mode hors ligne complet en V1.
- Prompt d'installation proposé à la deuxième visite, jamais de manière bloquante.

---

## 10. Périmètre

### V1 (à livrer en premier)
1. Authentification, espaces, paramètres de base.
2. Matières avec couleurs.
3. Agenda et devoirs, avec vues jour, semaine, mois, liste, et synchronisation Outlook en lecture.
4. QCM : import, génération IA, session, correction à la fin.
5. Flash cards avec répétition espacée (SM-2).
6. Notes : éditeur complet, export PDF et DOCX.
7. Corbeille (30 jours), export complet, sauvegarde.
8. PWA installable, thème crème, français.

### V2
- Fiches et cartes mentales générées par IA, cartes mentales éditables.
- Statistiques détaillées et analyse des erreurs.
- Enregistrement et transcription de cours, cycle de vie de l'audio, compression.
- Bibliothèque de ressources et recherche globale.
- Notifications email.

### V3
- Entraînements TAGE MAGE et TOEIC complets.
- Planification automatique avancée.
- Série de jours, temps passé détaillé, mode examen chronométré.

### Hors périmètre (toutes versions)
- Traduction intégrée.
- Mode oral.
- Publication sur les stores.
- Partage entre étudiants.
- Intégration Pronote ou ENT.
- Écriture des devoirs vers Outlook (sauf décision ultérieure).

---

## 11. Ordre de travail recommandé pour la V1

1. Initialiser le projet (Vite, React, TypeScript, Tailwind), le manifest PWA et la palette.
2. Mettre en place Supabase : schéma, RLS, authentification.
3. Créer la navigation et les écrans vides (accueil, agenda, matières, révisions, notes, paramètres).
4. Implémenter les matières.
5. Implémenter agenda et devoirs (sans Outlook d'abord).
6. Implémenter la corbeille sur toutes les entités.
7. Implémenter l'éditeur de notes et l'export PDF et DOCX.
8. Implémenter les flash cards et l'algorithme SM-2, avec tests unitaires.
9. Implémenter la génération de QCM par IA, avec validation du JSON, puis la session et la correction.
10. Brancher la synchronisation Outlook en lecture.
11. Implémenter l'export complet et la suppression de compte.
12. Finaliser la direction artistique, l'accessibilité et l'installation PWA.

**Après chaque étape** : lancer les tests, vérifier la RLS avec deux comptes de test, et me montrer un résumé avant de passer à la suivante.

---

## 12. Critères d'acceptation V1

- Un utilisateur peut créer deux espaces et vérifier qu'aucune donnée ne passe de l'un à l'autre.
- Un devoir supprimé reste visible dans la corbeille pendant 30 jours, puis disparaît.
- Une génération de QCM ne montre aucune réponse avant la fin de la session.
- Une génération de fiche ou de carte mentale ne modifie jamais la note d'origine.
- L'installation sur écran d'accueil fonctionne sur Android et iOS.
- L'export complet produit une archive lisible sans l'application.
- La répétition espacée planifie la prochaine révision selon la réponse donnée.
- Toutes les pages respectent la palette et les contrastes de la section 8.

---

## 13. Points ouverts à confirmer avant de coder

1. Nom définitif de l'application.
2. Fournisseur IA et budget mensuel.
3. Service de transcription.
4. Date cible de la V1.
5. Taille à partir de laquelle avertir (500 Mo proposés).
6. Confirmer la palette et la typographie après une première maquette.

---

## 14. Décisions prises après la V1 (validées par la titulaire)

Ces choix remplacent les points correspondants plus haut.

- **Nom** : Regulya. Charte : brun `#2B2118`, corail `#F26B4F`, police du logo Nunito.
- **Langues** : interface en français et en anglais (sélecteur), contenus de l'utilisateur jamais traduits. Pages légales en français (version de référence).
- **Connexion** : email et mot de passe, et connexion Google.
- **Partage** : lien en lecture seule (note ou fiche, carte mentale, paquet de flash cards), désactivable.
- **Offres** : Gratuit (quotas hebdomadaires, 10 générations la première semaine) et Premium à 2,99 €/mois, 14,99 €/semestre, 24,99 €/an ; essai Premium de 7 jours sans carte ; codes d'accès. Paiement Stripe prêt, activé par les variables d'environnement.
- **Agenda** : agendas reliés par lien iCal (Google, Hyperplanning, Celcat, Outlook publié) en plus de l'import PDF.
- **Notifications** : push web (échéances, cartes du jour) en plus des emails.
- **Hors ligne** : données déjà chargées consultables, révisions de flash cards mises en file d'attente.
- **Imports** : flash cards Anki, Quizlet, CSV ; notes Markdown (Notion), Word, texte.
