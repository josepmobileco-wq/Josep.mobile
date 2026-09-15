/**
 * JOSEP.MOBILE - Worker de pagos Bold + sincronización POS
 * =========================================================
 * Rutas:
 *   POST /                  → firma de integridad (checkout web) [compatible]
 *   POST /registrar-pedido  → guarda pedido pendiente (lo llama la web)
 *   POST /webhook-bold      → recibe eventos de Bold (registrar en panel Bold)
 *
 * Secretos del Worker (Settings → Variables → Secrets):
 *   BOLD_SECRET_KEY  → llave secreta Bold (producción)
 *   GITHUB_TOKEN     → token classic con permiso `repo` (para pedidos-web.json)
 * Variables (texto normal, con estos valores por defecto):
 *   GH_OWNER=josepmobileco-wq  GH_REPO=Josep.mobile
 *   GH_BRANCH=main  GH_PATH_PEDIDOS=pedidos-web.json
 */

const ORIGEN_PERMITIDO = 'https://josepmobileco-wq.github.io';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ORIGEN_PERMITIDO,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

async function sha256Hex(texto) {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function b64decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---- GitHub: lee pedidos-web.json ----
async function ghLeerPedidos(env) {
  const { GH_OWNER = 'josepmobileco-wq', GH_REPO = 'Josep.mobile', GH_BRANCH = 'main', GH_PATH_PEDIDOS = 'pedidos-web.json' } = env;
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH_PEDIDOS}?ref=${encodeURIComponent(GH_BRANCH)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'POS-Josep-Worker',
    },
  });
  if (res.status === 404) return { pedidos: [], sha: null };
  if (!res.ok) throw new Error(`GitHub ${res.status} al leer pedidos`);
  const data = await res.json();
  return { pedidos: JSON.parse(b64decode(data.content)).pedidos || [], sha: data.sha };
}

// ---- GitHub: guarda pedidos-web.json ----
async function ghGuardarPedidos(env, pedidos, sha, mensaje) {
  const { GH_OWNER = 'josepmobileco-wq', GH_REPO = 'Josep.mobile', GH_BRANCH = 'main', GH_PATH_PEDIDOS = 'pedidos-web.json' } = env;
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH_PEDIDOS}`;
  const body = {
    message: mensaje,
    content: b64encode(JSON.stringify({ pedidos }, null, 2)),
    branch: GH_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'POS-Josep-Worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} al guardar pedidos`);
}

// ---- Verifica firma HMAC del webhook Bold ----
async function verificarFirmaBold(rawBody, firmaRecibida, secreto) {
  if (!firmaRecibida || !secreto) return false;
  const encoded = b64encode(rawBody);
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== firmaRecibida.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ firmaRecibida.charCodeAt(i);
  return diff === 0;
}

