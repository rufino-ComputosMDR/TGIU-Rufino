const map = L.map('map').setView([-34.268, -62.712], 15);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 21,
    maxNativeZoom: 19
}).addTo(map);

// Variables Globales
let datosTgi, capaTgi, miGraficoG, miGraficoC, miGraficoO;
let lotesObraActual = []; 
let nombreObraActual = ""; 

// Arreglo global para almacenar los hilos y medidas de todos los lados dibujados
let lineasLadosActuales = [];

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

// 2. CARGA DE DATOS
async function cargarDatos() {
    try {
        console.log("Intentando cargar manzanas.geojson...");
        const resM = await fetch('manzanas.geojson');
        if (resM.ok) {
            const dataM = await resM.json();
            L.geoJSON(dataM, { 
                style: estiloManzanaPorSeccion,
                onEachFeature: (f, l) => {
                    const sec = buscarProp(f.properties, "Seccion") || buscarProp(f.properties, "Sector") || buscarProp(f.properties, "Zona");
                    if(sec) { l.bindTooltip(`Sección ${sec}`, { sticky: true, opacity: 0.7 }); }
                }
            }).addTo(map);
        }
    } catch (e) { console.warn("Error renderizando manzanas.geojson.", e); }

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
            l.on('click', (e) => { 
                L.DomEvent.stopPropagation(e); 
                mostrarFicha(f.properties); 

                // 1. Súper Zoom inmediato al polígono seleccionado
                map.fitBounds(l.getBounds(), { maxZoom: 20, padding: [50, 50], animate: true });

                // 2. Limpiamos las líneas y medidas anteriores
                limpiarMedidasLote();

                if (f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
                    const coords = f.geometry.type === 'Polygon' 
                        ? f.geometry.coordinates[0] 
                        : f.geometry.coordinates[0][0];

                    if (coords && coords.length >= 3) {
                        const centroLote = l.getBounds().getCenter();
                        let puntosLimpios = [];

                        // Paso A: Filtramos puntos duplicados consecutivos
                        for (let i = 0; i < coords.length; i++) {
                            let p = L.latLng(coords[i][1], coords[i][0]);
                            if (puntosLimpios.length === 0 || puntosLimpios[puntosLimpios.length - 1].distanceTo(p) > 0.2) {
                                puntosLimpios.push(p);
                            }
                        }
                        // Asegurar el cierre del anillo poligonal
                        if (puntosLimpios[0].distanceTo(puntosLimpios[puntosLimpios.length - 1]) > 0.2) {
                            puntosLimpios.push(puntosLimpios[0]);
                        }

                        // Paso B: Algoritmo de consolidación de tramos rectos colineales (Fusión de rectas consecutivas)
                        let ladosConsolidados = [];
                        let pInicio = puntosLimpios[0];

                        for (let i = 0; i < puntosLimpios.length - 1; i++) {
                            let pActual = puntosLimpios[i];
                            let pSiguiente = puntosLimpios[i + 1];
                            let pFuturo = puntosLimpios[i + 2] || puntosLimpios[1];

                            // Calculamos el ángulo/rumbo de las dos líneas consecutivas
                            let azimut1 = Math.atan2(pSiguiente.lng - pActual.lng, pSiguiente.lat - pActual.lat);
                            let azimut2 = Math.atan2(pFuturo.lng - pSiguiente.lng, pFuturo.lat - pSiguiente.lat);

                            // Si la diferencia de ángulo es casi cero (tolerancia de 6 grados por errores de dibujo), pertenecen a la misma recta
                            let diferenciaAngulo = Math.abs(azimut1 - azimut2);
                            if (diferenciaAngulo > Math.PI) diferenciaAngulo = (Math.PI * 2) - diferenciaAngulo;

                            const esColineal = diferenciaAngulo < 0.1; // ~6 grados de tolerancia

                            if (!esColineal) {
                                // Termina una recta real, guardamos el lado completo acumulado
                                ladosConsolidados.push({ desde: pInicio, hasta: pSiguiente });
                                pInicio = pSiguiente; // La siguiente línea arranca acá
                            }
                        }
                        // Agregar el último tramo de cierre
                        if (pInicio !== puntosLimpios[puntosLimpios.length - 1]) {
                            ladosConsolidados.push({ desde: pInicio, hasta: puntosLimpios[puntosLimpios.length - 1] });
                        }

                        // Paso C: Dibujar y rotular los lados definitivos procesados
                        ladosConsolidados.forEach(lado => {
                            const distanciaTotalLado = lado.desde.distanceTo(lado.hasta);

                            // Ignorar micro-segmentos residuales menores a 1 metro
                            if (distanciaTotalLado < 1.0) return;

                            // Texto formateado (ej: "12.4 m")
                            const textoMetros = `${distanciaTotalLado.toFixed(1)} m`;

                            // Calcular el punto medio exacto de este lado
                            const latMedio = (lado.desde.lat + lado.hasta.lat) / 2;
                            const lngMedio = (lado.desde.lng + lado.hasta.lng) / 2;
                            const puntoMedioLado = L.latLng(latMedio, lngMedio);

                            // NUEVO: Empujamos el punto de la etiqueta un 15% hacia el INTERIOR del lote
                            const factorDesplazamiento = 0.15;
                            const latTooltip = puntoMedioLado.lat + (centroLote.lat - puntoMedioLado.lat) * factorDesplazamiento;
                            const lngTooltip = puntoMedioLado.lng + (centroLote.lng - puntoMedioLado.lng) * factorDesplazamiento;
                            const posicionTooltipInterno = L.latLng(latTooltip, lngTooltip);

                            // Dibujar la línea visual resaltada sobre el mapa
                            const dibujoLado = L.polyline([lado.desde, lado.hasta], {
                                color: '#2c3e50',
                                weight: 3,
                                opacity: 0.85
                            }).addTo(map);

                            // Inyectar el Tooltip apuntando a la posición interna calculada
                            dibujoLado.bindTooltip(textoMetros, {
                                permanent: true,
                                direction: 'center',
                                className: 'tooltip-borde-lineal-perimetro'
                            }).openTooltip(posicionTooltipInterno);

                            lineasLadosActuales.push(dibujoLado);
                        });
                    }
                }
            });
        }
    }).addTo(map);
}

