// routes/notificacionesRoutes.js
const express = require("express");
const pool = require("../db"); // ✅ conexión a PostgreSQL
const admin = require("../firebase.js"); // ✅ inicialización de Firebase Admin

const router = express.Router();

// =======================================================
// 🔹 POST /notificaciones/enviar
// Guarda la notificación en la base de datos y la envía por FCM
// =======================================================
router.post("/enviar", async (req, res) => {
  const { titulo, mensaje } = req.body;

  // Validación de campos obligatorios
  if (!titulo || !mensaje) {
    return res
      .status(400)
      .json({ error: "El título y el mensaje son obligatorios." });
  }

  try {
    // 1️⃣ Guardar en la base de datos
    const result = await pool.query(
      "INSERT INTO notificaciones (titulo, mensaje) VALUES ($1, $2) RETURNING *",
      [titulo.trim(), mensaje.trim()]
    );

    // 2️⃣ Construir payload para FCM
    const payload = {
      notification: {
        title: titulo,
        body: mensaje,
      },
      topic: "general", // todos los dispositivos suscritos a este topic
    };

    // 3️⃣ Enviar la notificación push
    try {
      await admin.messaging().send(payload);
      console.log(`✅ Notificación enviada: "${titulo}"`);
    } catch (fcmError) {
      console.error("⚠️ Error al enviar push FCM:", fcmError.message);
      // No detenemos el flujo si FCM falla, igual guardamos en DB
    }

    // 4️⃣ Respuesta al cliente
    res.json({
      ok: true,
      mensaje: "Notificación guardada y enviada correctamente.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error general al procesar la notificación:", error);
    res.status(500).json({ error: "Error al enviar la notificación." });
  }
});

// =======================================================
// 🔹 GET /notificaciones
// Devuelve todas las notificaciones guardadas en la base de datos
// =======================================================
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
