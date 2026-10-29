# Emails d'Regulya

Tous les emails partagent la même mise en page (fond crème, logo « Regulya. », bouton corail).

| Fichier | Quand il part | Qui l'envoie | Objet à mettre |
|---|---|---|---|
| `confirm-signup.html` | Après la création d’un compte | Supabase | Confirme ton adresse pour activer ton compte Regulya |
| `reset-password.html` | Quand on clique sur « Mot de passe oublié » | Supabase | Réinitialise ton mot de passe Regulya |
| `login-code.html` | Connexion par code reçu par email (« Magic link ») | Supabase | Ton code de connexion Regulya |
| `reminder-example.html` | Rappels d’échéances, chaque matin | L’appli (Brevo) | Généré automatiquement, rien à coller |
| `test-email-example.html` | Bouton « M’envoyer un email de test » | L’appli (Brevo) | Généré automatiquement |
| `account-deletion.html` | Demande de suppression du compte | Pas encore envoyé : l’appli ne l’envoie pas encore | Suppression de ton compte demandée |

## Coller les modèles dans Supabase
1. Supabase → **Authentication → Emails → Templates**.
2. Choisis le modèle (« Confirm signup », « Reset password », « Magic link »).
3. Mets l’objet du tableau ci-dessus dans **Subject**.
4. Remplace tout le contenu de **Message body** par le contenu du fichier HTML correspondant, puis **Save**.

Les lignes `{{ .ConfirmationURL }}` et `{{ .Token }}` sont remplies par Supabase à l’envoi : ne les modifie pas.

Le modèle « Magic link » ne sert que si la connexion par code est activée. Les fichiers `*-example.html` sont des aperçus avec de fausses données : ne les colle pas dans Supabase.
