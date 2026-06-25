// Configuración e inicialización de Capas Base
const mapaClaro = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: '© CartoDB'
});

// CAPA MODIFICADA A VERSIÓN HÍBRIDA (Satélite + Nombres de Calles con lyrs=y)
const mapaSatelital = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 21,
    maxNativeZoom: 20,
    attribution: '© Google Maps'
});

// Inicialización del Mapa asignando la capa base clara por defecto
const map = L.map('map', {
    center: [-34.268, -62.712],
    zoom: 15,
    layers: [mapaClaro],
    zoomControl: window.innerWidth > 768 // Desactiva botones de zoom masivos en celulares
});

if (window.innerWidth <= 768) {
    L.control.zoom({ position: 'bottomright' }).addTo(map); // Los ubica abajo a la derecha de forma cómoda
}

// Función global para alternar la capa de Satélite desde la Barra Superior
window.toggleCapaSatelital = function() {
    const btn = document.getElementById('btnToggleSatelital');
    
    if (map.hasLayer(mapaClaro)) {
        map.removeLayer(mapaClaro);
        map.addLayer(mapaSatelital);
        btn.innerHTML = "🛰️ Vista Satelital: PRENDIDO";
        btn.classList.add('activo-satelital');
    } else {
        map.removeLayer(mapaSatelital);
        map.addLayer(mapaClaro);
        btn.innerHTML = "🗺️ Vista Satelital: APAGADO";
        btn.classList.remove('activo-satelital');
    }
};

// Variables Globales
let datosTgi, capaTgi, miGraficoG, miGraficoC, miGraficoO;
let lotesObraActual = []; 
let nombreObraActual = ""; 
let lineasLadosActuales = [];
let mostrarBaldiosExclusivos = false; 
let listadoLotesFiltroActual = [];

// INTERRUPTOR DEL MENÚ HAMBURGUESA LATERAL
window.togglePanelLateral = function() {
    const panel = document.getElementById('panelLateral');
    panel.classList.toggle('abierto');
};

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

function estiloLote(f) {
    const bField = f.properties.Baldio;
    const esBaldio = bField !== null && bField !== undefined && String(bField).trim().toUpperCase() === "S";
    
    if (mostrarBaldiosExclusivos) {
        if (esBaldio) {
            return { color: "#2ecc71", fillColor: "#2ecc71", weight: 2.5, fillOpacity: 0.8 };
        } else {
            return { color: "#ccc", fillColor: "transparent", weight: 0.5, fillOpacity: 0 };
        }
    }

    const deu = limpiarMontoDeuda(f.properties);
    const mes = parseInt(buscarProp(f.properties, "Meses Adeud.TGI")) || 0;
    if (deu <= 0) return { color: "#aaa", fillColor: "transparent", weight: 0.5, fillOpacity: 0.1 };
    let col = (mes === 1) ? '#f1c40f' : '#e74c3c';
    return { color: col, fillColor: col, weight: 1, fillOpacity: 0.6 };
}

function destellarLote(layer) {
    if (layer && layer._path) {
        layer._path.classList.add('lote-parpadeando');
        setTimeout(() => {
            if (layer._path) layer._path.classList.remove('lote-parpadeando');
        }, 2500);
    }
}

function ocultarSpinnerCarga() {
    const spinnerDiv = document.getElementById('pantallaCarga');
    if (spinnerDiv) {
        spinnerDiv.style.opacity = '0';
        setTimeout(() => spinnerDiv.style.display = 'none', 300);
    }
}

async function cargarDatos() {
    try {
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
        listadoLotesFiltroActual = datosTgi.features;
        dibujarMapa(datosTgi.features);
        inicializarDesplegableSecciones(datosTgi.features);
        inicializarDesplegableObras(datosTgi.features); 
        vincularBotonesDerechos(); 
        ocultarSpinnerCarga();
    } catch (e) { 
        console.error("Error cargando tgi.geojson:", e);
        ocultarSpinnerCarga();
    }
}

