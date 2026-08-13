// ==========================================
// 1. CONFIGURACIÓN Y MAPA BASE
// ==========================================
if (typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

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

const map = L.map('map', {
  center: [-34.268, -62.712],
  zoom: 14,
  layers: [capaCalles],
  preferCanvas: true
});

// ==========================================
// 2. ESTADO GLOBAL Y FORMATEADORES
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
let mostrarSinDatosExclusivos = false;
let mostrarSoloMuni = false;
let mostrarCapaTgi = true;
let listadoLotesFiltroActual = [];
let loteSeleccionadoActual = null;

// Selección Múltiple
let modoSeleccionMultiple = false;
let lotesSeleccionadosMultiples = [];

const formatterARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatearMoneda(valor) {
  const num = typeof valor === 'number' ? valor : limpiarMontoGenerico(valor);
  return formatterARS.format(num).replace('ARS', '$');
}

// ==========================================
// 3. FUNCIONES DE NORMALIZACIÓN Y AYUDA
// ==========================================
function normalizarTexto(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function decodificarTexto(texto) {
  if (!texto) return "";
  try {
    return decodeURIComponent(escape(String(texto)));
  } catch (e) {
    return String(texto);
  }
}

function escaparHTML(texto) {
  return String(texto)
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resaltarCoincidencia(texto, busqueda) {
  if (!busqueda) return texto;
  const regex = new RegExp(`(${escapeRegExp(busqueda)})`, 'gi');
  return texto.replace(regex, '<mark style="background:#f1c40f;">$1</mark>');
}

// ==========================================
// 4. UI Y NAVEGACIÓN
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
    panel.classList.toggle('oculto');
    setTimeout(() => {
      if (typeof map !== 'undefined' && map.invalidateSize) {
        map.invalidateSize();
      }
    }, 300);
  }
};

// ==========================================
// 5. UTILERÍA Y PROPIEDADES GEOJSON
// ==========================================
function buscarProp(obj, texto) {
  if (!obj) return "";
  const key = Object.keys(obj).find(k => normalizarTexto(k).includes(normalizarTexto(texto)));
  return key ? obj[key] : "";
}

function esLoteSinDatos(propiedades) {
  const padron = normalizarTexto(buscarProp(propiedades, "Padron") || buscarProp(propiedades, "Contribuyente"));
  const titular = normalizarTexto(buscarProp(propiedades, "Tit. Nombre"));
  return padron === "" && titular === "";
}

function esLoteMunicipal(propiedades) {
  const titular = normalizarTexto(buscarProp(propiedades, "Tit. Nombre"));
  return titular === "municipalidad de rufino";
}

function limpiarMontoGenerico(valorTexto) {
  if (valorTexto === null || valorTexto === undefined) return 0;
  if (typeof valorTexto === 'number') return valorTexto;

  let texto = String(valorTexto).trim();
  if (texto.toLowerCase() === "null" || texto === "") return 0;

  texto = texto.replace(/\$/g, '').replace(/\s+/g, '');

  if (texto.includes(',') && texto.includes('.')) {
    texto = texto.replace(/,/g, '');
  } else if (texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  }

  const resultado = parseFloat(texto);
  return isNaN(resultado) ? 0 : resultado;
}

function limpiarMontoDeuda(propiedades) {
  if (esLoteMunicipal(propiedades)) return 0;
  return limpiarMontoGenerico(buscarProp(propiedades, "Deuda TGI"));
}

// ==========================================
// 6. ESTILOS GEOJSON
// ==========================================
function estiloManzanaPorSeccion(feature) {
  const seccion = String(buscarProp(feature.properties, "Seccion") || "0");
  const colores = { '1': '#3498db', '2': '#2ecc71', '3': '#9b59b6', '4': '#e67e22', '5': '#1abc9c' };

  let colorSeccion = colores[seccion];
  if (!colorSeccion) {
    let hash = 0;
    for (let i = 0; i < seccion.length; i++) hash = seccion.charCodeAt(i) + ((hash << 5) - hash);
    colorSeccion = `hsl(${Math.abs(hash) % 360}, 60%, 80%)`;
  }

  return { color: colorSeccion, fillColor: colorSeccion, weight: 1.5, fillOpacity: 0.12, dashArray: '3' };
}

function estiloLote(f) {
  // 1. Si está activo el filtro exclusivo de "Sin Datos"
  if (mostrarSinDatosExclusivos) {
    const esSinD = esLoteSinDatos(f.properties);
    return esSinD
      ? { color: "#cccc00", fillColor: "#ffff00", weight: 3, fillOpacity: 0.95 }
      : { color: "#ccc", fillColor: "transparent", weight: 0.5, fillOpacity: 0 };
  }

  // 2. Si está activo el filtro exclusivo de Baldíos
  const bField = f.properties.Baldio;
  const esBaldio = bField !== null && bField !== undefined && normalizarTexto(bField) === "s";

  if (mostrarBaldiosExclusivos) {
    return esBaldio 
      ? { color: "#2ecc71", fillColor: "#2ecc71", weight: 2.5, fillOpacity: 0.8 }
      : { color: "#ccc", fillColor: "transparent", weight: 0.5, fillOpacity: 0 };
  }

  // 3. Selección manual múltiple
  const estaSeleccionado = lotesSeleccionadosMultiples.includes(f);
  if (estaSeleccionado) {
    return { color: "#ffff00", fillColor: "#ffff00", weight: 3.5, fillOpacity: 0.85 };
  }

  // 4. Filtro solo municipal
  const esMuni = esLoteMunicipal(f.properties);
  if (mostrarSoloMuni) {
    return esMuni 
      ? { color: "#1b4f72", fillColor: "#2980b9", weight: 2.5, fillOpacity: 0.85 }
      : { color: "#ccc", fillColor: "transparent", weight: 0.5, fillOpacity: 0 };
  }

  if (esMuni) {
    return { color: "#1b4f72", fillColor: "#2980b9", weight: 1.5, fillOpacity: 0.6 };
  }

  // 5. Visualización normal de obras / TGI
  if (!nombreObraActual) {
    const deu = limpiarMontoDeuda(f.properties);
    const mes = parseInt(buscarProp(f.properties, "Meses Adeud.TGI")) || 0;

    if (deu <= 0) return { color: "#aaa", fillColor: "transparent", weight: 0.5, fillOpacity: 0.1 };

    const col = (mes === 1) ? '#f1c40f' : '#e74c3c';
    return { color: col, fillColor: col, weight: 1, fillOpacity: 0.6 };
  }

  const deudaObra = limpiarMontoGenerico(buscarProp(f.properties, "Deuda Obra"));
  const cuotasAtrasadas = parseInt(buscarProp(f.properties, "Cuotas Atrasadas")) || 0;

  if (deudaObra <= 0 && cuotasAtrasadas <= 0) {
    return { color: "#2ecc71", fillColor: "#2ecc71", weight: 1.5, fillOpacity: 0.6 };
  } 

  return { color: "#e74c3c", fillColor: "#e74c3c", weight: 1.5, fillOpacity: 0.6 };
}

// ==========================================
// 7. CARGA DE DATOS Y MAPA
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

    if (datosTgi && datosTgi.features) {
      datosTgi.features.forEach(f => {
        for (let k in f.properties) {
          if (typeof f.properties[k] === 'string') {
            f.properties[k] = decodificarTexto(f.properties[k]);
          }
        }
      });
    }

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
  });

  if (mostrarCapaTgi) {
    capaTgi.addTo(map);
  }
}

