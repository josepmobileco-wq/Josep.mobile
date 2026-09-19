// ====== Carrito persistente ======
function cargarCarrito() {
    try {
        const data = JSON.parse(localStorage.getItem('carrito_josep'));
        if (Array.isArray(data)) {
            return data
                .filter(i => i && typeof i.id === 'string')
                .map(i => ({
                    id: String(i.id),
                    nombre: String(i.nombre || 'Producto'),
                    precioTexto: String(i.precioTexto || ''),
                    precioNum: Number(i.precioNum) || 0,
                    cantidad: Math.max(1, Number(i.cantidad) || 1)
                }));
        }
    } catch (e) {
        /* datos corruptos: ignorar */
    }
    return [];
}

let carrito = cargarCarrito();

// Catálogo cargado (para validar stock). Sin campo stock = disponible.
let CATALOGO = [];
function buscarProdWeb(id) {
    return CATALOGO.find(x => x.id === id);
}
function buscarVarianteWeb(parentId, varId) {
    const p = buscarProdWeb(parentId);
    return p && Array.isArray(p.variantes) ? p.variantes.find(v => v.id === varId) : null;
}
function buscarColorWeb(parentId, varId, colorId) {
    const v = buscarVarianteWeb(parentId, varId);
    return v && Array.isArray(v.colores) ? v.colores.find(c => c.id === colorId) : null;
}
function stockVarianteWeb(p, v) {
    if (v && Array.isArray(v.colores) && v.colores.length) return v.colores.reduce((s, c) => s + (Number(c.stock) || 0), 0);
    if (v) return Number(v.stock) || 0;
    return 0;
}
function stockDe(id) {
    const partes = String(id || '').split('::');
    if (partes.length === 3) {
        const c = buscarColorWeb(partes[0], partes[1], partes[2]);
        if (c) return Number(c.stock) || 0;
    }
    if (partes.length === 2) {
        const p2 = buscarProdWeb(partes[0]);
        const v = p2 ? buscarVarianteWeb(partes[0], partes[1]) : null;
        if (v) return stockVarianteWeb(p2, v);
    }
    const p = buscarProdWeb(id);
    if (!p || p.stock === undefined || p.stock === null) return Infinity;
    return Number(p.stock) || 0;
}
const IMG_FALLBACK = 'logojosepmobile.jpeg';
function fotoSegura(prod, i) {
    const f = (prod.fotos && prod.fotos[i]) || IMG_FALLBACK;
    return esc(f);
}

// ====== Configuración Bold (pasarela de pagos) ======
// 1. Pega aquí tu LLAVE DE IDENTIDAD de Bold (la pública).
//    Se obtiene en bold.co → Integraciones → Llaves de integración.
//    Para pruebas usa la de "pruebas"; para cobrar de verdad, la de "producción".
// 2. NUNCA pongas aquí tu llave secreta: esa vive solo en el Worker.
const BOLD_API_KEY = 'DgZEEr-yQJ2PZWHB2D3wbplWjoBWmbRiMwyqLeqZAIs';

// 3. URL de tu Cloudflare Worker (ver archivo bold-firma-worker.js).
//    Ejemplo: 'https://josep-firma-bold.tu-usuario.workers.dev' → pon la tuya real.
const BOLD_WORKER_URL = 'https://wispy-shadow-8bccjosep-firma-bold.josep-mobile-co.workers.dev';

// URL de tu tienda (debe ser https y coincidir con tu dominio en Bold).
const TIENDA_URL = 'https://josepmobileco-wq.github.io/Josep.mobile/';

// ====== Meta Pixel: eventos de tienda (no rompe nada si el Píxel no cargó) ======
function pixelTrack(nombre, datos) {
    try { if (typeof fbq === 'function') fbq('track', nombre, datos || {}); } catch (e) {}
}
const precioNumDe = (txt) => parseInt(String(txt || '').replace(/[^0-9]/g, ''), 10) || 0;

// ====== Utilidades ======
function esc(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ====== Pagos con Bold (checkout embebido) ======
function generarOrderId() {
    const rand = Math.random().toString(36).slice(2, 6);
    return `JM-${Date.now()}-${rand}`;
}

function toastBold(mensaje, esError = false) {
    let el = document.getElementById('toast-bold');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast-bold';
        el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;max-width:92vw;padding:12px 18px;border-radius:12px;font-weight:700;font-size:0.95rem;box-shadow:0 8px 24px rgba(0,0,0,.4);transition:opacity .3s;';
        document.body.appendChild(el);
    }
    el.style.background = esError ? '#d32f2f' : '#5c00a3';
    el.style.color = '#fff';
    el.textContent = mensaje;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 4500);
}

// Bold rechaza descripciones que parezcan URL (ej: "Josep.mobile").
// Esta función las deja seguras: sin puntos de dominio ni enlaces.
function sanitizarDescripcion(texto) {
    return String(texto || 'Compra Josep mobile')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/www\.\S+/gi, '')
        .replace(/josep\.mobile/gi, 'Josep mobile')
        .replace(/([A-Za-z])\.([A-Za-z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || 'Compra Josep mobile';
}

async function pedirFirmaBold(orderId, amount) {
    if (!BOLD_WORKER_URL || BOLD_WORKER_URL.includes('TU-WORKER')) {
        throw new Error('Falta configurar la URL del Worker de firmas (BOLD_WORKER_URL en script.js).');
    }
    const res = await fetch(BOLD_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount, currency: 'COP' })
    });
    if (!res.ok) throw new Error('El servidor de firmas respondió con error.');
    const data = await res.json();
    if (!data.integritySignature) throw new Error(data.error || 'Firma inválida.');
    return data.integritySignature;
}

