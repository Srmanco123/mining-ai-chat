const ChatManager = {
  historial: [],
  contextoURL: "",
  modoPresentacion: false,

  init(contextoURL) {
    this.contextoURL = contextoURL;
  },

  buildContexto(prompt) {
    if (!DataManager.datos.length) return "Sin datos cargados.";
    const esResumen = prompt === "RESUMEN_EJECUTIVO" ||
      /resumen|global|todas las zonas|todas las minas|dataset completo|comparar zona/i.test(prompt);
    const esCamara = /CAM |cámara|stope/i.test(prompt);
    if (esResumen || !esCamara) {
      return DataManager.buildContextoAgregado();
    } else {
      return DataManager.buildContexto(this.contextoURL);
    }
  },

  buildSystemPrompt(prompt) {
    const esResumen = prompt === "RESUMEN_EJECUTIVO";

    // Obtener zonas y minas reales del dataset para el ejemplo de drill-down
    const zonas = DataManager.metadatos ? DataManager.metadatos.zonas.filter(z => z && z !== "Sin zona") : [];
    const minas = DataManager.metadatos ? DataManager.metadatos.minas : [];
    const ejemploDrill = zonas.length > 0
      ? "DRILLDOWN_START [" +
        zonas.slice(0, 4).map(z => '{"label":"' + z + '","prompt":"Desglose completo zona ' + z + ': N cámaras, dilución ponderada, recuperación ponderada, top 3 outliers"}').join(",") +
        ',{"label":"Top outliers","prompt":"Top 5 cámaras con mayor dilución ponderada del dataset"}' +
        ',{"label":"Evolución temporal","prompt":"Evolución anual de dilución y recuperación ponderadas con gráfica de líneas"}' +
        "] DRILLDOWN_END"
      : 'DRILLDOWN_START [{"label":"Top outliers","prompt":"Top 5 cámaras con mayor dilución ponderada"},{"label":"Evolución temporal","prompt":"Evolución anual de dilución y recuperación ponderadas"}] DRILLDOWN_END';

    const instruccionResumen = esResumen ? `
INSTRUCCIÓN ESPECIAL — RESUMEN EJECUTIVO:
Responde ÚNICAMENTE con esta estructura, sin añadir nada más:
1. Tabla global: dilución ponderada, recuperación ponderada, N cámaras, P&V total
2. Tabla por zona (ordenada de mejor a peor dilución): zona, N, dilución ponderada, recuperación ponderada, estado
3. Máximo 1 línea de conclusión
4. DRILLDOWN con un botón por cada zona del dataset + "Top outliers" + "Evolución temporal"

EJEMPLO EXACTO de cómo debe quedar el DRILLDOWN para este dataset:
${ejemploDrill}
` : "";

    return `Eres un experto en reconciliación de cámaras mineras de Sandfire MATSA. Responde en español técnico.

FORMATO OBLIGATORIO — sigue este orden exacto en TODAS las respuestas:

BREADCRUMB_START {"label":"nivel actual","prompt":"prompt para regenerar"} BREADCRUMB_END

[máximo 3 líneas de texto + tabla Markdown si hay datos tabulares]

DRILLDOWN_START [{"label":"Botón 1","prompt":"prompt 1"},{"label":"Botón 2","prompt":"prompt 2"},{"label":"Botón 3","prompt":"prompt 3"}] DRILLDOWN_END

SUGGESTIONS_START ["sugerencia 1","sugerencia 2","sugerencia 3"] SUGGESTIONS_END

REGLAS ESTRICTAS:
- Máximo 3 líneas narrativas — el detalle va en los botones drill-down
- Tablas Markdown para datos: | Col | Col | — nunca listas con bullets
- **negrita** para valores clave
- TOP 5 máximo si hay muchos elementos — el resto en drill-down
- DRILLDOWN_START...DRILLDOWN_END es OBLIGATORIO siempre, con botones ESPECÍFICOS al contenido
- Dilución y recuperación: escribe siempre "ponderada"
${instruccionResumen}
CÁLCULO:
- Dilución ponderada = Σ(Sobrexcavacion_tn) / Σ(P&V t) acotada [0,1]
- Recuperación ponderada = 1 - Σ(Subexcavacion_tn) / Σ(P&V t) acotada [0,1]
- Agrega siempre ponderado por volumen, nunca media aritmética
- Indica siempre N cámaras

DRILL-DOWN según nivel — botones ESPECÍFICOS:
- Global → un botón por cada zona real del dataset (nombres exactos) + "Top outliers" + "Evolución temporal"
- Mina → un botón por cada zona de esa mina + "Outliers de [mina]" + "Comparar minas"
- Zona → botones: "Top 5 cámaras de [zona]", "Outliers de [zona]", "Boxplot [zona]"
- Cámara → botones: "Comparar con [zona]", "Cámaras similares", "Posibles causas", "Exportar ficha"

AMBIGÜEDAD:
CLARIFY_START {"pregunta":"texto","opciones":["op1","op2","op3"]} CLARIFY_END

GRÁFICA SIMPLE (barras/líneas/pie):
CHART_JSON_START {"type":"bar","data":{"labels":[...],"datasets":[{"label":"...","data":[...],"backgroundColor":"#E8401C"}]},"options":{"responsive":true}} CHART_JSON_END

GRÁFICA AVANZADA (boxplot/heatmap/scatter):
PLOTLY_JSON_START {"data":[...],"layout":{"title":"..."}} PLOTLY_JSON_END

ESTADÍSTICAS:
STATS_START {"type":"regression","x":"_pvt","y":"_dil"} STATS_END
STATS_START {"type":"correlation","vars":["_pvt","_dil","_rec"]} STATS_END

Contexto Power BI: ${this.contextoURL}
${this.buildContexto(prompt)}`;
  },

  async enviar(prompt) {
    if (!prompt.trim()) return;
    const promptMostrado = prompt === "RESUMEN_EJECUTIVO" ? "Resumen ejecutivo del dataset" : prompt;
    UI.addMsg(promptMostrado, "user");
    UI.setLoading(true);

    try {
      const response = await fetch(CONFIG.PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.MODEL,
          max_tokens: CONFIG.MAX_TOKENS,
          system: this.buildSystemPrompt(prompt),
          messages: [
            ...this.historial.map(h => ([
              { role: "user", content: h.p },
              { role: "assistant", content: h.r }
            ])).flat(),
            { role: "user", content: prompt === "RESUMEN_EJECUTIVO"
                ? "Genera el resumen ejecutivo del dataset siguiendo exactamente la instrucción especial."
                : prompt }
          ]
        })
      });

      const data = await response.json();
      const respuesta = data.content?.[0]?.text || "No se pudo obtener respuesta.";

      // ── Clarificación
      const clarifyMatch = respuesta.match(/CLARIFY_START\s*(\{[\s\S]*?\})\s*CLARIFY_END/);
      if (clarifyMatch) {
        try {
          const clarify = JSON.parse(clarifyMatch[1]);
          UI.mostrarClarificacion(clarify.pregunta, clarify.opciones, prompt);
          UI.setLoading(false);
          return;
        } catch(e) {}
      }

      // ── Extraer bloques
      let sugerencias = [];
      const sugMatch = respuesta.match(/SUGGESTIONS_START\s*(\[[\s\S]*?\])\s*SUGGESTIONS_END/);
      if (sugMatch) { try { sugerencias = JSON.parse(sugMatch[1]); } catch(e) {} }

      let drillActions = [];
      const drillMatch = respuesta.match(/DRILLDOWN_START\s*(\[[\s\S]*?\])\s*DRILLDOWN_END/);
      if (drillMatch) { try { drillActions = JSON.parse(drillMatch[1]); } catch(e) {} }

      let breadcrumb = null;
      const bcMatch = respuesta.match(/BREADCRUMB_START\s*(\{[\s\S]*?\})\s*BREADCRUMB_END/);
      if (bcMatch) { try { breadcrumb = JSON.parse(bcMatch[1]); } catch(e) {} }

      const chartMatch = respuesta.match(/CHART_JSON_START\s*(\{[\s\S]*?\})\s*CHART_JSON_END/);
      const plotlyMatch = respuesta.match(/PLOTLY_JSON_START\s*(\{[\s\S]*?\})\s*PLOTLY_JSON_END/);
      const statsMatch = respuesta.match(/STATS_START\s*(\{[\s\S]*?\})\s*STATS_END/);

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

      // ── Mostrar mensaje
      const msgOpts = breadcrumb ? { breadcrumbLabel: breadcrumb.label, breadcrumbPrompt: breadcrumb.prompt } : {};
      UI.addMsg(respuestaLimpia, "ai", msgOpts);

      // ── Estadísticas
      if (statsMatch) { try { StatsManager.renderStats(JSON.parse(statsMatch[1])); } catch(e) {} }

      // ── Chart.js
      if (chartMatch) {
        try { ChartManager.renderChartJS(JSON.parse(chartMatch[1])); }
        catch(e) { UI.addMsg("No se pudo generar la gráfica (JSON inválido).", "ai"); }
      }

      // ── Plotly
      if (plotlyMatch) {
        try {
          const spec = JSON.parse(plotlyMatch[1]);
          if (spec.layout) { delete spec.layout.width; delete spec.layout.height; }
          ChartManager.renderPlotly(spec);
        } catch(e) { UI.addMsg("No se pudo generar la gráfica avanzada (JSON inválido).", "ai"); }
      }

      // ── Drill-down — específico si Claude lo genera, fallback con zonas reales si no
      if (drillActions.length > 0) {
        UI.mostrarDrillDown(drillActions);
      } else {
        const zonas = DataManager.metadatos ? DataManager.metadatos.zonas.filter(z => z && z !== "Sin zona").slice(0, 4) : [];
        const minas = DataManager.metadatos ? DataManager.metadatos.minas : [];
        const fallback = zonas.length > 0
          ? [
              ...zonas.map(z => ({ label: z, prompt: "Desglose completo zona " + z + ": N cámaras, dilución ponderada, recuperación ponderada, top 3 outliers" })),
              { label: "Top outliers", prompt: "Top 5 cámaras con mayor dilución ponderada del dataset" },
              { label: "Evolución temporal", prompt: "Evolución anual de dilución y recuperación ponderadas con gráfica de líneas" }
            ].slice(0, 5)
          : minas.map(m => ({ label: m, prompt: "Desglose completo mina " + m + ": zonas, dilución ponderada, recuperación ponderada" }))
            .concat([{ label: "Top outliers", prompt: "Top 5 cámaras con mayor dilución ponderada" }]);
        UI.mostrarDrillDown(fallback);
      }

      // ── Sugerencias
      if (sugerencias.length > 0) UI.mostrarSugerencias(sugerencias);

      this.historial.push({ p: promptMostrado, r: respuestaLimpia });
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
      msg += "🔴 " + alertas.criticas.length + " cámaras críticas (dil > " + (CONFIG.ALERTAS.dilucion_alta * 100) + "% o rec < " + (CONFIG.ALERTAS.recuperacion_baja * 100) + "%):\n";
      alertas.criticas.slice(0, 5).forEach(d => {
        msg += "  · " + d[CONFIG.CAMPOS.id] + " — Dil: " + (d._dil * 100).toFixed(1) + "% | Rec: " + (d._rec * 100).toFixed(1) + "%\n";
      });
      if (alertas.criticas.length > 5) msg += "  ... y " + (alertas.criticas.length - 5) + " más.\n";
    }
    if (alertas.medias.length > 0) msg += "\n🟡 " + alertas.medias.length + " cámaras con alertas intermedias.";
    UI.addMsg(msg, "ai");
  },

  limpiarHistorial() {
    this.historial = [];
    UI._breadcrumb = [];
    document.getElementById("chat").innerHTML = "";
    UI.addMsg("Historial limpiado. Puedes comenzar un nuevo análisis.", "ai");
  }
};
