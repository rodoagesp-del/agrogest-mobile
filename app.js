// Enlaces a los Google Sheets (CSV)
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpvGU5GwEfk6hK5A9eiO5-moXq9gxlxywtrXEfc63vaxGw6xDGAsCVkiUEJUH3uiBz1MrxVFqgKKaL/pub?gid=1727735409&single=true&output=csv';
const USOS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGndkXKibFfCovjtznlsbD4V9AiU593xd_3KSwoLOjppTMBFiEHWaG2zEMDWVPkSnUno7wdHU8Cca-/pub?gid=1408750423&single=true&output=csv';
const ZONAS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRBeeBtO4H6JIiEGwzlQLDVPIB2tWO-N83j6xt34j4RCqhz_1FF0jiWkXLbcKQy7naM6u_GRoLveSp7/pub?gid=1473578018&single=true&output=csv';

let inventarioGlobal = [];
let aplicacionesGlobal = [];
let usosGlobal = [];
let zonasGlobal = {};
let camposNombres = new Set(); // Para poblar el select dinámicamente

const ALMACENES_MAP = {
    "ALMACÉN DE SAN BORJA": "Almacén de San Borja",
    "ALMACEN DE SAN BORJA": "Almacén de San Borja",
    "ALMACÉN DE QUILMANA": "Almacén de Quilmana",
    "ALMACEN DE QUILMANA": "Almacén de Quilmana",
    "ALMACÉN DE QUILMANÁ": "Almacén de Quilmana",
    "ALMACEN DE QUILMANÁ": "Almacén de Quilmana",
    "ALMACÉN FUNDO": "Almacén Fundo",
    "ALMACEN FUNDO": "Almacén Fundo",
    "PROHASS": "Almacén de San Borja"
};

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
    Papa.parse(CSV_URL, {
        download: true, header: true, skipEmptyLines: true, transformHeader: h => h.trim(),
        complete: function(results) {
            procesarDatos(results.data);
            cargarUsos();
            cargarZonas();
        },
        error: function(error) {
            document.getElementById('loading').innerText = "Error de conexión. Intente en modo online.";
        }
    });
}

function cargarUsos() {
    if (!USOS_CSV_URL) return;
    Papa.parse(USOS_CSV_URL, {
        download: true, header: true, skipEmptyLines: true, transformHeader: h => h.trim(),
        complete: function(results) { usosGlobal = results.data; }
    });
}

function cargarZonas() {
    if (!ZONAS_CSV_URL) {
        document.getElementById('loading').style.display = 'none';
        return;
    }
    Papa.parse(ZONAS_CSV_URL, {
        download: true, header: true, skipEmptyLines: true, transformHeader: h => h.trim(),
        complete: function(results) {
            let selectCampo = document.getElementById("filtroCampo");
            results.data.forEach(r => {
                let nombreSector = (r["Nombre_Sector"] || r["Nombre del Sector"] || "").trim().toUpperCase();
                let arboles = parseFloat(r["Num_Arboles"] || r["Número de Árboles"]) || 0;
                if (nombreSector) {
                    zonasGlobal[nombreSector] = arboles;
                    camposNombres.add(nombreSector);
                }
            });
            // Llenar el select con los campos recuperados (ordenados alfabéticamente)
            Array.from(camposNombres).sort().forEach(campo => {
                let opt = document.createElement("option");
                opt.value = campo;
                opt.innerHTML = campo;
                selectCampo.appendChild(opt);
            });
            document.getElementById('loading').style.display = 'none';
        },
        error: function() {
            document.getElementById('loading').style.display = 'none';
        }
    });
}

function normalizarAlmacen(alm) {
    if (!alm) return "";
    let upper = alm.trim().toUpperCase();
    return ALMACENES_MAP[upper] || upper;
}

function formatearFechaVencimiento(fechaStr) {
    if (!fechaStr || fechaStr === "-" || fechaStr === "DD/MM/AAAA") return "-";
    if (fechaStr.includes("T")) {
        let d = new Date(fechaStr);
        let mes = (d.getUTCMonth() + 1).toString().padStart(2, '0');
        let anio = d.getUTCFullYear();
        return `${mes}/${anio}`;
    }
    let parts = fechaStr.split("/");
    if (parts.length === 3) {
        let mes = parts[1].padStart(2, '0');
        return `${mes}/${parts[2]}`;
    }
    return fechaStr;
}

