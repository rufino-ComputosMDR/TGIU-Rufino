// [ACCESO Y MAPA IGUAL QUE ANTES...]
const CLAVE_CORRECTA = "Rufino2026"; 
if (sessionStorage.getItem("acceso_tgi") !== "concedido") {
    let intento = prompt("Clave de acceso:");
    if (intento === CLAVE_CORRECTA) { sessionStorage.setItem("acceso_tgi", "concedido"); } 
    else { alert("Denegado"); document.body.innerHTML = "Denegado"; throw new Error(); }
}

const map = L.map('map').setView([-34.268, -62.712], 15);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);

let datosTgi, capaTgi, miGraficoG, miGraficoC;

function buscarProp(obj, texto) {
    for (let k in obj) { if (k.toLowerCase().includes(texto.toLowerCase())) return obj[k]; }
    return "";
}

function estiloLote(f) {
    const deu = parseFloat(String(buscarProp(f.properties, "Deuda TGI")).replace(',', '.')) || 0;
    const mes = parseInt(buscarProp(f.properties, "Meses Adeud")) || 0;
    if (deu <= 0) return { color: "#aaa", weight: 0.5, fillOpacity: 0.1 };
    let col = (mes === 1) ? '#f1c40f' : '#e74c3c';
    return { color: col, fillColor: col, weight: 1, fillOpacity: 0.6 };
}

