// ==========================================
// 1. CONFIGURACIÓN Y MAPA BASE
// ==========================================
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

// Forzamos preferCanvas: true para rendimiento optimizado con muchos polígonos
const map = L.map('map', {
  center: [-34.268, -62.712],
  zoom: 14,
  layers: [capaCalles],
  preferCanvas: true
});

// ==========================================
// 2. ESTADO GLOBAL
// ==========================================
let datosTgi = null;
let capaTgi = null;
let miGraficoG = null;
let miGraficoC = null;
let miGraficoO = null;

let lotesObraActual = [];
let nombreObraActual = "";
let lineasLadosActuales = [];
let mostrarBaldiosExclusivos = false;
let mostrarSoloMuni = false;
let listadoLotesFiltroActual = [];
let loteSeleccionadoActual = null;

// Selección Múltiple
let modoSeleccionMultiple = false;
let lotesSeleccionadosMultiples = [];

// Formatador de Moneda ARS reutilizable
const formatterARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS'
});

// ==========================================
// 3. UI Y NAVEGACIÓN
// ==========================================
window.toggleAcordeon = function (idGrupo) {
  const el = document.getElementById(idGrupo);
  if (!el) return;
  const estaAbierto = el.classList.contains('abierto');

  document.querySelectorAll('.grupo-acordeon').forEach(g => {
    g.classList.remove('abierto');
    const icono = g.querySelector('.icono-acordeon');
    if (icono) icono.innerText = '►';
  });

  if (!estaAbierto) {
    el.classList.add('abierto');
    const icono = el.querySelector('.icono-acordeon');
    if (icono) icono.innerText = '▼';
  }
};

window.togglePanelLateral = function () {
  const panel = document.getElementById('panelLateral');
  if (panel) {
    panel.classList.toggle('abierto');
    panel.classList.toggle('oculto');
  }
};

// ==========================================
// 4. FUNCIONES UTILERÍA Y PARSERS
// ==========================================
function buscarProp(obj, texto) {
  if (!obj) return "";
  const key = Object.keys(obj).find(k => k.toLowerCase().includes(texto.toLowerCase()));
  return key ? obj[key] : "";
}

function esLoteMunicipal(propiedades) {
  const titular = String(buscarProp(propiedades, "Tit. Nombre") || "").toLowerCase();
  return titular.includes("municipalidad") || titular.includes("muni de rufino") || titular.includes("rufino municipalidad");
}

function limpiarMontoGenerico(valorTexto) {
  if (valorTexto === null || valorTexto === undefined) return 0;
  let texto = String(valorTexto).trim();
  if (texto.toLowerCase() === "null" || texto === "") return 0;
  if (!isNaN(texto) && !texto.includes(',')) return parseFloat(texto) || 0;

  texto = texto.replace('$', '').replace(/\s/g, '');
  if (texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.includes('.') && texto.indexOf('.') !== texto.lastIndexOf('.')) {
    texto = texto.replace(/\./g, '');
  }
  return parseFloat(texto) || 0;
}

function limpiarMontoDeuda(propiedades) {
  if (esLoteMunicipal(propiedades)) return 0;
  return limpiarMontoGenerico(buscarProp(propiedades, "Deuda TGI"));
}

// ==========================================
// 5. ESTILOS GEOJSON
// ==========================================
function estiloManzanaPorSeccion(feature) {
  const seccion = String(buscarProp(feature.properties, "Seccion") || "0");
  const colores = {
    '1': '#3498db',
    '2': '#2ecc71',
    '3': '#9b59b6',
    '4': '#e67e22',
    '5': '#1abc9c'
  };

  let colorSeccion = colores[seccion];
  if (!colorSeccion) {
    let hash = 0;
    for (let i = 0; i < seccion.length; i++) {
      hash = seccion.charCodeAt(i) + ((hash << 5) - hash);
    }
    colorSeccion = `hsl(${Math.abs(hash) % 360}, 60%, 80%)`;
  }

  return { color: colorSeccion, fillColor: colorSeccion, weight: 1.5, fillOpacity: 0.12, dashArray: '3' };
}

