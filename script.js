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
const WHATSAPP_TIENDA = '573173482040';
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
        iniciarPagoBold(boton);
    }
});

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

            productos.forEach(prod => {
                const precioNumProd = parseInt(String(prod.precio).replace(/[^0-9]/g, ''), 10) || 0;

                // Tarjeta del catálogo
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    <a href="#producto-${esc(prod.id)}" class="card-modal-trigger">
                        <div class="product-image">
                            <img src="${esc(prod.fotos[0])}" alt="${esc(prod.nombre)}" loading="lazy">
                        </div>
                        <div class="product-info">
                            <h3>${esc(prod.nombre)}</h3>
                            <p class="short-desc">${esc(prod.corta)}</p>
                            <span class="price">${esc(prod.precio)}</span>
                            <span class="btn-card">Ver opciones de compra</span>
                        </div>
                    </a>
                `;
                grid.appendChild(card);

                // Modal de detalle de producto
                const radioInputs = prod.fotos.map((img, i) =>
                    `<input type="radio" name="gallery-${esc(prod.id)}" id="img${i + 1}-${esc(prod.id)}" ${i === 0 ? 'checked' : ''} class="gallery-selector">`
                ).join('');

                const displayImages = prod.fotos.map((img, i) =>
                    `<img src="${esc(img)}" class="img-display img-${i + 1}" alt="${esc(prod.nombre)} - Foto ${i + 1}">`
                ).join('');

                const thumbnails = prod.fotos.map((img, i) =>
                    `<label for="img${i + 1}-${esc(prod.id)}" class="thumb-item"><img src="${esc(img)}" alt="Vista ${i + 1}"></label>`
                ).join('');

                const modal = document.createElement('div');
                modal.id = `producto-${esc(prod.id)}`;
                modal.className = 'modal-policy';
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                modal.setAttribute('aria-label', prod.nombre);
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
                            <p class="modal-price">${esc(prod.precio)}</p>
                            <div class="modal-description">
                                <h4>DETALLES DEL PRODUCTO</h4>
                                <p>${esc(prod.detalles)}</p>
                            </div>

                            <div class="modal-actions">
                                <button type="button" class="btn-card btn-add-cart" data-id="${esc(prod.id)}" data-nombre="${esc(prod.nombre)}" data-precio="${esc(prod.precio)}">
                                    <i class="fa-solid fa-cart-plus"></i> Agregar al Carrito
                                </button>
                                <button type="button" class="btn-card btn-mp-link btn-bold-producto" data-precio-num="${precioNumProd}" data-nombre="${esc(prod.nombre)}">
                                    <i class="fa-solid fa-credit-card"></i> Comprar ahora (${esc(prod.precio)})
                                </button>
                                <a href="https://wa.me/573173482040?text=${encodeURIComponent('Hola, quiero comprar el producto ' + prod.nombre)}" target="_blank" rel="noopener noreferrer" class="btn-card btn-wa-link">
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

    // 5. Agregar al carrito
    const addBtn = e.target.closest('.btn-add-cart');
    if (addBtn) {
        const id = addBtn.getAttribute('data-id');
        const nombre = addBtn.getAttribute('data-nombre');
        const precioTexto = addBtn.getAttribute('data-precio');
        const precioNum = parseInt(precioTexto.replace(/[^0-9]/g, ''), 10) || 0;

        const existe = carrito.find(item => item.id === id);
        if (existe) {
            existe.cantidad += 1;
        } else {
            carrito.push({ id, nombre, precioTexto, precioNum, cantidad: 1 });
        }

        guardarYActualizar();

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
        const monto = parseInt(btnBoldProd.getAttribute('data-precio-num'), 10) || 0;
        const nombre = btnBoldProd.getAttribute('data-nombre') || 'Producto Josep.mobile';
        if (monto <= 0) {
            toastBold('Precio no disponible para este producto.', true);
            return;
        }
        cerrarModales();
        abrirCheckout([{ nombre, cantidad: 1, precioNum: monto }], monto, 'producto');
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
        const items = carrito.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, precioNum: i.precioNum }));
        cerrarModales();
        const cartModal = document.getElementById('cart-modal');
        if (cartModal) cartModal.classList.remove('active');
        abrirCheckout(items, total, 'carrito');
        return;
    }

    // 8. Aumentar cantidad
    const btnPlus = e.target.closest('.btn-qty-plus');
    if (btnPlus) {
        const id = btnPlus.getAttribute('data-id');
        const producto = carrito.find(item => item.id === id);
        if (producto) {
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
        btnPayWA.href = `https://wa.me/573173482040?text=${encodeURIComponent(msjWhatsApp)}`;
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