function limpiarMedidasLote() {
    lineasLadosActuales.forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
    lineasLadosActuales = [];
}

// 3. FILTRADOS
function filtrarTodo() {
    const apellido = document.getElementById('inputApellido').value.toLowerCase();
    const calleInput = document.getElementById('inputCalle').value.toLowerCase();
    const sugApp = document.getElementById('listaSugerencias');
    const sugCalle = document.getElementById('listaSugerenciasCalle');

    limpiarMedidasLote();

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
    limpiarMedidasLote();
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
                tooltip: { callbacks: { label: (c) => ` ${c.raw} (${total > 0 ? ((c.raw / total) * 100).toFixed(1) : 0}%)` } }
            }, 
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
                y: { grid: { display: false }, border: { display: false }, ticks: { color: '#2c3e50', font: { weight: 'bold', size: 11 } } }
            }
        },
        plugins: [{
            id: 'porcentajesAlFinalDeBarra',
            afterDatasetsDraw(chart) {
                const { ctx, data } = chart; ctx.save(); ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#2c3e50'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                chart.getDatasetMeta(0).data.forEach((bar, idx) => {
                    const val = data.datasets[0].data[idx];
                    const porc = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                    ctx.fillText(`${val} (${porc}%)`, bar.x + 8, bar.y);
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
        document.getElementById('listaSugerencias').style.display = "none";
        document.getElementById('inputApellido').value = buscarProp(lote.properties, "Tit. Nombre");
        mostrarFicha(lote.properties);
        capaTgi.eachLayer(l => {
            const idL = buscarProp(l.feature.properties, "Padron") || buscarProp(l.feature.properties, "Contribuyente");
            if (String(idL) === String(padronVal)) { l.bringToFront(); l.fire('click'); }
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
    for (let k in p) { html += `<p><span class="etiqueta">${k}:</span> <span class="valor">${p[k] || '-'}</span></p>`; }
    div.innerHTML = html; div.style.display = "block";
}

window.cerrarFicha = () => { document.getElementById('contenidoFicha').style.display = "none"; limpiarMedidasLote(); };

function inicializarDesplegableSecciones(features) {
    const select = document.getElementById('selectSeccion');
    let seccionesUnicas = [...new Set(features.map(f => String(buscarProp(f.properties, "Seccion") || "").trim()))].filter(s => s !== "").sort((a, b) => (parseInt(a) || a) - (parseInt(b) || b));
    select.innerHTML = '<option value="">🧱 Seleccionar Sección...</option>';
    seccionesUnicas.forEach(s => { const option = document.createElement('option'); option.value = s; option.textContent = `Sección ${s}`; select.appendChild(option); });
}

document.getElementById('selectSeccion').onchange = function() {
    const numSeccion = this.value;
    limpiarMedidasLote();
    document.getElementById('inputApellido').value = ""; document.getElementById('inputCalle').value = ""; document.getElementById('selectObra').value = ""; 
    document.getElementById('panelEstadisticaCalle').style.display = "none"; document.getElementById('panelEstadisticaObra').style.display = "none"; document.getElementById('btnImprimirObra').style.display = "none";
    if (!numSeccion) { dibujarMapa(datosTgi.features); actualizarGraficoGeneral(datosTgi.features); return; }
    const lotesSeccion = datosTgi.features.filter(f => String(buscarProp(f.properties, "Seccion") || "").trim() === numSeccion);
    dibujarMapa(lotesSeccion); actualizarGraficoGeneral(lotesSeccion);
    if (capaTgi.getLayers().length > 0) map.fitBounds(capaTgi.getBounds(), { padding: [40, 40] });
};

function inicializarDesplegableObras(features) {
    const select = document.getElementById('selectObra');
    let obrasUnicas = [...new Set(features.map(f => String(buscarProp(f.properties, "Obras") || "").trim()))].filter(o => o !== "" && o.toLowerCase() !== "null").sort();
    select.innerHTML = '<option value="">🚧 Seleccionar Obra...</option>';
    obrasUnicas.forEach(o => { const option = document.createElement('option'); option.value = o; option.textContent = o; select.appendChild(option); });
}

document.getElementById('selectObra').onchange = function() {
    nombreObraActual = this.value; 
    limpiarMedidasLote();
    document.getElementById('inputApellido').value = ""; document.getElementById('inputCalle').value = ""; document.getElementById('selectSeccion').value = "";
    document.getElementById('panelEstadisticaCalle').style.display = "none";
    if (!nombreObraActual) {
        document.getElementById('panelEstadisticaObra').style.display = "none"; document.getElementById('btnImprimirObra').style.display = "none"; 
        dibujarMapa(datosTgi.features); actualizarGraficoGeneral(datosTgi.features); return;
    }
    lotesObraActual = datosTgi.features.filter(f => String(buscarProp(f.properties, "Obras") || "").trim() === nombreObraActual); 
    dibujarMapa(lotesObraActual); actualizarGraficoGeneral(lotesObraActual); generarEstadisticaObra(lotesObraActual, nombreObraActual);
    if (capaTgi.getLayers().length > 0) map.fitBounds(capaTgi.getBounds(), { padding: [40, 40] });
    document.getElementById('btnImprimirObra').style.display = "block"; 
};

function generarEstadisticaObra(features, nombre) {
    let alDia = 0, conDeuda = 0, sumaMontoDeudaObra = 0;
    features.forEach(f => {
        const deudaObra = limpiarMontoGenerico(buscarProp(f.properties, "Deuda Obra")); sumaMontoDeudaObra += deudaObra;
        const cuotasAtrasadas = parseInt(buscarProp(f.properties, "Cuotas Atrasadas")) || 0;
        if (deudaObra <= 0 && cuotasAtrasadas <= 0) alDia++; else conDeuda++;
    });
    const total = features.length;
    const porcDeuda = total > 0 ? ((conDeuda / total) * 100).toFixed(1) : 0;
    const porcAlDia = total > 0 ? ((alDia / total) * 100).toFixed(1) : 0;
    const montoFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(sumaMontoDeudaObra);

    document.getElementById('panelEstadisticaObra').style.display = "block";
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
        type: 'doughnut', data: { datasets: [{ data: [alDia, conDeuda], backgroundColor: ['#2ecc71', '#e74c3c'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false }, cutout: '65%' }
    });
}

// 8. LISTADO DE PREVISUALIZACIÓN DE IMPRESIÓN
document.getElementById('btnImprimirObra').onclick = function() {
    if (!lotesObraActual || lotesObraActual.length === 0) return;
    let HTMLFilasObra = "", sumaTotal = 0;
    const lotesOrdenados = [...lotesObraActual].sort((a, b) => limpiarMontoGenerico(buscarProp(b.properties, "Deuda Obra")) - limpiarMontoGenerico(buscarProp(a.properties, "Deuda Obra")));

    lotesOrdenados.forEach(f => {
        const p = f.properties;
        const padronVal = buscarProp(p, "Padron") || buscarProp(p, "Contribuyente") || "-";
        const nombre = buscarProp(p, "Tit. Nombre") || "-";
        const domicilio = buscarProp(p, "Ubicacion") || "-";
        const cuotasAtr = parseInt(buscarProp(p, "Cuotas Atrasadas")) || 0;
        const deuda = limpiarMontoGenerico(buscarProp(p, "Deuda Obra"));
        sumaTotal += deuda;
        HTMLFilasObra += `<tr><td><a href="#" class=\"link-padron\" onclick=\"window.opener.seleccionarLotePorPadron('${padronVal}'); return false;\">${padronVal}</a></td><td><strong>${nombre}</strong></td><td>${domicilio}</td><td style=\"text-align:center;\">${cuotasAtr}</td><td style=\"text-align:right; ${deuda > 0 ? 'color: #e74c3c; font-weight: bold;' : ''}\">${deuda > 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(deuda) : "$ 0,00"}</td></tr>`;
    });

    const htmlImpresion = `<html><head><title>Previsualización</title><style>body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; background: #f4f6f9; } .contenedor-a4 { background: white; max-width: 800px; margin: 0 auto; padding: 40px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); } table { width: 100%; border-collapse: collapse; font-size: 11px; } th, td { border: 1px solid #ddd; padding: 8px; } th { background: #f8f9fa; } .total-caja { background: #fdf2e9; border: 1px solid #e67e22; padding: 15px; text-align: right; font-weight: bold; } .btn-imprimir-flotante { position: fixed; top: 20px; right: 30px; padding: 12px 24px; background: #d35400; color: white; border: none; cursor: pointer; font-weight: bold; border-radius: 6px; } @media print { .btn-imprimir-flotante { display: none !important; } }</style></head><body><button class=\"btn-imprimir-flotante\" onclick=\"window.print()\">🖨️ Confirmar e Imprimir</button><div class=\"contenedor-a4\"><h2>Informe de Obra Pública</h2><p>🚧 <strong>${nombreObraActual}</strong></p><table><thead><tr><th>Nro. Padrón</th><th>Titular</th><th>Domicilio</th><th style=\"text-align:center;\">Cuotas Atr.</th><th style=\"text-align:right;\">Deuda Obra</th></tr></thead><tbody>${HTMLFilasObra}</tbody></table><div class=\"total-caja\">MONTO TOTAL ADEUDADO: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(sumaTotal)}</div></div></body></html>`;
    const ventana = window.open('', '_blank'); ventana.document.write(htmlImpresion); ventana.document.close();
};

cargarDatos();