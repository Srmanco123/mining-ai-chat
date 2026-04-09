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

    // Percentiles globales
    const dils = datos.map(d => d._dil).sort((a, b) => a - b);
    const recs = datos.map(d => d._rec).sort((a, b) => a - b);

    return {
      total: datos.length,
      minas,
      zonas,
      dil_p25: this._percentil(dils, 0.25),
      dil_p50: this._percentil(dils, 0.50),
      dil_p75: this._percentil(dils, 0.75),
      rec_p25: this._percentil(recs, 0.25),
      rec_p50: this._percentil(recs, 0.50),
      rec_p75: this._percentil(recs, 0.75),
      outliers_dil: datos.filter(d => d._dil > CONFIG.ALERTAS.dilucion_alta).length,
      outliers_rec: datos.filter(d => d._rec < CONFIG.ALERTAS.recuperacion_baja).length
    };
  },

  _percentil(arr, p) {
    if (!arr.length) return 0;
    const idx = Math.floor(arr.length * p);
    return arr[Math.min(idx, arr.length - 1)];
  },

  // Estadísticas por zona
  porZona() {
    const zonas = {};
    this.datos.forEach(d => {
      const z = d[CONFIG.CAMPOS.zona] || "Sin zona";
      if (!zonas[z]) zonas[z] = { sobre: 0, sub: 0, pvt: 0, n: 0 };
      zonas[z].sobre += parseFloat(d[CONFIG.CAMPOS.sobreexcavacion]) || 0;
      zonas[z].sub += parseFloat(d[CONFIG.CAMPOS.subexcavacion]) || 0;
      zonas[z].pvt += d._pvt;
      zonas[z].n++;
    });
    return Object.entries(zonas).map(([zona, v]) => ({
      zona,
      dil: v.pvt > 0 ? Math.min(1, Math.max(0, v.sobre / v.pvt)) : 0,
      rec: v.pvt > 0 ? Math.min(1, Math.max(0, 1 - v.sub / v.pvt)) : 0,
      n: v.n,
      pvt: v.pvt
    }));
  },

  // Estadísticas por mina
  porMina() {
    const minas = {};
    this.datos.forEach(d => {
      const m = d[CONFIG.CAMPOS.mina] || "Sin mina";
      if (!minas[m]) minas[m] = { sobre: 0, sub: 0, pvt: 0, n: 0 };
      minas[m].sobre += parseFloat(d[CONFIG.CAMPOS.sobreexcavacion]) || 0;
      minas[m].sub += parseFloat(d[CONFIG.CAMPOS.subexcavacion]) || 0;
      minas[m].pvt += d._pvt;
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

  // Top outliers
  topOutliers(n = 10) {
    return this.datos
      .map(d => ({
        stope: d[CONFIG.CAMPOS.id],
        mina: d[CONFIG.CAMPOS.mina],
        zona: d[CONFIG.CAMPOS.zona],
        dil: d._dil,
        rec: d._rec,
        pvt: d._pvt,
        score: d._dil - d._rec
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  },

  // Detección de alertas
  alertas() {
    const criticas = this.datos.filter(d =>
      d._dil > CONFIG.ALERTAS.dilucion_alta ||
      d._rec < CONFIG.ALERTAS.recuperacion_baja
    );
    const medias = this.datos.filter(d =>
      (d._dil > CONFIG.ALERTAS.dilucion_media && d._dil <= CONFIG.ALERTAS.dilucion_alta) ||
      (d._rec < CONFIG.ALERTAS.recuperacion_media && d._rec >= CONFIG.ALERTAS.recuperacion_baja)
    );
    return { criticas, medias };
  },

  // Evolución temporal
  porPeriodo() {
    const periodos = {};
    this.datos.forEach(d => {
      const fecha = d[CONFIG.CAMPOS.fecha];
      if (!fecha) return;
      const año = fecha.substring(0, 4);
      if (!año || isNaN(año)) return;
      if (!periodos[año]) periodos[año] = { sobre: 0, sub: 0, pvt: 0, n: 0 };
      periodos[año].sobre += parseFloat(d[CONFIG.CAMPOS.sobreexcavacion]) || 0;
      periodos[año].sub += parseFloat(d[CONFIG.CAMPOS.subexcavacion]) || 0;
      periodos[año].pvt += d._pvt;
      periodos[año].n++;
    });
    return Object.entries(periodos)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([año, v]) => ({
        periodo: año,
        dil: v.pvt > 0 ? Math.min(1, Math.max(0, v.sobre / v.pvt)) : 0,
        rec: v.pvt > 0 ? Math.min(1, Math.max(0, 1 - v.sub / v.pvt)) : 0,
        n: v.n
      }));
  },

  // Percentiles por zona para distribución
  percentilesZona() {
    const zonas = {};
    this.datos.forEach(d => {
      const z = d[CONFIG.CAMPOS.zona] || "Sin zona";
      if (!zonas[z]) zonas[z] = [];
      zonas[z].push(d._dil);
    });
    return Object.entries(zonas).map(([zona, vals]) => {
      const sorted = vals.sort((a, b) => a - b);
      return {
        zona,
        p25: this._percentil(sorted, 0.25),
        p50: this._percentil(sorted, 0.50),
        p75: this._percentil(sorted, 0.75),
        n: vals.length
      };
    });
  },

  // Contexto para Claude
  buildContexto(contextoURL) {
    if (!this.datos.length) return contextoURL || "Sin datos cargados.";
    const resumen = `Dataset: ${this.datos.length} camaras. Campos: ${Object.keys(this.datos[0]).filter(k => !k.startsWith('_')).join(", ")}. `;
    const muestra = JSON.stringify(this.datos.slice(0, CONFIG.MAX_REGISTROS_IA).map(d => {
      const row = {};
      Object.keys(d).filter(k => !k.startsWith('_')).forEach(k => row[k] = d[k]);
      return row;
    }));
    const resto = this.datos.length > CONFIG.MAX_REGISTROS_IA
      ? ` [Primeros ${CONFIG.MAX_REGISTROS_IA} de ${this.datos.length} registros]` : "";
    return resumen + "Datos: " + muestra + resto;
  }
};
