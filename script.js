document.addEventListener('DOMContentLoaded', () => {
    fetch('./productos.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP! estado: ${response.status}`);
            }
            return response.json();
        })
        .then(productos => {
            const grid = document.getElementById('product-grid');
            const modals = document.getElementById('modals-container');

            if (!grid || !modals) return;

            // URL general de cobro de Mercado Pago
            const linkPagoGeneral = "https://mpago.li/2aBTmmg";

            productos.forEach(prod => {
                // 1. Tarjeta del catálogo
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

                // 2. Modal de producto con doble botón de pago
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
                                <a href="${linkPagoGeneral}" target="_blank" class="btn-card" style="background-color: #009ee3; text-align: center; text-decoration: none; color: white;">
                                    💳 Pagar con PSE / Tarjeta (${prod.precio})
                                </a>
                                <a href="https://wa.me/573173482040?text=Hola,%20quiero%20comprar%20el%20producto%20${encodeURIComponent(prod.nombre)}" target="_blank" class="btn-card" style="background-color: #25d366; text-align: center; text-decoration: none; color: white;">
                                    💬 Pedir por WhatsApp
                                </a>
                            </div>
                        </div>
                    </div>
                `;
                modals.appendChild(modal);
            });
        })
        .catch(error => console.error('Error cargando los productos:', error));
});