// ======================================================
// CONFIGURACIÓN DE ENDPOINTS
// ======================================================
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpvGU5GwEfk6hK5A9eiO5-moXq9gxlxywtrXEfc63vaxGw6xDGAsCVkiUEJUH3uiBz1MrxVFqgKKaL/pub?gid=1727735409&single=true&output=csv';
const USOS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGndkXKibFfCovjtznlsbD4V9AiU593xd_3KSwoLOjppTMBFiEHWaG2zEMDWVPkSnUno7wdHU8Cca-/pub?gid=1408750423&single=true&output=csv';
const ZONAS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRBeeBtO4H6JIiEGwzlQLDVPIB2tWO-N83j6xt34j4RCqhz_1FF0jiWkXLbcKQy7naM6u_GRoLveSp7/pub?gid=1473578018&single=true&output=csv';

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzPzZau7f4ulrQqa4BpglpQjTMJ7h4KmDgHyJu9zNxKo5nLTKgOVHj-hp-B3725Buhl6A/exec";
const SHEET_ID_INVENTARIO = "1WKE8uEyym1zG2o7_AO6UyRws1F4_qzo7qeh1S6vi5co";

// ======================================================
// VARIABLES GLOBALES
// ======================================================
let inventarioGlobal = [];
let aplicacionesGlobal = [];
let usosGlobal = [];
let zonasGlobal = {};
let camposNombres = new Set();
let usuarioActual = null;
let kanbanInstances = [];
let dragDataActual = null;
let usosSeleccionadosArray = [];

const ALMACENES_MAP = {
    "ALMACÉN DE SAN BORJA": "Almacén de San Borja", "ALMACEN DE SAN BORJA": "Almacén de San Borja",
    "ALMACÉN DE QUILMANA": "Almacén de Quilmana", "ALMACEN DE QUILMANA": "Almacén de Quilmana",
    "ALMACÉN DE QUILMANÁ": "Almacén de Quilmana", "ALMACEN DE QUILMANÁ": "Almacén de Quilmana",
    "ALMACÉN FUNDO": "Almacén Fundo", "ALMACEN FUNDO": "Almacén Fundo",
    "PROHASS": "Almacén de San Borja"
};

document.addEventListener("DOMContentLoaded", initApp);

