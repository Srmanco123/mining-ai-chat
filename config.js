// ============================================================
//  config.js  —  Configuración global del sistema
//  Versión 3.1 — alineado con Worker endurecido + outliers P25/P75
// ============================================================

const CONFIG = {

  // ── API ───────────────────────────────────────────────────
  PROXY_URL:   "https://anthropic-proxy.manurv2.workers.dev",
  MODEL:       "claude-haiku-4-5-20251001",
  MAX_TOKENS:  4096,  // alineado con el límite del Worker (antes 6000 → recortaba silenciosamente)

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

  // ── UMBRALES DE ALERTA — SOLO FALLBACK ────────────────────
  // IMPORTANTE: desde la versión 3.1 las alertas se calculan con
  // percentiles DINÁMICOS P25/P75 del dataset cargado (coherente con
  // Power BI). Estos valores sólo se usan si el dataset no tiene
  // suficientes cámaras para calcular percentiles fiables (n < 4).
  ALERTAS: {
    dilucion_alta:      0.30,   // fallback: > 30%
    dilucion_media:     0.20,   // fallback: > 20%
    recuperacion_baja:  0.80,   // fallback: < 80%
    recuperacion_media: 0.88    // fallback: < 88%
  },

  // ── DATOS EN BRUTO ENVIADOS A CLAUDE ─────────────────────
  // Desde 3.1 los registros en bruto SÓLO se envían si el prompt
  // menciona un ID de cámara específico (análisis individual).
  // Para el resto de consultas se envían únicamente estadísticas
  // agregadas — ahorra tokens y evita alucinaciones.
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
