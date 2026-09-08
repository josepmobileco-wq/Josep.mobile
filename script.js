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

const LINK_PAGO_RESPALDO = 'https://mpago.li/2aBTmmg';

// ====== Utilidades ======
function esc(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
                const enlacePago = prod.link_pago ? prod.link_pago : LINK_PAGO_RESPALDO;

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
                                <a href="${esc(enlacePago)}" target="_blank" rel="noopener noreferrer" class="btn-card btn-mp-link">
                                    <i class="fa-solid fa-credit-card"></i> Pagar con PSE / Tarjeta (${esc(prod.precio)})
                                </a>
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
        if (btnPayMP) btnPayMP.href = '#';
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
    if (btnPayMP) btnPayMP.href = LINK_PAGO_RESPALDO;
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