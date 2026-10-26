// Enlaces a los Google Sheets
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpvGU5GwEfk6hK5A9eiO5-moXq9gxlxywtrXEfc63vaxGw6xDGAsCVkiUEJUH3uiBz1MrxVFqgKKaL/pub?gid=1727735409&single=true&output=csv';
const USOS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGndkXKibFfCovjtznlsbD4V9AiU593xd_3KSwoLOjppTMBFiEHWaG2zEMDWVPkSnUno7wdHU8Cca-/pub?gid=1408750423&single=true&output=csv';
const ZONAS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRBeeBtO4H6JIiEGwzlQLDVPIB2tWO-N83j6xt34j4RCqhz_1FF0jiWkXLbcKQy7naM6u_GRoLveSp7/pubhtml?gid=1473578018&single=true';

// URL de Ejecución del Script para GUARDAR DATOS (Tu URL de Apps Script)
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzPzZau7f4ulrQqa4BpglpQjTMJ7h4KmDgHyJu9zNxKo5nLTKgOVHj-hp-B3725Buhl6A/exec";
const SHEET_ID_INVENTARIO = "1WKE8uEyym1zG2o7_AO6UyRws1F4_qzo7qeh1S6vi5co";

let inventarioGlobal = [];
let aplicacionesGlobal = [];
let usosGlobal = [];
let zonasGlobal = {};
let camposNombres = new Set(); 
let usuarioActual = null;

const ALMACENES_MAP = {
    "ALMACÉN DE SAN BORJA": "Almacén de San Borja", "ALMACEN DE SAN BORJA": "Almacén de San Borja",
    "ALMACÉN DE QUILMANA": "Almacén de Quilmana", "ALMACEN DE QUILMANA": "Almacén de Quilmana",
    "ALMACÉN DE QUILMANÁ": "Almacén de Quilmana", "ALMACEN DE QUILMANÁ": "Almacén de Quilmana",
    "ALMACÉN FUNDO": "Almacén Fundo", "ALMACEN FUNDO": "Almacén Fundo",
    "PROHASS": "Almacén de San Borja"
};

document.addEventListener("DOMContentLoaded", initApp);

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
            let selectCampo = document.getElementById("vicenteZona");
            let filtroCamp = document.getElementById("filtroCampo");
            selectCampo.innerHTML = "";
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
            document.getElementById('loading').style.display = 'none';
        }
    });
}

function normalizarAlmacen(alm) {
    if (!alm) return "";
    let upper = alm.trim().toUpperCase();
    return ALMACENES_MAP[upper] || upper;
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
        let venc = (row["Fecha Vencimiento"] || "").trim();
        let um = (row["Unidad Medida"] || "").trim();
        let formato = (row["Formato"] || "").trim();
        
        let cantRaw = row["Total_Cantidad"] || row["Cantidad"] || 0;
        let cantidad = parseFloat(cantRaw) || 0;
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
                    producto: prod, pa: pa, cat: cat, obj: obj, lote: lote, venc: venc, 
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

    inventarioGlobal = Object.values(stockMap).filter(item => item.stock > 0.001); // Evitar restos microscópicos de float
    aplicacionesGlobal.reverse();
    filtrarDatos();
    
    // Si están logueados, actualizar sus listas
    if (usuarioActual === "RUFINO") prepararPanelRufino();
    if (usuarioActual === "VICENTE") prepararPanelVicente();
}

