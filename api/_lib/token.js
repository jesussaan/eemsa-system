import crypto from 'crypto';

const b64url = (buf) => buf.toString('base64url');

export function firmarToken(role, horasValidez = 12) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET no configurado');
  const payload = { role, exp: Date.now() + horasValidez * 3600 * 1000 };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
  const firma = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${firma}`;
}

export function verificarToken(token, rolesPermitidos) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token || typeof token !== 'string') return null;
  const [payloadB64, firma] = token.split('.');
  if (!payloadB64 || !firma) return null;

  const firmaEsperada = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(firmaEsperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try { payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()); }
  catch { return null; }

  if (!payload.exp || Date.now() > payload.exp) return null;
  if (rolesPermitidos && !rolesPermitidos.includes(payload.role)) return null;
  return payload;
}

export function tokenDesdeHeader(req) {
  const auth = req.headers['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}
