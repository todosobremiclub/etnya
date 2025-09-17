const express = require('express');
const router = express.Router();
const pool = require('../db');

// === SNAPSHOT DE ESPERADOS MENSUALES ===
async function ensureTablaEsperados() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS esperados_mensuales (
      mes CHAR(7) NOT NULL,             -- 'YYYY-MM'
      sede TEXT NOT NULL,               -- 'Craig' | 'Goyena' | 'General' | 'GLOBAL'
      valor NUMERIC NOT NULL,           -- esperado congelado
      frozen_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (mes, sede)
    );
  `);
}

function yyyymmHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function esMesCerrado(mes) {
  // mes: 'YYYY-MM' ; está cerrado si es < mes actual
  return String(mes) < yyyymmHoy();
}

// Calcula esperado actual por sede (excluye becados, sólo activos)
async function calcularEsperadosActualesPorSede() {
  const mRes = await pool.query(`SELECT modalidad, precio FROM tipos_clase`);
  const precios = {};
  (mRes.rows||[]).forEach(r => precios[(r.modalidad||'').trim()] = Number(r.precio||0));

  const aRes = await pool.query(`
    SELECT a.sede, a.tipo_clase
    FROM alumnos a
    LEFT JOIN becados b ON b.alumno_id = a.id
    WHERE a.activo = true AND b.alumno_id IS NULL
  `);

  const porSede = {}; // { Craig: subtotal, Goyena: subtotal, General: subtotal }
  (aRes.rows||[]).forEach(a => {
    const sede = normalizeSedeTxt(a.sede);
    const mod  = (a.tipo_clase||'').trim();
    if (!mod) return;
    porSede[sede] = (porSede[sede]||0) + (precios[mod]||0);
  });

  const global = Object.values(porSede).reduce((s,n)=>s+Number(n||0),0);
  return { porSede, global };
}

// Asegura snapshot para un mes dado (idempotente: no pisa si ya existe)
async function asegurarSnapshotMes(mes) {
  await ensureTablaEsperados();

  // Si ya hay GLOBAL, asumimos que ese mes quedó congelado
  const ya = await pool.query(`SELECT 1 FROM esperados_mensuales WHERE mes=$1 AND sede='GLOBAL' LIMIT 1`, [mes]);
  if (ya.rowCount > 0) return;

  const { porSede, global } = await calcularEsperadosActualesPorSede();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sede of Object.keys(porSede)) {
      await client.query(`
        INSERT INTO esperados_mensuales (mes, sede, valor)
        VALUES ($1, $2, $3)
        ON CONFLICT (mes, sede) DO NOTHING
      `, [mes, sede, porSede[sede]]);
    }
    await client.query(`
      INSERT INTO esperados_mensuales (mes, sede, valor)
      VALUES ($1, 'GLOBAL', $2)
      ON CONFLICT (mes, sede) DO NOTHING
    `, [mes, global]);
    await client.query('COMMIT');
  } catch(e){
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Devuelve esperado (número) priorizando snapshot si está cerrado; si falta y es cerrado, lo crea
async function getEsperadoMesGlobal(mes) {
  await ensureTablaEsperados();
  if (esMesCerrado(mes)) {
    await asegurarSnapshotMes(mes);
    const r = await pool.query(`SELECT valor FROM esperados_mensuales WHERE mes=$1 AND sede='GLOBAL'`, [mes]);
    return Number(r.rows?.[0]?.valor || 0);
  } else {
    const { global } = await calcularEsperadosActualesPorSede();
    return global;
  }
}

// Igual que arriba pero por sede
async function getEsperadoMesSede(mes, sede) {
  await ensureTablaEsperados();
  const sedeNorm = normalizeSedeTxt(sede);
  if (esMesCerrado(mes)) {
    await asegurarSnapshotMes(mes);
    const r = await pool.query(`SELECT valor FROM esperados_mensuales WHERE mes=$1 AND sede=$2`, [mes, sedeNorm]);
    return Number(r.rows?.[0]?.valor || 0);
  } else {
    const { porSede } = await calcularEsperadosActualesPorSede();
    return Number(porSede[sedeNorm] || 0);
  }
}



// -- Asegura la tabla de pagos de prueba (por si aún no existe)
async function ensureTablaPagosPrueba() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos_prueba (
      id SERIAL PRIMARY KEY,
      comentario TEXT,
      monto NUMERIC NOT NULL,
      cuenta TEXT NOT NULL,
      sede TEXT NOT NULL DEFAULT 'General',
      fecha_pago TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

// -- Normaliza sede a sólo Craig / Goyena / General
function normalizeSedeTxt(s) {
  const t = String(s || '').toLowerCase();
  if (t.includes('goyena')) return 'Goyena';
  if (t.includes('craig'))  return 'Craig';
  return 'General';
}


// 1. Monto por cuenta
router.get('/por-cuenta-filtrado', async (req, res) => {
  const { mes, anio } = req.query;
  try {
    await ensureTablaPagosPrueba();

    const q = `
      SELECT cuenta, SUM(monto) AS total
      FROM (
        SELECT p.cuenta, p.monto, p.fecha_pago
        FROM pagos p
        WHERE EXTRACT(MONTH FROM p.fecha_pago) = $1
          AND EXTRACT(YEAR  FROM p.fecha_pago) = $2

        UNION ALL

        SELECT pp.cuenta, pp.monto, pp.fecha_pago
        FROM pagos_prueba pp
        WHERE EXTRACT(MONTH FROM pp.fecha_pago) = $1
          AND EXTRACT(YEAR  FROM pp.fecha_pago) = $2
      ) x
      GROUP BY cuenta
      ORDER BY cuenta;
    `;
    const { rows } = await pool.query(q, [mes, anio]);
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener reporte por cuenta filtrado:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// 2. Monto por mes pagado (con ESPERADO congelado y diferencia)
router.get('/por-mes-pagado', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT mes_pagado AS mes, SUM(monto) AS total
      FROM pagos
      GROUP BY mes_pagado
      ORDER BY mes_pagado
    `);

        const filas = [];
    for (const row of result.rows) {
      const mes = String(row.mes || '').slice(0,7); // normalizo a 'YYYY-MM'
      if (!mes.match(/^\d{4}-\d{2}$/)) continue;

      const total = Number(row.total || 0);
      const esperado = await getEsperadoMesGlobal(mes); // ← usa snapshot si está cerrado
      filas.push({
        mes,
        total,
        esperado,
        diferencia: total - esperado
      });
    }
    res.json(filas);

  } catch (err) {
    console.error('Error en /por-mes-pagado:', err);
    res.status(500).send('Error en reporte por mes pagado');
  }
});