// ----------------------------------------------------
// NAVEGACIÓN Y FILTROS BASE
// ----------------------------------------------------
function filtrarDatos() { /* (El mismo código que tienes, no lo repito entero por espacio, mantenlo intacto o copia el que ya te di en el mensaje anterior para la PWA) */ 
    // [Mantén tu función filtrarDatos() de la v6 aquí]
    let q = document.getElementById('searchInput').value.toUpperCase();
    let filtroCatRaw = document.getElementById('filtroCategoria').value;
    let alm = document.getElementById('filtroAlmacen').value;
    let filtroCamp = document.getElementById('filtroCampo') ? document.getElementById('filtroCampo').value : "TODOS";

    let htmlStock = "";
    inventarioGlobal.forEach(item => {
        let matchText = `${item.producto} ${item.lote} ${item.pa}`.includes(q);
        let matchAlm = (alm === "TODOS" || item.almacen === alm);
        let matchCat = true;
        if (filtroCatRaw.startsWith("CAT:")) matchCat = (item.cat === filtroCatRaw.split(":")[1]);
        else if (filtroCatRaw.startsWith("SUB:")) matchCat = (item.obj === filtroCatRaw.split(":")[1]);

        if (matchText && matchCat && matchAlm) {
            let badgeClass = item.almacen.includes("San Borja") ? "san-borja" : item.almacen.includes("Quilmana") ? "quilmana" : "fundo";
            htmlStock += `
                <div class="card" onclick="mostrarDetalles('${item.producto.replace(/'/g, "\\'")}')" style="cursor: pointer; position: relative;">
                    <div class="icono-info">ℹ️</div>
                    <div class="card-title">${item.producto}</div><div class="card-subtitle">${item.pa || '-'}</div>
                    <div class="card-details">
                        <div><span class="badge ${badgeClass}">${item.almacen.replace('Almacén ', '').replace('de ', '')}</span><br><span style="font-size:0.8rem; color:#7f8c8d; display:block; margin-top:5px;">Lote: ${item.lote || '-'}</span></div>
                        <div><div class="stock-value">${item.stock.toFixed(2)} ${item.um}</div><div class="fecha-venc" style="color: ${item.venc === '-' ? '#7f8c8d' : 'var(--danger)'}">Vence: ${item.venc}</div></div>
                    </div>
                </div>`;
        }
    });
    if(!htmlStock) htmlStock = "<div class='loading'>No se encontraron productos en stock.</div>";
    document.getElementById('stockView').innerHTML = htmlStock;
}

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
    }
}

// ----------------------------------------------------
// SEGURIDAD Y PERFILES
// ----------------------------------------------------
function verificarPin() {
    let pin = document.getElementById("pinInput").value.trim().toUpperCase();
    if (pin === "R98U") {
        usuarioActual = "RUFINO";
        document.getElementById("adminLogin").style.display = "none";
        document.getElementById("panelRufino").style.display = "block";
        prepararPanelRufino();
    } else if (pin === "V96I") {
        usuarioActual = "VICENTE";
        document.getElementById("adminLogin").style.display = "none";
        document.getElementById("panelVicente").style.display = "block";
        prepararPanelVicente();
    } else {
        alert("PIN incorrecto. Acceso denegado.");
    }
}

function cerrarSesionAdmin() {
    usuarioActual = null;
    document.getElementById("pinInput").value = "";
    document.getElementById("panelRufino").style.display = "none";
    document.getElementById("panelVicente").style.display = "none";
    document.getElementById("adminLogin").style.display = "block";
}

// ----------------------------------------------------
// PANEL RUFINO (QUILMANÁ -> FUNDO)
// ----------------------------------------------------
function prepararPanelRufino() {
    let select = document.getElementById("rufinoProducto");
    select.innerHTML = "<option value=''>Seleccione un producto...</option>";
    
    let enQuilmana = inventarioGlobal.filter(i => i.almacen === "Almacén de Quilmana");
    enQuilmana.forEach(item => {
        let opt = document.createElement("option");
        opt.value = `${item.producto}|${item.lote}`;
        opt.innerHTML = `${item.producto} (Lote: ${item.lote}) - Disp: ${item.stock.toFixed(2)} ${item.um}`;
        select.appendChild(opt);
    });
    actualizarMaximoRufino();
}

