let datosExcelRaw = [];
let datosExcel = [];       // Todos los registros
let datosFiltrados = [];   // Registros filtrados por año
let nombresColumnas = [];
let filaActual = 0;

let datosLegajosRaw = [];
let agentesPendientes = [];

function col2idx(colStr) {
  let str = colStr.toUpperCase();
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    sum *= 26;
    sum += str.charCodeAt(i) - 64;
  }
  return sum - 1;
}

function obtenerIndiceColumna(palabrasClave) {
  for (let i = 0; i < nombresColumnas.length; i++) {
    const colNombre = (nombresColumnas[i] || "").toLowerCase().trim();
    for (let palabra of palabrasClave) {
      if (colNombre.includes(palabra.toLowerCase())) {
        return i;
      }
    }
  }
  return -1;
}

function getValByKeywords(fila, palabrasClave) {
  const idx = obtenerIndiceColumna(palabrasClave);
  return (idx !== -1 && fila[idx] !== undefined) ? fila[idx] : "";
}

function obtenerAnioDeFila(fila) {
  const fechaRaw = getValByKeywords(fila, ['registrado', 'marca temporal', 'fecha']);
  const fechaFormateada = formatearFecha(fechaRaw);
  if (fechaFormateada && fechaFormateada !== '-') {
    const partes = fechaFormateada.split('/');
    if (partes.length === 3) {
      return partes[2].substring(0, 4);
    }
  }
  return 'S/A';
}

window.addEventListener('DOMContentLoaded', () => {
  fetch('declara.xlsx')
    .then(response => {
      if (!response.ok) throw new Error("No se encuentra declara.xlsx");
      return response.arrayBuffer();
    })
    .then(data => {
      const workbook = XLSX.read(data, { type: 'array' });
      const primeraHoja = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[primeraHoja];
      
      datosExcelRaw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

      if (datosExcelRaw.length > 1) {
        let filaEncabezadoIdx = 0;
        for (let i = 0; i < datosExcelRaw.length; i++) {
          const tieneTexto = datosExcelRaw[i].some(celda => String(celda).trim() !== "");
          if (tieneTexto) {
            filaEncabezadoIdx = i;
            break;
          }
        }

        const cabecerasOriginales = datosExcelRaw[filaEncabezadoIdx];

        for (let i = 0; i <= col2idx('BI'); i++) {
          nombresColumnas[i] = (cabecerasOriginales[i] && cabecerasOriginales[i].toString().trim() !== "") 
            ? cabecerasOriginales[i].toString().trim() 
            : `Columna ${i + 1}`;
        }

        const filasProcesadas = datosExcelRaw.slice(filaEncabezadoIdx + 1).filter(row => {
          return row.some(celda => celda !== undefined && celda !== null && String(celda).trim() !== "");
        });

        datosExcel = filasProcesadas.map(row => {
          let filaObj = {};
          for (let i = 0; i <= col2idx('BI'); i++) {
            filaObj[i] = (row[i] !== undefined) ? row[i] : "";
          }
          return filaObj;
        });

        // Ordenamiento numérico por Legajo
        datosExcel.sort((a, b) => {
          const rawA = getValByKeywords(a, ['agente legajo', 'legajo']);
          const rawB = getValByKeywords(b, ['agente legajo', 'legajo']);
          
          const legA = parseInt(rawA);
          const legB = parseInt(rawB);

          const esNumA = !isNaN(legA);
          const esNumB = !isNaN(legB);

          if (esNumA && esNumB) return legA - legB;
          if (esNumA && !esNumB) return -1;
          if (!esNumA && esNumB) return 1;
          return 0;
        });

        poblarSelectorAnios();
        filtrarPorAnio('TODOS');
      } else {
        alert("El archivo declara.xlsx está vacío.");
      }
    })
    .catch(error => {
      console.error("Error al cargar declara.xlsx:", error);
      alert("Error: Verifica que 'declara.xlsx' esté en la misma carpeta.");
    });
});