// 3. Monto por fecha de pago
router.get('/por-fecha-pago', async (_req, res) => {
  try {
    await ensureTablaPagosPrueba();

    const q = `
      SELECT TO_CHAR(DATE_TRUNC('month', fecha_pago), 'YYYY-MM') AS mes, SUM(monto) AS total
      FROM (
        SELECT p.fecha_pago, p.monto FROM pagos p WHERE p.fecha_pago IS NOT NULL
        UNION ALL
        SELECT pp.fecha_pago, pp.monto FROM pagos_prueba pp WHERE pp.fecha_pago IS NOT NULL
      ) t
      GROUP BY DATE_TRUNC('month', fecha_pago)
      ORDER BY mes;
    `;
    const { rows } = await pool.query(q);
    res.json(rows);
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
    await ensureTablaPagosPrueba();

    const q = `
      SELECT SUM(monto) AS total
      FROM (
        SELECT p.monto, p.fecha_pago FROM pagos p
        UNION ALL
        SELECT pp.monto, pp.fecha_pago FROM pagos_prueba pp
      ) x
      WHERE EXTRACT(YEAR FROM fecha_pago) = $1;
    `;
    const { rows } = await pool.query(q, [anio]);
    res.json({ total: rows[0]?.total || 0 });
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
router.get('/recaudacion-por-sede', async (_req, res) => {
  try {
    await ensureTablaPagosPrueba();

    // 1) Recaudado: pagos normales por mes_pagado + pagos_prueba por fecha_pago, todo con sede normalizada
    const qRecaudado = `
      WITH p1 AS (
        SELECT
          p.mes_pagado AS mes,
          CASE
            WHEN lower(a.sede) LIKE '%goyena%' THEN 'Goyena'
            WHEN lower(a.sede) LIKE '%craig%'  THEN 'Craig'
            ELSE COALESCE(a.sede,'General')
          END AS sede,
          SUM(p.monto) AS total
        FROM pagos p
        JOIN alumnos a ON a.id = p.alumno_id
        WHERE a.activo = true
        GROUP BY 1,2
      ),
      p2 AS (
        SELECT
          TO_CHAR(DATE_TRUNC('month', pp.fecha_pago), 'YYYY-MM') AS mes,
          CASE
            WHEN lower(pp.sede) LIKE '%goyena%' THEN 'Goyena'
            WHEN lower(pp.sede) LIKE '%craig%'  THEN 'Craig'
            ELSE COALESCE(pp.sede,'General')
          END AS sede,
          SUM(pp.monto) AS total
        FROM pagos_prueba pp
        GROUP BY 1,2
      )
      SELECT mes, sede, SUM(total) AS total
      FROM (
        SELECT * FROM p1
        UNION ALL
        SELECT * FROM p2
      ) u
      GROUP BY mes, sede
      ORDER BY mes DESC, sede;
    `;
    const recaudado = await pool.query(qRecaudado);

        // 2) Resultado final usando snapshot/actual para 'esperado' por sede y mes
    const out = [];
    for (const r of recaudado.rows) {
      const mes  = String(r.mes || '').slice(0, 7);                 // 'YYYY-MM'
      const sede = normalizeSedeTxt(r.sede);                        // Craig | Goyena | General
      const total = Number(r.total || 0);

      // Usa snapshot si el mes está cerrado; si no, calcula en vivo
      const esperado = await getEsperadoMesSede(mes, sede);

      out.push({
        mes,
        sede,
        total,
        esperado,
        diferencia: total - esperado
      });
    }

    res.json(out);


    const alumnos = await pool.query(`
      SELECT a.sede, a.tipo_clase
      FROM alumnos a
      LEFT JOIN becados b ON b.alumno_id = a.id
      WHERE a.activo = true AND b.alumno_id IS NULL
    `);

    const agrupado = {};  // { 'Craig': { 'Combinaciones - 1R 1C': 3, ... }, 'Goyena': {...} }
    (alumnos.rows || []).forEach(a => {
      const sede = normalizeSedeTxt(a.sede);
      const mod  = (a.tipo_clase || '').trim();
      if (!sede || !mod) return;
      agrupado[sede] = agrupado[sede] || {};
      agrupado[sede][mod] = (agrupado[sede][mod] || 0) + 1;
    });

    const esperadosPorSede = {};
    for (const sede in agrupado) {
      let subtotal = 0;
      for (const mod in agrupado[sede]) {
        subtotal += (agrupado[sede][mod] || 0) * (precios[mod] || 0);
      }
      esperadosPorSede[sede] = subtotal;
    }

    // 3) Resultado final: agrega columna 'esperado'
    const resultado = recaudado.rows.map(r => ({
      mes: r.mes,
      sede: r.sede,
      total: Number(r.total || 0),
      esperado: esperadosPorSede[r.sede] || 0
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
