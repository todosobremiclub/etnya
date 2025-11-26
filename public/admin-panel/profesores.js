
// profesores.js

const API_BASE = "https://etnya.onrender.com/api/asignaciones"; // Cambia si tu backend tiene otra ruta

// Configuración de horarios y días por sede
const config = {
  CraigReformer: { dias: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"], horaInicio: 9, horaFin: 20 },
  CraigCircuito: { dias: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"], horaInicio: 9, horaFin: 20 },
  Goyena: { dias: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"], horaInicio: 8, horaFin: 21 }
};

let asignaciones = [];

// Funciones para API
async function fetchAsignaciones() {
  const res = await fetch(API_BASE);
  asignaciones = await res.json();
}

async function crearAsignacion(payload) {
  await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function eliminarAsignacionRemoto(id) {
  await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
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
      const profesores = asignaciones
        .filter(a => a.sede === sede && a.dias.includes(dia) && a.horas.includes(hora))
        .map(a => a.profesor);
      row.innerHTML += `<td>${profesores.length ? profesores.join(" / ") : ""}</td>`;
    });

    tbody.appendChild(row);
  }
}

// Renderiza la tabla de asignaciones
function renderAsignaciones() {
  const tbody = document.querySelector("#tablaAsignaciones tbody");
  tbody.innerHTML = "";
  asignaciones.forEach(a => {
    a.dias.forEach(dia => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${a.profesor}</td>
        <td>${a.sede}</td>
        <td>${dia}</td>
        <td>${a.horas.map(h => h.toString().padStart(2, "0") + ":00").join(", ")}</td>
        <td>${a.observaciones || ""}</td>
        <td>
          <button class="btn danger" onclick="eliminarAsignacion(${a.id})">Eliminar</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  });
}

// Maneja el submit del formulario
document.getElementById("asignacionForm").addEventListener("submit", async function(e) {
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

  await crearAsignacion({ profesor, sede, dias, horas, observaciones: obs });
  this.reset();
  await fetchAsignaciones();
  actualizarTodo();
});

// Eliminar asignación
window.eliminarAsignacion = async function(id) {
  if (confirm("¿Eliminar esta asignación?")) {
    await eliminarAsignacionRemoto(id);
    await fetchAsignaciones();
    actualizarTodo();
  }
};

// Actualiza agendas y tabla
function actualizarTodo() {
  renderAgenda("CraigReformer", "agendaCraigReformer");
  renderAgenda("CraigCircuito", "agendaCraigCircuito");
  renderAgenda("Goyena", "agendaGoyena");
  renderAsignaciones();
}

// Genera opciones dinámicas para días y horas
document.getElementById("sedeSelect").addEventListener("change", function() {
  const sede = this.value;

  const diasSelect = document.getElementById("diasSelect");
  diasSelect.innerHTML = "";
  config[sede].dias.forEach(dia => {
    const opt = document.createElement("option");
    opt.value = dia;
    opt.text = dia;
    diasSelect.appendChild(opt);
  });

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
async function init() {
  document.getElementById("sedeSelect").value = "CraigReformer";
  document.getElementById("sedeSelect").dispatchEvent(new Event("change"));
  await fetchAsignaciones();
  actualizarTodo();
}

document.addEventListener("DOMContentLoaded", init);
