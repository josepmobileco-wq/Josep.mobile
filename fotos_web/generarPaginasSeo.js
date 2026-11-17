// Genera paginas individuales (SEO) + sitemap + categorias para cada producto.
// Uso: node generarPaginasSeo.js
const fs = require('fs');
const path = require('path');

const WEB = 'C:/Users/cris7/OneDrive/Escritorio/pagina web Josep';
const OUT = path.join(WEB, 'seo');
const BASE_URL = 'https://josepmobile.com';

const pos = JSON.parse(fs.readFileSync('C:/Users/cris7/OneDrive/Escritorio/Pos Josep/productos.json', 'utf8'));

const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const precioNum = (t) => parseInt(String(t || 0).replace(/[^0-9]/g, ''), 10) || 0;
const fmtPrecio = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

const tieneVariantes = (p) => Array.isArray(p.variantes) && p.variantes.length > 0;
const stockVariante = (v) => {
    if (v && Array.isArray(v.colores) && v.colores.length) {
        return v.colores.reduce((s, c) => s + (Number(c.stock) || 0), 0);
    }
    return Number(v.stock) || 0;
};
const stockTotal = (p) => {
    if (tieneVariantes(p)) return p.variantes.reduce((s, v) => s + stockVariante(v), 0);
    return Number(p.stock) || 0;
};
const precioVariante = (p, v) => (v && v.precio != null) ? Number(v.precio) || 0 : precioNum(p.precio);
const precioColor = (p, v, c) => (c && c.precio != null) ? Number(c.precio) || 0 : precioVariante(p, v);

const PALETA = /^(negro|blanca?|blanco|rosa|fucsia|azul|verde|morado|lila|violeta|naranja|menta|beige|crema|gris|roja?|rojo|amarillo|amarilla|celeste|turquesa|café|cocoa|vinotinto|borgoña|dorado|dorada|plateado|lima|champagne|black|white|pink|blue|green|purple|orange|red|yellow|silver|gold)$/i;
const esColor = (n) => PALETA.test(String(n || '').trim());

function tipoDeVariantes(p) {
    const vars = p.variantes || [];
    if (!vars.length) return null;
    if (vars.every(v => esColor(v.nombre))) return 'color';
    const conSub = vars.filter(v => Array.isArray(v.colores) && v.colores.length);
    if (conSub.length && conSub.every(v => v.colores.every(c => esColor(c.nombre)))) return 'color';
    return 'referencia';
}

// Slug SEO
function slugify(txt) {
    return String(txt || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\+/g, ' plus ')          // "iPhone 11 Pro +" -> distinto de "iPhone 11 Pro"
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 70)
        .replace(/-+$/g, '');
}

// Clasificacion para filtros/categorias
function categoriaDe(p) {
    const n = String(p.nombre || '').toLowerCase();
    if (/vidrio|protector|hidrogel/.test(n)) return 'vidrios';
    if (/reloj|smartwatch|smart watch/.test(n)) return 'smartwatches';
    if (/power ?bank|power band/.test(n)) return 'powerbanks';
    if (/cargador|adaptador|cubo de carga|marra/.test(n)) return 'cargadores';
    if (/audifono|audífono|auricular|intercomunicador|microfono/.test(n)) return 'audifonos';
    if (/case|funda|estuche/.test(n)) return 'estuches';
    return 'otros';
}

const CAT_PAGINAS = [
    { slug: 'cases-y-fundas-bogota', cat: 'estuches', titulo: 'Cases y Fundas para Celular en Bogotá',
      desc: 'Cases, fundas y estuches para celular en Bogotá. Silicona, cristal, lujo y magneticos con entrega inmediata. Pago contra entrega y envios a toda Colombia.' },
    { slug: 'audifonos-bluetooth-bogota', cat: 'audifonos', titulo: 'Audifonos Bluetooth en Bogotá',
      desc: 'Audifonos Bluetooth, inalambricos y con cancelacion de ruido en Bogotá. Envio rapido, pago contra entrega y garantia por defectos de fabrica.' },
    { slug: 'power-banks-carga-rapida', cat: 'powerbanks', titulo: 'Power Banks y Carga Rapida',
      desc: 'Power banks y baterias portatiles con carga rapida. Pagas al recibir en Bogota o recibe en cualquier ciudad de Colombia.' },
    { slug: 'cargadores-y-accesorios-celular', cat: 'cargadores', titulo: 'Cargadores y Accesorios para Celular',
      desc: 'Cargadores rapidos, cables y accesorios para celular. Originales y de calidad, con despacho desde Bogota a todo Colombia.' },
];

