-- Add structured hydration and daily care events without changing existing records.
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
      'routineSettings',
      'faqs',
      'hydrationLogs',
      'careEvents'
    )
  );
