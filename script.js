// 1. ACCESO
const CLAVE_CORRECTA = "Rufino2026"; 
if (sessionStorage.getItem("acceso_tgi") !== "concedido") {
    let intento = prompt("Clave de acceso:");
    if (intento === CLAVE_CORRECTA) { sessionStorage.setItem("acceso_tgi", "concedido"); } 
    else { alert("Denegado"); document.body.innerHTML = "Denegado"; throw new Error(); }
}

// 2. MAPA
const map = L.map('map').setView([-34.268, -62.712], 15);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);

let datosTgi, capaTgi, miGrafico;

function buscarProp(obj, texto) {
    for (let k in obj) { if (k.toLowerCase().includes(texto.toLowerCase())) return obj[k]; }
    return "";
}

function estiloLote(f) {
    const deu = parseFloat(String(buscarProp(f.properties, "Deuda TGI")).replace(',', '.')) || 0;
    const mes = parseInt(buscarProp(f.properties, "Meses Adeud")) || 0;
    if (deu <= 0) return { color: "#aaa", weight: 0.5, fillOpacity: 0 };
    let col = (mes === 1) ? '#f1c40f' : '#e74c3c';
    return { color: col, fillColor: col, weight: 1, fillOpacity: 0.6 };
}

// 3. DATOS
async function cargarDatos() {
    try {
        const resM = await fetch('manzanas.geojson');
        const dataM = await resM.json();
        L.geoJSON(dataM, { style: { color: '#ccc', weight: 1, fillOpacity: 0.05 } }).addTo(map);

        const resT = await fetch('tgi.geojson');
        datosTgi = await resT.json();
        dibujarMapa(datosTgi.features);
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

// 4. BUSCADOR
document.getElementById('inputApellido').oninput = function(e) {
    const term = e.target.value;
    const termL = term.toLowerCase();
    const sug = document.getElementById('listaSugerencias');
    
    if (termL.length < 2) {
        sug.innerHTML = ""; sug.style.display = "none";
        dibujarMapa(datosTgi.features); return;
    }

    const filtrados = datosTgi.features.filter(f => {
        const nom = (buscarProp(f.properties, "Tit. Nombre") || "").toLowerCase();
        const part = String(buscarProp(f.properties, "PARTIDA") || "").toLowerCase();
        return nom.includes(termL) || part.includes(termL);
    });

    dibujarMapa(filtrados);

    function resaltar(texto, busq) {
        const reg = new RegExp(`(${busq})`, 'gi');
        return String(texto).replace(reg, '<span class="resaltado">$1</span>');
    }

    let html = "";
    filtrados.slice(0, 10).forEach(f => {
        const n = buscarProp(f.properties, "Tit. Nombre");
        const p = buscarProp(f.properties, "PARTIDA");
        html += `<div class="item-sugerencia" onclick="seleccionarLote('${p}')">
                    <strong>${resaltar(n, term)}</strong><br><small>Partida: ${resaltar(p, term)}</small>
                 </div>`;
    });
    sug.innerHTML = html;
    sug.style.display = html ? "block" : "none";
};

// 5. SELECCIÓN Y PARPADEO
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
                if (el) {
                    el.classList.remove('lote-parpadeando');
                    void el.offsetWidth; 
                    el.classList.add('lote-parpadeando');
                    setTimeout(() => el.classList.remove('lote-parpadeando'), 3000);
                }
            }
        });
    }
};

// 6. ESTADÍSTICAS GENERALES
document.getElementById('btnToggleStats').onclick = function() {
    const area = document.getElementById('areaGrafico');
    area.style.display = (area.style.display === "none" || area.style.display === "") ? "block" : "none";
    this.innerText = (area.style.display === "block") ? "✖ Cerrar Estadísticas" : "📊 Ver Estadísticas";
    if (area.style.display === "block") actualizarGrafico(datosTgi.features);
};

function actualizarGrafico(features) {
    let s=0, v=0, d=0;
    features.forEach(f => {
        const p = f.properties;
        const deu = parseFloat(String(buscarProp(p, "Deuda TGI")).replace(',', '.')) || 0;
        const mes = parseInt(buscarProp(p, "Meses Adeud")) || 0;
        if (deu <= 0) s++;
        else if (mes === 1) v++;
        else d++;
    });

    if (miGrafico) miGrafico.destroy();
    miGrafico = new Chart(document.getElementById('graficoBarras'), {
        type: 'bar',
        data: {
            labels: ['Al Día', 'A Vencer', 'Deuda'],
            datasets: [{ data: [s, v, d], backgroundColor: ['#bdc3c7', '#f1c40f', '#e74c3c'] }]
        },
        options: { indexAxis: 'y', plugins: { legend: false } }
    });
}

// 7. FICHA
function mostrarFicha(p) {
    const div = document.getElementById('contenidoFicha');
    const d = parseFloat(String(buscarProp(p, "Deuda TGI")).replace(',', '.')) || 0;
    const m = parseInt(buscarProp(p, "Meses Adeud")) || 0;
    let est = (d > 0) ? (m === 1 ? '<span class="vencer">A VENCER</span>' : '<span class="deuda">DEUDA</span>') : 'AL DÍA';
    let html = `<button class="btn-cerrar-ficha" onclick="cerrarFicha()">×</button>
                <h3 style="font-size:13px; margin:0 0 10px 0;">Detalle</h3>
                <p><span class="etiqueta">Estado:</span> <span class="valor">${est}</span></p>`;
    for (let k in p) { html += `<p><span class="etiqueta">${k}:</span> <span class="valor">${p[k] || '-'}</span></p>`; }
    div.innerHTML = html; div.style.display = "block";
}
window.cerrarFicha = () => { document.getElementById('contenidoFicha').style.display = "none"; };

cargarDatos();