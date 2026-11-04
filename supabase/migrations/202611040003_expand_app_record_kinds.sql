-- Allow all record kinds currently written by the Dose Certa application.
-- Existing records are preserved; only the accepted values for app_records.kind change.
ALTER TABLE public.app_records
  DROP CONSTRAINT IF EXISTS app_records_kind_check;

ALTER TABLE public.app_records
  ADD CONSTRAINT app_records_kind_check
  CHECK (
    kind IN (
      'patients',
      'meds',
      'doses',
      'alerts',
      'tickets',
      'config',
      'routines',
      'routineLogs',
      'routineSettings'
    )
  );