function estiloLote(f) {
  const padronVal = buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente");
  const estaSeleccionado = lotesSeleccionadosMultiples.some(l => 
    (buscarProp(l.properties, "Padron") || buscarProp(l.properties, "Contribuyente")) === padronVal
  );

  if (estaSeleccionado) {
    return { color: "#00ffff", fillColor: "#00ffff", weight: 3, fillOpacity: 0.5 };
  }

  const esMuni = esLoteMunicipal(f.properties);
  if (mostrarSoloMuni) {
    return esMuni 
      ? { color: "#1b4f72", fillColor: "#2980b9", weight: 2.5, fillOpacity: 0.85 }
      : { color: "#ccc", fillColor: "transparent", weight: 0.5, fillOpacity: 0 };
  }

  const bField = f.properties.Baldio;
  const esBaldio = bField !== null && bField !== undefined && String(bField).trim().toUpperCase() === "S";

  if (mostrarBaldiosExclusivos) {
    return esBaldio 
      ? { color: "#2ecc71", fillColor: "#2ecc71", weight: 2.5, fillOpacity: 0.8 }
      : { color: "#ccc", fillColor: "transparent", weight: 0.5, fillOpacity: 0 };
  }

  if (esMuni) {
    return { color: "#1b4f72", fillColor: "#2980b9", weight: 1.5, fillOpacity: 0.6 };
  }

  const deu = limpiarMontoDeuda(f.properties);
  const mes = parseInt(buscarProp(f.properties, "Meses Adeud.TGI")) || 0;

  if (deu <= 0) return { color: "#aaa", fillColor: "transparent", weight: 0.5, fillOpacity: 0.1 };

  const col = (mes === 1) ? '#f1c40f' : '#e74c3c';
  return { color: col, fillColor: col, weight: 1, fillOpacity: 0.6 };
}

// ==========================================
// 6. CARGA Y DESPLIEGUE EN MAPA
// ==========================================
async function cargarDatos() {
  try {
    const resM = await fetch('manzanas.geojson');
    if (resM.ok) {
      const dataM = await resM.json();
      L.geoJSON(dataM, {
        style: estiloManzanaPorSeccion,
        onEachFeature: (f, l) => {
          const sec = buscarProp(f.properties, "Seccion") || buscarProp(f.properties, "Sector");
          if (sec) { l.bindTooltip(`Sección ${sec}`, { sticky: true, opacity: 0.7 }); }
        }
      }).addTo(map);
    }
  } catch (e) {
    console.warn("Aviso: manzanas.geojson no cargado.", e);
  }

  try {
    const resT = await fetch('tgi.geojson');
    datosTgi = await resT.json();
    listadoLotesFiltroActual = datosTgi.features;
    dibujarMapa(datosTgi.features);
    inicializarDesplegableSecciones(datosTgi.features);
    inicializarDesplegableObras(datosTgi.features);
    vincularBotonesBarra();
  } catch (e) {
    console.error("Error cargando tgi.geojson:", e);
  }
}

function dibujarMapa(features) {
  if (capaTgi) map.removeLayer(capaTgi);

  capaTgi = L.geoJSON({ type: "FeatureCollection", features: features }, {
    style: estiloLote,
    onEachFeature: (f, l) => {
      l.on('click', (e) => {
        L.DomEvent.stopPropagation(e);

        if (modoSeleccionMultiple) {
          toggleSeleccionLote(f, l);
          return;
        }

        mostrarFicha(f.properties);

        const margenMapa = window.innerWidth <= 768 ? [15, 120] : [320, 50];
        map.fitBounds(l.getBounds(), {
          maxZoom: 20,
          paddingTopLeft: [50, 50],
          paddingBottomRight: margenMapa,
          animate: true
        });

        mostrarMedidasLote(l);
      });
    }
  }).addTo(map);
}