// ---- POST / : firma de integridad (checkout) ----
async function handleFirma(request, env) {
  try {
    const { orderId, amount, currency } = await request.json();
    if (typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(orderId)) {
      throw new Error('orderId inválido');
    }
    const monto = Number(amount);
    if (!Number.isInteger(monto) || monto < 1000) {
      throw new Error('amount inválido (entero >= 1000)');
    }
    const moneda = currency === 'USD' ? 'USD' : 'COP';
    if (!env.BOLD_SECRET_KEY) {
      throw new Error('Falta configurar BOLD_SECRET_KEY en el Worker');
    }
    const integritySignature = await sha256Hex(`${orderId}${monto}${moneda}${env.BOLD_SECRET_KEY}`);
    return json({ orderId, amount: monto, currency: moneda, integritySignature });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

// ---- POST /registrar-pedido : la web avisa que abrió un checkout ----
async function handleRegistrar(request, env) {
  try {
    const { orderId, items, total, cliente } = await request.json();
    if (typeof orderId !== 'string' || !/^JM-[A-Za-z0-9_-]{1,55}$/.test(orderId)) {
      throw new Error('orderId inválido');
    }
    if (!Array.isArray(items) || !items.length || items.length > 50) {
      throw new Error('items inválidos');
    }
    const monto = Number(total);
    if (!Number.isInteger(monto) || monto < 1000 || monto > 10000000) {
      throw new Error('total inválido');
    }
    if (!env.GITHUB_TOKEN) {
      throw new Error('Falta configurar GITHUB_TOKEN en el Worker');
    }
    const limpios = items.slice(0, 50).map((i) => ({
      id: String(i.id || '').slice(0, 80),
      nombre: String(i.nombre || 'Producto').slice(0, 80),
      cantidad: Math.max(1, Math.min(99, parseInt(i.cantidad, 10) || 1)),
      precioNum: Math.max(0, parseInt(i.precioNum, 10) || 0),
    }));
    const { pedidos, sha } = await ghLeerPedidos(env);
    const existente = pedidos.find((p) => p.orderId === orderId);
    const registro = {
      orderId,
      items: limpios,
      total: monto,
      cliente: {
        nombre: String((cliente && cliente.nombre) || '').slice(0, 60),
        telefono: String((cliente && cliente.telefono) || '').replace(/[^0-9]/g, '').slice(0, 15),
        correo: String((cliente && cliente.correo) || '').slice(0, 80),
      },
      estado: (existente && existente.estado === 'pagado') ? 'pagado' : 'pendiente',
      aplicado: !!(existente && existente.aplicado),
      paymentId: (existente && existente.paymentId) || null,
      metodo: (existente && existente.metodo) || null,
      fecha: (existente && existente.fecha) || new Date().toISOString(),
    };
    const nuevos = existente ? pedidos.map((p) => (p.orderId === orderId ? registro : p)) : [...pedidos, registro];
    // Poda: máximo 200 registros (conserva los no aplicados)
    const podados = nuevos.filter((p) => !p.aplicado).slice(-200)
      .concat(nuevos.filter((p) => p.aplicado).slice(-50));
    await ghGuardarPedidos(env, podados, sha, `Web: pedido ${orderId} registrado`);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

// ---- POST /webhook-bold : eventos de Bold ----
async function handleWebhook(request, env) {
  let raw = '';
  try {
    raw = await request.text();
    const firma = request.headers.get('x-bold-signature') || '';
    // Producción usa la secreta; pruebas usan clave vacía (según docs Bold)
    const okProd = env.BOLD_SECRET_KEY && await verificarFirmaBold(raw, firma, env.BOLD_SECRET_KEY);
    const okTest = await verificarFirmaBold(raw, firma, '');
    if (!okProd && !okTest) {
      return json({ error: 'Firma inválida' }, 400);
    }
    const evento = JSON.parse(raw);
    if (evento.type !== 'SALE_APPROVED') {
      return json({ ok: true, ignorado: evento.type });
    }
    const orderId = evento.data && evento.data.metadata && evento.data.metadata.reference;
    if (typeof orderId !== 'string' || !orderId.startsWith('JM-')) {
      return json({ ok: true, ignorado: 'sin referencia JM' });
    }
    if (!env.GITHUB_TOKEN) {
      throw new Error('Falta configurar GITHUB_TOKEN en el Worker');
    }
    const { pedidos, sha } = await ghLeerPedidos(env);
    const idx = pedidos.findIndex((p) => p.orderId === orderId);
    const datosPago = {
      estado: 'pagado',
      paymentId: evento.subject || null,
      metodo: (evento.data && evento.data.payment_method) || null,
      email: (evento.data && evento.data.payer_email) || null,
      total: (evento.data && evento.data.amount && evento.data.amount.total) || null,
      fechaPago: new Date().toISOString(),
    };
    let pedidos2;
    if (idx >= 0) {
      const actual = pedidos[idx];
      // Idempotencia: si ya está pagado con el mismo pago, no duplicar
      if (actual.estado === 'pagado' && actual.paymentId === datosPago.paymentId) {
        return json({ ok: true, duplicado: true });
      }
      pedidos2 = pedidos.map((p, i) => (i === idx ? { ...p, ...datosPago } : p));
    } else {
      // Pago sin registro previo (el registro falló o se pagó directo)
      pedidos2 = [...pedidos, {
        orderId, items: [], total: datosPago.total || 0,
        cliente: { nombre: '', telefono: '', correo: datosPago.email || '' },
        ...datosPago, aplicado: false, sinDetalle: true,
        fecha: new Date().toISOString(),
      }];
    }
    await ghGuardarPedidos(env, pedidos2, sha, `Bold: pago aprobado ${orderId}`);
    return json({ ok: true });
  } catch (e) {
    // 500 → Bold reintenta (hasta 5 veces en 24h)
    return json({ error: e.message }, 500);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const url = new URL(request.url);
    if (request.method !== 'POST') {
      return json({ error: 'Usa POST' }, 405);
    }
    if (url.pathname === '/registrar-pedido') return handleRegistrar(request, env);
    if (url.pathname === '/webhook-bold') return handleWebhook(request, env);
    return handleFirma(request, env);
  },
};
