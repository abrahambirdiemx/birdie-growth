# 🤖 Autopilot — Plan de Trabajo y Estado Actual
**Última actualización:** Sesión del 25 Abr 2026

---

## ✅ Credenciales Conseguidas y Configuradas en n8n

| Credential | Tipo en n8n | Valor/Status |
|---|---|---|
| **Hunter API** | HTTP Query Auth (api_key) | `efee88633f610ce7b47f7f495da22b41bea2b685` ✅ |
| **Google Sheets** | Google Sheets OAuth2 | Autorizada con abraham@birdie.mx ✅ |
| **Gmail account** | Gmail OAuth2 | Autorizada con abraham@birdie.mx ✅ |
| **Claude API** | HTTP Header Auth (x-api-key) | Anthropic key configurada ✅ |
| **Gemini API** | HTTP Query Auth (key) | Google AI Studio key ✅ |
| **Calendly URL** | — | ⚠️ PENDIENTE obtener URL real |
| **Pipedrive** | — | ⏳ Opcional, para después |

---

## 📊 Google Sheet

- **File:** MX Imports 1-10,000K  
- **Sheet ID:** `1xq8IMuFZoMO3YkdTneirIPQ6VqvaAxKRN8H24BhN_AE`
- **n8n Cloud version:** 2.17.7

**Tab Empresas — columnas reales (¡IMPORTANTE - difieren del diseño original!):**
```
Empresa ID | Nombre | Web | Envíos | sector | estado_Empresa | Contactos_encontrados | fecha_procesado | Notas
```

**Tab Contactos — columnas creadas por nosotros:**
```
contacto_id | empresa_id | empresa | nombre | cargo | tipo_contacto | email | telefono | 
linkedin | estado | investigacion | pain_point | contexto_email | email_subject | 
email_generado | fecha_envio | tokens_claude | clasificacion_respuesta | fecha_respuesta | notas
```

**Estados del pipeline automatizado:**
`nuevo` → `en_proceso` → `enriquecido` → `enviado` → `calendly_enviado` → `demo_agendada`  
`sin_dominio` = sin web, investigar manualmente  
`error` = no encontró contactos en Hunter

---

## 📁 Archivos de Workflows (en carpeta outputs)

| Archivo | Estado | Usar |
|---|---|---|
| `agent1_hunter_v2.json` | ✅ NUEVO - listo para importar | **Este es el que funciona** |
| `agent1_hunter_prospecting.json` | ❌ Tiene bugs de compatibilidad | NO usar |
| `agent2_gemini_research.json` | ⚠️ Revisar column names | Necesita ajuste |
| `agent3_dual_email_writer.json` | ⚠️ Revisar | Necesita prueba |
| `agent4_followup_classifier.json` | ⚠️ Revisar | Necesita prueba |
| `birdie_pipeline_addon_v3.json` | ⏳ Para después | Follow-up + Pipedrive |

---

## 🔴 Problema Principal Resuelto para Mañana

**Problema:** Code nodes importados desde JSON daban error "A 'json' property isn't an object" en n8n 2.17.7.

**Causa:** Incompatibilidad del JSON generado con la versión exacta de n8n Cloud.

**Solución aplicada en `agent1_hunter_v2.json`:**
- Eliminados los Code nodes al inicio del workflow
- Reemplazados por nodos IF y Set nativos de n8n
- Solo UN Code node al final (procesar respuesta de Hunter) - inevitable
- Sheet ID y Hunter API key ya pre-llenados en el JSON

---

## 📋 Plan de Trabajo Mañana — Orden Exacto

### BLOQUE 1 (30 min) — Importar Agent 1 v2

1. En n8n → **New workflow → ··· → Import from file**
2. Importa: `agent1_hunter_v2.json` (está en tu carpeta outputs)
3. El Sheet ID y Hunter key ya están pre-llenados ✅
4. Solo asigna credentials en los nodos Google Sheets:
   - Haz clic en cada nodo rojo de Google Sheets → Credential → `Google Sheets`
5. Ejecuta con 2-3 empresas con `estado_Empresa = nuevo` y `Web` con dominio real
6. Verifica que la tab Contactos se llena con los contactos encontrados

### BLOQUE 2 (45 min) — Probar Agent 1 con datos reales

1. Pon 10 empresas de tu base con dominios en el Sheet (estado_Empresa = nuevo)
2. Empresas sin dominio: déjalas con Web vacío — el workflow las marcará `sin_dominio`
3. Ejecuta y verifica:
   - ✅ Tab Contactos tiene filas nuevas con emails
   - ✅ Tab Empresas muestra `enriquecido` o `sin_dominio`
   - ✅ Cada empresa tiene hasta 2 DMs + 3 referidores

### BLOQUE 3 (1h) — Importar Agent 2 (Gemini)

1. Importa `agent2_gemini_research.json`
2. Ajustar filtros para usar column name correcto: `estado` = `nuevo` (tab Contactos)
3. Asignar credential Gemini API
4. Probar con 3-4 contactos que ya tienen email

### BLOQUE 4 (1h) — Importar Agents 3 y 4

1. Importa `agent3_dual_email_writer.json` (emails DM vs referidor)
2. Importa `agent4_followup_classifier.json` (clasificación respuestas)
3. Necesitas URL de Calendly antes de activar Agent 4
4. Probar Agent 3 con 2 contactos (1 DM + 1 referidor) - revisar email generado antes de enviar

### BLOQUE 5 (30 min) — Activar pipeline completo

1. Activar Agent 1 (corre diario 7:30am)
2. Activar Agent 2 (corre cada 2h)
3. Activar Agent 3 (cada 30 min, pero SOLO después de revisar calidad de emails)
4. Activar Agent 4 (cada 4h)

---

## ⚠️ Pendientes Críticos para Mañana

1. **Calendly URL** — obtener URL real del booking (la necesita Agent 4 para responder interesados)
2. **Revisar calidad emails** — Agents 3+4 NO activar automáticamente hasta revisar 5-10 emails generados
3. **Probar respuesta inbox** — simular una respuesta de prospecto para verificar Agent 4

---

## 🔑 Datos de Infraestructura

```
Supabase URL: https://xjrgqborwhvyqgrczetq.supabase.co
SB_ANON: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcmdxYm9yd2h2eXFncmN6ZXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODc5ODksImV4cCI6MjA5MDQ2Mzk4OX0.DWOoshMXxmQk0deq2jEnOOAFpr_pyE9aWenvu_GPzLs
BIRDIE_AGENT_KEY: f42bf187c54c933fbb4ac6ce0d460a6b4b63f2c76d226ba3992ecdc2f349d75c
BIRDIE_AGENT_URL: https://xjrgqborwhvyqgrczetq.supabase.co/functions/v1/agent-api
Dashboard: https://abrahambirdiemx.github.io/birdie-growth/
```

---

## 💡 Tips para Mañana

- **Si un nodo Google Sheets da error de sheetName:** Siempre configura Credential primero → luego Document → luego Sheet. Ese orden es obligatorio en n8n.
- **Si Code node da "json property isn't an object":** No usar ese JSON — usar siempre la versión v2.
- **Columna Web del Sheet:** debe tener solo el dominio, sin https:// ni www. El workflow lo limpia pero mejor tenerlo limpio.
- **Para ver qué encontró Hunter:** Haz clic en nodo "Code - Score Contacts" → pestaña Output → verás los contactos con email, cargo y tipo.
- **Hunter free tier:** 25 domain searches/month. Si necesitas más, upgrade a $34/mo.

