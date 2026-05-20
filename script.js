const map = L.map('map').setView([-34.268, -62.712], 15);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);

// Variables Globales
let datosTgi, capaTgi, miGraficoG, miGraficoC, miGraficoO;
let lotesObraActual = []; 
let nombreObraActual = ""; 

// Helpers para mapeo inteligente de propiedades
function buscarProp(obj, texto) {
    for (let k in obj) { if (k.toLowerCase().includes(texto.toLowerCase())) return obj[k]; }
    return "";
}

function limpiarMontoDeuda(propiedades) { return limpiarMontoGenerico(buscarProp(propiedades, "Deuda TGI")); }

function limpiarMontoGenerico(valorTexto) {
    let texto = String(valorTexto || "0").trim();
    if (texto.toLowerCase() === "null") return 0;
    texto = texto.replace('$', '').replace(/\s/g, '');
    if ((texto.match(/\./g) || []).length === 1 && texto.includes(',')) { texto = texto.replace(/,/g, ''); } 
    else { texto = texto.replace(/\./g, '').replace(',', '.'); }
    return parseFloat(texto) || 0;
}

// Estilos de visualización
function estiloManzanaPorSeccion(feature) {
    const seccion = String(buscarProp(feature.properties, "Seccion") || "0");
    let colorSeccion = '#ccc';
    switch (seccion) {
        case '1': colorSeccion = '#3498db'; break;
        case '2': colorSeccion = '#2ecc71'; break;
        case '3': colorSeccion = '#9b59b6'; break;
        case '4': colorSeccion = '#e67e22'; break;
        case '5': colorSeccion = '#1abc9c'; break;
        default:
            let hash = 0;
            for (let i = 0; i < seccion.length; i++) { hash = seccion.charCodeAt(i) + ((hash << 5) - hash); }
            colorSeccion = `hsl(${Math.abs(hash) % 360}, 60%, 80%)`;
    }
    return { color: colorSeccion, fillColor: colorSeccion, weight: 1.5, fillOpacity: 0.12, dashArray: '3' };
}

// Clasificación de lotes según su deuda de TGI
function estiloLote(f) {
    const deu = limpiarMontoDeuda(f.properties);
    const mes = parseInt(buscarProp(f.properties, "Meses Adeud.TGI")) || 0;
    if (deu <= 0) return { color: "#aaa", weight: 0.5, fillOpacity: 0.1 };
    let col = (mes === 1) ? '#f1c40f' : '#e74c3c';
    return { color: col, fillColor: col, weight: 1, fillOpacity: 0.6 };
}

// 2. CARGA DE DATOS (Con trazabilidad para diagnóstico de manzanas)
async function cargarDatos() {
    try {
        console.log("Intentando cargar manzanas.geojson...");
        const resM = await fetch('manzanas.geojson');
        if (resM.ok) {
            const dataM = await resM.json();
            console.log("¡Manzanas cargadas con éxito!", dataM);
            
            L.geoJSON(dataM, { 
                style: estiloManzanaPorSeccion,
                onEachFeature: (f, l) => {
                    const sec = buscarProp(f.properties, "Seccion") || buscarProp(f.properties, "Sector") || buscarProp(f.properties, "Zona");
                    if(sec) {
                        l.bindTooltip(`Sección ${sec}`, { sticky: true, opacity: 0.7 });
                    }
                }
            }).addTo(map);
        } else {
            console.error("El archivo manzanas.geojson no devolvió un estado OK. Código:", resM.status);
        }
    } catch (e) { 
        console.warn("Error crítico al renderizar manzanas.geojson.", e); 
    }

    try {
        const resT = await fetch('tgi.geojson');
        datosTgi = await resT.json();
        dibujarMapa(datosTgi.features);
        actualizarGraficoGeneral(datosTgi.features);
        inicializarDesplegableSecciones(datosTgi.features);
        inicializarDesplegableObras(datosTgi.features); 
    } catch (e) { console.error("Error cargando tgi.geojson:", e); }
}

function dibujarMapa(features) {
    if (capaTgi) map.removeLayer(capaTgi);
    capaTgi = L.geoJSON({type: "FeatureCollection", features: features}, {
        style: estiloLote,
        onEachFeature: (f, l) => {
            l.on('click', (e) => { L.DomEvent.stopPropagation(e); mostrarFicha(f.properties); });
        }
    }).addTo(map);
}

