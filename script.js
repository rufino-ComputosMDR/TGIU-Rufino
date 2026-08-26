let datosExcelRaw = [];
let datosExcel = [];       // Todos los registros
let datosFiltrados = [];   // Registros filtrados por año
let nombresColumnas = [];
let filaActual = 0;

let datosLegajosRaw = [];
let agentesPendientes = [];

// Convierte letras de columna de Excel (ej: 'A', 'Z', 'AA', 'AU') a índice base 0
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

// Búsqueda por palabra clave con respaldo por índice directo (letra de columna Excel)
function getValByKeywordsOrCol(fila, palabrasClave, letraColumna) {
  let val = getValByKeywords(fila, palabrasClave);
  if (val !== undefined && val !== null && String(val).trim() !== "") {
    return val;
  }
  const idx = col2idx(letraColumna);
  return (fila[idx] !== undefined && fila[idx] !== null) ? fila[idx] : "";
}

function obtenerAnioDeFila(fila) {
  const fechaRaw = getValByKeywordsOrCol(fila, ['registrado', 'marca temporal', 'fecha'], 'A');
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
        const limiteCol = col2idx('AU'); // Mapeo extendido hasta la columna AU (47 columnas, índice 0 a 46)

        for (let i = 0; i <= limiteCol; i++) {
          nombresColumnas[i] = (cabecerasOriginales[i] && cabecerasOriginales[i].toString().trim() !== "") 
            ? cabecerasOriginales[i].toString().trim() 
            : `Columna ${i + 1}`;
        }

        const filasProcesadas = datosExcelRaw.slice(filaEncabezadoIdx + 1).filter(row => {
          return row.some(celda => celda !== undefined && celda !== null && String(celda).trim() !== "");
        });

        datosExcel = filasProcesadas.map(row => {
          let filaObj = {};
          for (let i = 0; i <= limiteCol; i++) {
            filaObj[i] = (row[i] !== undefined) ? row[i] : "";
          }
          return filaObj;
        });

        // Ordenamiento por Legajo (Columna AU)
        datosExcel.sort((a, b) => {
          const rawA = getValByKeywordsOrCol(a, ['legajo', 'nro. de legajo'], 'AU');
          const rawB = getValByKeywordsOrCol(b, ['legajo', 'nro. de legajo'], 'AU');
          
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

function poblarSelectorAnios() {
  const selectAnio = document.getElementById('selectorAnio');
  if (!selectAnio) return;
  
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

function filtrarPorAnio(anioSeleccionado) {
  if (anioSeleccionado === 'TODOS') {
    datosFiltrados = [...datosExcel];
  } else {
    datosFiltrados = datosExcel.filter(fila => obtenerAnioDeFila(fila) === String(anioSeleccionado));
  }

  poblarSelectorAgentes();
  construirTablaModal();

  if (datosFiltrados.length > 0) {
    mostrarFila(0);
  } else {
    limpiarFormulario();
  }

  const modalPendientes = document.getElementById('modalPendientes');
  if (modalPendientes && modalPendientes.style.display === 'flex' && datosLegajosRaw.length > 0) {
    calcularYMostrarPendientes();
  }
}

function poblarSelectorAgentes() {
  const select = document.getElementById('selectorFilas');
  if (!select) return;
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
    
    const legajo = getValByKeywordsOrCol(fila, ['legajo', 'nro. de legajo'], 'AU') || 'S/L';
    const nombre = getValByKeywordsOrCol(fila, ['apellido y nombre', 'nombre y apellido'], 'C') || 'Sin Nombre';
    const dni = getValByKeywordsOrCol(fila, ['dni n°', 'dni', 'documento'], 'D') || 'S/D';

    option.textContent = (legajo !== 'S/L') ? `Legajo: ${legajo} - ${nombre} (DNI: ${dni})` : `${nombre} (DNI: ${dni})`;
    select.appendChild(option);
  });
}

function mostrarFila(index) {
  if (!datosFiltrados || datosFiltrados.length === 0) {
    limpiarFormulario();
    return;
  }

  if (index < 0) index = 0;
  if (index >= datosFiltrados.length) index = datosFiltrados.length - 1;
  
  filaActual = parseInt(index);
  const fila = datosFiltrados[filaActual];

  const selectorFilas = document.getElementById('selectorFilas');
  if (selectorFilas) selectorFilas.value = filaActual;

  const contador = document.getElementById('contador');
  if (contador) contador.textContent = `${filaActual + 1} de ${datosFiltrados.length}`;

  const btnPrev = document.getElementById('btnPrev');
  if (btnPrev) btnPrev.disabled = (filaActual === 0);

  const btnNext = document.getElementById('btnNext');
  if (btnNext) btnNext.disabled = (filaActual === datosFiltrados.length - 1);

  // Mapeo directo por posición (A a AU)
  const fechaRealizacion = formatearFechaHora(getValByKeywordsOrCol(fila, ['registrado', 'marca temporal', 'fecha'], 'A'));
  const legajo           = getValByKeywordsOrCol(fila, ['legajo', 'nro. de legajo'], 'AU');
  const nombre           = getValByKeywordsOrCol(fila, ['apellido y nombre', 'nombre y apellido'], 'C');
  const dni              = getValByKeywordsOrCol(fila, ['dni n°', 'dni'], 'D');
  const nacimiento       = getValByKeywordsOrCol(fila, ['fecha de nacimiento', 'nacimiento'], 'E');
  const domicilio        = getValByKeywordsOrCol(fila, ['domicilio actual', 'domicilio'], 'F');
  const lugar            = getValByKeywordsOrCol(fila, ['lugar / localidad', 'lugar', 'localidad'], 'G');
  const telefono         = getValByKeywordsOrCol(fila, ['teléfono contacto', 'teléfono', 'telefono'], 'H');
  const estadoCivil      = getValByKeywordsOrCol(fila, ['estado civil'], 'I');
  const estudios         = getValByKeywordsOrCol(fila, ['estudios cursados'], 'J');
  const titulo           = getValByKeywordsOrCol(fila, ['título obtenido', 'titulo'], 'K');
  const enfermedad       = getValByKeywordsOrCol(fila, ['enfermedad/patología', 'enfermedad'], 'L');
  const lugarTrabajo     = getValByKeywordsOrCol(fila, ['lugar de trabajo', 'dependencia'], 'M');
  const actividad        = getValByKeywordsOrCol(fila, ['actividad/función', 'actividad'], 'N');
  const fechaIngreso     = getValByKeywordsOrCol(fila, ['fecha de ingreso', 'ingreso'], 'O');

  setVal('val-fecha-realizacion', fechaRealizacion);
  setVal('val-legajo', legajo || 'S/L');
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

  // Talles (P, Q, R, S)
  setVal('val-talle-camisa', getValByKeywordsOrCol(fila, ['talle camisa'], 'P'));
  setVal('val-talle-remera', getValByKeywordsOrCol(fila, ['talle remera'], 'Q'));
  setVal('val-talle-pantalon', getValByKeywordsOrCol(fila, ['talle pantalón', 'talle pantalon'], 'R'));
  setVal('val-talle-calzado', getValByKeywordsOrCol(fila, ['talle calzado'], 'S'));

  // CÓNYUGE: Columnas T (Nombre), U (Fecha Nacimiento), V (DNI)
  renderizarConyugeEstructurado('contenedor-conyuge', fila);
  
  // HIJOS: Bloques W a AN
  renderizarHijosEstructurados('contenedor-hijos', fila);
  
  // DERECHOHABIENTES: Columnas AO a AT
  renderizarDerechohabientesEstructurados('contenedor-derechohabientes', fila);

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
  const contador = document.getElementById('contador');
  if (contador) contador.textContent = "0 de 0";

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

  const conyuge = document.getElementById('contenedor-conyuge');
  if (conyuge) conyuge.innerHTML = '';

  const hijos = document.getElementById('contenedor-hijos');
  if (hijos) hijos.innerHTML = '';

  const derechohabientes = document.getElementById('contenedor-derechohabientes');
  if (derechohabientes) derechohabientes.innerHTML = '';

  setVal('sig-nombre', '-');
  setVal('sig-dni', '-');
  setVal('sig-fecha', '-');
  setVal('sig-id', '-');
  setVal('sig-hash', '-');
}

function renderizarConyugeEstructurado(containerId, fila) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const idxNombre = col2idx('T');
  const idxFechaNac = col2idx('U'); // Columna U asignada a Fecha de Nacimiento
  const idxDni = col2idx('V');      // Columna V asignada a DNI

  let nombreVal = fila[idxNombre];
  let fechaNacVal = fila[idxFechaNac];
  let dniVal = fila[idxDni];

  const tieneNombre = nombreVal !== undefined && nombreVal !== null && String(nombreVal).trim() !== "";
  const tieneDni = dniVal !== undefined && dniVal !== null && String(dniVal).trim() !== "";
  const tieneFecha = fechaNacVal !== undefined && fechaNacVal !== null && String(fechaNacVal).trim() !== "";

  // Formatear la fecha ingresando el número serial de Excel a la función de conversión
  let fechaFormateada = "-";
  if (tieneFecha) {
    fechaFormateada = (typeof fechaNacVal === 'number' || !isNaN(Number(fechaNacVal))) 
      ? formatearFecha(Number(fechaNacVal)) 
      : String(fechaNacVal);
  }

  if (!tieneNombre && !tieneDni && !tieneFecha) {
    container.innerHTML = '<div class="empty-section-msg">No registra datos del cónyuge / conviviente.</div>';
    return;
  }

  container.innerHTML = `
    <div class="form-grid cols-3">
      <div class="field" style="grid-column: span 2;">
        <label>Nombre y Apellido</label>
        <div class="box">${tieneNombre ? nombreVal : '-'}</div>
      </div>
      <div class="field">
        <label>DNI N°</label>
        <div class="box">${tieneDni ? dniVal : '-'}</div>
      </div>
    </div>
    <div class="form-grid cols-3" style="margin-top: 4px;">
      <div class="field">
        <label>Fecha Nacimiento</label>
        <div class="box">${fechaFormateada}</div>
      </div>
    </div>
  `;
}

function renderizarHijosEstructurados(containerId, fila) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const bloquesHijos = [
    { titulo: "Hijo / Carga N° 1", inicio: col2idx('W'), fin: col2idx('AB') },
    { titulo: "Hijo / Carga N° 2", inicio: col2idx('AC'), fin: col2idx('AH') },
    { titulo: "Hijo / Carga N° 3", inicio: col2idx('AI'), fin: col2idx('AN') }
  ];

  let hayAlMenosUnHijo = false;
  let htmlGeneral = '';

  bloquesHijos.forEach(bloque => {
    let tieneDatosEsteHijo = false;
    let htmlCampos = '<div class="form-grid cols-3">';

    for (let i = bloque.inicio; i <= bloque.fin; i++) {
      const tituloCol = nombresColumnas[i] || `Columna ${i + 1}`;
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
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; margin-bottom: 6px;">
          <h4 style="margin: 0 0 4px 0; color: #1e3a8a; font-size: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
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

function renderizarDerechohabientesEstructurados(containerId, fila) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const paresDerechohabientes = [
    { idxNombre: col2idx('AO'), idxDni: col2idx('AP') },
    { idxNombre: col2idx('AQ'), idxDni: col2idx('AR') },
    { idxNombre: col2idx('AS'), idxDni: col2idx('AT') }
  ];

  let hayAlMenosUno = false;
  let htmlGeneral = '';

  paresDerechohabientes.forEach(pareja => {
    let nombreVal = fila[pareja.idxNombre];
    let dniVal = fila[pareja.idxDni];

    const tieneNombre = nombreVal !== undefined && nombreVal !== null && String(nombreVal).trim() !== "";
    const tieneDni = dniVal !== undefined && dniVal !== null && String(dniVal).trim() !== "";

    if (tieneNombre || tieneDni) {
      hayAlMenosUno = true;

      htmlGeneral += `
        <div class="form-grid cols-2" style="margin-bottom: 4px;">
          <div class="field">
            <label>NOMBRE Y APELLIDO</label>
            <div class="box">${tieneNombre ? nombreVal : '-'}</div>
          </div>
          <div class="field">
            <label>DNI</label>
            <div class="box">${tieneDni ? dniVal : '-'}</div>
          </div>
        </div>
      `;
    }
  });

  if (!hayAlMenosUno) {
    container.innerHTML = '<div class="empty-section-msg">No registra derechohabientes declarados.</div>';
  } else {
    container.innerHTML = htmlGeneral;
  }
}

function renderizarRangoEnGrid(containerId, fila, idxInicio, idxFin) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  let html = '<div class="form-grid cols-3">';
  let hayDatos = false;

  for (let i = idxInicio; i <= idxFin; i++) {
    const tituloColumna = nombresColumnas[i] || `Columna ${i + 1}`;
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

function construirTablaModal() {
  const idxFecha = col2idx('A');
  const idxLegajo = col2idx('AU');
  const idxNombre = col2idx('C');
  const idxDni = col2idx('D');

  const indicesColumnas = [idxFecha, idxLegajo, idxNombre, idxDni];

  const headerTr = document.getElementById('encabezadoTablaModal');
  const tbody = document.getElementById('cuerpoTablaModal');

  if (!headerTr || !tbody) return;

  headerTr.innerHTML = '<th>#</th>';
  tbody.innerHTML = '';

  indicesColumnas.forEach(colIndex => {
    const th = document.createElement('th');
    th.textContent = nombresColumnas[colIndex] || `Columna ${colIndex + 1}`;
    headerTr.appendChild(th);
  });

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

function abrirModalListado() {
  const el = document.getElementById('modalListado');
  if (el) el.style.display = 'flex';
}

function cerrarModalListado() {
  const el = document.getElementById('modalListado');
  if (el) el.style.display = 'none';
}

function imprimirTablaModal() {
  window.print();
}

function setVal(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = (valor !== undefined && valor !== null && String(valor).trim() !== "") ? valor : "-";
}

function formatearFechaHora(val) {
  if (!val) return "-";
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const h = String(date.H).padStart(2, '0');
      const m = String(date.M).padStart(2, '0');
      const s = String(date.S).padStart(2, '0');
      return `${date.d}/${date.m}/${date.y} ${h}:${m}:${s}`;
    }
  }
  return String(val);
}

function formatearFecha(val) {
  if (!val) return "-";
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return `${date.d}/${date.m}/${date.y}`;
  }
  return String(val);
}

function navegar(sentido) { mostrarFila(filaActual + sentido); }
function irAFila(valor) { if (valor !== "") mostrarFila(valor); }

/* PENDIENTES */
function abrirModalPendientes() {
  const modal = document.getElementById('modalPendientes');
  if (modal) modal.style.display = 'flex';
  
  if (datosLegajosRaw.length === 0) {
    cargarPadronLegajos();
  } else {
    calcularYMostrarPendientes();
  }
}

function cerrarModalPendientes() {
  const modal = document.getElementById('modalPendientes');
  if (modal) modal.style.display = 'none';
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
      alert("Error: Verifica que 'legajos.xlsx' esté en la misma carpeta.");
    });
}

function calcularYMostrarPendientes() {
  const legajosPresentados = new Set();
  datosFiltrados.forEach(fila => {
    const legajo = getValByKeywordsOrCol(fila, ['legajo', 'nro. de legajo'], 'AU');
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
  if (!tbody || !resumen) return;

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

function exportarPendientesExcel() {
  if (!agentesPendientes || agentesPendientes.length === 0) {
    alert("No hay agentes pendientes para exportar.");
    return;
  }

  const selectAnio = document.getElementById('selectorAnio');
  const anioVal = selectAnio ? selectAnio.value : 'TODOS';

  const dataExcel = agentesPendientes.map((a, idx) => ({
    'N°': idx + 1,
    'Legajo': a.legajo,
    'Nombre y Apellido': a.nombre,
    'DNI': a.dni
  }));

  const worksheet = XLSX.utils.json_to_sheet(dataExcel);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pendientes");

  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 35 },
    { wch: 15 }
  ];

  const nombreArchivo = `Agentes_Pendientes_DDJJ_${anioVal}.xlsx`;
  XLSX.writeFile(workbook, nombreArchivo);
}