// ---- Productos publicados, con agotados al final ----
const publicados = pos
    .filter(p => p.web)
    .map((p, i) => ({ p, i, st: stockTotal(p) }))
    .sort((a, b) => {
        const aA = a.st <= 0 ? 1 : 0, bA = b.st <= 0 ? 1 : 0;
        if (aA !== bA) return aA - bA;
        return a.i - b.i;
    })
    .map(x => x.p);

// ---- Generador de paginas ----
const PAGES = [];
const urls = [];

function bloqueJsonLd(obj) {
    return JSON.stringify(obj, null, 2);
}

function paginaProducto(p) {
    const slug = slugify(p.nombre);
    const url = `${BASE_URL}/seo/${slug}/`;
    const fotos = Array.isArray(p.fotos) ? p.fotos : [];
    const stock = stockTotal(p);
    const hayStock = stock > 0;
    const vars = p.variantes || [];
    const tipo = tipoDeVariantes(p);

    // Selector de referencia/color
    let refsHtml = '';
    if (vars.length > 1) {
        const esColorSel = tipo === 'color';
        const botones = vars.map(v => {
            const st = stockVariante(v);
            const sel = st > 0 ? '' : ' disabled';
            return `<button type="button" class="prod-ref-btn" data-slug="${esc(slug)}" data-var="${esc(v.id)}" data-nombre="${esc(v.nombre)}" data-precio="${esc(fmtPrecio(precioVariante(p, v)))}" data-stock="${st}"${sel}>${esc(v.nombre)}${st <= 0 ? ' (agotado)' : ''}</button>`;
        }).join('');
        refsHtml = `
            <div class="prod-refs">
                <h2>${esColorSel ? 'Elige tu color' : 'Elige tu referencia (modelo de celular)'}</h2>
                <div class="prod-refs-lista">${botones}</div>
            </div>`;
    }

    // Precio con descuento (tachado) + cuotas
    const precioAct = precioNum(p.precio);
    const precioAnt = precioNum(p.precioOriginal);
    const tieneDescuento = precioAnt > precioAct;
    const pctDesc = tieneDescuento ? Math.round(((precioAnt - precioAct) / precioAnt) * 100) : 0;
    const CUOTAS_MIN = { 3: 50000, 6: 150000, 12: 300000 };
    const cuotasDisp = [];
    [3, 6, 12].forEach(c => { if (precioAct >= CUOTAS_MIN[c]) cuotasDisp.push(c); });
    const mejorCuota = cuotasDisp.length ? cuotasDisp[cuotasDisp.length - 1] : 0;
    const precioHtml = tieneDescuento
        ? `<div class="modal-fila-precio">
                <span class="modal-antes">${esc(fmtPrecio(precioAnt))}</span>
                <span class="modal-ahora">${esc(fmtPrecio(precioAct))}</span>
                <span class="modal-pct">-${pctDesc}%</span>
            </div>`
        : `<div class="prod-precio" id="prod-precio">${esc(fmtPrecio(precioAct))}</div>`;
    const cuotasHtml = mejorCuota
        ? `<p class="modal-cuotas"><i class="fa-solid fa-credit-card" aria-hidden="true"></i>${mejorCuota} cuotas sin interés de ${esc(fmtPrecio(Math.ceil(precioAct / mejorCuota)))}</p>`
        : '';

    // Selector de color (2do nivel) si aplica
    let colorHtml = '';
    const conColores = vars.filter(v => Array.isArray(v.colores) && v.colores.length >= 2);
    if (conColores.length) {
        const v0 = conColores[0];
        const sw = v0.colores.map(c => {
            const st = Number(c.stock) || 0;
            return `<button type="button" class="prod-ref-btn" data-color="${esc(c.id)}" data-var="${esc(v0.id)}" data-nombre="${esc(c.nombre)}" data-precio="${esc(fmtPrecio(precioColor(p, v0, c)))}" data-stock="${st}"${st <= 0 ? ' disabled' : ''}>${esc(c.nombre)}${st <= 0 ? ' (agotado)' : ''}</button>`;
        }).join('');
        colorHtml = `
            <div class="prod-refs">
                <h2>Elige tu color</h2>
                <div class="prod-refs-lista">${sw}</div>
            </div>`;
    }

    const relacionados = publicados
        .filter(x => x.id !== p.id && categoriaDe(x) === categoriaDe(p))
        .slice(0, 6);

    const otrosHtml = relacionados.length ? `
        <div class="prod-otros">
            <h2>Te puede interesar tambien</h2>
            <div class="prod-otros-lista">
                ${relacionados.map(r => `
                    <a href="/seo/${slugify(r.nombre)}/">
                        <img src="/${esc((r.fotos || [])[0] || 'logojosepmobile.jpeg')}" alt="${esc(r.nombre)}" loading="lazy">
                        <div><b>${esc(r.nombre)}</b><span>${esc(fmtPrecio(r.precio))}</span></div>
                    </a>`).join('')}
            </div>
        </div>` : '';

    const imagenPrincipal = fotos[0] ? `${BASE_URL}/${fotos[0]}` : `${BASE_URL}/logojosepmobile.jpeg`;

    const ld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": p.nombre,
        "description": p.corta || p.detalles || '',
        "image": fotos.map(f => `${BASE_URL}/${f}`),
        "sku": p.codigo || p.id,
        "brand": { "@type": "Brand", "name": "Josep.mobile" },
        "category": p.categoria || 'Accesorios para celular',
        "offers": {
            "@type": "Offer",
            "url": url,
            "priceCurrency": "COP",
            "price": precioNum(p.precio),
            "availability": hayStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition",
            "priceValidUntil": new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
            "seller": { "@type": "Organization", "name": "Josep Mobile", "url": BASE_URL + '/' }
        },
        "aggregateRating": undefined
    };
    delete ld.aggregateRating;
    // Precio de referencia (tachado) para los productos con descuento
    if (precioAnt > precioAct) {
        ld.offers.priceSpecification = {
            "@type": "PriceSpecification",
            "price": precioAnt,
            "priceCurrency": "COP",
            "valueAddedTaxIncluded": false
        };
    }

    const breadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Inicio", "item": BASE_URL + '/' },
            { "@type": "ListItem", "position": 2, "name": 'Productos', "item": BASE_URL + '/#productos' },
            { "@type": "ListItem", "position": 3, "name": p.nombre, "item": url }
        ]
    };

    return {
        slug,
        url,
        html: `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.nombre)} | Josep.mobile Bogota</title>
<meta name="description" content="${esc((p.corta || '').slice(0, 155))}">
<meta name="keywords" content="${esc(p.nombre.toLowerCase())}, ${esc((p.categoria || 'accesorios celular').toLowerCase())}, Bogota, pago contra entrega, envio Colombia">
<link rel="icon" type="image/jpeg" href="/logojosepmobile.jpeg">
<link rel="canonical" href="${url}">
<link rel="stylesheet" href="/style.css?v=202611171510">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Josep.mobile">
<meta property="og:title" content="${esc(p.nombre)} | Josep.mobile">
<meta property="og:description" content="${esc((p.corta || '').slice(0, 155))}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${imagenPrincipal}">
<meta property="og:locale" content="es_CO">
<meta property="product:price:amount" content="${precioNum(p.precio)}">
<meta property="product:price:currency" content="COP">
<meta property="product:availability" content="${hayStock ? 'in stock' : 'out of stock'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.nombre)} | Josep.mobile">
<meta name="twitter:description" content="${esc((p.corta || '').slice(0, 155))}">
<meta name="twitter:image" content="${imagenPrincipal}">
<script type="application/ld+json">
${bloqueJsonLd(ld)}
</script>
<script type="application/ld+json">
${bloqueJsonLd(breadcrumb)}
</script>
</head>
<body class="con-topbar">
<div class="topbar">
    <i class="fa-solid fa-truck-fast" aria-hidden="true"></i>Envio GRATIS en Bogota por compras superiores a $35.000
    <span class="topbar-sep">|</span>
    <i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i>Pago contra entrega
</div>
<header class="header">
    <nav class="navbar">
        <a href="/" class="logo" aria-label="Josep.mobile - Inicio">
            <img src="/logojosepmobile.jpeg" alt="Logo Josep.mobile" class="logo-img">
            <span class="logo-text">Josep<span class="highlight">.mobile</span></span>
        </a>
        <ul class="nav-links">
            <li><a href="/#inicio">Inicio</a></li>
            <li><a href="/#productos">Productos</a></li>
            <li><a href="/#nosotros">Nosotros</a></li>
            <li><a href="/#contacto">Contacto</a></li>
        </ul>
        <div class="header-actions">
            <a href="https://www.instagram.com/josep.mobile/" target="_blank" rel="noopener noreferrer" class="btn-header-social btn-instagram" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>
            <a href="https://wa.me/573173482040" target="_blank" rel="noopener noreferrer" class="btn-header-social btn-whatsapp-header" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>
            <a href="/#productos" class="cart-icon-container" aria-label="Ver catalogo"><i class="fa-solid fa-bag-shopping"></i></a>
        </div>
    </nav>
</header>
<main class="prod-page">
    <nav class="prod-breadcrumb" aria-label="Ruta de navegacion">
        <a href="/">Inicio</a> &rsaquo; <a href="/#productos">Productos</a> &rsaquo; ${esc(p.nombre)}
    </nav>
    <div class="prod-layout">
        <div class="prod-gallery">
            <img id="prod-img" src="${fotos[0] ? '/' + esc(fotos[0]) : '/logojosepmobile.jpeg'}" alt="${esc(p.nombre)}" width="800" height="800">
            ${fotos.length > 1 ? `<div class="prod-thumbs">${fotos.map((f, i) => `<img src="/${esc(f)}" alt="${esc(p.nombre)} vista ${i + 1}" data-src="/${esc(f)}" class="${i === 0 ? 'activa' : ''}" loading="lazy">`).join('')}</div>` : ''}
        </div>
        <div class="prod-info">
            <h1>${esc(p.nombre)}</h1>
            ${precioHtml}
            ${cuotasHtml}
            <div class="prod-stock ${hayStock ? 'disponible' : 'agotado'}">${hayStock ? 'Disponible para entrega inmediata' : 'Agotado - avisanos cuando llegue'}</div>
            ${refsHtml}
            ${colorHtml}
            <div class="prod-detalle">
                <h2>DETALLES DEL PRODUCTO</h2>
                <p>${esc(p.detalles || p.corta || '')}</p>
            </div>
            <div class="prod-acciones">
                ${hayStock ? `
                <a class="btn-card" id="btn-comprar" href="https://wa.me/573173482040?text=${encodeURIComponent('Hola! Quiero el ' + p.nombre + ' (' + fmtPrecio(p.precio) + ')')}" target="_blank" rel="noopener noreferrer" style="background:#25D366;color:#fff;">
                    <i class="fa-brands fa-whatsapp"></i> Comprar por WhatsApp
                </a>
                <a class="btn-card" href="/#productos" style="background:#2558D4;color:#fff;">
                    <i class="fa-solid fa-cart-plus"></i> Ver en el catalogo
                </a>` : `
                <a class="btn-card" href="https://wa.me/573173482040?text=${encodeURIComponent('Hola! Quisiera saber cuando llega el ' + p.nombre)}" target="_blank" rel="noopener noreferrer" style="background:#25D366;color:#fff;">
                    <i class="fa-brands fa-whatsapp"></i> Avisar cuando llegue
                </a>`}
            </div>
            <div class="confianza">
                <div class="confianza-item"><i class="fa-solid fa-hand-holding-dollar"></i><span>Pago contra entrega en Bogota</span></div>
                <div class="confianza-item"><i class="fa-solid fa-shield-halved"></i><span>Garantia por defectos de fabrica</span></div>
                <div class="confianza-item"><i class="fa-solid fa-truck-fast"></i><span>Despacho rapido desde Bogota</span></div>
            </div>
        </div>
    </div>
    ${otrosHtml}
</main>
<footer class="footer">
    <div class="footer-container">
        <p>&copy; ${new Date().getFullYear()} Josep.mobile &middot; C.C. Shangai, Local 1223 &middot; San Andresito de la 38, Bogota</p>
        <p><a href="/">Volver al catalogo</a> &middot; <a href="/#contacto">Contacto</a> &middot; <a href="/#nosotros">Nosotros</a></p>
    </div>
</footer>
<script>
(function () {
    var img = document.getElementById('prod-img');
    document.querySelectorAll('.prod-thumbs img').forEach(function (t) {
        t.addEventListener('click', function () {
            img.src = t.getAttribute('data-src');
            document.querySelectorAll('.prod-thumbs img').forEach(function (o) { o.classList.remove('activa'); });
            t.classList.add('activa');
        });
    });
    // Selector de referencia / color: actualiza precio y enlace de WhatsApp
    var precioBase = ${precioNum(p.precio)};
    var nombreBase = ${JSON.stringify(p.nombre)};
    var btn = document.getElementById('btn-comprar');
    function seleccionar(nombre, precio, url) {
        var el = document.getElementById('prod-precio');
        if (el) el.textContent = precio;
        if (btn && url) btn.href = url;
    }
    document.querySelectorAll('.prod-ref-btn').forEach(function (b) {
        b.addEventListener('click', function () {
            document.querySelectorAll('.prod-ref-btn').forEach(function (o) { o.classList.remove('activo'); });
            b.classList.add('activo');
            var nombre = b.getAttribute('data-nombre');
            var precio = b.getAttribute('data-precio');
            var stock = parseInt(b.getAttribute('data-stock') || '0', 10);
            var stockEl = document.querySelector('.prod-stock');
            if (stockEl) {
                stockEl.textContent = stock > 0 ? 'Disponible para entrega inmediata' : 'Agotado - avisanos cuando llegue';
                stockEl.className = 'prod-stock ' + (stock > 0 ? 'disponible' : 'agotado');
            }
            seleccionar(nombre, precio, 'https://wa.me/573173482040?text=' + encodeURIComponent('Hola! Quiero el ' + nombre + ' (' + precio + ')'));
        });
    });
})();
</script>
</body>
</html>`
    };
}