/* DETECTA Y CARGA LOS AÑOS DISPONIBLES */
function poblarSelectorAnios() {
  const selectAnio = document.getElementById('selectorAnio');
  selectAnio.innerHTML = '<option value="TODOS">Todos los años</option>';

  const aniosUnicos = new Set();
  datosExcel.forEach(fila => {
    const anio = obtenerAnioDeFila(fila);
    if (anio !== 'S/A') aniosUnicos.add(anio);
  });

  Array.from(aniosUnicos).sort((a, b) => b - a).forEach(anio => {
    const option = document.createElement('option');
    option.value = anio;
    option.textContent = `Año ${anio}`;
    selectAnio.appendChild(option);
  });
}

/* FILTRA AGENTES Y TABLA DEL MODAL SEGÚN EL AÑO */
function filtrarPorAnio(anioSeleccionado) {
  if (anioSeleccionado === 'TODOS') {
    datosFiltrados = [...datosExcel];
  } else {
    datosFiltrados = datosExcel.filter(fila => obtenerAnioDeFila(fila) === String(anioSeleccionado));
  }

  poblarSelectorAgentes();
  construirTablaModal(); // Actualiza el modal con los registros del año activo

  if (datosFiltrados.length > 0) {
    mostrarFila(0);
  } else {
    limpiarFormulario();
  }

  // Si el modal de pendientes está abierto, recalcular según el nuevo filtro
  const modalPendientes = document.getElementById('modalPendientes');
  if (modalPendientes && modalPendientes.style.display === 'flex' && datosLegajosRaw.length > 0) {
    calcularYMostrarPendientes();
  }
}

/* POBLA EL SELECTOR CON LOS AGENTES DEL AÑO SELECCIONADO */
function poblarSelectorAgentes() {
  const select = document.getElementById('selectorFilas');
  select.innerHTML = '';

  if (datosFiltrados.length === 0) {
    const option = document.createElement('option');
    option.value = "";
    option.textContent = "Sin registros para este año";
    select.appendChild(option);
    return;
  }

  datosFiltrados.forEach((fila, index) => {
    const option = document.createElement('option');
    option.value = index;
    
    const legajo = getValByKeywords(fila, ['agente legajo', 'legajo']) || 'S/L';
    const nombre = getValByKeywords(fila, ['nombre y apellido', 'agente', 'nombre']) || 'Sin Nombre';
    const dni = getValByKeywords(fila, ['dni', 'documento']) || 'S/D';

    option.textContent = `Legajo: ${legajo} - ${nombre} (DNI: ${dni})`;
    select.appendChild(option);
  });
}

