const UI = {
  modoPresentacion: false,
  _breadcrumb: [],
  _indiceEntradas: [],
  _indiceAbierto: false,
  _entradaCounter: 0,

  init() {
    this._renderBotonera();
  },

  // ── ÍNDICE LATERAL ─────────────────────────────────────────────────
  toggleIndice() {
    this._indiceAbierto = !this._indiceAbierto;
    const panel = document.getElementById("indice-panel");
    const btn = document.getElementById("btn-indice");
    if (this._indiceAbierto) {
      panel.classList.remove("indice-cerrado");
      panel.classList.add("indice-abierto");
      btn.style.background = "#E8401C";
      btn.style.color = "white";
    } else {
      panel.classList.add("indice-cerrado");
      panel.classList.remove("indice-abierto");
      btn.style.background = "";
      btn.style.color = "";
    }
  },

  _addIndiceEntrada(tipo, texto, elemento, breadcrumb) {
    this._entradaCounter++;
    const id = "idx-" + this._entradaCounter;
    const entrada = { id, tipo, texto, elemento, breadcrumb };
    this._indiceEntradas.push(entrada);
    this._renderIndice();
    return id;
  },

  _renderIndice() {
    const lista = document.getElementById("indice-lista");
    const contador = document.getElementById("indice-contador");
    if (!lista) return;
    contador.textContent = this._indiceEntradas.length + " entradas";
    lista.innerHTML = "";

    let ultimaSeccion = "";
    this._indiceEntradas.forEach(e => {
      // Sección por breadcrumb
      const seccion = e.breadcrumb || "General";
      if (seccion !== ultimaSeccion) {
        const sep = document.createElement("div");
        sep.className = "indice-seccion";
        sep.textContent = seccion;
        lista.appendChild(sep);
        ultimaSeccion = seccion;
      }

      const item = document.createElement("div");
      item.className = "indice-item indice-tipo-" + e.tipo;
      item.id = e.id;

      const icono = document.createElement("span");
      icono.className = "indice-icono";
      icono.textContent = e.tipo === "user" ? "P" : e.tipo === "chart" ? "G" : "R";
      item.appendChild(icono);

      const txt = document.createElement("span");
      txt.className = "indice-texto";
      txt.textContent = e.texto.length > 40 ? e.texto.substring(0, 38) + "…" : e.texto;
      item.appendChild(txt);

      item.onclick = () => {
        // Quitar activo previo
        document.querySelectorAll(".indice-item").forEach(el => el.classList.remove("indice-activo"));
        item.classList.add("indice-activo");
        // Saltar al elemento en el chat
        if (e.elemento && e.elemento.scrollIntoView) {
          e.elemento.scrollIntoView({ behavior: "smooth", block: "center" });
          e.elemento.classList.add("msg-highlight");
          setTimeout(() => e.elemento.classList.remove("msg-highlight"), 1500);
        }
      };

      lista.appendChild(item);
    });

    // Scroll al final del índice
    lista.scrollTop = lista.scrollHeight;
  },

  // ── MARKDOWN RENDERER ──────────────────────────────────────────────
  _renderMarkdown(texto) {
    let html = texto
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/(\|[^\n]+\|\n)((?:\|[-: ]+[-| :]*\|\n))((?:\|[^\n]+\|\n?)*)/g, (match, header, sep, body) => {
        const parseRow = row => row.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
        const headers = parseRow(header);
        const rows = body.trim().split("\n").filter(Boolean).map(parseRow);
        let t = '<div class="tbl-wrap"><table class="md-table"><thead><tr>';
        headers.forEach(h => t += `<th>${h}</th>`);
        t += "</tr></thead><tbody>";
        rows.forEach(r => { t += "<tr>"; r.forEach(c => t += `<td>${c}</td>`); t += "</tr>"; });
        return t + "</tbody></table></div>";
      })
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/^### (.+)$/gm, "<h4>$1</h4>")
      .replace(/^## (.+)$/gm, "<h3>$1</h3>")
      .replace(/^# (.+)$/gm, "<h2>$1</h2>")
      .replace(/^[\-\*] (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/\n/g, "<br>");
    return `<p>${html}</p>`;
  },

  // ── BREADCRUMB ─────────────────────────────────────────────────────
  _pushBreadcrumb(label, prompt) {
    if (this._breadcrumb.length && this._breadcrumb[this._breadcrumb.length - 1].label === label) return;
    this._breadcrumb.push({ label, prompt });
    if (this._breadcrumb.length > 5) this._breadcrumb.shift();
  },

  _getBreadcrumbActual() {
    if (!this._breadcrumb.length) return "General";
    return this._breadcrumb.map(b => b.label).join(" › ");
  },

  _renderBreadcrumb() {
    if (this._breadcrumb.length < 2) return null;
    const nav = document.createElement("div");
    nav.className = "breadcrumb";
    this._breadcrumb.forEach((item, i) => {
      if (i > 0) {
        const sep = document.createElement("span");
        sep.className = "bc-sep";
        sep.textContent = " › ";
        nav.appendChild(sep);
      }
      const span = document.createElement("span");
      span.className = i === this._breadcrumb.length - 1 ? "bc-item bc-active" : "bc-item bc-link";
      span.textContent = item.label;
      if (i < this._breadcrumb.length - 1) {
        span.onclick = () => ChatManager.enviar(item.prompt);
        span.title = "Volver a " + item.label;
      }
      nav.appendChild(span);
    });
    return nav;
  },

  // ── MENSAJE PRINCIPAL ──────────────────────────────────────────────
  addMsg(texto, tipo, opciones) {
    opciones = opciones || {};
    const chat = document.getElementById("chat");
    const wrapper = document.createElement("div");
    wrapper.className = "msg " + tipo;

    if (tipo === "ai" && texto.length > 0) {
      const btnCopiar = document.createElement("button");
      btnCopiar.className = "btn-copiar";
      btnCopiar.textContent = "📋";
      btnCopiar.title = "Copiar al portapapeles";
      btnCopiar.onclick = () => {
        navigator.clipboard.writeText(texto);
        btnCopiar.textContent = "✅";
        setTimeout(() => btnCopiar.textContent = "📋", 1500);
      };
      wrapper.appendChild(btnCopiar);
    }

    if (tipo === "ai" && opciones.breadcrumbLabel) {
      this._pushBreadcrumb(opciones.breadcrumbLabel, opciones.breadcrumbPrompt || texto);
      const bc = this._renderBreadcrumb();
      if (bc) wrapper.appendChild(bc);
    }

    const contenido = document.createElement("div");
    contenido.className = "msg-content";
    if (tipo === "ai") {
      contenido.innerHTML = this._renderMarkdown(texto);
    } else {
      contenido.textContent = texto;
    }
    wrapper.appendChild(contenido);
    chat.appendChild(wrapper);
    chat.scrollTop = chat.scrollHeight;

    // Registrar en índice (no registrar typing ni mensajes vacíos)
    if (tipo === "user" && texto.trim()) {
      this._addIndiceEntrada("user", texto, wrapper, this._getBreadcrumbActual());
    } else if (tipo === "ai" && texto.trim() && !wrapper.classList.contains("typing")) {
      const resumen = texto.replace(/\n/g, " ").substring(0, 50);
      this._addIndiceEntrada("ai", resumen, wrapper, this._getBreadcrumbActual());
    }

    return wrapper;
  },

  // Registrar gráfica en índice (llamado desde ChartManager)
  addChartIndice(titulo, elemento) {
    this._addIndiceEntrada("chart", titulo, elemento, this._getBreadcrumbActual());
  },

  // ── DRILL-DOWN DINÁMICO ────────────────────────────────────────────
  mostrarDrillDown(acciones) {
    if (!acciones || !acciones.length) return;
    const chat = document.getElementById("chat");
    const div = document.createElement("div");
    div.className = "drilldown-row";
    const label = document.createElement("span");
    label.className = "drilldown-label";
    label.textContent = "Ver más:";
    div.appendChild(label);
    acciones.forEach(a => {
      const btn = document.createElement("button");
      btn.className = "btn-drill";
      btn.textContent = a.label + " ↗";
      btn.onclick = () => { div.remove(); ChatManager.enviar(a.prompt); };
      div.appendChild(btn);
    });
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  },

  // ── TABLA CLICABLE ─────────────────────────────────────────────────
  addTablaClicable(filas, columnas, onClickFila) {
    const chat = document.getElementById("chat");
    const wrap = document.createElement("div");
    wrap.className = "tbl-wrap";
    const table = document.createElement("table");
    table.className = "md-table clickable-table";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    columnas.forEach(c => { const th = document.createElement("th"); th.textContent = c.label; trh.appendChild(th); });
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    filas.forEach(fila => {
      const tr = document.createElement("tr");
      tr.title = "Haz clic para desglosar";
      columnas.forEach(c => { const td = document.createElement("td"); td.textContent = fila[c.key] !== undefined ? fila[c.key] : ""; tr.appendChild(td); });
      tr.onclick = () => onClickFila(fila);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
    return wrap;
  },

  // ── BOTONERA ───────────────────────────────────────────────────────
  _renderBotonera() {
    const botonera = document.getElementById("botonera");
    if (!botonera) return;
    botonera.innerHTML = "";
    CONFIG.ACCIONES.forEach(accion => {
      const btn = document.createElement("button");
      btn.className = "btn-accion";
      btn.id = "btn-" + accion.id;
      btn.innerHTML = accion.icono + " <span>" + accion.label + "</span>";
      btn.onclick = () => ChatManager.ejecutarAccion(accion.id);
      btn.disabled = accion.id !== "exportar" && accion.id !== "presentacion";
      botonera.appendChild(btn);
    });
  },

  habilitarBotonera() {
    CONFIG.ACCIONES.forEach(accion => {
      const btn = document.getElementById("btn-" + accion.id);
      if (btn) btn.disabled = false;
    });
  },

  setLoading(estado) {
    const sendBtn = document.getElementById("send-btn");
    const input = document.getElementById("input");
    if (sendBtn) sendBtn.disabled = estado;
    if (input) input.disabled = estado;
    CONFIG.ACCIONES.forEach(accion => {
      const btn = document.getElementById("btn-" + accion.id);
      if (btn && DataManager.datos.length > 0) btn.disabled = estado;
    });
    if (estado) {
      this._typingMsg = this.addMsg("Analizando...", "ai typing");
    } else {
      if (this._typingMsg) { this._typingMsg.remove(); this._typingMsg = null; }
    }
  },

  mostrarClarificacion(pregunta, opciones, promptOriginal) {
    const chat = document.getElementById("chat");
    const div = document.createElement("div");
    div.className = "msg ai clarificacion";
    const titulo = document.createElement("p");
    titulo.style.cssText = "font-weight:600;margin-bottom:10px;color:#2C1810;";
    titulo.textContent = "❓ " + pregunta;
    div.appendChild(titulo);
    const grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
    opciones.forEach(opcion => {
      const btn = document.createElement("button");
      btn.className = "btn-opcion";
      btn.textContent = opcion;
      btn.onclick = () => { div.remove(); ChatManager.enviar(promptOriginal + " — concretamente: " + opcion); };
      grid.appendChild(btn);
    });
    div.appendChild(grid);
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  },

  mostrarSugerencias(sugerencias) {
    const chat = document.getElementById("chat");
    const div = document.createElement("div");
    div.className = "sugerencias-wrapper";
    const label = document.createElement("span");
    label.className = "sugerencias-label";
    label.textContent = "Continúa con:";
    div.appendChild(label);
    sugerencias.forEach(s => {
      const btn = document.createElement("button");
      btn.className = "btn-sugerencia";
      btn.textContent = s;
      btn.onclick = () => { div.remove(); ChatManager.enviar(s); };
      div.appendChild(btn);
    });
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  },

  togglePresentacion() {
    this.modoPresentacion = !this.modoPresentacion;
    const body = document.body;
    const header = document.getElementById("header");
    const botonera = document.getElementById("botonera");
    const inputArea = document.getElementById("input-area");
    if (this.modoPresentacion) {
      body.classList.add("modo-presentacion");
      header.style.display = "none";
      botonera.style.display = "none";
      inputArea.style.display = "none";
      const btnSalir = document.createElement("button");
      btnSalir.id = "btn-salir-presentacion";
      btnSalir.innerHTML = "✕ Salir de presentación";
      btnSalir.style.cssText = "position:fixed;top:10px;right:10px;z-index:9999;background:#E8401C;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;";
      btnSalir.onclick = () => this.togglePresentacion();
      document.body.appendChild(btnSalir);
    } else {
      body.classList.remove("modo-presentacion");
      header.style.display = "flex";
      botonera.style.display = "flex";
      inputArea.style.display = "flex";
      const btnSalir = document.getElementById("btn-salir-presentacion");
      if (btnSalir) btnSalir.remove();
    }
  },

  actualizarEstado(metadatos) {
    const estado = document.getElementById("estado");
    if (estado) {
      estado.textContent = "✅ " + metadatos.total + " cámaras · " + metadatos.minas.join(", ") + " · " + metadatos.zonas.length + " zonas";
    }
    this.habilitarBotonera();
    document.getElementById("input").disabled = false;
    document.getElementById("send-btn").disabled = false;
  },

  mostrarBienvenida(metadatos) {
    const alertas = DataManager.alertas();
    let msg = "Datos cargados: " + metadatos.total + " cámaras de " + metadatos.minas.join(", ") + " en " + metadatos.zonas.length + " zonas.\n\n";
    msg += "📊 Dilución mediana: " + (metadatos.dil_p50 * 100).toFixed(1) + "% | Recuperación mediana: " + (metadatos.rec_p50 * 100).toFixed(1) + "%\n";
    if (alertas.criticas.length > 0) {
      msg += "\n⚠️ Se detectaron " + alertas.criticas.length + " cámaras con alertas críticas. Pulsa \"Alertas automáticas\" para ver el detalle.";
    } else {
      msg += "\n✅ Sin alertas críticas detectadas.";
    }
    msg += "\n\nUsa la botonera de acciones o escribe tu pregunta directamente.";
    this.addMsg(msg, "ai");
  }
};