// ==========================================
// 7. CÁLCULO DE MEDIDAS DE LADOS
// ==========================================
function unificarPuntosColineales(puntos) {
  if (puntos.length <= 3) return puntos;

  const latPromedio = puntos.reduce((acc, p) => acc + p.lat, 0) / puntos.length;
  const cosLat = Math.cos((latPromedio * Math.PI) / 180);

  let pts = puntos.map(p => ({
    x: p.lng * cosLat,
    y: p.lat,
    original: p
  }));

  let huboCambios = true;
  let iteracionesMax = 5;

  while (huboCambios && pts.length > 3 && iteracionesMax > 0) {
    huboCambios = false;
    iteracionesMax--;
    const simplificados = [];
    const n = pts.length;

    for (let i = 0; i < n; i++) {
      const pPrev = pts[(i - 1 + n) % n];
      const pCurr = pts[i];
      const pNext = pts[(i + 1) % n];

      const v1 = { x: pCurr.x - pPrev.x, y: pCurr.y - pPrev.y };
      const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };

      const mag1 = Math.hypot(v1.x, v1.y);
      const mag2 = Math.hypot(v2.x, v2.y);

      if (mag1 < 1e-8 || mag2 < 1e-8) {
        huboCambios = true;
        continue;
      }

      const dot = (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2);

      if (dot > 0.98) {
        huboCambios = true;
      } else {
        simplificados.push(pCurr);
      }
    }
    if (simplificados.length >= 3) {
      pts = simplificados;
    }
  }

  return pts.map(p => p.original);
}

function mostrarMedidasLote(layer) {
  limpiarMedidasLote();
  loteSeleccionadoActual = layer;

  let latlngs = layer.getLatLngs();

  while (Array.isArray(latlngs) && latlngs.length === 1 && Array.isArray(latlngs[0])) {
    latlngs = latlngs[0];
  }

  if (!Array.isArray(latlngs) || latlngs.length < 3) return;

  const verticesLadosUnificados = unificarPuntosColineales(latlngs);

  for (let i = 0; i < verticesLadosUnificados.length; i++) {
    const p1 = verticesLadosUnificados[i];
    const p2 = verticesLadosUnificados[(i + 1) % verticesLadosUnificados.length];

    if (!p1 || !p2 || !p1.lat || !p2.lat) continue;

    const distanciaMts = p1.distanceTo(p2);
    if (distanciaMts < 0.5) continue;

    const midLat = (p1.lat + p2.lat) / 2;
    const midLng = (p1.lng + p2.lng) / 2;

    const tooltipMedida = L.tooltip({
      permanent: true,
      direction: 'center',
      className: 'etiqueta-medida-lote'
    })
    .setContent(`${distanciaMts.toFixed(1)}m`)
    .setLatLng([midLat, midLng]);

    map.addLayer(tooltipMedida);
    lineasLadosActuales.push(tooltipMedida);
  }
}

function limpiarMedidasLote() {
  lineasLadosActuales.forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
  lineasLadosActuales = [];
  loteSeleccionadoActual = null;
}

// ==========================================
// 8. INTERACCIONES Y SELECCIÓN MÚLTIPLE
// ==========================================
function toggleSeleccionLote(feature, layer) {
  const padronVal = buscarProp(feature.properties, "Padron") || buscarProp(feature.properties, "Contribuyente");
  const index = lotesSeleccionadosMultiples.findIndex(l => 
    (buscarProp(l.properties, "Padron") || buscarProp(l.properties, "Contribuyente")) === padronVal
  );

  if (index >= 0) {
    lotesSeleccionadosMultiples.splice(index, 1);
  } else {
    lotesSeleccionadosMultiples.push(feature);
  }

  if (capaTgi) capaTgi.resetStyle(layer);
  document.getElementById('lblCantSeleccionados').innerText = lotesSeleccionadosMultiples.length;
}