function mostrarFila(index) {
  if (index < 0 || index >= datosFiltrados.length) return;
  
  filaActual = parseInt(index);
  const fila = datosFiltrados[filaActual];

  document.getElementById('selectorFilas').value = filaActual;
  document.getElementById('contador').textContent = `${filaActual + 1} de ${datosFiltrados.length}`;
  document.getElementById('btnPrev').disabled = (filaActual === 0);
  document.getElementById('btnNext').disabled = (filaActual === datosFiltrados.length - 1);

  const fechaRealizacion = formatearFechaHora(getValByKeywords(fila, ['registrado', 'marca temporal', 'fecha']));
  const legajo = getValByKeywords(fila, ['agente legajo', 'legajo']);
  const nombre = getValByKeywords(fila, ['nombre y apellido', 'agente']);
  const domicilio = getValByKeywords(fila, ['domicilio actual', 'domicilio']);
  const dni = getValByKeywords(fila, ['dni']);
  const nacimiento = getValByKeywords(fila, ['fecha de nacimiento', 'nacimiento']);
  const telefono = getValByKeywords(fila, ['teléfonos de contactos', 'teléfono', 'telefono', 'celular']);
  const lugar = getValByKeywords(fila, ['lugar']);
  const estadoCivil = getValByKeywords(fila, ['estado civil']);
  const fechaIngreso = getValByKeywords(fila, ['fecha de ing', 'ingreso']);
  const estudios = getValByKeywords(fila, ['estudios curs', 'estudios']);
  const titulo = getValByKeywords(fila, ['titulo obten', 'título']);
  const enfermedad = getValByKeywords(fila, ['enfermedad']);
  const lugarTrabajo = getValByKeywords(fila, ['lugar de trab', 'dependencia']);
  const actividad = getValByKeywords(fila, ['actividad', 'función']);

  setVal('val-fecha-realizacion', fechaRealizacion);
  setVal('val-legajo', legajo);
  setVal('val-nombre', nombre);
  setVal('val-domicilio', domicilio);
  setVal('val-dni', dni);
  setVal('val-nacimiento', formatearFecha(nacimiento));
  setVal('val-tel', telefono);
  setVal('val-lugar', lugar);
  setVal('val-estado-civil', estadoCivil);
  setVal('val-ingreso', formatearFecha(fechaIngreso));
  setVal('val-estudios', estudios);
  setVal('val-titulo', titulo);
  setVal('val-enfermedad', enfermedad);
  setVal('val-lugar-trabajo', lugarTrabajo);
  setVal('val-actividad', actividad);

  setVal('val-talle-camisa', getValByKeywords(fila, ['talle camisa']));
  setVal('val-talle-remera', getValByKeywords(fila, ['talle remera']));
  setVal('val-talle-pantalon', getValByKeywords(fila, ['talle pantal']));
  setVal('val-talle-calzado', getValByKeywords(fila, ['talle calzado']));

  renderizarRangoEnGrid('contenedor-conyuge', fila, col2idx('U'), col2idx('X'));
  renderizarHijosEstructurados('contenedor-hijos', fila);
  renderizarRangoEnGrid('contenedor-derechohabientes', fila, col2idx('BA'), col2idx('BI'));

  setVal('sig-nombre', nombre);
  setVal('sig-dni', dni);
  setVal('sig-fecha', fechaRealizacion);
  
  const padLegajo = String(legajo || '0000').padStart(4, '0');
  const padDni = String(dni || '0000').slice(-4);
  const anioDDJJ = obtenerAnioDeFila(fila);

  setVal('sig-id', `DDJJ-${anioDDJJ}-${padLegajo}-${padDni}`);
  setVal('sig-hash', `a7f98b${filaActual + 100}c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b`);
}

function limpiarFormulario() {
  document.getElementById('contador').textContent = "0 de 0";
  setVal('val-fecha-realizacion', '-');
  setVal('val-legajo', '-');
  setVal('val-nombre', '-');
  setVal('val-domicilio', '-');
  setVal('val-dni', '-');
  setVal('val-nacimiento', '-');
  setVal('val-tel', '-');
  setVal('val-lugar', '-');
  setVal('val-estado-civil', '-');
  setVal('val-ingreso', '-');
  setVal('val-estudios', '-');
  setVal('val-titulo', '-');
  setVal('val-enfermedad', '-');
  setVal('val-lugar-trabajo', '-');
  setVal('val-actividad', '-');
  setVal('val-talle-camisa', '-');
  setVal('val-talle-remera', '-');
  setVal('val-talle-pantalon', '-');
  setVal('val-talle-calzado', '-');
  document.getElementById('contenedor-conyuge').innerHTML = '';
  document.getElementById('contenedor-hijos').innerHTML = '';
  document.getElementById('contenedor-derechohabientes').innerHTML = '';
}

function renderizarHijosEstructurados(containerId, fila) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const bloquesHijos = [
    { titulo: "Hijo / Carga N° 1", inicio: col2idx('Y'), fin: col2idx('AE') },
    { titulo: "Hijo / Carga N° 2", inicio: col2idx('AF'), fin: col2idx('AL') },
    { titulo: "Hijo / Carga N° 3", inicio: col2idx('AM'), fin: col2idx('AS') },
    { titulo: "Hijo / Carga N° 4", inicio: col2idx('AT'), fin: col2idx('AZ') }
  ];

  let hayAlMenosUnHijo = false;
  let htmlGeneral = '';

  bloquesHijos.forEach(bloque => {
    let tieneDatosEsteHijo = false;
    let htmlCampos = '<div class="form-grid cols-3">';

    for (let i = bloque.inicio; i <= bloque.fin; i++) {
      const tituloCol = nombresColumnas[i];
      let valor = fila[i];

      if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
        tieneDatosEsteHijo = true;
        hayAlMenosUnHijo = true;
        if (typeof valor === 'number' && valor > 30000 && valor < 60000) {
          valor = formatearFecha(valor);
        }
      } else {
        valor = "-";
      }

      htmlCampos += `
        <div class="field">
          <label>${tituloCol}</label>
          <div class="box">${valor}</div>
        </div>
      `;
    }

    htmlCampos += '</div>';

    if (tieneDatosEsteHijo) {
      htmlGeneral += `
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; margin-bottom: 8px;">
          <h4 style="margin: 0 0 6px 0; color: #1e3a8a; font-size: 11px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
            ${bloque.titulo}
          </h4>
          ${htmlCampos}
        </div>
      `;
    }
  });

  if (!hayAlMenosUnHijo) {
    container.innerHTML = '<div class="empty-section-msg">No registra hijos ni cargas de familia declaradas.</div>';
  } else {
    container.innerHTML = htmlGeneral;
  }
}

