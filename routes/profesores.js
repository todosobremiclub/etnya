
// profesores.js

// Configuración de horarios y días por sede
const config = {
  Craig: {
    dias: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"],
    horaInicio: 9,
    horaFin: 20
  },
  Goyena: {
    dias: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
    horaInicio: 8,
    horaFin: 21
  }
};

// Array de asignaciones (simula la base de datos)
let asignaciones = [];

// Renderiza la agenda semanal para una sede
function renderAgenda(sede, tableId) {
  const cfg = config[sede];
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = "";

  for (let hora = cfg.horaInicio; hora <= cfg.horaFin; hora++) {
    const row = document.createElement("tr");
    // Columna de hora
    const horaStr = hora.toString().padStart(2, "0") + ":00";
    row.innerHTML = `<td>${horaStr}</td>`;

    // Columnas de días
    cfg.dias.forEach((dia, idx) => {
      // Busca si hay profesor asignado para ese día y hora
      const prof = asignaciones.find(a =>
        a.sede === sede &&
        a.dias.includes(dia) &&
        hora >= a.horaDesde && hora < a.horaHasta
      );
      row.innerHTML += `<td>${prof ? prof.profesor : ""}</td>`;
    });

    tbody.appendChild(row);
  }
}

// Renderiza la tabla de asignaciones abajo
function renderAsignaciones() {
  const tbody = document.querySelector("#tablaAsignaciones tbody");
  tbody.innerHTML = "";
  asignaciones.forEach((a, idx) => {
    a.dias.forEach(dia => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${a.profesor}</td>
        <td>${a.sede}</td>
        <td>${dia}</td>
        <td>${a.horaDesde.toString().padStart(2, "0")}:00 - ${a.horaHasta.toString().padStart(2, "0")}:00</td>
        <td>${a.observaciones || ""}</td>
        <td>
          <button class="btn secondary" onclick="editarAsignacion(${idx})">Editar</button>
          <button class="btn danger" onclick="eliminarAsignacion(${idx})">Eliminar</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  });
}

// Convierte un string de rango horario a números
function parseHorario(horarioStr) {
  // Ejemplo: "09:00-12:00"
  const match = horarioStr.match(/^(\d{2}):\d{2}\s*-\s*(\d{2}):\d{2}$/);
  if (!match) return null;
  return { desde: parseInt(match[1]), hasta: parseInt(match[2]) };
}

// Maneja el submit del formulario de asignación
document.getElementById("asignacionForm").addEventListener("submit", function(e) {
  e.preventDefault();
  const profesor = document.getElementById("profesorInput").value.trim();
  const sede = document.getElementById("sedeSelect").value;
  const diasSelect = document.getElementById("diasSelect");
  const dias = Array.from(diasSelect.selectedOptions).map(opt => opt.text);
  const horarioStr = document.getElementById("horarioInput").value.trim();
  const obs = document.getElementById("obsInput").value.trim();

  if (!profesor || !dias.length || !horarioStr) {
    alert("Completa todos los campos obligatorios.");
    return;
  }
  const horario = parseHorario(horarioStr);
  if (!horario) {
    alert("El horario debe tener formato HH:MM-HH:MM (ej: 09:00-12:00)");
    return;
  }
  asignaciones.push({
    profesor,
    sede,
    dias,
    horaDesde: horario.desde,
    horaHasta: horario.hasta,
    observaciones: obs
  });
  this.reset();
  actualizarTodo();
});

// Editar asignación
window.editarAsignacion = function(idx) {
  const a = asignaciones[idx];
  document.getElementById("profesorInput").value = a.profesor;
  document.getElementById("sedeSelect").value = a.sede;
  const diasSelect = document.getElementById("diasSelect");
  Array.from(diasSelect.options).forEach(opt => {
    opt.selected = a.dias.includes(opt.text);
  });
  document.getElementById("horarioInput").value =
    a.horaDesde.toString().padStart(2, "0") + ":00-" +
    a.horaHasta.toString().padStart(2, "0") + ":00";
  document.getElementById("obsInput").value = a.observaciones || "";
  // Elimina la anterior para reemplazar
  asignaciones.splice(idx, 1);
  actualizarTodo();
};

// Eliminar asignación
window.eliminarAsignacion = function(idx) {
  if (confirm("¿Eliminar esta asignación?")) {
    asignaciones.splice(idx, 1);
    actualizarTodo();
  }
};

// Actualiza agendas y tabla de asignaciones
function actualizarTodo() {
  renderAgenda("Craig", "agendaCraig");
  renderAgenda("Goyena", "agendaGoyena");
  renderAsignaciones();
}

// Inicializa los selects de días según sede
document.getElementById("sedeSelect").addEventListener("change", function() {
  const sede = this.value;
  const diasSelect = document.getElementById("diasSelect");
  diasSelect.innerHTML = "";
  config[sede].dias.forEach((dia, idx) => {
    const opt = document.createElement("option");
    opt.value = (idx + 1).toString();
    opt.text = dia;
    diasSelect.appendChild(opt);
  });
});

// Inicializa la página
function init() {
  // Inicializa los días para la sede Craig por defecto
  document.getElementById("sedeSelect").value = "Craig";
  document.getElementById("sedeSelect").dispatchEvent(new Event("change"));
  actualizarTodo();
}

window.onload = init;
