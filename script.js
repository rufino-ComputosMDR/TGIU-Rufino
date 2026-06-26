// 1. DEFINICIÓN DE CAPAS MAPA BASE
const capaCalles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: '© CartoDB'
});

const capaSatelital = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 21,
    maxNativeZoom: 20,
    attribution: '© Google Maps'
});

// 2. INICIALIZACIÓN DEL MAPA
const map = L.map('map', {
    center: [-34.268, -62.712],
    zoom: 14, 
    layers: [capaCalles] 
});

map.on('click', () => {
    const sObra = document.getElementById('selectObra');
    if (sObra) sObra.value = "";
    document.getElementById('panelEstadisticaObra').style.display = "none";
    document.getElementById('btnImprimirObra').style.display = "none";
    nombreObraActual = "";
    lotesObraActual = [];
});

// Variables Globales
let datosTgi, capaTgi, miGraficoG, miGraficoC, miGraficoO;
let lotesObraActual = []; 
let nombreObraActual = ""; 
let lineasLadosActuales = [];
let mostrarBaldiosExclusivos = false; 
let listadoLotesFiltroActual = [];

// VARIABLES PARA SELECCIÓN MÚLTIPLE Y LOGÍSTICA DE MAPA INTERNO
let modoSeleccionMultiple = false;
let lotesSeleccionados = []; 
let mapaImpresionClonado = null;

window.togglePanelLateral = function() {
    const panel = document.getElementById('panelLateral');
    if (panel) panel.classList.toggle('abierto');
};

function buscarProp(obj, texto) {
    for (let k in obj) { if (k.toLowerCase().includes(texto.toLowerCase())) return obj[k]; }
    return "";
}

function limpiarMontoDeuda(properties) { return limpiarMontoGenerico(buscarProp(properties, "Deuda TGI")); }

function limpiarMontoGenerico(valorTexto) {
    if (valorTexto === null || valorTexto === undefined) return 0;
    let texto = String(valorTexto).trim();
    if (texto.toLowerCase() === "null" || texto === "") return 0;
    
    if (!isNaN(texto) && !texto.includes(',')) {
        return parseFloat(texto) || 0;
    }

    texto = texto.replace('$', '').replace(/\s/g, '');

    if (texto.includes(',')) {
        texto = texto.replace(/\./g, ''); 
        texto = texto.replace(',', '.');  
    } else {
        if (texto.includes('.') && texto.indexOf('.') !== texto.lastIndexOf('.')) {
            texto = texto.replace(/\./g, '');
        }
    }
    
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
    const estaSeleccionado = lotesSeleccionados.some(item => 
        buscarProp(item.feature.properties, "Padron") === buscarProp(f.properties, "Padron")
    );
    if (estaSeleccionado) {
        return { color: "#8e44ad", fillColor: "#9b59b6", weight: 3, fillOpacity: 0.85 };
    }

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
        configurarSelectoresDinamicos(); 
        vincularBotonesBarra(); 
    } catch (e) { console.error("Error cargando tgi.geojson:", e); }
}

function configurarSelectoresDinamicos() {
    const selectS = document.getElementById('selectSeccion');
    const selectO = document.getElementById('selectObra');
    if (!selectS || !selectO) return;

    let secciones = new Set();
    let obras = new Set();

    datosTgi.features.forEach(f => {
        const s = buscarProp(f.properties, "Seccion"); if (s) secciones.add(String(s).trim());
        const o = buscarProp(f.properties, "Obra"); if (o) obras.add(String(o).trim());
    });

    let htmlS = '<option value="">-- Todas las Secciones --</option>';
    [...secciones].sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).forEach(s => { 
        htmlS += `<option value="${s}">Sección ${s}</option>`; 
    });
    selectS.innerHTML = htmlS;

    let htmlO = '<option value="">-- Sin Filtrar Obra --</option>';
    [...obras].sort().forEach(o => { 
        htmlO += `<option value="${o}">${o}</option>`; 
    });
    selectO.innerHTML = htmlO;

    selectS.onchange = filtrarPorSelectoresMenu;
    selectO.onchange = filtrarPorSelectoresMenu;
}