// 3. FILTRADOS
function filtrarTodo() {
    const apellido = document.getElementById('inputApellido').value.toLowerCase();
    const calleInput = document.getElementById('inputCalle').value.toLowerCase();
    const sugApp = document.getElementById('listaSugerencias');
    const sugCalle = document.getElementById('listaSugerenciasCalle');

    document.getElementById('selectSeccion').value = "";
    document.getElementById('selectObra').value = "";
    document.getElementById('panelEstadisticaObra').style.display = "none";
    document.getElementById('btnImprimirObra').style.display = "none"; 

    const filtrados = datosTgi.features.filter(f => {
        const nom = (buscarProp(f.properties, "Tit. Nombre") || "").toLowerCase();
        const padron = String(buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente") || "").toLowerCase();
        const dom = (buscarProp(f.properties, "Ubicacion") || "").toLowerCase();
        return (nom.includes(apellido) || padron.includes(apellido)) && dom.includes(calleInput);
    });

    dibujarMapa(filtrados);
    actualizarGraficoGeneral(filtrados);

    if (calleInput.length >= 2) {
        let callesLimpias = datosTgi.features.map(f => {
            let texto = (buscarProp(f.properties, "Ubicacion") || "");
            return texto.replace(/\d+/g, '').trim(); 
        });
        let sugerenciasUnicas = [...new Set(callesLimpias)].filter(c => c.toLowerCase().includes(calleInput)).sort().slice(0, 8);
        let htmlC = "";
        sugerenciasUnicas.forEach(c => { htmlC += `<div class="item-sugerencia" onclick="seleccionarCalle('${c}')">🛣️ ${c}</div>`; });
        sugCalle.innerHTML = htmlC; sugCalle.style.display = htmlC ? "block" : "none";
    } else { 
        sugCalle.style.display = "none";
        document.getElementById('panelEstadisticaCalle').style.display = "none";
    }

    if (apellido.length >= 2) {
        let html = "";
        filtrados.slice(0, 10).forEach(f => {
            const n = buscarProp(f.properties, "Tit. Nombre");
            const p = buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente") || "-";
            html += `<div class="item-sugerencia" onclick="seleccionarLotePorPadron('${p}')"><strong>${n}</strong><br><small>Padrón: ${p}</small></div>`;
        });
        sugApp.innerHTML = html; sugApp.style.display = html ? "block" : "none";
    } else { sugApp.style.display = "none"; }
}

document.getElementById('inputApellido').oninput = filtrarTodo;
document.getElementById('inputCalle').oninput = filtrarTodo;

// 4. ACCIONES DE SELECCIÓN
window.seleccionarCalle = function(nombreCalleLimpia) {
    document.getElementById('inputCalle').value = nombreCalleLimpia;
    document.getElementById('listaSugerenciasCalle').style.display = "none";
    const lotesCalle = datosTgi.features.filter(f => {
        const dom = (buscarProp(f.properties, "Ubicacion") || "").toLowerCase();
        return dom.includes(nombreCalleLimpia.toLowerCase());
    });
    dibujarMapa(lotesCalle);
    capaTgi.eachLayer(l => { l.bringToFront(); if (l._path) l._path.classList.add('lote-calle-resaltada'); });
    if (capaTgi.getLayers().length > 0) map.fitBounds(capaTgi.getBounds(), { padding: [30, 30] });
    generarEstadisticaCalle(lotesCalle, nombreCalleLimpia);
};

function generarEstadisticaCalle(features, nombre) {
    let alDia=0, vencer=0, deuda=0;
    features.forEach(f => {
        const deu = limpiarMontoDeuda(f.properties);
        const mes = parseInt(buscarProp(f.properties, "Meses Adeud.TGI")) || 0;
        if (deu <= 0) alDia++; else if (mes === 1) vencer++; else deuda++;
    });

    const total = features.length;
    const porcDeuda = ((deuda / total) * 100).toFixed(1);
    const porcAlDia = (((alDia + vencer) / total) * 100).toFixed(1);

    const panel = document.getElementById('panelEstadisticaCalle');
    panel.style.display = "block";
    document.getElementById('statsCalleContenido').innerHTML = `
        <p style="font-size:10px; margin:5px 0;">📍 <strong>${nombre}</strong></p>
        <p style="font-size:11px; margin:0;">Total: <strong>${total}</strong> registros</p>
        <span class="etiqueta-porcentaje">CUMPLIMIENTO: ${porcAlDia}%</span>
        <div class="barra-progreso"><div class="progreso-llenado" style="width:${porcAlDia}%; background:#2ecc71;"></div></div>
        <span class="etiqueta-porcentaje">MOROSIDAD: ${porcDeuda}%</span>
        <div class="barra-progreso"><div class="progreso-llenado" style="width:${porcDeuda}%; background:#e74c3c;"></div></div>
    `;

    if (miGraficoC) miGraficoC.destroy();
    miGraficoC = new Chart(document.getElementById('graficoCalle'), {
        type: 'doughnut',
        data: { datasets: [{ data: [alDia, vencer, deuda], backgroundColor: ['#2ecc71', '#f1c40f', '#e74c3c'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false }, cutout: '65%' }
    });
}

// 5. PANELES Y FICHAS
window.togglePanelDerecho = function() {
    const cuerpo = document.getElementById('cuerpoD');
    const btn = document.getElementById('btnT');
    const cerrado = cuerpo.style.display === "none";
    cuerpo.style.display = cerrado ? "block" : "none";
    btn.innerText = cerrado ? "➖" : "➕";
};

function actualizarGraficoGeneral(features) {
    let s=0, v=0, d=0;
    features.forEach(f => {
        const deu = limpiarMontoDeuda(f.properties);
        const mes = parseInt(buscarProp(f.properties, "Meses Adeud.TGI")) || 0;
        if (deu <= 0) s++; else if (mes === 1) v++; else d++;
    });
    
    const total = s + v + d;

    if (miGraficoG) miGraficoG.destroy();
    miGraficoG = new Chart(document.getElementById('graficoBarras'), {
        type: 'bar',
        data: { 
            labels: ['Al Día', 'A Vencer', 'Deuda'], 
            datasets: [{ data: [s, v, d], backgroundColor: ['#bdc3c7', '#f1c40f', '#e74c3c'], borderRadius: 4 }] 
        },
        options: { 
            indexAxis: 'y', 
            plugins: { 
                legend: false,
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const valor = context.raw;
                            const porcentaje = total > 0 ? ((valor / total) * 100).toFixed(1) : 0;
                            return ` ${valor} (${porcentaje}%)`;
                        }
                    }
                }
            }, 
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { display: false }, 
                    border: { display: false }
                },
                y: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: { color: '#2c3e50', font: { weight: 'bold', size: 11 } }
                }
            }
        },
        plugins: [{
            id: 'porcentajesAlFinalDeBarra',
            afterDatasetsDraw(chart) {
                const { ctx, data } = chart;
                ctx.save();
                ctx.font = 'bold 11px sans-serif';
                ctx.fillStyle = '#2c3e50';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                chart.getDatasetMeta(0).data.forEach((bar, index) => {
                    const valor = data.datasets[0].data[index];
                    const porcentaje = total > 0 ? ((valor / total) * 100).toFixed(1) : 0;
                    const textoAMostrar = `${valor} (${porcentaje}%)`;
                    
                    const posicionX = bar.x + 8; 
                    const posicionY = bar.y;
                    
                    ctx.fillText(textoAMostrar, posicionX, posicionY);
                });
                ctx.restore();
            }
        }]
    });
}