async function abrirCheckoutBold(amount, description, boton, customerData, orderIdPrevio) {
    if (!BOLD_API_KEY || BOLD_API_KEY.includes('TU_LLAVE')) {
        toastBold('Falta configurar tu llave de identidad Bold en script.js.', true);
        return;
    }
    if (typeof BoldCheckout === 'undefined') {
        toastBold('No se pudo cargar la pasarela Bold. Revisa tu conexión.', true);
        return;
    }
    const monto = Number(amount) || 0;
    if (!Number.isInteger(monto) || monto < 1000) {
        toastBold('El monto mínimo para pagar con Bold es $1.000 COP.', true);
        return;
    }

    const textoOriginal = boton ? boton.innerHTML : '';
    if (boton) {
        boton.disabled = true;
        boton.innerHTML = '<i class="fa-solid fa-lock"></i> Abriendo pago seguro…';
    }

    try {
        const orderId = orderIdPrevio || generarOrderId();
        const integritySignature = await pedirFirmaBold(orderId, monto);
        const config = {
            orderId,
            currency: 'COP',
            amount: String(monto),
            apiKey: BOLD_API_KEY,
            integritySignature,
            description: sanitizarDescripcion(description),
            redirectionUrl: TIENDA_URL,
            renderMode: 'embedded'
        };
        if (customerData) config.customerData = JSON.stringify(customerData);
        const checkout = new BoldCheckout(config);
        checkout.open();
        return orderId;
    } catch (e) {
        console.error('Bold:', e);
        toastBold('No se pudo iniciar el pago: ' + e.message, true);
    } finally {
        if (boton) {
            boton.disabled = false;
            boton.innerHTML = textoOriginal;
        }
    }
}

// ====== Checkout con datos del cliente + alerta de pedido ======
const WHATSAPP_TIENDA = '573155654422';
let pedidoPendiente = null; // { items, total, origen }

function formatoCOP(n) {
    return `$${Number(n || 0).toLocaleString('es-CO')} COP`;
}

function abrirCheckout(items, total, origen) {
    pedidoPendiente = { items, total, origen };

    const resumen = document.getElementById('checkout-resumen');
    resumen.innerHTML = items.map(i => `
        <div class="checkout-linea">
            <span><span class="co-cant">x${i.cantidad}</span> ${esc(i.nombre)}</span>
            <span class="co-sub">${formatoCOP(i.precioNum * i.cantidad)}</span>
        </div>`).join('');
    document.getElementById('checkout-total').textContent = formatoCOP(total);

    const modal = document.getElementById('checkout-modal');
    if (modal) abrirModal(modal);
}

function leerFormularioCheckout() {
    const val = (id) => document.getElementById(id).value.trim();
    const datos = {
        nombre: val('co-nombre'),
        correo: val('co-correo'),
        telefono: val('co-telefono').replace(/[^0-9]/g, ''),
        direccion: val('co-direccion'),
        ciudad: val('co-ciudad'),
        depto: val('co-depto'),
        notas: val('co-notas')
    };
    const errores = [];
    const marcar = (id, mal) => document.getElementById(id).classList.toggle('input-error', mal);

    const malNombre = datos.nombre.length < 3;
    marcar('co-nombre', malNombre);
    if (malNombre) errores.push('nombre');

    const malCorreo = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(datos.correo);
    marcar('co-correo', malCorreo);
    if (malCorreo) errores.push('correo');

    const malTel = !(datos.telefono.length === 10 && datos.telefono.startsWith('3'));
    marcar('co-telefono', malTel);
    if (malTel) errores.push('celular (10 dígitos, ej: 3173482040)');

    const malDir = datos.direccion.length < 6;
    marcar('co-direccion', malDir);
    if (malDir) errores.push('dirección');

    const malCiudad = datos.ciudad.length < 2;
    marcar('co-ciudad', malCiudad);
    if (malCiudad) errores.push('ciudad');

    return { datos, errores };
}

