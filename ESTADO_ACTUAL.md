# 🔴 Estado del Sistema — Pausado para revisión
**Fecha:** 26 Abr 2026 — Fin de sesión

---

## ✅ Lo que está funcionando

- **Arquitectura unificada**: companies + contacts + deals en Supabase
- **Dashboard**: Pipeline, CRM (con datos), Autopilot con Jim/Dwight/Michael/Pepper/Pam
- **Pepper**: detecta respuestas y registra en Supabase (companies + contacts + deals)
- **Pam**: lee de deals (Cool Off/Calificado), envía nurturing/reactivación
- **Pipeline delete**: botón ✕ por fila operativo
- **Status unificado**: CRM usa etapas del Pipeline
- **3 contactos por cuenta en CRM modal**

---

## 🔴 Errores a corregir mañana

### 1. Michael manda el mismo email repetido cada 30 min
**Causa**: el nodo "Update Contactos Enviado" en Google Sheets falla silenciosamente
(mismo bug de siempre: Update nodes de Sheets no pasan datos al siguiente nodo)
**Fix**: Cambiar el Update node a "Always Output Data" O cambiar el estado a enviado
directamente en el nodo Gmail Send usando una expresión en el body
**Acción**: verificar que estado cambia a `enviado` después del envío

### 2. Estado_empresa no cambia a enriquecido en Jim
**Causa**: El nodo "Update Empresas - Enriquecido" en Agent 1 v3 falla
(mismo problema de Google Sheets Update nodes vacíos)
**Fix**: Activar "Always Output Data" en ese nodo O reemplazar con HTTP Request
a Supabase companies (actualizar campo `estado` en companies table)
**Nota**: La tabla companies tiene columna `estado` (texto), Jim debería hacer
PATCH a companies?id=eq.{company_id} con {estado: 'enriquecido'}

### 3. CRM aparece vacío en el dashboard
**Causa**: pendiente diagnosticar — los datos SÍ están en Supabase (1,329 empresas)
pero el dashboard no los muestra
**Fix pendiente**: revisar console.log en browser para ver qué devuelve _crmData
Posible causa: max_rows=1000 en PostgREST cortando la query, o error en el mapping

---

## 📋 Cambios de schedule pendientes en n8n

| Agente | Schedule actual | Schedule correcto |
|--------|----------------|-------------------|
| Michael (Agent 3) | cada 30 min | diario 12:00pm |
| Dwight (Agent 2) | cada 2h | cada 4h |
| Jim (Agent 1) | 7:30am diario | ✅ correcto |
| Pepper (Agent 4) | cada 4h | ✅ correcto |
| Pam (Agent 5) | Lun/Mié/Vie 9am | ✅ correcto |

---

## 🔧 Agentes — Estado recomendado esta noche

- **Jim**: PAUSADO (estado_empresa no actualiza)
- **Dwight**: PAUSADO (depende de Jim)
- **Michael**: PAUSADO (manda emails repetidos)
- **Pepper**: puede quedar activo (solo responde, no genera spam)
- **Pam**: PAUSADO (necesita contactos reales en Supabase)

---

## 📁 Archivos en el repo

```
agent1_hunter_v3.json     ← usar este para Jim (Google Sheets)
agent2_gemini_v2.json     ← usar este para Dwight (Google Sheets)
agent3_michael_v3.json    ← Michael actualizado (pero tiene bug Update)
agent4_followup_classifier.json ← Pepper (funcionando)
agent5_pam_v2.json        ← Pam v2 (solo Supabase, listo)
migration_unified_architecture.sql ← ya ejecutado ✅
```

---

## 🎯 Plan para mañana

1. **Fix Jim**: cambiar Update Empresas a PATCH en Supabase (companies.estado)
2. **Fix Michael**: activar "Always Output Data" en Update Contactos + cambiar schedule a 12pm
3. **Fix CRM vacío**: debug console.log, posiblemente ajustar la query o el mapping
4. **Activar agentes** uno por uno después de verificar cada fix
5. **Construir agente orquestador** (reporte semanal + alertas)