function procesarDatos(data) {
    let stockMap = {};
    aplicacionesGlobal = [];

    data.forEach(row => {
        let op = (row["Operación"] || "").trim().toUpperCase();
        let prod = (row["Producto"] || "").trim().toUpperCase();
        let pa = (row["Principio Activo"] || "").trim().toUpperCase();
        let cat = (row["Categoría"] || "").trim().toUpperCase();
        let obj = (row["Objetivo Fitosanitario"] || "").trim().toUpperCase();
        let lote = (row["Lote"] || "").trim().toUpperCase();
        let venc = formatearFechaVencimiento((row["Fecha Vencimiento"] || "").trim());
        let um = (row["Unidad Medida"] || "").trim();
        let origenRaw = (row["Origen"] || "").trim();
        let destinoRaw = (row["Destino"] || "").trim();
        let origen = normalizarAlmacen(origenRaw);
        let destino = normalizarAlmacen(destinoRaw);

        let cantRaw = row["Total_Cantidad"] || row["Cantidad"] || 0;
        let cantidad = parseFloat(cantRaw) || 0;

        if (!prod || cantidad === 0) return;

        // Registro de aplicaciones en campo (SALIDA hacia una zona de cultivo, no hacia un almacén)
        if (op === "SALIDA" && !["Almacén de San Borja", "Almacén de Quilmana", "Almacén Fundo"].includes(destino)) {
            aplicacionesGlobal.push({
                fecha: row["Fecha Inventario"] || row["Fecha"],
                producto: prod,
                pa: pa,
                lote: lote,
                zona: destinoRaw.trim().toUpperCase(),
                usos: row["Objetivo Fitosanitario"],
                cantidad: cantidad,
                um: um
            });
        }

        const ALMACENES = ["Almacén de San Borja", "Almacén de Quilmana", "Almacén Fundo"];

        function modificarStock(almacen, qty) {
            if (!ALMACENES.includes(almacen)) return;
            let key = `${prod}|${lote}|${almacen}`;
            if (!stockMap[key]) {
                stockMap[key] = { producto: prod, pa: pa, cat: cat, obj: obj, lote: lote, venc: venc, almacen: almacen, um: um, stock: 0 };
            }
            stockMap[key].stock += qty;
        }

        if (["ENTRADA", "TRASLADO ENTRADA", "TRASLADO ENTRADA CAMPO"].includes(op)) {
            modificarStock(destino, cantidad);
        } else if (["SALIDA", "TRASLADO SALIDA"].includes(op)) {
            modificarStock(origen, -cantidad);
        } else if (op === "TRASLADO") {
            modificarStock(origen, -cantidad);
            modificarStock(destino, cantidad);
        } else if (op === "AJUSTE") {
            let almAjuste = destino || origen;
            let signo = (row["Observaciones"] || "").toLowerCase().includes("sobrante") ? 1 : -1;
            modificarStock(almAjuste, cantidad * signo);
        }
    });

    inventarioGlobal = Object.values(stockMap).filter(item => item.stock > 0);
    inventarioGlobal.sort((a, b) => {
        let parseDate = (d) => {
            if (!d || d === "-") return new Date(9999, 11, 31);
            let parts = d.split("/");
            if (parts.length === 2) return new Date(parts[1], parts[0] - 1, 1);
            return new Date(9999, 11, 31);
        };
        return parseDate(a.venc) - parseDate(b.venc);
    });

    aplicacionesGlobal.reverse();
    filtrarDatos();
}