async function iniciarPagoBold(boton) {
    if (!pedidoPendiente || !pedidoPendiente.items.length) {
        toastBold('No hay productos en el pedido.', true);
        return;
    }
    const { datos, errores } = leerFormularioCheckout();
    if (errores.length) {
        toastBold('Revisa estos campos: ' + errores.join(', ') + '.', true);
        return;
    }

    const orderId = generarOrderId();
    const draft = {
        orderId,
        items: pedidoPendiente.items,
        total: pedidoPendiente.total,
        origen: pedidoPendiente.origen,
        cliente: datos,
        fecha: new Date().toISOString()
    };
    try {
        localStorage.setItem('pedido_bold_' + orderId, JSON.stringify(draft));
    } catch (e) { /* almacenamiento lleno: se sigue sin borrador */ }

    const descripcion = pedidoPendiente.origen === 'carrito'
        ? `Compra Josep.mobile (${pedidoPendiente.items.reduce((a, i) => a + i.cantidad, 0)} art.)`
        : pedidoPendiente.items[0].nombre;
    const customerData = {
        email: datos.correo,
        fullName: datos.nombre,
        phone: datos.telefono,
        dialCode: '+57'
    };
    // Registra el pedido en el Worker para que el POS descuente stock al aprobarse.
    // No bloquea el pago si falla (el POS lo sincroniza después).
    try {
        fetch(BOLD_WORKER_URL.replace(/\/$/, '') + '/registrar-pedido', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderId,
                items: pedidoPendiente.items.map(i => ({ id: i.id || '', nombre: i.nombre, cantidad: i.cantidad, precioNum: i.precioNum })),
                total: pedidoPendiente.total,
                cliente: { nombre: datos.nombre, telefono: datos.telefono, correo: datos.correo, direccion: datos.direccion, ciudad: datos.ciudad, depto: datos.depto, notas: datos.notas }
            })
        }).catch(() => {});
    } catch (e) { /* silencioso */ }
    await abrirCheckoutBold(pedidoPendiente.total, descripcion, boton, customerData, orderId);
}

function mensajePedidoWhatsApp(draft, estadoTx) {
    const c = draft.cliente;
    const lineas = draft.items.map(i =>
        `- ${i.nombre} (x${i.cantidad}): $${(i.precioNum * i.cantidad).toLocaleString('es-CO')} COP`
    ).join('\n');
    const estadoTxt = estadoTx === 'approved' ? 'APROBADO (Bold)' : estadoTx.toUpperCase();
    return `🛍️ *NUEVO PEDIDO - JOSEP.MOBILE*\n` +
        `🧾 Pedido: ${draft.orderId}\n` +
        `💳 Estado: ${estadoTxt}\n` +
        `--------------------------\n` +
        `👤 *Cliente:* ${c.nombre}\n` +
        `📧 ${c.correo}\n` +
        `📱 ${c.telefono}\n` +
        `📍 ${c.direccion}, ${c.ciudad}${c.depto ? ' (' + c.depto + ')' : ''}\n` +
        (c.notas ? `📝 Notas: ${c.notas}\n` : '') +
        `--------------------------\n` +
        `*PRODUCTOS:*\n${lineas}\n` +
        `--------------------------\n` +
        `*TOTAL: $${draft.total.toLocaleString('es-CO')} COP*`;
}

function mostrarConfirmacion(draft, estadoTx) {
    const resumen = document.getElementById('confirm-resumen');
    const lineas = draft.items.map(i => `
        <div class="checkout-linea">
            <span><span class="co-cant">x${i.cantidad}</span> ${esc(i.nombre)}</span>
            <span class="co-sub">${formatoCOP(i.precioNum * i.cantidad)}</span>
        </div>`).join('');
    resumen.innerHTML = `
        <div class="checkout-linea"><span>🧾 Pedido</span><span class="co-sub">${esc(draft.orderId)}</span></div>
        ${lineas}
        <div class="checkout-linea"><span>📍 Entrega</span><span>${esc(draft.cliente.direccion)}, ${esc(draft.cliente.ciudad)}</span></div>
        <div class="checkout-linea"><span><strong>TOTAL PAGADO</strong></span><span class="co-sub">${formatoCOP(draft.total)}</span></div>`;

    const urlWA = `https://wa.me/${WHATSAPP_TIENDA}?text=${encodeURIComponent(mensajePedidoWhatsApp(draft, estadoTx))}`;
    document.getElementById('btn-enviar-pedido').href = urlWA;

    const modal = document.getElementById('confirm-modal');
    if (modal) abrirModal(modal);
}

// Aviso tras volver de Bold (?bold-order-id=...&bold-tx-status=...)
function manejarRetornoBold() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('bold-order-id');
    const estadoTx = params.get('bold-tx-status');
    if (!orderId || !estadoTx) return;

    // Limpiar la URL para no reprocesar al recargar
    history.replaceState('', document.title, window.location.pathname);

    let draft = null;
    try {
        draft = JSON.parse(localStorage.getItem('pedido_bold_' + orderId) || 'null');
    } catch (e) { draft = null; }

    if (estadoTx === 'approved' && draft) {
        if (draft.origen === 'carrito') {
            carrito = [];
            guardarYActualizar();
        }
        try { localStorage.removeItem('pedido_bold_' + orderId); } catch (e) {}
        pixelTrack('Purchase', { value: Number(draft.total) || 0, currency: 'COP', order_id: orderId });
        mostrarConfirmacion(draft, estadoTx);
    } else if (estadoTx === 'approved') {
        toastBold(`¡Pago aprobado! Pedido ${orderId}. Te contactaremos por WhatsApp para el envío.`);
    } else if (estadoTx === 'pending') {
        toastBold(`Tu pago (${orderId}) quedó pendiente. Te avisaremos cuando se confirme.`);
    } else {
        toastBold(`El pago (${orderId}) no fue aprobado. Puedes intentarlo de nuevo.`, true);
    }
}

// Envío del formulario checkout → pagar con Bold
document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'checkout-form') {
        e.preventDefault();
        const boton = document.getElementById('btn-confirmar-pago');
        try {
            const totalTxt = (document.getElementById('checkout-total') || {}).textContent || '';
            pixelTrack('InitiateCheckout', { value: precioNumDe(totalTxt), currency: 'COP' });
        } catch (err) {}
        iniciarPagoBold(boton);
    }
});

