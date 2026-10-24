// Convierte documentos de la API REST de Firestore (valores con tipo) a
// objetos normales. Lo usa la mudanza de Pachote, que lee el proyecto antiguo
// por REST con el token del propio usuario.
const { Timestamp, GeoPoint } = require('firebase-admin/firestore');

function fromValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return Timestamp.fromDate(new Date(v.timestampValue));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields);
  if ('geoPointValue' in v) return new GeoPoint(v.geoPointValue.latitude || 0, v.geoPointValue.longitude || 0);
  if ('bytesValue' in v) return v.bytesValue;
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}

function fromFields(fields) {
  const out = {};
  Object.entries(fields || {}).forEach(([k, v]) => { out[k] = fromValue(v); });
  return out;
}

/** Documento REST → { id, data }. */
const fromDocument = (d) => ({ id: String(d.name || '').split('/').pop(), data: fromFields(d.fields) });

module.exports = { fromValue, fromFields, fromDocument };
