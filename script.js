// ==========================================
// 1. CONFIGURACIÓN Y MAPA BASE
// ==========================================
if (typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

const capaCalles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});

// Capa Satelital de Google Maps
const capaSatelital = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
  maxZoom: 21,
  attribution: '&copy; Google Maps'
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
let miGraficoSemaforo = null;

let lotesObraActual = [];
let nombreObraActual = "";
let lineasLadosActuales = [];
let mostrarBaldiosExclusivos = false;
let mostrarSinDatosExclusivos = false;
let mostrarSoloMuni = false;
let mostrarCapaTgi = true;
let listadoLotesFiltroActual = [];
let loteSeleccionadoActual = null;
let loteResaltadoActual = null;

// Fechas de Deuda
let fechaDeudaAF2 = "No especificada";
let fechaDeudaGeoJSON = "No especificada";

// Control de Etiquetas de Padrón / Contribuyente
let mostrarPadronesBoton = true;
let capasEtiquetasPadron = L.layerGroup();
const ZOOM_MINIMO_PADRON = 17;

// Selección Múltiple y Modo Captura para Impresión
let modoSeleccionMultiple = false;
let lotesSeleccionadosMultiples = [];
let modoCapturaImpresion = false;

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

function obtenerDatoGeoJSON(propiedades, claves) {
  if (!propiedades) return "-";
  for (let clave of claves) {
    if (propiedades[clave] !== undefined && propiedades[clave] !== null && String(propiedades[clave]).trim() !== "") {
      return propiedades[clave];
    }
  }

  const listaKeys = Object.keys(propiedades);
  for (let clave of claves) {
    const claveNorm = normalizarTexto(clave);
    const keyEncontrada = listaKeys.find(k => normalizarTexto(k) === claveNorm);
    if (keyEncontrada && propiedades[keyEncontrada] !== undefined && propiedades[keyEncontrada] !== null && String(propiedades[keyEncontrada]).trim() !== "") {
      return propiedades[keyEncontrada];
    }
  }

  return "-";
}

// ==========================================
// 4. UI, NAVEGACIÓN Y AYUDA
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

window.abrirModalAyuda = function() {
  const modal = document.getElementById('modalAyudaSistema');
  if (modal) modal.style.display = 'flex';
};

window.cerrarModalAyuda = function() {
  const modal = document.getElementById('modalAyudaSistema');
  if (modal) modal.style.display = 'none';
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
  const padron = normalizarTexto(obtenerDatoGeoJSON(propiedades, ["Padron", "Padronn", "PADRON", "PADRONN", "Contrib", "CONTRIB"]));
  const titular = normalizarTexto(obtenerDatoGeoJSON(propiedades, ["Tit. Nombre", "TITULAR", "Titular", "Nombre", "NOMBRE"]));
  return (padron === "" || padron === "-") && (titular === "" || titular === "-");
}

function esLoteMunicipal(propiedades) {
  const titular = normalizarTexto(obtenerDatoGeoJSON(propiedades, ["Tit. Nombre", "TITULAR", "Titular", "Nombre", "NOMBRE"]));
  return titular.includes("municipalidad de rufino") || titular.includes("muni rufino");
}

function limpiarMontoGenerico(valorTexto) {
  if (valorTexto === null || valorTexto === undefined) return 0;
  if (typeof valorTexto === 'number') return valorTexto;

  let texto = String(valorTexto).trim();
  if (texto.toLowerCase() === "null" || texto === "" || texto === "-") return 0;

  texto = texto.replace(/\$/g, '').replace(/\s+/g, '');

  if (texto.includes(',') && texto.includes('.')) {
    texto = texto.replace(/,/g, '');
  } else if (texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  }

  const resultado = parseFloat(texto);
  return isNaN(resultado) ? 0 : resultado;
}