// Clic a WhatsApp (botones y flotante) → evento Contact para Meta Ads
document.addEventListener('click', (e) => {
    const wa = e.target.closest('a[href*="wa.me"]');
    if (wa) pixelTrack('Contact');
});

// Elegir referencia en el modal → actualiza colores, precio, stock y botones
document.addEventListener('click', (e) => {
    const opt = e.target.closest('.var-opt');
    if (!opt || opt.disabled) return;
    const modal = opt.closest('.modal-policy');
    if (!modal) return;
    modal.querySelectorAll('.var-opt').forEach(b => b.classList.remove('seleccionado'));
    opt.classList.add('seleccionado');
    const parent = opt.getAttribute('data-parent');
    const varId = opt.getAttribute('data-var-id');
    const pv = buscarProdWeb(parent);
    const v = buscarVarianteWeb(parent, varId);
    if (!pv || !v) return;
    const varNombre = v.nombre;
    const varPrecio = opt.getAttribute('data-var-precio') || v.precio;
    // Nivel 2: colores de esta referencia
    const wrapColores = modal.querySelector('.var-colors');
    const tieneC = Array.isArray(v.colores) && v.colores.length > 0;
    let col = null;
    if (wrapColores) {
        if (tieneC) {
            col = v.colores.find(c => (Number(c.stock) || 0) > 0) || v.colores[0];
            wrapColores.hidden = false;
            wrapColores.querySelector('h4').textContent = '2. ELIGE COLOR';
            wrapColores.querySelector('.color-opts').innerHTML = v.colores.map(c => {
                const st = Number(c.stock) || 0;
                const sel = col && c.id === col.id ? ' seleccionado' : '';
                const cara = c.foto
                    ? `<img src="${esc(c.foto)}" alt="${esc(c.nombre)}" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'">`
                    : esc(c.nombre);
                return `<button type="button" class="color-opt${sel}" data-parent="${esc(parent)}" data-var-id="${esc(varId)}" data-color-id="${esc(c.id)}" data-color-nombre="${esc(c.nombre)}" data-color-precio="${esc(c.precio || v.precio)}" data-color-stock="${st}" data-color-foto="${esc(c.foto || v.foto || '')}" title="${esc(c.nombre)}${st <= 0 ? ' (agotado)' : ''}" ${st <= 0 ? 'disabled' : ''}>${cara}</button>`;
            }).join('');
        } else {
            wrapColores.hidden = true;
            wrapColores.querySelector('.color-opts').innerHTML = '';
        }
    }
    aplicarSeleccionWeb(modal, parent, pv.nombre, varId, varNombre, col, varPrecio);
});

// Elegir color → actualiza foto, precio, stock y botones
document.addEventListener('click', (e) => {
    const opt = e.target.closest('.color-opt');
    if (!opt || opt.disabled) return;
    const modal = opt.closest('.modal-policy');
    if (!modal) return;
    modal.querySelectorAll('.color-opt').forEach(b => b.classList.remove('seleccionado'));
    opt.classList.add('seleccionado');
    const parent = opt.getAttribute('data-parent');
    const varId = opt.getAttribute('data-var-id');
    const pv = buscarProdWeb(parent);
    const v = buscarVarianteWeb(parent, varId);
    const col = buscarColorWeb(parent, varId, opt.getAttribute('data-color-id'));
    if (!pv || !v || !col) return;
    aplicarSeleccionWeb(modal, parent, pv.nombre, varId, v.nombre, col, opt.getAttribute('data-var-precio') || v.precio);
});

// Aplica una selección (referencia + color opcional) a todo el modal
function aplicarSeleccionWeb(modal, parentId, nombreBase, varId, varNombre, col, varPrecioBase) {
    const esColor = !!col;
    const fullId = esColor ? `${parentId}::${varId}::${col.id}` : `${parentId}::${varId}`;
    const fullNombre = esColor ? `${nombreBase} (${varNombre}, ${col.nombre})` : `${nombreBase} (${varNombre})`;
    const precioTxt = esColor ? (col.precio || varPrecioBase) : varPrecioBase;
    const precioNum = precioNumDe(precioTxt);
    const stockN = esColor ? (Number(col.stock) || 0) : stockDe(fullId);
    const foto = (esColor && col.foto) || null;
    const priceEl = modal.querySelector('.modal-price');
    if (priceEl) priceEl.textContent = precioTxt;
    const stockEl = modal.querySelector('.var-stock');
    if (stockEl) stockEl.innerHTML = esColor
        ? `Color: <strong>${esc(col.nombre)}</strong> — Disponibles: <strong>${stockN}</strong>`
        : `Disponibles: <strong>${stockN}</strong>`;
    if (foto) {
        const firstImg = modal.querySelector('.main-image-view .img-display');
        if (firstImg) { firstImg.src = foto; firstImg.onerror = function () { this.onerror = null; this.src = IMG_FALLBACK; }; }
        const firstThumb = modal.querySelector('.gallery-thumbnails .thumb-item img');
        if (firstThumb) { firstThumb.src = foto; }
        const firstRadio = modal.querySelector('.gallery-selector');
        if (firstRadio) firstRadio.checked = true;
    }
    const addBtn = modal.querySelector('.btn-add-cart');
    if (addBtn) { addBtn.setAttribute('data-id', fullId); addBtn.setAttribute('data-nombre', fullNombre); addBtn.setAttribute('data-precio', precioTxt); }
    const boldBtn = modal.querySelector('.btn-bold-producto');
    if (boldBtn) {
        boldBtn.setAttribute('data-id', fullId);
        boldBtn.setAttribute('data-nombre', fullNombre);
        boldBtn.setAttribute('data-precio-num', String(precioNum));
        boldBtn.innerHTML = `<i class="fa-solid fa-credit-card"></i> Comprar ahora (${precioTxt})`;
    }
    const waBtn = modal.querySelector('.btn-wa-link');
    if (waBtn) waBtn.href = `https://wa.me/573155654422?text=${encodeURIComponent('Hola, quiero comprar el producto ' + fullNombre)}`;
}

