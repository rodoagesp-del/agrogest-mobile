// Conexión en vivo al Google Sheets de AgroGest+
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpvGU5GwEfk6hK5A9eiO5-moXq9gxlxywtrXEfc63vaxGw6xDGAsCVkiUEJUH3uiBz1MrxVFqgKKaL/pub?gid=1727735409&single=true&output=csv';

// Conexión en vivo al Google Sheets de Usos y Especificaciones
const USOS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGndkXKibFfCovjtznlsbD4V9AiU593xd_3KSwoLOjppTMBFiEHWaG2zEMDWVPkSnUno7wdHU8Cca-/pub?gid=1408750423&single=true&output=csv';

let inventarioGlobal = [];
let aplicacionesGlobal = [];
let usosGlobal = [];

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
    Papa.parse(CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            procesarDatos(results.data);
            cargarUsos(); // Carga los usos en segundo plano
        },
        error: function(error) {
            document.getElementById('loading').innerText = "Error de conexión. Intente en modo online.";
        }
    });
}

function cargarUsos() {
    if (!USOS_CSV_URL) {
        document.getElementById('loading').style.display = 'none';
        return;
    }
    Papa.parse(USOS_CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            usosGlobal = results.data;
            document.getElementById('loading').style.display = 'none';
        }
    });
}

function procesarDatos(data) {
    let stockMap = {};
    aplicacionesGlobal = [];

    data.forEach(row => {
        let op = (row["Operación"] || "").trim();
        let prod = (row["Producto"] || "").trim().toUpperCase();
        let pa = (row["Principio Activo"] || "").trim().toUpperCase();
        let cat = (row["Categoría"] || "").trim().toUpperCase();
        let lote = (row["Lote"] || "").trim().toUpperCase();
        let venc = (row["Fecha Vencimiento"] || "").trim();
        let um = (row["Unidad Medida"] || "").trim();
        let origen = (row["Origen"] || "").trim();
        let destino = (row["Destino"] || "").trim();
        
        let cantRaw = row["Total_Cantidad"] || row["Cantidad"] || 0;
        let cantidad = parseFloat(cantRaw) || 0;

        if (!prod || cantidad === 0) return;

        // Registro de aplicaciones en campo
        if (op === "Salida" && destino === "Zonas de Cultivo") {
            aplicacionesGlobal.push({
                fecha: row["Fecha Inventario"] || row["Fecha"],
                producto: prod,
                lote: lote,
                zona: origen,
                usos: row["Objetivo Fitosanitario"],
                cantidad: cantidad,
                um: um
            });
        }

        // Cálculo algorítmico de stock
        const ALMACENES = ["Almacén de San Borja", "Almacén de Quilmana", "Almacén Fundo"];
        
        function modificarStock(almacen, qty) {
            if (!ALMACENES.includes(almacen)) return;
            let key = `${prod}|${lote}|${almacen}`;
            if (!stockMap[key]) {
                stockMap[key] = { producto: prod, pa: pa, cat: cat, lote: lote, venc: venc, almacen: almacen, um: um, stock: 0 };
            }
            stockMap[key].stock += qty;
        }

        if (["Entrada", "Traslado Entrada", "Traslado Entrada Campo"].includes(op)) {
            modificarStock(destino, cantidad);
        } else if (["Salida", "Traslado Salida"].includes(op)) {
            modificarStock(origen, -cantidad);
        } else if (op === "Traslado") {
            modificarStock(origen, -cantidad);
            modificarStock(destino, cantidad);
        } else if (op === "Ajuste") {
            let almAjuste = destino || origen;
            let signo = (row["Observaciones"] || "").toLowerCase().includes("sobrante") ? 1 : -1;
            modificarStock(almAjuste, cantidad * signo);
        }
    });

    inventarioGlobal = Object.values(stockMap).filter(item => item.stock > 0);
    inventarioGlobal.sort((a, b) => {
        let parseDate = (d) => {
            if (!d || d === "-" || d === "DD/MM/AAAA") return new Date(9999, 11, 31);
            let parts = d.split("/");
            return new Date(parts[2], parts[1] - 1, parts[0]);
        };
        return parseDate(a.venc) - parseDate(b.venc);
    });

    aplicacionesGlobal.reverse();
    filtrarDatos();
}