// ---- Generar paginas de producto ----
for (const p of publicados) {
    const { slug, url, html } = paginaProducto(p);
    const dir = path.join(OUT, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    PAGES.push({ slug, url });
    urls.push({ loc: url, changefreq: 'weekly', priority: p.stock > 0 ? '0.8' : '0.4', lastmod: new Date().toISOString().slice(0, 10) });
}

fs.mkdirSync(OUT, { recursive: true });

// ---- Generar paginas de categoria ----
for (const cp of CAT_PAGINAS) {
    const items = publicados.filter(p => categoriaDe(p) === cp.cat);
    const url = `${BASE_URL}/${cp.slug}/`;
    const dir = path.join(WEB, cp.slug);
    fs.mkdirSync(dir, { recursive: true });

    const itemList = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": cp.titulo,
        "itemListElement": items.map((p, i) => ({
            "@type": "ListItem",
            "position": i + 1,
            "url": `${BASE_URL}/seo/${slugify(p.nombre)}/`,
            "name": p.nombre
        }))
    };

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(cp.titulo)} | Josep.mobile</title>
<meta name="description" content="${esc(cp.desc)}">
<meta name="keywords" content="${esc(cp.titulo.toLowerCase())}, Bogota, Colombia, pago contra entrega">
<link rel="icon" type="image/jpeg" href="/logojosepmobile.jpeg">
<link rel="canonical" href="${url}">
<link rel="stylesheet" href="/style.css?v=202611171510">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Josep.mobile">
<meta property="og:title" content="${esc(cp.titulo)} | Josep.mobile">
<meta property="og:description" content="${esc(cp.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE_URL}/logojosepmobile.jpeg">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": cp.titulo,
        "description": cp.desc,
        "url": url,
        "isPartOf": { "@type": "WebSite", "name": "Josep.mobile", "url": BASE_URL + '/' }
    }, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(itemList, null, 2)}