// ====== Control de modales (clases .active + backdrop) ======
function abrirModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function cerrarModales() {
    document.querySelectorAll('.modal-policy.active').forEach(m => {
        m.classList.remove('active');
    });
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = '';
}

// ====== Carga de productos ======
document.addEventListener('DOMContentLoaded', () => {
    manejarRetornoBold();
    fetch('./productos.json')
        .then(response => {
            if (!response.ok) throw new Error(`Error HTTP! estado: ${response.status}`);
            return response.json();
        })
        .then(productos => {
            const grid = document.getElementById('product-grid');
            const modals = document.getElementById('modals-container');

            if (!grid || !modals) return;

            CATALOGO = productos;

            productos.forEach(prod => {
                const precioNumProd = parseInt(String(prod.precio).replace(/[^0-9]/g, ''), 10) || 0;
                const hayStock = stockDe(prod.id) > 0;
                const tieneVars = Array.isArray(prod.variantes) && prod.variantes.length > 0;
                const hayColores = tieneVars && prod.variantes.some(v => Array.isArray(v.colores) && v.colores.length > 0);
                const totalOpciones = tieneVars ? prod.variantes.reduce((s, v) => s + ((Array.isArray(v.colores) && v.colores.length) ? v.colores.length : 1), 0) : 0;

                // Tarjeta del catálogo
                const card = document.createElement('div');
                card.className = 'product-card' + (hayStock ? '' : ' sin-stock');
                card.innerHTML = `
                    <a href="#producto-${esc(prod.id)}" class="card-modal-trigger">
                        <div class="product-image">
                            <img src="${fotoSegura(prod, 0)}" alt="${esc(prod.nombre)}" loading="lazy" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'">
                            ${hayStock ? '' : '<span class="agotado-badge">Agotado</span>'}
                        </div>
                        <div class="product-info">
                            <h3>${esc(prod.nombre)}</h3>
                            ${tieneVars ? `<p class="var-hint">🎨 ${hayColores ? totalOpciones + ' colores' : prod.variantes.length + ' referencias'} para elegir</p>` : ''}
                            <p class="short-desc">${esc(prod.corta)}</p>
                            <span class="price">${esc(prod.precio)}</span>
                            <span class="btn-card">${hayStock ? (tieneVars ? (hayColores ? '🎨 Elige tu color' : 'Elige tu referencia') : 'Ver opciones de compra') : 'Agotado'}</span>
                        </div>
                    </a>
                `;
                grid.appendChild(card);

                // Modal de detalle de producto
                const fotos = (prod.fotos && prod.fotos.length) ? prod.fotos : [IMG_FALLBACK];
                const radioInputs = fotos.map((img, i) =>
                    `<input type="radio" name="gallery-${esc(prod.id)}" id="img${i + 1}-${esc(prod.id)}" ${i === 0 ? 'checked' : ''} class="gallery-selector">`
                ).join('');
                const displayImages = fotos.map((img, i) =>
                    `<img src="${esc(img)}" class="img-display img-${i + 1}" alt="${esc(prod.nombre)} - Foto ${i + 1}" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'">`
                ).join('');

                const thumbnails = fotos.map((img, i) =>
                    `<label for="img${i + 1}-${esc(prod.id)}" class="thumb-item"><img src="${esc(img)}" alt="Vista ${i + 1}" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'"></label>`
                ).join('');

                const modal = document.createElement('div');
                modal.id = `producto-${esc(prod.id)}`;
                modal.className = 'modal-policy';
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                modal.setAttribute('aria-label', prod.nombre);
                // Variante por defecto: primera con stock, si no la primera
                const stockVar = (v) => (Array.isArray(v.colores) && v.colores.length)
                    ? v.colores.reduce((s, c) => s + (Number(c.stock) || 0), 0)
                    : (Number(v.stock) || 0);
                const varDef = tieneVars ? (prod.variantes.find(v => stockVar(v) > 0) || prod.variantes[0]) : null;
                const colDef = (varDef && Array.isArray(varDef.colores) && varDef.colores.length)
                    ? (varDef.colores.find(c => (Number(c.stock) || 0) > 0) || varDef.colores[0]) : null;
                const fotoSel = (colDef && colDef.foto) || (varDef && varDef.foto) || null;
                if (fotoSel && !fotos.includes(fotoSel)) fotos.unshift(fotoSel);
                const nombreSel = varDef ? (colDef ? `${prod.nombre} (${varDef.nombre}, ${colDef.nombre})` : `${prod.nombre} (${varDef.nombre})`) : prod.nombre;
                const defId = varDef ? (colDef ? `${prod.id}::${varDef.id}::${colDef.id}` : `${prod.id}::${varDef.id}`) : prod.id;
                const defNombre = nombreSel;
                const defPrecioTxt = colDef ? (colDef.precio || varDef.precio) : (varDef ? varDef.precio : prod.precio);
                const defPrecioNum = precioNumDe(defPrecioTxt);
                const swatchesDe = (v) => ((v && v.colores) || []).map(c => {
                    const st = Number(c.stock) || 0;
                    const sel = (colDef && varDef && v.id === varDef.id && c.id === colDef.id) ? ' seleccionado' : '';
                    const cara = c.foto
                        ? `<img src="${esc(c.foto)}" alt="${esc(c.nombre)}" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'">`
                        : esc(c.nombre);
                    return `<button type="button" class="color-opt${sel}" data-parent="${esc(prod.id)}" data-var-id="${esc(v.id)}" data-color-id="${esc(c.id)}" data-color-nombre="${esc(c.nombre)}" data-color-precio="${esc(c.precio || v.precio)}" data-color-stock="${st}" data-color-foto="${esc(c.foto || v.foto || '')}" title="${esc(c.nombre)}${st <= 0 ? ' (agotado)' : ''}" ${st <= 0 ? 'disabled' : ''}>${cara}</button>`;
                }).join('');
                const selectorVars = tieneVars ? `
                            <div class="var-selector">
                                <h4>${hayColores ? '1. ELIGE REFERENCIA' : 'ELIGE REFERENCIA'}</h4>
                                <div class="var-opts">
                                    ${prod.variantes.map(v => {
                                        const st = stockVar(v);
                                        const sel = varDef && v.id === varDef.id ? ' seleccionado' : '';
                                        return `<button type="button" class="var-opt${sel}" data-parent="${esc(prod.id)}" data-var-id="${esc(v.id)}" data-var-nombre="${esc(v.nombre)}" data-var-precio="${esc(v.precio)}" data-var-stock="${st}" data-var-foto="${esc(v.foto || '')}" ${st <= 0 ? 'disabled' : ''}>${esc(v.nombre)}${st <= 0 ? ' (agotado)' : ''}</button>`;
                                    }).join('')}
                                </div>
                                <div class="var-colors" ${varDef && varDef.colores && varDef.colores.length ? '' : 'hidden'}>
                                    ${varDef && varDef.colores && varDef.colores.length ? '<h4>2. ELIGE COLOR</h4>' : ''}
                                    <div class="color-opts">${varDef ? swatchesDe(varDef) : ''}</div>
                                </div>
                                <p class="var-stock">${colDef ? `Color: <strong>${esc(colDef.nombre)}</strong> — Disponibles: <strong>${Number(colDef.stock) || 0}</strong>` : (varDef ? `Disponibles: <strong>${stockVar(varDef)}</strong>` : '')}</p>
                            </div>` : '';
                modal.innerHTML = `
                    <div class="modal-product-container">
                        <button type="button" class="close-modal" aria-label="Cerrar">&times;</button>
                        <div class="modal-product-media">
                            ${radioInputs}
                            <div class="main-image-view">${displayImages}</div>
                            <div class="gallery-thumbnails">${thumbnails}</div>
                        </div>
                        <div class="modal-product-details">
                            <h2>${esc(prod.nombre)}</h2>
                            <p class="modal-price">${esc(defPrecioTxt)}</p>
                            ${selectorVars}
                            <div class="modal-description">
                                <h4>DETALLES DEL PRODUCTO</h4>
                                <p>${esc(prod.detalles)}</p>
                            </div>

                            <div class="modal-actions">
                                ${stockDe(defId) > 0 ? `
                                <button type="button" class="btn-card btn-add-cart" data-id="${esc(defId)}" data-nombre="${esc(defNombre)}" data-precio="${esc(defPrecioTxt)}">
                                    <i class="fa-solid fa-cart-plus"></i> Agregar al Carrito
                                </button>
                                <button type="button" class="btn-card btn-mp-link btn-bold-producto" data-id="${esc(defId)}" data-precio-num="${defPrecioNum}" data-nombre="${esc(defNombre)}">
                                    <i class="fa-solid fa-credit-card"></i> Comprar ahora (${esc(defPrecioTxt)})
                                </button>` : `
                                <button type="button" class="btn-card" disabled>
                                    <i class="fa-solid fa-ban"></i> Agotado
                                </button>`}
                                <a href="https://wa.me/573155654422?text=${encodeURIComponent('Hola, quiero comprar el producto ' + defNombre)}" target="_blank" rel="noopener noreferrer" class="btn-card btn-wa-link">
                                    <i class="fa-brands fa-whatsapp"></i> Comprar directo por WhatsApp
                                </a>
                            </div>
                        </div>
                    </div>
                `;
                modals.appendChild(modal);
            });

            actualizarCarritoUI();
        })
        .catch(error => console.error('Error cargando los productos:', error));

    // Menú hamburguesa en móvil
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.querySelector('.nav-links');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            const abierto = navLinks.classList.toggle('active');
            hamburger.setAttribute('aria-expanded', abierto);
        });
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
            });
        });
    }
});

