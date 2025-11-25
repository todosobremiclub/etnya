
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

// Array de asignaciones (persistencia con localStorage)
let asignaciones = JSON.parse(localStorage.getItem("asignaciones")) || [];

// Guardar en localStorage
function guardarLocal() {
  localStorage.setItem("asignaciones", JSON.stringify(asignaciones));
}

// Renderiza la agenda semanal para una sede
function renderAgenda(sede, tableId) {
  const cfg = config[sede];
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = "";

  for (let hora = cfg.horaInicio; hora <= cfg.horaFin; hora++) {
    const row = document.createElement("tr");
    const horaStr = hora.toString().padStart(2, "0") + ":00";
    row.innerHTML = `<td>${horaStr}</td>`;

    cfg.dias.forEach(dia => {
      const prof = asignaciones.find(a =>
        a.sede === sede &&
        a.dias.includes(dia) &&
        a.horas.includes(hora)
      );
      row.innerHTML += `<td>${prof ? prof.profesor : ""}</td>`;
    });

    tbody.appendChild(row);
  }
}

// Renderiza la tabla de asignaciones
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
        <td>${a.horas.map(h => h.toString().padStart(2, "0") + ":00").join(", ")}</td>
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

// Maneja el submit del formulario
document.getElementById("asignacionForm").addEventListener("submit", function(e) {
  e.preventDefault();
  const profesor = document.getElementById("profesorInput").value.trim();
  const sede = document.getElementById("sedeSelect").value;
  const dias = Array.from(document.getElementById("diasSelect").selectedOptions).map(opt => opt.value);
  const horas = Array.from(document.getElementById("horasSelect").selectedOptions).map(opt => parseInt(opt.value));
  const obs = document.getElementById("obsInput").value.trim();

  if (!profesor || !dias.length || !horas.length) {
    alert("Completa todos los campos obligatorios.");
    return;
  }

  asignaciones.push({ profesor, sede, dias, horas, observaciones: obs });
  guardarLocal();
  this.reset();
  actualizarTodo();
});

// Editar asignación
window.editarAsignacion = function(idx) {
  const a = asignaciones[idx];
  document.getElementById("profesorInput").value = a.profesor;
  document.getElementById("sedeSelect").value = a.sede;

  // Seleccionar días
  const diasSelect = document.getElementById("diasSelect");
  Array.from(diasSelect.options).forEach(opt => {
    opt.selected = a.dias.includes(opt.value);
  });

  // Seleccionar horas
  const horasSelect = document.getElementById("horasSelect");
  Array.from(horasSelect.options).forEach(opt => {
    opt.selected = a.horas.includes(parseInt(opt.value));
  });

  document.getElementById("obsInput").value = a.observaciones || "";
  asignaciones.splice(idx, 1);
  guardarLocal();
  actualizarTodo();
};

// Eliminar asignación
window.eliminarAsignacion = function(idx) {
  if (confirm("¿Eliminar esta asignación?")) {
    asignaciones.splice(idx, 1);
    guardarLocal();
    actualizarTodo();
  }
};

// Actualiza agendas y tabla
function actualizarTodo() {
  renderAgenda("Craig", "agendaCraig");
  renderAgenda("Goyena", "agendaGoyena");
  renderAsignaciones();
}

// Genera opciones dinámicas para días y horas
document.getElementById("sedeSelect").addEventListener("change", function() {
  const sede = this.value;

  // Actualizar días
  const diasSelect = document.getElementById("diasSelect");
  diasSelect.innerHTML = "";
  config[sede].dias.forEach(dia => {
    const opt = document.createElement("option");
    opt.value = dia;
    opt.text = dia;
    diasSelect.appendChild(opt);
  });

  // Actualizar horas
  const horasSelect = document.getElementById("horasSelect");
  horasSelect.innerHTML = "";
  for (let h = config[sede].horaInicio; h <= config[sede].horaFin; h++) {
    const opt = document.createElement("option");
    opt.value = h;
    opt.text = h.toString().padStart(2, "0") + ":00";
    horasSelect.appendChild(opt);
  }
});

// Inicializa la página
function init() {
  document.getElementById("sedeSelect").value = "Craig";
  document.getElementById("sedeSelect").dispatchEvent(new Event("change"));
  actualizarTodo();
}

window.onload = init;
