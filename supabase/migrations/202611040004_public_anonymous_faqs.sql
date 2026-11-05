-- Publish reviewed, anonymized support questions as shared help articles.
-- Existing records and their payloads are preserved.
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
      'faqs'
    )
  );

DROP POLICY IF EXISTS records_read ON public.app_records;
CREATE POLICY records_read
ON public.app_records
FOR SELECT
TO authenticated
USING (
  public.password_change_completed(auth.uid())
  AND (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'mestre')
    OR (public.has_role(auth.uid(), 'operador') AND kind = 'tickets')
    OR kind IN ('config', 'faqs')
  )
);

DROP POLICY IF EXISTS records_insert ON public.app_records;
CREATE POLICY records_insert
ON public.app_records
FOR INSERT
TO authenticated
WITH CHECK (
  public.password_change_completed(auth.uid())
  AND (
    public.has_role(auth.uid(), 'mestre')
    OR (
      owner_id = auth.uid()
      AND kind NOT IN ('config', 'faqs')
    )
    OR (
      kind = 'faqs'
      AND (
        public.has_role(auth.uid(), 'operador')
        OR public.has_role(auth.uid(), 'mestre')
      )
    )
  )
);

DROP POLICY IF EXISTS records_update ON public.app_records;
CREATE POLICY records_update
ON public.app_records
FOR UPDATE
TO authenticated
USING (
  public.password_change_completed(auth.uid())
  AND (
    public.has_role(auth.uid(), 'mestre')
    OR (owner_id = auth.uid() AND kind NOT IN ('config', 'faqs'))
    OR (kind = 'tickets' AND public.has_role(auth.uid(), 'operador'))
    OR (
      kind = 'faqs'
      AND (
        public.has_role(auth.uid(), 'operador')
        OR public.has_role(auth.uid(), 'mestre')
      )
    )
  )
)
WITH CHECK (
  public.password_change_completed(auth.uid())
  AND (
    public.has_role(auth.uid(), 'mestre')
    OR (owner_id = auth.uid() AND kind NOT IN ('config', 'faqs'))
    OR (kind = 'tickets' AND public.has_role(auth.uid(), 'operador'))
    OR (
      kind = 'faqs'
      AND (
        public.has_role(auth.uid(), 'operador')
        OR public.has_role(auth.uid(), 'mestre')
      )
    )
  )
);

DROP POLICY IF EXISTS records_delete ON public.app_records;
CREATE POLICY records_delete
ON public.app_records
FOR DELETE
TO authenticated
USING (
  public.password_change_completed(auth.uid())
  AND (
    public.has_role(auth.uid(), 'mestre')
    OR (owner_id = auth.uid() AND kind NOT IN ('config', 'faqs'))
    OR (
      kind = 'faqs'
      AND (
        public.has_role(auth.uid(), 'operador')
        OR public.has_role(auth.uid(), 'mestre')
      )
    )
  )
);
