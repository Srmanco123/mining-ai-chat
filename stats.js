// Motor estadístico local — regresiones, correlaciones, R²
const StatsManager = {

  // Regresión lineal simple: y = a + b*x
  regresionLineal(xs, ys) {
    const n = xs.length;
    if (n < 3) return null;
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    if (den === 0) return null;
    const b = num / den;
    const a = my - b * mx;
    // R²
    const yhat = xs.map(x => a + b * x);
    const ssTot = ys.reduce((s, v) => s + (v - my) ** 2, 0);
    const ssRes = ys.reduce((s, v, i) => s + (v - yhat[i]) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    return { a, b, r2, mx, my, n };
  },

  // Correlación de Pearson entre dos arrays
  pearson(xs, ys) {
    const n = xs.length;
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) ** 2;
      dy += (ys[i] - my) ** 2;
    }
    const denom = Math.sqrt(dx * dy);
    return denom > 0 ? num / denom : 0;
  },

  // Extraer arrays de datos del DataManager
  _getArray(campo) {
    return DataManager.datos.map(d => {
      if (campo.startsWith("_")) return d[campo] || 0;
      return parseFloat(d[campo]) || 0;
    }).filter(v => isFinite(v) && v > 0);
  },

  _getArrayPairs(campoX, campoY) {
    const pairs = DataManager.datos
      .map(d => {
        const x = campoX.startsWith("_") ? d[campoX] : parseFloat(d[campoX]);
        const y = campoY.startsWith("_") ? d[campoY] : parseFloat(d[campoY]);
        return [x, y];
      })
      .filter(([x, y]) => isFinite(x) && isFinite(y) && x > 0 && y >= 0);
    return { xs: pairs.map(p => p[0]), ys: pairs.map(p => p[1]) };
  },

  // Labels legibles para campos
  _label(campo) {
    const map = { _pvt: "P&V t", _dil: "Dilución %", _rec: "Recuperación %", Sobrexcavacion_tn: "Sobreexcavación tn", Subexcavacion_tn: "Subexcavación tn", Ratio_tn_m: "Ratio tn/m" };
    return map[campo] || campo;
  },

  // Renderizar según tipo de spec
  renderStats(spec) {
    if (spec.type === "regression") {
      this._renderRegression(spec);
    } else if (spec.type === "correlation") {
      this._renderCorrelationMatrix(spec);
    }
  },

  _renderRegression(spec) {
    const { xs, ys } = this._getArrayPairs(spec.x, spec.y);
    if (xs.length < 5) { UI.addMsg("Datos insuficientes para calcular la regresión.", "ai"); return; }

    const reg = this.regresionLineal(xs, ys);
    if (!reg) { UI.addMsg("No se pudo calcular la regresión (varianza cero).", "ai"); return; }

    const labelX = this._label(spec.x);
    const labelY = this._label(spec.y);
    const sign = reg.b >= 0 ? "+" : "";

    // Resumen textual
    const r2pct = (reg.r2 * 100).toFixed(1);
    const fuerza = reg.r2 > 0.6 ? "fuerte" : reg.r2 > 0.3 ? "moderada" : "débil";
    const dir = reg.b > 0 ? "positiva" : "negativa";
    UI.addMsg(
      "**Regresión lineal: " + labelX + " → " + labelY + "**\n" +
      "R² = **" + r2pct + "%** — correlación " + fuerza + " " + dir + " (" + reg.n + " cámaras)\n" +
      "Ecuación: " + labelY + " = " + reg.a.toFixed(4) + " " + sign + " " + reg.b.toFixed(6) + " × " + labelX,
      "ai"
    );

    // Scatter + línea de regresión con Plotly
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const lineX = [xMin, xMax];
    const lineY = lineX.map(x => reg.a + reg.b * x);

    ChartManager.renderPlotly({
      data: [
        {
          type: "scatter", mode: "markers",
          x: xs, y: ys.map(v => parseFloat((v * 100).toFixed(2))),
          marker: { color: "#E8401C", opacity: 0.5, size: 6 },
          name: "Cámaras"
        },
        {
          type: "scatter", mode: "lines",
          x: lineX, y: lineY.map(v => parseFloat((v * 100).toFixed(2))),
          line: { color: "#2C1810", width: 2, dash: "dash" },
          name: "Regresión (R²=" + r2pct + "%)"
        }
      ],
      layout: {
        title: labelX + " vs " + labelY,
        xaxis: { title: labelX },
        yaxis: { title: labelY + " (%)" },
        showlegend: true
      }
    });
  },

  _renderCorrelationMatrix(spec) {
    const vars = spec.vars || ["_pvt", "_dil", "_rec"];
    const labels = vars.map(v => this._label(v));
    const n = vars.length;
    const matrix = [];
    const text = [];

    for (let i = 0; i < n; i++) {
      matrix.push([]);
      text.push([]);
      const yi = DataManager.datos.map(d => vars[i].startsWith("_") ? d[vars[i]] : parseFloat(d[vars[i]])).filter(isFinite);
      for (let j = 0; j < n; j++) {
        const yj = DataManager.datos.map(d => vars[j].startsWith("_") ? d[vars[j]] : parseFloat(d[vars[j]])).filter(isFinite);
        const minLen = Math.min(yi.length, yj.length);
        const r = this.pearson(yi.slice(0, minLen), yj.slice(0, minLen));
        matrix[i].push(parseFloat(r.toFixed(3)));
        text[i].push(r.toFixed(2));
      }
    }

    ChartManager.renderPlotly({
      data: [{
        type: "heatmap",
        z: matrix,
        x: labels,
        y: labels,
        text: text,
        texttemplate: "%{text}",
        colorscale: [["0", "#2C1810"], ["0.5", "#f4f4f4"], ["1", "#E8401C"]],
        zmin: -1, zmax: 1
      }],
      layout: {
        title: "Matriz de correlaciones (Pearson)",
        xaxis: { side: "bottom" }
      }
    });

    // Resumen de correlaciones relevantes
    let msg = "**Correlaciones destacadas:**\n";
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const r = matrix[i][j];
        const abs = Math.abs(r);
        if (abs > 0.3) {
          const fuerza = abs > 0.6 ? "fuerte" : "moderada";
          const dir = r > 0 ? "positiva" : "negativa";
          msg += "· " + labels[i] + " ↔ " + labels[j] + ": r = **" + r.toFixed(2) + "** (" + fuerza + " " + dir + ")\n";
        }
      }
    }
    UI.addMsg(msg, "ai");
  }
};
