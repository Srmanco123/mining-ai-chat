// ============================================================
//  data.js  —  Carga CSV, cálculo de métricas, estadísticas
//  Versión 3.1 — Outliers P25/P75 dinámicos + RAW condicional
// ============================================================

const DataManager = {
  datos: [],
  metadatos: null,

  cargarCSV(file, onComplete) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        this.datos = results.data.map(row => ({
          ...row,
          _dil: CONFIG.calcDilucion(row),
          _rec: CONFIG.calcRecuperacion(row),
          _pvt: parseFloat(row[CONFIG.CAMPOS.pvt]) || 0
        }));
        this.metadatos = this._calcularMetadatos();
        onComplete(this.metadatos);
      }
    });
  },

  _calcularMetadatos() {
    const datos = this.datos;
    const minas = [...new Set(datos.map(d => d[CONFIG.CAMPOS.mina]).filter(Boolean))];
    const zonas = [...new Set(datos.map(d => d[CONFIG.CAMPOS.zona]).filter(Boolean))];

    const dils = datos.map(d => d._dil).sort((a, b) => a - b);
    const recs = datos.map(d => d._rec).sort((a, b) => a - b);

    // Fechas
    const fechas = datos
      .map(d => d[CONFIG.CAMPOS.fecha])
      .filter(Boolean)
      .sort();

    const dil_p25 = this._percentil(dils, 0.25);
    const dil_p50 = this._percentil(dils, 0.50);
    const dil_p75 = this._percentil(dils, 0.75);
    const rec_p25 = this._percentil(recs, 0.25);
    const rec_p50 = this._percentil(recs, 0.50);
    const rec_p75 = this._percentil(recs, 0.75);

    // Outliers con P25/P75 dinámicos (coherente con Power BI)
    // Dilución → outlier si está por ENCIMA de P75 (dilución alta es mala)
    // Recuperación → outlier si está por DEBAJO de P25 (recuperación baja es mala)
    return {
      total: datos.length,
      minas,
      zonas,
      fecha_min: fechas[0] || "—",
      fecha_max: fechas[fechas.length - 1] || "—",
      dil_p25, dil_p50, dil_p75,
      rec_p25, rec_p50, rec_p75,
      outliers_dil: datos.filter(d => d._dil > dil_p75).length,
      outliers_rec: datos.filter(d => d._rec < rec_p25).length
    };
  },

  _percentil(arr, p) {
    if (!arr.length) return 0;
    const idx = Math.floor(arr.length * p);
    return arr[Math.min(idx, arr.length - 1)];
  },

  // ── UMBRALES DINÁMICOS ────────────────────────────────────
  // Devuelve los umbrales de alerta actualmente en uso.
  // Si hay dataset con suficientes cámaras (n >= 4) usa P25/P75 dinámicos.
  // Si no, cae al fallback de CONFIG.ALERTAS.
  umbralesDinamicos() {
    if (this.metadatos && this.datos.length >= 4) {
      return {
        dilucion_alta:      this.metadatos.dil_p75,
        dilucion_media:     this.metadatos.dil_p50,
        recuperacion_baja:  this.metadatos.rec_p25,
        recuperacion_media: this.metadatos.rec_p50,
        fuente: "P25/P75 dinámicos del dataset"
      };
    }
    return {
      dilucion_alta:      CONFIG.ALERTAS.dilucion_alta,
      dilucion_media:     CONFIG.ALERTAS.dilucion_media,
      recuperacion_baja:  CONFIG.ALERTAS.recuperacion_baja,
      recuperacion_media: CONFIG.ALERTAS.recuperacion_media,
      fuente: "fallback fijo (dataset insuficiente)"
    };
  },

  // ── POR ZONA ──────────────────────────────────────────────
  porZona() {
    const zonas = {};
    this.datos.forEach(d => {
      const z = d[CONFIG.CAMPOS.zona] || "Sin zona";
      if (!zonas[z]) zonas[z] = { sobre: 0, sub: 0, pvt: 0, n: 0 };
      zonas[z].sobre += parseFloat(d[CONFIG.CAMPOS.sobreexcavacion]) || 0;
      zonas[z].sub   += parseFloat(d[CONFIG.CAMPOS.subexcavacion])   || 0;
      zonas[z].pvt   += d._pvt;
      zonas[z].n++;
    });
    return Object.entries(zonas).map(([zona, v]) => ({
      zona,
      dil: v.pvt > 0 ? Math.min(1, Math.max(0, v.sobre / v.pvt)) : 0,
      rec: v.pvt > 0 ? Math.min(1, Math.max(0, 1 - v.sub / v.pvt)) : 0,
      n: v.n,
      pvt: v.pvt
    })).sort((a, b) => b.pvt - a.pvt);
  },

  // ── POR MINA ──────────────────────────────────────────────
  porMina() {
    const minas = {};
    this.datos.forEach(d => {
      const m = d[CONFIG.CAMPOS.mina] || "Sin mina";
      if (!minas[m]) minas[m] = { sobre: 0, sub: 0, pvt: 0, n: 0 };
      minas[m].sobre += parseFloat(d[CONFIG.CAMPOS.sobreexcavacion]) || 0;
      minas[m].sub   += parseFloat(d[CONFIG.CAMPOS.subexcavacion])   || 0;
      minas[m].pvt   += d._pvt;
      minas[m].n++;
    });
    return Object.entries(minas).map(([mina, v]) => ({
      mina,
      dil: v.pvt > 0 ? Math.min(1, Math.max(0, v.sobre / v.pvt)) : 0,
      rec: v.pvt > 0 ? Math.min(1, Math.max(0, 1 - v.sub / v.pvt)) : 0,
      n: v.n,
      pvt: v.pvt
    }));
  },

  // ── POR PERÍODO (anual) ───────────────────────────────────
  porPeriodo() {
    const periodos = {};
    this.datos.forEach(d => {
      const fecha = d[CONFIG.CAMPOS.fecha];
      if (!fecha) return;
      const año = String(fecha).substring(0, 4);
      if (!año || isNaN(año)) return;
      if (!periodos[año]) periodos[año] = { sobre: 0, sub: 0, pvt: 0, n: 0 };
      periodos[año].sobre += parseFloat(d[CONFIG.CAMPOS.sobreexcavacion]) || 0;
      periodos[año].sub   += parseFloat(d[CONFIG.CAMPOS.subexcavacion])   || 0;
      periodos[año].pvt   += d._pvt;
      periodos[año].n++;
    });
    return Object.entries(periodos)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([año, v]) => ({
        periodo: año,
        dil: v.pvt > 0 ? Math.min(1, Math.max(0, v.sobre / v.pvt)) : 0,
        rec: v.pvt > 0 ? Math.min(1, Math.max(0, 1 - v.sub / v.pvt)) : 0,
        n: v.n,
        pvt: v.pvt
      }));
  },

  // ── TOP OUTLIERS ──────────────────────────────────────────
  topOutliers(n = 10) {
    return this.datos
      .map(d => ({
        stope: d[CONFIG.CAMPOS.id],
        mina:  d[CONFIG.CAMPOS.mina],
        zona:  d[CONFIG.CAMPOS.zona],
        dil:   d._dil,
        rec:   d._rec,
        pvt:   d._pvt,
        score: d._dil + (1 - d._rec) // métrica combinada
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  },

  // ── ALERTAS (usando P25/P75 dinámicos) ────────────────────
  // Mantiene la misma interfaz pública para ui.js.
  // Internamente usa umbrales dinámicos coherentes con Power BI.
  alertas() {
    const u = this.umbralesDinamicos();
    const criticas = this.datos.filter(d =>
      d._dil > u.dilucion_alta ||
      d._rec < u.recuperacion_baja
    );
    const medias = this.datos.filter(d =>
      !criticas.includes(d) && (
        d._dil > u.dilucion_media ||
        d._rec < u.recuperacion_media
      )
    );
    return { criticas, medias, umbrales: u };
  },

  // ── BÚSQUEDA DE CÁMARAS POR ID ────────────────────────────
  // Detecta IDs de cámara mencionados en un prompt y devuelve los
  // registros correspondientes. Usado para enviar RAW condicional.
  buscarCamarasEnPrompt(prompt) {
    if (!this.datos || !this.datos.length) return [];
    const ids = new Set(this.datos.map(d => String(d[CONFIG.CAMPOS.id] || "").trim()).filter(Boolean));
    const encontradas = [];
    const promptLower = prompt.toLowerCase();
    for (const id of ids) {
      if (!id) continue;
      // match insensible a mayúsculas, pero requiere al menos 3 chars del ID
      if (id.length >= 3 && promptLower.includes(id.toLowerCase())) {
        const registro = this.datos.find(d => String(d[CONFIG.CAMPOS.id]).trim() === id);
        if (registro) encontradas.push(registro);
      }
    }
    return encontradas;
  },

  // ── BUILD CONTEXTO PARA CLAUDE ────────────────────────────
  // Construye el resumen estadístico compacto que se envía a la IA.
  // Los registros en BRUTO sólo se incluyen si `promptUsuario` menciona
  // un ID de cámara específico (se limita a MAX_REGISTROS_IA, típicamente 20).
  buildContexto(contextoURL, promptUsuario = "") {
    if (!this.datos || this.datos.length === 0) {
      return contextoURL
        ? `Contexto Power BI: ${contextoURL}\nSin datos CSV cargados aún.`
        : "Sin datos cargados.";
    }

    const m        = this.metadatos;
    const zonas    = this.porZona();
    const minas    = this.porMina();
    const periodos = this.porPeriodo();
    const alerta   = this.alertas();
    const u        = alerta.umbrales;

    // Resumen estadístico compacto (siempre)
    let ctx = `=== DATASET (${m.total} cámaras) ===
Minas: ${m.minas.join(", ")}
Zonas (${m.zonas.length}): ${m.zonas.join(", ")}
Período: ${m.fecha_min} – ${m.fecha_max}

PERCENTILES GLOBALES:
- Dilución: P25=${(m.dil_p25*100).toFixed(1)}% | P50=${(m.dil_p50*100).toFixed(1)}% | P75=${(m.dil_p75*100).toFixed(1)}%
- Recuperación: P25=${(m.rec_p25*100).toFixed(1)}% | P50=${(m.rec_p50*100).toFixed(1)}% | P75=${(m.rec_p75*100).toFixed(1)}%

UMBRALES DE ALERTA (${u.fuente}):
- Dilución crítica si > ${(u.dilucion_alta*100).toFixed(1)}% | intermedia si > ${(u.dilucion_media*100).toFixed(1)}%
- Recuperación crítica si < ${(u.recuperacion_baja*100).toFixed(1)}% | intermedia si < ${(u.recuperacion_media*100).toFixed(1)}%

ALERTAS: ${alerta.criticas.length} críticas | ${alerta.medias.length} intermedias

POR ZONA (ponderado por volumen):
${zonas.map(z => `  ${z.zona}: Dil=${(z.dil*100).toFixed(1)}% | Rec=${(z.rec*100).toFixed(1)}% | ${z.n} cámaras | PVt=${z.pvt.toFixed(0)}t`).join("\n")}

POR MINA:
${minas.map(mn => `  ${mn.mina}: Dil=${(mn.dil*100).toFixed(1)}% | Rec=${(mn.rec*100).toFixed(1)}% | ${mn.n} cámaras`).join("\n")}

EVOLUCIÓN ANUAL:
${periodos.map(p => `  ${p.periodo}: Dil=${(p.dil*100).toFixed(1)}% | Rec=${(p.rec*100).toFixed(1)}% | ${p.n} cámaras`).join("\n")}
`;

    // Alertas críticas (siempre las primeras 10 — es información de valor)
    if (alerta.criticas.length > 0) {
      ctx += `\nALERTAS CRÍTICAS (primeras ${Math.min(10, alerta.criticas.length)}):\n`;
      alerta.criticas.slice(0, 10).forEach(d => {
        ctx += `  ${d[CONFIG.CAMPOS.id]} [${d[CONFIG.CAMPOS.mina]}/${d[CONFIG.CAMPOS.zona]}] — Dil:${(d._dil*100).toFixed(1)}% Rec:${(d._rec*100).toFixed(1)}% PVt:${d._pvt.toFixed(0)}t\n`;
      });
    }

    // ── DATOS EN BRUTO — SÓLO SI EL PROMPT MENCIONA UNA CÁMARA ──
    // Esto ahorra ~40k tokens por petición en el 90% de los casos.
    const camarasEnPrompt = this.buscarCamarasEnPrompt(promptUsuario);
    if (camarasEnPrompt.length > 0) {
      ctx += `\nDATA RAW (${camarasEnPrompt.length} cámara${camarasEnPrompt.length > 1 ? 's' : ''} mencionada${camarasEnPrompt.length > 1 ? 's' : ''} en el prompt):\n`;
      ctx += JSON.stringify(camarasEnPrompt);
    }

    if (contextoURL) ctx += `\n\nFILTRO POWER BI ACTIVO: ${contextoURL}`;

    return ctx;
  }
};