function obtenerMesesDeuda(propiedades) {
  const val = obtenerDatoGeoJSON(propiedades, [
    "Ctas Deuda", "CTAS DEUDA", "CtasDeuda", "ctas_deuda", 
    "Meses Adeud.TGI", "Meses Adeud_TGI", "MesesAdeud", "CuotasDeuda"
  ]);
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function limpiarMontoDeuda(propiedades) {
  if (esLoteMunicipal(propiedades)) return 0;
  const val = obtenerDatoGeoJSON(propiedades, [
    "Total Adeudado", "TOTAL ADEUDADO", "TotalAdeudado", 
    "Deuda TGI", "DEUDA_TGI", "Deuda", "DEUDA", "MontoDeuda"
  ]);
  return limpiarMontoGenerico(val);
}

// ==========================================
// 6. ESTILOS GEOJSON DE LOTES
// ==========================================
function estiloManzanaPorSeccion(feature) {
  const seccion = String(obtenerDatoGeoJSON(feature.properties, ["Seccion", "SECCION", "Sector", "SECTOR"]) || "0");
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
  const estaSeleccionado = lotesSeleccionadosMultiples.includes(f);

  if (modoCapturaImpresion) {
    if (estaSeleccionado) {
      return { color: "#111111", fillColor: "#ff0055", weight: 2.5, fillOpacity: 0.9, dashArray: null };
    } else {
      return { color: "transparent", fillColor: "transparent", weight: 0, fillOpacity: 0 };
    }
  }

  if (estaSeleccionado) {
    return { color: "#111111", fillColor: "#ff0055", weight: 2.5, fillOpacity: 0.9, dashArray: null };
  }

  if (mostrarSinDatosExclusivos) {
    const esSinD = esLoteSinDatos(f.properties);
    return esSinD
      ? { color: "#cccc00", fillColor: "#ffff00", weight: 3, fillOpacity: 0.95 }
      : { color: "#ccc", fillColor: "transparent", weight: 0.5, fillOpacity: 0 };
  }

  const bField = obtenerDatoGeoJSON(f.properties, ["Baldio", "BALDIO", "baldio"]);
  const esBaldio = bField !== "-" && normalizarTexto(bField) === "s";

  if (mostrarBaldiosExclusivos) {
    return esBaldio 
      ? { color: "#2ecc71", fillColor: "#2ecc71", weight: 2.5, fillOpacity: 0.8 }
      : { color: "#ccc", fillColor: "transparent", weight: 0.5, fillOpacity: 0 };
  }

  const esMuni = esLoteMunicipal(f.properties);
  if (mostrarSoloMuni) {
    return esMuni 
      ? { color: "#1b4f72", fillColor: "#2980b9", weight: 2.5, fillOpacity: 0.85 }
      : { color: "#ccc", fillColor: "transparent", weight: 0.5, fillOpacity: 0 };
  }

  if (esMuni) {
    return { color: "#1b4f72", fillColor: "#2980b9", weight: 1.5, fillOpacity: 0.6 };
  }

  // Reglas del Semáforo de Deuda
  const deu = limpiarMontoDeuda(f.properties);
  const mes = obtenerMesesDeuda(f.properties);

  if (deu <= 0 || mes === 0) {
    return { color: "#27ae60", fillColor: "#2ecc71", weight: 0.8, fillOpacity: 0.55 }; // Verde (0 meses / Al día)
  } else if (mes >= 1 && mes <= 3) {
    return { color: "#f39c12", fillColor: "#f1c40f", weight: 1, fillOpacity: 0.65 }; // Amarillo (1 a 3 meses)
  } else {
    return { color: "#c0392b", fillColor: "#e74c3c", weight: 1, fillOpacity: 0.65 }; // Rojo (4+ meses)
  }
}

// ==========================================
// 7. REFERENCIA AL PIE DE PANTALLA COMPACTA
// ==========================================
function crearReferenciaInferior() {
  if (document.getElementById('referenciaSemaforoPie')) return;

  const divRef = document.createElement('div');
  divRef.id = 'referenciaSemaforoPie';
  divRef.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    background: rgba(30, 41, 59, 0.95);
    color: #ffffff;
    padding: 4px 10px;
    font-family: Arial, sans-serif;
    font-size: 11px;
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.3);
    border-top: 1px solid #334155;
    box-sizing: border-box;
    white-space: nowrap;
    overflow-x: auto;
  `;

  divRef.innerHTML = `
    <span style="font-weight: bold; color: #cbd5e1; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">Semáforo Deuda TGI:</span>
    <div style="display: flex; align-items: center; gap: 4px;">
      <span style="display: inline-block; width: 10px; height: 10px; background: #2ecc71; border-radius: 2px; border: 1px solid #27ae60;"></span>
      <span style="font-size: 10px;"><strong>Al Día:</strong> 0m</span>
    </div>
    <div style="display: flex; align-items: center; gap: 4px;">
      <span style="display: inline-block; width: 10px; height: 10px; background: #f1c40f; border-radius: 2px; border: 1px solid #f39c12;"></span>
      <span style="font-size: 10px;"><strong>Moderada:</strong> 1-3m</span>
    </div>
    <div style="display: flex; align-items: center; gap: 4px;">
      <span style="display: inline-block; width: 10px; height: 10px; background: #e74c3c; border-radius: 2px; border: 1px solid #c0392b;"></span>
      <span style="font-size: 10px;"><strong>Deuda:</strong> 4m+</span>
    </div>
  `;

  document.body.appendChild(divRef);
}

// ==========================================
// 8. CARGA DE DATOS Y CRUCE DESDE 3 GEOJSONS
// ==========================================
async function cargarDatos() {
  try {
    const resM = await fetch('manzanas.geojson');
    if (resM.ok) {
      const dataM = await resM.json();
      L.geoJSON(dataM, {
        style: estiloManzanaPorSeccion,
        onEachFeature: (f, l) => {
          const sec = obtenerDatoGeoJSON(f.properties, ["Seccion", "SECCION", "Sector", "SECTOR"]);
          if (sec !== "-") { l.bindTooltip(`Sección ${sec}`, { sticky: true, opacity: 0.7 }); }
        }
      }).addTo(map);
    }
  } catch (e) {
    console.warn("Aviso: manzanas.geojson no cargado.", e);
  }

  try {
    const [resUbicacion, resDatos, resDeuda] = await Promise.all([
      fetch('tgi.geojson').catch(() => null),
      fetch('tgi-datos.geojson').catch(() => null),
      fetch('Deuda-tgi.geojson').catch(() => null)
    ]);

    if (!resUbicacion || !resUbicacion.ok) {
      console.error("Error crítico: No se pudo cargar tgi.geojson");
      return;
    }

    datosTgi = await resUbicacion.json();

    const mapaDatos = new Map();
    if (resDatos && resDatos.ok) {
      const jsonDatos = await resDatos.json();
      const arrayFeaturesDatos = jsonDatos.features || (Array.isArray(jsonDatos) ? jsonDatos : []);
      arrayFeaturesDatos.forEach(item => {
        const props = item.properties || item;
        const padron = String(obtenerDatoGeoJSON(props, ["Padron", "Padronn", "PADRON", "PADRONN", "Contrib", "CONTRIB"])).trim();
        if (padron !== "-") mapaDatos.set(padron, props);
      });
    }

    const mapaDeuda = new Map();
    if (resDeuda && resDeuda.ok) {
      const jsonDeuda = await resDeuda.json();
      const arrayFeaturesDeuda = jsonDeuda.features || (Array.isArray(jsonDeuda) ? jsonDeuda : []);

      // Extraer la fecha ubicada al final del primer campo del primer registro
      if (arrayFeaturesDeuda.length > 0) {
        const primerRegistro = arrayFeaturesDeuda[0].properties || arrayFeaturesDeuda[0];
        const primerCampoNombre = Object.keys(primerRegistro)[0];
        const valorPrimerCampo = String(primerRegistro[primerCampoNombre] || "").trim();

        const matchFecha = valorPrimerCampo.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b$/);
        if (matchFecha) {
          fechaDeudaGeoJSON = matchFecha[1];
        }
      }

      arrayFeaturesDeuda.forEach(item => {
        const props = item.properties || item;
        const padron = String(obtenerDatoGeoJSON(props, ["Padron", "Padronn", "PADRON", "PADRONN", "Contrib", "CONTRIB"])).trim();
        if (padron !== "-") mapaDeuda.set(padron, props);
      });
    }

    if (datosTgi && datosTgi.features) {
      datosTgi.features.forEach(f => {
        for (let k in f.properties) {
          if (typeof f.properties[k] === 'string') {
            f.properties[k] = decodificarTexto(f.properties[k]);
          }
        }

        const padronClave = String(obtenerDatoGeoJSON(f.properties, ["Padronn", "PADRONN", "Padron", "PADRON", "Contrib", "CONTRIB"])).trim();

        if (padronClave !== "-" && mapaDatos.has(padronClave)) {
          f.properties = { ...f.properties, ...mapaDatos.get(padronClave) };
        }

        if (padronClave !== "-" && mapaDeuda.has(padronClave)) {
          f.properties = { ...f.properties, ...mapaDeuda.get(padronClave) };
        }
      });

      if (fechaDeudaGeoJSON === "No especificada") {
        const loteConFecha = datosTgi.features.find(f => f.properties && (f.properties.deudafecha || f.properties.DeudaFecha || f.properties["Deuda a la Fecha"]));
        if (loteConFecha) {
          fechaDeudaGeoJSON = decodificarTexto(obtenerDatoGeoJSON(loteConFecha.properties, ["deudafecha", "DeudaFecha", "Deuda a la Fecha"]));
        }
      }
    }

    listadoLotesFiltroActual = datosTgi.features;
    dibujarMapa(datosTgi.features);
    inicializarDesplegableSecciones(datosTgi.features);
    vincularBotonesBarra();
    crearReferenciaInferior();
    console.log("⚡ Cruce de GeoJSONs completado con fecha:", fechaDeudaGeoJSON);
  } catch (e) {
    console.error("Error al procesar y vincular los GeoJSONs:", e);
  }
}

function limpiarResalteLote() {
  if (loteResaltadoActual && capaTgi) {
    capaTgi.resetStyle(loteResaltadoActual);
    loteResaltadoActual = null;
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

        if (loteResaltadoActual && loteResaltadoActual !== l) {
          capaTgi.resetStyle(loteResaltadoActual);
        }

        l.setStyle({
          color: '#00ffff',
          weight: 4.5,
          fillOpacity: 0.85,
          dashArray: null
        });
        l.bringToFront();
        loteResaltadoActual = l;

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

  actualizarEtiquetasPadron();
}

// ==========================================
// 9. MEDIDAS Y DISTANCIAS
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
// 10. CONTROLES Y SELECCIÓN MÚLTIPLE
// ==========================================
function toggleModoSinDatos() {
  mostrarSinDatosExclusivos = !mostrarSinDatosExclusivos;

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

  if (capaTgi) {
    capaTgi.eachLayer(l => capaTgi.resetStyle(l));
  }

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
        btnTgi.innerHTML = "MAPA TGI";
        btnTgi.classList.add('activo');
      } else {
        if (capaTgi) map.removeLayer(capaTgi);
        btnTgi.innerHTML = "MAPA TGI (OFF)";
        btnTgi.classList.remove('activo');
      }
    };
  }

  const btnPadron = document.getElementById('btnToggleEtiquetasPadron');
  if (btnPadron) {
    btnPadron.onclick = function () {
      mostrarPadronesBoton = !mostrarPadronesBoton;
      btnPadron.classList.toggle('activo', mostrarPadronesBoton);
      btnPadron.innerHTML = mostrarPadronesBoton ? "Padrones" : "Padrones (OFF)";
      actualizarEtiquetasPadron();
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
      btnMuni.innerHTML = mostrarSoloMuni ? "Muni (ON)" : "Muni";
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
        btnS.innerHTML = "Satelital";
        btnS.classList.remove('activo');
      } else {
        map.removeLayer(capaCalles);
        map.addLayer(capaSatelital);
        btnS.innerHTML = "Satelital (ON)";
        btnS.classList.add('activo');
      }
    };
  }

  const btnSel = document.getElementById('btnToggleSeleccion');
  const panelSel = document.getElementById('panelSeleccionMultiple');

  if (btnSel) {
    btnSel.onclick = function () {
      modoSeleccionMultiple = !modoSeleccionMultiple;
      btnSel.innerHTML = modoSeleccionMultiple ? "Selección Múltiple: ON" : "Selección Múltiple: OFF";
      btnSel.classList.toggle('activo', modoSeleccionMultiple);
      if (panelSel) panelSel.style.display = modoSeleccionMultiple ? "flex" : "none";

      if (!modoSeleccionMultiple) {
        lotesSeleccionadosMultiples = [];
        const lbl = document.getElementById('lblCantSeleccionados');
        if (lbl) lbl.innerText = "0";
      }

      if (capaTgi) {
        capaTgi.eachLayer(l => capaTgi.resetStyle(l));
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
    const bField = obtenerDatoGeoJSON(f.properties, ["Baldio", "BALDIO", "baldio"]);
    return bField !== "-" && normalizarTexto(bField) === "s";
  }).length;
  const numB = document.getElementById('numBaldios');
  if (numB) numB.innerText = contador;
}

// ==========================================
// 11. FILTROS Y BÚSQUEDA INSENSIBLE
// ==========================================
function filtrarTodo() {
  const inputA = document.getElementById('inputApellido');
  const apellidoNorm = inputA ? normalizarTexto(inputA.value) : "";

  const sugApp = document.getElementById('listaSugerencias');

  limpiarMedidasLote();
  ocultarContenedorGraficoGeneral();
  const selSec = document.getElementById('selectSeccion');
  if (selSec) selSec.value = "";

  if (!datosTgi || !datosTgi.features) return;

  listadoLotesFiltroActual = datosTgi.features.filter(f => {
    const nom = normalizarTexto(obtenerDatoGeoJSON(f.properties, ["Tit. Nombre", "TITULAR", "Titular", "Nombre", "NOMBRE"]));
    const padron = normalizarTexto(obtenerDatoGeoJSON(f.properties, ["Padron", "Padronn", "PADRON", "PADRONN", "Contrib", "CONTRIB"]));
    return nom.includes(apellidoNorm) || padron.includes(apellidoNorm);
  });

  dibujarMapa(listadoLotesFiltroActual);

  if (apellidoNorm.length >= 2) {
    const htmlA = listadoLotesFiltroActual.slice(0, 10).map(f => {
      const n = obtenerDatoGeoJSON(f.properties, ["Tit. Nombre", "TITULAR", "Titular", "Nombre", "NOMBRE"]);
      const p = obtenerDatoGeoJSON(f.properties, ["Padron", "Padronn", "PADRON", "PADRONN", "Contrib", "CONTRIB"]);
      const d = obtenerDatoGeoJSON(f.properties, ["Ubi. Calle", "UBI. CALLE", "Ubicacion", "UBICACION", "Direccion"]);

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

window.seleccionarCalle = function (nombreCalleLimpia) {
  limpiarMedidasLote();
  ocultarContenedorGraficoGeneral();
  const inputC = document.getElementById('inputCalle');
  if (inputC) inputC.value = nombreCalleLimpia;
  const sugCalle = document.getElementById('listaSugerenciasCalle');
  if (sugCalle) sugCalle.style.display = "none";

  const calleNorm = normalizarTexto(nombreCalleLimpia);
  listadoLotesFiltroActual = datosTgi.features.filter(f => 
    normalizarTexto(obtenerDatoGeoJSON(f.properties, ["Ubi. Calle", "UBI. CALLE", "Ubicacion", "UBICACION", "Direccion"])).includes(calleNorm)
  );
  dibujarMapa(listadoLotesFiltroActual);

  if (capaTgi && capaTgi.getLayers().length > 0 && capaTgi.getBounds().isValid()) {
    map.fitBounds(capaTgi.getBounds(), { padding: [30, 30] });
  }

  window.toggleAcordeon('grupoCalle');
  generarEstadisticaCalle(listadoLotesFiltroActual, nombreCalleLimpia);
};

window.seleccionarLotePorPadron = function (padronVal) {
  const claveBuscada = String(padronVal).trim();

  const lote = datosTgi.features.find(f => {
    const pGeo = String(
      obtenerDatoGeoJSON(f.properties, ["Padron", "Padronn", "PADRON", "PADRONN", "Contrib", "CONTRIB"])
    ).trim();
    return pGeo === claveBuscada;
  });

  if (lote) {
    const sugApp = document.getElementById('listaSugerencias');
    if (sugApp) sugApp.style.display = "none";

    mostrarFicha(lote.properties);
    if (capaTgi) {
      capaTgi.eachLayer(l => {
        const pLote = String(
          obtenerDatoGeoJSON(l.feature.properties, ["Padron", "Padronn", "PADRON", "PADRONN", "Contrib", "CONTRIB"])
        ).trim();

        if (pLote === claveBuscada) {
          l.bringToFront();
          l.fire('click');
        }
      });
    }
  }
};

// ==========================================
// 12. FICHA TÉCNICA CATASTRAL FLOTANTE
// ==========================================
function mostrarFicha(p) {
  const panelFlotante = document.getElementById('panelFichaFlotante');
  const cuerpoFlotante = document.getElementById('cuerpoFichaContenido');

  const partida = decodificarTexto(obtenerDatoGeoJSON(p, ["PARTIDA", "Partida", "partida"]));
  const padron = decodificarTexto(obtenerDatoGeoJSON(p, ["Padron", "PADRON", "Padronn", "PADRONN", "Contrib", "CONTRIB"]));
  const titular = decodificarTexto(obtenerDatoGeoJSON(p, ["Tit. Nombre", "TITULAR", "Titular", "Tit_Nombre", "Nombre", "NOMBRE"]));
  const dni = decodificarTexto(obtenerDatoGeoJSON(p, ["Tit. Doc.", "TIT. DOC.", "DNI", "dni", "Dni"]));
  const ubicacion = decodificarTexto(obtenerDatoGeoJSON(p, ["Ubi. Calle", "UBI. CALLE", "Ubicacion", "UBICACION", "Direccion"]));
  const manzana = obtenerDatoGeoJSON(p, ["Manzana", "MANZANA"]);
  const seccion = obtenerDatoGeoJSON(p, ["Parcela", "PARCELA", "Seccion", "SECCION"]);
  const lote = obtenerDatoGeoJSON(p, ["Lote", "LOTE"]);
  const frente = obtenerDatoGeoJSON(p, ["Frente 1", "Frente", "FRENTE"]);
  const fondo = obtenerDatoGeoJSON(p, ["Fondo", "FONDO"]);
  const superficie = obtenerDatoGeoJSON(p, ["Superficie", "SUPERFICIE", "Sup_m2"]);
  const ficha = obtenerDatoGeoJSON(p, ["Varios 7", "VARIOS 7", "Ficha Catastral", "FICHA", "Ficha"]);

  const montoDeuda = limpiarMontoDeuda(p);
  const deudaFormateada = formatearMoneda(montoDeuda);

  const mesesAdeud = obtenerMesesDeuda(p);
  const deudaFecha = fechaDeudaGeoJSON;

  let claseEstado = "al-dia";
  let textoEstado = "AL DÍA";

  if (montoDeuda <= 0 || mesesAdeud === 0) {
    claseEstado = "al-dia";
    textoEstado = "AL DÍA";
  } else if (mesesAdeud >= 1 && mesesAdeud <= 3) {
    claseEstado = "a-vencer";
    textoEstado = "DEUDA MODERADA";
  } else {
    claseEstado = "con-deuda";
    textoEstado = "DEUDA";
  }

  const htmlContenido = `
    <p><strong>Estado TGI:</strong> <span class="badge-tgi ${claseEstado}">${textoEstado}</span></p>
    <p><strong>PARTIDA:</strong> <span>${partida}</span></p>
    <p><strong>Padrón:</strong> <span>${padron}</span></p>
    <p><strong>Tit. Nombre:</strong> <span>${titular}</span></p>
    <p><strong>DNI:</strong> <span>${dni}</span></p>
    <p><strong>Ubicación:</strong> <span>${ubicacion}</span></p>
    <p><strong>Manzana:</strong> <span>${manzana}</span></p>
    <p><strong>Sección:</strong> <span>${seccion}</span></p>
    <p><strong>Lote:</strong> <span>${lote}</span></p>
    <p><strong>Frente 1:</strong> <span>${frente}</span></p>
    <p><strong>Fondo:</strong> <span>${fondo}</span></p>
    <p><strong>Superficie:</strong> <span>${superficie}</span></p>
    <p><strong>Ficha Catastral:</strong> <span>${ficha}</span></p>
    <p><strong>Deuda TGI:</strong> <span>${deudaFormateada}</span></p>
    <p><strong>Meses Adeud.TGI:</strong> <span>${mesesAdeud}</span></p>
    <p><strong>Deuda a la Fecha:</strong> <span>${deudaFecha}</span></p>
  `;

  if (cuerpoFlotante) {
    cuerpoFlotante.innerHTML = htmlContenido;
  }
  if (panelFlotante) {
    panelFlotante.style.display = "flex";
  }
}

function cerrarFicha() {
  const panelFlotante = document.getElementById('panelFichaFlotante');
  if (panelFlotante) {
    panelFlotante.style.display = 'none';
  }
  limpiarResalteLote();
  limpiarMedidasLote();
}

// ==========================================
// 13. DESPLEGABLES SECCIONES
// ==========================================
function inicializarDesplegableSecciones(features) {
  const select = document.getElementById('selectSeccion');
  if (!select) return;
  const seccionesUnicas = [...new Set(features.map(f => String(obtenerDatoGeoJSON(f.properties, ["Parcela", "PARCELA", "Seccion", "SECCION"])).trim()))].filter(s => s !== "" && s !== "-").sort();

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

    listadoLotesFiltroActual = datosTgi.features.filter(f => String(obtenerDatoGeoJSON(f.properties, ["Parcela", "PARCELA", "Seccion", "SECCION"])).trim() === numSeccion);
    dibujarMapa(listadoLotesFiltroActual);
    if (capaTgi && capaTgi.getLayers().length > 0 && capaTgi.getBounds().isValid()) {
      map.fitBounds(capaTgi.getBounds(), { padding: [40, 40] });
    }
  };
}

// ==========================================
// 14. ESTADÍSTICAS Y GRÁFICOS (CHART.JS)
// ==========================================
window.ocultarContenedorGraficoGeneral = function() {
  const el = document.getElementById('contenedorGraficoGeneral');
  if (el) el.style.display = "none";
  if (miGraficoG) { miGraficoG.destroy(); miGraficoG = null; }
};

window.solicitarGraficoGeneral = function () {
  const contenedor = document.getElementById('contenedorGraficoGeneral');
  const leyendaFecha = document.getElementById('leyendaFechaGraficoGeneral');

  if (leyendaFecha) {
    leyendaFecha.innerText = `Deudas a la Fecha: ${fechaDeudaGeoJSON}`;
  }

  if (contenedor) {
    contenedor.style.display = "flex";
  }
  actualizarGraficoGeneral(listadoLotesFiltroActual);
};

function actualizarGraficoGeneral(features) {
  let s = 0, v = 0, d = 0;
  features.forEach(f => {
    const deu = limpiarMontoDeuda(f.properties);
    const mes = obtenerMesesDeuda(f.properties);
    if (deu <= 0 || mes === 0) s++; 
    else if (mes >= 1 && mes <= 3) v++; 
    else d++;
  });

  const total = s + v + d;

  if (miGraficoG) miGraficoG.destroy();

  const canvas = document.getElementById('graficoBarras');
  if (!canvas) return;

  miGraficoG = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Al Día (0m)', 'Deuda Moderada (1-3m)', 'Deuda (4m+)'],
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
      layout: {
        padding: { top: 10, bottom: 10, left: 10, right: 10 }
      },
      plugins: { 
        legend: { 
          position: 'bottom',
          labels: {
            boxWidth: 12,
            padding: 10,
            font: { size: 10, weight: 'bold' }
          }
        },
        datalabels: {
          color: '#ffffff',
          font: { weight: 'bold', size: 10 },
          formatter: (value) => {
            if (value <= 0) return '';
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${value}\n(${pct}%)`;
          }
        }
      }, 
      cutout: '60%' 
    }
  });
}