function renderizarRangoEnGrid(containerId, fila, idxInicio, idxFin) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  let html = '<div class="form-grid cols-3">';
  let hayDatos = false;

  for (let i = idxInicio; i <= idxFin; i++) {
    const tituloColumna = nombresColumnas[i];
    let valor = fila[i];

    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      hayDatos = true;
      if (typeof valor === 'number' && valor > 30000 && valor < 60000) {
        valor = formatearFecha(valor);
      }
    } else {
      valor = "-";
    }

    html += `
      <div class="field">
        <label>${tituloColumna}</label>
        <div class="box">${valor}</div>
      </div>
    `;
  }

  html += '</div>';

  if (!hayDatos) {
    container.innerHTML = '<div class="empty-section-msg">No registra datos declarados en este apartado.</div>';
  } else {
    container.innerHTML = html;
  }
}

/* CONSTRUYE EL MODAL FILTRADO SEGÚN EL AÑO SELECCIONADO */
function construirTablaModal() {
  const idxFecha = obtenerIndiceColumna(['registrado', 'marca']);
  const idxLegajo = obtenerIndiceColumna(['agente legajo', 'legajo']);
  const idxNombre = obtenerIndiceColumna(['nombre y apellido', 'agente']);
  const idxDni = obtenerIndiceColumna(['dni']);

  const indicesColumnas = [
    idxFecha !== -1 ? idxFecha : 0,
    idxLegajo !== -1 ? idxLegajo : 1,
    idxNombre !== -1 ? idxNombre : 2,
    idxDni !== -1 ? idxDni : 4
  ];

  const headerTr = document.getElementById('encabezadoTablaModal');
  const tbody = document.getElementById('cuerpoTablaModal');

  headerTr.innerHTML = '<th>#</th>';
  tbody.innerHTML = '';

  indicesColumnas.forEach(colIndex => {
    const th = document.createElement('th');
    th.textContent = nombresColumnas[colIndex] || `Columna ${colIndex + 1}`;
    headerTr.appendChild(th);
  });

  // Muestra únicamente los registros filtrados en el modal
  datosFiltrados.forEach((fila, index) => {
    const tr = document.createElement('tr');
    tr.onclick = () => {
      mostrarFila(index);
      cerrarModalListado();
    };

    let htmlRow = `<td><strong>${index + 1}</strong></td>`;
    
    indicesColumnas.forEach((colIndex, i) => {
      let valor = fila[colIndex];
      if (i === 0) valor = formatearFechaHora(valor);
      htmlRow += `<td>${(valor !== undefined && valor !== "") ? valor : '-'}</td>`;
    });

    tr.innerHTML = htmlRow;
    tbody.appendChild(tr);
  });
}

function abrirModalListado() { document.getElementById('modalListado').style.display = 'flex'; }
function cerrarModalListado() { document.getElementById('modalListado').style.display = 'none'; }

function imprimirTablaModal() {
  document.body.classList.add('printing-modal');
  window.print();
  document.body.classList.remove('printing-modal');
}

function setVal(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = (valor !== undefined && valor !== "") ? valor : "-";
}

function formatearFechaHora(val) {
  if (!val) return "-";
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if(date) return `${date.d}/${date.m}/${date.y} ${date.H}:${date.M}:${date.S}`;
  }
  return String(val);
}

