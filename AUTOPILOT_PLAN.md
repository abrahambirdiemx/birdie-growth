# 🤖 Autopilot — Estado y Plan de Trabajo
**Última actualización:** 25 Abr 2026 — Hackathon Day 1 completo

---

## ✅ Credenciales Configuradas en n8n

| Credential | Tipo | Status |
|---|---|---|
| Hunter API | HTTP Query Auth (api_key) | ✅ `efee88633f610ce7b47f7f495da22b41bea2b685` |
| Google Sheets | OAuth2 abraham@birdie.mx | ✅ |
| Gmail account | OAuth2 abraham@birdie.mx | ✅ |
| Claude API | HTTP Header Auth (x-api-key) | ✅ |
| Gemini API | HTTP Query Auth (key) | ✅ |
| Calendly URL | — | ⚠️ PENDIENTE |
| Pipedrive | — | ⏳ Opcional |

---

## 📊 Google Sheet

- **ID:** `1xq8IMuFZoMO3YkdTneirIPQ6VqvaAxKRN8H24BhN_AE`
- **n8n version:** 2.17.7 Cloud

### Columnas EXACTAS tab Empresas (MINÚSCULAS — crítico):
```
empresa_id | nombre | web | volumen_contenedores | sector | estado_empresa | contactos_encontrados | fecha_procesado | notas
```

### Columnas tab Contactos:
```
contacto_id | empresa_id | empresa | nombre | cargo | tipo_contacto | email | telefono |
linkedin | estado | investigacion | pain_point | contexto_email | email_subject |
email_generado | fecha_envio | tokens_claude | clasificacion_respuesta | fecha_respuesta | notas
```

### Estados pipeline:
`nuevo → investigado → enviado → calendly_enviado → demo_agendada`
`sin_dominio` = sin web | `error` = Hunter no encontró nada

---

## 📁 Archivos n8n — USAR ESTOS (versiones más recientes)

| Archivo | Status | Descripción |
|---|---|---|
| **`agent1_hunter_v3.json`** | ✅ USAR ESTE | Bug fixes: empresa_id recovery, markdown hyperlinks, lowercase columns |
| **`agent2_gemini_v2.json`** | ✅ USAR ESTE | Bug fixes: lowercase columns, runOnceForAllItems |
| **`agent3_v2.json`** | ✅ USAR ESTE | Dual email DM/Referidor, bug fixes |
| `agent4_followup_classifier.json` | ⚠️ Pendiente probar | Clasificación respuestas + Calendly |
| `birdie_pipeline_addon_v3.json` | ⏳ Para después | Follow-up 5 días + Pipedrive |

**NO usar:** agent1_hunter_v2.json, agent1_hunter_prospecting.json, agent1_company_prospecting.json (versiones viejas con bugs)

---

## 🐛 Bugs Resueltos (documentados para futura referencia)

### Bug 1: empresa_id/nombre se pierden después de HTTP Request
**Causa:** HTTP Request reemplaza el input con la respuesta de la API.
**Fix aplicado:** Code node usa `$('IF - Has Web').all()[0].json` para recuperar datos originales.

### Bug 2: Columnas con nombre incorrecto
**Causa:** Datos originales Panjiva tenían "Nombre", "Web", "Envíos" (mayúsculas/tildes). Excel nuevo tiene minúsculas.
**Fix:** Todos los workflows usan `$json['web']`, `$json['nombre']`, `$json['empresa_id']`, etc.

### Bug 3: Google Sheets convierte dominios a hipervínculos
**Causa:** Al pegar dominios, Sheets los convierte a links. n8n los lee como `[deere.com](http://deere.com)`.
**Fix:** Expresión en Hunter URL extrae dominio con regex: `md.match(/\[([^\]]+)\]\([^)]*\)/)`

### Bug 4: Code nodes deben ser "Run Once for All Items"
**Causa:** n8n 2.17.7 tiene incompatibilidad con "Run Once for Each Item" después de HTTP Request.
**Fix:** Todos los Code nodes usan `mode: runOnceForAllItems`.

### Bug 5: Google Sheets Update corta el flujo
**Causa:** Nodos Update no pasan datos al siguiente nodo (output vacío).
**Fix:** Eliminar Update intermedios del flujo principal. Solo mantener Append Contactos.

