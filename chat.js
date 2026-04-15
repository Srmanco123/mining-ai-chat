const ChatManager = {
  historial: [],
  contextoURL: "",
  modoPresentacion: false,

  init(contextoURL) {
    this.contextoURL = contextoURL;
  },

  buildSystemPrompt() {
    return `Eres un experto en reconciliación de cámaras mineras de Sandfire MATSA. Responde en español técnico.

FORMATO OBLIGATORIO — sigue este orden exacto en TODAS las respuestas:

BREADCRUMB_START {"label":"nivel actual","prompt":"prompt para regenerar"} BREADCRUMB_END

[máximo 3 líneas de texto + tabla Markdown si hay datos tabulares]

DRILLDOWN_START [{"label":"Botón 1","prompt":"prompt completo 1"},{"label":"Botón 2","prompt":"prompt completo 2"},{"label":"Botón 3","prompt":"prompt completo 3"}] DRILLDOWN_END

SUGGESTIONS_START ["sugerencia 1","sugerencia 2","sugerencia 3"] SUGGESTIONS_END

REGLAS ESTRICTAS:
- Máximo 3 líneas narrativas — el resto va en botones de drill-down
- Tablas Markdown para datos: | Col | Col | — nunca listas con bullets
- **negrita** para valores clave
- TOP 5 máximo si hay muchos elementos
- El bloque DRILLDOWN_START...DRILLDOWN_END es OBLIGATORIO en TODAS las respuestas
- Dilución y recuperación: escribe siempre "ponderada"

CÁLCULO:
- Dilución ponderada = Σ(Sobrexcavacion_tn) / Σ(P&V t) acotada [0,1]
- Recuperación ponderada = 1 - Σ(Subexcavacion_tn) / Σ(P&V t) acotada [0,1]
- Agrega siempre ponderado por volumen, nunca media aritmética
- Indica siempre N cámaras

DRILL-DOWN según nivel:
- Global → botones: ATE, MGD, SOT, top outliers, evolución
- Mina → botones: zonas de esa mina, outliers, comparar minas
- Zona → botones: cámaras de zona, outliers zona, boxplot
- Cámara → botones: comparar zona, similares, causas, exportar

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

      // ── Extraer bloques
      let sugerencias = [];
      const sugMatch = respuesta.match(/SUGGESTIONS_START\s*([\s\S]*?)\s*SUGGESTIONS_END/);
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

      // ── Drill-down — siempre aparece (fallback si Claude no genera)
      if (drillActions.length > 0) {
        UI.mostrarDrillDown(drillActions);
      } else {
        const minas = DataManager.metadatos ? DataManager.metadatos.minas : [];
        const fallback = [
          { label: "Desglose por mina", prompt: "Desglose por mina " + (minas.join(", ") || "ATE, MGD, SOT") + ": dilución y recuperación ponderadas" },
          { label: "Top 5 outliers", prompt: "Top 5 cámaras con mayor dilución ponderada del dataset" },
          { label: "Evolución temporal", prompt: "Evolución anual de dilución y recuperación ponderadas" }
        ];
        UI.mostrarDrillDown(fallback);
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