function formatearFecha(val) {
  if (!val) return "-";
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if(date) return `${date.d}/${date.m}/${date.y}`;
  }
  return String(val);
}

function navegar(sentido) { mostrarFila(filaActual + sentido); }
function irAFila(valor) { if (valor !== "") mostrarFila(valor); }

/* ==========================================
   FUNCIONALIDAD: AGENTES PENDIENTES
   ========================================== */

function abrirModalPendientes() {
  document.getElementById('modalPendientes').style.display = 'flex';
  
  if (datosLegajosRaw.length === 0) {
    cargarPadronLegajos();
  } else {
    calcularYMostrarPendientes();
  }
}

function cerrarModalPendientes() {
  document.getElementById('modalPendientes').style.display = 'none';
}

function cargarPadronLegajos() {
  fetch('legajos.xlsx')
    .then(response => {
      if (!response.ok) throw new Error("No se encuentra legajos.xlsx");
      return response.arrayBuffer();
    })
    .then(data => {
      const workbook = XLSX.read(data, { type: 'array' });
      const primeraHoja = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[primeraHoja];
      
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

      if (rawData.length > 1) {
        let filaEncabezadoIdx = 0;
        for (let i = 0; i < rawData.length; i++) {
          if (rawData[i].some(celda => String(celda).trim() !== "")) {
            filaEncabezadoIdx = i;
            break;
          }
        }

        const cabeceras = rawData[filaEncabezadoIdx].map(c => String(c).toLowerCase().trim());
        const idxLegajo = cabeceras.findIndex(c => c.includes('legajo'));
        const idxNombre = cabeceras.findIndex(c => c.includes('nombre') || c.includes('agente') || c.includes('apellido'));
        const idxDni = cabeceras.findIndex(c => c.includes('dni') || c.includes('documento'));

        datosLegajosRaw = rawData.slice(filaEncabezadoIdx + 1)
          .filter(row => row.some(celda => celda !== undefined && celda !== null && String(celda).trim() !== ""))
          .map(row => ({
            legajo: String(row[idxLegajo !== -1 ? idxLegajo : 0] || "").trim(),
            nombre: String(row[idxNombre !== -1 ? idxNombre : 1] || "Sin Nombre").trim(),
            dni: String(row[idxDni !== -1 ? idxDni : 2] || "-").trim()
          }));

        calcularYMostrarPendientes();
      } else {
        alert("El archivo legajos.xlsx está vacío.");
      }
    })
    .catch(error => {
      console.error("Error al cargar legajos.xlsx:", error);
      alert("Error: Verifica que 'legajos.xlsx' esté en la misma carpeta del proyecto.");
    });
}

function calcularYMostrarPendientes() {
  const legajosPresentados = new Set();
  datosFiltrados.forEach(fila => {
    const legajo = getValByKeywords(fila, ['agente legajo', 'legajo']);
    if (legajo) legajosPresentados.add(String(legajo).trim());
  });

  agentesPendientes = datosLegajosRaw.filter(agente => {
    return agente.legajo && !legajosPresentados.has(agente.legajo);
  });

  agentesPendientes.sort((a, b) => {
    const numA = parseInt(a.legajo);
    const numB = parseInt(b.legajo);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.legajo.localeCompare(b.legajo);
  });

  const tbody = document.getElementById('cuerpoTablaPendientes');
  const resumen = document.getElementById('resumenPendientes');
  
  const selectAnio = document.getElementById('selectorAnio');
  const anioTexto = selectAnio ? selectAnio.options[selectAnio.selectedIndex].text : 'Seleccionado';

  resumen.textContent = `Total pendientes (${anioTexto}): ${agentesPendientes.length} agente(s)`;
  tbody.innerHTML = '';

  if (agentesPendientes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 15px; color: #166534; font-weight:bold;">¡Todos los agentes de este periodo han presentado su declaración jurada!</td></tr>';
    return;
  }

  agentesPendientes.forEach((agente, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${index + 1}</strong></td>
      <td><strong>${agente.legajo}</strong></td>
      <td>${agente.nombre}</td>
      <td>${agente.dni}</td>
    `;
    tbody.appendChild(tr);
  });
}