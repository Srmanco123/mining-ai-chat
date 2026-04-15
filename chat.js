const ChatManager = {
  historial: [],
  contextoURL: "",
  modoPresentacion: false,

  init(contextoURL) {
    this.contextoURL = contextoURL;
  },

  buildSystemPrompt() {
    return `Eres un experto en reconciliación de cámaras mineras de Sandfire MATSA. Responde en español técnico.

FORMATO DE RESPUESTA — OBLIGATORIO EN TODAS LAS RESPUESTAS:
Tu respuesta DEBE seguir EXACTAMENTE esta estructura, en este orden:

1. BREADCRUMB_START {"label":"nivel actual","prompt":"prompt para regenerar"} BREADCRUMB_END
2. Máximo 3 líneas de texto con los datos clave. USA tablas Markdown para datos tabulares.
3. Si hay más de 5 elementos, muestra solo TOP 5 con "... y N más →" al final.
4. DRILLDOWN_START [{"label":"Botón corto","prompt":"prompt completo"},{"label":"Botón 2","prompt":"prompt 2"}] DRILLDOWN_END
5. SUGGESTIONS_START ["sugerencia 1","sugerencia 2","sugerencia 3"] SUGGESTIONS_END

PROHIBIDO:
- Más de 3 líneas de texto narrativo
- Listas con bullet points — usa tablas Markdown
- Análisis exhaustivo en una sola respuesta
- Omitir el bloque DRILLDOWN_START...DRILLDOWN_END

REGLAS DE CÁLCULO:
- Dilución ponderada = Σ(Sobrexcavacion_tn) / Σ(P&V t) — siempre desde datos brutos
- Recuperación ponderada = 1 - Σ(Subexcavacion_tn) / Σ(P&V t) — siempre desde datos brutos
- Valores acotados [0%, 100%]
- Indica siempre N cámaras que respaldan el dato

DRILL-DOWN — acciones según nivel:
- Dataset global → botones: desglose por mina, top outliers, evolución temporal
- Mina → botones: zonas de esa mina, outliers de esa mina, comparar minas
- Zona → botones: cámaras de esa zona, outliers de zona, boxplot
- Cámara → botones: comparar con zona, cámaras similares, causas, exportar ficha

AMBIGÜEDAD — si la petición es ambigua devuelve SOLO:
CLARIFY_START {"pregunta":"¿Qué quieres?","opciones":["op1","op2","op3"]} CLARIFY_END

GRÁFICAS — Chart.js para barras/líneas/pie:
CHART_JSON_START {"type":"bar","data":{"labels":[...],"datasets":[{"label":"...","data":[...],"backgroundColor":"#E8401C"}]},"options":{"responsive":true}} CHART_JSON_END

GRÁFICAS — Plotly para boxplot/heatmap/scatter/regresión:
PLOTLY_JSON_START {"data":[...],"layout":{"title":"..."}} PLOTLY_JSON_END

ESTADÍSTICAS — regresión entre variables:
STATS_START {"type":"regression","x":"_pvt","y":"_dil"} STATS_END
STATS_START {"type":"correlation","vars":["_pvt","_dil","_rec"]} STATS_END

Contexto Power BI: ${this.contextoURL}
${DataManager.buildContexto(this.contextoURL)}`;
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

      // ── Drill-down — fallback si Claude no lo genera
      if (drillActions.length > 0) {
        UI.mostrarDrillDown(drillActions);
      } else {
        // Fallback genérico según contexto
        const fallback = DataManager.datos.length > 0 ? [
          { label: "Desglose por mina", prompt: "Desglose de resultados por mina ATE, MGD y SOT" },
          { label: "Top outliers", prompt: "Top 5 cámaras con comportamiento más anómalo" },
          { label: "Evolución temporal", prompt: "Evolución temporal anual de dilución y recuperación ponderadas" }
        ] : [];
        if (fallback.length) UI.mostrarDrillDown(fallback);
      }

      // ── Sugerencias
      if (sugerencias.length > 0) UI.mostrarSugerencias(sugerencias);

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