window.seleccionarLotePorPadron = function(padronVal) {
    const lote = datosTgi.features.find(f => {
        const idP = buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente");
        return String(idP) === String(padronVal);
    });
    if (lote) {
        const listaSug = document.getElementById('listaSugerencias');
        if (listaSug) listaSug.style.display = "none";
        document.getElementById('inputApellido').value = buscarProp(lote.properties, "Tit. Nombre");
        map.fitBounds(L.geoJSON(lote).getBounds(), { maxZoom: 19 });
        mostrarFicha(lote.properties);
        capaTgi.eachLayer(l => {
            const idL = buscarProp(l.feature.properties, "Padron") || buscarProp(l.feature.properties, "Contribuyente");
            if (String(idL) === String(padronVal)) {
                l.bringToFront();
                const el = l._path;
                if (el) { el.classList.remove('lote-parpadeando'); void el.offsetWidth; el.classList.add('lote-parpadeando'); }
            }
        });
    }
};

function mostrarFicha(p) {
    const div = document.getElementById('contenidoFicha');
    const d = limpiarMontoDeuda(p);
    const m = parseInt(buscarProp(p, "Meses Adeud.TGI")) || 0;
    
    const padronDetectado = buscarProp(p, "Padron") || "-";
    const domicilioDetectado = buscarProp(p, "Ubicacion") || "-";
    let est = (d > 0) ? (m === 1 ? '<span class="vencer">A VENCER</span>' : '<span class="deuda">DEUDA</span>') : 'AL DÍA';
    
    let html = `<button class="btn-cerrar-ficha" onclick="cerrarFicha()">×</button>
                <h3 style="font-size:11px; margin-bottom:10px; color:#3498db;">DETALLE DEL LOTE</h3>
                <p><span class="etiqueta">Estado TGI:</span> <span class="valor">${est}</span></p>
                <p><span class="etiqueta">Nro. Padrón:</span> <span class="valor" style="font-weight:bold; color:#2c3e50;">${padronDetectado}</span></p>
                <p><span class="etiqueta">Domicilio:</span> <span class="valor">${domicilioDetectado}</span></p>
                <hr style="border:0; border-top:1px dashed #eee; margin:10px 0;">`;
                
    for (let k in p) { 
        html += `<p><span class="etiqueta">${k}:</span> <span class="valor">${p[k] || '-'}</span></p>`; 
    }
    
    div.innerHTML = html; 
    div.style.display = "block";
}
window.cerrarFicha = () => { document.getElementById('contenidoFicha').style.display = "none"; };

