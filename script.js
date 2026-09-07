let carrito = JSON.parse(localStorage.getItem('carrito_josep')) || [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar productos desde JSON
    fetch('./productos.json')
        .then(response => {
            if (!response.ok) throw new Error(`Error HTTP! estado: ${response.status}`);
            return response.json();
        })
        .then(productos => {
            const grid = document.getElementById('product-grid');
            const modals = document.getElementById('modals-container');

            if (!grid || !modals) return;

            const linkRespaldo = "https://mpago.li/2aBTmmg";

            productos.forEach(prod => {
                const enlacePago = prod.link_pago ? prod.link_pago : linkRespaldo;

                // Tarjeta del catálogo
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    <a href="#producto-${prod.id}" class="card-modal-trigger">
                        <div class="product-image">
                            <img src="${prod.fotos[0]}" alt="${prod.nombre}">
                        </div>
                        <div class="product-info">
                            <h3>${prod.nombre}</h3>
                            <p class="short-desc">${prod.corta}</p>
                            <span class="price">${prod.precio}</span>
                            <span class="btn-card">Ver opciones de compra</span>
                        </div>
                    </a>
                `;
                grid.appendChild(card);

                // Modal del detalle de producto
                const radioInputs = prod.fotos.map((img, i) => 
                    `<input type="radio" name="gallery-${prod.id}" id="img${i+1}-${prod.id}" ${i === 0 ? 'checked' : ''} class="gallery-selector">`
                ).join('');

                const displayImages = prod.fotos.map((img, i) => 
                    `<img src="${img}" class="img-display img-${i+1}" alt="Foto ${i+1}">`
                ).join('');

                const thumbnails = prod.fotos.map((img, i) => 
                    `<label for="img${i+1}-${prod.id}" class="thumb-item"><img src="${img}" alt="Vista ${i+1}"></label>`
                ).join('');

                const modal = document.createElement('div');
                modal.id = `producto-${prod.id}`;
                modal.className = 'modal-policy';
                modal.innerHTML = `
                    <div class="modal-product-container">
                        <a href="#" class="close-modal">&times;</a>
                        <div class="modal-product-media">
                            ${radioInputs}
                            <div class="main-image-view">${displayImages}</div>
                            <div class="gallery-thumbnails">${thumbnails}</div>
                        </div>
                        <div class="modal-product-details">
                            <h2>${prod.nombre}</h2>
                            <p class="modal-price">${prod.precio}</p>
                            <div class="modal-description">
                                <h4>DETALLES DEL PRODUCTO</h4>
                                <p>${prod.detalles}</p>
                            </div>
                            
                            <div class="modal-actions" style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px;">
                                <button class="btn-card btn-add-cart" data-id="${prod.id}" data-nombre="${prod.nombre}" data-precio="${prod.precio}" style="background-color: #ff9900; color: white; border: none; cursor: pointer;">
                                    🛒 Agregar al Carrito
                                </button>
                                <a href="${enlacePago}" target="_blank" class="btn-card" style="background-color: #009ee3; text-align: center; text-decoration: none; color: white;">
                                    💳 Pagar con PSE / Tarjeta (${prod.precio})
                                </a>
                                <a href="https://wa.me/573173482040?text=Hola,%20quiero%20comprar%20el%20producto%20${encodeURIComponent(prod.nombre)}" target="_blank" class="btn-card" style="background-color: #25d366; text-align: center; text-decoration: none; color: white;">
                                    💬 Comprar directo por WhatsApp
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
});

// Eventos delegados globales
document.addEventListener('click', (e) => {
    // 1. Cierre de modal de producto
    if (e.target.classList.contains('close-modal')) {
        e.preventDefault();
        const activeModal = e.target.closest('.modal-policy');
        if (activeModal) activeModal.style.display = 'none';
        history.pushState("", document.title, window.location.pathname + window.location.search);
    }

    // 2. Apertura de modal de producto
    if (e.target.closest('.card-modal-trigger')) {
        const modalId = e.target.closest('.card-modal-trigger').getAttribute('href');
        const targetModal = document.querySelector(modalId);
        if (targetModal) targetModal.style.display = 'flex';
    }

    // 3. Botón Agregar al Carrito
    if (e.target.classList.contains('btn-add-cart')) {
        const id = e.target.getAttribute('data-id');
        const nombre = e.target.getAttribute('data-nombre');
        const precioTexto = e.target.getAttribute('data-precio');
        const precioNum = parseInt(precioTexto.replace(/[^0-9]/g, ''), 10);

        const existe = carrito.find(item => item.id === id);
        if (existe) {
            existe.cantidad += 1;
        } else {
            carrito.push({ id, nombre, precioTexto, precioNum, cantidad: 1 });
        }

        guardarYActualizar();
        
        // Cerrar modal del producto y abrir carrito
        const activeModal = e.target.closest('.modal-policy');
        if (activeModal) activeModal.style.display = 'none';
        history.pushState("", document.title, window.location.pathname + window.location.search);
        
        const cartModal = document.getElementById('cart-modal');
        if (cartModal) cartModal.classList.add('active');
    }

    // 4. Abrir panel de carrito
    if (e.target.id === 'cart-icon' || e.target.closest('#cart-icon')) {
        e.preventDefault();
        const cartModal = document.getElementById('cart-modal');
        if (cartModal) cartModal.classList.add('active');
    }

    // 5. Cerrar panel de carrito
    if (e.target.id === 'close-cart' || e.target === document.getElementById('cart-modal')) {
        const cartModal = document.getElementById('cart-modal');
        if (cartModal) cartModal.classList.remove('active');
    }

    // 6. Eliminar o Restar unidad del ítem del carrito
    const btnRemove = e.target.closest('.btn-remove-item');
    if (btnRemove) {
        const id = btnRemove.getAttribute('data-id');
        const producto = carrito.find(item => item.id === id);

        if (producto) {
            if (producto.cantidad > 1) {
                producto.cantidad -= 1; // Resta 1 unidad si tiene varias
            } else {
                carrito = carrito.filter(item => item.id !== id); // Elimina si solo queda 1
            }
            guardarYActualizar();
        }
    }
});

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
        cartItemsContainer.innerHTML = '<p style="text-align:center; color:#888;">Tu carrito está vacío.</p>';
        cartTotalPrice.innerText = '$0 COP';
        if (btnPayWA) btnPayWA.href = '#';
        if (btnPayMP) btnPayMP.href = '#';
        return;
    }

    let msjWhatsApp = "Hola! Quiero realizar el pedido de los siguientes productos:\n\n";

    // Muestra Nombre - Precio a la derecha y botón Eliminar
    carrito.forEach(item => {
        const subtotal = item.precioNum * item.cantidad;
        totalAcumulado += subtotal;

        const subtotalTexto = `$${subtotal.toLocaleString('es-CO')} COP`;
        msjWhatsApp += `- ${item.nombre} ${item.cantidad > 1 ? `(x${item.cantidad})` : ''}: ${subtotalTexto}\n`;

        const div = document.createElement('div');
        div.className = 'cart-item-simple';
        div.innerHTML = `
            <span class="cart-item-name">${item.nombre} ${item.cantidad > 1 ? `<small style="color:#ff9900; font-weight:bold;">(x${item.cantidad})</small>` : ''}</span>
            <div class="cart-item-price-controls">
                <span class="cart-item-price">${subtotalTexto}</span>
                <button type="button" class="btn-remove-item" data-id="${item.id}" title="Eliminar del carrito" style="background:none; border:none; color:#ff4d4d; font-size:1.2rem; cursor:pointer; font-weight:bold; padding: 0 5px;">&times;</button>
            </div>
        `;
        cartItemsContainer.appendChild(div);
    });

    const totalFormateado = `$${totalAcumulado.toLocaleString('es-CO')} COP`;
    cartTotalPrice.innerText = totalFormateado;

    msjWhatsApp += `\n*Total a pagar:* ${totalFormateado}`;
    
    if (btnPayWA) btnPayWA.href = `https://wa.me/573173482040?text=${encodeURIComponent(msjWhatsApp)}`;
    if (btnPayMP) btnPayMP.href = "https://mpago.li/2aBTmmg";
}

function filtrarProductos() {
    const texto = document.getElementById('buscador-productos').value.toLowerCase();
    const tarjetas = document.querySelectorAll('.product-card');

    tarjetas.forEach(tarjeta => {
        const nombre = tarjeta.querySelector('.product-info h3').textContent.toLowerCase();
        if (nombre.includes(texto)) {
            tarjeta.classList.remove('producto-oculto');
        } else {
            tarjeta.classList.add('producto-oculto');
        }
    });
}