// ==========================================
// 8. MEDIDAS Y DISTANCIAS
// ==========================================
function unificarPuntosColineales(puntos) {
  if (puntos.length <= 3) return puntos;

  const latPromedio = puntos.reduce((acc, p) => acc + p.lat, 0) / puntos.length;
  const cosLat = Math.cos((latPromedio * Math.PI) / 180);

  let pts = puntos.map(p => ({ x: p.lng * cosLat, y: p.lat, original: p }));
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
    if (simplificados.length >= 3) pts = simplificados;
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
// 9. CONTROLES Y EVENTOS DE BOTONES
// ==========================================
function toggleModoSinDatos() {
  mostrarSinDatosExclusivos = !mostrarSinDatosExclusivos;

  // Si activamos este modo, desactivamos el de baldíos para evitar conflicto
  if (mostrarSinDatosExclusivos) {
    mostrarBaldiosExclusivos = false;
    const btnB = document.getElementById('btnToggleBaldios');
    if (btnB) {
      btnB.innerHTML = "⬜ Resaltar Baldíos: APAGADO";
      btnB.classList.remove('activo');
    }
    const panelBaldios = document.getElementById('totalizadorBaldios');
    if (panelBaldios) panelBaldios.style.display = "none";
  }

  const btnP = document.getElementById('btnSeleccionarSinDatos');
  const btnB = document.getElementById('btnSeleccionarSinDatosBarra');
  const panelTotalizador = document.getElementById('totalizadorSinDatos');

  const textoBtn = mostrarSinDatosExclusivos ? "⚠️ Sin Datos: PRENDIDO" : "⚠️ Sin Datos: APAGADO";

  if (btnP) {
    btnP.innerHTML = textoBtn;
    btnP.classList.toggle('activo', mostrarSinDatosExclusivos);
  }
  if (btnB) {
    btnB.innerHTML = textoBtn;
    btnB.classList.toggle('activo', mostrarSinDatosExclusivos);
  }

  if (panelTotalizador) panelTotalizador.style.display = mostrarSinDatosExclusivos ? "block" : "none";

  if (mostrarSinDatosExclusivos) {
    calcularTotalSinDatos();
  }

  if (capaTgi) {
    capaTgi.eachLayer(layer => capaTgi.resetStyle(layer));
  }
}

function calcularTotalSinDatos() {
  if (!datosTgi || !datosTgi.features) return;
  const contador = datosTgi.features.filter(f => esLoteSinDatos(f.properties)).length;
  const numS = document.getElementById('numSinDatos');
  if (numS) numS.innerText = contador;
}

function toggleSeleccionLote(feature, layer) {
  const index = lotesSeleccionadosMultiples.indexOf(feature);

  if (index >= 0) {
    lotesSeleccionadosMultiples.splice(index, 1);
  } else {
    lotesSeleccionadosMultiples.push(feature);
  }

  if (capaTgi) capaTgi.resetStyle(layer);
  const lbl = document.getElementById('lblCantSeleccionados');
  if (lbl) lbl.innerText = lotesSeleccionadosMultiples.length;
}

function vincularBotonesBarra() {
  const btnTgi = document.getElementById('btnToggleTGI');
  if (btnTgi) {
    btnTgi.onclick = function () {
      mostrarCapaTgi = !mostrarCapaTgi;
      if (mostrarCapaTgi) {
        if (capaTgi) map.addLayer(capaTgi);
        btnTgi.innerHTML = "🗺️ TGI";
        btnTgi.classList.add('activo');
      } else {
        if (capaTgi) map.removeLayer(capaTgi);
        btnTgi.innerHTML = "🗺️ TGI (OFF)";
        btnTgi.classList.remove('activo');
      }
    };
  }

  const btnB = document.getElementById('btnToggleBaldios');
  const panelTotalizador = document.getElementById('totalizadorBaldios');

  if (btnB) {
    btnB.onclick = function () {
      mostrarBaldiosExclusivos = !mostrarBaldiosExclusivos;

      if (mostrarBaldiosExclusivos) {
        mostrarSinDatosExclusivos = false;
        const btnSD1 = document.getElementById('btnSeleccionarSinDatos');
        const btnSD2 = document.getElementById('btnSeleccionarSinDatosBarra');
        if (btnSD1) { btnSD1.innerHTML = "⚠️ Sin Datos: APAGADO"; btnSD1.classList.remove('activo'); }
        if (btnSD2) { btnSD2.innerHTML = "⚠️ Sin Datos: APAGADO"; btnSD2.classList.remove('activo'); }
        const panelSinD = document.getElementById('totalizadorSinDatos');
        if (panelSinD) panelSinD.style.display = "none";
      }

      btnB.innerHTML = mostrarBaldiosExclusivos ? "🟩 Resaltar Baldíos: PRENDIDO" : "⬜ Resaltar Baldíos: APAGADO";
      btnB.classList.toggle('activo', mostrarBaldiosExclusivos);
      if (panelTotalizador) panelTotalizador.style.display = mostrarBaldiosExclusivos ? "block" : "none";

      if (mostrarBaldiosExclusivos) calcularTotalBaldios();
      if (capaTgi) capaTgi.eachLayer(layer => capaTgi.resetStyle(layer));
    };
  }

  const btnMuni = document.getElementById('btnToggleMuni');
  if (btnMuni) {
    btnMuni.onclick = function () {
      mostrarSoloMuni = !mostrarSoloMuni;
      btnMuni.innerHTML = mostrarSoloMuni ? "🏛️ Muni (ON)" : "🏛️ Muni";
      btnMuni.classList.toggle('activo', mostrarSoloMuni);

      if (capaTgi) capaTgi.eachLayer(layer => capaTgi.resetStyle(layer));
    };
  }

  const btnS = document.getElementById('btnToggleSatelite');
  if (btnS) {
    btnS.onclick = function () {
      const sateliteActivo = map.hasLayer(capaSatelital);
      if (sateliteActivo) {
        map.removeLayer(capaSatelital);
        map.addLayer(capaCalles);
        btnS.innerHTML = "🛰️ Satelital";
        btnS.classList.remove('activo');
      } else {
        map.removeLayer(capaSatelital);
        map.addLayer(capaSatelital);
        btnS.innerHTML = "🛰️ Satelital (ON)";
        btnS.classList.add('activo');
      }
    };
  }

  const btnSel = document.getElementById('btnToggleSeleccion');
  const panelSel = document.getElementById('panelSeleccionMultiple');

  if (btnSel) {
    btnSel.onclick = function () {
      modoSeleccionMultiple = !modoSeleccionMultiple;
      btnSel.innerHTML = modoSeleccionMultiple ? "🔲 Selección Múltiple: ON" : "🔲 Selección Múltiple: OFF";
      btnSel.classList.toggle('activo', modoSeleccionMultiple);
      if (panelSel) panelSel.style.display = modoSeleccionMultiple ? "flex" : "none";

      if (!modoSeleccionMultiple) {
        lotesSeleccionadosMultiples = [];
        const lbl = document.getElementById('lblCantSeleccionados');
        if (lbl) lbl.innerText = "0";
        if (capaTgi) capaTgi.eachLayer(l => capaTgi.resetStyle(l));
      }
    };
  }

  const btnSinDatos = document.getElementById('btnSeleccionarSinDatos');
  const btnSinDatosBarra = document.getElementById('btnSeleccionarSinDatosBarra');

  if (btnSinDatos) btnSinDatos.onclick = toggleModoSinDatos;
  if (btnSinDatosBarra) btnSinDatosBarra.onclick = toggleModoSinDatos;
}

function calcularTotalBaldios() {
  if (!datosTgi || !datosTgi.features) return;
  const contador = datosTgi.features.filter(f => {
    const bField = f.properties.Baldio;
    return bField !== null && bField !== undefined && normalizarTexto(bField) === "s";
  }).length;
  const numB = document.getElementById('numBaldios');
  if (numB) numB.innerText = contador;
}

// ==========================================
// 10. FILTROS Y BÚSQUEDA INSENSIBLE
// ==========================================
function filtrarTodo() {
  const inputA = document.getElementById('inputApellido');
  const inputC = document.getElementById('inputCalle');

  const apellidoNorm = inputA ? normalizarTexto(inputA.value) : "";
  const calleInputNorm = inputC ? normalizarTexto(inputC.value) : "";

  const sugApp = document.getElementById('listaSugerencias');
  const sugCalle = document.getElementById('listaSugerenciasCalle');

  limpiarMedidasLote();
  ocultarContenedorGraficoGeneral();
  const selSec = document.getElementById('selectSeccion');
  const selObr = document.getElementById('selectObra');
  if (selSec) selSec.value = "";
  if (selObr) selObr.value = "";
  const panelObr = document.getElementById('panelEstadisticaObra');
  if (panelObr) panelObr.style.display = "none";

  if (!datosTgi || !datosTgi.features) return;

  listadoLotesFiltroActual = datosTgi.features.filter(f => {
    const nom = normalizarTexto(buscarProp(f.properties, "Tit. Nombre"));
    const padron = normalizarTexto(buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente"));
    const dom = normalizarTexto(buscarProp(f.properties, "Ubicacion"));
    return (nom.includes(apellidoNorm) || padron.includes(apellidoNorm)) && dom.includes(calleInputNorm);
  });

  dibujarMapa(listadoLotesFiltroActual);

  if (calleInputNorm.length >= 2) {
    const callesLimpias = datosTgi.features.map(f => String(buscarProp(f.properties, "Ubicacion") || "").trim());
    const sugerenciasUnicas = [...new Set(callesLimpias)].filter(c => normalizarTexto(c).includes(calleInputNorm)).sort().slice(0, 8);
    const htmlC = sugerenciasUnicas.map(c => 
      `<div class="item-sugerencia" onclick="seleccionarCalle('${escaparHTML(c)}')">KM ${c}</div>`
    ).join('');
    if (sugCalle) { sugCalle.innerHTML = htmlC; sugCalle.style.display = htmlC ? "block" : "none"; }
  } else if (sugCalle) {
    sugCalle.style.display = "none";
  }

  if (apellidoNorm.length >= 2) {
    const htmlA = listadoLotesFiltroActual.slice(0, 10).map(f => {
      const n = buscarProp(f.properties, "Tit. Nombre") || "Sin Nombre";
      const p = buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente") || "-";
      const d = buscarProp(f.properties, "Ubicacion") || "Ubicación no especificada";

      return `<div class="item-sugerencia" onclick="seleccionarLotePorPadron('${escaparHTML(p)}')">
                <strong>👤 ${n}</strong><br>
                <span style="font-size: 10px; color: #7f8c8d;">🆔 Padrón: ${p} | 📍 ${d}</span>
              </div>`;
    }).join('');
    if (sugApp) { sugApp.innerHTML = htmlA; sugApp.style.display = htmlA ? "block" : "none"; }
  } else if (sugApp) {
    sugApp.style.display = "none";
  }
}

const inputApp = document.getElementById('inputApellido');
const inputCal = document.getElementById('inputCalle');
if (inputApp) inputApp.oninput = filtrarTodo;
if (inputCal) inputCal.oninput = filtrarTodo;

window.seleccionarCalle = function (nombreCalleLimpia) {
  limpiarMedidasLote();
  ocultarContenedorGraficoGeneral();
  const inputC = document.getElementById('inputCalle');
  if (inputC) inputC.value = nombreCalleLimpia;
  const sugCalle = document.getElementById('listaSugerenciasCalle');
  if (sugCalle) sugCalle.style.display = "none";

  const calleNorm = normalizarTexto(nombreCalleLimpia);
  listadoLotesFiltroActual = datosTgi.features.filter(f => 
    normalizarTexto(buscarProp(f.properties, "Ubicacion")).includes(calleNorm)
  );
  dibujarMapa(listadoLotesFiltroActual);

  if (capaTgi && capaTgi.getLayers().length > 0 && capaTgi.getBounds().isValid()) {
    map.fitBounds(capaTgi.getBounds(), { padding: [30, 30] });
  }

  window.toggleAcordeon('grupoCalle');
  generarEstadisticaCalle(listadoLotesFiltroActual, nombreCalleLimpia);
};

window.seleccionarLotePorPadron = function (padronVal) {
  const lote = datosTgi.features.find(f => 
    String(buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente")) === String(padronVal)
  );

  if (lote) {
    const sugApp = document.getElementById('listaSugerencias');
    if (sugApp) sugApp.style.display = "none";

    mostrarFicha(lote.properties);
    if (capaTgi) {
      capaTgi.eachLayer(l => {
        if (String(buscarProp(l.feature.properties, "Padron") || buscarProp(l.feature.properties, "Contribuyente")) === String(padronVal)) {
          l.bringToFront();
          l.fire('click');
        }
      });
    }
  }
};

// ==========================================
// 11. FICHA TÉCNICA
// ==========================================
function mostrarFicha(p) {
  const panelFlotante = document.getElementById('panelFichaFlotante');
  const cuerpoFlotante = document.getElementById('cuerpoFichaContenido');

  const esMuni = esLoteMunicipal(p);
  const d = limpiarMontoDeuda(p);
  const m = parseInt(buscarProp(p, "Meses Adeud.TGI")) || 0;

  const est = esMuni 
    ? '<span style="color:#2980b9; font-weight:bold;">EXENTO</span>' 
    : ((d > 0) ? (m === 1 ? '<span class="vencer">A VENCER</span>' : '<span class="deuda">DEUDA</span>') : 'AL DÍA');

  let html = `<p><span class="etiqueta">Estado TGI:</span> <span class="valor">${est}</span></p>
              <hr style="border:0; border-top:1px dashed #eee; margin:10px 0;">`;

  for (let k in p) {
    const clavePrevia = normalizarTexto(k);
    if (clavePrevia !== "baldio" && clavePrevia !== "nomenc" && clavePrevia !== "referencia") {
      let valorMostrar = p[k];
      if (clavePrevia === "deuda tgi" || clavePrevia === "deuda obra") {
        valorMostrar = esMuni ? "Exento" : formatearMoneda(valorMostrar);
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
// 12. DESPLEGABLES SECCIONES Y OBRAS
// ==========================================
function inicializarDesplegableSecciones(features) {
  const select = document.getElementById('selectSeccion');
  if (!select) return;
  const seccionesUnicas = [...new Set(features.map(f => String(buscarProp(f.properties, "Seccion") || "").trim()))].filter(s => s !== "").sort();

  select.innerHTML = '<option value="">🧱 Seleccionar Sección...</option>';
  seccionesUnicas.forEach(s => {
    const option = document.createElement('option');
    option.value = s;
    option.textContent = `Sección ${s}`;
    select.appendChild(option);
  });
}

const selectSec = document.getElementById('selectSeccion');
if (selectSec) {
  selectSec.onchange = function () {
    const numSeccion = this.value;
    limpiarMedidasLote();

    if (!numSeccion) {
      listadoLotesFiltroActual = datosTgi.features;
      dibujarMapa(datosTgi.features);
      return;
    }

    listadoLotesFiltroActual = datosTgi.features.filter(f => String(buscarProp(f.properties, "Seccion") || "").trim() === numSeccion);
    dibujarMapa(listadoLotesFiltroActual);
    if (capaTgi && capaTgi.getLayers().length > 0 && capaTgi.getBounds().isValid()) {
      map.fitBounds(capaTgi.getBounds(), { padding: [40, 40] });
    }
  };
}

function inicializarDesplegableObras(features) {
  const select = document.getElementById('selectObra');
  if (!select) return;
  const obrasUnicas = [...new Set(features.map(f => String(buscarProp(f.properties, "Obras") || "").trim()))].filter(o => o !== "" && normalizarTexto(o) !== "null").sort();

  select.innerHTML = '<option value="">🚧 Seleccionar Obra...</option>';
  obrasUnicas.forEach(o => {
    const option = document.createElement('option');
    option.value = o;
    option.textContent = o;
    select.appendChild(option);
  });
}

const selectObr = document.getElementById('selectObra');
if (selectObr) {
  selectObr.onchange = function () {
    nombreObraActual = this.value;
    limpiarMedidasLote();

    const panelStatsObra = document.getElementById('panelEstadisticaObra');
    const btnImpObra = document.getElementById('btnImprimirObra');

    if (!nombreObraActual) {
      if (panelStatsObra) panelStatsObra.style.display = "none";
      if (btnImpObra) btnImpObra.style.display = "none";
      listadoLotesFiltroActual = datosTgi.features;
      dibujarMapa(datosTgi.features);
      return;
    }

    lotesObraActual = datosTgi.features.filter(f => String(buscarProp(f.properties, "Obras") || "").trim() === nombreObraActual);
    listadoLotesFiltroActual = lotesObraActual;
    
    dibujarMapa(lotesObraActual);
    generarEstadisticaObra(lotesObraActual, nombreObraActual);

    if (capaTgi && capaTgi.getLayers().length > 0 && capaTgi.getBounds().isValid()) {
      map.fitBounds(capaTgi.getBounds(), { padding: [40, 40] });
    }
    if (btnImpObra) btnImpObra.style.display = "block";
  };
}

// ==========================================
// 13. ESTADÍSTICAS Y GRÁFICOS (CHART.JS)
// ==========================================
window.ocultarContenedorGraficoGeneral = function() {
  const el = document.getElementById('contenedorGraficoGeneral');
  if (el) el.style.display = "none";
  if (miGraficoG) { miGraficoG.destroy(); miGraficoG = null; }
};

window.solicitarGraficoGeneral = function () {
  const contenedor = document.getElementById('contenedorGraficoGeneral');
  if (contenedor) contenedor.style.display = "block";
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

  const canvas = document.getElementById('graficoBarras');
  if (!canvas) return;

  miGraficoG = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Al Día / Exento', 'A Vencer', 'Deuda'],
      datasets: [{ 
        data: [s, v, d], 
        backgroundColor: ['#2ecc71', '#f1c40f', '#e74c3c'], 
        borderWidth: 1.5,
        borderColor: '#ffffff' 
      }]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { 
        legend: { position: 'right' },
        datalabels: {
          color: '#ffffff',
          font: { weight: 'bold', size: 11 },
          formatter: (value) => value > 0 ? value : ''
        }
      }, 
      cutout: '50%' 
    }
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

  const panelCalle = document.getElementById('panelEstadisticaCalle');
  if (panelCalle) panelCalle.style.display = "block";

  const statsCalle = document.getElementById('statsCalleContenido');
  if (statsCalle) {
    statsCalle.innerHTML = `
      <p style="font-size:10px; margin:5px 0;">📍 <strong>${nombre}</strong></p>
      <p style="font-size:11px; margin:0;">Total: <strong>${total}</strong> registros</p>
      <span class="etiqueta-porcentaje">CUMPLIMIENTO: ${porcAlDia}%</span>
      <div class="barra-progreso"><div class="progreso-llenado" style="width:${porcAlDia}%; background:#2ecc71;"></div></div>
      <span class="etiqueta-porcentaje">MOROSIDAD: ${porcDeuda}%</span>
      <div class="barra-progreso"><div class="progreso-llenado" style="width:${porcDeuda}%; background:#e74c3c;"></div></div>
    `;
  }

  if (miGraficoC) miGraficoC.destroy();

  const canvasCalle = document.getElementById('graficoCalle');
  if (!canvasCalle) return;

  miGraficoC = new Chart(canvasCalle, {
    type: 'doughnut',
    data: { 
      labels: ['Al Día', 'A Vencer', 'Deuda'],
      datasets: [{ 
        data: [alDia, vencer, deuda], 
        backgroundColor: ['#2ecc71', '#f1c40f', '#e74c3c'], 
        borderWidth: 1,
        borderColor: '#ffffff'
      }] 
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { 
        legend: false,
        datalabels: {
          color: '#ffffff',
          font: { weight: 'bold', size: 10 },
          formatter: (value) => value > 0 ? value : ''
        }
      }, 
      cutout: '65%' 
    }
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
  const montoFormat = formatearMoneda(sumaMontoDeudaObra);

  const panelObra = document.getElementById('panelEstadisticaObra');
  if (panelObra) panelObra.style.display = "block";

  const statsObra = document.getElementById('statsObraContenido');
  if (statsObra) {
    statsObra.innerHTML = `
      <p style="font-size:10px; margin:5px 0;">🚧 <strong>${textObra}</strong></p>
      <p style="font-size:11px; margin:0;">Lotes afectados: <strong>${total}</strong></p>
      <p style="font-size:11px; margin: 4px 0; color:#e74c3c;">Deuda Total: <strong>${montoFormat}</strong></p>
    `;
  }

  if (miGraficoO) miGraficoO.destroy();

  const canvasObra = document.getElementById('graficoObra');
  if (!canvasObra) return;

  miGraficoO = new Chart(canvasObra, {
    type: 'doughnut',
    data: { 
      labels: ['Al Día', 'Deuda'],
      datasets: [{ 
        data: [alDia, conDeuda], 
        backgroundColor: ['#2ecc71', '#e74c3c'], 
        borderWidth: 1,
        borderColor: '#ffffff'
      }] 
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { 
        legend: false,
        datalabels: {
          color: '#ffffff',
          font: { weight: 'bold', size: 10 },
          formatter: (value) => value > 0 ? value : ''
        }
      }, 
      cutout: '65%' 
    }
  });
}

// ==========================================
// 14. IMPRESIÓN Y INFORMES
// ==========================================
window.imprimirObraDirecta = function () {
  if (!lotesObraActual || lotesObraActual.length === 0) return alert("Seleccione primero una obra válida.");

  let sumaTotal = 0;
  const HTMLFilasObra = lotesObraActual.map(f => {
    const p = f.properties;
    const deuda = limpiarMontoGenerico(buscarProp(p, "Deuda Obra"));
    sumaTotal += deuda;

    return `<tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${buscarProp(p, "Padron") || buscarProp(p, "Contribuyente") || "-"}</td>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>${buscarProp(p, "Tit. Nombre") || "-"}</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${buscarProp(p, "Ubicacion") || "-"}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align:center;">${parseInt(buscarProp(p, "Cuotas Atrasadas")) || 0}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align:right;">${esLoteMunicipal(p) ? "Exento" : formatearMoneda(deuda)}</td>
            </tr>`;
  }).join('');

  const ventana = window.open('', '_blank', 'height=600,width=850');
  if (!ventana) return alert("Por favor, permite las ventanas emergentes para imprimir.");

  ventana.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Obra: ${nombreObraActual}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
          h2 { color: #2c3e50; border-bottom: 2px solid #e74c3c; padding-bottom: 8px; margin-bottom: 5px; }
          .total { margin-top: 10px; font-weight: bold; font-size: 15px; color: #c0392b; background: #fdf2e9; padding: 10px; border-radius: 4px; display: inline-block; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #2c3e50; color: white; padding: 10px; font-size: 12px; text-align: left; }
          td { font-size: 12px; }
          tr:nth-child(even) { background-color: #f9f9f9; }
        </style>
      </head>
      <body>
        <h2>🚧 Informe de Obra: ${nombreObraActual}</h2>
        <p style="margin: 0; font-size: 13px;">Cantidad de Lotes Afectados: <strong>${lotesObraActual.length}</strong></p>
        <p class="total">DEUDA TOTAL ACUMULADA: ${formatearMoneda(sumaTotal)}</p>
        <table>
          <thead>
            <tr>
              <th>Padrón</th>
              <th>Titular</th>
              <th>Ubicación</th>
              <th style="text-align: center;">Cuotas Atr.</th>
              <th style="text-align: right;">Deuda Obra</th>
            </tr>
          </thead>
          <tbody>
            ${HTMLFilasObra}
          </tbody>
        </table>
      </body>
    </html>
  `);
  ventana.document.close();
  ventana.focus();
  setTimeout(() => { ventana.print(); }, 250);
};

const btnImpObra = document.getElementById('btnImprimirObra');
if (btnImpObra) {
  btnImpObra.onclick = function () { window.imprimirObraDirecta(); };
}

window.imprimirLotesSeleccionados = function () {
  if (lotesSeleccionadosMultiples.length === 0) return alert("No has seleccionado ningún lote.");

  const htmlFilas = lotesSeleccionadosMultiples.map(f => {
    const p = f.properties;
    return `<tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${buscarProp(p, "Padron") || buscarProp(p, "Contribuyente") || "Sin Padrón"}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${buscarProp(p, "Tit. Nombre") || "Sin Titular"}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${buscarProp(p, "Ubicacion") || "-"}</td>
            </tr>`;
  }).join('');

  const ventanaImpresion = window.open('', '_blank', 'height=600,width=850');
  if (!ventanaImpresion) return alert("Por favor, permite las ventanas emergentes para imprimir.");

  ventanaImpresion.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Impresión de Lotes Seleccionados</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
          h2 { color: #2c3e50; border-bottom: 2px solid #ffff00; padding-bottom: 8px; }
          .total { margin-top: 10px; font-weight: bold; font-size: 14px; color: #16a085; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #2c3e50; color: white; padding: 10px; font-size: 12px; text-align: left; }
          td { font-size: 12px; }
          tr:nth-child(even) { background-color: #f9f9f9; }
        </style>
      </head>
      <body>
        <h2>📋 Lotes Seleccionados</h2>
        <p class="total">Total de lotes seleccionados: ${lotesSeleccionadosMultiples.length}</p>
        <table>
          <thead>
            <tr>
              <th>Padrón</th>
              <th>Titular</th>
              <th>Ubicación</th>
            </tr>
          </thead>
          <tbody>
            ${htmlFilas}
          </tbody>
        </table>
      </body>
    </html>
  `);
  ventanaImpresion.document.close();
  ventanaImpresion.focus();
  setTimeout(() => { ventanaImpresion.print(); }, 250);
};

window.imprimirLotesMunicipales = function () {
  if (!datosTgi || !datosTgi.features) return alert("No hay datos cargados en el mapa.");

  const lotesMuni = datosTgi.features.filter(f => esLoteMunicipal(f.properties));

  if (lotesMuni.length === 0) return alert("No se encontraron lotes pertenecientes a la MUNICIPALIDAD DE RUFINO.");

  const htmlFilas = lotesMuni.map(f => {
    const p = f.properties;
    const padron = buscarProp(p, "Padron") || buscarProp(p, "Contribuyente") || "-";
    const titular = buscarProp(p, "Tit. Nombre") || "MUNICIPALIDAD DE RUFINO";
    const ubicacion = buscarProp(p, "Ubicacion") || "-";
    const deudaRaw = buscarProp(p, "Deuda TGI");
    const deudaTGI = (deudaRaw !== "" && deudaRaw !== null && deudaRaw !== undefined) 
                     ? (isNaN(deudaRaw) ? deudaRaw : formatearMoneda(deudaRaw))
                     : "Exento";

    return `<tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${padron}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${titular}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${ubicacion}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${deudaTGI}</td>
            </tr>`;
  }).join('');

  const ventanaImpresion = window.open('', '_blank', 'height=600,width=850');
  if (!ventanaImpresion) return alert("Por favor, permite las ventanas emergentes para imprimir.");

  ventanaImpresion.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Detalle de Lotes Municipales - Rufino</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
          h2 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px; }
          .total { margin-top: 10px; font-weight: bold; font-size: 14px; color: #2980b9; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #2c3e50; color: white; padding: 10px; font-size: 12px; text-align: left; }
          td { font-size: 12px; }
          tr:nth-child(even) { background-color: #f9f9f9; }
        </style>
      </head>
      <body>
        <h2>🏛️ Lotes Municipales ("MUNICIPALIDAD DE RUFINO")</h2>
        <p class="total">Total de Terrenos Detectados: ${lotesMuni.length}</p>
        <table>
          <thead>
            <tr>
              <th>Padrón</th>
              <th>Titular</th>
              <th>Ubicación</th>
              <th style="text-align: right;">Estado / Deuda TGI</th>
            </tr>
          </thead>
          <tbody>
            ${htmlFilas}
          </tbody>
        </table>
      </body>
    </html>
  `);
  ventanaImpresion.document.close();
  ventanaImpresion.focus();
  setTimeout(() => { ventanaImpresion.print(); }, 250);
};

// ==========================================
// 15. BÚSQUEDA BARRA SUPERIOR
// ==========================================
function ejecutarBusquedaBarra(texto) {
  const sugBarra = document.getElementById('listaSugerenciasBarra');
  if (!sugBarra) return;

  const busqueda = normalizarTexto(texto);

  if (busqueda.length === 0) {
    sugBarra.style.display = 'none';
    sugBarra.innerHTML = '';
    return;
  }

  if (!datosTgi || !datosTgi.features) return;

  const coincidentes = datosTgi.features.filter(f => {
    if (!f || !f.properties) return false;
    const titular = normalizarTexto(buscarProp(f.properties, "Tit. Nombre"));
    const padron = normalizarTexto(buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente"));
    return titular.includes(busqueda) || padron.includes(busqueda);
  }).slice(0, 15);

  if (coincidentes.length === 0) {
    sugBarra.innerHTML = '<div class="item-sugerencia" style="color:#888;">Sin coincidencias</div>';
    sugBarra.style.display = 'block';
    return;
  }

  let html = '';
  coincidentes.forEach(f => {
    const titularOriginal = buscarProp(f.properties, "Tit. Nombre") || 'Sin Nombre';
    const padronOriginal = String(buscarProp(f.properties, "Padron") || buscarProp(f.properties, "Contribuyente") || 'S/N');

    const titularResaltado = resaltarCoincidencia(titularOriginal, texto.trim());
    const padronResaltado = resaltarCoincidencia(padronOriginal, texto.trim());

    html += `
      <div class="item-sugerencia" onclick="seleccionarLoteDesdeBarra('${escaparHTML(padronOriginal)}')">
        <strong>Padrón: ${padronResaltado}</strong> - ${titularResaltado}
      </div>
    `;
  });

  sugBarra.innerHTML = html;
  sugBarra.style.display = 'block';
}

window.seleccionarLoteDesdeBarra = function (padronVal) {
  const sugBarra = document.getElementById('listaSugerenciasBarra');
  if (sugBarra) sugBarra.style.display = "none";
  seleccionarLotePorPadron(padronVal);
};

document.addEventListener('click', function(e) {
  const inputBarra = document.getElementById('inputBarraBusqueda');
  const listaBarra = document.getElementById('listaSugerenciasBarra');
  if (listaBarra && inputBarra && e.target !== inputBarra && !listaBarra.contains(e.target)) {
    listaBarra.style.display = 'none';
  }
});

// ==========================================
// 16. INICIALIZACIÓN
// ==========================================
cargarDatos();