function actualizarMaximoRufino() {
    let val = document.getElementById("rufinoProducto").value;
    if (!val) { document.getElementById("rufinoMax").innerText = ""; return; }
    
    let parts = val.split("|");
    let item = inventarioGlobal.find(i => i.producto === parts[0] && i.lote === parts[1] && i.almacen === "Almacén de Quilmana");
    
    if (item) {
        document.getElementById("rufinoUm").innerText = item.um;
        document.getElementById("rufinoMax").innerText = `Stock máximo a trasladar: ${item.stock.toFixed(2)} ${item.um}`;
        document.getElementById("rufinoCantidad").value = item.stock.toFixed(2);
    }
}

function ejecutarRufino() {
    let val = document.getElementById("rufinoProducto").value;
    let cant = parseFloat(document.getElementById("rufinoCantidad").value);
    
    if (!val || isNaN(cant) || cant <= 0) { alert("Por favor, seleccione un producto y una cantidad válida."); return; }
    
    let parts = val.split("|");
    let item = inventarioGlobal.find(i => i.producto === parts[0] && i.lote === parts[1] && i.almacen === "Almacén de Quilmana");
    
    if (cant > item.stock) { alert("No puedes trasladar más del stock disponible."); return; }
    if (!confirm(`¿Confirmas el traslado de ${cant} ${item.um} de ${item.producto} hacia el Almacén Fundo?`)) return;

    let bultos = item.cxb > 0 ? (cant / item.cxb) : cant;
    let fila = prepararFila(item, "Traslado", "Almacén de Quilmana", "Almacén Fundo", cant, bultos, "Traslado PWA (Rufino)", "-");
    
    enviarGoogleSheets(fila);
}

// ----------------------------------------------------
// PANEL VICENTE (FUNDO -> CAMPO / DEVOLUCIÓN)
// ----------------------------------------------------
function toggleVicenteForm() {
    let op = document.getElementById("vicenteOperacion").value;
    document.getElementById("vicenteCamposCampo").style.display = (op === "APLICAR") ? "block" : "none";
}

function prepararPanelVicente() {
    let select = document.getElementById("vicenteProducto");
    select.innerHTML = "<option value=''>Seleccione un producto...</option>";
    
    let enFundo = inventarioGlobal.filter(i => i.almacen === "Almacén Fundo");
    enFundo.forEach(item => {
        let opt = document.createElement("option");
        opt.value = `${item.producto}|${item.lote}`;
        opt.innerHTML = `${item.producto} (Lote: ${item.lote}) - Disp: ${item.stock.toFixed(2)} ${item.um}`;
        select.appendChild(opt);
    });
    actualizarMaximoVicente();
    toggleVicenteForm();
}

function actualizarMaximoVicente() {
    let val = document.getElementById("vicenteProducto").value;
    if (!val) { document.getElementById("vicenteMax").innerText = ""; return; }
    
    let parts = val.split("|");
    let item = inventarioGlobal.find(i => i.producto === parts[0] && i.lote === parts[1] && i.almacen === "Almacén Fundo");
    
    if (item) {
        document.getElementById("vicenteUm").innerText = item.um;
        document.getElementById("vicenteMax").innerText = `Stock disponible: ${item.stock.toFixed(2)} ${item.um} | Ud. Medida Bulto: ${item.cxb}`;
        document.getElementById("vicenteCantidad").value = item.stock.toFixed(2);
        
        // Llenar usos para este producto
        let uSelect = document.getElementById("vicenteUso");
        uSelect.innerHTML = "";
        let usosProd = usosGlobal.filter(u => u["Producto"] && u["Producto"].toUpperCase() === item.producto);
        if(usosProd.length === 0) {
            uSelect.innerHTML = `<option value="${item.obj}">USO GENERAL (Predeterminado)</option>`;
        } else {
            usosProd.forEach(u => {
                let opt = document.createElement("option");
                opt.value = (u["Uso_Objetivo"] || u["Uso/Objetivo"]).trim().toUpperCase();
                opt.innerHTML = opt.value;
                uSelect.appendChild(opt);
            });
        }
    }
}