function filtrarDatos() {
    let q = document.getElementById('searchInput').value.toUpperCase();
    let filtroCatRaw = document.getElementById('filtroCategoria').value;
    let alm = document.getElementById('filtroAlmacen').value;
    let filtroCamp = document.getElementById('filtroCampo').value;

    // --- FILTRADO DE STOCK ---
    let htmlStock = "";
    inventarioGlobal.forEach(item => {
        let matchText = `${item.producto} ${item.lote} ${item.pa}`.includes(q);
        let matchAlm = (alm === "TODOS" || item.almacen === alm);

        let matchCat = true;
        if (filtroCatRaw.startsWith("CAT:")) {
            matchCat = (item.cat === filtroCatRaw.split(":")[1]);
        } else if (filtroCatRaw.startsWith("SUB:")) {
            matchCat = (item.obj === filtroCatRaw.split(":")[1]);
        }

        if (matchText && matchCat && matchAlm) {
            let badgeClass = item.almacen.includes("San Borja") ? "san-borja" : item.almacen.includes("Quilmana") ? "quilmana" : "fundo";

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

    // --- FILTRADO DE CAMPO ---
    let htmlCampo = "";
    aplicacionesGlobal.forEach(item => {
        let matchText = `${item.producto} ${item.lote} ${item.zona} ${item.usos}`.includes(q);
        let matchCamp = (filtroCamp === "TODOS" || item.zona === filtroCamp);
        
        if (matchText && matchCamp) {
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
    
    // Si estamos en la vista reporte, regenerar tabla al cambiar filtros
    if (document.getElementById('reporteView').style.display === 'block') {
        generarReporteCampo();
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none');

    if(tab === 'stock') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('stockView').style.display = 'block';
        document.getElementById('filtroAlmacen').style.display = 'inline-block';
        document.getElementById('filtroCampo').style.display = 'none';
        document.getElementById('filtroCategoria').style.display = 'inline-block';
    } else if(tab === 'campo') {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('campoView').style.display = 'block';
        document.getElementById('filtroAlmacen').style.display = 'none';
        document.getElementById('filtroCampo').style.display = 'inline-block';
        document.getElementById('filtroCategoria').style.display = 'none';
    } else {
        document.querySelectorAll('.tab-btn')[2].classList.add('active');
        document.getElementById('reporteView').style.display = 'block';
        document.getElementById('filtroAlmacen').style.display = 'none';
        document.getElementById('filtroCampo').style.display = 'inline-block';
        document.getElementById('filtroCategoria').style.display = 'none';
    }
}

function generarReporteCampo() {
    let desde = document.getElementById('fechaDesde').value;
    let hasta = document.getElementById('fechaHasta').value;
    let filtroCamp = document.getElementById('filtroCampo').value;

    if (!desde || !hasta) {
        document.getElementById('reporteContenido').innerHTML = "<div class='loading' style='color:var(--danger);'>Por favor seleccione fecha de inicio y fin.</div>";
        return;
    }

    let dDesde = new Date(desde + 'T00:00:00');
    let dHasta = new Date(hasta + 'T23:59:59');

    let appsFiltradas = aplicacionesGlobal.filter(app => {
        // Filtrar por fecha
        let parts = app.fecha.split('/');
        if (parts.length !== 3) return false;
        let dApp = new Date(parts[2], parts[1] - 1, parts[0]);
        let matchFecha = dApp >= dDesde && dApp <= dHasta;
        
        // Filtrar por campo
        let matchCamp = (filtroCamp === "TODOS" || app.zona === filtroCamp);
        
        return matchFecha && matchCamp;
    });

    if (appsFiltradas.length === 0) {
        document.getElementById('reporteContenido').innerHTML = "<div class='loading'>No hay aplicaciones para los filtros seleccionados.</div>";
        return;
    }

    let html = `
        <table class="report-table">
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Reactivo (Producto)</th>
                    <th>Campo / Zona</th>
                    <th>Uso / Objetivo</th>
                    <th>Volumen Total</th>
                    <th>Prorrateo (Dosis/Árbol)</th>
                </tr>
            </thead>
            <tbody>
    `;

    appsFiltradas.forEach(app => {
        let nombreZona = app.zona; // Ya fue convertido a mayúsculas en procesarDatos
        let numArboles = zonasGlobal[nombreZona] || 0;
        let prorrateoTxt = numArboles > 0 ? (app.cantidad / numArboles).toFixed(4) + " " + app.um : "Faltan datos de Zona";

        html += `
            <tr>
                <td>${app.fecha}</td>
                <td><strong>${app.producto}</strong><br><span style="font-size:0.75rem; color:#777;">${app.pa}</span></td>
                <td>${app.zona}</td>
                <td>${app.usos}</td>
                <td style="font-weight:bold; color:var(--dark);">${app.cantidad.toFixed(2)} ${app.um}</td>
                <td style="color:var(--primary); font-weight:bold;">${prorrateoTxt}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    document.getElementById('reporteContenido').innerHTML = html;
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
            let uso = (u["Uso_Objetivo"] || u["Uso/Objetivo"] || "Uso General").trim();
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

window.onclick = function(event) {
    if (event.target == document.getElementById('detallesModal')) {
        cerrarModal();
    }
}