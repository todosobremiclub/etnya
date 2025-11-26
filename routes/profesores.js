
const express = require("express");
const router = express.Router();
const pool = require("../db");

// Obtener todas las asignaciones
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM asignaciones ORDER BY id DESC;");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener asignaciones" });
  }
});

// Crear una asignación
router.post("/", async (req, res) => {
  const { profesor, sede, dias, horas, observaciones } = req.body;
  if (!profesor || !sede || !Array.isArray(dias) || !Array.isArray(horas)) {
    return res.status(400).json({ error: "Datos inválidos" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO asignaciones (profesor, sede, dias, horas, observaciones)
       VALUES ($1, $2, $3, $4, $5) RETURNING *;`,
      [profesor, sede, dias, horas, observaciones || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear asignación" });
  }
});

// Eliminar una asignación
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM asignaciones WHERE id = $1;", [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar asignación" });
  }
});

module.exports = router;
