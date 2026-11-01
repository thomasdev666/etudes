-- =====================================================================
-- Regulya — mise à jour 24 : tous les essais en cours durent 3 jours
-- à partir de cette mise à jour (les essais déjà démarrés gardaient 7 jours).
-- Ne touche qu'aux essais gratuits, jamais aux abonnements payés ni aux codes.
-- Relançable sans danger.
-- =====================================================================
update public.subscriptions
   set current_period_end = now() + interval '3 days',
       updated_at = now()
 where source = 'trial'
   and plan = 'premium'
   and current_period_end > now();