// ====== Eventos delegados globales ======
document.addEventListener('click', (e) => {
    // 1. Cierre de cualquier modal (botón ×)
    const closeBtn = e.target.closest('.close-modal');
    if (closeBtn) {
        e.preventDefault();
        cerrarModales();
        history.pushState('', document.title, window.location.pathname + window.location.search);
        return;
    }

    // 2. Apertura de modal de producto (tarjeta del catálogo)
    const trigger = e.target.closest('.card-modal-trigger');
    if (trigger) {
        e.preventDefault();
        const modalId = trigger.getAttribute('href');
        const targetModal = document.getElementById(modalId.replace('#', ''));
        abrirModal(targetModal);
        try {
            const pid = (modalId || '').replace('#producto-', '');
            const pv = CATALOGO.find(x => x.id === pid);
            if (pv) pixelTrack('ViewContent', { content_ids: [pv.id], content_name: pv.nombre, value: precioNumDe(pv.precio), currency: 'COP' });
        } catch (err) {}
        return;
    }

    // 3. Apertura de modales de políticas (links del footer)
    const policyLink = e.target.closest('.quick-links a');
    if (policyLink) {
        const modalId = policyLink.getAttribute('href');
        const targetModal = document.querySelector(modalId);
        if (targetModal && targetModal.classList.contains('modal-policy')) {
            e.preventDefault();
            abrirModal(targetModal);
            history.pushState('', document.title, window.location.pathname + window.location.search);
        }
        return;
    }

    // 4. Cierre al hacer clic en el backdrop
    if (e.target.classList.contains('modal-backdrop')) {
        cerrarModales();
        return;
    }

    // 5. Agregar al carrito (con tope de stock)
    const addBtn = e.target.closest('.btn-add-cart');
    if (addBtn) {
        const id = addBtn.getAttribute('data-id');
        const nombre = addBtn.getAttribute('data-nombre');
        const precioTexto = addBtn.getAttribute('data-precio');
        const precioNum = parseInt(precioTexto.replace(/[^0-9]/g, ''), 10) || 0;

        const stock = stockDe(id);
        const enCarrito = carrito.filter(i => i.id === id).reduce((a, i) => a + i.cantidad, 0);
        if (enCarrito + 1 > stock) {
            toastBold(stock <= 0 ? 'Producto agotado.' : `Solo quedan ${stock} unidades.`, true);
            return;
        }

        const existe = carrito.find(item => item.id === id);
        if (existe) {
            existe.cantidad += 1;
        } else {
            carrito.push({ id, nombre, precioTexto, precioNum, cantidad: 1 });
        }

        guardarYActualizar();
        pixelTrack('AddToCart', { content_ids: [id], content_name: nombre, value: precioNum, currency: 'COP' });

        // Cerrar modal del producto y abrir carrito
        cerrarModales();
        history.pushState('', document.title, window.location.pathname + window.location.search);

        const cartModal = document.getElementById('cart-modal');
        if (cartModal) cartModal.classList.add('active');
        return;
    }

    // 6. Abrir panel de carrito
    if (e.target.closest('#cart-icon')) {
        const cartModal = document.getElementById('cart-modal');
        if (cartModal) cartModal.classList.add('active');
        return;
    }

    // 7. Cerrar panel de carrito
    if (e.target.closest('#close-cart') || e.target === document.getElementById('cart-modal')) {
        const cartModal = document.getElementById('cart-modal');
        if (cartModal) cartModal.classList.remove('active');
        return;
    }

    // 7b. Comprar UN producto (abre formulario y luego Bold)
    const btnBoldProd = e.target.closest('.btn-bold-producto');
    if (btnBoldProd) {
        const idProd = btnBoldProd.getAttribute('data-id');
        const monto = parseInt(btnBoldProd.getAttribute('data-precio-num'), 10) || 0;
        const nombre = btnBoldProd.getAttribute('data-nombre') || 'Producto Josep.mobile';
        if (monto <= 0) {
            toastBold('Precio no disponible para este producto.', true);
            return;
        }
        if (stockDe(idProd) < 1) {
            toastBold('Producto agotado.', true);
            return;
        }
        cerrarModales();
        abrirCheckout([{ id: idProd, nombre, cantidad: 1, precioNum: monto }], monto, 'producto');
        return;
    }

    // 7c. Finalizar compra del CARRITO (formulario y luego Bold)
    if (e.target.closest('#btn-pay-mp')) {
        e.preventDefault();
        const btn = e.target.closest('#btn-pay-mp');
        const total = parseInt(btn.getAttribute('data-total-num'), 10) || 0;
        if (carrito.length === 0 || total <= 0) {
            toastBold('Tu carrito está vacío.', true);
            return;
        }
        const sinStock = carrito.find(i => {
            const enCarrito = carrito.filter(x => x.id === i.id).reduce((a, x) => a + x.cantidad, 0);
            return enCarrito > stockDe(i.id);
        });
        if (sinStock) {
            toastBold(`"${sinStock.nombre}" ya no tiene stock suficiente.`, true);
            return;
        }
        const items = carrito.map(i => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, precioNum: i.precioNum }));
        cerrarModales();
        const cartModal = document.getElementById('cart-modal');
        if (cartModal) cartModal.classList.remove('active');
        abrirCheckout(items, total, 'carrito');
        return;
    }

    // 8. Aumentar cantidad (con tope de stock)
    const btnPlus = e.target.closest('.btn-qty-plus');
    if (btnPlus) {
        const id = btnPlus.getAttribute('data-id');
        const producto = carrito.find(item => item.id === id);
        if (producto) {
            const stock = stockDe(id);
            if (producto.cantidad + 1 > stock) {
                toastBold(stock <= 0 ? 'Producto agotado.' : `Solo quedan ${stock} unidades.`, true);
                return;
            }
            producto.cantidad += 1;
            guardarYActualizar();
        }
        return;
    }

    // 9. Restar cantidad
    const btnMinus = e.target.closest('.btn-qty-minus');
    if (btnMinus) {
        const id = btnMinus.getAttribute('data-id');
        const producto = carrito.find(item => item.id === id);
        if (producto) {
            if (producto.cantidad > 1) {
                producto.cantidad -= 1;
            } else {
                carrito = carrito.filter(item => item.id !== id);
            }
            guardarYActualizar();
        }
        return;
    }

    // 10. Eliminar ítem del carrito
    const btnRemove = e.target.closest('.btn-remove-item');
    if (btnRemove) {
        const id = btnRemove.getAttribute('data-id');
        carrito = carrito.filter(item => item.id !== id);
        guardarYActualizar();
    }
});

