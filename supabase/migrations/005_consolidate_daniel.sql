-- Migration 005: Consolidate owner name "Daniel" → "Daniel Luna"
-- Some pipeline records were saved with just "Daniel" before the full name was standardized.

UPDATE public.pipeline
SET owner = 'Daniel Luna', updated_at = NOW()
WHERE owner = 'Daniel';

UPDATE public.crm
SET r = 'Daniel Luna'
WHERE r = 'Daniel';

UPDATE public.companies
SET owner = 'Daniel Luna', updated_at = NOW()
WHERE owner = 'Daniel';

-- Verify
SELECT owner, COUNT(*) AS total
FROM public.pipeline
WHERE owner ILIKE 'daniel%'
GROUP BY owner
ORDER BY owner;