// 6. MENÚ DE SECCIONES
function inicializarDesplegableSecciones(features) {
    const select = document.getElementById('selectSeccion');
    let seccionesUnicas = [...new Set(features.map(f => String(buscarProp(f.properties, "Seccion") || "").trim()))].filter(s => s !== "").sort((a, b) => (parseInt(a) || a) - (parseInt(b) || b));
    select.innerHTML = '<option value="">🧱 Seleccionar Sección...</option>';
    seccionesUnicas.forEach(s => { const option = document.createElement('option'); option.value = s; option.textContent = `Sección ${s}`; select.appendChild(option); });
}

document.getElementById('selectSeccion').onchange = function() {
    const numSeccion = this.value;
    document.getElementById('inputApellido').value = "";
    document.getElementById('inputCalle').value = "";
    document.getElementById('selectObra').value = ""; 
    document.getElementById('panelEstadisticaCalle').style.display = "none";
    document.getElementById('panelEstadisticaObra').style.display = "none";
    document.getElementById('btnImprimirObra').style.display = "none";

    if (!numSeccion) { dibujarMapa(datosTgi.features); actualizarGraficoGeneral(datosTgi.features); return; }
    const lotesSeccion = datosTgi.features.filter(f => String(buscarProp(f.properties, "Seccion") || "").trim() === numSeccion);
    dibujarMapa(lotesSeccion); actualizarGraficoGeneral(lotesSeccion);
    capaTgi.eachLayer(l => { l.bringToFront(); if (l._path) l._path.classList.add('lote-calle-resaltada'); });
    if (capaTgi.getLayers().length > 0) map.fitBounds(capaTgi.getBounds(), { padding: [40, 40] });
};

// 7. MENÚ E INFORMES DE OBRAS PÚBLICAS
function inicializarDesplegableObras(features) {
    const select = document.getElementById('selectObra');
    let obrasUnicas = [...new Set(features.map(f => String(buscarProp(f.properties, "Obras") || "").trim()))]
        .filter(o => o !== "" && o.toLowerCase() !== "null");
    
    obrasUnicas.sort();
    select.innerHTML = '<option value="">🚧 Seleccionar Obra...</option>';
    obrasUnicas.forEach(o => {
        const option = document.createElement('option'); option.value = o; option.textContent = o; select.appendChild(option);
    });
}