function ejecutarVicente() {
    let operacion = document.getElementById("vicenteOperacion").value;
    let val = document.getElementById("vicenteProducto").value;
    let cant = parseFloat(document.getElementById("vicenteCantidad").value);
    
    if (!val || isNaN(cant) || cant <= 0) { alert("Revise los datos ingresados."); return; }
    
    let parts = val.split("|");
    let item = inventarioGlobal.find(i => i.producto === parts[0] && i.lote === parts[1] && i.almacen === "Almacén Fundo");
    
    if (cant > item.stock) { alert("No puedes operar más cantidad de la que hay disponible."); return; }

    if (operacion === "DEVOLVER") {
        // Validación Restricción de Unidades Completas
        if (item.cxb > 0 && (cant % item.cxb) !== 0) {
            alert(`ATENCIÓN: Solo estás autorizado a devolver unidades/bultos enteros.\n\nLa capacidad del bulto es de ${item.cxb} ${item.um}.\nLa cantidad a devolver debe ser múltiplo de ${item.cxb}.`);
            return;
        }
        if (!confirm(`¿Devolver ${cant} ${item.um} a Quilmaná?`)) return;
        
        let bultos = item.cxb > 0 ? (cant / item.cxb) : cant;
        let fila = prepararFila(item, "Traslado", "Almacén Fundo", "Almacén de Quilmana", cant, bultos, "Devolución PWA (Vicente)", item.obj);
        enviarGoogleSheets(fila);

    } else {
        // Aplicación en Campo
        let zona = document.getElementById("vicenteZona").value;
        let uso = document.getElementById("vicenteUso").value;
        if (!zona) { alert("Debe seleccionar una zona."); return; }
        
        if (!confirm(`¿Aplicar ${cant} ${item.um} de ${item.producto} en ${zona}?`)) return;
        
        let bultos = item.cxb > 0 ? (cant / item.cxb) : cant;
        let fila = prepararFila(item, "Salida", "Almacén Fundo", zona, cant, bultos, "Aplicación PWA (Vicente)", uso);
        enviarGoogleSheets(fila);
    }
}

// ----------------------------------------------------
// MOTOR DE COMUNICACIÓN CON GOOGLE APPS SCRIPT
// ----------------------------------------------------
function obtenerFechaHoy() {
    let hoy = new Date();
    return `${hoy.getDate().toString().padStart(2, '0')}/${(hoy.getMonth()+1).toString().padStart(2, '0')}/${hoy.getFullYear()}`;
}

function prepararFila(item, op, origen, destino, cantidad, bultos, observacion, objetivoFit) {
    // Array exacto al orden de columnas del Gestor de Python
    return [
        obtenerFechaHoy(),  // 0. Fecha Inventario
        op,                 // 1. Operación
        item.cat,           // 2. Categoría
        objetivoFit,        // 3. Objetivo Fitosanitario
        item.producto,      // 4. Producto
        item.pa,            // 5. Principio Activo
        item.um,            // 6. Unidad Medida
        item.formato,       // 7. Formato
        bultos,             // 8. Cant_Bultos
        item.cxb,           // 9. Cant_por_Bulto
        cantidad,           // 10. Total_Cantidad
        "PEN",              // 11. Moneda
        0,                  // 12. Costo_Unitario
        0,                  // 13. Costo_Total
        item.venc,          // 14. Fecha Vencimiento
        item.lote,          // 15. Lote
        origen,             // 16. Origen
        destino,            // 17. Destino
        observacion         // 18. Observaciones
    ];
}

function enviarGoogleSheets(filaArray) {
    document.getElementById('syncOverlay').style.display = 'block';

    fetch(WEB_APP_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
            action: "agregar",
            sheetId: SHEET_ID_INVENTARIO,
            fila: filaArray
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === "ok") {
            alert("✅ Operación registrada en el inventario exitosamente.");
            // Refrescar PWA
            initApp();
        } else {
            alert("❌ Hubo un problema guardando los datos.");
        }
    })
    .catch(error => {
        alert("❌ Error de red al comunicarse con Google Sheets.");
    })
    .finally(() => {
        document.getElementById('syncOverlay').style.display = 'none';
    });
}