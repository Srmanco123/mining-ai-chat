// ============================================================
//  ui.js  —  Botonera, mensajes, markdown, sugerencias, presentación
//  Versión 3.0
// ============================================================

const UI = {
  modoPresentacion: false,

  init() {
    this._renderBotonera();
    this._renderInputArea();
  },

  // ── BOTONERA ──────────────────────────────────────────────
  _renderBotonera() {
    const botonera = document.getElementById("botonera");
    if (!botonera) return;
    botonera.innerHTML = "";
    CONFIG.ACCIONES.forEach(accion => {
      const btn = document.createElement("button");
      btn.className = "btn-accion";
      btn.id = "btn-" + accion.id;
      btn.innerHTML = `${accion.icono} <span>${accion.label}</span>`;
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

  _renderInputArea() {
    // El input area ya está en el HTML, solo asegurar eventos
    const input = document.getElementById("input");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") App.enviar();
      });
    }
  },

  // ── MARKDOWN RENDERER ─────────────────────────────────────
  _renderMarkdown(texto) {
    let html = texto
      // Escapar HTML peligroso
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")

      // Tablas Markdown: | col1 | col2 |
      .replace(
        /(\|[^\n]+\|\n)((?:\|[-: ]+[-| :]*\|\n))((?:\|[^\n]+\|\n?)*)/g,
        (match, header, separator, body) => {
          const parseRow = (row) =>
            row.trim().replace(/^\||\|$/g, "").split("|")
              .map(cell => cell.trim());

          const headers = parseRow(header);
          const rows = body.trim().split("\n").filter(r => r.includes("|")).map(parseRow);

          const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>`;
          const tbody = `<tbody>${rows.map(r =>
            `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`
          ).join("")}</tbody>`;

          return `<div class="md-table-wrapper"><table class="md-table">${thead}${tbody}</table></div>`;
        }
      )

      // Encabezados ## y ###
      .replace(/^### (.+)$/gm, "<h4>$1</h4>")
      .replace(/^## (.+)$/gm, "<h3>$1</h3>")
      .replace(/^# (.+)$/gm, "<h2>$1</h2>")

      // Negrita y cursiva
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")

      // Blockquote >
      .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")

      // Listas - y ·
      .replace(/^[ \t]*[-·•] (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
      // Limpiar ul anidados redundantes
      .replace(/<\/ul>\s*<ul>/g, "")

      // Listas numeradas
      .replace(/^\d+\. (.+)$/gm, "<oli>$1</oli>")
      .replace(/(<oli>[\s\S]*?<\/oli>)/g, "<ol><li>$1</li></ol>")
      .replace(/<\/oli>/g, "").replace(/<oli>/g, "")
      .replace(/<\/ol>\s*<ol>/g, "")

      // Código inline
      .replace(/`([^`]+)`/g, "<code>$1</code>")

      // Saltos de línea → <br> (respetando bloques HTML)
      .replace(/\n(?!<[uo]l|<li|<h[234]|<table|<div|<blockquote)/g, "<br>")

      // Limpiar <br> dobles
      .replace(/(<br>\s*){3,}/g, "<br><br>");

    return html;
  },

  // ── AGREGAR MENSAJE ───────────────────────────────────────
  addMsg(texto, tipo) {
    const chat = document.getElementById("chat");
    const div = document.createElement("div");
    div.className = "msg " + tipo;

    if (tipo === "ai" && texto.length > 0) {
      // Botón copiar
      const btnCopiar = document.createElement("button");
      btnCopiar.className = "btn-copiar";
      btnCopiar.innerText = "📋";
      btnCopiar.title = "Copiar al portapapeles";
      btnCopiar.onclick = () => {
        navigator.clipboard.writeText(texto);
        btnCopiar.innerText = "✅";
        setTimeout(() => btnCopiar.innerText = "📋", 1500);
      };
      div.appendChild(btnCopiar);

      // Contenido con markdown
      const content = document.createElement("div");
      content.className = "msg-content";
      content.innerHTML = this._renderMarkdown(texto);
      div.appendChild(content);
    } else {
      div.innerText = texto;
    }

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  },

  // ── LOADING ───────────────────────────────────────────────
  setLoading(estado) {
    const btn = document.getElementById("send-btn");
    const input = document.getElementById("input");
    if (estado) {
      if (btn) { btn.disabled = true; btn.innerText = "⏳"; }
      if (input) input.disabled = true;
      // Indicador de carga en chat
      if (!document.getElementById("loading-indicator")) {
        const loading = document.createElement("div");
        loading.id = "loading-indicator";
        loading.className = "msg ai loading";
        loading.innerHTML = '<span class="dot">•</span><span class="dot">•</span><span class="dot">•</span>';
        document.getElementById("chat").appendChild(loading);
        document.getElementById("chat").scrollTop = 99999;
      }
    } else {
      if (btn) { btn.disabled = false; btn.innerText = "Enviar"; }
      if (input) { input.disabled = false; input.focus(); }
      const loading = document.getElementById("loading-indicator");
      if (loading) loading.remove();
    }
  },

  // ── CLARIFICACIÓN INTERACTIVA ─────────────────────────────
  mostrarClarificacion(pregunta, opciones, promptOriginal) {
    const chat = document.getElementById("chat");
    const div = document.createElement("div");
    div.className = "msg ai clarificacion";

    const p = document.createElement("p");
    p.innerHTML = "<strong>🤔 " + pregunta + "</strong>";
    div.appendChild(p);

    const grid = document.createElement("div");
    grid.className = "clarificacion-grid";

    opciones.forEach(opcion => {
      const btn = document.createElement("button");
      btn.className = "btn-clarificacion";
      btn.innerText = opcion;
      btn.onclick = () => {
        div.remove();
        ChatManager.enviar(promptOriginal + " — concretamente: " + opcion);
      };
      grid.appendChild(btn);
    });

    div.appendChild(grid);
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  },

  // ── SUGERENCIAS / DRILL-DOWNS ─────────────────────────────
  mostrarSugerencias(sugerencias) {
    const chat = document.getElementById("chat");
    const div = document.createElement("div");
    div.className = "sugerencias-wrapper";

    const label = document.createElement("span");
    label.className = "sugerencias-label";
    label.innerText = "Continúa con:";
    div.appendChild(label);

    sugerencias.forEach(s => {
      const btn = document.createElement("button");
      btn.className = "btn-sugerencia";
      btn.innerText = s;
      btn.onclick = () => {
        div.remove();
        ChatManager.enviar(s);
      };
      div.appendChild(btn);
    });

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  },

  // ── CHIP MEMORIA DE CONSULTA ──────────────────────────────
  mostrarEtiquetaConsulta(entrada) {
    const chat = document.getElementById("chat");
    if (!chat || !entrada) return;

    const mensajes = chat.querySelectorAll(".msg.ai");
    if (mensajes.length === 0) return;
    const ultimoMsg = mensajes[mensajes.length - 1];

    if (ultimoMsg.querySelector(".consulta-chip")) return;

    const chip = document.createElement("div");
    chip.className = "consulta-chip";
    chip.innerHTML = `
      <span class="chip-icono">💾</span>
      <span class="chip-nombre" title="${entrada.nombre}">${entrada.nombre}</span>
      <button class="chip-repetir" onclick="UI.mostrarRepetirConsulta('${entrada.nombre.replace(/'/g, "\\'")}')">
        Repetir con…
      </button>
    `;
    ultimoMsg.appendChild(chip);
  },

  mostrarRepetirConsulta(nombreConsulta) {
    const chat = document.getElementById("chat");
    chat.querySelectorAll(".chip-repetir-form").forEach(c => c.remove());

    const form = document.createElement("div");
    form.className = "chip-repetir-form";
    form.innerHTML = `
      <span>Repetir "<strong>${nombreConsulta}</strong>" para:</span>
      <input type="text" class="chip-repetir-input" placeholder="ej. Zona Norte, MGD, 2024…" />
      <button class="chip-repetir-ok" onclick="UI._ejecutarRepetir(this)">→</button>
      <button class="chip-repetir-cancel" onclick="this.parentElement.remove()">✕</button>
    `;

    chat.appendChild(form);
    const inputEl = form.querySelector("input");
    inputEl.focus();
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") UI._ejecutarRepetir(form.querySelector(".chip-repetir-ok"));
    });
    chat.scrollTop = chat.scrollHeight;
  },

  _ejecutarRepetir(btn) {
    const form = btn.parentElement;
    const input = form.querySelector("input").value.trim();
    if (!input) return;
    form.remove();
    const prompt = `Repite esto para ${input}`;
    document.getElementById("input").value = prompt;
    ChatManager.enviar(prompt);
    document.getElementById("input").value = "";
  },

  // ── MODO PRESENTACIÓN ─────────────────────────────────────
  togglePresentacion(estado) {
    this.modoPresentacion = (estado !== undefined) ? estado : !this.modoPresentacion;
    const body = document.body;
    const header = document.getElementById("header");
    const botonera = document.getElementById("botonera");
    const inputArea = document.getElementById("input-area");

    if (this.modoPresentacion) {
      body.classList.add("modo-presentacion");
      if (header) header.style.display = "none";
      if (botonera) botonera.style.display = "none";
      if (inputArea) inputArea.style.display = "none";

      const btnSalir = document.createElement("button");
      btnSalir.id = "btn-salir-presentacion";
      btnSalir.innerHTML = "✕ Salir de presentación";
      btnSalir.style.cssText = "position:fixed;top:10px;right:10px;z-index:9999;background:#E8401C;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;";
      btnSalir.onclick = () => this.togglePresentacion(false);
      document.body.appendChild(btnSalir);
    } else {
      body.classList.remove("modo-presentacion");
      if (header) header.style.display = "flex";
      if (botonera) botonera.style.display = "flex";
      if (inputArea) inputArea.style.display = "flex";
      const btnSalir = document.getElementById("btn-salir-presentacion");
      if (btnSalir) btnSalir.remove();
    }
  },

  // ── ACTUALIZAR ESTADO ─────────────────────────────────────
  actualizarEstado(metadatos) {
    const estado = document.getElementById("estado");
    if (estado) {
      estado.textContent = `✅ ${metadatos.total} cámaras · ${metadatos.minas.join(", ")} · ${metadatos.zonas.length} zonas`;
    }
    this.habilitarBotonera();
    const input = document.getElementById("input");
    const sendBtn = document.getElementById("send-btn");
    if (input) input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
  },

  mostrarBienvenida(metadatos) {
    const alertas = DataManager.alertas();
    let msg = `Datos cargados: ${metadatos.total} cámaras de ${metadatos.minas.join(", ")} en ${metadatos.zonas.length} zonas.\n\n`;
    msg += `📊 Dilución mediana: ${(metadatos.dil_p50 * 100).toFixed(1)}% | Recuperación mediana: ${(metadatos.rec_p50 * 100).toFixed(1)}%\n`;
    if (alertas.criticas.length > 0) {
      msg += `\n⚠️ Se detectaron ${alertas.criticas.length} cámaras con alertas críticas. Pulsa "Alertas automáticas" para ver el detalle.`;
    } else {
      msg += `\n✅ Sin alertas críticas detectadas.`;
    }
    msg += `\n\nUsa la botonera de acciones o escribe tu pregunta directamente.`;
    this.addMsg(msg, "ai");
  }
};