</script>
</head>
<body class="con-topbar">
<div class="topbar">
    <i class="fa-solid fa-truck-fast"></i>Envio GRATIS en Bogota por compras superiores a $35.000
    <span class="topbar-sep">|</span>
    <i class="fa-solid fa-hand-holding-dollar"></i>Pago contra entrega
</div>
<header class="header">
    <nav class="navbar">
        <a href="/" class="logo"><img src="/logojosepmobile.jpeg" alt="Logo Josep.mobile" class="logo-img"><span class="logo-text">Josep<span class="highlight">.mobile</span></span></a>
        <ul class="nav-links">
            <li><a href="/#inicio">Inicio</a></li>
            <li><a href="/#productos">Productos</a></li>
            <li><a href="/#nosotros">Nosotros</a></li>
            <li><a href="/#contacto">Contacto</a></li>
        </ul>
        <div class="header-actions">
            <a href="https://www.instagram.com/josep.mobile/" target="_blank" rel="noopener noreferrer" class="btn-header-social btn-instagram" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>
            <a href="https://wa.me/573173482040" target="_blank" rel="noopener noreferrer" class="btn-header-social btn-whatsapp-header" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>
            <a href="/#productos" class="cart-icon-container" aria-label="Ver catalogo"><i class="fa-solid fa-bag-shopping"></i></a>
        </div>
    </nav>
