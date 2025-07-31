router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM cuentas ORDER BY nombre');
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const { nombre } = req.body;
  await pool.query('INSERT INTO cuentas (nombre) VALUES ($1)', [nombre]);
  res.sendStatus(200);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM cuentas WHERE id = $1', [req.params.id]);
  res.sendStatus(200);
});
