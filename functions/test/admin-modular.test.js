// firebase-admin 14 eliminó la API con espacio de nombres (admin.firestore(),
// admin.auth()…): en ejecución da «undefined is not a function». Este test
// impide que vuelva a entrar en el código desplegable o en los scripts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FORBIDDEN = [
  /\badmin\.(firestore|auth|storage|messaging|database|initializeApp|apps|app|credential|instanceId|machineLearning|projectManagement|remoteConfig|securityRules|appCheck|installations|eventarc|functions)\b/,
  /require\(\s*['"]firebase-admin['"]\s*\)/,
  /require\(\s*['"]firebase-functions(\/v1)?['"]\s*\)/,
];

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'test' ? [] : sourceFiles(full);
    return /\.(c|m)?js$/.test(entry.name) ? [full] : [];
  });
}

test('sin API con espacio de nombres de firebase-admin ni firebase-functions v1', () => {
  const offenders = [];
  for (const file of sourceFiles(ROOT)) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (FORBIDDEN.some((re) => re.test(line))) offenders.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});