function dibujarMapa(features) {
    if (capaTgi) map.removeLayer(capaTgi);
    capaTgi = L.geoJSON({type: "FeatureCollection", features: features}, {
        style: estiloLote,
        onEachFeature: (f, l) => {
            l.on('click', (e) => { 
                L.DomEvent.stopPropagation(e); 
                mostrarFicha(f.properties); 

                // Si está en celular, deja más margen arriba para no tapar con los inputs flotantes
                const paddValue = window.innerWidth <= 768 ? [20, 140] : [50, 50];
                map.fitBounds(l.getBounds(), { maxZoom: 20, paddingBottomRight: paddValue, paddingTopLeft: [20, 20], animate: true });
                limpiarMedidasLote();

                if (f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
                    const coords = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];

                    if (coords && coords.length >= 3) {
                        const centroLote = l.getBounds().getCenter();
                        let puntosLimpios = [];

                        for (let i = 0; i < coords.length; i++) {
                            let p = L.latLng(coords[i][1], coords[i][0]);
                            if (puntosLimpios.length === 0 || puntosLimpios[puntosLimpios.length - 1].distanceTo(p) > 0.2) {
                                puntosLimpios.push(p);
                            }
                        }
                        if (puntosLimpios[0].distanceTo(puntosLimpios[puntosLimpios.length - 1]) > 0.2) {
                            puntosLimpios.push(puntosLimpios[0]);
                        }

                        let ladosConsolidados = [];
                        let pInicio = puntosLimpios[0];

                        for (let i = 0; i < puntosLimpios.length - 1; i++) {
                            let pActual = puntosLimpios[i];
                            let pSiguiente = puntosLimpios[i + 1];
                            let pFuturo = puntosLimpios[i + 2] || puntosLimpios[1];

                            let azimut1 = Math.atan2(pSiguiente.lng - pActual.lng, pSiguiente.lat - pActual.lat);
                            let azimut2 = Math.atan2(pFuturo.lng - pSiguiente.lng, pFuturo.lat - pSiguiente.lat);

                            let diferenciaAngulo = Math.abs(azimut1 - azimut2);
                            if (diferenciaAngulo > Math.PI) diferenciaAngulo = (Math.PI * 2) - diferenciaAngulo;

                            if (diferenciaAngulo >= 0.1) {
                                ladosConsolidados.push({ desde: pInicio, hasta: pSiguiente });
                                pInicio = pSiguiente; 
                            }
                        }
                        if (pInicio !== puntosLimpios[puntosLimpios.length - 1]) {
                            ladosConsolidados.push({ desde: pInicio, hasta: puntosLimpios[puntosLimpios.length - 1] });
                        }

                        ladosConsolidados.forEach(lado => {
                            const distanciaTotalLado = lado.desde.distanceTo(lado.hasta);
                            if (distanciaTotalLado < 1.0) return;

                            const textoMetros = `${distanciaTotalLado.toFixed(1)} m`;
                            const puntoMedioLado = L.latLng((lado.desde.lat + lado.hasta.lat) / 2, (lado.desde.lng + lado.hasta.lng) / 2);

                            const factorDesplazamiento = 0.15;
                            const posicionTooltipInterno = L.latLng(
                                puntoMedioLado.lat + (centroLote.lat - puntoMedioLado.lat) * factorDesplazamiento,
                                puntoMedioLado.lng + (centroLote.lng - puntoMedioLado.lng) * factorDesplazamiento
                            );

                            const dibujoLado = L.polyline([lado.desde, lado.hasta], { color: '#2c3e50', weight: 3, opacity: 0.85 }).addTo(map);
                            dibujoLado.bindTooltip(textoMetros, { permanent: true, direction: 'center', className: 'tooltip-borde-lineal-perimetro' }).openTooltip(posicionTooltipInterno);
                            lineasLadosActuales.push(dibujoLado);
                        });
                    }
                }
            });
        }
    }).addTo(map);
}

function calcularTotalBaldios() {
    if (!datosTgi || !datosTgi.features) return;
    const contador = datosTgi.features.filter(f => {
        const bField = f.properties.Baldio;
        return bField !== null && bField !== undefined && String(bField).trim().toUpperCase() === "S";
    }).length;
    document.getElementById('numBaldios').innerText = contador;
}

function vincularBotonesDerechos() {
    const btnB = document.getElementById('btnToggleBaldios');
    const panelTotalizador = document.getElementById('totalizadorBaldios');

    btnB.onclick = function() {
        mostrarBaldiosExclusivos = !mostrarBaldiosExclusivos;
        if (mostrarBaldiosExclusivos) {
            btnB.innerHTML = "🟩 Resaltar Baldíos: PRENDIDO";
            btnB.classList.add('activo');
            calcularTotalBaldios();
            panelTotalizador.style.display = "block";
        } else {
            btnB.innerHTML = "⬜ Resaltar Baldíos: APAGADO";
            btnB.classList.remove('activo');
            panelTotalizador.style.display = "none";
        }
        if (capaTgi) { capaTgi.eachLayer(layer => { capaTgi.resetStyle(layer); }); }
    };
}