function filtrarDatos() {
    let q = document.getElementById('searchInput').value.toUpperCase();
    let cat = document.getElementById('filtroCategoria').value;
    let alm = document.getElementById('filtroAlmacen').value;

    let htmlStock = "";
    inventarioGlobal.forEach(item => {
        let matchText = `${item.producto} ${item.lote}`.includes(q);
        let matchCat = (cat === "TODAS" || item.cat === cat);
        let matchAlm = (alm === "TODOS" || item.almacen === alm);

        if (matchText && matchCat && matchAlm) {
            let badgeClass = item.almacen.includes("San Borja") ? "san-borja" : item.almacen.includes("Quilmana") ? "quilmana" : "fundo";
            
            // Tarjeta interactiva con onclick
            htmlStock += `
                <div class="card" onclick="mostrarDetalles('${item.producto.replace(/'/g, "\\'")}')" style="cursor: pointer; position: relative;">
                    <div class="icono-info">ℹ️</div>
                    <div class="card-title">${item.producto}</div>
                    <div class="card-subtitle">${item.pa || '-'}</div>
                    <div class="card-details">
                        <div>
                            <span class="badge ${badgeClass}">${item.almacen.replace('Almacén ', '').replace('de ', '')}</span><br>
                            <span style="font-size:0.8rem; color:#7f8c8d; display:block; margin-top:5px;">Lote: ${item.lote || '-'}</span>
                        </div>
                        <div>
                            <div class="stock-value">${item.stock.toFixed(2)} ${item.um}</div>
                            <div class="fecha-venc" style="color: ${item.venc === '-' ? '#7f8c8d' : 'var(--danger)'}">Vence: ${item.venc}</div>
                        </div>
                    </div>
                </div>
            `;
        }
    });

    if(!htmlStock) htmlStock = "<div class='loading'>No se encontraron productos en stock.</div>";
    document.getElementById('stockView').innerHTML = htmlStock;

    let htmlCampo = "";
    aplicacionesGlobal.forEach(item => {
        let matchText = `${item.producto} ${item.lote} ${item.zona} ${item.usos}`.includes(q);
        if (matchText) {
            htmlCampo += `
                <div class="card campo">
                    <div style="display:flex; justify-content:space-between;">
                        <div class="card-title">${item.producto}</div>
                        <div style="font-size:0.8rem; color:#8E44AD; font-weight:bold;">${item.fecha}</div>
                    </div>
                    <div class="card-details" style="margin-top:8px;">
                        <div>
                            <strong>Zona:</strong> ${item.zona}<br>
                            <strong>Lote:</strong> ${item.lote}
                        </div>
                        <div style="text-align:right;">
                            <div class="stock-value" style="color:#8E44AD;">${item.cantidad.toFixed(2)} ${item.um}</div>
                        </div>
                    </div>
                    <div style="margin-top:8px; font-size:0.8rem; color:#555;">
                        <strong>Objetivos:</strong> ${item.usos}
                    </div>
                </div>
            `;
        }
    });
    
    if(!htmlCampo) htmlCampo = "<div class='loading'>No se encontraron aplicaciones en campo.</div>";
    document.getElementById('campoView').innerHTML = htmlCampo;
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none');
    
    if(tab === 'stock') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('stockView').style.display = 'block';
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('campoView').style.display = 'block';
    }
}

/* ================= Lógica del Modal ================= */
function mostrarDetalles(productoNombre) {
    let usosDelProducto = usosGlobal.filter(u => (u["Producto"] || "").trim().toUpperCase() === productoNombre);
    
    let modalBody = document.getElementById('modalBody');
    document.getElementById('modalTitle').innerText = `📋 Especificaciones:\n${productoNombre}`;
    
    if (usosDelProducto.length === 0) {
        modalBody.innerHTML = "<p style='color: #7F8C8D; font-size: 0.9rem; text-align: center; margin-top: 10px;'>No hay usos o especificaciones registradas para este producto.</p>";
    } else {
        let htmlUsos = "";
        usosDelProducto.forEach(u => {
            let uso = u["Uso_Objetivo"] || "Uso General";
            let detalles = u["Detalles"] || "";
            htmlUsos += `
                <div class="uso-item">
                    <strong>🎯 ${uso}</strong>
                    ${detalles ? `<p>${detalles}</p>` : ''}
                </div>
            `;
        });
        modalBody.innerHTML = htmlUsos;
    }
    
    document.getElementById('detallesModal').style.display = 'block';
}

function cerrarModal() {
    document.getElementById('detallesModal').style.display = 'none';
}

// Cierra el modal si el usuario toca la pantalla oscura fuera del cuadro
window.onclick = function(event) {
    let modal = document.getElementById('detallesModal');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}