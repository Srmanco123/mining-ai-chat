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
Sé conciso pero completo. Usa datos concretos con números siempre que puedas.

REGLAS DE CALCULO OBLIGATORIAS:
- Dilución = MIN(1, MAX(0, Sobrexcavacion_tn / PVt)) — recalcula siempre desde datos brutos
- Recuperación = MIN(1, MAX(0, 1 - Subexcavacion_tn / PVt)) — recalcula siempre desde datos brutos
- Al agregar por zona o mina usa suma(Sobrexcavacion_tn) / suma(PVt) ponderado por volumen
- Indica siempre cuántas cámaras respaldan cada afirmación
- Valores siempre entre 0% y 100%

Contexto Power BI activo: ${this.contextoURL}
${DataManager.buildContexto(this.contextoURL)}

DETECCION DE AMBIGUEDAD:
Si la petición del usuario es ambigua o tiene varias interpretaciones posibles, NO ejecutes el análisis todavía.
En su lugar devuelve SOLO este bloque y nada más:
CLARIFY_START
{"pregunta": "¿Qué quieres exactamente?", "opciones": ["opcion1", "opcion2", "opcion3", "opcion4"]}
CLARIFY_END

REGLAS DE GRAFICAS:
Si el usuario pide una gráfica simple (barras, líneas, pie, doughnut) usa Chart.js:
CHART_JSON_START
{"type":"bar","data":{"labels":[...],"datasets":[{"label":"...","data":[...],"backgroundColor":"#E8401C"}]},"options":{"responsive":true,"plugins":{"title":{"display":true,"text":"..."}}}}
CHART_JSON_END

Si el usuario pide análisis avanzado (boxplot, violin, distribución, correlación, heatmap, scatter matrix) usa Plotly:
PLOTLY_JSON_START
{"data":[{"type":"box","y":[...],"name":"..."}],"layout":{"title":"..."}}
PLOTLY_JSON_END

RESTRICCIONES DE GRAFICAS — cumple SIEMPRE:
- Para Chart.js solo: bar, line, scatter, pie, doughnut — NUNCA boxplot ni violin
- Para Plotly: box, violin, histogram, heatmap, scatter — JSON 100% válido sin funciones
- backgroundColor en Chart.js: string o array de strings, NUNCA función
- Máximo 15 etiquetas en eje X para legibilidad
- Gráficas compactas y limpias
- NUNCA incluyas width ni height fijos en el layout de Plotly
- NUNCA uses Montecarlo ni simulaciones que requieran funciones en el JSON

