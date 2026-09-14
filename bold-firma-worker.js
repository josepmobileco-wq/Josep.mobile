/**
 * BOLD - Generador de firma de integridad (hash SHA256)
 * =====================================================
 * Despliega esto como Cloudflare Worker GRATIS. Tu LLAVE SECRETA
 * se guarda como variable secreta del Worker, NUNCA en este código
 * ni en tu página web.
 *
 * Recibe:  POST { orderId, amount, currency }
 * Devuelve: { orderId, amount, currency, integritySignature }
 *
 * Firma Bold: SHA256("{orderId}{amount}{currency}{llaveSecreta}")
 * Docs: https://www.developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-manual
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

async function sha256Hex(texto) {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    // Respuesta a pre-vuelo CORS del navegador
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Usa POST' }), {
        status: 405,
        headers: corsHeaders(),
      });
    }

    try {
      const { orderId, amount, currency } = await request.json();

      // Validaciones (orderId: alfanumérico + guiones, máx 60; amount entero >= 1000)
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

      const cadena = `${orderId}${monto}${moneda}${env.BOLD_SECRET_KEY}`;
      const integritySignature = await sha256Hex(cadena);

      return new Response(
        JSON.stringify({ orderId, amount: monto, currency: moneda, integritySignature }),
        { status: 200, headers: corsHeaders() }
      );
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400,
        headers: corsHeaders(),
      });
    }
  },
};