// ====== Cerrar con tecla Escape ======
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const cartModal = document.getElementById('cart-modal');
        if (cartModal && cartModal.classList.contains('active')) {
            cartModal.classList.remove('active');
        }
        cerrarModales();
    }
});

// ====== Persistencia y UI del carrito ======
function guardarYActualizar() {
    localStorage.setItem('carrito_josep', JSON.stringify(carrito));
    actualizarCarritoUI();
}

function actualizarCarritoUI() {
    const cartCount = document.getElementById('cart-count');
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalPrice = document.getElementById('cart-total-price');
    const btnPayWA = document.getElementById('btn-pay-wa');
    const btnPayMP = document.getElementById('btn-pay-mp');

    if (!cartCount || !cartItemsContainer) return;

    const totalItems = carrito.reduce((acc, item) => acc + item.cantidad, 0);
    cartCount.innerText = totalItems;

    cartItemsContainer.innerHTML = '';
    let totalAcumulado = 0;

    if (carrito.length === 0) {
        cartItemsContainer.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
        cartTotalPrice.innerText = '$0 COP';
        if (btnPayWA) btnPayWA.href = '#';
        if (btnPayMP) btnPayMP.setAttribute('data-total-num', '0');
        return;
    }

    let msjWhatsApp = 'Hola! Quiero realizar el pedido de los siguientes productos:\n\n';

    carrito.forEach(item => {
        const subtotal = item.precioNum * item.cantidad;
        totalAcumulado += subtotal;

        const subtotalTexto = `$${subtotal.toLocaleString('es-CO')} COP`;
        msjWhatsApp += `- ${item.nombre} ${item.cantidad > 1 ? `(x${item.cantidad})` : ''}: ${subtotalTexto}\n`;

        const div = document.createElement('div');
        div.className = 'cart-item-simple';
        div.innerHTML = `
            <span class="cart-item-name">
                ${esc(item.nombre)}
                ${item.cantidad > 1 ? `<small style="color:#ff9900; font-weight:bold;">(x${item.cantidad})</small>` : ''}
            </span>
            <div class="cart-item-price-controls">
                <span class="cart-item-price">${subtotalTexto}</span>
                <div class="qty-controls" style="display:flex; align-items:center; gap:6px;">
                    <button type="button" class="qty-btn btn-qty-minus" data-id="${esc(item.id)}" aria-label="Restar unidad">&minus;</button>
                    <span class="cart-item-qty" style="color:#fff;">${item.cantidad}</span>
                    <button type="button" class="qty-btn btn-qty-plus" data-id="${esc(item.id)}" aria-label="Sumar unidad">+</button>
                </div>
                <button type="button" class="btn-remove-item" data-id="${esc(item.id)}" title="Eliminar del carrito" aria-label="Eliminar ${esc(item.nombre)}">&times;</button>
            </div>
        `;
        cartItemsContainer.appendChild(div);
    });

    const totalFormateado = `$${totalAcumulado.toLocaleString('es-CO')} COP`;
    cartTotalPrice.innerText = totalFormateado;

    msjWhatsApp += `\n*Total a pagar:* ${totalFormateado}`;

    if (btnPayWA) {
        btnPayWA.href = `https://wa.me/573155654422?text=${encodeURIComponent(msjWhatsApp)}`;
    }
    // Total dinámico para el checkout Bold (firma generada por el Worker)
    if (btnPayMP) btnPayMP.setAttribute('data-total-num', String(totalAcumulado));
}

// ====== Búsqueda de productos ======
function filtrarProductos() {
    const texto = document.getElementById('buscador-productos').value.toLowerCase();
    const tarjetas = document.querySelectorAll('.product-card');

    tarjetas.forEach(tarjeta => {
        const nombre = tarjeta.querySelector('.product-info h3').textContent.toLowerCase();
        tarjeta.classList.toggle('producto-oculto', !nombre.includes(texto));
    });
}