document.getElementById('selectObra').onchange = function() {
    nombreObraActual = this.value; 
    const panelObra = document.getElementById('panelEstadisticaObra');
    const btnPrint = document.getElementById('btnImprimirObra');

    document.getElementById('inputApellido').value = "";
    document.getElementById('inputCalle').value = "";
    document.getElementById('selectSeccion').value = "";
    document.getElementById('panelEstadisticaCalle').style.display = "none";

    if (!nombreObraActual) {
        panelObra.style.display = "none";
        btnPrint.style.display = "none"; 
        dibujarMapa(datosTgi.features);
        actualizarGraficoGeneral(datosTgi.features);
        return;
    }

    lotesObraActual = datosTgi.features.filter(f => String(buscarProp(f.properties, "Obras") || "").trim() === nombreObraActual); 

    dibujarMapa(lotesObraActual);
    actualizarGraficoGeneral(lotesObraActual);
    generarEstadisticaObra(lotesObraActual, nombreObraActual);

    capaTgi.eachLayer(l => { l.bringToFront(); if (l._path) l._path.classList.add('lote-calle-resaltada'); });
    if (capaTgi.getLayers().length > 0) map.fitBounds(capaTgi.getBounds(), { padding: [40, 40] });

    btnPrint.style.display = "block"; 
};

