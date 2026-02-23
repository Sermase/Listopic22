const path = require('path');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const distPath = path.join(__dirname, 'frontend', 'dist');

app.use(express.static(distPath));

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Listopic server listening on http://localhost:${port}`);
});