function filtrarPorSelectoresMenu() {
    limpiarMedidasLote();
    ocultarContenedorGraficoGeneral();

    if(document.getElementById('inputApellido')) document.getElementById('inputApellido').value = ""; 
    if(document.getElementById('inputApellidoMovil')) document.getElementById('inputApellidoMovil').value = "";
    if(document.getElementById('inputCalle')) document.getElementById('inputCalle').value = ""; 
    if(document.getElementById('inputCalleMovil')) document.getElementById('inputCalleMovil').value = "";
    if(document.getElementById('panelEstadisticaCalle')) document.getElementById('panelEstadisticaCalle').style.display = "none";

    const seccionSel = document.getElementById('selectSeccion').value;
    const obraSel = document.getElementById('selectObra').value;

    listadoLotesFiltroActual = datosTgi.features.filter(f => {
        const s = String(buscarProp(f.properties, "Seccion") || "").trim();
        const o = String(buscarProp(f.properties, "Obra") || "").trim();
        
        const cumpleS = !seccionSel || s === seccionSel;
        const cumpleO = !obraSel || o === obraSel;
        return cumpleS && cumpleO;
    });

    dibujarMapa(listadoLotesFiltroActual);
    if (listadoLotesFiltroActual.length > 0 && (seccionSel || obraSel)) {
        map.fitBounds(capaTgi.getBounds(), { padding: [20, 20] });
    }

    if (obraSel) {
        nombreObraActual = obraSel;
        lotesObraActual = listadoLotesFiltroActual;
        generarEstadisticaObra(lotesObraActual, obraSel);
        document.getElementById('btnImprimirObra').style.display = "block";
    } else {
        document.getElementById('panelEstadisticaObra').style.display = "none";
        document.getElementById('btnImprimirObra').style.display = "none";
        nombreObraActual = ""; lotesObraActual = [];
    }
}