function vincularBotonesBarra() {
  const btnB = document.getElementById('btnToggleBaldios');
  const panelTotalizador = document.getElementById('totalizadorBaldios');

  btnB.onclick = function () {
    mostrarBaldiosExclusivos = !mostrarBaldiosExclusivos;
    btnB.innerHTML = mostrarBaldiosExclusivos ? "🟩 Resaltar Baldíos: PRENDIDO" : "⬜ Resaltar Baldíos: APAGADO";
    btnB.classList.toggle('activo', mostrarBaldiosExclusivos);
    panelTotalizador.style.display = mostrarBaldiosExclusivos ? "block" : "none";

    if (mostrarBaldiosExclusivos) calcularTotalBaldios();
    if (capaTgi) capaTgi.eachLayer(layer => capaTgi.resetStyle(layer));
  };

  const btnMuni = document.getElementById('btnToggleMuni');
  btnMuni.onclick = function () {
    mostrarSoloMuni = !mostrarSoloMuni;
    btnMuni.innerHTML = mostrarSoloMuni ? "🏛️ Prop. Municipalidad: ON" : "🏛️ Prop. Municipalidad: OFF";
    btnMuni.classList.toggle('activo', mostrarSoloMuni);

    if (capaTgi) capaTgi.eachLayer(layer => capaTgi.resetStyle(layer));
  };

  const btnS = document.getElementById('btnToggleSatelite');
  btnS.onclick = function () {
    const sateliteActivo = map.hasLayer(capaSatelital);
    if (sateliteActivo) {
      map.removeLayer(capaSatelital);
      map.addLayer(capaCalles);
      btnS.innerHTML = "🛰️ Satelital: APAGADO";
      btnS.classList.remove('activo');
    } else {
      map.removeLayer(capaCalles);
      map.addLayer(capaSatelital);
      btnS.innerHTML = "🛰️ Satelital: PRENDIDO";
      btnS.classList.add('activo');
    }
  };

  const btnSel = document.getElementById('btnToggleSeleccion');
  const panelSel = document.getElementById('panelSeleccionMultiple');

  btnSel.onclick = function () {
    modoSeleccionMultiple = !modoSeleccionMultiple;
    btnSel.innerHTML = modoSeleccionMultiple ? "🔲 Selección Múltiple: ON" : "🔲 Selección Múltiple: OFF";
    btnSel.classList.toggle('activo', modoSeleccionMultiple);
    panelSel.style.display = modoSeleccionMultiple ? "flex" : "none";

    if (!modoSeleccionMultiple) {
      lotesSeleccionadosMultiples = [];
      document.getElementById('lblCantSeleccionados').innerText = "0";
      if (capaTgi) capaTgi.eachLayer(l => capaTgi.resetStyle(l));
    }
  };
}

function calcularTotalBaldios() {
  if (!datosTgi || !datosTgi.features) return;
  const contador = datosTgi.features.filter(f => {
    const bField = f.properties.Baldio;
    return bField !== null && bField !== undefined && String(bField).trim().toUpperCase() === "S";
  }).length;
  document.getElementById('numBaldios').innerText = contador;
}

// ==========================================
// 9. BÚSQUEDA Y FILTROS
// ==========================================
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

  listadoLotesFiltroActual = datosTgi.features.filter(f => {
    const nom = (buscarProp(f.properties, "Tit. Nombre") || "").toLowerCase();
    const padron = String(buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente") || "").toLowerCase();
    const dom = (buscarProp(f.properties, "Ubicacion") || "").toLowerCase();
    return (nom.includes(apellido) || padron.includes(apellido)) && dom.includes(calleInput);
  });

  dibujarMapa(listadoLotesFiltroActual);

  // Sugerencias Calles
  if (calleInput.length >= 2) {
    const callesLimpias = datosTgi.features.map(f => String(buscarProp(f.properties, "Ubicacion") || "").trim());
    const sugerenciasUnicas = [...new Set(callesLimpias)].filter(c => c.toLowerCase().includes(calleInput)).sort().slice(0, 8);
    const htmlC = sugerenciasUnicas.map(c => 
      `<div class="item-sugerencia" onclick="seleccionarCalle('${c.replace(/'/g, "\\'")}')">🛣️ ${c}</div>`
    ).join('');
    sugCalle.innerHTML = htmlC;
    sugCalle.style.display = htmlC ? "block" : "none";
  } else {
    sugCalle.style.display = "none";
  }

  // Sugerencias Nombres / Padrones
  if (apellido.length >= 2) {
    const htmlA = listadoLotesFiltroActual.slice(0, 10).map(f => {
      const n = buscarProp(f.properties, "Tit. Nombre") || "Sin Nombre";
      const p = buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente") || "-";
      const d = buscarProp(f.properties, "Ubicacion") || "Ubicación no especificada";

      return `<div class="item-sugerencia" onclick="seleccionarLotePorPadron('${p}')">
                <strong>👤 ${n}</strong><br>
                <span style="font-size: 10px; color: #7f8c8d;">🆔 Padrón: ${p} | 📍 ${d}</span>
              </div>`;
    }).join('');
    sugApp.innerHTML = htmlA;
    sugApp.style.display = htmlA ? "block" : "none";
  } else {
    sugApp.style.display = "none";
  }
}

