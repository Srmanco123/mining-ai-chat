const CONFIG = {
  // API
  PROXY_URL: "https://anthropic-proxy.manurv2.workers.dev",
  MODEL: "claude-haiku-4-5-20251001",
  MAX_TOKENS: 8000,

  // Empresa
  EMPRESA: "Sandfire MATSA",
  DEPARTAMENTO: "Departamento de Planificación Minera",
  SUBTITULO: "Reconciliación de Cámaras — Análisis inteligente",

  // Colores corporativos
  COLORES: {
    primario: "#E8401C",
    secundario: "#2C1810",
    fondo: "#f4f4f4",
    blanco: "#FFFFFF",
    gris: "#7a7a7a",
    palette: ["#E8401C", "#2C1810", "#f5a623", "#7a7a7a", "#c93516", "#a0522d", "#d2691e"]
  },

  // Campos del CSV
  CAMPOS: {
    id: "Stope",
    mina: "Mine",
    zona: "Zone",
    sobreexcavacion: "Sobrexcavacion_tn",
    subexcavacion: "Subexcavacion_tn",
    pvt: "P&V t",
    fecha: "Fecha",
    ratio: "Ratio_tn_m",
    escaner: "Escaner_Final_tn",
    toneladas_lp: "Toneladas_LP",
    toneladas_mp: "Toneladas_MP",
    dilution: "Dilution",
    recovery: "Recovery"
  },

  // Fórmulas
  calcDilucion: (row) => {
    const sobre = parseFloat(row["Sobrexcavacion_tn"]) || 0;
    const pvt = parseFloat(row["P&V t"]) || 1;
    return Math.min(1, Math.max(0, sobre / pvt));
  },
  calcRecuperacion: (row) => {
    const sub = parseFloat(row["Subexcavacion_tn"]) || 0;
    const pvt = parseFloat(row["P&V t"]) || 1;
    return Math.min(1, Math.max(0, 1 - sub / pvt));
  },

  // Umbrales de alerta
  ALERTAS: {
    dilucion_alta: 0.30,
    dilucion_media: 0.20,
    recuperacion_baja: 0.80,
    recuperacion_media: 0.88
  },

  // Registros raw enviados a Claude — solo para búsquedas de cámara concreta
  MAX_REGISTROS_IA: 200,

  // Acciones rápidas
  ACCIONES: [
    { id: "resumen",      icono: "📊", label: "Resumen ejecutivo",       prompt: "RESUMEN_EJECUTIVO" },
    { id: "alertas",      icono: "⚠️", label: "Alertas automáticas",     prompt: "Analiza las alertas críticas del dataset: top 5 cámaras con mayor dilución ponderada y top 5 con menor recuperación ponderada. Solo eso, nada más." },
    { id: "comparar",     icono: "🔍", label: "Comparar zonas",          prompt: "Tabla comparativa de zonas: dilución ponderada, recuperación ponderada, N cámaras. Ordena de mejor a peor dilución." },
    { id: "temporal",     icono: "📈", label: "Evolución temporal",      prompt: "Evolución anual de dilución y recuperación ponderadas. Tabla por año + gráfica de líneas." },
    { id: "outliers",     icono: "🎯", label: "Top outliers",            prompt: "Top 5 cámaras con mayor dilución ponderada y top 5 con menor recuperación ponderada. Solo tabla con: Stope, Zona, Dil%, Rec%, P&V t." },
    { id: "distribucion", icono: "📉", label: "Distribución estadística", prompt: "Distribución estadística: tabla con P25/P50/P75 de dilución y recuperación por zona. Luego boxplot." },
    { id: "presentacion", icono: "🖥️", label: "Modo presentación",      prompt: null },
    { id: "exportar",     icono: "📄", label: "Exportar PDF",            prompt: null }
  ]
};
