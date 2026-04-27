-- ══════════════════════════════════════════════════════════════════════
-- BIRDIE UNIFIED ARCHITECTURE MIGRATION
-- Run in Supabase SQL Editor in ORDER
-- ══════════════════════════════════════════════════════════════════════

-- ── STEP 1: Create new unified tables ──────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text        NOT NULL,
  web           text,
  industria     text,
  canal         text,
  tamaño        text,
  owner         text,
  fuente        text        DEFAULT 'Manual',  -- Manual/Autopilot/CRM/Pipeline
  estado        text        DEFAULT 'activo',  -- activo/inactivo
  notas         text,
  mrr           numeric     DEFAULT 0,
  acv           numeric     DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid        REFERENCES companies(id) ON DELETE CASCADE,
  nombre                  text,
  cargo                   text,
  tipo_contacto           text        DEFAULT 'otro',
  email                   text,
  telefono                text,
  linkedin                text,
  estado                  text        DEFAULT 'nuevo',
  investigacion           text,
  pain_point              text,
  contexto_email          text,
  email_subject           text,
  email_generado          text,
  fecha_envio             date,
  tokens_claude           text,
  clasificacion_respuesta text,
  fecha_respuesta         date,
  notas                   text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        REFERENCES companies(id) ON DELETE SET NULL,
  opportunity_name  text,
  status            text        DEFAULT 'Calificado',
  mrr               numeric     DEFAULT 0,
  acv               numeric     DEFAULT 0,
  implementaciones  numeric     DEFAULT 0,
  probability       integer     DEFAULT 50,
  owner             text,
  estrategia        text,
  size              text,
  ingreso_lead      date,
  discovery_date    date,
  demo_date         date,
  proposal_date     date,
  cierre_date       date,
  next_touchpoint   date,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ── STEP 2: Indexes for performance ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_estado ON contacts(estado);
CREATE INDEX IF NOT EXISTS idx_deals_company_id ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner);
CREATE INDEX IF NOT EXISTS idx_companies_nombre ON companies(nombre);

-- ── STEP 3: RLS ───────────────────────────────────────────────────────

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_companies" ON companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_contacts"  ON contacts  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_deals"     ON deals     FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── STEP 4: Enable Realtime ───────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE companies;
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE deals;

-- ── STEP 5: Migrate data from CRM → companies + contacts ─────────────

-- 5a: Insert companies from CRM
INSERT INTO companies (nombre, industria, canal, owner, fuente, mrr, acv)
SELECT DISTINCT ON (n)
  n, ind, e, r, 'CRM',
  COALESCE(NULLIF(regexp_replace(mrr::text, '[^0-9.]', '', 'g'), ''), '0')::numeric,
  COALESCE(NULLIF(regexp_replace(acv::text, '[^0-9.]', '', 'g'), ''), '0')::numeric
FROM crm
WHERE n IS NOT NULL AND n != ''
ON CONFLICT DO NOTHING;

-- 5b: Insert contacts from CRM (where there's a contact person)
INSERT INTO contacts (company_id, nombre, cargo, email, telefono, tipo_contacto, estado)
SELECT
  comp.id,
  crm.c,
  crm.p,
  crm.em,
  crm.tel,
  'otro',
  'enviado'
FROM crm
JOIN companies comp ON lower(trim(comp.nombre)) = lower(trim(crm.n))
WHERE (crm.c IS NOT NULL AND crm.c != '')
   OR (crm.em IS NOT NULL AND crm.em != '');

-- ── STEP 6: Migrate pipeline → companies + deals ──────────────────────

-- 6a: Add companies from pipeline that aren't in CRM
INSERT INTO companies (nombre, canal, owner, fuente)
SELECT DISTINCT
  p.opportunity_name,
  p.estrategia,
  p.owner,
  'Pipeline'
FROM pipeline p
WHERE p.opportunity_name IS NOT NULL
  AND lower(trim(p.opportunity_name)) NOT IN (
    SELECT lower(trim(nombre)) FROM companies
  );

-- 6b: Insert deals with company_id
INSERT INTO deals (
  company_id, opportunity_name, status, mrr, acv, implementaciones,
  probability, owner, estrategia, size, ingreso_lead, discovery_date,
  demo_date, proposal_date, cierre_date, next_touchpoint, notes
)
SELECT
  comp.id,
  p.opportunity_name,
  p.status,
  COALESCE(p.mrr, 0),
  COALESCE(p.acv, 0),
  COALESCE(p.implementaciones, 0),
  COALESCE(p.probability, 50),
  p.owner,
  p.estrategia,
  p.size,
  p.ingreso_lead::date,
  p.discovery_date::date,
  p.demo_date::date,
  p.proposal_date::date,
  p.cierre_date::date,
  p.next_touchpoint::date,
  p.notes
FROM pipeline p
JOIN companies comp ON lower(trim(comp.nombre)) = lower(trim(p.opportunity_name));

-- ── STEP 7: Verify migration ──────────────────────────────────────────

SELECT
  (SELECT count(*) FROM companies) AS total_companies,
  (SELECT count(*) FROM contacts)  AS total_contacts,
  (SELECT count(*) FROM deals)     AS total_deals,
  (SELECT count(*) FROM pipeline)  AS original_pipeline,
  (SELECT count(*) FROM crm)       AS original_crm;

-- Expected: total_companies >= (crm + pipeline unique names)
-- Expected: total_deals ≈ pipeline count
-- Expected: total_contacts ≈ crm records with contact info