// ======================================================
// INICIALIZACIÓN Y CARGA DE DATOS
// ======================================================
function initApp() {
    document.getElementById('loading').style.display = 'block';
    Papa.parse(CSV_URL, {
        download: true, header: true, skipEmptyLines: true, transformHeader: h => h.trim(),
        complete: function(results) {
            procesarDatos(results.data);
            cargarUsos();
            cargarZonas();
        },
        error: function() { document.getElementById('loading').innerText = "Error de conexión."; }
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
    if (!ZONAS_CSV_URL) return;
    Papa.parse(ZONAS_CSV_URL, {
        download: true, header: true, skipEmptyLines: true, transformHeader: h => h.trim(),
        complete: function(results) {
            let selectCampo = document.getElementById("dragZona");
            let filtroCamp = document.getElementById("filtroCampo");
            selectCampo.innerHTML = "";
            filtroCamp.innerHTML = '<option value="TODOS">Campo: Todos</option>';
            camposNombres.clear();

            results.data.forEach(r => {
                let nombreSector = (r["Nombre_Sector"] || r["Nombre del Sector"] || "").trim().toUpperCase();
                let arboles = parseFloat(r["Num_Arboles"] || r["Número de Árboles"]) || 0;
                if (nombreSector) { zonasGlobal[nombreSector] = arboles; camposNombres.add(nombreSector); }
            });

            Array.from(camposNombres).sort().forEach(campo => {
                let opt1 = document.createElement("option"); opt1.value = campo; opt1.innerHTML = campo;
                let opt2 = document.createElement("option"); opt2.value = campo; opt2.innerHTML = campo;
                selectCampo.appendChild(opt1);
                filtroCamp.appendChild(opt2);
            });

            if (document.getElementById('reporteView').style.display === 'block') {
                generarReporteCampo();
            }
            document.getElementById('loading').style.display = 'none';
        }
    });
}

function normalizarAlmacen(alm) {
    if (!alm) return "";
    let upper = alm.trim().toUpperCase();
    return ALMACENES_MAP[upper] || upper;
}

// Limpiamos los datos a formato DD/MM/YYYY para que suban bien limpios al Excel
function estandarizarFechaParaSheet(fechaStr) {
    if (!fechaStr || fechaStr === "-" || fechaStr === "DD/MM/AAAA") return "";
    if (fechaStr.includes("T")) {
        let d = new Date(fechaStr);
        let dia = d.getUTCDate().toString().padStart(2, '0');
        let mes = (d.getUTCMonth() + 1).toString().padStart(2, '0');
        let anio = d.getUTCFullYear();
        return `${dia}/${mes}/${anio}`;
    }
    return fechaStr;
}

function formatearFechaVencimiento(fechaStr) {
    if (!fechaStr || fechaStr === "-") return "-";
    if (fechaStr.includes("T")) {
        let d = new Date(fechaStr);
        let mes = (d.getUTCMonth() + 1).toString().padStart(2, '0');
        return `${mes}/${d.getUTCFullYear()}`;
    }
    let parts = fechaStr.split("/");
    if (parts.length === 3) return `${parts[1].padStart(2, '0')}/${parts[2]}`;
    return fechaStr;
}

// ======================================================
// PROCESAMIENTO DE INVENTARIO
// ======================================================
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
        
        let vencOriginal = (row["Fecha Vencimiento"] || "").trim();
        let vencLimpia = estandarizarFechaParaSheet(vencOriginal);
        let vencVisual = formatearFechaVencimiento(vencOriginal);
        
        let um = (row["Unidad Medida"] || "").trim();
        let formato = (row["Formato"] || "").trim();

        let cantidad = parseFloat(row["Total_Cantidad"] || row["Cantidad"] || 0) || 0;
        let cxb = parseFloat(row["Cant_por_Bulto"]) || 0;

        let origenRaw = (row["Origen"] || "").trim();
        let destinoRaw = (row["Destino"] || "").trim();
        let origen = normalizarAlmacen(origenRaw);
        let destino = normalizarAlmacen(destinoRaw);

        if (!prod || cantidad === 0) return;

        if (op === "SALIDA" && !["Almacén de San Borja", "Almacén de Quilmana", "Almacén Fundo"].includes(destino)) {
            aplicacionesGlobal.push({
                fecha: row["Fecha Inventario"] || row["Fecha"],
                producto: prod, pa: pa, lote: lote, zona: destinoRaw.trim().toUpperCase(),
                usos: row["Objetivo Fitosanitario"], cantidad: cantidad, um: um
            });
        }

        const ALMACENES = ["Almacén de San Borja", "Almacén de Quilmana", "Almacén Fundo"];

        function modificarStock(almacen, qty) {
            if (!ALMACENES.includes(almacen)) return;
            let key = `${prod}|${lote}|${almacen}`;
            if (!stockMap[key]) {
                stockMap[key] = {
                    producto: prod, pa: pa, cat: cat, obj: obj, lote: lote, vencRaw: vencLimpia, venc: vencVisual,
                    almacen: almacen, um: um, formato: formato, cxb: cxb, stock: 0
                };
            }
            stockMap[key].stock += qty;
        }

        if (["ENTRADA", "TRASLADO ENTRADA", "TRASLADO ENTRADA CAMPO"].includes(op)) modificarStock(destino, cantidad);
        else if (["SALIDA", "TRASLADO SALIDA"].includes(op)) modificarStock(origen, -cantidad);
        else if (op === "TRASLADO") { modificarStock(origen, -cantidad); modificarStock(destino, cantidad); }
        else if (op === "AJUSTE") {
            let almAjuste = destino || origen;
            let signo = (row["Observaciones"] || "").toLowerCase().includes("sobrante") ? 1 : -1;
            modificarStock(almAjuste, cantidad * signo);
        }
    });

    inventarioGlobal = Object.values(stockMap).filter(item => item.stock > 0.001);

    inventarioGlobal.sort((a, b) => {
        let parseDate = (d) => {
            if (!d || d === "-") return new Date(9999, 11, 31);
            let parts = d.split("/");
            if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
            return new Date(9999, 11, 31);
        };
        return parseDate(a.vencRaw) - parseDate(b.vencRaw);
    });

    aplicacionesGlobal.reverse();
    filtrarDatos();
}

