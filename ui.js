const UI = {
  modoPresentacion: false,

  init() {
    this._renderBotonera();
    this._renderInputArea();
  },

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

  addMsg(texto, tipo) {
    const chat = document.getElementById("chat");
    const div = document.createElement("div");
    div.className = "msg " + tipo;

    if (tipo === "ai" && texto.length > 0) {
      // Botón copiar en cada mensaje IA
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
    }

    const contenido = document.createElement("span");
    contenido.innerText = texto;
    div.appendChild(contenido);

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
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
      if (this._typingMsg) {
        this._typingMsg.remove();
        this._typingMsg = null;
      }
    }
  },

  mostrarClarificacion(pregunta, opciones, promptOriginal) {
    const chat = document.getElementById("chat");
    const div = document.createElement("div");
    div.className = "msg ai clarificacion";

    const titulo = document.createElement("p");
    titulo.style.cssText = "font-weight:600;margin-bottom:10px;color:#2C1810;";
    titulo.innerText = "❓ " + pregunta;
    div.appendChild(titulo);

    const grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";

    opciones.forEach(opcion => {
      const btn = document.createElement("button");
      btn.className = "btn-opcion";
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

  togglePresentacion() {
    this.modoPresentacion = !this.modoPresentacion;
    const body = document.body;
    const header = document.getElementById("header");
    const botonera = document.getElementById("botonera");
    const inputArea = document.getElementById("input-area");
    const btnPres = document.getElementById("btn-presentacion");

    if (this.modoPresentacion) {
      body.classList.add("modo-presentacion");
      header.style.display = "none";
      botonera.style.display = "none";
      inputArea.style.display = "none";

      const btnSalir = document.createElement("button");
      btnSalir.id = "btn-salir-presentacion";
      btnSalir.innerHTML = "✕ Salir de presentación";
      btnSalir.style.cssText = `
        position:fixed;top:10px;right:10px;z-index:9999;
        background:#E8401C;color:white;border:none;
        padding:8px 16px;border-radius:4px;cursor:pointer;
        font-size:13px;font-weight:600;`;
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
      estado.innerText = `✅ ${metadatos.total} cámaras · ${metadatos.minas.join(", ")} · ${metadatos.zonas.length} zonas`;
    }
    this.habilitarBotonera();
    document.getElementById("input").disabled = false;
    document.getElementById("send-btn").disabled = false;
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