function generarEstadisticaObra(features, nombre) {
    let alDia = 0, conDeuda = 0;
    let sumaMontoDeudaObra = 0;

    features.forEach(f => {
        const deudaObra = limpiarMontoGenerico(buscarProp(f.properties, "Deuda Obra"));
        sumaMontoDeudaObra += deudaObra;
        const cuotasAtrasadas = parseInt(buscarProp(f.properties, "Cuotas Atrasadas")) || 0;
        if (deudaObra <= 0 && cuotasAtrasadas <= 0) alDia++; 
        else conDeuda++;
    });

    const total = features.length;
    const porcDeuda = total > 0 ? ((conDeuda / total) * 100).toFixed(1) : 0;
    const porcAlDia = total > 0 ? ((alDia / total) * 100).toFixed(1) : 0;
    const montoFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(sumaMontoDeudaObra);

    const panel = document.getElementById('panelEstadisticaObra');
    panel.style.display = "block";
    document.getElementById('statsObraContenido').innerHTML = `
        <p style="font-size:10px; margin:5px 0;">🚧 <strong>${nombre}</strong></p>
        <p style="font-size:11px; margin:0;">Lotes afectados: <strong>${total}</strong></p>
        <p style="font-size:11px; margin: 4px 0; color:#e74c3c;">Deuda Total Obra: <strong style="font-size:13px;">${montoFormat}</strong></p>
        <span class="etiqueta-porcentaje">VECINOS AL DÍA: ${porcAlDia}%</span>
        <div class="barra-progreso"><div class="progreso-llenado" style="width:${porcAlDia}%; background:#2ecc71;"></div></div>
        <span class="etiqueta-porcentaje">VECINOS CON DEUDA: ${porcDeuda}%</span>
        <div class="barra-progreso"><div class="progreso-llenado" style="width:${porcDeuda}%; background:#e74c3c;"></div></div>
    `;

    if (miGraficoO) miGraficoO.destroy();
    miGraficoO = new Chart(document.getElementById('graficoObra'), {
        type: 'doughnut',
        data: { datasets: [{ data: [alDia, conDeuda], backgroundColor: ['#2ecc71', '#e74c3c'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false }, cutout: '65%' }
    });
}

// 8. GENERADOR DEL LISTADO DE PREVISUALIZACIÓN (Ordenado y con enlaces interactivos)
document.getElementById('btnImprimirObra').onclick = function() {
    if (!lotesObraActual || lotesObraActual.length === 0) return;

    let HTMLFilasObra = "";
    let sumaTotal = 0;

    const lotesOrdenados = [...lotesObraActual].sort((a, b) => {
        const deudaA = limpiarMontoGenerico(buscarProp(a.properties, "Deuda Obra"));
        const deudaB = limpiarMontoGenerico(buscarProp(b.properties, "Deuda Obra"));
        return deudaB - deudaA;
    });

    lotesOrdenados.forEach(f => {
        const p = f.properties;
        const padronVal = buscarProp(p, "Padron") || buscarProp(p, "Contribuyente") || "-";
        const nombre = buscarProp(p, "Tit. Nombre") || "-";
        const domicilio = buscarProp(p, "Ubicacion") || "-";
        const cuotasAtr = parseInt(buscarProp(p, "Cuotas Atrasadas")) || 0;
        const deuda = limpiarMontoGenerico(buscarProp(p, "Deuda Obra"));
        
        sumaTotal += deuda;
        
        const deudaTxt = deuda > 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(deuda) : "$ 0,00";
        const estiloFila = deuda > 0 ? 'color: #e74c3c; font-weight: bold;' : '';

        HTMLFilasObra += `
            <tr>
                <td><a href="#" class="link-padron" onclick="window.opener.seleccionarLotePorPadron('${padronVal}'); return false;">${padronVal}</a></td>
                <td><strong>${nombre}</strong></td>
                <td>${domicilio}</td>
                <td style="text-align:center;">${cuotasAtr}</td>
                <td style="text-align:right; ${estiloFila}">${deudaTxt}</td>
            </tr>
        `;
    });

    const totalTxt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(sumaTotal);

    const htmlImpresion = `
    <html>
    <head>
        <title>Previsualización - ${nombreObraActual}</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; background: #f4f6f9; }
            .contenedor-a4 { background: white; max-width: 800px; margin: 0 auto; padding: 40px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-radius: 4px; }
            .encabezado { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #d35400; padding-bottom: 10px; margin-bottom: 20px; }
            h1 { color: #d35400; font-size: 20px; text-transform: uppercase; margin: 0; }
            .fecha { font-size: 12px; color: #7f8c8d; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f8f9fa; color: #2c3e50; text-transform: uppercase; font-size: 10px; }
            .total-caja { background: #fdf2e9; border: 1px solid #e67e22; padding: 15px; border-radius: 8px; text-align: right; }
            .total-texto { font-size: 14px; font-weight: bold; color: #d35400; }
            .total-numero { font-size: 18px; font-weight: bold; color: #e74c3c; margin-left: 10px; }
            
            .link-padron { color: #3498db; text-decoration: none; font-weight: bold; }
            .link-padron:hover { text-decoration: underline; color: #2980b9; }

            .btn-imprimir-flotante {
                position: fixed; top: 20px; right: 30px; padding: 12px 24px; 
                background: #d35400; color: white; border: none; cursor: pointer; 
                font-weight: bold; font-size: 13px; border-radius: 6px; 
                box-shadow: 0 4px 10px rgba(0,0,0,0.15); transition: background 0.2s;
            }
            .btn-imprimir-flotante:hover { background: #e67e22; }

            @media print {
                body { background: white; padding: 0; }
                .contenedor-a4 { box-shadow: none; padding: 0; max-width: 100%; }
                @page { margin: 1cm; size: A4 portrait; }
                .btn-imprimir-flotante { display: none !important; }
                .link-padron { color: #333 !important; pointer-events: none; }
            }
        </style>
    </head>
    <body>
        <button class="btn-imprimir-flotante" onclick="window.print()">🖨️ Confirmar e Imprimir</button>
        
        <div class="contenedor-a4">
            <div class="encabezado">
                <div>
                    <h1>Informe de Obra Pública</h1>
                    <p style="margin: 5px 0 0 0; font-weight: bold;">🚧 ${nombreObraActual}</p>
                </div>
                <div class="fecha">Fecha de emisión: ${new Date().toLocaleDateString('es-AR')}</div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Nro. Padrón</th>
                        <th>Titular / Contribuyente</th>
                        <th>Domicilio</th>
                        <th style="text-align:center;">Cuotas Atr.</th>
                        <th style="text-align:right;">Deuda Obra</th>
                    </tr>
                </thead>
                <tbody>
                    ${HTMLFilasObra}
                </tbody>
            </table>

            <div class="total-caja">
                <span class="total-texto">MONTO TOTAL ADEUDADO DE LA OBRA:</span>
                <span class="total-numero">${totalTxt}</span>
            </div>
        </div>
    </body>
    </html>
    `;

    const ventana = window.open('', '_blank');
    ventana.document.write(htmlImpresion);
    ventana.document.close();
};

cargarDatos();