SUGERENCIAS POST-RESPUESTA:
Al final de cada respuesta añade siempre este bloque con 3 preguntas de seguimiento relevantes:
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

      // Clarificación — detectar antes de cualquier otra cosa
      const clarifyMatch = respuesta.match(/CLARIFY_START\s*([\s\S]*?)\s*CLARIFY_END/);
      if (clarifyMatch) {
        try {
          const clarify = JSON.parse(clarifyMatch[1]);
          UI.mostrarClarificacion(clarify.pregunta, clarify.opciones, prompt);
          UI.setLoading(false);
          return;
        } catch(e) {}
      }

      // Extraer sugerencias antes de limpiar
      let sugerencias = [];
      const sugMatch = respuesta.match(/SUGGESTIONS_START\s*([\s\S]*?)\s*SUGGESTIONS_END/);
      if (sugMatch) {
        try { sugerencias = JSON.parse(sugMatch[1]); } catch(e) {}
      }

      // Extraer gráficas antes de limpiar
      const chartMatch = respuesta.match(/CHART_JSON_START\s*([\s\S]*?)\s*CHART_JSON_END/);
      const plotlyMatch = respuesta.match(/PLOTLY_JSON_START\s*([\s\S]*?)\s*PLOTLY_JSON_END/);

      // Limpiar TODOS los bloques especiales del texto
      const respuestaLimpia = respuesta
        .replace(/SUGGESTIONS_START[\s\S]*?SUGGESTIONS_END/g, "")
        .replace(/CLARIFY_START[\s\S]*?CLARIFY_END/g, "")
        .replace(/CHART_JSON_START[\s\S]*?CHART_JSON_END/g, "")
        .replace(/PLOTLY_JSON_START[\s\S]*?PLOTLY_JSON_END/g, "")
        .trim();

      // Mostrar texto limpio
      UI.addMsg(respuestaLimpia, "ai");

      // Renderizar Chart.js si existe
      if (chartMatch) {
        try {
          const spec = JSON.parse(chartMatch[1]);
          ChartManager.renderChartJS(spec);
        } catch(e) {
          UI.addMsg("No se pudo generar la gráfica (JSON inválido). Intenta reformular la petición.", "ai");
        }
      }

      // Renderizar Plotly si existe
      if (plotlyMatch) {
        try {
          const spec = JSON.parse(plotlyMatch[1]);
          // Eliminar width/height fijos si vienen del modelo
          if (spec.layout) {
            delete spec.layout.width;
            delete spec.layout.height;
          }
          ChartManager.renderPlotly(spec);
        } catch(e) {
          UI.addMsg("No se pudo generar la gráfica avanzada (JSON inválido). Intenta reformular la petición.", "ai");
        }
      }

      // Mostrar sugerencias
      if (sugerencias.length > 0) {
        UI.mostrarSugerencias(sugerencias);
      }

      // Guardar en historial con texto limpio
      this.historial.push({ p: prompt, r: respuestaLimpia });
      if (this.historial.length > 6) this.historial.shift();

    } catch(e) {
      UI.addMsg("Error de conexión: " + e.message, "ai");
    }

    UI.setLoading(false);
  },

  // Ejecutar acción rápida
  async ejecutarAccion(accionId) {
    const accion = CONFIG.ACCIONES.find(a => a.id === accionId);
    if (!accion) return;

    if (accionId === "presentacion") {
      UI.togglePresentacion();
      return;
    }
    if (accionId === "exportar") {
      ExportManager.exportarPDF();
      return;
    }
    if (accionId === "comparar") {
      ChartManager.graficarComparativaZonas();
      await this.enviar(accion.prompt);
      return;
    }
    if (accionId === "temporal") {
      ChartManager.graficarEvolucionTemporal();
      await this.enviar(accion.prompt);
      return;
    }
    if (accionId === "distribucion") {
      ChartManager.graficarBoxplotZonas();
      ChartManager.graficarDistribucionGauss("dil");
      await this.enviar(accion.prompt);
      return;
    }

    await this.enviar(accion.prompt);
  },

  // Alertas automáticas al cargar datos
  async analizarAlertas() {
    const alertas = DataManager.alertas();
    if (alertas.criticas.length === 0 && alertas.medias.length === 0) {
      UI.addMsg("✅ Sin alertas críticas detectadas en el dataset cargado.", "ai");
      return;
    }

    let msg = "";
    if (alertas.criticas.length > 0) {
      msg += `🔴 ${alertas.criticas.length} cámaras con alertas críticas (dilución > ${CONFIG.ALERTAS.dilucion_alta * 100}% o recuperación < ${CONFIG.ALERTAS.recuperacion_baja * 100}%):\n`;
      alertas.criticas.slice(0, 5).forEach(d => {
        msg += `  · ${d[CONFIG.CAMPOS.id]} — Dil: ${(d._dil * 100).toFixed(1)}% | Rec: ${(d._rec * 100).toFixed(1)}%\n`;
      });
      if (alertas.criticas.length > 5) msg += `  ... y ${alertas.criticas.length - 5} más.\n`;
    }
    if (alertas.medias.length > 0) {
      msg += `\n🟡 ${alertas.medias.length} cámaras con alertas intermedias.`;
    }
    UI.addMsg(msg, "ai");
  },

  limpiarHistorial() {
    this.historial = [];
    document.getElementById("chat").innerHTML = "";
    UI.addMsg("Historial limpiado. Puedes comenzar un nuevo análisis.", "ai");
  }
};
