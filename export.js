// ============================================================
//  export.js  —  Exportación PDF (últimas 3 preguntas) y TXT
//  Versión 3.0
// ============================================================

const ExportManager = {

  async exportarPDF() {
    const { jsPDF } = window.jspdf;
    const chat = document.getElementById("chat");
    const btn = document.getElementById("btn-exportar") || document.querySelector("[onclick*='exportarPDF']");

    if (btn) { btn.innerText = "⏳ Generando..."; btn.disabled = true; }

    try {
      // Filtrar últimos 6 elementos del chat (3 preguntas + 3 respuestas)
      const todosLosMsgs = Array.from(chat.children).filter(
        el => el.classList.contains("msg") && !el.classList.contains("loading")
      );
      const ultimos = todosLosMsgs.slice(-6);

      // Crear div temporal fuera del viewport
      const chatTemp = document.createElement("div");
      chatTemp.style.cssText = `
        position: fixed;
        top: -9999px;
        left: 0;
        width: ${Math.max(chat.offsetWidth, 700)}px;
        background: #f4f4f4;
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-family: Segoe UI, Arial, sans-serif;
        font-size: 13px;
      `;
      ultimos.forEach(el => chatTemp.appendChild(el.cloneNode(true)));
      document.body.appendChild(chatTemp);

      const canvas = await html2canvas(chatTemp, {
        scale: 1.5,
        backgroundColor: "#f4f4f4",
        useCORS: true,
        logging: false,
        allowTaint: true
      });
      document.body.removeChild(chatTemp);

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentW = pageW - margin * 2;
      const fecha = new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
      const fechaArchivo = new Date().toISOString().slice(0, 10);

      // ── CABECERA PRIMERA PÁGINA ──
      this._addCabecera(pdf, pageW, margin, fecha, true);

      // Contexto Power BI
      const ctxText = document.getElementById("contexto-box")?.innerText || "";
      if (ctxText && ctxText !== "Sin contexto de Power BI activo — abre desde el informe para cargar filtros automáticamente.") {
        pdf.setTextColor(80, 80, 80);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "italic");
        const ctxLines = pdf.splitTextToSize(ctxText, contentW);
        pdf.text(ctxLines, margin, 28);
      }

      // ── IMAGEN DEL CHAT ──
      const startY = 34;
      const imgData = canvas.toDataURL("image/png");
      const imgH = (canvas.height * contentW) / canvas.width;
      const availH = pageH - startY - margin - 12;

      if (imgH <= availH) {
        pdf.addImage(imgData, "PNG", margin, startY, contentW, imgH);
      } else {
        // Paginar
        const totalImgH = canvas.height;
        const sliceHpx = Math.floor((availH / imgH) * totalImgH);
        let yOffset = 0;
        let isFirstPage = true;

        while (yOffset < totalImgH) {
          const sliceH = Math.min(sliceHpx, totalImgH - yOffset);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          const ctx2d = sliceCanvas.getContext("2d");
          ctx2d.drawImage(canvas, 0, -yOffset);
          const sliceData = sliceCanvas.toDataURL("image/png");
          const sliceImgH = (sliceH * contentW) / canvas.width;

          if (!isFirstPage) {
            pdf.addPage();
            this._addCabecera(pdf, pageW, margin, fecha, false);
          }

          const topY = isFirstPage ? startY : 18;
          pdf.addImage(sliceData, "PNG", margin, topY, contentW, sliceImgH);
          yOffset += sliceH;
          isFirstPage = false;
        }
      }

      // ── PIE DE PÁGINA ──
      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFillColor(244, 244, 244);
        pdf.rect(0, pageH - 10, pageW, 10, "F");
        pdf.setFillColor(232, 64, 28);
        pdf.rect(0, pageH - 10, pageW, 0.8, "F");
        pdf.setTextColor(150, 150, 150);
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.text(
          `Confidencial — Uso Interno  |  ${CONFIG.DEPARTAMENTO}`,
          margin, pageH - 4
        );
        pdf.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 4, { align: "right" });
      }

      pdf.save(`MATSA_Analisis_${fechaArchivo}.pdf`);

    } catch (e) {
      alert("Error al generar PDF: " + e.message);
    }

    if (btn) { btn.innerText = "📄 Exportar PDF"; btn.disabled = false; }
  },

  _addCabecera(pdf, pageW, margin, fecha, isPrimera) {
    const altoCabecera = isPrimera ? 20 : 12;

    pdf.setFillColor(44, 24, 16);
    pdf.rect(0, 0, pageW, altoCabecera, "F");
    pdf.setFillColor(232, 64, 28);
    pdf.rect(0, altoCabecera, pageW, 2, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");

    if (isPrimera) {
      pdf.setFontSize(11);
      pdf.text(`${CONFIG.EMPRESA}  |  Asistente Minero IA — Análisis de Reconciliación`, margin, 13);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(fecha, pageW - margin, 13, { align: "right" });
    } else {
      pdf.setFontSize(9);
      pdf.text(`${CONFIG.EMPRESA}  |  Análisis de Reconciliación (continuación)`, margin, 9);
    }
  },

  exportarTXT() {
    const msgs = document.querySelectorAll(".msg");
    let contenido = `${CONFIG.EMPRESA} — Asistente Minero IA\n`;
    contenido += `Análisis de Reconciliación de Cámaras\n`;
    contenido += `Fecha: ${new Date().toLocaleDateString("es-ES")}\n`;
    contenido += `${"=".repeat(60)}\n\n`;

    const ctxText = document.getElementById("contexto-box")?.innerText || "";
    if (ctxText) contenido += `Filtro activo: ${ctxText}\n${"─".repeat(60)}\n\n`;

    msgs.forEach(msg => {
      if (msg.classList.contains("loading")) return;
      if (msg.classList.contains("user")) {
        const texto = msg.innerText.trim();
        if (texto) contenido += `INGENIERO:\n${texto}\n\n`;
      } else if (msg.classList.contains("ai")) {
        const content = msg.querySelector(".msg-content");
        const texto = (content ? content.innerText : msg.innerText).trim();
        if (texto) {
          contenido += `ASISTENTE IA:\n${texto}\n\n`;
          contenido += `${"─".repeat(40)}\n\n`;
        }
      }
    });

    const blob = new Blob([contenido], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MATSA_Chat_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
};
