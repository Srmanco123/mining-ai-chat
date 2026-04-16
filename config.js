// ============================================================
//  config.js  —  Configuración global del sistema
//  Versión 3.0 — ajusta aquí sin tocar otros archivos
// ============================================================

const CONFIG = {

  // ── API ───────────────────────────────────────────────────
  PROXY_URL:   "https://anthropic-proxy.manurv2.workers.dev",
  MODEL:       "claude-haiku-4-5-20251001",
  MAX_TOKENS:  6000,

  // ── EMPRESA ───────────────────────────────────────────────
  EMPRESA:       "Sandfire MATSA",
  DEPARTAMENTO:  "Departamento de Planificación Minera",
  SUBTITULO:     "Reconciliación de Cámaras — Análisis inteligente",

  // ── COLORES CORPORATIVOS ──────────────────────────────────
  COLORES: {
    primario:   "#E8401C",
    secundario: "#2C1810",
    fondo:      "#f4f4f4",
    blanco:     "#FFFFFF",
    gris:       "#7a7a7a",
    palette:    ["#E8401C", "#2C1810", "#f5a623", "#7a7a7a", "#c93516", "#a0522d", "#d2691e"]
  },

  // ── CAMPOS DEL CSV ────────────────────────────────────────
  // Ajusta aquí si cambian los nombres de columnas del export de Power BI
  CAMPOS: {
    id:              "Stope",
    mina:            "Mine",
    zona:            "Zone",
    sobreexcavacion: "Sobrexcavacion_tn",
    subexcavacion:   "Subexcavacion_tn",
    pvt:             "P&V t",
    fecha:           "Fecha",
    ratio:           "Ratio_tn_m",
    escaner:         "Escaner_Final_tn",
    toneladas_lp:    "Toneladas_LP",
    toneladas_mp:    "Toneladas_MP"
  },

  // ── FÓRMULAS DE RECONCILIACIÓN ────────────────────────────
  calcDilucion(row) {
    const sobre = parseFloat(row["Sobrexcavacion_tn"]) || 0;
    const pvt   = parseFloat(row["P&V t"]) || 1;
    return Math.min(1, Math.max(0, sobre / pvt));
  },

  calcRecuperacion(row) {
    const sub = parseFloat(row["Subexcavacion_tn"]) || 0;
    const pvt = parseFloat(row["P&V t"]) || 1;
    return Math.min(1, Math.max(0, 1 - sub / pvt));
  },

  // ── UMBRALES DE ALERTA ────────────────────────────────────
  // Ajusta aquí los umbrales operacionales sin tocar lógica
  ALERTAS: {
    dilucion_alta:      0.30,   // > 30% → alerta roja
    dilucion_media:     0.20,   // > 20% → alerta amarilla
    recuperacion_baja:  0.80,   // < 80% → alerta roja
    recuperacion_media: 0.88    // < 88% → alerta amarilla
  },

  // ── LÍMITE DE REGISTROS ENVIADOS A CLAUDE ─────────────────
  // Aumentar si tienes datasets pequeños; reducir si hay lag
  MAX_REGISTROS_IA: 200,

  // ── ACCIONES RÁPIDAS DE LA BOTONERA ──────────────────────
  // id debe coincidir con las claves en ChatManager._promptAccion()
  ACCIONES: [
    { id: "resumen",       icono: "📊", label: "Resumen ejecutivo"       },
    { id: "alertas",       icono: "⚠️", label: "Alertas automáticas"     },
    { id: "comparar",      icono: "🔍", label: "Comparar zonas"          },
    { id: "evolucion",     icono: "📈", label: "Evolución temporal"       },
    { id: "outliers",      icono: "🎯", label: "Top outliers"            },
    { id: "distribucion",  icono: "📉", label: "Distribución estadística" },
    { id: "presentacion",  icono: "🖥️", label: "Modo presentación"       },
    { id: "exportar",      icono: "📄", label: "Exportar PDF"            }
  ]
};