function dibujarMapa(features) {
    if (capaTgi) map.removeLayer(capaTgi);
    capaTgi = L.geoJSON({type: "FeatureCollection", features: features}, {
        style: estiloLote,
        onEachFeature: (f, l) => {
            l.on('click', (e) => { 
                L.DomEvent.stopPropagation(e); 
                
                // CONTROL DE SELECCIÓN MÚLTIPLE DE LOTES
                if (modoSeleccionMultiple) {
                    const padronActual = buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente") || "";
                    const indice = lotesSeleccionados.findIndex(item => 
                        buscarProp(item.feature.properties, "Padron") === padronActual
                    );

                    if (indice >= 0) {
                        lotesSeleccionados.splice(indice, 1);
                        l.setStyle(estiloLote(f));
                        if (l.idEtiquetaCentro) {
                            map.removeLayer(l.idEtiquetaCentro);
                            l.idEtiquetaCentro = null;
                        }
                    } else {
                        lotesSeleccionados.push({ feature: f, layer: l });
                        l.setStyle({ color: "#8e44ad", fillColor: "#9b59b6", weight: 3, fillOpacity: 0.85 });
                        
                        // INYECCIÓN DEL NÚMERO DE CONTRIBUYENTE EN EL CENTRO
                        if (padronActual) {
                            const centroLote = l.getBounds().getCenter();
                            const etiquetaCentro = L.circleMarker(centroLote, { radius: 0, opacity: 0, fillOpacity: 0 }).addTo(map);
                            etiquetaCentro.bindTooltip(String(padronActual), {
                                permanent: true, direction: 'center', className: 'etiqueta-contribuyente-centro'
                            }).openTooltip();
                            l.idEtiquetaCentro = etiquetaCentro;
                        }
                    }

                    const btnImpSel = document.getElementById('btnImprimirSeleccionados');
                    if (btnImpSel) {
                        if (lotesSeleccionados.length > 0) {
                            btnImpSel.style.display = "block";
                            btnImpSel.innerText = `🖨️ Imprimir Selección (${lotesSeleccionados.length})`;
                        } else {
                            btnImpSel.style.display = "none";
                        }
                    }
                    return; 
                }

                const sObra = document.getElementById('selectObra');
                if (sObra) sObra.value = "";
                if(document.getElementById('panelEstadisticaObra')) document.getElementById('panelEstadisticaObra').style.display = "none";
                if(document.getElementById('btnImprimirObra')) document.getElementById('btnImprimirObra').style.display = "none";

                mostrarFicha(f.properties); 

                const margenMapa = window.innerWidth <= 768 ? [15, 120] : [50, 50];
                map.fitBounds(l.getBounds(), { maxZoom: 20, paddingBottomRight: margenMapa, paddingTopLeft: [20, 20], animate: true });
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
    const numB = document.getElementById('numBaldios');
    if(numB) numB.innerText = contador;
}

function vincularBotonesBarra() {
    const btnB = document.getElementById('btnToggleBaldios');
    const panelTotalizador = document.getElementById('totalizadorBaldios');
    
    if (btnB) {
        btnB.onclick = function() {
            mostrarBaldiosExclusivos = !mostrarBaldiosExclusivos;
            if (mostrarBaldiosExclusivos) {
                btnB.innerHTML = "🟩 Baldíos: ON";
                btnB.classList.add('activo');
                calcularTotalBaldios();
                if(panelTotalizador) panelTotalizador.style.display = "block";
            } else {
                btnB.innerHTML = "⬜ Baldíos: OFF";
                btnB.classList.remove('activo');
                if(panelTotalizador) panelTotalizador.style.display = "none";
            }
            if (capaTgi) { capaTgi.eachLayer(layer => { capaTgi.resetStyle(layer); }); }
        };
    }

    const btnS = document.getElementById('btnToggleSatelite');
    if (btnS) {
        btnS.onclick = function() {
            if (map.hasLayer(capaCalles)) {
                map.removeLayer(capaCalles);
                map.addLayer(capaSatelital);
                btnS.innerHTML = "🛰️ Satelital: ON";
                btnS.classList.add('activo');
            } else {
                map.removeLayer(capaSatelital);
                map.addLayer(capaCalles);
                btnS.innerHTML = "🛰️ Satelital: OFF";
                btnS.classList.remove('activo');
            }
        };
    }

    const btnModoSel = document.getElementById('btnModoSeleccion');
    if (btnModoSel) {
        btnModoSel.onclick = function() {
            modoSeleccionMultiple = !modoSeleccionMultiple;
            if (modoSeleccionMultiple) {
                btnModoSel.innerHTML = "🔮 Modo Múltiple: ACTIVO";
                btnModoSel.style.backgroundColor = "#e67e22";
                btnModoSel.style.color = "white";
            } else {
                btnModoSel.innerHTML = "Selección Múltiple: OFF";
                btnModoSel.style.backgroundColor = "";
                btnModoSel.style.color = "";
                
                if (capaTgi) {
                    capaTgi.eachLayer(layer => {
                        if (layer.idEtiquetaCentro) {
                            map.removeLayer(layer.idEtiquetaCentro);
                            layer.idEtiquetaCentro = null;
                        }
                    });
                }
                lotesSeleccionados = [];
                const btnImpSel = document.getElementById('btnImprimirSeleccionados');
                if(btnImpSel) btnImpSel.style.display = "none";
                if (capaTgi) { capaTgi.eachLayer(layer => { capaTgi.resetStyle(layer); }); }
            }
        };
    }

    const btnImpSel = document.getElementById('btnImprimirSeleccionados');
    if (btnImpSel) btnImpSel.onclick = abrirModalImpresionMultiple;

    const btnImp = document.getElementById('btnImprimirObra');
    if (btnImp) btnImp.onclick = abrirModalObra;
}

function abrirModalImpresionMultiple() {
    let HTMLFilas = "";
    let totalDeudaTgi = 0;
    let totalDeudaObra = 0;
    
    let contenedorModal = document.getElementById('modalImprimible');
    let divMapa = document.getElementById('mapaClonadoImpresion');
    
    if (contenedorModal && !divMapa) {
        divMapa = document.createElement('div');
        divMapa.id = 'mapaClonadoImpresion';
        divMapa.style.width = '100%';
        divMapa.style.height = '400px';
        divMapa.style.marginBottom = '20px';
        divMapa.style.borderRadius = '8px';
        divMapa.style.border = '1px solid #ccc';
        contenedorModal.insertBefore(divMapa, contenedorModal.firstChild);
    }

    lotesSeleccionados.forEach(item => {
        const p = item.feature.properties;
        const padronVal = buscarProp(p, "Padron") || buscarProp(p, "Contribuyente") || "-";
        const nombre = buscarProp(p, "Tit. Nombre") || "-";
        const domicilio = buscarProp(p, "Ubicacion") || "-";
        const deuTgi = limpiarMontoDeuda(p);
        const deuObra = limpiarMontoGenerico(buscarProp(p, "Deuda Obra"));
        
        totalDeudaTgi += deuTgi;
        totalDeudaObra += deuObra;
        
        // MODIFICADO: Solo genera celdas para Padrón, Nombre y Dirección
        HTMLFilas += `<tr>
            <td><strong>${padronVal}</strong></td>
            <td>${nombre}</td>
            <td>${domicilio}</td>
        </tr>`;
    });

    // MODIFICADO: Ajusta los encabezados de la tabla a solo Contribuyente, Nombre y Dirección
    const elEncabezadoTabla = document.getElementById('modalTablaEncabezado');
    if (elEncabezadoTabla) {
        elEncabezadoTabla.innerHTML = `
            <tr style="background: #f8f9fa;">
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Contribuyente (Padrón)</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Nombre</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Dirección</th>
            </tr>
        `;
    }

    const elTitulo = document.getElementById('modalTituloObra');
    if (elTitulo) elTitulo.innerHTML = `🖨️ Reporte Consolidado de Lotes Seleccionados`;

    const elEncabezado = document.getElementById('modalEncabezadoImpresion');
    if (elEncabezado) elEncabezado.innerHTML = `<h2>Reporte Territorial de Lotes Agrupados</h2><p>Municipalidad de Rufino — Fecha de emisión: ${new Date().toLocaleDateString('es-AR')}</p>`;

    const elCuerpoTabla = document.getElementById('modalTablaCuerpo');
    if (elCuerpoTabla) elCuerpoTabla.innerHTML = HTMLFilas;
    
    const formatoContador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
    const elTotalCaja = document.getElementById('modalTotalCaja');
    if (elTotalCaja) {
        elTotalCaja.innerHTML = `
            <strong>Resumen Acumulado de Selección:</strong><br>
            • Total Deuda TGI Sincronizada: ${formatoContador.format(totalDeudaTgi)}<br>
            • Total Deuda Obra Pública: ${formatoContador.format(totalDeudaObra)}
        `;
    }
    
    const elModalPrev = document.getElementById('modalPrevisualizacion');
    if (elModalPrev) elModalPrev.style.display = 'flex';

    // RENDERIZADO DEL MAPA CLONADO DE IMPRESIÓN (ZOOM CERCANO AJUSTADO)
    setTimeout(() => {
        if (mapaImpresionClonado) {
            mapaImpresionClonado.remove();
        }
        
        if (!document.getElementById('mapaClonadoImpresion')) return;

        mapaImpresionClonado = L.map('mapaClonadoImpresion', {
            zoomControl: false, attributionControl: false
        });

        const capaBaseClon = map.hasLayer(capaSatelital) 
            ? L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}') 
            : L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png');
        
        capaBaseClon.addTo(mapaImpresionClonado);

        // Capa general urbana de fondo
        if (datosTgi) {
            L.geoJSON(datosTgi, {
                style: { color: "#bdc3c7", fillColor: "transparent", weight: 0.8, opacity: 0.4 }
            }).addTo(mapaImpresionClonado);
        }

        const featuresSeleccionadas = lotesSeleccionados.map(item => item.feature);
        const capaAgrupadaReporte = L.geoJSON({type: "FeatureCollection", features: featuresSeleccionadas}, {
            style: function() {
                return { color: "#8e44ad", fillColor: "#9b59b6", weight: 3, fillOpacity: 0.75 };
            },
            onEachFeature: (f, l) => {
                const padron = buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente");
                if (padron) {
                    l.bindTooltip(String(padron), {
                        permanent: true, direction: 'center', className: 'etiqueta-contribuyente-centro-impresion'
                    });
                }
            }
        }).addTo(mapaImpresionClonado);

        if (featuresSeleccionadas.length > 0) {
            mapaImpresionClonado.fitBounds(capaAgrupadaReporte.getBounds(), { padding: [35, 35] });
        }
    }, 250);
}

function abrirModalObra() {
    let HTMLFilasObra = "";
    let sumaTotal = 0;

    const divMapa = document.getElementById('mapaClonadoImpresion');
    if (divMapa) divMapa.remove();

    // MODIFICADO: Asegura el re-establecimiento de las cabeceras estándar para cuando se imprime Obras
    const elEncabezadoTabla = document.getElementById('modalTablaEncabezado');
    if (elEncabezadoTabla) {
        elEncabezadoTabla.innerHTML = `
            <tr style="background: #f8f9fa;">
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Nro. Padrón</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Titular</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Domicilio</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Info Cuotas</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Deuda TGI / Obra</th>
            </tr>
        `;
    }

    lotesObraActual.forEach(f => {
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

    const elTitulo = document.getElementById('modalTituloObra');
    if (elTitulo) elTitulo.innerHTML = `🚧 Informe: <strong>${nombreObraActual}</strong>`;
    
    const elCuerpoTabla = document.getElementById('modalTablaCuerpo');
    if (elCuerpoTabla) elCuerpoTabla.innerHTML = HTMLFilasObra;
    
    const elTotalCaja = document.getElementById('modalTotalCaja');
    if (elTotalCaja) elTotalCaja.innerHTML = `Monto Global Adeudado: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(sumaTotal)}`;
    
    const elModalPrev = document.getElementById('modalPrevisualizacion');
    if (elModalPrev) elModalPrev.style.display = 'flex';
}

function limpiarMedidasLote() {
    lineasLadosActuales.forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
    lineasLadosActuales = [];
}

function filtrarTodo(e) {
    const esMovil = window.innerWidth <= 768;
    
    if (e && e.target) {
        if (e.target.id === "inputApellido" && document.getElementById("inputApellidoMovil")) document.getElementById("inputApellidoMovil").value = e.target.value;
        if (e.target.id === "inputApellidoMovil" && document.getElementById("inputApellido")) document.getElementById("inputApellido").value = e.target.value;
        if (e.target.id === "inputCalle" && document.getElementById("inputCalleMovil")) document.getElementById("inputCalleMovil").value = e.target.value;
        if (e.target.id === "inputCalleMovil" && document.getElementById("inputCalle")) document.getElementById("inputCalle").value = e.target.value;
    }

    const apellido = document.getElementById(esMovil ? 'inputApellidoMovil' : 'inputApellido').value.toLowerCase();
    const calleInput = document.getElementById(esMovil ? 'inputCalleMovil' : 'inputCalle').value.toLowerCase();
    
    const sugApp = document.getElementById(esMovil ? 'listaSugerenciasMovil' : 'listaSugerencias');
    const sugCalle = document.getElementById(esMovil ? 'listaSugerenciasCalleMovil' : 'listaSugerenciasCalle');
    
    const sugD1 = document.getElementById(esMovil ? 'listaSugerencias' : 'listaSugerenciasMovil'); if (sugD1) sugD1.style.display = "none";
    const sugD2 = document.getElementById(esMovil ? 'listaSugerenciasCalle' : 'listaSugerenciasCalleMovil'); if (sugD2) sugD2.style.display = "none";

    limpiarMedidasLote();
    ocultarContenedorGraficoGeneral();
    
    const sSeccion = document.getElementById('selectSeccion'); if (sSeccion) sSeccion.value = "";
    const sObra = document.getElementById('selectObra'); if (sObra) sObra.value = "";
    
    if(document.getElementById('panelEstadisticaObra')) document.getElementById('panelEstadisticaObra').style.display = "none";
    if(document.getElementById('btnImprimirObra')) document.getElementById('btnImprimirObra').style.display = "none"; 

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
        if(sugCalle) { sugCalle.innerHTML = htmlC; sugCalle.style.display = htmlC ? "block" : "none"; }
    } else { 
        if(sugCalle) sugCalle.style.display = "none";
        if(document.getElementById('panelEstadisticaCalle')) document.getElementById('panelEstadisticaCalle').style.display = "none";
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
        if(sugApp) { sugApp.innerHTML = html; sugApp.style.display = html ? "block" : "none"; }
    } else { if(sugApp) sugApp.style.display = "none"; }
}

if (document.getElementById('inputApellido')) document.getElementById('inputApellido').oninput = filtrarTodo;
if (document.getElementById('inputCalle')) document.getElementById('inputCalle').oninput = filtrarTodo;
if (document.getElementById('inputApellidoMovil')) document.getElementById('inputApellidoMovil').oninput = filtrarTodo;
if (document.getElementById('inputCalleMovil')) document.getElementById('inputCalleMovil').oninput = filtrarTodo;

window.seleccionarCalle = function(nombreCalleLimpia) {
    limpiarMedidasLote();
    ocultarContenedorGraficoGeneral();
    
    if(document.getElementById('inputCalle')) document.getElementById('inputCalle').value = nombreCalleLimpia;
    if(document.getElementById('inputCalleMovil')) document.getElementById('inputCalleMovil').value = nombreCalleLimpia;
    
    if(document.getElementById('listaSugerenciasCalle')) document.getElementById('listaSugerenciasCalle').style.display = "none";
    if(document.getElementById('listaSugerenciasCalleMovil')) document.getElementById('listaSugerenciasCalleMovil').style.display = "none";
    
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

function ocultarContenedorGraficoGeneral() {
    const cont = document.getElementById('contenedorGraficoGeneral');
    if (cont) cont.style.display = "none";
    if (miGraficoG) { miGraficoG.destroy(); miGraficoG = null; }
}

// MODIFICADO: Alterna la visibilidad del contenedor flotante sobre el mapa
window.solicitarGraficoGeneral = function() {
    const contenedor = document.getElementById('contenedorGraficoGeneral');
    if (contenedor) {
        if (contenedor.style.display === "block") {
            ocultarContenedorGraficoGeneral();
        } else {
            contenedor.style.display = "block";
            actualizarGraficoGeneral(listadoLotesFiltroActual);
        }
    }
};

function actualizarGraficoGeneral(features) {
    let s=0, v=0, d=0;
    features.forEach(f => {
        const deu = limpiarMontoDeuda(f.properties);
        const mes = parseInt(buscarProp(f.properties, "Meses Adeud.TGI")) || 0;
        if (deu <= 0) s++; else if (mes === 1) v++; else d++;
    });
    const total = s + v + d;

    const canvasG = document.getElementById('graficoBarras');
    if (!canvasG) return;

    if (miGraficoG) miGraficoG.destroy();
    miGraficoG = new Chart(canvasG, {
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
            responsive: true, maintainAspectRatio: false, 
            plugins: { 
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 8, font: { size: 9 }, color: '#2c3e50',
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map(function(label, i) {
                                    const val = data.datasets[0].data[i];
                                    const porc = total > 0 ? ((val / total) * 100).toFixed(0) : 0;
                                    return {
                                        text: `${label}: ${val} (${porc}%)`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        strokeStyle: data.datasets[0].backgroundColor[i],
                                        lineWidth: 0, hidden: false, index: i
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
        if(document.getElementById('listaSugerencias')) document.getElementById('listaSugerencias').style.display = "none";
        if(document.getElementById('listaSugerenciasMovil')) document.getElementById('listaSugerenciasMovil').style.display = "none";
        
        const nombreTitular = buscarProp(lote.properties, "Tit. Nombre");
        if(document.getElementById('inputApellido')) document.getElementById('inputApellido').value = nombreTitular;
        if(document.getElementById('inputApellidoMovil')) document.getElementById('inputApellidoMovil').value = nombreTitular;
        
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
    
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

    for (let k in p) { 
        const clavePrevia = k.toLowerCase();
        if(clavePrevia !== "baldio" && clavePrevia !== "nomenc" && clavePrevia !== "referencia" && clavePrevia !== "deudafecha") { 
            let valorMostrar = p[k];
            
            if (clavePrevia === "deuda tgi" || clavePrevia === "deuda obra") {
                let montoNumerico = limpiarMontoGenerico(valorMostrar);
                valorMostrar = formatter.format(montoNumerico);
            }

            html += `<p><span class="etiqueta">${k}:</span> <span class="valor">${valorMostrar || '-'}</span></p>`; 
        }
    }
    
    html += `<hr style="border:0; border-top:1px dashed #eee; margin:10px 0;">
             <p style="font-size: 11px; background: #f8f9fa; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; margin-top: 15px;">
                <span class="etiqueta" style="color: #64748b;">Deudas a la Fecha:</span> 
                <span class="valor" style="font-weight: bold; color: #334155;">${deudaFechaValor}</span>
             </p>`;
    
    if(panelFlotante) panelFlotante.style.display = "flex";
    if(cuerpoFlotante) cuerpoFlotante.innerHTML = html;

    if (window.innerWidth <= 768) {
        const panelL = document.getElementById('panelLateral');
        if(panelL) panelL.classList.remove('abierto');
    }
}

window.cerrarFicha = () => { 
    if(document.getElementById('panelFichaFlotante')) document.getElementById('panelFichaFlotante').style.display = "none"; 
    limpiarMedidasLote(); 
    
    if(document.getElementById('inputApellido')) document.getElementById('inputApellido').value = "";
    if(document.getElementById('inputApellidoMovil')) document.getElementById('inputApellidoMovil').value = "";
    if(document.getElementById('inputCalle')) document.getElementById('inputCalle').value = "";
    if(document.getElementById('inputCalleMovil')) document.getElementById('inputCalleMovil').value = "";
    
    const sSeccion = document.getElementById('selectSeccion'); if (sSeccion) sSeccion.value = "";
    const sObra = document.getElementById('selectObra'); if (sObra) sObra.value = "";
    
    if(document.getElementById('panelEstadisticaCalle')) document.getElementById('panelEstadisticaCalle').style.display = "none";
    if(document.getElementById('panelEstadisticaObra')) document.getElementById('panelEstadisticaObra').style.display = "none";
    if(document.getElementById('btnImprimirObra')) document.getElementById('btnImprimirObra').style.display = "none";
    ocultarContenedorGraficoGeneral();

    if (datosTgi && datosTgi.features) {
        listadoLotesFiltroActual = datosTgi.features;
        dibujarMapa(datosTgi.features);
        map.setView([-34.268, -62.712], 14);
    }
};

function generarEstadisticaCalle(features, textCalle) {
    let alDia=0, vencer=0, deuda=0;
    features.forEach(f => {
        const deu = limpiarMontoDeuda(f.properties);
        const mes = parseInt(buscarProp(f.properties, "Meses Adeud.TGI")) || 0;
        if (deu <= 0) alDia++; else if (mes === 1) vencer++; else deuda++;
    });

    const total = features.length;
    const porcDeuda = total > 0 ? ((deuda / total) * 100).toFixed(1) : 0;
    const porcAlDia = total > 0 ? (((alDia + vencer) / total) * 100).toFixed(1) : 0;

    const panelCalle = document.getElementById('panelEstadisticaCalle');
    if (!panelCalle) return;

    panelCalle.style.display = "block";
    const statsCc = document.getElementById('statsCalleContenido');
    if(statsCc) {
        statsCc.innerHTML = `
            <p style="font-size:10px; margin:5px 0;">📍 <strong>${textCalle}</strong></p>
            <p style="font-size:11px; margin:0;">Total: <strong>${total}</strong> registros</p>
            <span class="etiqueta-porcentaje">CUMPLIMIENTO: ${porcAlDia}%</span>
            <div class="barra-progreso"><div class="progreso-llenado" style="width:${porcAlDia}%; background:#2ecc71;"></div></div>
            <span class="etiqueta-porcentaje">MOROSIDAD: ${porcDeuda}%</span>
            <div class="barra-progreso"><div class="progreso-llenado" style="width:${porcDeuda}%; background:#e74c3c;"></div></div>
        `;
    }

    if (miGraficoC) miGraficoC.destroy();
    const canC = document.getElementById('graficoCalle');
    if(canC) {
        miGraficoC = new Chart(canC, {
            type: 'doughnut',
            data: { datasets: [{ data: [alDia, vencer, deuda], backgroundColor: ['#2ecc71', '#f1c40f', '#e74c3c'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false }, cutout: '65%' }
        });
    }
}

function generarEstadisticaObra(features, textObra) {
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

    const panelO = document.getElementById('panelEstadisticaObra');
    if(panelO) panelO.style.display = "block";
    const statsOc = document.getElementById('statsObraContenido');
    if(statsOc) {
        statsOc.innerHTML = `
            <p style="font-size:10px; margin:5px 0;">🚧 <strong>${textObra}</strong></p>
            <p style="font-size:11px; margin:0;">Lotes afectados: <strong>${total}</strong></p>
            <p style="font-size:11px; margin: 4px 0; color:#e74c3c;">Deuda Total Obra: <strong style="font-size:13px;">${montoFormat}</strong></p>
            <span class="etiqueta-porcentaje">VECINOS AL DÍA: ${porcAlDia}%</span>
            <div class="barra-progreso"><div class="progreso-llenado" style="width:${porcAlDia}%; background:#2ecc71;"></div></div>
            <span class="etiqueta-porcentaje">VECINOS CON DEUDA: ${porcDeuda}%</span>
            <div class="barra-progreso"><div class="progreso-llenado" style="width:${porcDeuda}%; background:#e74c3c;"></div></div>
        `;
    }
    if (miGraficoO) miGraficoO.destroy();
    const canO = document.getElementById('graficoObra');
    if(canO) {
        miGraficoO = new Chart(canO, {
            type: 'doughnut', data: { datasets: [{ data: [alDia, conDeuda], backgroundColor: ['#2ecc71', '#e74c3c'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false }, cutout: '65%' }
        });
    }
}

window.cerrarModalObra = function() {
    const elModal = document.getElementById('modalPrevisualizacion');
    if(elModal) elModal.style.display = 'none';
    if (mapaImpresionClonado) {
        mapaImpresionClonado.remove();
        mapaImpresionClonado = null;
    }
};

window.irAlLoteDesdeModal = function(padronVal) {
    cerrarModalObra();
    window.seleccionarLotePorPadron(padronVal);
};

// 3. CARGA INICIAL DE DATOS
cargarDatos();