### Bug 6: Hunter no encuentra contactos en empresas grandes
**Causa:** UPS, FedEx, Apple, John Deere = corporaciones que no listan emails públicamente.
**Fix:** Usar prospectos curados (`prospectos_birdie_curados.xlsx`) — score ≥50 son los mejores.

---

## 📋 Plan de Trabajo — Próxima Sesión

### PASO 1 (30 min): Importar Agent 1 v3
1. En n8n → eliminar el workflow viejo de Agent 1
2. New workflow → Import → `agent1_hunter_v3.json`
3. Asignar credential `Google Sheets` en los nodos rojos (solo Sheets Read y Append)
4. El Hunter ya tiene API key en la URL, no necesita credential separada
5. Deshabilitar nodo Supabase Log (ya viene deshabilitado)

### PASO 2 (20 min): Cargar prospectos curados al Sheet
1. Abrir `prospectos_birdie_curados.xlsx`
2. Copiar tab "Mejores_Prospectos_Birdie" al Sheet de Empresas
3. **Importante:** Pegar como valores (no fórmulas, no formato) para evitar hipervínculos
4. Verificar que columna `web` quede como texto plano (ej: `codiqindsa.com.mx`)

### PASO 3 (30 min): Test con 5 prospectos medianos
Usar estas empresas que son ideales para Birdie:
- `codiqindsa.com.mx` — Consorcio Distribuidor Quimico Industrial (699 env)
- `sisamex.com.mx` — Sistemas Automotrices De Mexico (1,957 env)
- `amissa.com.mx` — Aleaciones Y Metales Industriales De Saltillo (525 env)
- `rheem.com.mx` — Industrias Rheem (3,051 env)
- `ragasa.com.mx` — Ragasa Industrias (665 env)

Pon solo esas 5 con `estado_empresa = nuevo`, ejecuta Agent 1, verifica Contactos.

### PASO 4 (45 min): Importar y probar Agents 2 y 3
Si Agent 1 funciona y escribe contactos:
1. Import `agent2_gemini_v2.json` → asignar Gemini API credential → probar con 3 contactos
2. Import `agent3_v2.json` → asignar Claude API y Gmail → revisar email generado ANTES de enviar
3. Solo activar envío automático después de revisar calidad

### PASO 5: Calendly
Necesitas la URL real de tu Calendly booking (ej: `calendly.com/abraham-birdie/discovery`) para activar Agent 4.

---

## 💡 Insights del Hackathon Day 1

**Lo que aprendimos:**
- n8n 2.17.7 tiene quirks importantes con Code nodes — siempre "Run Once for All Items"
- Google Sheets Update nodes no pasan datos — eliminarlos del flujo principal
- Hunter funciona bien con medianas empresas mexicanas (.com.mx), mal con corporaciones globales
- El 36.9% de las 10,000 empresas tienen URL — 902 son top tier para Birdie

**Los mejores prospectos para Birdie son:**
- Manufactura/industria química mexicana: `codiqindsa.com.mx`, `ragasa.com.mx`, `amissa.com.mx`
- Automotriz mid-size: `sisamex.com.mx`, `lodi.com.mx`
- Textil/hogar: `vianney.com.mx`
- Industrial: `vallen.com.mx`, `napasa.com.mx`, `sumitool.mx`

**Lo que NO funciona bien con Hunter:**
- Carriers (DHL, FedEx, UPS, Redpack)
- Retailers (Walmart, Coppel, Liverpool)
- MNCs con .com global (Apple, Deere, Siemens)

---

## 🔑 Datos de Infraestructura

```
Supabase URL: https://xjrgqborwhvyqgrczetq.supabase.co
SB_ANON: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcmdxYm9yd2h2eXFncmN6ZXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODc5ODksImV4cCI6MjA5MDQ2Mzk4OX0.DWOoshMXxmQk0deq2jEnOOAFpr_pyE9aWenvu_GPzLs
BIRDIE_AGENT_KEY: f42bf187c54c933fbb4ac6ce0d460a6b4b63f2c76d226ba3992ecdc2f349d75c
BIRDIE_AGENT_URL: https://xjrgqborwhvyqgrczetq.supabase.co/functions/v1/agent-api
Google Sheet ID: 1xq8IMuFZoMO3YkdTneirIPQ6VqvaAxKRN8H24BhN_AE
Hunter API Key: efee88633f610ce7b47f7f495da22b41bea2b685
Dashboard: https://abrahambirdiemx.github.io/birdie-growth/
```