function generarEstadisticaCalle(features, nombre) {
  let alDia = 0, vencer = 0, deuda = 0;
  features.forEach(f => {
    const deu = limpiarMontoDeuda(f.properties);
    const mes = obtenerMesesDeuda(f.properties);
    if (deu <= 0 || mes === 0) alDia++; 
    else if (mes >= 1 && mes <= 3) vencer++; 
    else deuda++;
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
      labels: ['Al Día', 'Deuda Moderada', 'Deuda'],
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

// ==========================================
// 15. GENERADOR DE REPORTES PDF Y PLANO HORIZONTAL
// ==========================================
window.abrirVistaPreviaPDF = function (titulo, htmlContenido) {
  const modal = document.getElementById('modalVistaPreviaPDF');
  const tituloEl = document.getElementById('tituloVistaPreviaPDF');
  const cuerpoEl = document.getElementById('contenidoVistaPreviaPDF');

  if (modal && cuerpoEl) {
    if (tituloEl) tituloEl.innerText = titulo;
    cuerpoEl.innerHTML = htmlContenido;
    modal.style.display = 'flex';
  } else {
    alert("No se encontró el elemento modal 'modalVistaPreviaPDF' en el HTML.");
  }
};

window.cerrarVistaPreviaPDF = function () {
  const modal = document.getElementById('modalVistaPreviaPDF');
  if (modal) modal.style.display = 'none';
};

window.descargarDocumentoPDF = function () {
  const elemento = document.getElementById('contenidoVistaPreviaPDF');
  if (!elemento) return;

  const opciones = {
    margin:       [5, 5, 5, 5],
    filename:     'Plano_Manzana_Ubicacion.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };

  if (typeof html2pdf !== 'undefined') {
    html2pdf().set(opciones).from(elemento).save();
  } else {
    window.imprimirDocumentoPDF();
  }
};

window.imprimirDocumentoPDF = function () {
  const contenido = document.getElementById('contenidoVistaPreviaPDF').innerHTML;
  const ventanaImpresion = window.open('', '_blank', 'height=750,width=950');

  if (!ventanaImpresion) {
    window.print();
    return;
  }

  ventanaImpresion.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Plano de la Manzana / Ubicación</title>
        <style>
          @page { size: A4 landscape; margin: 8mm; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 0; margin: 0; color: #333; background: #fff; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background-color: #2c3e50; color: white; padding: 6px; font-size: 11px; text-align: left; }
          td { border: 1px solid #ddd; padding: 6px; font-size: 10px; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .salto-pagina { page-break-before: always; }
        </style>
      </head>
      <body>
        ${contenido}
      </body>
    </html>
  `);
  ventanaImpresion.document.close();
  ventanaImpresion.focus();
  setTimeout(() => {
    ventanaImpresion.print();
    ventanaImpresion.close();
  }, 500);
};

window.imprimirLotesMunicipales = function () {
  if (!datosTgi || !datosTgi.features) return alert("No hay datos cargados.");
  
  const lotesMuni = datosTgi.features.filter(f => esLoteMunicipal(f.properties));
  if (lotesMuni.length === 0) return alert("No se encontraron terrenos municipales.");
  
  lotesSeleccionadosMultiples = lotesMuni;
  imprimirLotesSeleccionados();
};

window.imprimirLotesSeleccionados = function () {
  if (typeof lotesSeleccionadosMultiples === 'undefined' || !lotesSeleccionadosMultiples || lotesSeleccionadosMultiples.length === 0) {
    return alert("No has seleccionado ningún lote en el mapa.");
  }

  const grupoEtiquetasSeleccionados = L.layerGroup();

  const htmlFilas = lotesSeleccionadosMultiples.map(f => {
    const p = f.properties || {};
    const padron = obtenerDatoGeoJSON(p, ["Padron", "PADRON", "Padronn", "PADRONN", "Contrib", "CONTRIB"]);
    const titular = obtenerDatoGeoJSON(p, ["Tit. Nombre", "TITULAR", "Titular", "Nombre", "NOMBRE"]);
    const direccion = obtenerDatoGeoJSON(p, ["Ubi. Calle", "UBI. CALLE", "Ubicacion", "UBICACION", "Direccion", "DIRECCION"]);
    const frente = obtenerDatoGeoJSON(p, ["Frente 1", "Frente", "FRENTE", "Medida_Frente", "Ancho"]);
    const superficie = obtenerDatoGeoJSON(p, ["Superficie", "SUPERFICIE", "Sup_m2", "Area"]);

    return `
      <tr>
        <td style="padding: 6px 8px; border: 1px solid #b0bec5; text-align: center; font-weight: bold; font-size: 11px;">${padron}</td>
        <td style="padding: 6px 8px; border: 1px solid #b0bec5; font-size: 11px;"><strong>${titular}</strong></td>
        <td style="padding: 6px 8px; border: 1px solid #b0bec5; font-size: 11px;">${direccion}</td>
        <td style="padding: 6px 8px; border: 1px solid #b0bec5; text-align: right; font-size: 11px;">${frente !== "-" ? frente + " m" : "-"}</td>
        <td style="padding: 6px 8px; border: 1px solid #b0bec5; text-align: right; font-size: 11px;">${superficie !== "-" ? superficie + " m²" : "-"}</td>
      </tr>
    `;
  }).join('');

  const grupoCapas = L.featureGroup(
    lotesSeleccionadosMultiples.map(f => L.geoJSON(f))
  );
  map.fitBounds(grupoCapas.getBounds(), { padding: [50, 50] });

  lotesSeleccionadosMultiples.forEach(f => {
    const p = f.properties || {};
    const padron = obtenerDatoGeoJSON(p, ["Padron", "PADRON", "Padronn", "PADRONN", "Contrib", "CONTRIB"]);

    if (!padron || padron === "-") return;

    try {
      const capaTemp = L.geoJSON(f);
      const boundsLote = capaTemp.getBounds();
      if (!boundsLote || !boundsLote.isValid()) return;

      const centro = boundsLote.getCenter();
      const nw = boundsLote.getNorthWest();
      const se = boundsLote.getSouthEast();

      const pxNW = map.latLngToLayerPoint(nw);
      const pxSE = map.latLngToLayerPoint(se);

      const anchoPx = Math.abs(pxSE.x - pxNW.x);
      const altoPx = Math.abs(pxSE.y - pxNW.y);

      const esVertical = altoPx > anchoPx;
      const largoDisponible = esVertical ? altoPx : anchoPx;
      const cortoDisponible = esVertical ? anchoPx : altoPx;

      const numChars = String(padron).length || 1;

      const fontPorLargo = (largoDisponible / numChars) * 0.8;
      const fontPorCorto = cortoDisponible * 0.7;
      const fontSizePx = Math.max(8, Math.min(20, Math.min(fontPorLargo, fontPorCorto)));

      const rotacion = esVertical ? 'transform: rotate(-90deg);' : '';

      const htmlLabel = `
        <div style="
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent !important;
          border: none !important;
        ">
          <span style="
            font-size: ${fontSizePx}px;
            font-weight: bold;
            font-family: Arial, sans-serif;
            color: #000000;
            white-space: nowrap;
            user-select: none;
            display: inline-block;
            ${rotacion}
          ">${padron}</span>
        </div>
      `;

      const iconoPadron = L.divIcon({
        className: 'etiqueta-padron-orientada',
        html: htmlLabel,
        iconSize: [anchoPx, altoPx],
        iconAnchor: [anchoPx / 2, altoPx / 2]
      });

      const markerPadron = L.marker(centro, { icon: iconoPadron, interactive: false });
      grupoEtiquetasSeleccionados.addLayer(markerPadron);
    } catch (e) {
      console.warn("Error orientando padrón para el lote:", e);
    }
  });

  grupoEtiquetasSeleccionados.addTo(map);

  modoCapturaImpresion = true;
  if (capaTgi) {
    capaTgi.eachLayer(l => capaTgi.resetStyle(l));
  }

  const mapElement = document.getElementById('map');

  if (typeof html2canvas === 'undefined') {
    modoCapturaImpresion = false;
    if (capaTgi) capaTgi.eachLayer(l => capaTgi.resetStyle(l));
    map.removeLayer(grupoEtiquetasSeleccionados);
    return alert("Falta la librería html2canvas en index.html");
  }

  setTimeout(() => {
    html2canvas(mapElement, {
      useCORS: true,
      allowTaint: false,
      logging: false,
      ignoreElements: (element) => element.classList.contains('leaflet-control-container')
    }).then(canvas => {
      const imgMapaReal = canvas.toDataURL('image/png');

      modoCapturaImpresion = false;
      if (capaTgi) {
        capaTgi.eachLayer(l => capaTgi.resetStyle(l));
      }
      map.removeLayer(grupoEtiquetasSeleccionados);

      const fechaActual = new Date();
      const fechaFormateada = `${fechaActual.getDate()}/${fechaActual.getMonth() + 1}/${fechaActual.getFullYear()}, ${String(fechaActual.getHours()).padStart(2, '0')}:${String(fechaActual.getMinutes()).padStart(2, '0')}`;

      const htmlDocumentoHorizontal = `
        <div style="font-family: Arial, sans-serif; color: #2c3e50; width: 100%; box-sizing: border-box; background: #ffffff; padding: 10px;">
          
          <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <img src="logo.png" style="height: 36px; width: auto; object-fit: contain; filter: brightness(0) invert(1);" alt="Logo" onerror="this.style.display='none'" />
                <div>
                  <h1 style="margin: 0; font-size: 16px; font-weight: bold; color: #2c3e50;">Municipalidad de Rufino</h1>
                  <h2 style="margin: 2px 0 0 0; font-size: 11px; color: #7f8c8d; font-weight: normal;">Planilla Técnica de Lotes Seleccionados</h2>
                </div>
              </div>
              <div style="text-align: right; font-size: 9px; color: #7f8c8d;">
                <div>${fechaFormateada}</div>
                <div style="margin-top: 2px;">Impresión A4 - Datos Catastrales</div>
              </div>
            </div>

            <div style="width: 100%; height: 2px; background-color: #1abc9c; margin-bottom: 12px;"></div>

            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #2c3e50; color: white;">
                  <th style="padding: 6px; border: 1px solid #2c3e50; text-align: center; font-size: 10px;">Padrón Nº</th>
                  <th style="padding: 6px; border: 1px solid #2c3e50; text-align: left; font-size: 10px;">Titular</th>
                  <th style="padding: 6px; border: 1px solid #2c3e50; text-align: left; font-size: 10px;">Dirección / Ubicación</th>
                  <th style="padding: 6px; border: 1px solid #2c3e50; text-align: right; font-size: 10px;">Frente</th>
                  <th style="padding: 6px; border: 1px solid #2c3e50; text-align: right; font-size: 10px;">Superficie</th>
                </tr>
              </thead>
              <tbody>
                ${htmlFilas}
              </tbody>
            </table>
          </div>

          <div style="page-break-before: always;"></div>

          <div style="padding-top: 5px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <img src="logo.png" style="height: 34px; width: auto; object-fit: contain; filter: brightness(0) invert(1);" alt="Logo" onerror="this.style.display='none'" />
                <div>
                  <h1 style="margin: 0; font-size: 15px; font-weight: bold; color: #2c3e50;">Plano de la Manzana / Ubicación</h1>
                  <h2 style="margin: 2px 0 0 0; font-size: 10px; color: #7f8c8d; font-weight: normal;">Vista catastral de los lotes seleccionados</h2>
                </div>
              </div>
              <div style="text-align: right; font-size: 9px; color: #7f8c8d;">
                <div>${fechaFormateada}</div>
                <div style="margin-top: 2px;">Impresión A4 Horizontal - Lotes Seleccionados</div>
              </div>
            </div>

            <div style="width: 100%; height: 2px; background-color: #1abc9c; margin: 6px 0 10px 0;"></div>

            <div style="width: 100%; border: 1px solid #bdc3c7; box-sizing: border-box; padding: 2px; background: #ffffff; text-align: center;">
              <img src="${imgMapaReal}" style="width: 100%; max-height: 160mm; object-fit: contain; display: block;" alt="Plano Catastral" />
            </div>
          </div>

        </div>
      `;

      window.abrirVistaPreviaPDF("Plano de la Manzana / Ubicación", htmlDocumentoHorizontal);
    }).catch(err => {
      modoCapturaImpresion = false;
      if (capaTgi) capaTgi.eachLayer(l => capaTgi.resetStyle(l));
      map.removeLayer(grupoEtiquetasSeleccionados);

      console.error("Error al capturar mapa:", err);
      alert("No se pudo capturar la imagen del mapa.");
    });
  }, 500);
};

// ==========================================
// 16. BÚSQUEDA BARRA SUPERIOR
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
    const titular = normalizarTexto(obtenerDatoGeoJSON(f.properties, ["Tit. Nombre", "TITULAR", "Titular", "Nombre", "NOMBRE"]));
    const padron = normalizarTexto(obtenerDatoGeoJSON(f.properties, ["Padron", "Padronn", "PADRON", "PADRONN", "Contrib", "CONTRIB"]));
    return titular.includes(busqueda) || padron.includes(busqueda);
  }).slice(0, 15);

  if (coincidentes.length === 0) {
    sugBarra.innerHTML = '<div class="item-sugerencia" style="color:#888;">Sin coincidencias</div>';
    sugBarra.style.display = 'block';
    return;
  }

  let html = '';
  coincidentes.forEach(f => {
    const titularOriginal = obtenerDatoGeoJSON(f.properties, ["Tit. Nombre", "TITULAR", "Titular", "Nombre", "NOMBRE"]);
    const padronOriginal = String(obtenerDatoGeoJSON(f.properties, ["Padron", "Padronn", "PADRON", "PADRONN", "Contrib", "CONTRIB"]));

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
// 17. ETIQUETAS DINÁMICAS DE PADRÓN POR ZOOM
// ==========================================
function actualizarEtiquetasPadron() {
  capasEtiquetasPadron.clearLayers();

  const zoomActual = map.getZoom();
  if (!mostrarPadronesBoton || zoomActual < ZOOM_MINIMO_PADRON) {
    if (map.hasLayer(capasEtiquetasPadron)) {
      map.removeLayer(capasEtiquetasPadron);
    }
    return;
  }

  if (!datosTgi || !datosTgi.features) return;

  const boundsActuales = map.getBounds();
  const listadoProcesar = (typeof listadoLotesFiltroActual !== 'undefined' && listadoLotesFiltroActual.length > 0)
    ? listadoLotesFiltroActual 
    : datosTgi.features;

  listadoProcesar.forEach(feature => {
    if (!feature || !feature.geometry) return;

    const padron = obtenerDatoGeoJSON(feature.properties, ["Padron", "Padronn", "PADRON", "PADRONN", "Contrib", "CONTRIB"]);

    if (!padron || padron === "-" || String(padron).trim() === "") return;

    try {
      const capaTemp = L.geoJSON(feature);
      const boundsLote = capaTemp.getBounds();

      if (!boundsLote || !boundsLote.isValid()) return;

      const centro = boundsLote.getCenter();

      if (boundsActuales.contains(centro)) {
        const nw = boundsLote.getNorthWest();
        const se = boundsLote.getSouthEast();

        const pxNW = map.latLngToLayerPoint(nw);
        const pxSE = map.latLngToLayerPoint(se);

        const anchoPx = Math.abs(pxSE.x - pxNW.x);
        const altoPx = Math.abs(pxSE.y - pxNW.y);

        if (anchoPx < 6 || altoPx < 6) return;

        const numCaracteres = String(padron).length;
        const ladoMenor = Math.min(anchoPx, altoPx);

        const fontSizeSegunAncho = (anchoPx / numCaracteres) * 1.1;
        const fontSizeSegunLado = ladoMenor * 0.35;

        const fontSizePx = Math.max(8, Math.min(18, Math.min(fontSizeSegunAncho, fontSizeSegunLado)));

        const htmlLabel = `
          <div style="
            width: ${anchoPx}px;
            height: ${altoPx}px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${fontSizePx}px;
            font-weight: bold;
            font-family: Arial, sans-serif;
            color: #1a252f;
            text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 0 0 4px #fff;
            white-space: nowrap;
            overflow: hidden;
            user-select: none;
            text-align: center;
            box-sizing: border-box;
            padding: 2px;
          ">
            ${padron}
          </div>
        `;

        const iconoPadron = L.divIcon({
          className: 'etiqueta-padron-mapa-limitada',
          html: htmlLabel,
          iconSize: [anchoPx, altoPx],
          iconAnchor: [anchoPx / 2, altoPx / 2]
        });

        const markerPadron = L.marker(centro, {
          icon: iconoPadron,
          interactive: false
        });

        capasEtiquetasPadron.addLayer(markerPadron);
      }
    } catch (e) {
      // Silenciar geometrías no válidas
    }
  });

  if (!map.hasLayer(capasEtiquetasPadron)) {
    map.addLayer(capasEtiquetasPadron);
  }
}

map.on('zoomend moveend resize', actualizarEtiquetasPadron);

// ==========================================
// 18. TOGGLE HERRAMIENTAS Y FILTROS
// ==========================================
window.toggleHerramientasFiltros = function () {
  const panel = document.getElementById('panelLateral') || document.querySelector('.barra-herramientas');
  const btn = document.getElementById('btnToggleFiltros');

  if (!panel) return;

  const estaOculto = panel.classList.toggle('panel-filtros-oculto');

  if (btn) {
    btn.innerHTML = estaOculto ? "👁️ Mostrar Filtros" : "👁️ Ocultar Filtros";
  }

  setTimeout(() => {
    if (typeof map !== 'undefined' && map.invalidateSize) {
      map.invalidateSize();
    }
  }, 300);
};

// ==========================================
// 19. FILTRADO, DESTACADO Y GRÁFICO DE OBRAS Y LECTURA DE AF2
// ==========================================
let obrasCargadasExcel = [];
let padronesObraSeleccionada = new Map();
let nombreObraSeleccionada = "";
let totalDeudaGeneralCSV = 0;

async function cargarObrasCSV() {
  try {
    const response = await fetch('obras tgi 06-10.csv');
    if (!response.ok) {
      console.warn("No se encontró el archivo 'obras tgi 06-10.csv'");
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];

    const celdaAF2 = sheet['AF2'];
    if (celdaAF2 && celdaAF2.v !== undefined && celdaAF2.v !== null && String(celdaAF2.v).trim() !== "") {
      if (celdaAF2.t === 'd' && celdaAF2.v instanceof Date) {
        const d = celdaAF2.v;
        fechaDeudaAF2 = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      } else {
        fechaDeudaAF2 = String(celdaAF2.v).trim();
      }
    }

    obrasCargadasExcel = XLSX.utils.sheet_to_json(sheet);
    
    if (fechaDeudaAF2 === "No especificada" && obrasCargadasExcel.length > 0) {
      const reg0 = obrasCargadasExcel[0];
      const valFecha = reg0["Deuda a la Fecha"] || reg0["deudafecha"] || reg0["DEUDA_FECHA"] || reg0.DeudaFecha;
      if (valFecha) fechaDeudaAF2 = String(valFecha).trim();
    }

    actualizarLeyendasFechaObras();

    totalDeudaGeneralCSV = obrasCargadasExcel.reduce((acc, item) => {
      const monto = limpiarMontoGenerico(item["Total Adeudado"] || item["total adeudado"] || item.TotalAdeudado);
      return acc + monto;
    }, 0);

    poblarDesplegableObras();
  } catch (error) {
    console.error("Error al procesar el CSV de obras:", error);
  }
}

function actualizarLeyendasFechaObras() {
  const elPanel = document.getElementById('fechaDeudaAF2Panel');
  const elModalInforme = document.getElementById('leyendaFechaInformeObras');
  const elModalSemaforo = document.getElementById('leyendaFechaSemaforoObras');

  if (elPanel) elPanel.innerText = fechaDeudaAF2;
  if (elModalInforme) elModalInforme.innerText = `Deudas a la Fecha: ${fechaDeudaAF2}`;
  if (elModalSemaforo) elModalSemaforo.innerText = `Deudas a la Fecha: ${fechaDeudaAF2}`;
}

function poblarDesplegableObras() {
  const select = document.getElementById('selectObraConcepto');
  if (!select) return;

  const obrasUnicas = [...new Set(obrasCargadasExcel.map(item => {
    return String(item.Concepto || item.concepto || item.CONCEPTO || "Sin Concepto").trim();
  }))].filter(c => c !== "" && c !== "Sin Concepto").sort();

  select.innerHTML = '<option value="">🚧 Seleccionar una Obra...</option>';

  obrasUnicas.forEach(obra => {
    const option = document.createElement('option');
    option.value = obra;
    option.textContent = obra;
    select.appendChild(option);
  });
}

function filtrarYMostrarObraEnMapa(conceptoSeleccionado) {
  nombreObraSeleccionada = conceptoSeleccionado;
  padronesObraSeleccionada.clear();

  const infoPanel = document.getElementById('infoObraSeleccionada');
  const cantLabel = document.getElementById('cantLotesObra');
  const montoLabel = document.getElementById('montoDeudaObra');

  if (!conceptoSeleccionado) {
    if (infoPanel) infoPanel.style.display = 'none';
    if (miGraficoO) { miGraficoO.destroy(); miGraficoO = null; }
    
    if (capaTgi) {
      capaTgi.eachLayer(l => capaTgi.resetStyle(l));
    }
    return;
  }

  const filasObra = obrasCargadasExcel.filter(item => {
    const concepto = String(item.Concepto || item.concepto || item.CONCEPTO || "").trim();
    return concepto === conceptoSeleccionado;
  });

  let deudaTotalObra = 0;
  filasObra.forEach(item => {
    const padronVal = String(item.Padron || item.PADRON || item.padron || item.Padronn || "").trim();
    if (padronVal) {
      const ctas = parseInt(item["Ctas Deuda"] || item["ctas deuda"] || item["CtasDeuda"] || item.Ctas_Deuda || 0) || 0;
      padronesObraSeleccionada.set(padronVal, ctas);
    }
    const monto = limpiarMontoGenerico(item["Total Adeudado"] || item["total adeudado"] || item.TotalAdeudado);
    deudaTotalObra += monto;
  });

  if (cantLabel) cantLabel.innerText = padronesObraSeleccionada.size;
  if (montoLabel) montoLabel.innerText = formatearMoneda(deudaTotalObra);
  if (infoPanel) infoPanel.style.display = 'block';

  destacarLotesAfectadosEnMapa();
}

function destacarLotesAfectadosEnMapa() {
  if (!capaTgi) return;

  const capasAfectadas = [];

  capaTgi.eachLayer(layer => {
    const props = layer.feature.properties || {};
    const padronGeoJSON = String(
      obtenerDatoGeoJSON(props, ["Padron", "Padronn", "PADRON", "PADRONN", "Contrib", "CONTRIB"])
    ).trim();

    if (padronesObraSeleccionada.size > 0 && padronesObraSeleccionada.has(padronGeoJSON)) {
      const ctasDeuda = padronesObraSeleccionada.get(padronGeoJSON);
      
      let colorLote = '#10b981'; // Verde (0 cuotas)
      let colorBorde = '#059669';

      if (ctasDeuda >= 1 && ctasDeuda <= 3) {
        colorLote = '#f59e0b'; // Amarillo (1 a 3 cuotas)
        colorBorde = '#d97706';
      } else if (ctasDeuda >= 4) {
        colorLote = '#ef4444'; // Rojo (4 o más cuotas)
        colorBorde = '#dc2626';
      }

      layer.setStyle({
        color: colorBorde,
        fillColor: colorLote,
        weight: 1.5,
        fillOpacity: 0.85
      });
      capasAfectadas.push(layer);
    } else if (padronesObraSeleccionada.size > 0) {
      layer.setStyle({
        color: 'transparent',
        fillColor: 'transparent',
        weight: 0,
        fillOpacity: 0
      });
    } else {
      capaTgi.resetStyle(layer);
    }
  });

  if (capasAfectadas.length > 0) {
    const grupoAfectados = L.featureGroup(capasAfectadas);
    map.fitBounds(grupoAfectados.getBounds(), { padding: [50, 50], maxZoom: 18 });
  } else if (nombreObraSeleccionada !== "") {
    alert(`No se encontraron parcelas en la cartografía para la obra: "${nombreObraSeleccionada}"`);
  }
}

// ==========================================
// 20. INFORME DETALLADO Y GRÁFICO SEMÁFORO DE OBRAS
// ==========================================

function obtenerFilasObraActuales() {
  if (!nombreObraSeleccionada) {
    return obrasCargadasExcel;
  }
  return obrasCargadasExcel.filter(item => {
    const concepto = String(item.Concepto || item.concepto || item.CONCEPTO || "").trim();
    return concepto === nombreObraSeleccionada;
  });
}

// A. INFORME DETALLADO EN TABLA
window.abrirInformeObrasModal = function() {
  const modal = document.getElementById('modalInformeObras');
  const subtitulo = document.getElementById('subtituloObraInforme');
  const resumen = document.getElementById('resumenTotalesInforme');
  const cuerpoTabla = document.getElementById('cuerpoTablaInformeObras');

  const filas = obtenerFilasObraActuales();

  if (subtitulo) {
    subtitulo.innerText = nombreObraSeleccionada 
      ? `Obra Seleccionada: ${nombreObraSeleccionada}` 
      : "Listado Completo de Obras";
  }

  let totalAcumulado = 0;
  let totalCtasDeuda = 0;

  let htmlFilas = "";
  filas.forEach(item => {
    const padron = item.Padron || item.PADRON || item.padron || item.Padronn || "-";
    const titular = item.Titular || item.TITULAR || item.titular || item["Tit. Nombre"] || "Sin Especificar";
    const concepto = item.Concepto || item.concepto || item.CONCEPTO || "-";
    const ctasTotales = item["Ctas Totales"] || item["ctas totales"] || item.CtasTotales || item.Ctas_Totales || 0;
    const ctasDeuda = parseInt(item["Ctas Deuda"] || item["ctas deuda"] || item.CtasDeuda || item.Ctas_Deuda || 0) || 0;
    const monto = limpiarMontoGenerico(item["Total Adeudado"] || item["total adeudado"] || item.TotalAdeudado);

    totalAcumulado += monto;
    totalCtasDeuda += ctasDeuda;

    let badgeSem = '<span class="badge-semaforo sem-verde">AL DÍA</span>';
    if (ctasDeuda >= 1 && ctasDeuda <= 3) {
      badgeSem = '<span class="badge-semaforo sem-amarillo">DEUDA MODERADA</span>';
    } else if (ctasDeuda >= 4) {
      badgeSem = '<span class="badge-semaforo sem-rojo">DEUDA</span>';
    }

    htmlFilas += `
      <tr onclick="seleccionarLotePorPadron('${escaparHTML(padron)}')">
        <td><strong>${padron}</strong></td>
        <td>${titular}</td>
        <td>${concepto}</td>
        <td style="text-align: center;">${ctasTotales}</td>
        <td style="text-align: center; font-weight: bold; color: ${ctasDeuda > 0 ? '#ef4444' : '#10b981'};">${ctasDeuda}</td>
        <td style="text-align: center;">${badgeSem}</td>
        <td style="text-align: right; font-weight: bold;">${formatearMoneda(monto)}</td>
      </tr>
    `;
  });

  if (cuerpoTabla) cuerpoTabla.innerHTML = htmlFilas || '<tr><td colspan="7" style="text-align:center;">No hay registros</td></tr>';
  if (resumen) {
    resumen.innerText = `Lotes: ${filas.length} | Ctas Deuda: ${totalCtasDeuda} | Total: ${formatearMoneda(totalAcumulado)}`;
  }

  actualizarLeyendasFechaObras();

  if (modal) modal.style.display = 'flex';
};

window.cerrarInformeObrasModal = function() {
  const modal = document.getElementById('modalInformeObras');
  if (modal) modal.style.display = 'none';
};

window.filtrarTablaInformeObras = function(busqueda) {
  const inputNorm = normalizarTexto(busqueda);
  const filas = document.querySelectorAll('#cuerpoTablaInformeObras tr');

  filas.forEach(fila => {
    const textoFila = normalizarTexto(fila.innerText);
    fila.style.display = textoFila.includes(inputNorm) ? '' : 'none';
  });
};

window.imprimirInformeObras = function() {
  const contenido = document.getElementById('modalInformeObras').innerHTML;
  const ventanaImpresion = window.open('', '_blank', 'height=800,width=1000');
  
  if (!ventanaImpresion) return alert("Permita las ventanas emergentes.");

  ventanaImpresion.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Informe de Deuda de Obras</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
          th { background-color: #1e293b; color: white; padding: 8px; text-align: left; }
          td { border: 1px solid #ccc; padding: 6px; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .badge-semaforo { padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; color: white; }
          .sem-verde { background: #10b981; }
          .sem-amarillo { background: #f59e0b; color: #333; }
          .sem-rojo { background: #ef4444; }
          .modal-pdf-acciones, #filtroTablaInforme { display: none !important; }
        </style>
      </head>
      <body>
        ${contenido}
      </body>
    </html>
  `);
  ventanaImpresion.document.close();
  ventanaImpresion.focus();
  setTimeout(() => {
    ventanaImpresion.print();
    ventanaImpresion.close();
  }, 500);
};

// B. GRÁFICO SEMÁFORO COMPACTO Y ELEGANTE
window.abrirGraficoEstadoDeudaSemaforoModal = function() {
  const modal = document.getElementById('modalSemaforoObras');
  const subtitulo = document.getElementById('subtituloSemaforo');

  if (subtitulo) {
    subtitulo.innerText = nombreObraSeleccionada 
      ? `Estado Semáforo: ${nombreObraSeleccionada}` 
      : "Estado Semáforo: Todas las Obras";
  }

  const filas = obtenerFilasObraActuales();

  let verdeCant = 0, verdeMonto = 0;
  let amarilloCant = 0, amarilloMonto = 0;
  let rojoCant = 0, rojoMonto = 0;

  filas.forEach(item => {
    const ctasDeuda = parseInt(item["Ctas Deuda"] || item["ctas deuda"] || item.CtasDeuda || item.Ctas_Deuda || 0) || 0;
    const monto = limpiarMontoGenerico(item["Total Adeudado"] || item["total adeudado"] || item.TotalAdeudado);

    if (ctasDeuda === 0) {
      verdeCant++;
      verdeMonto += monto;
    } else if (ctasDeuda >= 1 && ctasDeuda <= 3) {
      amarilloCant++;
      amarilloMonto += monto;
    } else {
      rojoCant++;
      rojoMonto += monto;
    }
  });

  document.getElementById('semCantVerde').innerText = verdeCant;
  document.getElementById('semMontoVerde').innerText = formatearMoneda(verdeMonto);

  document.getElementById('semCantAmarillo').innerText = amarilloCant;
  document.getElementById('semMontoAmarillo').innerText = formatearMoneda(amarilloMonto);

  document.getElementById('semCantRojo').innerText = rojoCant;
  document.getElementById('semMontoRojo').innerText = formatearMoneda(rojoMonto);

  actualizarLeyendasFechaObras();

  if (miGraficoSemaforo) miGraficoSemaforo.destroy();

  const canvas = document.getElementById('canvasGraficoSemaforo');
  if (canvas) {
    miGraficoSemaforo = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Al Día (0 ctas)', 'Deuda Moderada (1-3 ctas)', 'Deuda (≥4 ctas)'],
        datasets: [{
          data: [verdeCant, amarilloCant, rojoCant],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderColor: '#ffffff',
          borderWidth: 2,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 10, weight: '600' }, padding: 12 }
          },
          datalabels: {
            color: '#ffffff',
            font: { weight: 'bold', size: 11 },
            formatter: (val) => val > 0 ? val : ''
          }
        }
      }
    });
  }

  if (modal) modal.style.display = 'flex';
};

window.cerrarSemaforoObrasModal = function() {
  const modal = document.getElementById('modalSemaforoObras');
  if (modal) modal.style.display = 'none';
};

// Inicialización general
cargarDatos();
cargarObrasCSV();