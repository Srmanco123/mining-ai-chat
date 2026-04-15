const StatsManager = {

  // ── REGRESIÓN LINEAL SIMPLE ────────────────────────────────────────
  regresionLineal(xs, ys) {
    const n = xs.length;
    if (n < 3) return null;
    const mx = xs.reduce((s,v) => s+v, 0) / n;
    const my = ys.reduce((s,v) => s+v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i]-mx)*(ys[i]-my); den += (xs[i]-mx)**2; }
    if (den === 0) return null;
    const b = num/den, a = my - b*mx;
    const yhat = xs.map(x => a+b*x);
    const ssTot = ys.reduce((s,v) => s+(v-my)**2, 0);
    const ssRes = ys.reduce((s,v,i) => s+(v-yhat[i])**2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes/ssTot : 0;
    return { a, b, r2, mx, my, n };
  },

  pearson(xs, ys) {
    const n = xs.length;
    const mx = xs.reduce((s,v)=>s+v,0)/n, my = ys.reduce((s,v)=>s+v,0)/n;
    let num=0, dx=0, dy=0;
    for (let i=0;i<n;i++) { num+=(xs[i]-mx)*(ys[i]-my); dx+=(xs[i]-mx)**2; dy+=(ys[i]-my)**2; }
    const d = Math.sqrt(dx*dy);
    return d > 0 ? num/d : 0;
  },

  _getArrayPairs(campoX, campoY) {
    const pairs = DataManager.datos
      .map(d => {
        const x = campoX.startsWith("_") ? d[campoX] : parseFloat(d[campoX]);
        const y = campoY.startsWith("_") ? d[campoY] : parseFloat(d[campoY]);
        return [x, y];
      })
      .filter(([x,y]) => isFinite(x) && isFinite(y) && x > 0 && y >= 0);
    return { xs: pairs.map(p=>p[0]), ys: pairs.map(p=>p[1]) };
  },

  _label(campo) {
    const map = { _pvt:"P&V t", _dil:"Dilución %", _rec:"Recuperación %", Sobrexcavacion_tn:"Sobreexcavación tn", Subexcavacion_tn:"Subexcavación tn", Ratio_tn_m:"Ratio tn/m" };
    return map[campo] || campo;
  },

  renderStats(spec) {
    if (spec.type === "regression") this._renderRegression(spec);
    else if (spec.type === "correlation") this._renderCorrelationMatrix(spec);
  },

  _renderRegression(spec) {
    const { xs, ys } = this._getArrayPairs(spec.x, spec.y);
    if (xs.length < 5) { UI.addMsg("Datos insuficientes para calcular la regresión.", "ai"); return; }
    const reg = this.regresionLineal(xs, ys);
    if (!reg) { UI.addMsg("No se pudo calcular la regresión.", "ai"); return; }
    const labelX = this._label(spec.x), labelY = this._label(spec.y);
    const r2pct = (reg.r2*100).toFixed(1);
    const fuerza = reg.r2>0.6?"fuerte":reg.r2>0.3?"moderada":"débil";
    const dir = reg.b>0?"positiva":"negativa";
    UI.addMsg("**Regresión: " + labelX + " → " + labelY + "**\nR² = **" + r2pct + "%** — correlación " + fuerza + " " + dir + " (" + reg.n + " cámaras)\nEcuación: y = " + reg.a.toFixed(4) + " + " + reg.b.toFixed(6) + " × x", "ai");
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    ChartManager.renderPlotly({
      data: [
        { type:"scatter", mode:"markers", x:xs, y:ys.map(v=>parseFloat((v*100).toFixed(2))), marker:{color:"#E8401C",opacity:0.5,size:6}, name:"Cámaras" },
        { type:"scatter", mode:"lines", x:[xMin,xMax], y:[reg.a+reg.b*xMin,reg.a+reg.b*xMax].map(v=>parseFloat((v*100).toFixed(2))), line:{color:"#2C1810",width:2,dash:"dash"}, name:"Regresión (R²="+r2pct+"%)" }
      ],
      layout: { title: labelX+" vs "+labelY, xaxis:{title:labelX}, yaxis:{title:labelY+" (%)"}, showlegend:true }
    });
  },

  _renderCorrelationMatrix(spec) {
    const vars = spec.vars || ["_pvt","_dil","_rec"];
    const labels = vars.map(v => this._label(v));
    const n = vars.length;
    const matrix = [], text = [];
    for (let i=0;i<n;i++) {
      matrix.push([]); text.push([]);
      const yi = DataManager.datos.map(d => vars[i].startsWith("_")?d[vars[i]]:parseFloat(d[vars[i]])).filter(isFinite);
      for (let j=0;j<n;j++) {
        const yj = DataManager.datos.map(d => vars[j].startsWith("_")?d[vars[j]]:parseFloat(d[vars[j]])).filter(isFinite);
        const r = this.pearson(yi.slice(0,Math.min(yi.length,yj.length)), yj.slice(0,Math.min(yi.length,yj.length)));
        matrix[i].push(parseFloat(r.toFixed(3))); text[i].push(r.toFixed(2));
      }
    }
    ChartManager.renderPlotly({
      data: [{ type:"heatmap", z:matrix, x:labels, y:labels, text:text, texttemplate:"%{text}", colorscale:[[0,"#2C1810"],[0.5,"#f4f4f4"],[1,"#E8401C"]], zmin:-1, zmax:1 }],
      layout: { title:"Matriz de correlaciones (Pearson)" }
    });
    let msg = "**Correlaciones destacadas:**\n";
    for (let i=0;i<n;i++) for (let j=i+1;j<n;j++) {
      const r = matrix[i][j], abs = Math.abs(r);
      if (abs > 0.3) msg += "· " + labels[i] + " ↔ " + labels[j] + ": r = **" + r.toFixed(2) + "** (" + (abs>0.6?"fuerte":"moderada") + " " + (r>0?"positiva":"negativa") + ")\n";
    }
    UI.addMsg(msg, "ai");
  },

  // ── PREDICCIÓN TEMPORAL CON ESCENARIOS ────────────────────────────
  predecirZona(filtro) {
    // filtro: {tipo: 'zona'|'mina', valor: 'ACT'|'ATE'...}
    const datos = DataManager.datos.filter(d => {
      if (filtro.tipo === "zona") return d[CONFIG.CAMPOS.zona] === filtro.valor;
      if (filtro.tipo === "mina") return d[CONFIG.CAMPOS.mina] === filtro.valor;
      return true;
    });

    // Agrupar por año
    const porAnio = {};
    datos.forEach(d => {
      const fecha = d[CONFIG.CAMPOS.fecha];
      if (!fecha) return;
      const anio = String(fecha).substring(0,4);
      if (!anio || isNaN(anio)) return;
      if (!porAnio[anio]) porAnio[anio] = { sobre:0, sub:0, pvt:0, n:0 };
      porAnio[anio].sobre += parseFloat(d[CONFIG.CAMPOS.sobreexcavacion]) || 0;
      porAnio[anio].sub   += parseFloat(d[CONFIG.CAMPOS.subexcavacion]) || 0;
      porAnio[anio].pvt   += d._pvt;
      porAnio[anio].n++;
    });

    const anios = Object.keys(porAnio).sort();
    if (anios.length < 3) return null;

    // Excluir outliers si se indica
    const p75dil = DataManager.metadatos ? DataManager.metadatos.dil_p75 : 1;
    const datosFiltrados = filtro.sinOutliers
      ? datos.filter(d => d._dil <= p75dil)
      : datos;

    // Recalcular porAnio sin outliers si aplica
    if (filtro.sinOutliers) {
      Object.keys(porAnio).forEach(a => {
        porAnio[a] = { sobre:0, sub:0, pvt:0, n:0 };
      });
      datosFiltrados.forEach(d => {
        const fecha = d[CONFIG.CAMPOS.fecha];
        if (!fecha) return;
        const anio = String(fecha).substring(0,4);
        if (!anio || isNaN(anio)) return;
        if (!porAnio[anio]) porAnio[anio] = { sobre:0, sub:0, pvt:0, n:0 };
        porAnio[anio].sobre += parseFloat(d[CONFIG.CAMPOS.sobreexcavacion]) || 0;
        porAnio[anio].sub   += parseFloat(d[CONFIG.CAMPOS.subexcavacion]) || 0;
        porAnio[anio].pvt   += d._pvt;
        porAnio[anio].n++;
      });
    }

    const xs = anios.map(a => parseInt(a));
    const dilValues = anios.map(a => porAnio[a].pvt>0 ? porAnio[a].sobre/porAnio[a].pvt : 0);
    const recValues = anios.map(a => porAnio[a].pvt>0 ? 1-porAnio[a].sub/porAnio[a].pvt : 1);

    const regDil = this.regresionLineal(xs, dilValues);
    const regRec = this.regresionLineal(xs, recValues);

    // Proyectar 2 años
    const ultimoAnio = xs[xs.length-1];
    const proxAnios = Array.from({length:10}, (_,i) => ultimoAnio+i+1);

    const proyBase = proxAnios.map(a => ({
      anio: a,
      dil: Math.min(1, Math.max(0, regDil ? regDil.a + regDil.b*a : dilValues[dilValues.length-1])),
      rec: Math.min(1, Math.max(0, regRec ? regRec.a + regRec.b*a : recValues[recValues.length-1]))
    }));

    // Escenario pesimista: +15% dil, -5% rec
    const proyPes = proyBase.map(p => ({ anio:p.anio, dil:Math.min(1,p.dil*1.15), rec:Math.max(0,p.rec*0.95) }));
    // Escenario optimista: -20% dil, +3% rec
    const proyOpt = proyBase.map(p => ({ anio:p.anio, dil:Math.max(0,p.dil*0.80), rec:Math.min(1,p.rec*1.03) }));

    return { anios, xs, dilValues, recValues, proyBase, proyPes, proyOpt, regDil, regRec, n: datos.length, filtro };
  },

  renderPrediccion(filtro) {
    const pred = this.predecirZona(filtro);
    if (!pred) { UI.addMsg("Datos históricos insuficientes para predecir (mínimo 3 años).", "ai"); return; }

    const nombre = filtro.valor || "Dataset global";
    const ultimaDil = (pred.dilValues[pred.dilValues.length-1]*100).toFixed(1);
    const ultimaRec = (pred.recValues[pred.recValues.length-1]*100).toFixed(1);
    const tendDil = pred.regDil && pred.regDil.b > 0.005 ? "↑ empeorando" : pred.regDil && pred.regDil.b < -0.005 ? "↓ mejorando" : "→ estable";

    UI.addMsg("**Predicción: " + nombre + "** (" + pred.n + " cámaras)\nDilución actual: **" + ultimaDil + "%** — tendencia " + tendDil + "\nProyección a 10 años con 3 escenarios. Activa mejoras para modificar el escenario optimista.", "ai");

    // Gráfica de predicción
    const todosAnios = [...pred.anios, ...pred.proyBase.map(p=>String(p.anio))];
    const sepIdx = pred.anios.length - 1;

    ChartManager.renderPlotly({
      data: [
        { x: pred.anios, y: pred.dilValues.map(v=>+(v*100).toFixed(1)), type:"scatter", mode:"lines+markers", name:"Histórico dil.", line:{color:"#E8401C",width:2}, marker:{size:6} },
        { x: pred.proyBase.map(p=>String(p.anio)), y: pred.proyBase.map(p=>+(p.dil*100).toFixed(1)), type:"scatter", mode:"lines+markers", name:"Base", line:{color:"#E8401C",width:2,dash:"dot"}, marker:{size:5} },
        { x: pred.proyPes.map(p=>String(p.anio)), y: pred.proyPes.map(p=>+(p.dil*100).toFixed(1)), type:"scatter", mode:"lines+markers", name:"Pesimista", line:{color:"#888",width:1.5,dash:"dash"}, marker:{size:5} },
        { x: pred.proyOpt.map(p=>String(p.anio)), y: pred.proyOpt.map(p=>+(p.dil*100).toFixed(1)), type:"scatter", mode:"lines+markers", name:"Optimista", line:{color:"#1D9E75",width:2,dash:"dash"}, marker:{size:5} }
      ],
      layout: { title:"Predicción Dilución ponderada — "+nombre, yaxis:{title:"Dilución (%)"}, showlegend:true,
        shapes:[{ type:"line", x0:pred.anios[pred.anios.length-1], x1:pred.anios[pred.anios.length-1], y0:0, y1:100, line:{color:"#ccc",dash:"dot",width:1} }] }
    });

    // Botones de mejoras sugeridas
    this._renderMejorasPrediccion(pred, filtro);
  },

  _renderMejorasPrediccion(pred, filtro) {
    const chat = document.getElementById("chat");
    const wrapper = document.createElement("div");
    wrapper.className = "mejoras-wrapper";

    // Toggle excluir outliers
    const toggleRow = document.createElement("div");
    toggleRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;";
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn-mejora";
    toggleBtn.style.cssText = "min-width:auto;padding:5px 12px;";
    toggleBtn.innerHTML = "<strong>Excluir outliers</strong><span>Solo cámaras con dil ≤ P75</span>";
    let sinOutliers = false;
    toggleBtn.onclick = () => {
      sinOutliers = !sinOutliers;
      toggleBtn.classList.toggle("activa", sinOutliers);
      const nuevoPred = StatsManager.predecirZona({...filtro, sinOutliers});
      if (nuevoPred) {
        const charts = document.querySelectorAll(".chart-wrapper");
        const lastChart = charts[charts.length-1];
        if (lastChart) {
          const div = lastChart.querySelector("div");
          if (div && div._fullLayout) {
            Plotly.restyle(div, {
              y: [nuevoPred.dilValues.map(v=>+(v*100).toFixed(1)),
                  nuevoPred.proyBase.map(p=>+(p.dil*100).toFixed(1)),
                  nuevoPred.proyPes.map(p=>+(p.dil*100).toFixed(1)),
                  nuevoPred.proyOpt.map(p=>+(p.dil*100).toFixed(1))]
            }, [0,1,2,3]);
          }
        }
      }
    };
    toggleRow.appendChild(toggleBtn);
    wrapper.appendChild(toggleRow);

    const titulo = document.createElement("div");
    titulo.className = "mejoras-titulo";
    titulo.textContent = "Aplica mejoras para recalcular escenario optimista:";
    wrapper.appendChild(titulo);

    const mejoras = [
      { id:"voladura", label:"Mejorar control de voladura", desc:"Reducir sobreexcavación 15%", factorDil:0.85 },
      { id:"diseno",   label:"Optimizar diseño de cámara",  desc:"Reducir dilución 10%",         factorDil:0.90 },
      { id:"protocolo",label:"Aplicar protocolo ACT",       desc:"Reducir dilución 20%",         factorDil:0.80 },
      { id:"pilares",  label:"Rediseño de pilares",         desc:"Mejorar recuperación 5%",      factorDil:1.00, factorRec:1.05 },
      { id:"lidar",    label:"Implementar LIDAR pre-voladura",desc:"Reducir dilución 25%",       factorDil:0.75 }
    ];

    const activas = new Set();
    const grid = document.createElement("div");
    grid.className = "mejoras-grid";

    mejoras.forEach(m => {
      const btn = document.createElement("button");
      btn.className = "btn-mejora";
      btn.innerHTML = "<strong>" + m.label + "</strong><span>" + m.desc + "</span>";
      btn.onclick = () => {
        if (activas.has(m.id)) { activas.delete(m.id); btn.classList.remove("activa"); }
        else { activas.add(m.id); btn.classList.add("activa"); }
        // Recalcular optimista
        let factorDil = 1, factorRec = 1;
        activas.forEach(id => {
          const mej = mejoras.find(x => x.id===id);
          if (mej) { factorDil *= mej.factorDil || 1; factorRec *= mej.factorRec || 1; }
        });
        const nuevaOpt = pred.proyBase.map(p => ({
          anio: p.anio,
          dil: Math.max(0, p.dil * factorDil),
          rec: Math.min(1, p.rec * factorRec)
        }));
        // Actualizar gráfica — buscar el último wrapper de chart
        const charts = document.querySelectorAll(".chart-wrapper");
        const lastChart = charts[charts.length-1];
        if (lastChart) {
          const div = lastChart.querySelector("div");
          if (div && div._fullLayout) {
            Plotly.restyle(div, { y: [nuevaOpt.map(p=>+(p.dil*100).toFixed(1))] }, [3]);
          }
        }
      };
      grid.appendChild(btn);
    });

    // Input para mejora personalizada
    const customRow = document.createElement("div");
    customRow.className = "mejora-custom-row";
    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.placeholder = "Escribe una mejora personalizada...";
    customInput.className = "mejora-custom-input";
    const customBtn = document.createElement("button");
    customBtn.className = "btn-mejora-custom";
    customBtn.textContent = "Simular ↗";
    customBtn.onclick = () => {
      const texto = customInput.value.trim();
      if (!texto) return;
      ChatManager.enviar("Para " + (filtro.valor||"el dataset") + ", simula el impacto en dilución y recuperación si se implementa: " + texto + ". Da el % estimado de mejora y recalcula la predicción.");
    };
    customRow.appendChild(customInput);
    customRow.appendChild(customBtn);

    wrapper.appendChild(grid);
    wrapper.appendChild(customRow);
    chat.appendChild(wrapper);
    chat.scrollTop = chat.scrollHeight;
  },

  // ── CLUSTERING K-MEANS ────────────────────────────────────────────
  kMeans(datos, k, iteraciones) {
    iteraciones = iteraciones || 50;
    if (datos.length < k) return null;

    // Normalizar
    const campos = ["_dil","_rec","_pvt"];
    const mins = campos.map(c => Math.min(...datos.map(d=>d[c]||0)));
    const maxs = campos.map(c => Math.max(...datos.map(d=>d[c]||0)));
    const norm = d => campos.map((c,i) => maxs[i]>mins[i] ? ((d[c]||0)-mins[i])/(maxs[i]-mins[i]) : 0);

    const datosNorm = datos.map(d => norm(d));

    // Inicializar centroides aleatoriamente (usando primeros k elementos espaciados)
    const step = Math.floor(datos.length / k);
    let centroides = Array.from({length:k}, (_,i) => [...datosNorm[i*step]]);

    let asignaciones = new Array(datos.length).fill(0);

    for (let iter=0; iter<iteraciones; iter++) {
      // Asignar
      const nuevasAsig = datosNorm.map(d => {
        let minDist=Infinity, mejor=0;
        centroides.forEach((c,i) => {
          const dist = c.reduce((s,v,j) => s+(v-d[j])**2, 0);
          if (dist<minDist) { minDist=dist; mejor=i; }
        });
        return mejor;
      });

      // Convergencia
      if (nuevasAsig.every((a,i) => a===asignaciones[i])) break;
      asignaciones = nuevasAsig;

      // Actualizar centroides
      centroides = Array.from({length:k}, (_,i) => {
        const grupo = datosNorm.filter((_,j) => asignaciones[j]===i);
        if (!grupo.length) return centroides[i];
        return campos.map((_,c) => grupo.reduce((s,d) => s+d[c], 0)/grupo.length);
      });
    }

    // Desnormalizar centroides
    const centroidesReal = centroides.map(c => ({
      dil: c[0]*(maxs[0]-mins[0])+mins[0],
      rec: c[1]*(maxs[1]-mins[1])+mins[1],
      pvt: c[2]*(maxs[2]-mins[2])+mins[2]
    }));

    // Estadísticas por cluster
    const clusters = Array.from({length:k}, (_,i) => {
      const miembros = datos.filter((_,j) => asignaciones[j]===i);
      const sumSobre = miembros.reduce((s,d) => s+(parseFloat(d[CONFIG.CAMPOS.sobreexcavacion])||0),0);
      const sumSub   = miembros.reduce((s,d) => s+(parseFloat(d[CONFIG.CAMPOS.subexcavacion])||0),0);
      const sumPvt   = miembros.reduce((s,d) => s+d._pvt,0);
      return {
        id: i,
        n: miembros.length,
        dil: sumPvt>0 ? sumSobre/sumPvt : 0,
        rec: sumPvt>0 ? 1-sumSub/sumPvt : 1,
        pvt: sumPvt/Math.max(miembros.length,1),
        centroide: centroidesReal[i],
        stopes: miembros.map(d=>d[CONFIG.CAMPOS.id]).slice(0,5)
      };
    });

    return { clusters, asignaciones, k };
  },

  renderClustering() {
    const datos = DataManager.datos.filter(d => d._pvt > 0);
    if (datos.length < 8) { UI.addMsg("Datos insuficientes para clustering.", "ai"); return; }

    const resultado = this.kMeans(datos, 4);
    if (!resultado) { UI.addMsg("No se pudo calcular el clustering.", "ai"); return; }

    const colores = ["#E8401C","#1D9E75","#EF9F27","#2C1810"];
    const { clusters, asignaciones } = resultado;

    // Scatter coloreado por cluster
    const traces = clusters.map((cl,i) => {
      const miembros = datos.filter((_,j) => asignaciones[j]===i);
      return {
        type:"scatter", mode:"markers",
        x: miembros.map(d=>+(d._dil*100).toFixed(1)),
        y: miembros.map(d=>+(d._rec*100).toFixed(1)),
        text: miembros.map(d=>d[CONFIG.CAMPOS.id]+" ("+d[CONFIG.CAMPOS.zona]+")"),
        hovertemplate:"%{text}<br>Dil:%{x}% Rec:%{y}%<extra></extra>",
        marker:{color:colores[i],size:7,opacity:0.8},
        name:"Grupo "+(i+1)+" ("+cl.n+")"
      };
    });

    ChartManager.renderPlotly({
      data: traces,
      layout: { title:"Clustering de cámaras (k=4) — Dil vs Rec", xaxis:{title:"Dilución (%)"}, yaxis:{title:"Recuperación (%)"}, showlegend:true }
    });

    // Enviar a Claude para que interprete y nombre los clusters
    const resumenClusters = clusters.map((cl,i) => ({
      grupo: i+1,
      n: cl.n,
      dil_ponderada: (cl.dil*100).toFixed(1)+"%",
      rec_ponderada: (cl.rec*100).toFixed(1)+"%",
      pvt_medio: Math.round(cl.pvt)+" tn",
      ejemplos: cl.stopes.join(", ")
    }));

    ChatManager.enviar("Se han identificado 4 grupos de cámaras mediante clustering k-means. Interpreta y nombra cada grupo con terminología minera técnica, explica qué tienen en común y qué acción operacional requiere cada uno. Datos: " + JSON.stringify(resumenClusters));
  }
};
