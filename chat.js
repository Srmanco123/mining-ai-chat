const ChatManager = {
  historial: [],
  contextoURL: "",
  modoPresentacion: false,

  init(contextoURL) {
    this.contextoURL = contextoURL;
  },

  buildSystemPrompt() {
    return `Eres un experto en ingeniería minera especializado en reconciliación de cámaras subterráneas de Sandfire MATSA.
Responde siempre en español técnico para ingenieros senior de minería.

REGLAS DE FORMATO OBLIGATORIAS:
- Respuestas CORTAS y directas: máximo 4-5 líneas de texto narrativo
- Usa tablas Markdown (|col|col|) para mostrar datos tabulares — SIEMPRE en lugar de listas
- Usa **negrita** para valores clave (porcentajes, nombres de cámara, alertas)
- NO hagas párrafos largos — ve directo al dato relevante
- Indica siempre cuántas cámaras respaldan cada afirmación
- Máximo 200 palabras por respuesta en total. Si hay mucho que mostrar, muestra solo el TOP 5 y ofrece drill-down para el resto.
- NUNCA hagas análisis exhaustivo en una sola respuesta — divide en niveles usando los botones de drill-down.
- Una respuesta = un nivel de análisis. El detalle va en los botones de seguimiento.

REGLAS DE CALCULO OBLIGATORIAS:
- Dilución = MIN(1, MAX(0, Sobrexcavacion_tn / PVt)) — recalcula siempre desde datos brutos
- Recuperación = MIN(1, MAX(0, 1 - Subexcavacion_tn / PVt)) — recalcula siempre desde datos brutos
- Al agregar por zona o mina usa suma(Sobrexcavacion_tn) / suma(PVt) ponderado por volumen
- Valores siempre entre 0% y 100%

Contexto Power BI activo: ${this.contextoURL}
${DataManager.buildContexto(this.contextoURL)}

DETECCION DE AMBIGUEDAD:
Si la petición es ambigua devuelve SOLO:
CLARIFY_START
{"pregunta": "¿Qué quieres exactamente?", "opciones": ["opcion1", "opcion2", "opcion3"]}
CLARIFY_END

DRILL-DOWN DINÁMICO — MUY IMPORTANTE:
Al final de CADA respuesta analítica incluye 2-4 acciones de seguimiento contextuales con este formato exacto:
DRILLDOWN_START
[{"label":"Texto botón corto","prompt":"Prompt completo para enviar a Claude"},{"label":"Otro botón","prompt":"Otro prompt"}]
DRILLDOWN_END

Las acciones deben ser ESPECÍFICAS al contenido de la respuesta:
- Si respondes sobre el dataset global → ofrece desglose por mina (ATE, MGD, SOT), top outliers, evolución temporal
- Si respondes sobre una mina → ofrece desglose por zonas de esa mina, outliers de esa mina, comparar con otras minas
- Si respondes sobre una zona → ofrece listar cámaras de esa zona, outliers de la zona, boxplot
- Si respondes sobre una cámara → ofrece comparar con su zona, cámaras similares, análisis de causas, exportar ficha

BREADCRUMB — incluye al inicio de cada respuesta analítica:
BREADCRUMB_START
{"label":"Etiqueta corta del nivel actual (ej: 'ATE', 'Zona B', 'ATE_B_0412', 'Resumen general')","prompt":"Prompt para regenerar esta respuesta"}
BREADCRUMB_END

REGLAS DE GRAFICAS:
Si el usuario pide gráfica simple (barras, líneas, pie) usa Chart.js:
CHART_JSON_START
{"type":"bar","data":{"labels":[...],"datasets":[{"label":"...","data":[...],"backgroundColor":"#E8401C"}]},"options":{"responsive":true,"plugins":{"title":{"display":true,"text":"..."}}}}
CHART_JSON_END

Si el usuario pide análisis avanzado (boxplot, violin, distribución, correlación, heatmap, regresión) usa Plotly:
PLOTLY_JSON_START
{"data":[{"type":"box","y":[...],"name":"..."}],"layout":{"title":"..."}}
PLOTLY_JSON_END

RESTRICCIONES DE GRAFICAS:
- Chart.js: solo bar, line, scatter, pie, doughnut — NUNCA boxplot
- Plotly: box, violin, histogram, heatmap, scatter — JSON 100% válido sin funciones JS
- backgroundColor en Chart.js: string o array de strings, NUNCA función
- Máximo 15 etiquetas en eje X
- NUNCA width ni height fijos en layout de Plotly

CAPACIDADES ESTADÍSTICAS (motor JS en navegador):
El sistema puede calcular automáticamente: regresión lineal/múltiple, R², correlaciones, percentiles, intervalos de confianza.
Cuando el usuario pregunte por relaciones entre variables (ej: "¿el volumen afecta a la dilución?"), incluye en tu respuesta:
STATS_START
{"type":"regression","x":"_pvt","y":"_dil","label":"P&V t vs Dilución"}
STATS_END
O para matriz de correlaciones:
STATS_START
{"type":"correlation","vars":["_pvt","_dil","_rec"]}
STATS_END

SUGERENCIAS POST-RESPUESTA:
Al final añade siempre:
SUGGESTIONS_START
["pregunta sugerida 1", "pregunta sugerida 2", "pregunta sugerida 3"]
SUGGESTIONS_END`;
  },

  async enviar(prompt) {
    if (!prompt.trim()) return;
    UI.addMsg(prompt, "user");
    UI.setLoading(true);

    try {
      const response = await fetch(CONFIG.PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.MODEL,
          max_tokens: CONFIG.MAX_TOKENS,
          system: this.buildSystemPrompt(),
          messages: [
            ...this.historial.map(h => ([
              { role: "user", content: h.p },
              { role: "assistant", content: h.r }
            ])).flat(),
            { role: "user", content: prompt }
          ]
        })
      });

      const data = await response.json();
      const respuesta = data.content?.[0]?.text || "No se pudo obtener respuesta.";

      // ── Clarificación
      const clarifyMatch = respuesta.match(/CLARIFY_START\s*([\s\S]*?)\s*CLARIFY_END/);
      if (clarifyMatch) {
        try {
          const clarify = JSON.parse(clarifyMatch[1]);
          UI.mostrarClarificacion(clarify.pregunta, clarify.opciones, prompt);
          UI.setLoading(false);
          return;
        } catch(e) {}
      }

      // ── Extraer bloques especiales
      let sugerencias = [];
      const sugMatch = respuesta.match(/SUGGESTIONS_START\s*([\s\S]*?)\s*SUGGESTIONS_END/);
      if (sugMatch) { try { sugerencias = JSON.parse(sugMatch[1]); } catch(e) {} }

      let drillActions = [];
      const drillMatch = respuesta.match(/DRILLDOWN_START\s*([\s\S]*?)\s*DRILLDOWN_END/);
      if (drillMatch) { try { drillActions = JSON.parse(drillMatch[1]); } catch(e) {} }

      let breadcrumb = null;
      const bcMatch = respuesta.match(/BREADCRUMB_START\s*([\s\S]*?)\s*BREADCRUMB_END/);
      if (bcMatch) { try { breadcrumb = JSON.parse(bcMatch[1]); } catch(e) {} }

      const chartMatch = respuesta.match(/CHART_JSON_START\s*([\s\S]*?)\s*CHART_JSON_END/);
      const plotlyMatch = respuesta.match(/PLOTLY_JSON_START\s*([\s\S]*?)\s*PLOTLY_JSON_END/);
      const statsMatch = respuesta.match(/STATS_START\s*([\s\S]*?)\s*STATS_END/);

      // ── Limpiar texto
      const respuestaLimpia = respuesta
        .replace(/SUGGESTIONS_START[\s\S]*?SUGGESTIONS_END/g, "")
        .replace(/CLARIFY_START[\s\S]*?CLARIFY_END/g, "")
        .replace(/CHART_JSON_START[\s\S]*?CHART_JSON_END/g, "")
        .replace(/PLOTLY_JSON_START[\s\S]*?PLOTLY_JSON_END/g, "")
        .replace(/DRILLDOWN_START[\s\S]*?DRILLDOWN_END/g, "")
        .replace(/BREADCRUMB_START[\s\S]*?BREADCRUMB_END/g, "")
        .replace(/STATS_START[\s\S]*?STATS_END/g, "")
        .trim();

      // ── Mostrar mensaje con breadcrumb
      const msgOpts = breadcrumb ? { breadcrumbLabel: breadcrumb.label, breadcrumbPrompt: breadcrumb.prompt } : {};
      UI.addMsg(respuestaLimpia, "ai", msgOpts);

      // ── Estadísticas JS (motor local)
      if (statsMatch) {
        try {
          const spec = JSON.parse(statsMatch[1]);
          StatsManager.renderStats(spec);
        } catch(e) {}
      }

      // ── Chart.js
      if (chartMatch) {
        try {
          const spec = JSON.parse(chartMatch[1]);
          ChartManager.renderChartJS(spec);
        } catch(e) {
          UI.addMsg("No se pudo generar la gráfica (JSON inválido). Intenta reformular la petición.", "ai");
        }
      }

      // ── Plotly
      if (plotlyMatch) {
        try {
          const spec = JSON.parse(plotlyMatch[1]);
          if (spec.layout) { delete spec.layout.width; delete spec.layout.height; }
          ChartManager.renderPlotly(spec);
        } catch(e) {
          UI.addMsg("No se pudo generar la gráfica avanzada (JSON inválido). Intenta reformular la petición.", "ai");
        }
      }

      // ── Drill-down dinámico
      if (drillActions.length > 0) {
        UI.mostrarDrillDown(drillActions);
      }

      // ── Sugerencias
      if (sugerencias.length > 0) {
        UI.mostrarSugerencias(sugerencias);
      }

      this.historial.push({ p: prompt, r: respuestaLimpia });
      if (this.historial.length > 6) this.historial.shift();

    } catch(e) {
      UI.addMsg("Error de conexión: " + e.message, "ai");
    }

    UI.setLoading(false);
  },

  async ejecutarAccion(accionId) {
    const accion = CONFIG.ACCIONES.find(a => a.id === accionId);
    if (!accion) return;
    if (accionId === "presentacion") { UI.togglePresentacion(); return; }
    if (accionId === "exportar") { ExportManager.exportarPDF(); return; }
    if (accionId === "comparar") { ChartManager.graficarComparativaZonas(); await this.enviar(accion.prompt); return; }
    if (accionId === "temporal") { ChartManager.graficarEvolucionTemporal(); await this.enviar(accion.prompt); return; }
    if (accionId === "distribucion") {
      ChartManager.graficarBoxplotZonas();
      ChartManager.graficarDistribucionGauss("dil");
      await this.enviar(accion.prompt);
      return;
    }
    await this.enviar(accion.prompt);
  },

  async analizarAlertas() {
    const alertas = DataManager.alertas();
    if (alertas.criticas.length === 0 && alertas.medias.length === 0) {
      UI.addMsg("✅ Sin alertas críticas detectadas en el dataset cargado.", "ai");
      return;
    }
    let msg = "";
    if (alertas.criticas.length > 0) {
      msg += "🔴 " + alertas.criticas.length + " cámaras con alertas críticas (dilución > " + (CONFIG.ALERTAS.dilucion_alta * 100) + "% o recuperación < " + (CONFIG.ALERTAS.recuperacion_baja * 100) + "%):\n";
      alertas.criticas.slice(0, 5).forEach(d => {
        msg += "  · " + d[CONFIG.CAMPOS.id] + " — Dil: " + (d._dil * 100).toFixed(1) + "% | Rec: " + (d._rec * 100).toFixed(1) + "%\n";
      });
      if (alertas.criticas.length > 5) msg += "  ... y " + (alertas.criticas.length - 5) + " más.\n";
    }
    if (alertas.medias.length > 0) {
      msg += "\n🟡 " + alertas.medias.length + " cámaras con alertas intermedias.";
    }
    UI.addMsg(msg, "ai");
  },

  limpiarHistorial() {
    this.historial = [];
    UI._breadcrumb = [];
    document.getElementById("chat").innerHTML = "";
    UI.addMsg("Historial limpiado. Puedes comenzar un nuevo análisis.", "ai");
  }
};