</header>
<main class="products">
    <h1 class="section-title">${esc(cp.titulo)}</h1>
    <p style="text-align:center;color:#475569;max-width:760px;margin:0 auto 2rem;">${esc(cp.desc)}</p>
    <div class="product-grid">
        ${items.map(p => `
        <div class="product-card${stockTotal(p) > 0 ? '' : ' sin-stock'}">
            <a href="/seo/${slugify(p.nombre)}/" class="card-modal-trigger">
                <div class="product-image">
                    <img src="/${esc((p.fotos || [])[0] || 'logojosepmobile.jpeg')}" alt="${esc(p.nombre)}" loading="lazy">
                    ${stockTotal(p) > 0 ? '' : '<span class="agotado-badge">Agotado</span>'}
                </div>
                <div class="product-info">
                    <h3>${esc(p.nombre)}</h3>
                    <p class="short-desc" style="text-align:justify;">${esc(p.corta || '')}</p>
                    <span class="price">${esc(fmtPrecio(p.precio))}</span>
                    <span class="btn-card">Ver opciones de compra</span>
                </div>
            </a>
        </div>`).join('')}
    </div>
</main>
<footer class="footer">
    <div class="footer-container">
        <p>&copy; ${new Date().getFullYear()} Josep.mobile &middot; Bogota, Colombia</p>
        <p><a href="/">Volver al catalogo</a> &middot; <a href="/#contacto">Contacto</a></p>
    </div>