document.getElementById('inputApellido').oninput = filtrarTodo;
document.getElementById('inputCalle').oninput = filtrarTodo;

window.seleccionarCalle = function (nombreCalleLimpia) {
  limpiarMedidasLote();
  ocultarContenedorGraficoGeneral();
  document.getElementById('inputCalle').value = nombreCalleLimpia;
  document.getElementById('listaSugerenciasCalle').style.display = "none";

  listadoLotesFiltroActual = datosTgi.features.filter(f => 
    (buscarProp(f.properties, "Ubicacion") || "").toLowerCase().includes(nombreCalleLimpia.toLowerCase())
  );
  dibujarMapa(listadoLotesFiltroActual);

  if (capaTgi.getLayers().length > 0) map.fitBounds(capaTgi.getBounds(), { padding: [30, 30] });

  window.toggleAcordeon('grupoCalle');
  generarEstadisticaCalle(listadoLotesFiltroActual, nombreCalleLimpia);
};

window.seleccionarLotePorPadron = function (padronVal) {
  const lote = datosTgi.features.find(f => 
    String(buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente")) === String(padronVal)
  );

  if (lote) {
    document.getElementById('listaSugerencias').style.display = "none";
    mostrarFicha(lote.properties);
    capaTgi.eachLayer(l => {
      if (String(buscarProp(l.feature.properties, "Padron") || buscarProp(l.feature.properties, "Contribuyente")) === String(padronVal)) {
        l.bringToFront();
        l.fire('click');
      }
    });
  }
};

// ==========================================
// 10. FICHA TÉCNICA FLOTANTE
// ==========================================
function mostrarFicha(p) {
  const panelFlotante = document.getElementById('panelFichaFlotante');
  const cuerpoFlotante = document.getElementById('cuerpoFichaContenido');

  const esMuni = esLoteMunicipal(p);
  const d = limpiarMontoDeuda(p);
  const m = parseInt(buscarProp(p, "Meses Adeud.TGI")) || 0;
  const padronDetectado = buscarProp(p, "Padron") || buscarProp(p, "Contribuyente") || "-";
  const domicilioDetectado = buscarProp(p, "Ubicacion") || "-";

  const est = esMuni 
    ? '<span style="color:#2980b9; font-weight:bold;">EXENTO</span>' 
    : ((d > 0) ? (m === 1 ? '<span class="vencer">A VENCER</span>' : '<span class="deuda">DEUDA</span>') : 'AL DÍA');

  let html = `<p><span class="etiqueta">Estado TGI:</span> <span class="valor">${est}</span></p>
              <p><span class="etiqueta">Nro. Padrón:</span> <span class="valor" style="font-weight:bold; color:#2c3e50;">${padronDetectado}</span></p>
              <p><span class="etiqueta">Domicilio:</span> <span class="valor">${domicilioDetectado}</span></p>
              <hr style="border:0; border-top:1px dashed #eee; margin:10px 0;">`;

  for (let k in p) {
    const clavePrevia = k.toLowerCase();
    if (clavePrevia !== "baldio" && clavePrevia !== "nomenc" && clavePrevia !== "referencia") {
      let valorMostrar = p[k];
      if (clavePrevia === "deuda tgi" || clavePrevia === "deuda obra") {
        valorMostrar = esMuni ? "Exento" : formatterARS.format(limpiarMontoGenerico(valorMostrar));
      }
      html += `<p><span class="etiqueta">${k}:</span> <span class="valor">${valorMostrar || '-'}</span></p>`;
    }
  }

  panelFlotante.style.display = "flex";
  cuerpoFlotante.innerHTML = html;
}

window.cerrarFicha = () => {
  document.getElementById('panelFichaFlotante').style.display = "none";
  limpiarMedidasLote();
};

// ==========================================
// 11. DESPLEGABLES (SECCIONES Y OBRAS)
// ==========================================
function inicializarDesplegableSecciones(features) {
  const select = document.getElementById('selectSeccion');
  const seccionesUnicas = [...new Set(features.map(f => String(buscarProp(f.properties, "Seccion") || "").trim()))].filter(s => s !== "").sort();

  select.innerHTML = '<option value="">🧱 Seleccionar Sección...</option>';
  seccionesUnicas.forEach(s => {
    const option = document.createElement('option');
    option.value = s;
    option.textContent = `Sección ${s}`;
    select.appendChild(option);
  });
}

document.getElementById('selectSeccion').onchange = function () {
  const numSeccion = this.value;
  limpiarMedidasLote();

  if (!numSeccion) {
    listadoLotesFiltroActual = datosTgi.features;
    dibujarMapa(datosTgi.features);
    return;
  }

  listadoLotesFiltroActual = datosTgi.features.filter(f => String(buscarProp(f.properties, "Seccion") || "").trim() === numSeccion);
  dibujarMapa(listadoLotesFiltroActual);
  if (capaTgi.getLayers().length > 0) map.fitBounds(capaTgi.getBounds(), { padding: [40, 40] });
};

function inicializarDesplegableObras(features) {
  const select = document.getElementById('selectObra');
  const obrasUnicas = [...new Set(features.map(f => String(buscarProp(f.properties, "Obras") || "").trim()))].filter(o => o !== "" && o.toLowerCase() !== "null").sort();

  select.innerHTML = '<option value="">🚧 Seleccionar Obra...</option>';
  obrasUnicas.forEach(o => {
    const option = document.createElement('option');
    option.value = o;
    option.textContent = o;
    select.appendChild(option);
  });
}

document.getElementById('selectObra').onchange = function () {
  nombreObraActual = this.value;
  limpiarMedidasLote();

  if (!nombreObraActual) {
    document.getElementById('panelEstadisticaObra').style.display = "none";
    listadoLotesFiltroActual = datosTgi.features;
    dibujarMapa(datosTgi.features);
    return;
  }

  lotesObraActual = datosTgi.features.filter(f => String(buscarProp(f.properties, "Obras") || "").trim() === nombreObraActual);
  listadoLotesFiltroActual = lotesObraActual;
  dibujarMapa(lotesObraActual);
  generarEstadisticaObra(lotesObraActual, nombreObraActual);

  if (capaTgi.getLayers().length > 0) map.fitBounds(capaTgi.getBounds(), { padding: [40, 40] });
  document.getElementById('btnImprimirObra').style.display = "block";
};

// ==========================================
// 12. ESTADÍSTICAS Y GRÁFICOS (CHART.JS)
// ==========================================
function ocultarContenedorGraficoGeneral() {
  document.getElementById('contenedorGraficoGeneral').style.display = "none";
  if (miGraficoG) { miGraficoG.destroy(); miGraficoG = null; }
}

window.solicitarGraficoGeneral = function () {
  document.getElementById('contenedorGraficoGeneral').style.display = "block";
  actualizarGraficoGeneral(listadoLotesFiltroActual);
};

function actualizarGraficoGeneral(features) {
  let s = 0, v = 0, d = 0;
  features.forEach(f => {
    const deu = limpiarMontoDeuda(f.properties);
    const mes = parseInt(buscarProp(f.properties, "Meses Adeud.TGI")) || 0;
    if (deu <= 0) s++; else if (mes === 1) v++; else d++;
  });

  if (miGraficoG) miGraficoG.destroy();

  miGraficoG = new Chart(document.getElementById('graficoBarras'), {
    type: 'doughnut',
    data: {
      labels: ['Al Día / Exento', 'A Vencer', 'Deuda'],
      datasets: [{ data: [s, v, d], backgroundColor: ['#2ecc71', '#f1c40f', '#e74c3c'], borderWidth: 1 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, cutout: '50%' }
  });
}

function generarEstadisticaCalle(features, nombre) {
  let alDia = 0, vencer = 0, deuda = 0;
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

function generarEstadisticaObra(features, textObra) {
  let alDia = 0, conDeuda = 0, sumaMontoDeudaObra = 0;

  features.forEach(f => {
    const deudaObra = limpiarMontoGenerico(buscarProp(f.properties, "Deuda Obra"));
    sumaMontoDeudaObra += deudaObra;
    const cuotasAtrasadas = parseInt(buscarProp(f.properties, "Cuotas Atrasadas")) || 0;
    if (deudaObra <= 0 && cuotasAtrasadas <= 0) alDia++; else conDeuda++;
  });

  const total = features.length;
  const montoFormat = formatterARS.format(sumaMontoDeudaObra);

  document.getElementById('panelEstadisticaObra').style.display = "block";
  document.getElementById('statsObraContenido').innerHTML = `
    <p style="font-size:10px; margin:5px 0;">🚧 <strong>${textObra}</strong></p>
    <p style="font-size:11px; margin:0;">Lotes afectados: <strong>${total}</strong></p>
    <p style="font-size:11px; margin: 4px 0; color:#e74c3c;">Deuda Total: <strong>${montoFormat}</strong></p>
  `;

  if (miGraficoO) miGraficoO.destroy();

  miGraficoO = new Chart(document.getElementById('graficoObra'), {
    type: 'doughnut',
    data: { datasets: [{ data: [alDia, conDeuda], backgroundColor: ['#2ecc71', '#e74c3c'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false }, cutout: '65%' }
  });
}

// ==========================================
// 13. IMPRESIÓN Y MODALES
// ==========================================
window.cerrarModalObra = function () {
  document.getElementById('modalPrevisualizacion').style.display = 'none';
};

window.imprimirLotesSeleccionados = function () {
  if (lotesSeleccionadosMultiples.length === 0) return alert("No has seleccionado ningún lote.");

  const htmlFilas = lotesSeleccionadosMultiples.map(f => {
    const p = f.properties;
    return `<tr>
              <td>${buscarProp(p, "Padron") || buscarProp(p, "Contribuyente") || "-"}</td>
              <td>${buscarProp(p, "Tit. Nombre") || "-"}</td>
              <td>${buscarProp(p, "Ubicacion") || "-"}</td>
            </tr>`;
  }).join('');

  document.getElementById('cuerpoTablaImpresion').innerHTML = htmlFilas;
  document.getElementById('totalizadorImpresionLotes').innerText = `Total de lotes seleccionados: ${lotesSeleccionadosMultiples.length}`;
  window.print();
};

document.getElementById('btnImprimirObra').onclick = function () {
  if (!lotesObraActual || lotesObraActual.length === 0) return;

  let sumaTotal = 0;
  const HTMLFilasObra = lotesObraActual.map(f => {
    const p = f.properties;
    const deuda = limpiarMontoGenerico(buscarProp(p, "Deuda Obra"));
    sumaTotal += deuda;

    return `<tr>
              <td>${buscarProp(p, "Padron") || buscarProp(p, "Contribuyente") || "-"}</td>
              <td><strong>${buscarProp(p, "Tit. Nombre") || "-"}</strong></td>
              <td>${buscarProp(p, "Ubicacion") || "-"}</td>
              <td style="text-align:center;">${parseInt(buscarProp(p, "Cuotas Atrasadas")) || 0}</td>
              <td style="text-align:right;">${esLoteMunicipal(p) ? "Exento" : formatterARS.format(deuda)}</td>
            </tr>`;
  }).join('');

  document.getElementById('modalTituloObra').innerHTML = `🚧 Obra: <strong>${nombreObraActual}</strong>`;
  document.getElementById('modalTablaCuerpo').innerHTML = HTMLFilasObra;
  document.getElementById('modalTotalCaja').innerText = `MONTO TOTAL: ${formatterARS.format(sumaTotal)}`;
  document.getElementById('modalPrevisualizacion').style.display = 'flex';
};

// ==========================================
// 14. INICIALIZACIÓN
// ==========================================
cargarDatos();