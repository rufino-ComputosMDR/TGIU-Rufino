// 1. INICIALIZACIÓN INMEDIATA DEL MAPA
const map = L.map('map').setView([-34.268, -62.712], 15);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '©OpenStreetMap'
}).addTo(map);

let datosTgi, capaTgi, miGrafico;

// 2. BUSCADOR DE CAMPOS (MÁS TOLERANTE)
function buscarProp(obj, texto) {
    for (let k in obj) {
        if (k.toLowerCase().includes(texto.toLowerCase())) return obj[k];
    }
    return 0;
}

// 3. ESTILO DE LOS LOTES
function estiloLote(f) {
    const dRaw = buscarProp(f.properties, "Deuda TGI");
    const mRaw = buscarProp(f.properties, "Meses Adeud");

    const deuda = parseFloat(String(dRaw).replace(',', '.')) || 0;
    const meses = parseInt(mRaw) || 0;

    // Si no hay deuda, transparente
    if (deuda <= 0) return { color: "#aaa", weight: 0.5, fillOpacity: 0 };

    // Semáforo: 1 mes Amarillo, 2 o más Rojo
    let color = (meses === 1) ? '#f1c40f' : '#e74c3c';

    return {
        color: color,
        fillColor: color,
        weight: 1,
        fillOpacity: 0.6
    };
}

// 4. CARGA DE DATOS
async function cargarTodo() {
    try {
        // Cargar manzanas (fondo gris)
        const resM = await fetch('manzanas.geojson');
        const dataM = await resM.json();
        L.geoJSON(dataM, { 
            style: { color: '#ccc', weight: 1, fillOpacity: 0.05 },
            interactive: false 
        }).addTo(map);

        // Cargar TGI (lotes con deuda)
        const resT = await fetch('tgi.geojson');
        datosTgi = await resT.json();

        console.log("Datos cargados correctamente");
        dibujarMapa(datosTgi.features);

    } catch (error) {
        console.error("Error crítico de carga:", error);
        alert("Error al cargar los archivos .geojson. Verifique que estén en la misma carpeta.");
    }
}

function dibujarMapa(features) {
    if (capaTgi) map.removeLayer(capaTgi);
    capaTgi = L.geoJSON({type: "FeatureCollection", features: features}, {
        style: estiloLote,
        onEachFeature: (f, l) => {
            l.on('click', () => mostrarFicha(f.properties));
        }
    }).addTo(map);
}

// 5. FICHA DE DATOS (CON CIERRE)
function mostrarFicha(p) {
    const div = document.getElementById('contenidoFicha');
    const d = parseFloat(String(buscarProp(p, "Deuda TGI")).replace(',', '.')) || 0;
    const m = parseInt(buscarProp(p, "Meses Adeud")) || 0;

    let estado = 'AL DÍA';
    if (d > 0) {
        estado = (m === 1) ? '<span class="vencer">A VENCER</span>' : '<span class="deuda">DEUDA</span>';
    }

    let tabla = `
        <button class="btn-cerrar-ficha" onclick="cerrarFicha()">×</button>
        <h3 style="margin:0 0 10px 0; font-size:14px;">Detalle de Lote</h3>
        <p><span class="etiqueta">Estado:</span> ${estado}</p>
    `;

    for (let k in p) {
        tabla += `<p><span class="etiqueta">${k}:</span> <span class="valor">${p[k] || '-'}</span></p>`;
    }

    div.innerHTML = tabla;
    div.style.display = "block";
}

window.cerrarFicha = function() {
    document.getElementById('contenidoFicha').style.display = "none";
};

// 6. ESTADÍSTICAS Y BUSCADOR
document.getElementById('btnToggleStats').onclick = function() {
    const area = document.getElementById('areaGrafico');
    if (area.style.display === "none" || area.style.display === "") {
        area.style.display = "block";
        this.innerText = "✖ Cerrar Estadísticas";
        actualizarGrafico(datosTgi.features);
    } else {
        area.style.display = "none";
        this.innerText = "📊 Ver Estadísticas";
    }
};

function actualizarGrafico(features) {
    let s = 0, v = 0, d = 0;
    features.forEach(f => {
        const deu = parseFloat(String(buscarProp(f.properties, "Deuda TGI")).replace(',', '.')) || 0;
        const mes = parseInt(buscarProp(f.properties, "Meses Adeud")) || 0;
        if (deu <= 0) s++; else if (mes === 1) v++; else d++;
    });

    if (miGrafico) miGrafico.destroy();
    const ctx = document.getElementById('graficoBarras').getContext('2d');
    miGrafico = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Al Día', 'A Vencer', 'Deuda'],
            datasets: [{
                data: [s, v, d],
                backgroundColor: ['#bdc3c7', '#f1c40f', '#e74c3c']
            }]
        },
        options: { indexAxis: 'y', plugins: { legend: false } }
    });
}

document.getElementById('inputApellido').oninput = function(e) {
    const term = e.target.value.toLowerCase();
    const filtrados = datosTgi.features.filter(f => {
        const nom = (buscarProp(f.properties, "Tit. Nombre") || "").toLowerCase();
        const part = String(buscarProp(f.properties, "PARTIDA") || "").toLowerCase();
        return nom.includes(term) || part.includes(term);
    });
    dibujarMapa(filtrados);
};

// INICIAR
cargarTodo();