function limpiarMedidasLote() {
    lineasLadosActuales.forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
    lineasLadosActuales = [];
}

function filtrarTodo() {
    const apellido = document.getElementById('inputApellido').value.toLowerCase();
    const calleInput = document.getElementById('inputCalle').value.toLowerCase();
    const sugApp = document.getElementById('listaSugerencias');
    const sugCalle = document.getElementById('listaSugerenciasCalle');

    limpiarMedidasLote();
    ocultarContenedorGraficoGeneral();
    document.getElementById('selectSeccion').value = "";
    document.getElementById('selectObra').value = "";
    document.getElementById('panelEstadisticaObra').style.display = "none";
    document.getElementById('btnImprimirObra').style.display = "none"; 

    listadoLotesFiltroActual = datosTgi.features.filter(f => {
        const nom = (buscarProp(f.properties, "Tit. Nombre") || "").toLowerCase();
        const padron = String(buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente") || "").toLowerCase();
        const dom = (buscarProp(f.properties, "Ubicacion") || "").toLowerCase();
        return (nom.includes(apellido) || padron.includes(apellido)) && dom.includes(calleInput);
    });

    dibujarMapa(listadoLotesFiltroActual);

    if (calleInput.length >= 2) {
        let callesLimpias = datosTgi.features.map(f => String(buscarProp(f.properties, "Ubicacion") || "").trim());
        let sugerenciasUnicas = [...new Set(callesLimpias)].filter(c => c.toLowerCase().includes(calleInput)).sort().slice(0, 8);
        let htmlC = "";
        sugerenciasUnicas.forEach(c => { htmlC += `<div class="item-sugerencia" onclick="seleccionarCalle('${c.replace(/'/g, "\\'")}')">🛣️ ${c}</div>`; });
        sugCalle.innerHTML = htmlC; sugCalle.style.display = htmlC ? "block" : "none";
    } else { 
        sugCalle.style.display = "none";
        document.getElementById('panelEstadisticaCalle').style.display = "none";
    }

    if (apellido.length >= 2) {
        let html = "";
        listadoLotesFiltroActual.slice(0, 10).forEach(f => {
            const n = buscarProp(f.properties, "Tit. Nombre") || "Sin Nombre";
            const p = buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente") || "-";
            const d = buscarProp(f.properties, "Ubicacion") || "Ubicación no especificada";
            
            html += `<div class="item-sugerencia" onclick="seleccionarLotePorPadron('${p}')">
                        <strong>👤 ${n}</strong><br>
                        <span style="font-size: 10px; color: #7f8c8d; display: block; margin-top: 2px;">
                            🆔 Padrón: ${p} | 📍 ${d}
                        </span>
                     </div>`;
        });
        sugApp.innerHTML = html; sugApp.style.display = html ? "block" : "none";
    } else { sugApp.style.display = "none"; }
}

document.getElementById('inputApellido').oninput = filtrarTodo;
document.getElementById('inputCalle').oninput = filtrarTodo;

window.seleccionarCalle = function(nombreCalleLimpia) {
    limpiarMedidasLote();
    ocultarContenedorGraficoGeneral();
    document.getElementById('inputCalle').value = nombreCalleLimpia;
    document.getElementById('listaSugerenciasCalle').style.display = "none";
    
    listadoLotesFiltroActual = datosTgi.features.filter(f => (buscarProp(f.properties, "Ubicacion") || "").toLowerCase().includes(nombreCalleLimpia.toLowerCase()));
    dibujarMapa(listadoLotesFiltroActual);
    
    capaTgi.eachLayer(l => { 
        l.bringToFront(); 
        if (l._path) l._path.classList.add('lote-calle-resaltada'); 
        destellarLote(l); 
    });
    
    if (capaTgi.getLayers().length > 0) {
        map.fitBounds(capaTgi.getBounds(), { padding: [30, 30] });
    }
    
    if (listadoLotesFiltroActual.length > 0) {
        mostrarFicha(listadoLotesFiltroActual[0].properties);
    }
    generarEstadisticaCalle(listadoLotesFiltroActual, nombreCalleLimpia);
};

window.togglePanelDerecho = function() {
    const cuerpo = document.getElementById('cuerpoD');
    const btn = document.getElementById('btnT');
    const cerrado = cuerpo.style.display === "none";
    cuerpo.style.display = cerrado ? "block" : "none";
    btn.innerText = cerrado ? "➖" : "➕";
};

function ocultarContenedorGraficoGeneral() {
    document.getElementById('contenedorGraficoGeneral').style.display = "none";
    if (miGraficoG) { miGraficoG.destroy(); miGraficoG = null; }
}

window.solicitarGraficoGeneral = function() {
    const contenedor = document.getElementById('contenedorGraficoGeneral');
    contenedor.style.display = "block";
    actualizarGraficoGeneral(listadoLotesFiltroActual);
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
        type: 'doughnut',
        data: { 
            labels: ['Al Día', 'A Vencer', 'Deuda'], 
            datasets: [{ 
                data: [s, v, d], 
                backgroundColor: ['#2ecc71', '#f1c40f', '#e74c3c'], 
                borderWidth: 1 
            }] 
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false, 
            plugins: { 
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 10,
                        font: { size: 9, weight: 'bold' },
                        color: '#2c3e50',
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map(function(label, i) {
                                    const val = data.datasets[0].data[i];
                                    const porc = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                    return {
                                        text: `${label}: ${val} (${porc}%)`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        strokeStyle: data.datasets[0].backgroundColor[i],
                                        lineWidth: 0,
                                        hidden: false,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: { enabled: true }
            },
            cutout: '50%'
        }
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
            if (String(idL) === String(padronVal)) { 
                l.bringToFront(); 
                l.fire('click'); 
                destellarLote(l); 
            }
        });
    }
};

function mostrarFicha(p) {
    const panelFlotante = document.getElementById('panelFichaFlotante');
    const cuerpoFlotante = document.getElementById('cuerpoFichaContenido');
    
    const d = limpiarMontoDeuda(p);
    const m = parseInt(buscarProp(p, "Meses Adeud.TGI")) || 0;
    const padronDetectado = buscarProp(p, "Padron") || "-";
    const domicilioDetectado = buscarProp(p, "Ubicacion") || "-";
    const deudaFechaValor = buscarProp(p, "deudafecha") || "-";
    
    let est = (d > 0) ? (m === 1 ? '<span class="vencer">A VENCER</span>' : '<span class="deuda">DEUDA</span>') : 'AL DÍA';
    
    let html = `<p><span class="etiqueta">Estado TGI:</span> <span class="valor">${est}</span></p>
                <p><span class="etiqueta">Nro. Padrón:</span> <span class="valor" style="font-weight:bold; color:#2c3e50;">${padronDetectado}</span></p>
                <p><span class="etiqueta">Domicilio:</span> <span class="valor">${domicilioDetectado}</span></p>
                <hr style="border:0; border-top:1px dashed #eee; margin:10px 0;">`;
    
    for (let k in p) { 
        const clavePrevia = k.toLowerCase();
        if(clavePrevia !== "baldio" && clavePrevia !== "nomenc" && clavePrevia !== "referencia" && clavePrevia !== "deudafecha") { 
            html += `<p><span class="etiqueta">${k}:</span> <span class="valor">${p[k] || '-'}</span></p>`; 
        }
    }
    
    html += `<hr style="border:0; border-top:1px dashed #eee; margin:10px 0;">
             <p style="font-size: 11px; background: #f8f9fa; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; margin-top: 15px;">
                <span class="etiqueta" style="color: #64748b;">Deudas a la Fecha:</span> 
                <span class="valor" style="font-weight: bold; color: #334155;">${deudaFechaValor}</span>
             </p>`;
    
    cuerpoFlotante.innerHTML = html;
    panelFlotante.style.display = "flex";
    
    // Si abre la ficha en celular, cierra automáticamente el menú hamburguesa para dar espacio
    if (window.innerWidth <= 768) {
        document.getElementById('panelLateral').classList.remove('abierto');
    }
}

window.cerrarFicha = () => { 
    document.getElementById('panelFichaFlotante').style.display = "none"; 
    limpiarMedidasLote(); 
    
    document.getElementById('inputApellido').value = "";
    document.getElementById('inputCalle').value = "";
    document.getElementById('selectSeccion').value = "";
    document.getElementById('selectObra').value = "";
    
    document.getElementById('panelEstadisticaCalle').style.display = "none";
    document.getElementById('panelEstadisticaObra').style.display = "none";
    document.getElementById('btnImprimirObra').style.display = "none";
    ocultarContenedorGraficoGeneral();

    if (datosTgi && datosTgi.features) {
        listadoLotesFiltroActual = datosTgi.features;
        dibujarMapa(datosTgi.features);
        map.setView([-34.268, -62.712], 15);
    }
};

function inicializarDesplegableSecciones(features) {
    const select = document.getElementById('selectSeccion');
    let seccionesUnicas = [...new Set(features.map(f => String(buscarProp(f.properties, "Seccion") || "").trim()))].filter(s => s !== "").sort((a, b) => (parseInt(a) || a) - (parseInt(b) || b));
    select.innerHTML = '<option value="">🧱 Seleccionar Sección...</option>';
    seccionesUnicas.forEach(s => { const option = document.createElement('option'); option.value = s; option.textContent = `Sección ${s}`; select.appendChild(option); });
}

document.getElementById('selectSeccion').onchange = function() {
    const numSeccion = this.value;
    limpiarMedidasLote();
    ocultarContenedorGraficoGeneral();
    document.getElementById('inputApellido').value = ""; document.getElementById('inputCalle').value = ""; document.getElementById('selectObra').value = ""; 
    document.getElementById('panelEstadisticaCalle').style.display = "none"; document.getElementById('panelEstadisticaObra').style.display = "none"; document.getElementById('btnImprimirObra').style.display = "none";
    if (!numSeccion) { 
        listadoLotesFiltroActual = datosTgi.features;
        dibujarMapa(datosTgi.features); return; 
    }
    listadoLotesFiltroActual = datosTgi.features.filter(f => String(buscarProp(f.properties, "Seccion") || "").trim() === numSeccion);
    dibujarMapa(listadoLotesFiltroActual);
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
    ocultarContenedorGraficoGeneral();
    document.getElementById('inputApellido').value = ""; document.getElementById('inputCalle').value = ""; document.getElementById('selectSeccion').value = "";
    document.getElementById('panelEstadisticaCalle').style.display = "none";
    if (!nombreObraActual) {
        document.getElementById('panelEstadisticaObra').style.display = "none"; document.getElementById('btnImprimirObra').style.display = "none"; 
        listadoLotesFiltroActual = datosTgi.features;
        dibujarMapa(datosTgi.features); return;
    }
    lotesObraActual = datosTgi.features.filter(f => String(buscarProp(f.properties, "Obras") || "").trim() === nombreObraActual); 
    listadoLotesFiltroActual = lotesObraActual;
    dibujarMapa(lotesObraActual); generarEstadisticaObra(lotesObraActual, nombreObraActual);
    if (capaTgi.getLayers().length > 0) map.fitBounds(capaTgi.getBounds(), { padding: [40, 40] });
    document.getElementById('btnImprimirObra').style.display = "block"; 
};

function generarEstadisticaCalle(features, nombre) {
    let alDia=0, vencer=0, deuda=0;
    features.forEach(f => {
        const deu = limpiarMontoDeuda(f.properties);
        const mes = parseInt(buscarProp(f.properties, "Meses Adeud.TGI")) || 0;
        if (deu <= 0) alDia++; else if (mes === 1) vencer++; else deuda++;
    });

    const total = features.length;
    const porcDeuda = total > 0 ? ((deuda / total) * 100).toFixed(1) : 0;
    const porcAlDia = total > 0 ? (((alDia + vencer) / total) * 100).toFixed(1) : 0;

    document.getElementById('panelEstadisticaCalle').style.display = "block";
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

window.cerrarModalObra = function() {
    document.getElementById('modalPrevisualizacion').style.display = 'none';
};

window.irAlLoteDesdeModal = function(padronVal) {
    cerrarModalObra();
    window.seleccionarLotePorPadron(padronVal);
};

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
        
        HTMLFilasObra += `<tr>
            <td><span class="link-padron-modal" onclick="irAlLoteDesdeModal('${padronVal}')">${padronVal}</span></td>
            <td><strong>${nombre}</strong></td>
            <td>${domicilio}</td>
            <td style="text-align:center;">${cuotasAtr}</td>
            <td style="text-align:right; ${deuda > 0 ? 'color: #e74c3c; font-weight: bold;' : ''}">${deuda > 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(deuda) : "$ 0,00"}</td>
        </tr>`;
    });

    document.getElementById('modalTituloObra').innerHTML = `🚧 Informe de Obra Pública: <strong>${nombreObraActual}</strong>`;
    document.getElementById('modalEncabezadoImpresion').innerHTML = `<h2>Informe de Obra Pública</h2><p>🚧 <strong>${nombreObraActual}</strong></p>`;
    document.getElementById('modalTablaCuerpo').innerHTML = HTMLFilasObra;
    document.getElementById('modalTotalCaja').innerText = `MONTO TOTAL ADEUDADO: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(sumaTotal)}`;
    
    document.getElementById('modalPrevisualizacion').style.display = 'flex';
};

// Iniciar carga de datos catastrales
cargarDatos();