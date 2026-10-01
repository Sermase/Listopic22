// Copia de seguridad de los campos que un script va a cambiar, ANTES de escribir.
// Formato: { script, createdAt, project, entries: [{ path, before: { campo: valor | { __absent: true } } }] }
// Se restaura con: node scripts/restore-backup.js <archivo> [--apply]
const fs = require('fs');
const path = require('path');

const ABSENT = { __absent: true };

function snapshotFields(data, fields) {
  const before = {};
  fields.forEach((field) => {
    before[field] = Object.prototype.hasOwnProperty.call(data || {}, field) ? data[field] : ABSENT;
  });
  return before;
}

function writeBackup(script, entries) {
  const dir = path.join(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${script}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({
    script,
    createdAt: new Date().toISOString(),
    project: process.env.GCLOUD_PROJECT || 'listopic',
    entries,
  }, null, 1));
  return file;
}

module.exports = { ABSENT, snapshotFields, writeBackup };
