// ============================================================
//  charts.js  —  Renderizado Chart.js y Plotly
//  Versión 3.0
// ============================================================

const ChartManager = {
  instancias: [],

  // ── CHART.JS ──────────────────────────────────────────────
  renderChartJS(spec) {
    try {
      // Normalizar tipos inválidos — Chart.js 4 no tiene "barh"
      if (spec.type === "barh") {
        spec.type = "bar";
        if (!spec.options) spec.options = {};
        spec.options.indexAxis = "y";
      }
      const tiposValidos = ["bar","line","pie","doughnut","scatter","bubble","radar","polarArea"];
      if (!tiposValidos.includes(spec.type)) spec.type = "bar";

      const colors = CONFIG.COLORES.palette;

      if (spec.data && spec.data.datasets) {
        spec.data.datasets.forEach((ds, i) => {
          if (!ds.backgroundColor || ds.backgroundColor === "..." || typeof ds.backgroundColor === "function") {
            ds.backgroundColor = spec.type === "line"
              ? colors[i % colors.length]
              : spec.data.labels.map((_, j) => colors[j % colors.length]);
          }
          if (spec.type === "line") {
            ds.borderColor = ds.borderColor || colors[i % colors.length];
            ds.tension = 0.3;
            ds.fill = false;
          }
        });
      }

      if (!spec.options) spec.options = {};
      if (!spec.options.plugins) spec.options.plugins = {};
      spec.options.responsive = true;
      spec.options.maintainAspectRatio = true;
      spec.options.plugins.legend = {
        labels: { font: { family: "Segoe UI", size: 11 }, color: "#1a1a1a" }
      };
      if (spec.options.plugins.title) {
        spec.options.plugins.title.font = { family: "Segoe UI", size: 13, weight: "bold" };
        spec.options.plugins.title.color = CONFIG.COLORES.secundario;
        spec.options.plugins.title.display = true;
      }

      const titulo = spec.options?.plugins?.title?.text || "Gráfica";
      const wrapper = this._crearWrapper();
      const canvas = document.createElement("canvas");
      wrapper.appendChild(canvas);
      this._mostrarEnPanel(wrapper, titulo);

      const instancia = new Chart(canvas, spec);
      this.instancias.push(instancia);
    } catch (e) {
      UI.addMsg("⚠️ No se pudo renderizar la gráfica Chart.js: " + e.message, "ai");
    }
  },

  // ── PLOTLY ────────────────────────────────────────────────
  renderPlotly(spec) {
    try {
      if (!spec.layout) spec.layout = {};
      spec.layout.font        = { family: "Segoe UI", size: 11, color: "#1a1a1a" };
      spec.layout.paper_bgcolor = "#ffffff";
      spec.layout.plot_bgcolor  = "#f9f9f9";
      spec.layout.height      = 280;
      spec.layout.margin      = { t: 40, b: 40, l: 50, r: 20 };

      // Colorear series con paleta corporativa si no tienen color
      if (spec.data) {
        spec.data.forEach((trace, i) => {
          if (!trace.marker) trace.marker = {};
          if (!trace.marker.color) {
            trace.marker.color = CONFIG.COLORES.palette[i % CONFIG.COLORES.palette.length];
          }
        });
      }

      const titulo = spec.layout?.title || "Gráfica";
      const wrapper = this._crearWrapper();
      const div = document.createElement("div");
      div.style.width = "100%";
      wrapper.appendChild(div);
      this._mostrarEnPanel(wrapper, titulo);

      Plotly.newPlot(div, spec.data, spec.layout, { responsive: true, displayModeBar: false });
    } catch (e) {
      UI.addMsg("⚠️ No se pudo renderizar la gráfica Plotly: " + e.message, "ai");
    }
  },

  // ── GRÁFICAS DIRECTAS (sin pasar por Claude) ─────────────
  graficarBoxplotZonas(metrica = "dil") {
    const zonas = {};
    DataManager.datos.forEach(d => {
      const z = d[CONFIG.CAMPOS.zona] || "Sin zona";
      if (!zonas[z]) zonas[z] = [];
      zonas[z].push(metrica === "dil" ? d._dil * 100 : d._rec * 100);
    });

    const traces = Object.entries(zonas).map(([zona, vals], i) => ({
      type: "box",
      y: vals,
      name: zona,
      marker: { color: CONFIG.COLORES.palette[i % CONFIG.COLORES.palette.length] }
    }));

    this.renderPlotly({
      data: traces,
      layout: {
        title: metrica === "dil" ? "Distribución de Dilución por Zona (%)" : "Distribución de Recuperación por Zona (%)",
        yaxis: { title: "%" }
      }
    });
  },

  graficarHeatmapCorrelacion() {
    const campos = ["_dil", "_rec", "_pvt"];
    const labels = ["Dilución", "Recuperación", "P&V t"];
    const n = DataManager.datos.length;

    const matrix = campos.map(c1 =>
      campos.map(c2 => {
        const v1 = DataManager.datos.map(d => d[c1]);
        const v2 = DataManager.datos.map(d => d[c2]);
        const m1 = v1.reduce((a, b) => a + b, 0) / n;
        const m2 = v2.reduce((a, b) => a + b, 0) / n;
        const cov = v1.map((v, i) => (v - m1) * (v2[i] - m2)).reduce((a, b) => a + b, 0) / n;
        const s1 = Math.sqrt(v1.map(v => (v - m1) ** 2).reduce((a, b) => a + b, 0) / n);
        const s2 = Math.sqrt(v2.map(v => (v - m2) ** 2).reduce((a, b) => a + b, 0) / n);
        return s1 && s2 ? +(cov / (s1 * s2)).toFixed(3) : 0;
      })
    );

    this.renderPlotly({
      data: [{
        z: matrix,
        x: labels,
        y: labels,
        type: "heatmap",
        colorscale: [[0, "#2C1810"], [0.5, "#f4f4f4"], [1, "#E8401C"]],
        text: matrix.map(row => row.map(v => v.toFixed(2))),
        texttemplate: "%{text}",
        showscale: true
      }],
      layout: { title: "Matriz de Correlación" }
    });
  },

  // ── HELPER: PROCESAR RESPUESTA ────────────────────────────
  procesarRespuesta(textoLimpio) {
    if (textoLimpio && textoLimpio.trim()) {
      UI.addMsg(textoLimpio, "ai");
    }
  },

  // Con registro en índice lateral
  procesarRespuestaConIndice(textoLimpio, titulo) {
    if (textoLimpio && textoLimpio.trim()) {
      UI.addMsg(textoLimpio, "ai", { titulo: titulo, tipo: "chat" });
    }
  },

  // ── HELPERS ───────────────────────────────────────────────
  _crearWrapper() {
    const wrapper = document.createElement("div");
    wrapper.className = "chart-container";
    wrapper.style.width = "100%";
    return wrapper;
  },

  _mostrarEnPanel(wrapper, titulo) {
    const panel = document.getElementById("chart-panel");
    const content = document.getElementById("chart-panel-content");
    const tituloEl = document.getElementById("chart-panel-titulo");
    if (!panel || !content) return;
    // Limpiar gráfica anterior
    content.innerHTML = "";
    content.appendChild(wrapper);
    if (tituloEl) tituloEl.textContent = titulo || "Visualización";
    panel.classList.add("visible");
    document.getElementById("main-layout").classList.add("con-grafica");
  },

  ocultarPanel() {
    const panel = document.getElementById("chart-panel");
    if (panel) panel.classList.remove("visible");
    document.getElementById("main-layout")?.classList.remove("con-grafica");
  },

  _scroll() {
    const chat = document.getElementById("chat");
    if (chat) chat.scrollTop = chat.scrollHeight;
  }
};
