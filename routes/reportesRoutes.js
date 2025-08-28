const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Monto por cuenta
router.get('/por-cuenta-filtrado', async (req, res) => {
  const { mes, anio } = req.query;

  try {
    const resultados = await pool.query(
      `SELECT cuenta, SUM(monto) AS total
       FROM pagos
       WHERE EXTRACT(MONTH FROM fecha_pago) = $1
         AND EXTRACT(YEAR FROM fecha_pago) = $2
       GROUP BY cuenta
       ORDER BY cuenta`,
      [mes, anio]
    );
    res.json(resultados.rows);
  } catch (err) {
    console.error('Error al obtener reporte por cuenta filtrado:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// 2. Monto por mes pagado (corregido)
router.get('/por-mes-pagado', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT mes_pagado AS mes, SUM(monto) AS total
      FROM pagos
      GROUP BY mes_pagado
      ORDER BY mes_pagado
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /por-mes-pagado:', err);
    res.status(500).send('Error en reporte por mes pagado');
  }
});

// 3. Monto por fecha de pago
router.get('/por-fecha-pago', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', fecha_pago), 'YYYY-MM') AS mes, SUM(monto) AS total
      FROM pagos
      WHERE fecha_pago IS NOT NULL
      GROUP BY DATE_TRUNC('month', fecha_pago)
      ORDER BY mes
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /por-fecha-pago:', err);
    res.status(500).send('Error en reporte por fecha de pago');
  }
});


// 4. Alumnos por sede
router.get('/alumnos-por-sede', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sede, COUNT(*) AS cantidad
      FROM alumnos
      WHERE activo = true
      GROUP BY sede
      ORDER BY cantidad DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /alumnos-por-sede:', err);
    res.status(500).send('Error en reporte de alumnos por sede');
  }
});

// 5. Alumnos por modalidad
router.get('/alumnos-por-modalidad', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tipo_clase AS modalidad, COUNT(*) AS cantidad
      FROM alumnos
      WHERE activo = true
      GROUP BY modalidad
      ORDER BY cantidad DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /alumnos-por-modalidad:', err);
    res.status(500).send('Error en reporte de alumnos por modalidad');
  }
});

// 6. Total anual por cuenta
router.get('/total-anual-por-cuenta', async (req, res) => {
  const { anio } = req.query;

  try {
    const result = await pool.query(`
      SELECT SUM(monto) AS total
      FROM pagos
      WHERE EXTRACT(YEAR FROM fecha_pago) = $1
    `, [anio]);

    res.json({ total: result.rows[0].total || 0 });
  } catch (err) {
    console.error('Error en /total-anual-por-cuenta:', err);
    res.status(500).json({ error: 'Error al obtener total anual por cuenta' });
  }
});

// 7. Alumnos por mes de ingreso (conteo)
router.get('/ingresos-por-mes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(fecha_inicio, 'YYYY-MM') AS mes,
        COUNT(*) AS cantidad
      FROM alumnos
      WHERE fecha_inicio IS NOT NULL
      GROUP BY mes
      ORDER BY mes DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /ingresos-por-mes:', err);
    res.status(500).send('Error en reporte por fecha de ingreso');
  }
});

