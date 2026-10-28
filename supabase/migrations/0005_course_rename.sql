-- =====================================================================
-- Études — mise à jour 5 : renommer un cours de l'emploi du temps.
-- On garde le nom d'origine du PDF pour réappliquer le nouveau nom
-- quand le planning d'un autre mois est importé. Relançable sans danger.
-- =====================================================================

alter table public.imported_events add column if not exists original_title text;