// 3. CARGA DE DATOS
async function cargarDatos() {
    try {
        const resM = await fetch('manzanas.geojson');
        const dataM = await resM.json();
        L.geoJSON(dataM, { style: { color: '#ccc', weight: 1, fillOpacity: 0.05 } }).addTo(map);
        const resT = await fetch('tgi.geojson');
        datosTgi = await resT.json();
        dibujarMapa(datosTgi.features);
        actualizarGraficoGeneral(datosTgi.features);
    } catch (e) { console.error(e); }
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

// 4. FILTRADO Y RESALTADO
function filtrarTodo() {
    const apellido = document.getElementById('inputApellido').value.toLowerCase();
    const calle = document.getElementById('inputCalle').value.toLowerCase();
    const sugApp = document.getElementById('listaSugerencias');
    const sugCalle = document.getElementById('listaSugerenciasCalle');

    const filtrados = datosTgi.features.filter(f => {
        const nom = (buscarProp(f.properties, "Tit. Nombre") || "").toLowerCase();
        const part = String(buscarProp(f.properties, "PARTIDA") || "").toLowerCase();
        const dom = (buscarProp(f.properties, "Domicilio") || buscarProp(f.properties, "Calle") || "").toLowerCase();
        return (nom.includes(apellido) || part.includes(apellido)) && dom.includes(calle);
    });

    dibujarMapa(filtrados);

    if (calle.length >= 3) {
        capaTgi.eachLayer(l => {
            const d = (buscarProp(l.feature.properties, "Domicilio") || buscarProp(l.feature.properties, "Calle") || "").toLowerCase();
            if (d.includes(calle)) {
                l.bringToFront();
                if (l._path) l._path.classList.add('lote-calle-resaltada');
            }
        });
    }

    // Sugerencias Calle
    if (calle.length >= 2) {
        let callesUnicas = [...new Set(datosTgi.features
            .map(f => buscarProp(f.properties, "Domicilio") || buscarProp(f.properties, "Calle"))
            .filter(c => c && c.toLowerCase().includes(calle))
        )].sort().slice(0, 8);
        let htmlC = "";
        callesUnicas.forEach(c => { htmlC += `<div class="item-sugerencia" onclick="seleccionarCalle('${c}')">🛣️ ${c}</div>`; });
        sugCalle.innerHTML = htmlC; sugCalle.style.display = htmlC ? "block" : "none";
    } else { 
        sugCalle.style.display = "none"; 
        document.getElementById('panelEstadisticaCalle').style.display = "none";
    }

    // [SUGERENCIAS APELLIDO IGUAL QUE ANTES...]
    if (apellido.length >= 2) {
        let html = "";
        filtrados.slice(0, 10).forEach(f => {
            const n = buscarProp(f.properties, "Tit. Nombre");
            const p = buscarProp(f.properties, "PARTIDA");
            html += `<div class="item-sugerencia" onclick="seleccionarLote('${p}')"><strong>${n}</strong><br><small>P: ${p}</small></div>`;
        });
        sugApp.innerHTML = html; sugApp.style.display = html ? "block" : "none";
    } else { sugApp.style.display = "none"; }
}

document.getElementById('inputApellido').oninput = filtrarTodo;
document.getElementById('inputCalle').oninput = filtrarTodo;

// 5. FUNCIONES DE SELECCIÓN Y NUEVA ESTADÍSTICA DE CALLE
window.seleccionarCalle = function(nombreCalle) {
    document.getElementById('inputCalle').value = nombreCalle;
    document.getElementById('listaSugerenciasCalle').style.display = "none";
    filtrarTodo();
    
    // Filtrar datos SOLO de esta calle para la estadística
    const lotesCalle = datosTgi.features.filter(f => {
        const d = (buscarProp(f.properties, "Domicilio") || buscarProp(l.feature.properties, "Calle") || "").toLowerCase();
        return d.includes(nombreCalle.toLowerCase());
    });

    generarEstadisticaCalle(lotesCalle, nombreCalle);

    const capasDeCalle = [];
    capaTgi.eachLayer(l => {
        const d = (buscarProp(l.feature.properties, "Domicilio") || buscarProp(l.feature.properties, "Calle") || "").toLowerCase();
        if (d.includes(nombreCalle.toLowerCase())) capasDeCalle.push(l);
    });
    if (capasDeCalle.length > 0) map.fitBounds(L.featureGroup(capasDeCalle).getBounds());
};

function generarEstadisticaCalle(features, nombre) {
    let s=0, v=0, d=0;
    features.forEach(f => {
        const deu = parseFloat(String(buscarProp(f.properties, "Deuda TGI")).replace(',', '.')) || 0;
        const mes = parseInt(buscarProp(f.properties, "Meses Adeud")) || 0;
        if (deu <= 0) s++; else if (mes === 1) v++; else d++;
    });

    const total = features.length;
    const pD = ((d/total)*100).toFixed(1);
    const pV = ((v/total)*100).toFixed(1);
    const pS = ((s/total)*100).toFixed(1);

    const panel = document.getElementById('panelEstadisticaCalle');
    panel.style.display = "block";
    document.getElementById('statsCalleContenido').innerHTML = `
        <p style="font-size:10px; margin:5px 0;"><strong>${nombre}</strong> (${total} lotes)</p>
        <span class="etiqueta-porcentaje">AL DÍA: ${pS}%</span>
        <div class="barra-progreso"><div class="progreso-llenado" style="width:${pS}%; background:#bdc3c7;"></div></div>
        <span class="etiqueta-porcentaje">DEUDA: ${pD}%</span>
        <div class="barra-progreso"><div class="progreso-llenado" style="width:${pD}%; background:#e74c3c;"></div></div>
    `;

    if (miGraficoC) miGraficoC.destroy();
    miGraficoC = new Chart(document.getElementById('graficoCalle'), {
        type: 'doughnut',
        data: {
            datasets: [{ data: [s, v, d], backgroundColor: ['#bdc3c7', '#f1c40f', '#e74c3c'] }]
        },
        options: { plugins: { legend: false }, cutout: '70%' }
    });
}

// 6. TOGGLE PANEL DERECHO
window.togglePanelDerecho = function() {
    const cuerpo = document.getElementById('cuerpoD');
    const btn = document.getElementById('btnT');
    if (cuerpo.style.display === "none") {
        cuerpo.style.display = "block";
        btn.innerText = "➖";
    } else {
        cuerpo.style.display = "none";
        btn.innerText = "➕";
    }
};

// [RESTO DE FUNCIONES SELECCIONAR LOTE, GRAFICO GENERAL Y FICHA IGUAL...]
function actualizarGraficoGeneral(features) {
    let s=0, v=0, d=0;
    features.forEach(f => {
        const deu = parseFloat(String(buscarProp(f.properties, "Deuda TGI")).replace(',', '.')) || 0;
        const mes = parseInt(buscarProp(f.properties, "Meses Adeud")) || 0;
        if (deu <= 0) s++; else if (mes === 1) v++; else d++;
    });
    if (miGraficoG) miGraficoG.destroy();
    miGraficoG = new Chart(document.getElementById('graficoBarras'), {
        type: 'bar',
        data: {
            labels: ['Al Día', 'A Vencer', 'Deuda'],
            datasets: [{ data: [s, v, d], backgroundColor: ['#bdc3c7', '#f1c40f', '#e74c3c'] }]
        },
        options: { indexAxis: 'y', plugins: { legend: false }, maintainAspectRatio: false }
    });
}

window.seleccionarLote = function(partida) {
    const lote = datosTgi.features.find(f => String(buscarProp(f.properties, "PARTIDA")) === String(partida));
    if (lote) {
        document.getElementById('listaSugerencias').style.display = "none";
        document.getElementById('inputApellido').value = buscarProp(lote.properties, "Tit. Nombre");
        map.fitBounds(L.geoJSON(lote).getBounds(), { maxZoom: 19 });
        mostrarFicha(lote.properties);
        capaTgi.eachLayer(l => {
            if (String(buscarProp(l.feature.properties, "PARTIDA")) === String(partida)) {
                l.bringToFront();
                const el = l._path;
                if (el) { el.classList.remove('lote-parpadeando'); void el.offsetWidth; el.classList.add('lote-parpadeando'); }
            }
        });
    }
};

function mostrarFicha(p) {
    const div = document.getElementById('contenidoFicha');
    const d = parseFloat(String(buscarProp(p, "Deuda TGI")).replace(',', '.')) || 0;
    const m = parseInt(buscarProp(p, "Meses Adeud")) || 0;
    let est = (d > 0) ? (m === 1 ? '<span class="vencer">A VENCER</span>' : '<span class="deuda">DEUDA</span>') : 'AL DÍA';
    let html = `<button class="btn-cerrar-ficha" onclick="cerrarFicha()">×</button>
                <h3 style="font-size:12px; margin:0;">DETALLE</h3>
                <p><span class="etiqueta">Estado:</span> <span class="valor">${est}</span></p>`;
    for (let k in p) { html += `<p><span class="etiqueta">${k}:</span> <span class="valor">${p[k] || '-'}</span></p>`; }
    div.innerHTML = html; div.style.display = "block";
}
window.cerrarFicha = () => { document.getElementById('contenidoFicha').style.display = "none"; };
cargarDatos();