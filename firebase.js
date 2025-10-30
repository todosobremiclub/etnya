// routes/notificacionesRoutes.js
const express = require("express");
const pool = require("../db");
const admin = require("../firebase.js");

const router = express.Router();

// ===============================
// 🔹 Enviar una notificación push
// ===============================
router.post("/enviar", async (req, res) => {
  const { titulo, mensaje } = req.body;

  if (!titulo || !mensaje) {
    return res
      .status(400)
      .json({ error: "El título y el mensaje son obligatorios." });
  }

  try {
    // 1️⃣ Guardar en la base de datos
    const result = await pool.query(
      "INSERT INTO notificaciones (titulo, mensaje) VALUES ($1, $2) RETURNING *",
      [titulo, mensaje]
    );

    // 2️⃣ Enviar la notificación a todos los dispositivos suscritos al topic "general"
    const payload = {
      notification: {
        title: titulo,
        body: mensaje,
      },
      topic: "general", // todos los que estén suscritos a este topic
    };

    await admin.messaging().send(payload);

    res.json({
      ok: true,
      mensaje: "Notificación enviada y guardada correctamente.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error al enviar notificación:", error);
    res.status(500).json({ error: "Error al enviar la notificación." });
  }
});

// ===============================
// 🔹 Listar notificaciones
// ===============================
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notificaciones ORDER BY fecha DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error al obtener notificaciones:", error);
    res.status(500).json({ error: "Error al obtener notificaciones." });
  }
});

module.exports = router;

