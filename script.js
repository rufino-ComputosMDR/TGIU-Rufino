// 1. CONTROL DE ACCESO
const CLAVE_CORRECTA = "Rufino2026"; 
if (sessionStorage.getItem("acceso_tgi") !== "concedido") {
    let intento = prompt("Clave de acceso:");
    if (intento === CLAVE_CORRECTA) { sessionStorage.setItem("acceso_tgi", "concedido"); } 
    else { alert("Denegado"); document.body.innerHTML = "Denegado"; throw new Error(); }
}

const map = L.map('map').setView([-34.268, -62.712], 15);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);

let datosTgi, capaTgi, miGraficoG, miGraficoC;

// Helper para buscar propiedades sin importar mayúsculas/minúsculas
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

// 2. CARGA DE DATOS
async function cargarDatos() {
    try {
        const resM = await fetch('manzanas.geojson');
        const dataM = await resM.json();
        L.geoJSON(dataM, { style: { color: '#ccc', weight: 1, fillOpacity: 0.05 } }).addTo(map);

        const resT = await fetch('tgi.geojson');
        datosTgi = await resT.json();
        dibujarMapa(datosTgi.features);
        actualizarGraficoGeneral(datosTgi.features);
    } catch (e) { console.error("Error cargando archivos:", e); }
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

// 3. FILTRADO CON LÓGICA DE CALLE LIMPIA
function filtrarTodo() {
    const apellido = document.getElementById('inputApellido').value.toLowerCase();
    const calleInput = document.getElementById('inputCalle').value.toLowerCase();
    const sugApp = document.getElementById('listaSugerencias');
    const sugCalle = document.getElementById('listaSugerenciasCalle');

    const filtrados = datosTgi.features.filter(f => {
        const nom = (buscarProp(f.properties, "Tit. Nombre") || "").toLowerCase();
        const part = String(buscarProp(f.properties, "PARTIDA") || "").toLowerCase();
        const dom = (buscarProp(f.properties, "Domicilio") || buscarProp(f.properties, "Calle") || "").toLowerCase();
        return (nom.includes(apellido) || part.includes(apellido)) && dom.includes(calleInput);
    });

    dibujarMapa(filtrados);

    // Sugerencias de Calle (Limpiando números de altura)
    if (calleInput.length >= 2) {
        let callesLimpias = datosTgi.features.map(f => {
            let texto = (buscarProp(f.properties, "Domicilio") || buscarProp(f.properties, "Calle") || "");
            // Quitamos números y espacios extras para obtener solo el nombre de la calle
            return texto.replace(/\d+/g, '').trim(); 
        });

        let sugerenciasUnicas = [...new Set(callesLimpias)]
            .filter(c => c.toLowerCase().includes(calleInput))
            .sort()
            .slice(0, 8);

        let htmlC = "";
        sugerenciasUnicas.forEach(c => { 
            htmlC += `<div class="item-sugerencia" onclick="seleccionarCalle('${c}')">🛣️ ${c}</div>`; 
        });
        sugCalle.innerHTML = htmlC; sugCalle.style.display = htmlC ? "block" : "none";
    } else { 
        sugCalle.style.display = "none";
        document.getElementById('panelEstadisticaCalle').style.display = "none";
    }

    // Sugerencias Apellido
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

// 4. ACCIONES DE SELECCIÓN
window.seleccionarCalle = function(nombreCalleLimpia) {
    document.getElementById('inputCalle').value = nombreCalleLimpia;
    document.getElementById('listaSugerenciasCalle').style.display = "none";
    
    // Filtramos por coincidencia de texto (ignorando alturas)
    const lotesCalle = datosTgi.features.filter(f => {
        const dom = (buscarProp(f.properties, "Domicilio") || buscarProp(f.properties, "Calle") || "").toLowerCase();
        return dom.includes(nombreCalleLimpia.toLowerCase());
    });

    dibujarMapa(lotesCalle);
    capaTgi.eachLayer(l => {
        l.bringToFront();
        if (l._path) l._path.classList.add('lote-calle-resaltada');
    });

    if (capaTgi.getLayers().length > 0) map.fitBounds(capaTgi.getBounds(), { padding: [30, 30] });

    generarEstadisticaCalle(lotesCalle, nombreCalleLimpia);
};

function generarEstadisticaCalle(features, nombre) {
    let alDia=0, vencer=0, deuda=0;
    features.forEach(f => {
        const deu = parseFloat(String(buscarProp(f.properties, "Deuda TGI")).replace(',', '.')) || 0;
        const mes = parseInt(buscarProp(f.properties, "Meses Adeud")) || 0;
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
        data: {
            datasets: [{ data: [alDia, vencer, deuda], backgroundColor: ['#2ecc71', '#f1c40f', '#e74c3c'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false }, cutout: '65%' }
    });
}

// 5. UTILIDADES DE PANELES
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
        const deu = parseFloat(String(buscarProp(f.properties, "Deuda TGI")).replace(',', '.')) || 0;
        const mes = parseInt(buscarProp(f.properties, "Meses Adeud")) || 0;
        if (deu <= 0) s++; else if (mes === 1) v++; else d++;
    });
    if (miGraficoG) miGraficoG.destroy();
    miGraficoG = new Chart(document.getElementById('graficoBarras'), {
        type: 'bar',
        data: {
            labels: ['Al Día', 'A Vencer', 'Deuda'],
            datasets: [{ data: [s, v, d], backgroundColor: ['#bdc3c7', '#f1c40f', '#e74c3c'], borderRadius: 4 }]
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
                <h3 style="font-size:11px; margin-bottom:10px; color:#3498db;">DETALLE DEL LOTE</h3>
                <p><span class="etiqueta">Estado:</span> <span class="valor">${est}</span></p>`;
    for (let k in p) { html += `<p><span class="etiqueta">${k}:</span> <span class="valor">${p[k] || '-'}</span></p>`; }
    div.innerHTML = html; div.style.display = "block";
}

window.cerrarFicha = () => { document.getElementById('contenidoFicha').style.display = "none"; };

cargarDatos();