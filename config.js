const CONFIG = {
  // API
  PROXY_URL: "https://anthropic-proxy.manurv2.workers.dev",
  MODEL: "claude-haiku-4-5-20251001",
  MAX_TOKENS: 4000,

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

  // Campos del CSV — ajusta si cambian los nombres de columnas
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

  // Fórmulas de reconciliación
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
    dilucion_alta: 0.30,      // > 30% dilución es alerta roja
    dilucion_media: 0.20,     // > 20% dilución es alerta amarilla
    recuperacion_baja: 0.80,  // < 80% recuperación es alerta roja
    recuperacion_media: 0.88  // < 88% recuperación es alerta amarilla
  },

  // Número de registros a enviar a Claude
  MAX_REGISTROS_IA: 200,

  // Acciones rápidas de la botonera
  ACCIONES: [
    { id: "resumen",      icono: "📊", label: "Resumen ejecutivo",      prompt: "Genera un resumen ejecutivo completo del dataset con estadísticas de dilución y recuperación por zona y mina, recalculadas desde datos brutos ponderados por volumen. Identifica las zonas con mejor y peor rendimiento y da recomendaciones técnicas." },
    { id: "alertas",      icono: "⚠️", label: "Alertas automáticas",    prompt: "Analiza el dataset completo e identifica las alertas críticas: cámaras con dilución excesiva, recuperación insuficiente y combinaciones problemáticas. Ordénalas por severidad e impacto en toneladas." },
    { id: "comparar",     icono: "🔍", label: "Comparar zonas",         prompt: "Compara el rendimiento de todas las zonas presentes en el dataset. Para cada zona calcula dilución media ponderada, recuperación media ponderada, variabilidad (rango intercuartil) y número de cámaras. Genera una gráfica de barras agrupadas." },
    { id: "temporal",     icono: "📈", label: "Evolución temporal",     prompt: "Analiza la evolución temporal de dilución y recuperación. Agrupa por año o trimestre según la densidad de datos y muestra si hay tendencias de mejora o empeoramiento. Genera una gráfica de líneas." },
    { id: "outliers",     icono: "🎯", label: "Top outliers",           prompt: "Identifica las 10 cámaras con comportamiento más anómalo. Para cada una indica el Stope, zona, mina, dilución real, recuperación real y desviación respecto a la mediana de su grupo. Explica posibles causas técnicas." },
    { id: "distribucion", icono: "📉", label: "Distribución estadística", prompt: "Analiza la distribución estadística de dilución y recuperación del dataset. Calcula P10, P25, P50, P75, P90, media y desviación típica por zona. Genera una gráfica de barras con los percentiles P25/P50/P75 por zona." },
    { id: "presentacion", icono: "🖥️", label: "Modo presentación",     prompt: null },
    { id: "exportar",     icono: "📄", label: "Exportar PDF",           prompt: null }
  ]
};
