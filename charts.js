const ChartManager = {
  instancias: [],

  renderChartJS(spec) {
    try {
      const colors = CONFIG.COLORES.palette;
      if (spec.data && spec.data.datasets) {
        spec.data.datasets.forEach((ds, i) => {
          if (!ds.backgroundColor || ds.backgroundColor === "..." || typeof ds.backgroundColor === "function") {
            ds.backgroundColor = spec.type === "line"
              ? colors[i % colors.length]
              : spec.data.labels.map((_, j) => colors[j % colors.length]);
          }
          if (spec.type === "line") {
            ds.borderColor = colors[i % colors.length];
            ds.tension = 0.3;
            ds.fill = false;
          }
        });
      }
      if (!spec.options) spec.options = {};
      if (!spec.options.plugins) spec.options.plugins = {};
      spec.options.responsive = true;
      spec.options.maintainAspectRatio = true;
      spec.options.plugins.legend = { labels: { font: { family: "Segoe UI", size: 11 }, color: "#1a1a1a" } };
      if (spec.options.plugins.title) {
        spec.options.plugins.title.font = { family: "Segoe UI", size: 13, weight: "bold" };
        spec.options.plugins.title.color = CONFIG.COLORES.secundario;
        spec.options.plugins.title.display = true;
      }
      const wrapper = this._crearWrapper();
      const canvas = document.createElement("canvas");
      canvas.style.maxHeight = "220px";
      wrapper.appendChild(canvas);
      document.getElementById("chat").appendChild(wrapper);
      const instancia = new Chart(canvas, spec);
      this.instancias.push(instancia);
      this._scroll();
    } catch(e) {
      UI.addMsg("No se pudo renderizar la gráfica Chart.js: " + e.message, "ai");
    }
  },

  renderPlotly(spec) {
    try {
      if (!spec.layout) spec.layout = {};
      spec.layout.font = { family: "Segoe UI", size: 11, color: "#1a1a1a" };
      spec.layout.paper_bgcolor = "#ffffff";
      spec.layout.plot_bgcolor = "#f9f9f9";
      spec.layout.height = 280;
      spec.layout.margin = { t: 40, b: 60, l: 60, r: 20 };
      if (!spec.layout.colorway) spec.layout.colorway = CONFIG.COLORES.palette;
      if (spec.layout.title && typeof spec.layout.title === "string") {
        spec.layout.title = { text: spec.layout.title, font: { size: 13, color: CONFIG.COLORES.secundario, family: "Segoe UI" } };
      }
      const wrapper = this._crearWrapper();
      const div = document.createElement("div");
      wrapper.appendChild(div);
      document.getElementById("chat").appendChild(wrapper);
      Plotly.newPlot(div, spec.data, spec.layout, { responsive: true, displayModeBar: false });
      this._scroll();
    } catch(e) {
      UI.addMsg("No se pudo renderizar la gráfica Plotly: " + e.message, "ai");
    }
  },

  // ── RESUMEN EJECUTIVO: barras dil/rec por zona ─────────────────────
  graficarResumenZonas() {
    const datos = DataManager.porZona().sort((a, b) => a.dil - b.dil);
    const colores = datos.map(d => {
      if (d.dil > 0.30) return "#E24B4A";
      if (d.dil > 0.20) return "#EF9F27";
      return "#1D9E75";
    });
    this.renderPlotly({
      data: [
        {
          x: datos.map(d => d.zona),
          y: datos.map(d => +(d.dil * 100).toFixed(1)),
          name: "Dilución ponderada %",
          type: "bar",
          marker: { color: colores }
        },
        {
          x: datos.map(d => d.zona),
          y: datos.map(d => +(d.rec * 100).toFixed(1)),
          name: "Recuperación ponderada %",
          type: "bar",
          marker: { color: CONFIG.COLORES.secundario, opacity: 0.75 }
        }
      ],
      layout: {
        title: "Dilución y Recuperación ponderada por Zona",
        barmode: "group",
        yaxis: { title: "%" },
        legend: { orientation: "h", y: -0.25 }
      }
    });
  },

  // ── RESUMEN EJECUTIVO: scatter dil vs rec por stope ────────────────
  graficarScatterDilRec() {
    const datos = DataManager.datos;
    const colores = datos.map(d => {
      if (d._dil > 0.30 && d._rec < 0.80) return "#2C1810";
      if (d._dil > 0.30) return "#E24B4A";
      if (d._rec < 0.80) return "#EF9F27";
      return "#1D9E75";
    });
    const m = DataManager.metadatos;
    this.renderPlotly({
      data: [
        {
          x: datos.map(d => +(d._dil * 100).toFixed(1)),
          y: datos.map(d => +(d._rec * 100).toFixed(1)),
          mode: "markers",
          type: "scatter",
          text: datos.map(d => d[CONFIG.CAMPOS.id] + " (" + d[CONFIG.CAMPOS.zona] + ")"),
          hovertemplate: "%{text}<br>Dil: %{x}% | Rec: %{y}%<extra></extra>",
          marker: { color: colores, size: 7, opacity: 0.75 }
        },
        // Líneas de referencia P50
        {
          x: [m.dil_p50 * 100, m.dil_p50 * 100],
          y: [0, 100],
          mode: "lines",
          type: "scatter",
          line: { color: "#aaa", dash: "dash", width: 1 },
          name: "P50 dilución",
          hoverinfo: "skip"
        },
        {
          x: [0, 100],
          y: [m.rec_p50 * 100, m.rec_p50 * 100],
          mode: "lines",
          type: "scatter",
          line: { color: "#aaa", dash: "dash", width: 1 },
          name: "P50 recuperación",
          hoverinfo: "skip"
        }
      ],
      layout: {
        title: "Dispersión Dilución vs Recuperación por Stope",
        xaxis: { title: "Dilución ponderada (%)", range: [0, Math.min(100, (m.dil_p75 * 100 * 2))] },
        yaxis: { title: "Recuperación ponderada (%)", range: [Math.max(0, (m.rec_p25 * 100 - 20)), 100] },
        legend: { orientation: "h", y: -0.25 },
        showlegend: true
      }
    });
  },

  // ── RESTO DE GRÁFICAS EXISTENTES ───────────────────────────────────
  graficarComparativaZonas() {
    const datos = DataManager.porZona();
    this.renderPlotly({
      data: [
        { x: datos.map(d => d.zona), y: datos.map(d => +(d.dil * 100).toFixed(1)), name: "Dilución %", type: "bar", marker: { color: CONFIG.COLORES.primario } },
        { x: datos.map(d => d.zona), y: datos.map(d => +(d.rec * 100).toFixed(1)), name: "Recuperación %", type: "bar", marker: { color: CONFIG.COLORES.secundario } }
      ],
      layout: { title: "Dilución y Recuperación por Zona (ponderado por volumen)", barmode: "group", yaxis: { title: "%" } }
    });
  },

  graficarEvolucionTemporal() {
    const datos = DataManager.porPeriodo();
    this.renderPlotly({
      data: [
        { x: datos.map(d => d.periodo), y: datos.map(d => +(d.dil * 100).toFixed(1)), name: "Dilución %", type: "scatter", mode: "lines+markers", line: { color: CONFIG.COLORES.primario, width: 2 }, marker: { size: 6 } },
        { x: datos.map(d => d.periodo), y: datos.map(d => +(d.rec * 100).toFixed(1)), name: "Recuperación %", type: "scatter", mode: "lines+markers", line: { color: CONFIG.COLORES.secundario, width: 2 }, marker: { size: 6 } }
      ],
      layout: { title: "Evolución Temporal de Dilución y Recuperación", yaxis: { title: "%" } }
    });
  },

  graficarBoxplotZonas() {
    const zonas = [...new Set(DataManager.datos.map(d => d[CONFIG.CAMPOS.zona]).filter(Boolean))];
    const traces = zonas.map(z => ({
      y: DataManager.datos.filter(d => d[CONFIG.CAMPOS.zona] === z).map(d => +(d._dil * 100).toFixed(1)),
      name: z, type: "box", boxpoints: "outliers", marker: { color: CONFIG.COLORES.primario }
    }));
    this.renderPlotly({ data: traces, layout: { title: "Distribución de Dilución por Zona (Boxplot)", yaxis: { title: "Dilución %" } } });
  },

  graficarDistribucionGauss(campo = "dil") {
    const valores = DataManager.datos.map(d => campo === "dil" ? d._dil : d._rec).filter(v => !isNaN(v));
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const std = Math.sqrt(valores.map(v => (v - media) ** 2).reduce((a, b) => a + b, 0) / valores.length);
    const bins = 30;
    const min = Math.min(...valores), max = Math.max(...valores);
    const step = (max - min) / bins;
    const histX = Array.from({ length: bins }, (_, i) => +(min + i * step).toFixed(3));
    const histY = histX.map(x => valores.filter(v => v >= x && v < x + step).length);
    const gaussX = Array.from({ length: 100 }, (_, i) => min + i * (max - min) / 99);
    const gaussY = gaussX.map(x => +(((1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - media) / std) ** 2)) * valores.length * step).toFixed(2));
    this.renderPlotly({
      data: [
        { x: histX.map(x => +(x * 100).toFixed(1)), y: histY, type: "bar", name: "Frecuencia", marker: { color: CONFIG.COLORES.primario, opacity: 0.7 } },
        { x: gaussX.map(x => +(x * 100).toFixed(1)), y: gaussY, type: "scatter", mode: "lines", name: "Curva normal", line: { color: CONFIG.COLORES.secundario, width: 2 } }
      ],
      layout: { title: "Distribución de " + (campo === "dil" ? "Dilución" : "Recuperación") + " con curva gaussiana", barmode: "overlay", xaxis: { title: "%" }, yaxis: { title: "Frecuencia" } }
    });
  },

  graficarHeatmapCorrelacion() {
    const campos = ["_dil", "_rec", "_pvt"];
    const labels = ["Dilución", "Recuperación", "P&V t"];
    const n = DataManager.datos.length;
    const matrix = campos.map(c1 => campos.map(c2 => {
      const v1 = DataManager.datos.map(d => d[c1]);
      const v2 = DataManager.datos.map(d => d[c2]);
      const m1 = v1.reduce((a, b) => a + b, 0) / n;
      const m2 = v2.reduce((a, b) => a + b, 0) / n;
      const cov = v1.map((v, i) => (v - m1) * (v2[i] - m2)).reduce((a, b) => a + b, 0) / n;
      const s1 = Math.sqrt(v1.map(v => (v - m1) ** 2).reduce((a, b) => a + b, 0) / n);
      const s2 = Math.sqrt(v2.map(v => (v - m2) ** 2).reduce((a, b) => a + b, 0) / n);
      return s1 && s2 ? +(cov / (s1 * s2)).toFixed(3) : 0;
    }));
    this.renderPlotly({
      data: [{ z: matrix, x: labels, y: labels, type: "heatmap", colorscale: [[0, "#2C1810"], [0.5, "#f4f4f4"], [1, "#E8401C"]], text: matrix.map(row => row.map(v => v.toFixed(2))), texttemplate: "%{text}", showscale: true }],
      layout: { title: "Matriz de Correlación" }
    });
  },

  _crearWrapper() {
    const wrapper = document.createElement("div");
    wrapper.className = "chart-wrapper";
    return wrapper;
  },

  _scroll() {
    const chat = document.getElementById("chat");
    chat.scrollTop = chat.scrollHeight;
  },

  procesarRespuesta(respuesta) {
    const chartMatch = respuesta.match(/CHART_JSON_START\s*([\s\S]*?)\s*CHART_JSON_END/);
    if (chartMatch) {
      try {
        const spec = JSON.parse(chartMatch[1]);
        UI.addMsg(respuesta.replace(/CHART_JSON_START[\s\S]*?CHART_JSON_END/, "").trim(), "ai");
        this.renderChartJS(spec);
        return;
      } catch(e) {
        UI.addMsg(respuesta.replace(/CHART_JSON_START[\s\S]*?CHART_JSON_END/, "").trim(), "ai");
        UI.addMsg("No se pudo generar la gráfica (JSON inválido).", "ai");
        return;
      }
    }
    const plotlyMatch = respuesta.match(/PLOTLY_JSON_START\s*([\s\S]*?)\s*PLOTLY_JSON_END/);
    if (plotlyMatch) {
      try {
        const spec = JSON.parse(plotlyMatch[1]);
        UI.addMsg(respuesta.replace(/PLOTLY_JSON_START[\s\S]*?PLOTLY_JSON_END/, "").trim(), "ai");
        this.renderPlotly(spec);
        return;
      } catch(e) {
        UI.addMsg(respuesta.replace(/PLOTLY_JSON_START[\s\S]*?PLOTLY_JSON_END/, "").trim(), "ai");
        UI.addMsg("No se pudo generar la gráfica Plotly (JSON inválido).", "ai");
        return;
      }
    }
    UI.addMsg(respuesta, "ai");
  }
};
