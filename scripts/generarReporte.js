
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ExcelJS = require('exceljs');

const BASE_URL = 'https://etnya.onrender.com/reportes';

// Función para obtener resumen
async function obtenerResumen() {
  const { data } = await axios.get(`${BASE_URL}/pagos-parciales-resumen`);
  return data;
}

// Función para obtener detalle por mes y sede
async function obtenerDetalle(mes, sede) {
  const { data } = await axios.get(`${BASE_URL}/pagos-parciales-detalle`, {
    params: { mes, sede }
  });
  return data;
}

// Función para calcular esperado usando backend
async function obtenerEsperado(mes, sede) {
  const { data } = await axios.get(`${BASE_URL}/recaudacion-por-sede`);
  // Filtramos el esperado real para ese mes y sede
  const registro = data.find(r => r.mes === mes && r.sede === sede);
  return registro ? registro.esperado : 0;
}

async function generarExcel() {
  const resumen = await obtenerResumen();
  const workbook = new ExcelJS.Workbook();

  // Hoja Resumen
  const hojaResumen = workbook.addWorksheet('Resumen');
  hojaResumen.columns = [
    { header: 'Mes', key: 'mes', width: 12 },
    { header: 'Sede', key: 'sede', width: 15 },
    { header: 'Cantidad', key: 'cantidad', width: 10 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Esperado', key: 'esperado', width: 12 },
    { header: 'Diferencia', key: 'diferencia', width: 12 }
  ];

  for (const r of resumen) {
    const esperado = await obtenerEsperado(r.mes, r.sede);
    hojaResumen.addRow({
      mes: r.mes,
      sede: r.sede,
      cantidad: r.cantidad,
      total: r.total,
      esperado,
      diferencia: r.total - esperado
    });
  }

  // Hoja Detalle
  const hojaDetalle = workbook.addWorksheet('Detalle');
  hojaDetalle.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Número Alumno', key: 'numero_alumno', width: 15 },
    { header: 'Apellido', key: 'apellido', width: 15 },
    { header: 'Nombre', key: 'nombre', width: 15 },
    { header: 'Sede', key: 'sede', width: 12 },
    { header: 'Monto', key: 'monto', width: 12 },
    { header: 'Fecha Pago', key: 'fecha_pago', width: 15 },
    { header: 'Monto Esperado', key: 'esperado', width: 15 },
    { header: 'Diferencia', key: 'diferencia', width: 12 }
  ];

  for (const r of resumen) {
    const detalle = await obtenerDetalle(r.mes, r.sede);
    const esperado = await obtenerEsperado(r.mes, r.sede);
    for (const d of detalle) {
      hojaDetalle.addRow({
        id: d.id,
        numero_alumno: d.numero_alumno,
        apellido: d.apellido,
        nombre: d.nombre,
        sede: d.sede,
        monto: d.monto,
        fecha_pago: d.fecha_pago,
        esperado,
        diferencia: d.monto - esperado
      });
    }
  }

  const filePath = path.join(__dirname, 'reporte_pagos_parciales.xlsx');
  await workbook.xlsx.writeFile(filePath);
  console.log(`✅ Reporte generado: ${filePath}`);
}