// ======================================================
// RENDERIZADO: STOCK VERTICAL + KANBAN ADMIN
// ======================================================
function filtrarDatos() {
    let q = document.getElementById('searchInput').value.toUpperCase();
    let filtroCatRaw = document.getElementById('filtroCategoria').value;
    let alm = document.getElementById('filtroAlmacen').value;
    let filtroCamp = document.getElementById('filtroCampo') ? document.getElementById('filtroCampo').value : "TODOS";

    let htmlStock = "";
    document.getElementById('kb-sanborja').innerHTML = "";
    document.getElementById('kb-quilmana').innerHTML = "";
    document.getElementById('kb-fundo').innerHTML = "";
    document.getElementById('kb-campo').innerHTML = "<p style='text-align:center; color:#888; font-size:0.9rem; margin-top:20px;'><br>Arrastre aquí para<br>Aplicar en Campo</p>";

    inventarioGlobal.forEach(item => {
        let matchText = `${item.producto} ${item.lote} ${item.pa}`.includes(q);
        let matchAlm = (alm === "TODOS" || item.almacen === alm);

        let matchCat = true;
        if (filtroCatRaw.startsWith("CAT:")) matchCat = (item.cat === filtroCatRaw.split(":")[1]);
        else if (filtroCatRaw.startsWith("SUB:")) matchCat = (item.obj === filtroCatRaw.split(":")[1]);

        if (matchText && matchCat && matchAlm) {
            let badgeClass = item.almacen.includes("San Borja") ? "san-borja" : item.almacen.includes("Quilmana") ? "quilmana" : "fundo";
            let datasetString = `data-prod="${item.producto.replace(/"/g, '&quot;')}" data-pa="${item.pa}" data-cat="${item.cat}" data-obj="${item.obj}" data-lote="${item.lote}" data-venc="${item.vencRaw}" data-um="${item.um}" data-formato="${item.formato}" data-cxb="${item.cxb}" data-stock="${item.stock}"`;

            let cardHTML = `
                <div class="card" ${datasetString} style="position: relative;">
                    <div class="icono-info" onclick="mostrarDetalles('${item.producto.replace(/'/g, "\\'")}')" style="cursor:pointer; z-index:10;">ℹ️</div>
                    <div class="card-title">${item.producto}</div><div class="card-subtitle">${item.pa || '-'}</div>
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
                </div>`;

            htmlStock += cardHTML;

            if (item.almacen === "Almacén de San Borja") document.getElementById('kb-sanborja').innerHTML += cardHTML;
            else if (item.almacen === "Almacén de Quilmana") document.getElementById('kb-quilmana').innerHTML += cardHTML;
            else if (item.almacen === "Almacén Fundo") document.getElementById('kb-fundo').innerHTML += cardHTML;
        }
    });

    if(!htmlStock) htmlStock = "<div class='loading'>No se encontraron productos en stock.</div>";
    document.getElementById('stockView').innerHTML = htmlStock;

    if (usuarioActual) initKanban();

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
                        <div><strong>Zona:</strong> ${item.zona}<br><strong>Lote:</strong> ${item.lote}</div>
                        <div style="text-align:right;"><div class="stock-value" style="color:#8E44AD;">${item.cantidad.toFixed(2)} ${item.um}</div></div>
                    </div>
                    <div style="margin-top:8px; font-size:0.8rem; color:#555;"><strong>Objetivos:</strong> ${item.usos}</div>
                </div>`;
        }
    });

    if(!htmlCampo) htmlCampo = "<div class='loading'>No se encontraron aplicaciones en campo.</div>";
    document.getElementById('campoView').innerHTML = htmlCampo;

    if (document.getElementById('reporteView').style.display === 'block') {
        generarReporteCampo();
    }
}

// ======================================================
// DRAG & DROP (KANBAN ADMIN)
// ======================================================
function initKanban() {
    if (kanbanInstances.length > 0) return;
    const cols = ['kb-sanborja', 'kb-quilmana', 'kb-fundo', 'kb-campo'];
    cols.forEach(id => {
        let el = document.getElementById(id);
        if (el) {
            kanbanInstances.push(new Sortable(el, {
                group: 'shared',
                animation: 150,
                delay: 200,
                delayOnTouchOnly: true,
                forceFallback: true,
                scroll: true,
                bubbleScroll: true,
                onEnd: procesarDrop
            }));
        }
    });
}

function procesarDrop(evt) {
    let origenId = evt.from.id;
    let destinoId = evt.to.id;
    evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex]);

    if (origenId === destinoId) return;

    if (!usuarioActual) {
        alert("🔒 Debe iniciar sesión en la pestaña 'Admin' para poder trasladar tarjetas.");
        return;
    }

    let origenAlm = evt.from.getAttribute('data-alm');
    let destinoAlm = evt.to.getAttribute('data-alm');

    if (usuarioActual === "RUFINO") {
        if (!(origenAlm === "Almacén de Quilmana" && destinoAlm === "Almacén Fundo")) {
            alert("Rufino: Su usuario solo tiene autorización para trasladar desde Quilmaná hacia Fundo.");
            return;
        }
    } else if (usuarioActual === "VICENTE") {
        let valid = (origenAlm === "Almacén Fundo" && destinoAlm === "Zonas de Cultivo") ||
                    (origenAlm === "Almacén Fundo" && destinoAlm === "Almacén de Quilmana");
        if (!valid) {
            alert("Vicente: Su usuario solo tiene autorización para Aplicar en Zonas de Cultivo o Devolver a Quilmaná.");
            return;
        }
    }

    dragDataActual = {
        producto: evt.item.dataset.prod,
        pa: evt.item.dataset.pa,
        cat: evt.item.dataset.cat,
        obj: evt.item.dataset.obj,
        lote: evt.item.dataset.lote,
        venc: evt.item.dataset.venc,
        vencRaw: evt.item.dataset.venc,
        um: evt.item.dataset.um,
        formato: evt.item.dataset.formato,
        cxb: parseFloat(evt.item.dataset.cxb),
        stock: parseFloat(evt.item.dataset.stock),
        origen: origenAlm,
        destino: destinoAlm
    };

    abrirModalConfirmacion();
}

function abrirModalConfirmacion() {
    let d = dragDataActual;
    let esAplicacion = (d.destino === "Zonas de Cultivo");

    document.getElementById("dragTitle").innerText = esAplicacion ? "🌿 Aplicación en Campo" : "⚠️ Confirmar Traslado";
    document.getElementById("dragInfo").innerHTML = `<strong>${d.producto}</strong> (Lote: ${d.lote})<br>Ruta: <span style="color:var(--primary);">${d.origen} ➔ ${d.destino}</span>`;

    if (esAplicacion) {
        document.getElementById("dragLabelCantidad").innerText = "Cantidad a aplicar (Volumen/Masa):";
        document.getElementById("dragUm").innerText = d.um;
        document.getElementById("dragCantidad").value = d.stock.toFixed(2);
        document.getElementById("dragCantidad").step = "0.01";
        document.getElementById("dragMaxAlert").innerText = `Stock disponible: ${d.stock.toFixed(2)} ${d.um}`;

        document.getElementById("dragCamposZone").style.display = "block";
        let uSelect = document.getElementById("dragUso");
        uSelect.innerHTML = "";
        let usosProd = usosGlobal.filter(u => u["Producto"] && u["Producto"].toUpperCase() === d.producto);
        if (usosProd.length === 0) {
            uSelect.innerHTML = `<option value="${d.obj}">USO GENERAL</option>`;
        } else {
            usosProd.forEach(u => {
                let opt = document.createElement("option");
                opt.value = (u["Uso_Objetivo"] || u["Uso/Objetivo"]).trim().toUpperCase();
                opt.innerHTML = opt.value;
                uSelect.appendChild(opt);
            });
        }
    } else {
        document.getElementById("dragLabelCantidad").innerText = `¿Cuántos ${d.formato}s desea trasladar?:`;
        document.getElementById("dragUm").innerText = `(${d.formato}s)`;
        document.getElementById("dragCantidad").step = "1";

        let maxBultos = d.cxb > 0 ? Math.floor(d.stock / d.cxb) : d.stock;
        document.getElementById("dragCantidad").value = maxBultos;
        document.getElementById("dragMaxAlert").innerText = `Stock máx. movible: ${maxBultos} ${d.formato}s (Capacidad bulto = ${d.cxb} ${d.um})`;

        document.getElementById("dragCamposZone").style.display = "none";
    }

    usosSeleccionadosArray = [];
    document.getElementById("dragUsosSeleccionados").innerText = "Ninguno";
    document.getElementById("dragModal").style.display = "block";
}

function agregarUsoDrag() {
    let u = document.getElementById("dragUso").value;
    if (u && !usosSeleccionadosArray.includes(u)) {
        usosSeleccionadosArray.push(u);
        document.getElementById("dragUsosSeleccionados").innerText = usosSeleccionadosArray.join(", ");
    }
}

function cerrarDragModal() {
    document.getElementById("dragModal").style.display = "none";
    dragDataActual = null;
}

function ejecutarDrag() {
    let d = dragDataActual;
    let inputVal = parseFloat(document.getElementById("dragCantidad").value);

    if (isNaN(inputVal) || inputVal <= 0) {
        alert("Por favor ingrese una cantidad válida mayor a cero.");
        return;
    }

    let cant = 0;
    let bultos = 0;
    let fila;

    if (d.destino === "Zonas de Cultivo") {
        cant = inputVal;
        if (cant > d.stock) {
            alert(`No puede aplicar más del stock disponible (${d.stock} ${d.um}).`);
            return;
        }
        bultos = d.cxb > 0 ? (cant / d.cxb) : cant;

        let zona = document.getElementById("dragZona").value;
        if (!zona) { alert("Debe seleccionar un campo."); return; }

        let usoActual = document.getElementById("dragUso").value;
        if (usoActual && !usosSeleccionadosArray.includes(usoActual)) usosSeleccionadosArray.push(usoActual);
        let usoFinal = usosSeleccionadosArray.length > 0 ? usosSeleccionadosArray.join(", ") : "-";

        fila = [obtenerFechaHoy(), "Salida", d.cat, usoFinal, d.producto, d.pa, d.um, d.formato, bultos, d.cxb, cant, "PEN", 0, 0, d.vencRaw, d.lote, d.origen, zona, "Aplicación PWA"];
    } else {
        bultos = parseInt(inputVal);
        let maxBultos = d.cxb > 0 ? Math.floor(d.stock / d.cxb) : d.stock;

        if (bultos > maxBultos) {
            alert(`Supera los bultos completos disponibles. Máximo: ${maxBultos} ${d.formato}s.`);
            return;
        }

        cant = d.cxb > 0 ? bultos * d.cxb : bultos;
        let obs = "Traslado PWA";
        if (d.origen === "Almacén Fundo" && d.destino === "Almacén de Quilmana") {
            obs = "Devolución PWA (Vicente)";
        }

        fila = [obtenerFechaHoy(), "Traslado", d.cat, d.obj, d.producto, d.pa, d.um, d.formato, bultos, d.cxb, cant, "PEN", 0, 0, d.vencRaw, d.lote, d.origen, d.destino, obs];
    }

    cerrarDragModal();
    enviarGoogleSheets(fila);
}

// ======================================================
// NAVEGACIÓN Y TABS
// ======================================================
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none');
    document.getElementById('filtroAlmacen').style.display = 'none';
    document.getElementById('filtroCampo').style.display = 'none';
    document.getElementById('filtroCategoria').style.display = 'none';
    document.getElementById('searchInput').style.display = 'none';

    if (tab === 'stock') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('stockView').style.display = 'block';
        document.getElementById('filtroAlmacen').style.display = 'inline-block';
        document.getElementById('filtroCategoria').style.display = 'inline-block';
        document.getElementById('searchInput').style.display = 'block';
    } else if (tab === 'campo') {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('campoView').style.display = 'block';
        document.getElementById('filtroCampo').style.display = 'inline-block';
        document.getElementById('searchInput').style.display = 'block';
    } else if (tab === 'reporte') {
        document.querySelectorAll('.tab-btn')[2].classList.add('active');
        document.getElementById('reporteView').style.display = 'block';
        document.getElementById('filtroCampo').style.display = 'inline-block';
    } else if (tab === 'admin') {
        document.querySelectorAll('.tab-btn')[3].classList.add('active');
        document.getElementById('adminView').style.display = 'block';
        document.getElementById('filtroCategoria').style.display = 'inline-block';
        document.getElementById('searchInput').style.display = 'block';
    }
}

// ======================================================
// SEGURIDAD
// ======================================================
function verificarPin() {
    let pin = document.getElementById("pinInput").value.trim().toUpperCase();

    if (pin === "R98U") {
        usuarioActual = "RUFINO";
        document.getElementById("col-sanborja").style.display = "none";
        document.getElementById("col-quilmana").style.display = "flex";
        document.getElementById("col-fundo").style.display = "flex";
        document.getElementById("col-campo").style.display = "none";
    }
    else if (pin === "V96I") {
        usuarioActual = "VICENTE";
        document.getElementById("col-sanborja").style.display = "none";
        document.getElementById("col-quilmana").style.display = "flex";
        document.getElementById("col-fundo").style.display = "flex";
        document.getElementById("col-campo").style.display = "flex";
    }
    else {
        alert("PIN incorrecto. Acceso denegado.");
        return;
    }

    document.getElementById("adminLogin").style.display = "none";
    document.getElementById("adminLogueado").style.display = "block";
    document.getElementById("adminBienvenida").innerText = `¡Bienvenido, ${usuarioActual}!`;
    document.getElementById("tabAdmin").innerHTML = `👤 ${usuarioActual}`;

    filtrarDatos();
}

function cerrarSesionAdmin() {
    usuarioActual = null;
    document.getElementById("pinInput").value = "";
    document.getElementById("adminLogueado").style.display = "none";
    document.getElementById("adminLogin").style.display = "block";
    document.getElementById("tabAdmin").innerHTML = "🔐 Admin";
    switchTab('stock');
}

// ======================================================
// REPORTES
// ======================================================
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
        let parts = app.fecha.split('/');
        if (parts.length !== 3) return false;
        let dApp = new Date(parts[2], parts[1] - 1, parts[0]);
        return dApp >= dDesde && dApp <= dHasta && (filtroCamp === "TODOS" || app.zona === filtroCamp);
    });

    if (appsFiltradas.length === 0) {
        document.getElementById('reporteContenido').innerHTML = "<div class='loading'>No hay aplicaciones para los filtros seleccionados.</div>";
        return;
    }

    let html = `<table class="report-table"><thead><tr><th>Fecha</th><th>Reactivo (Producto)</th><th>Campo / Zona</th><th>Uso / Objetivo</th><th>Volumen Total</th><th>Prorrateo (Dosis/Árbol)</th></tr></thead><tbody>`;
    appsFiltradas.forEach(app => {
        let numArboles = zonasGlobal[app.zona.toUpperCase()] || 0;
        let prorrateoTxt = numArboles > 0 ? (app.cantidad / numArboles).toFixed(4) + " " + app.um : "Faltan datos";
        html += `<tr><td>${app.fecha}</td><td><strong>${app.producto}</strong><br><span style="font-size:0.75rem; color:#777;">${app.pa}</span></td><td>${app.zona}</td><td>${app.usos}</td><td style="font-weight:bold; color:var(--dark);">${app.cantidad.toFixed(2)} ${app.um}</td><td style="color:var(--primary); font-weight:bold;">${prorrateoTxt}</td></tr>`;
    });
    document.getElementById('reporteContenido').innerHTML = html + `</tbody></table>`;
}

// ======================================================
// API Y GOOGLE SHEETS
// ======================================================
function obtenerFechaHoy() {
    let hoy = new Date();
    return `${hoy.getDate().toString().padStart(2, '0')}/${(hoy.getMonth() + 1).toString().padStart(2, '0')}/${hoy.getFullYear()}`;
}

function enviarGoogleSheets(filaArray) {
    document.getElementById('syncOverlay').style.display = 'block';
    fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: "agregar", sheetId: SHEET_ID_INVENTARIO, fila: filaArray })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === "ok") { alert("✅ Operación registrada exitosamente."); initApp(); }
        else alert("❌ Error guardando datos.");
    })
    .catch(() => alert("❌ Error de red al comunicarse con Google Sheets."))
    .finally(() => document.getElementById('syncOverlay').style.display = 'none');
}

// ======================================================
// MODAL DETALLES
// ======================================================
function mostrarDetalles(prodNombre) {
    let usosProd = usosGlobal.filter(u => (u["Producto"] || "").trim().toUpperCase() === prodNombre);
    document.getElementById('modalTitle').innerText = `📋 Especificaciones:\n${prodNombre}`;
    let html = usosProd.length === 0 ? "<p style='color:#7F8C8D; font-size:0.9rem; text-align:center;'>No hay especificaciones.</p>" : usosProd.map(u => `<div class="uso-item"><strong>🎯 ${(u["Uso_Objetivo"] || u["Uso/Objetivo"]).trim()}</strong><p>${u["Detalles"] || ""}</p></div>`).join("");
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('detallesModal').style.display = 'block';
}

function cerrarModal() {
    document.getElementById('detallesModal').style.display = 'none';
}

window.onclick = function(event) {
    if (event.target == document.getElementById('detallesModal')) cerrarModal();
    if (event.target == document.getElementById('dragModal')) cerrarDragModal();
}