// 8. Detalle de alumnos por mes de ingreso
router.get('/detalle-ingresos', async (req, res) => {
  const { mes } = req.query;
  try {
    const result = await pool.query(`
      SELECT
        numero_alumno AS "Número",
        nombre AS "Nombre",
        apellido AS "Apellido",
        TO_CHAR(fecha_inicio, 'DD/MM/YYYY') AS "Fecha ingreso"
      FROM alumnos
      WHERE TO_CHAR(fecha_inicio, 'YYYY-MM') = $1
      ORDER BY apellido, nombre
    `, [mes]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error en /detalle-ingresos:', err);
    res.status(500).send('Error en detalle por fecha de ingreso');
  }
});

// 9. Alumnos por modalidad seleccionada
router.get('/detalle-modalidad', async (req, res) => {
  const { modalidad } = req.query;
  try {
    const result = await pool.query(`
      SELECT 
        numero_alumno AS "Número",
        nombre AS "Nombre",
        apellido AS "Apellido"
      FROM alumnos
      WHERE tipo_clase = $1 AND activo = true
      ORDER BY apellido, nombre
    `, [modalidad]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error en /detalle-modalidad:', err);
    res.status(500).send('Error al obtener detalle de modalidad');
  }
});

/// 10. Recaudación por sede y mes pagado con monto esperado
router.get('/recaudacion-por-sede', async (req, res) => {
  try {
    // 1. Obtener montos recaudados por sede y mes
    const pagos = await pool.query(`
  SELECT 
    p.mes_pagado AS mes,
    a.sede,
    SUM(p.monto) AS total
  FROM pagos p
  JOIN alumnos a ON p.alumno_id = a.id
  WHERE a.activo = true
  GROUP BY p.mes_pagado, a.sede
  ORDER BY mes DESC, a.sede
`);


    // 2. Obtener modalidades con sus precios
    const modalidades = await pool.query(`SELECT modalidad, precio FROM tipos_clase`);

    // 3. Obtener alumnos activos (NO becados) con sede y tipo de clase
const alumnos = await pool.query(`
  SELECT a.sede, a.tipo_clase
  FROM alumnos a
  LEFT JOIN becados b ON b.alumno_id = a.id
  WHERE a.activo = true
    AND b.alumno_id IS NULL
`);


    // 4. Agrupar alumnos por sede y modalidad
    const agrupado = {}; // { 'Craig Reformer': { 'Reformer': 4, ... }, ... }

    for (let a of alumnos.rows) {
      const sede = a.sede;
      const modalidad = a.tipo_clase;

      if (!sede || !modalidad) continue;

      if (!agrupado[sede]) agrupado[sede] = {};
      if (!agrupado[sede][modalidad]) agrupado[sede][modalidad] = 0;

      agrupado[sede][modalidad]++;
    }

    // 5. Mapear precios por modalidad
    const precios = {};
    for (let m of modalidades.rows) {
      precios[m.modalidad] = parseFloat(m.precio) || 0;
    }

    // 6. Calcular monto esperado por sede
    const esperadosPorSede = {};
    for (let sede in agrupado) {
      let subtotal = 0;
      for (let modalidad in agrupado[sede]) {
        const cantidad = agrupado[sede][modalidad];
        const precio = precios[modalidad] || 0;
        subtotal += cantidad * precio;
      }
      esperadosPorSede[sede] = subtotal;
    }

    // 7. Construir resultado final
    const resultado = pagos.rows.map(p => ({
      mes: p.mes,
      sede: p.sede,
      total: parseFloat(p.total),
      esperado: esperadosPorSede[p.sede] || 0
    }));

    res.json(resultado);
  } catch (err) {
    console.error('Error en /recaudacion-por-sede:', err);
    res.status(500).json({ error: 'Error al calcular recaudación por sede' });
  }
});

// 11. Gastos por cuenta (mensual, todos los meses)
router.get('/gastos-por-cuenta-mensual', async (req, res) => {
  try {
    const q = `
      SELECT
        TO_CHAR(DATE_TRUNC('month', fecha), 'YYYY-MM') AS mes,
        COALESCE(cuenta, 'Sin cuenta') AS cuenta,
        SUM(monto) AS total
      FROM gastos
      GROUP BY 1, 2
      ORDER BY 1 DESC, 2
    `;
    const { rows } = await pool.query(q);
    res.json(rows);
  } catch (err) {
    console.error('Error en /gastos-por-cuenta-mensual:', err);
    res.status(500).json({ error: 'Error al obtener gastos por cuenta mensual' });
  }
});

// 12. Gastos por cuenta (filtrado por mes/año)
router.get('/gastos-por-cuenta-filtrado', async (req, res) => {
  const { mes, anio } = req.query; // mes: 1..12  |  anio: 2025, etc.
  if (!mes || !anio) return res.status(400).json({ error: 'Faltan mes y anio' });
  try {
    const q = `
      SELECT
        COALESCE(cuenta, 'Sin cuenta') AS cuenta,
        SUM(monto) AS total
      FROM gastos
      WHERE EXTRACT(MONTH FROM fecha) = $1
        AND EXTRACT(YEAR  FROM fecha) = $2
      GROUP BY 1
      ORDER BY 1
    `;
    const { rows } = await pool.query(q, [mes, anio]);
    res.json(rows);
  } catch (err) {
    console.error('Error en /gastos-por-cuenta-filtrado:', err);
    res.status(500).json({ error: 'Error al obtener gastos por cuenta (filtrado)' });
  }
});

// 13) Pagos parciales: RESUMEN por mes (YYYY-MM) y sede, con TOTAL en pesos
router.get('/pagos-parciales-resumen', async (req, res) => {
  try {
    const q = `
      WITH pagos_norm AS (
        SELECT
          p.id,
          p.alumno_id,
          p.monto,
          p.fecha_pago,
          COALESCE(p.pago_parcial, false) AS pago_parcial,
          -- Normalizamos mes_pagado a 'YYYY-MM' venga como TEXT, 'YYYY-MM-DD' o DATE
          to_char(
            CASE
              WHEN (p.mes_pagado::text) ~ '^[0-9]{4}-[0-9]{2}$'
                THEN to_date(p.mes_pagado::text, 'YYYY-MM')
              WHEN (p.mes_pagado::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                THEN to_date(p.mes_pagado::text, 'YYYY-MM-DD')
              WHEN pg_typeof(p.mes_pagado) = 'date'::regtype
                THEN p.mes_pagado::date
              ELSE NULL
            END,
            'YYYY-MM'
          ) AS ym
        FROM pagos p
      )
      SELECT 
        pn.ym  AS mes,
        a.sede AS sede,
        COUNT(*)         AS cantidad,
        SUM(pn.monto)    AS total     -- ← NUEVO: total en pesos
      FROM pagos_norm pn
      JOIN alumnos a ON a.id = pn.alumno_id
      LEFT JOIN tipos_clase t
        ON lower(trim(a.tipo_clase)) = lower(trim(t.modalidad))
      WHERE pn.ym IS NOT NULL
        AND (pn.pago_parcial = true OR (t.precio IS NOT NULL AND pn.monto < t.precio))
      GROUP BY 1, 2
      ORDER BY 1 DESC, 2;
    `;
    const { rows } = await pool.query(q);
    res.json(rows);
  } catch (err) {
    console.error('Error /reportes/pagos-parciales-resumen', err);
    res.status(500).send('Error en pagos parciales (resumen)');
  }
});

// 14) Pagos parciales: DETALLE por mes (YYYY-MM) y sede
router.get('/pagos-parciales-detalle', async (req, res) => {
  const { mes, sede } = req.query; // ej: '2025-08'
  try {
    const q = `
      WITH pagos_norm AS (
        SELECT
          p.id,
          p.alumno_id,
          p.monto,
          p.fecha_pago,
          COALESCE(p.pago_parcial, false) AS pago_parcial,
          to_char(
            CASE
              WHEN (p.mes_pagado::text) ~ '^[0-9]{4}-[0-9]{2}$'
                THEN to_date(p.mes_pagado::text, 'YYYY-MM')
              WHEN (p.mes_pagado::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                THEN to_date(p.mes_pagado::text, 'YYYY-MM-DD')
              WHEN pg_typeof(p.mes_pagado) = 'date'::regtype
                THEN p.mes_pagado::date
              ELSE NULL
            END,
            'YYYY-MM'
          ) AS ym
        FROM pagos p
      )
      SELECT 
        pn.id,
        a.numero_alumno,
        a.apellido,
        a.nombre,
        a.sede,
        pn.monto,
        pn.fecha_pago
      FROM pagos_norm pn
      JOIN alumnos a ON a.id = pn.alumno_id
      LEFT JOIN tipos_clase t
        ON lower(trim(a.tipo_clase)) = lower(trim(t.modalidad))
      WHERE pn.ym = $1
        AND a.sede = $2
        AND (pn.pago_parcial = true OR (t.precio IS NOT NULL AND pn.monto < t.precio))
      ORDER BY a.apellido, a.nombre;
    `;
    const { rows } = await pool.query(q, [mes, sede]);
    res.json(rows);
  } catch (err) {
    console.error('Error /reportes/pagos-parciales-detalle', err);
    res.status(500).send('Error en pagos parciales (detalle)');
  }
});




module.exports = router;
