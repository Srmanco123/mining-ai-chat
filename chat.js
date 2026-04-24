// ============================================================
//  chat.js  —  Lógica de chat, historial, llamadas a Claude
//  Versión 3.1 — Contexto condicional + umbrales dinámicos + temperature=0
// ============================================================

const ChatManager = {
  historial: [],         // últimas 10 interacciones (chat libre, antes 6)
  contextoURL: "",
  modoPresentacion: false,

  // ── MEMORIA DE CONSULTAS ──────────────────────────────────
  // Guarda las últimas consultas del usuario para poder
  // referenciarlas con "repite esto para Zona X"
  _consultasRecientes: [],   // [ { nombre, prompt, respuesta } ]
  _ultimaConsulta: null,     // { nombre, prompt, respuesta }

  _guardarConsulta(prompt, respuesta) {
    const entrada = {
      nombre: this._generarNombreConsulta(prompt),
      prompt,
      respuesta,
      timestamp: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    };
    this._ultimaConsulta = entrada;
    this._consultasRecientes.unshift(entrada);
    if (this._consultasRecientes.length > 10) this._consultasRecientes.pop();
    return entrada;
  },

  _generarNombreConsulta(prompt) {
    // Genera un nombre corto legible a partir del prompt
    const texto = prompt.trim().replace(/\n/g, " ");
    if (texto.length <= 40) return texto;
    return texto.substring(0, 37) + "…";
  },

  // ── INIT ─────────────────────────────────────────────────
  init(contextoURL) {
    this.contextoURL = contextoURL;
  },

  // ── SYSTEM PROMPT BASE (chat libre) ──────────────────────
  // Acepta el prompt del usuario para que buildContexto() pueda
  // decidir si incluir RAW data (solo si menciona una cámara).
  buildSystemPrompt(promptUsuario = "") {
    return `Eres un experto en ingeniería minera especializado en reconciliación de cámaras subterráneas de Sandfire MATSA.
Responde siempre en español técnico para ingenieros senior de minería.
Sé conciso. Máximo 200 palabras de texto por respuesta. El detalle va en los drill-downs.

REGLAS DE CÁLCULO OBLIGATORIAS:
- Dilución = MIN(1, MAX(0, Sobrexcavacion_tn / PVt)) — recalcula siempre desde datos brutos
- Recuperación = MIN(1, MAX(0, 1 - Subexcavacion_tn / PVt)) — recalcula siempre desde datos brutos
- Al agregar usa suma(Sobrexcavacion_tn) / suma(PVt) ponderado por volumen
- Indica siempre cuántas cámaras respaldan cada afirmación
- Valores siempre entre 0% y 100%
- Escribe siempre "dilución ponderada" y "recuperación ponderada", nunca "media" ni "promedio" a secas
- Outliers: usa SIEMPRE los umbrales P25/P75 dinámicos del dataset que figuran en la sección UMBRALES DE ALERTA

Contexto Power BI activo: ${this.contextoURL}
${DataManager.buildContexto(this.contextoURL, promptUsuario)}

DETECCIÓN DE AMBIGÜEDAD:
Si la petición es ambigua, devuelve SOLO:
CLARIFY_START
{"pregunta": "¿Qué quieres exactamente?", "opciones": ["opcion1", "opcion2", "opcion3", "opcion4"]}
CLARIFY_END

REGLAS DE GRÁFICAS:
Gráficas simples (bar, line, pie, doughnut) → Chart.js:
CHART_JSON_START
{"type":"bar","data":{"labels":[...],"datasets":[{"label":"...","data":[...],"backgroundColor":"#E8401C"}]},"options":{"responsive":true,"plugins":{"title":{"display":true,"text":"..."}}}}
CHART_JSON_END

Gráficas avanzadas (boxplot, violin, heatmap, distribución) → Plotly:
PLOTLY_JSON_START
{"data":[{"type":"box","y":[...],"name":"..."}],"layout":{"title":"..."}}
PLOTLY_JSON_END

RESTRICCIONES GRÁFICAS:
- Chart.js: solo bar, line, scatter, pie, doughnut — NUNCA boxplot ni violin
- Plotly: box, violin, histogram, heatmap, scatter — JSON válido sin funciones JS
- backgroundColor en Chart.js: string o array de strings, NUNCA función
- Máximo 15 etiquetas en eje X

MEMORIA DE CONSULTA:
Al final de CADA respuesta añade siempre este bloque con 3 sugerencias de seguimiento
contextuales (basadas en los datos reales, no genéricas):
SUGGESTIONS_START
["sugerencia contextual 1", "sugerencia contextual 2", "sugerencia contextual 3"]
SUGGESTIONS_END`;
  },

  // ── PROMPTS PLANTILLADOS — 8 ACCIONES RÁPIDAS ────────────
  // Cada acción tiene su propio prompt con estructura fija.
  // Claude rellena los huecos pero NO puede cambiar la estructura.
  _promptAccion(id) {
    // Para las acciones rápidas NO hay prompt de usuario, así que el contexto
    // nunca incluirá RAW data (lo cual es lo deseado — se usan solo stats).
    const ctx = DataManager.buildContexto(this.contextoURL, "");

    // Umbrales dinámicos para mostrar en la plantilla de alertas
    const u = DataManager.umbralesDinamicos
      ? DataManager.umbralesDinamicos()
      : {
          dilucion_alta:     CONFIG.ALERTAS?.dilucion_alta     || 0.30,
          recuperacion_baja: CONFIG.ALERTAS?.recuperacion_baja || 0.80,
          dilucion_media:    CONFIG.ALERTAS?.dilucion_media    || 0.20,
          recuperacion_media:CONFIG.ALERTAS?.recuperacion_media|| 0.88
        };
    const UmbDilAlta  = (u.dilucion_alta      * 100).toFixed(1);
    const UmbRecBaja  = (u.recuperacion_baja  * 100).toFixed(1);
    const UmbDilMed   = (u.dilucion_media     * 100).toFixed(1);
    const UmbRecMed   = (u.recuperacion_media * 100).toFixed(1);

    const plantillas = {

      // ── 1. RESUMEN EJECUTIVO ────────────────────────────
      resumen: `Analiza el dataset y responde EXACTAMENTE en este formato. No añadas ni quites secciones. No escribas texto fuera de las secciones marcadas.

## 📊 Resumen Ejecutivo
**Dataset:** [N cámaras] | [minas presentes] | Período: [fecha_min] – [fecha_max]

## Métricas Globales
| Métrica | Valor | N cámaras |
|---------|-------|-----------|
| Dilución ponderada | X.X% | N |
| Recuperación ponderada | X.X% | N |
| Outliers dilución (>P75) | N | — |
| Outliers recuperación (<P25) | N | — |

## Por Zona (todas las zonas, ordenadas por PVt descendente)
| Zona | Dil% | Rec% | Cámaras | PVt (t) | Estado |
|------|------|------|---------|---------|--------|
[una fila por zona — Estado: ✅ Normal / ⚠️ Atención / 🔴 Crítico]

## Por Mina
| Mina | Dil% | Rec% | Cámaras | PVt (t) | Estado |
|------|------|------|---------|---------|--------|
[una fila por mina — Estado: ✅ Normal / ⚠️ Atención / 🔴 Crítico]

## ⚠️ Alertas Críticas
[lista de máx. 5 cámaras: · ID [Mina/Zona] — Dil: X% | Rec: X%]
[Si no hay alertas escribe: · Sin alertas críticas en el dataset actual]

## 💡 Recomendaciones
1. [acción concreta con zona/cámara específica]
2. [acción concreta con zona/cámara específica]
3. [acción concreta si procede]

PLOTLY_JSON_START
{"data":[SUSTITUYE_AQUI_UN_TRACE_POR_CAMARA],"layout":{"title":"Dispersión Dilución vs Recuperación por Cámara","xaxis":{"title":"Recuperación (%)","range":[0,100]},"yaxis":{"title":"Dilución (%)","range":[0,100]},"height":320,"margin":{"t":40,"b":50,"l":50,"r":20}}}
PLOTLY_JSON_END

INSTRUCCIÓN GRÁFICA 1 — Scatter por cámara:
Genera el bloque PLOTLY_JSON_START/END con un scatter plot donde:
- Cada punto = una cámara individual
- x = recuperación de esa cámara * 100
- y = dilución de esa cámara * 100
- marker.color: "#E8401C" si dil>P75 o rec<P25, "#2C1810" si ambas, "#7a7a7a" si normal
- marker.size: proporcional a PVt (min 5, max 18) — usa Math.sqrt(pvt/max_pvt)*13+5
- text: ID de cámara (para hover)
- mode: "markers"
- type: "scatter"
JSON válido, sin funciones JS, arrays reales con los datos calculados.

CHART_JSON_START
{"type":"bar","data":{"labels":["zona1","zona2"],"datasets":[{"label":"Dilución (%)","data":[X,X],"backgroundColor":"#E8401C"},{"label":"Recuperación (%)","data":[X,X],"backgroundColor":"#2C1810"}]},"options":{"responsive":true,"plugins":{"title":{"display":true,"text":"Dilución y Recuperación por Zona (%)"}},"scales":{"y":{"beginAtZero":true,"max":100}}}}
CHART_JSON_END

INSTRUCCIÓN GRÁFICA 2 — Barras por zona:
Sustituye labels y data con los valores reales ponderados por zona.
Barras agrupadas: dilución en #E8401C, recuperación en #2C1810.

CHART_JSON_START
{"type":"bar","data":{"labels":["mina1","mina2"],"datasets":[{"label":"Dilución (%)","data":[X,X],"backgroundColor":"#E8401C"},{"label":"Recuperación (%)","data":[X,X],"backgroundColor":"#2C1810"}]},"options":{"responsive":true,"plugins":{"title":{"display":true,"text":"Dilución y Recuperación por Mina (%)"}},"scales":{"y":{"beginAtZero":true,"max":100}}}}
CHART_JSON_END

INSTRUCCIÓN GRÁFICA 3 — Barras por mina:
Sustituye labels y data con los valores reales ponderados por mina.

SUGGESTIONS_START
[3 sugerencias contextuales basadas en los hallazgos concretos — menciona zonas o cámaras reales]
SUGGESTIONS_END

Datos disponibles:
${ctx}`,

      // ── 2. ALERTAS AUTOMÁTICAS ──────────────────────────
      alertas: `Analiza el dataset y responde EXACTAMENTE en este formato. No añadas ni quites secciones.

## ⚠️ Alertas Automáticas — Dataset Actual

## 🔴 Críticas (dilución > ${UmbDilAlta}% O recuperación < ${UmbRecBaja}%)
[tabla con columnas: ID cámara | Mina | Zona | Dil% | Rec% | Problema]
[máx. 10 filas ordenadas por gravedad — si no hay, escribe: Sin alertas críticas]

## 🟡 Intermedias (dilución > ${UmbDilMed}% O recuperación < ${UmbRecMed}%)
[tabla con columnas: ID cámara | Mina | Zona | Dil% | Rec% | Problema]
[máx. 5 filas — si no hay, escribe: Sin alertas intermedias]

## 📊 Resumen por Mina
| Mina | Críticas | Intermedias | Total cámaras |
|------|----------|-------------|---------------|
[una fila por mina]

## Patrón Detectado
[1-2 frases: ¿hay una zona o período que concentre las alertas?]

CHART_JSON_START
[Gráfico de barras apiladas: críticas vs intermedias por mina — críticas en #E8401C, intermedias en #F5A623]
CHART_JSON_END

SUGGESTIONS_START
[3 sugerencias contextuales — nombra zonas o cámaras concretas de las alertas]
SUGGESTIONS_END

Datos disponibles:
${ctx}`,

      // ── 3. COMPARAR ZONAS ───────────────────────────────
      comparar: `Analiza el dataset y responde EXACTAMENTE en este formato. No añadas ni quites secciones.

## 🔍 Comparativa entre Zonas

## Ranking por Dilución Ponderada (menor a mayor)
| Pos | Zona | Dil% | Rec% | PVt total | N cámaras |
|-----|------|------|------|-----------|-----------|
[una fila por zona, ordenadas dilución ascendente]

## Ranking por Recuperación Ponderada (mayor a menor)
| Pos | Zona | Rec% | Dil% | PVt total | N cámaras |
|-----|------|------|------|-----------|-----------|
[una fila por zona, ordenadas recuperación descendente]

## Mejor y Peor Zona
- **Mejor zona global:** [nombre] — Dil: X% | Rec: X% ([N] cámaras)
- **Peor zona global:** [nombre] — Dil: X% | Rec: X% ([N] cámaras)
- **Mayor variabilidad:** [nombre] — rango dilución [min%–max%]

CHART_JSON_START
[Gráfico de barras agrupadas: dilución y recuperación ponderada por zona — barras de dilución en #E8401C, recuperación en #2C1810]
CHART_JSON_END

SUGGESTIONS_START
[3 sugerencias contextuales — menciona la zona peor y la más variable]
SUGGESTIONS_END

Datos disponibles:
${ctx}`,

      // ── 4. EVOLUCIÓN TEMPORAL ───────────────────────────
      evolucion: `Analiza el dataset y responde EXACTAMENTE en este formato. No añadas ni quites secciones.

## 📈 Evolución Temporal

## Por Año
| Año | Dil% pond. | Rec% pond. | N cámaras | Tendencia |
|-----|-----------|-----------|-----------|-----------|
[una fila por año disponible — Tendencia: ↗ ↘ → respecto año anterior]

## Trimestre Más Reciente con Datos
**[Q? YYYY]:** Dilución ponderada: X.X% | Recuperación ponderada: X.X% | [N] cámaras

## Tendencia Global
- [1 frase: tendencia de dilución en los últimos 2 años]
- [1 frase: tendencia de recuperación en los últimos 2 años]
- [1 frase: ¿hay un período anómalo destacable?]

CHART_JSON_START
[Gráfico de líneas doble: dilución ponderada anual (línea #E8401C) y recuperación ponderada anual (línea #2C1810) — eje X años, eje Y porcentaje]
CHART_JSON_END

SUGGESTIONS_START
[3 sugerencias contextuales — menciona el año con peor dato y si hay mejora o empeoramiento reciente]
SUGGESTIONS_END

Datos disponibles:
${ctx}`,

      // ── 5. TOP OUTLIERS ─────────────────────────────────
      outliers: `Analiza el dataset y responde EXACTAMENTE en este formato. No añadas ni quites secciones.

## 🎯 Top 10 Outliers — Cámaras más Anómalas

## Ranking (ordenado por gravedad combinada)
| Pos | ID Cámara | Mina | Zona | Dil% | Rec% | PVt | Tipo anomalía |
|-----|-----------|------|------|------|------|-----|---------------|
[10 filas — Tipo: "Dil alta" / "Rec baja" / "Ambas" ]

## Análisis de Causas Comunes
- **Zona más afectada:** [nombre] ([N] de los 10 outliers)
- **Período de concentración:** [rango de fechas si hay patrón]
- **Rango de tamaño:** [PVt min – PVt max de los outliers]
- **Patrón:** [1-2 frases sobre qué tienen en común]

## Impacto en Toneladas
- Sobrexcavación total de los 10 outliers: [X t]
- Representa el [X%] de la sobrexcavación total del dataset

PLOTLY_JSON_START
[Scatter plot: eje X dilución%, eje Y recuperación%, cada punto = una de las 10 cámaras outlier, tamaño proporcional a PVt, color por tipo anomalía (#E8401C dil alta, #F5A623 rec baja, #2C1810 ambas), con texto del ID en hover]
PLOTLY_JSON_END

SUGGESTIONS_START
[3 sugerencias contextuales — nombra la cámara peor y la zona con más outliers]
SUGGESTIONS_END

Datos disponibles:
${ctx}`,

      // ── 6. DISTRIBUCIÓN ESTADÍSTICA ─────────────────────
      distribucion: `Analiza el dataset y responde EXACTAMENTE en este formato. No añadas ni quites secciones.

## 📉 Distribución Estadística

## Estadísticos Descriptivos — Dilución
| Zona | P10 | P25 | P50 | P75 | P90 | Media pond. | N |
|------|-----|-----|-----|-----|-----|-------------|---|
[una fila por zona + fila TOTAL]

## Estadísticos Descriptivos — Recuperación
| Zona | P10 | P25 | P50 | P75 | P90 | Media pond. | N |
|------|-----|-----|-----|-----|-----|-------------|---|
[una fila por zona + fila TOTAL]

## Interpretación
- [1 frase sobre dispersión de dilución]
- [1 frase sobre dispersión de recuperación]
- [1 frase sobre la zona con mayor/menor variabilidad]

PLOTLY_JSON_START
[Boxplot de dilución por zona: type "box", una serie por zona con los valores individuales de dilución calculados, colores corporativos, layout title "Distribución de Dilución por Zona (%)"]
PLOTLY_JSON_END

SUGGESTIONS_START
[3 sugerencias contextuales — menciona la zona con mayor IQR y si algún percentil es preocupante]
SUGGESTIONS_END

Datos disponibles:
${ctx}`,

      // ── 7. MODO PRESENTACIÓN ────────────────────────────
      presentacion: `Genera un resumen ejecutivo ultra-compacto para proyectar en pantalla en una reunión de dirección.
Responde EXACTAMENTE en este formato. Sin texto adicional.

## 🖥️ Vista Dirección — [fecha actual]

### KPIs Globales
| | Dilución Pond. | Recuperación Pond. | Cámaras |
|-|---------------|-------------------|---------|
| **Dataset actual** | **X.X%** | **X.X%** | **N** |

### Semáforo por Mina
| Mina | Estado | Dil% | Rec% |
|------|--------|------|------|
[una fila por mina — Estado: 🟢 / 🟡 / 🔴]

### Top 3 Alertas
1. [ID cámara] — [Mina/Zona] — [problema en 5 palabras]
2. [ID cámara] — [Mina/Zona] — [problema en 5 palabras]
3. [ID cámara] — [Mina/Zona] — [problema en 5 palabras]

### Acción Prioritaria
> [1 frase de acción concreta para dirección]

CHART_JSON_START
[Gráfico de barras horizontales muy limpio: dilución ponderada por mina — barras en #E8401C, fondo blanco, sin leyenda, título "Dilución Ponderada por Mina (%)"]
CHART_JSON_END

SUGGESTIONS_START
["Ver detalle de alertas críticas", "Comparar zonas en detalle", "Evolución respecto al año anterior"]
SUGGESTIONS_END

Datos disponibles:
${ctx}`,

      // ── 8. EXPORTAR PDF ─────────────────────────────────
      // Este botón no llama a Claude — lo gestiona export.js directamente
      exportar: null
    };

    return plantillas[id] || null;
  },

  // ── EJECUTAR ACCIÓN RÁPIDA ────────────────────────────────

  // ── RESUMEN EJECUTIVO — GRÁFICAS EN JS, TEXTO EN CLAUDE ──
  async _ejecutarResumenLocal() {
    if (!DataManager.datos || DataManager.datos.length === 0) {
      UI.addMsg("⚠️ Carga primero un dataset CSV para usar esta acción.", "ai");
      return;
    }

    UI.addMsg("📊 Resumen Ejecutivo", "user");
    UI.registrarEntradaIndice("📊 Resumen Ejecutivo", "accion");
    UI.setLoading(true);

    // ── 1. Pedir texto + tablas + recomendaciones a Claude ──
    const ctx = DataManager.buildContexto(this.contextoURL, "");
    const promptTexto = `Analiza el dataset y responde EXACTAMENTE en este formato. No añadas ni quites secciones. No escribas texto fuera de las secciones marcadas. No generes ningún bloque CHART_JSON ni PLOTLY_JSON — las gráficas se generan automáticamente.

## 📊 Resumen Ejecutivo
**Dataset:** [N cámaras] | [minas presentes] | Período: [fecha_min] – [fecha_max]

## Métricas Globales
| Métrica | Valor | N cámaras |
|---------|-------|-----------|
| Dilución ponderada | X.X% | N |
| Recuperación ponderada | X.X% | N |
| Outliers dilución (>P75) | N | — |
| Outliers recuperación (<P25) | N | — |

## Por Zona (todas las zonas, ordenadas por PVt descendente)
| Zona | Dil% | Rec% | Cámaras | PVt (t) | Estado |
|------|------|------|---------|---------|--------|
[una fila por zona — Estado: ✅ Normal / ⚠️ Atención / 🔴 Crítico]

## Por Mina
| Mina | Dil% | Rec% | Cámaras | PVt (t) | Estado |
|------|------|------|---------|---------|--------|
[una fila por mina — Estado: ✅ Normal / ⚠️ Atención / 🔴 Crítico]

## ⚠️ Alertas Críticas
[lista de máx. 5 cámaras: · ID [Mina/Zona] — Dil: X% | Rec: X%]
[Si no hay alertas: · Sin alertas críticas en el dataset actual]

## 💡 Recomendaciones
1. [acción concreta con zona/cámara específica]
2. [acción concreta con zona/cámara específica]
3. [acción concreta si procede]

SUGGESTIONS_START
[3 sugerencias contextuales con zonas/cámaras reales]
SUGGESTIONS_END

Datos disponibles:
${ctx}`;

    try {
      const response = await fetch(CONFIG.PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.MODEL,
          max_tokens: CONFIG.MAX_TOKENS,
          temperature: 0,
          system: `Eres un experto en ingeniería minera de Sandfire MATSA. Responde SIEMPRE en español técnico. Sigue la plantilla al pie de la letra. NO generes bloques CHART_JSON ni PLOTLY_JSON.`,
          messages: [{ role: "user", content: promptTexto }]
        })
      });

      const data = await response.json();
      const respuesta = data.content?.[0]?.text || "No se pudo obtener respuesta.";

      // Extraer sugerencias
      let sugerencias = [];
      const sugMatch = respuesta.match(/SUGGESTIONS_START\s*([\s\S]*?)\s*SUGGESTIONS_END/);
      if (sugMatch) { try { sugerencias = JSON.parse(sugMatch[1]); } catch(e) {} }

      // Limpiar bloques técnicos
      const textoLimpio = respuesta
        .replace(/SUGGESTIONS_START[\s\S]*?SUGGESTIONS_END/g, "")
        .trim();

      // Mostrar texto de Claude
      const tituloIndice = "📊 Resumen Ejecutivo";
      UI.addMsg(textoLimpio, "ai", { titulo: tituloIndice, tipo: "accion" });

      // ── 2. Gráficas generadas en JS con datos reales ──────
      this._renderGraficasResumen();

      if (sugerencias.length > 0) UI.mostrarSugerencias(sugerencias);

      const entrada = this._guardarConsulta("Resumen Ejecutivo", textoLimpio);
      UI.mostrarEtiquetaConsulta(entrada);

    } catch (err) {
      UI.addMsg("❌ Error de conexión: " + err.message, "ai");
    } finally {
      UI.setLoading(false);
    }
  },

  // ── GRÁFICAS DEL RESUMEN — 100% JS, sin Claude ───────────
  _renderGraficasResumen() {
    const datos = DataManager.datos;
    const m     = DataManager.metadatos;

    // ── SCATTER: una cámara = un punto ───────────────────────
    const maxPvt = Math.max(...datos.map(d => d._pvt), 1);
    const colores = datos.map(d => {
      const dilAlta = d._dil > m.dil_p75;
      const recBaja = d._rec < m.rec_p25;
      if (dilAlta && recBaja) return "#2C1810";
      if (dilAlta)            return "#E8401C";
      if (recBaja)            return "#F5A623";
      return "#7a7a7a";
    });
    const tamanios = datos.map(d => Math.sqrt(d._pvt / maxPvt) * 13 + 5);

    ChartManager.renderPlotly({
      data: [{
        type: "scatter",
        mode: "markers",
        x: datos.map(d => +(d._rec * 100).toFixed(1)),
        y: datos.map(d => +(d._dil * 100).toFixed(1)),
        text: datos.map(d =>
          (d[CONFIG.CAMPOS.id] || "—") + "<br>" +
          (d[CONFIG.CAMPOS.zona] || "") + " [" + (d[CONFIG.CAMPOS.mina] || "") + "]" +
          "<br>Dil: " + (d._dil*100).toFixed(1) + "% | Rec: " + (d._rec*100).toFixed(1) + "%" +
          "<br>PVt: " + d._pvt.toFixed(0) + " t"
        ),
        hoverinfo: "text",
        marker: { color: colores, size: tamanios, opacity: 0.85, line: { width: 0.5, color: "#fff" } }
      }],
      layout: {
        title: "Dispersión Dilución vs Recuperación (" + datos.length + " cámaras)",
        xaxis: { title: "Recuperación (%)", range: [0, 102], dtick: 10 },
        yaxis: { title: "Dilución (%)",     range: [0, Math.max(5, Math.ceil(Math.max(...datos.map(d => d._dil*100)) * 1.15))], dtick: 5 }
      }
    });

    // ── BARRAS POR ZONA ──────────────────────────────────────
    const zonaMap = {};
    datos.forEach(d => {
      const z = (d[CONFIG.CAMPOS.zona] || "Sin zona").trim() || "Sin zona";
      if (!zonaMap[z]) zonaMap[z] = { sobre: 0, sub: 0, pvt: 0 };
      zonaMap[z].sobre += parseFloat(d[CONFIG.CAMPOS.sobreexcavacion]) || 0;
      zonaMap[z].sub   += parseFloat(d[CONFIG.CAMPOS.subexcavacion])   || 0;
      zonaMap[z].pvt   += d._pvt;
    });
    const zonasArr = Object.entries(zonaMap)
      .map(([z, v]) => ({
        zona: z,
        dil: v.pvt > 0 ? Math.min(100, +(v.sobre / v.pvt * 100).toFixed(1)) : 0,
        rec: v.pvt > 0 ? Math.min(100, +((1 - v.sub / v.pvt) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.dil - a.dil);

    ChartManager.renderChartJS({
      type: "bar",
      data: {
        labels: zonasArr.map(z => z.zona),
        datasets: [
          { label: "Dilución (%)",     data: zonasArr.map(z => z.dil), backgroundColor: "#E8401C" },
          { label: "Recuperación (%)", data: zonasArr.map(z => z.rec), backgroundColor: "#2C1810" }
        ]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: "Dilución y Recuperación por Zona (%)" } },
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });

    // ── BARRAS POR MINA ──────────────────────────────────────
    const minaMap = {};
    datos.forEach(d => {
      const mn = (d[CONFIG.CAMPOS.mina] || "Sin mina").trim() || "Sin mina";
      if (!minaMap[mn]) minaMap[mn] = { sobre: 0, sub: 0, pvt: 0 };
      minaMap[mn].sobre += parseFloat(d[CONFIG.CAMPOS.sobreexcavacion]) || 0;
      minaMap[mn].sub   += parseFloat(d[CONFIG.CAMPOS.subexcavacion])   || 0;
      minaMap[mn].pvt   += d._pvt;
    });
    const minasArr = Object.entries(minaMap)
      .map(([mn, v]) => ({
        mina: mn,
        dil: v.pvt > 0 ? Math.min(100, +(v.sobre / v.pvt * 100).toFixed(1)) : 0,
        rec: v.pvt > 0 ? Math.min(100, +((1 - v.sub / v.pvt) * 100).toFixed(1)) : 0
      }));

    ChartManager.renderChartJS({
      type: "bar",
      data: {
        labels: minasArr.map(mn => mn.mina),
        datasets: [
          { label: "Dilución (%)",     data: minasArr.map(mn => mn.dil), backgroundColor: "#E8401C" },
          { label: "Recuperación (%)", data: minasArr.map(mn => mn.rec), backgroundColor: "#2C1810" }
        ]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: "Dilución y Recuperación por Mina (%)" } },
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });
  },

  async ejecutarAccion(id) {
    // Caso especial: exportar PDF no llama a Claude
    if (id === "exportar") {
      if (typeof ExportManager !== "undefined") ExportManager.exportarPDF();
      return;
    }

    // Caso especial: resumen — gráficas generadas en JS, solo texto+recomendaciones en Claude
    if (id === "resumen") {
      await this._ejecutarResumenLocal();
      return;
    }

    // Caso especial: modo presentación (toggle visual)
    if (id === "presentacion") {
      this.modoPresentacion = !this.modoPresentacion;
      if (typeof UI !== "undefined") UI.togglePresentacion(this.modoPresentacion);
      // También lanza el reporte de presentación
    }

    if (!DataManager.datos || DataManager.datos.length === 0) {
      UI.addMsg("⚠️ Carga primero un dataset CSV para usar esta acción.", "ai");
      return;
    }

    const prompt = this._promptAccion(id);
    if (!prompt) return;

    // Muestra la acción como mensaje del usuario
    const labels = {
      resumen: "📊 Resumen Ejecutivo",
      alertas: "⚠️ Alertas Automáticas",
      comparar: "🔍 Comparar Zonas",
      evolucion: "📈 Evolución Temporal",
      outliers: "🎯 Top Outliers",
      distribucion: "📉 Distribución Estadística",
      presentacion: "🖥️ Modo Presentación"
    };
    const labelAccion = labels[id] || id;
    UI.addMsg(labelAccion, "user");
    UI.registrarEntradaIndice(labelAccion, "accion");
    UI.setLoading(true);

    try {
      const response = await fetch(CONFIG.PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.MODEL,
          max_tokens: CONFIG.MAX_TOKENS,
          temperature: 0,
          system: `Eres un experto en ingeniería minera de Sandfire MATSA.
Responde SIEMPRE en español técnico.
Sigue la plantilla proporcionada al pie de la letra — no añadas ni quites secciones.
Rellena todos los valores con los datos reales calculados.
Para las gráficas, genera siempre el bloque JSON solicitado con datos reales.
Para SUGGESTIONS_START genera 3 sugerencias basadas en los hallazgos concretos que acabas de calcular, no genéricas.
Contexto Power BI: ${this.contextoURL}`,
          messages: [{ role: "user", content: prompt }]
          // Las acciones predefinidas NO usan historial — siempre respuesta fresca
        })
      });

      const data = await response.json();
      const respuesta = data.content?.[0]?.text || "No se pudo obtener respuesta.";

      this._procesarRespuesta(respuesta, prompt);

    } catch (err) {
      UI.addMsg("❌ Error de conexión: " + err.message, "ai");
    } finally {
      UI.setLoading(false);
    }
  },

  // ── ENVIAR MENSAJE (chat libre) ───────────────────────────
  async enviar(prompt) {
    if (!prompt.trim()) return;

    // Detecta si el usuario quiere repetir la última consulta con otro filtro
    const promptProcesado = this._procesarMemoriaConsulta(prompt);

    UI.addMsg(prompt, "user");
    UI.setLoading(true);

    try {
      const response = await fetch(CONFIG.PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.MODEL,
          max_tokens: CONFIG.MAX_TOKENS,
          temperature: 0,
          // Pasamos el prompt original para que buildContexto() decida
          // si incluir RAW data (solo si menciona un ID de cámara).
          system: this.buildSystemPrompt(prompt),
          messages: [
            ...this.historial.map(h => ([
              { role: "user", content: h.p },
              { role: "assistant", content: h.r }
            ])).flat(),
            { role: "user", content: promptProcesado }
          ]
        })
      });

      const data = await response.json();
      const respuesta = data.content?.[0]?.text || "No se pudo obtener respuesta.";

      // Clarificación
      const clarifyMatch = respuesta.match(/CLARIFY_START\s*([\s\S]*?)\s*CLARIFY_END/);
      if (clarifyMatch) {
        try {
          const clarify = JSON.parse(clarifyMatch[1]);
          UI.mostrarClarificacion(clarify.pregunta, clarify.opciones, promptProcesado);
          UI.setLoading(false);
          return;
        } catch (e) {}
      }

      this._procesarRespuesta(respuesta, promptProcesado);

    } catch (err) {
      UI.addMsg("❌ Error de conexión: " + err.message, "ai");
    } finally {
      UI.setLoading(false);
    }
  },

  // ── PROCESADO COMÚN DE RESPUESTA ─────────────────────────
  _procesarRespuesta(respuesta, promptOriginal) {
    // Extraer sugerencias
    let sugerencias = [];
    const sugMatch = respuesta.match(/SUGGESTIONS_START\s*([\s\S]*?)\s*SUGGESTIONS_END/);
    if (sugMatch) {
      try { sugerencias = JSON.parse(sugMatch[1]); } catch (e) {}
    }

    // Limpiar bloques técnicos del texto visible
    const respuestaLimpia = respuesta
      .replace(/SUGGESTIONS_START[\s\S]*?SUGGESTIONS_END/g, "")
      .replace(/CHART_JSON_START[\s\S]*?CHART_JSON_END/g, "")
      .replace(/PLOTLY_JSON_START[\s\S]*?PLOTLY_JSON_END/g, "")
      .replace(/CLARIFY_START[\s\S]*?CLARIFY_END/g, "")
      .replace(/INSTRUCCIÓN GRÁFICA[^\n]*\n[\s\S]*?(?=\n##|\nSUGGESTIONS|\nCHART|\nPLOTLY|$)/g, "")
      .trim();

    // Renderizar texto con markdown — registrar en índice
    const tituloIndice = promptOriginal.length > 35 ? promptOriginal.substring(0, 32) + "…" : promptOriginal;
    ChartManager.procesarRespuestaConIndice(respuestaLimpia, tituloIndice);

    // Renderizar TODAS las gráficas Plotly (puede haber varias)
    const plotlyMatches = [...respuesta.matchAll(/PLOTLY_JSON_START\s*([\s\S]*?)\s*PLOTLY_JSON_END/g)];
    plotlyMatches.forEach(m => {
      try { ChartManager.renderPlotly(JSON.parse(m[1])); } catch (e) {
        console.warn("Error parseando Plotly JSON:", e);
      }
    });

    // Renderizar TODAS las gráficas Chart.js (puede haber varias)
    const chartMatches = [...respuesta.matchAll(/CHART_JSON_START\s*([\s\S]*?)\s*CHART_JSON_END/g)];
    chartMatches.forEach(m => {
      try { ChartManager.renderChartJS(JSON.parse(m[1])); } catch (e) {
        console.warn("Error parseando Chart.js JSON:", e);
      }
    });

    // Mostrar sugerencias como drill-downs
    if (sugerencias.length > 0) UI.mostrarSugerencias(sugerencias);

    // Guardar en memoria de consultas y en historial
    const entrada = this._guardarConsulta(promptOriginal, respuestaLimpia);
    UI.mostrarEtiquetaConsulta(entrada);  // muestra el chip "💾 [nombre]" en el mensaje

    // Historial para contexto (solo chat libre) — hasta 10 interacciones (antes 6)
    this.historial.push({ p: promptOriginal, r: respuestaLimpia });
    if (this.historial.length > 10) this.historial.shift();
  },

  // ── MEMORIA DE CONSULTAS ──────────────────────────────────
  // Detecta patrones como "repite esto para zona X" o
  // "haz lo mismo pero para MGD" y construye el prompt expandido
  _procesarMemoriaConsulta(prompt) {
    // Patrones de referencia a consulta anterior
    const patronesRepetir = [
      /repite\s+(esto|eso|lo mismo|la consulta|el análisis)/i,
      /haz\s+lo\s+mismo\s+(pero|para|con)/i,
      /misma\s+(consulta|pregunta|análisis)\s+(pero|para|con)/i,
      /aplica\s+(esto|eso|lo mismo)\s+(a|para|en)/i,
      /\bpero\s+(para|con|en)\s+(zona|mina|período|año)/i,
      /repite\s+(para|con|en)\s+/i
    ];

    const esRepeticion = patronesRepetir.some(p => p.test(prompt));

    if (esRepeticion && this._ultimaConsulta) {
      return `El usuario quiere repetir la siguiente consulta con un nuevo contexto.

CONSULTA ORIGINAL: "${this._ultimaConsulta.prompt}"

NUEVA PETICIÓN DEL USUARIO: "${prompt}"

Aplica la misma lógica de análisis pero adaptada al nuevo contexto indicado en la nueva petición. Mantén el mismo nivel de detalle y estructura.`;
    }

    // Si menciona "la consulta anterior", "lo que acabas de analizar", etc.
    const patronesReferencia = [
      /consulta anterior/i,
      /lo que acabas de/i,
      /el análisis anterior/i,
      /lo que me dijiste/i
    ];

    const esReferencia = patronesReferencia.some(p => p.test(prompt));

    if (esReferencia && this._ultimaConsulta) {
      // Resumen ampliado de 500 → 1500 chars para no perder detalle
      return `Contexto de la consulta anterior:
PREGUNTA: "${this._ultimaConsulta.prompt}"
RESPUESTA RESUMIDA: "${this._ultimaConsulta.respuesta.substring(0, 1500)}..."

NUEVA PETICIÓN: "${prompt}"`;
    }

    // Sin patrón especial — prompt sin modificar
    return prompt;
  },

  // ── HISTORIAL ─────────────────────────────────────────────
  limpiarHistorial() {
    this.historial = [];
    this._consultasRecientes = [];
    this._ultimaConsulta = null;
    document.getElementById("chat").innerHTML = "";
    UI.addMsg("Historial limpiado. Puedes comenzar un nuevo análisis.", "ai");
  },

  // ── ACCESO PÚBLICO A CONSULTAS RECIENTES ─────────────────
  getConsultasRecientes() {
    return this._consultasRecientes;
  },

  getUltimaConsulta() {
    return this._ultimaConsulta;
  }
};
