const ExportManager = {

 async exportarPDF() {
    const { jsPDF } = window.jspdf;
    const chat = document.getElementById("chat");
    const btn = document.getElementById("btn-exportar");

    if (btn) {
      btn.innerText = "⏳ Generando...";
      btn.disabled = true;
    }

    try {
      // Guardar altura original y expandir para captura completa
      const alturaOriginal = chat.style.height;
      const overflowOriginal = chat.style.overflow;
      chat.style.height = chat.scrollHeight + "px";
      chat.style.overflow = "visible";

      const canvas = await html2canvas(chat, {
        scale: 1.5,
        backgroundColor: "#f4f4f4",
        useCORS: true,
        logging: false,
        allowTaint: false,
        scrollY: 0,
        windowHeight: chat.scrollHeight
      });

      // Restaurar altura original
      chat.style.height = alturaOriginal;
      chat.style.overflow = overflowOriginal;

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentW = pageW - margin * 2;
      const fecha = new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
      const fechaArchivo = new Date().toISOString().slice(0, 10);

      // ── Cabecera primera página ──
      this._addCabecera(pdf, pageW, margin, fecha, true);

      // ── Contexto ──
      const ctxText = document.getElementById("contexto-box")?.innerText || "";
      pdf.setTextColor(80, 80, 80);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "italic");
      const ctxLines = pdf.splitTextToSize(ctxText, contentW);
      pdf.text(ctxLines, margin, 30);
      const ctxH = ctxLines.length * 4;

      // ── Metadatos del dataset ──
      if (DataManager.metadatos) {
        const m = DataManager.metadatos;
        const metaY = 30 + ctxH + 4;
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 100, 100);
        pdf.text(
          `Dataset: ${m.total} cámaras · ${m.minas.join(", ")} · ${m.zonas.length} zonas · Dil P50: ${(m.dil_p50*100).toFixed(1)}% · Rec P50: ${(m.rec_p50*100).toFixed(1)}%`,
          margin, metaY
        );
        var startY = metaY + 6;
      } else {
        var startY = 30 + ctxH + 6;
      }

      // ── Imagen del chat paginada ──
      const imgH = (canvas.height * contentW) / canvas.width;
      const availH = pageH - startY - margin;

      if (imgH <= availH) {
        pdf.addImage(imgData, "PNG", margin, startY, contentW, imgH);
      } else {
        const sliceH = canvas.height * (availH / imgH);
        let yOffset = 0;
        let isFirstPage = true;

        while (yOffset < canvas.height) {
          if (!isFirstPage) {
            pdf.addPage();
            this._addCabecera(pdf, pageW, margin, fecha, false);
          }

          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.min(sliceH, canvas.height - yOffset);
          const ctx2 = sliceCanvas.getContext("2d");
          ctx2.drawImage(canvas, 0, -yOffset);

          const sliceData = sliceCanvas.toDataURL("image/png");
          const sliceImgH = (sliceCanvas.height * contentW) / canvas.width;
          const topY = isFirstPage ? startY : 18;
          pdf.addImage(sliceData, "PNG", margin, topY, contentW, sliceImgH);

          yOffset += sliceH;
          isFirstPage = false;
        }
      }

      // ── Pie de página en todas las páginas ──
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
        pdf.text(
          `Página ${i} de ${totalPages}`,
          pageW - margin, pageH - 4,
          { align: "right" }
        );
      }

      pdf.save(`MATSA_Analisis_${fechaArchivo}.pdf`);

    } catch(e) {
      alert("Error al generar PDF: " + e.message);
    }

    if (btn) {
      btn.innerText = "📄 Exportar PDF";
      btn.disabled = false;
    }
  },

  _addCabecera(pdf, pageW, margin, fecha, isPrimera) {
    const altoCabecera = isPrimera ? 20 : 12;

    // Fondo marrón
    pdf.setFillColor(44, 24, 16);
    pdf.rect(0, 0, pageW, altoCabecera, "F");

    // Línea roja
    pdf.setFillColor(232, 64, 28);
    pdf.rect(0, altoCabecera, pageW, 2, "F");

    // Texto
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

  // Exportar solo texto del chat como TXT
  exportarTXT() {
    const msgs = document.querySelectorAll(".msg");
    let contenido = `${CONFIG.EMPRESA} — Análisis de Reconciliación\n`;
    contenido += `Fecha: ${new Date().toLocaleDateString("es-ES")}\n`;
    contenido += `${"=".repeat(60)}\n\n`;

    msgs.forEach(msg => {
      if (msg.classList.contains("user")) {
        contenido += `INGENIERO:\n${msg.querySelector("span")?.innerText || msg.innerText}\n\n`;
      } else if (msg.classList.contains("ai") && !msg.classList.contains("typing")) {
        contenido += `ASISTENTE IA:\n${msg.querySelector("span")?.innerText || msg.innerText}\n\n`;
        contenido += `${"-".repeat(40)}\n\n`;
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