</footer>
</body>
</html>`;
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    urls.push({ loc: url, changefreq: 'weekly', priority: '0.9', lastmod: new Date().toISOString().slice(0, 10) });
}

// ---- sitemap.xml ----
const hoy = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${BASE_URL}/</loc>
        <lastmod>${hoy}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
${urls.map(u => `    <url>
        <loc>${u.loc}</loc>
        <lastmod>${u.lastmod}</lastmod>
        <changefreq>${u.changefreq}</changefreq>
        <priority>${u.priority}</priority>
    </url>`).join('\n')}
    <url>
        <loc>${BASE_URL}/llms.txt</loc>
        <lastmod>${hoy}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.6</priority>
    </url>
</urlset>`;
fs.writeFileSync(path.join(WEB, 'sitemap.xml'), sitemap, 'utf8');

// ---- robots.txt (rastreo permitido para motores de respuesta con IA) ----
const robots = `# robots.txt - Josep Mobile (https://josepmobile.com)

# Motores de respuesta con IA: se permite explícitamente el rastreo
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Applebot-Extended
Allow: /

# Resto de rastreadores
User-agent: *
Allow: /
Disallow: /checkout/

Sitemap: ${BASE_URL}/sitemap.xml
LLM.txt: ${BASE_URL}/llms.txt
`;
fs.writeFileSync(path.join(WEB, 'robots.txt'), robots, 'utf8');

console.log('Paginas de producto generadas: ' + PAGES.length);
console.log('Paginas de categoria generadas: ' + CAT_PAGINAS.length);
console.log('URLs en sitemap.xml: ' + (urls.length + 1));
console.log('Carpeta: ' + OUT);
