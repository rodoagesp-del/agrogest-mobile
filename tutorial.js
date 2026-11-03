// ================= tutorial.js =================
let pasoActualTut = 0;
let pasosTutorial = [];
let originalState = {}; // Para restaurar la app al terminar

document.addEventListener("DOMContentLoaded", () => {
    // Inyectar el HTML base del tutorial al body dinámicamente
    const tutHTML = `
        <div id="tut-overlay"></div>
        <div id="tut-cursor"></div>
        <div id="tut-tooltip">
            <div class="tut-title" id="tutTitle">Título</div>
            <div class="tut-text" id="tutText">Texto explicativo</div>
            <div class="tut-buttons">
                <button class="tut-btn tut-btn-skip" onclick="cerrarTutorialInteractivo()">Saltar</button>
                <button class="tut-btn tut-btn-next" onclick="siguientePasoTut()" id="tutBtnNext">Siguiente ➔</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', tutHTML);
});

function iniciarTutorialInteractivo(forzar = false) {
    if (!forzar && localStorage.getItem('tutorialAgroGestCompletado')) return;
    
    // Guardar estado original antes de manipular
    originalState.tab = document.querySelector('.tab-btn.active').innerText;
    
    pasosTutorial = [
        {
            title: "👋 Bienvenido a AgroGest+",
            text: "Vamos a dar un rápido recorrido visual por el sistema. <strong>Tranquilo, esto es una simulación</strong> y no afectará ningún dato real ni el inventario.",
            target: ".app-header",
            setup: () => { switchTab('stock'); document.getElementById('searchInput').value = ""; filtrarDatos(); }
        },
        {
            title: "🔍 Buscador Inteligente",
            text: "Aquí puedes buscar cualquier producto. Observa cómo el sistema filtra automáticamente por 'Foliares'.",
            target: ".controls",
            setup: () => {
                let cat = document.getElementById('filtroCategoria');
                cat.value = "CAT:FOLIARES";
                cat.style.border = "2px solid #27AE60";
                filtrarDatos();
                posicionarCursor(".controls", 0, 40);
            }
        },
        {
            title: "ℹ️ Ficha Agronómica",
            text: "Cada tarjeta tiene un ícono <strong>ℹ️</strong>. Al pulsarlo, el sistema te muestra la etapa fenológica recomendada y la dosis exacta por zona.",
            target: "#stockView .card", // Apuntamos a la primera tarjeta
            setup: () => {
                document.getElementById('filtroCategoria').value = "ALL";
                document.getElementById('filtroCategoria').style.border = "";
                filtrarDatos();
                // Si hay tarjetas, abrimos el modal del primer producto visualmente (sin afectar bd)
                let card = document.querySelector("#stockView .card");
                if(card) {
                    let btnInfo = card.querySelector('.icono-info');
                    if(btnInfo) btnInfo.click();
                }
            }
        },
        {
            title: "📊 Reportes y Prorrateos",
            text: "En la pestaña 'Reportes', seleccionas fechas y obtienes el volumen total y la <strong>dosis prorrateada exacta por árbol</strong> de ese lote.",
            target: ".tabs",
            setup: () => {
                cerrarModal(); // Cerramos el modal del paso anterior
                switchTab('reporte');
                posicionarCursor(".tab-btn:nth-child(3)", 20, 10);
            }
        },
        {
            title: "🔐 Modo Administrador",
            text: "Vamos a iniciar sesión automáticamente con el PIN de prueba para mostrarte el panel logístico Kanban.",
            target: "#adminLogin",
            setup: () => {
                switchTab('admin');
                document.getElementById('pinInput').value = "R98U";
                setTimeout(() => verificarPin(), 800); // Simulamos click en ingresar
            }
        },
        {
            title: "📦 Simulación Logística Segura",
            text: "Observa cómo se mueve una tarjeta. En la app real, mantienes presionada la tarjeta y la arrastras a su destino para registrar el movimiento (Ej. Quilmaná ➔ Fundo).",
            target: ".kanban-board",
            setup: () => {
                simularArrastreVisual();
            }
        }
    ];

    pasoActualTut = 0;
    document.getElementById('tut-overlay').style.display = 'block';
    mostrarPasoActualTut();
}

function mostrarPasoActualTut() {
    let paso = pasosTutorial[pasoActualTut];
    
    // 1. Limpiar resaltados anteriores
    document.querySelectorAll('.tut-highlighted').forEach(el => el.classList.remove('tut-highlighted'));
    document.getElementById('tut-cursor').style.display = 'none';

    // 2. Ejecutar la acción automatizada
    if (paso.setup) paso.setup();

    // 3. Resaltar el nuevo objetivo
    let objTarget = null;
    if (paso.target) {
        objTarget = document.querySelector(paso.target);
        if (objTarget) {
            objTarget.classList.add('tut-highlighted');
            // Hacer scroll suave hacia el elemento
            objTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // 4. Actualizar textos del cuadro de diálogo
    document.getElementById('tutTitle').innerHTML = paso.title;
    document.getElementById('tutText').innerHTML = paso.text;
    
    let btnNext = document.getElementById('tutBtnNext');
    btnNext.innerText = (pasoActualTut === pasosTutorial.length - 1) ? "¡Empezar a usar! 🚀" : "Siguiente ➔";

    // 5. Posicionar el cuadro de diálogo inteligentemente
    let tooltip = document.getElementById('tut-tooltip');
    tooltip.style.display = 'flex';
    
    setTimeout(() => {
        if (objTarget) {
            let rect = objTarget.getBoundingClientRect();
            let tooltipHeight = tooltip.offsetHeight;
            let topPos = rect.bottom + 15;
            
            // Si se sale por abajo, lo ponemos arriba del elemento
            if (topPos + tooltipHeight > window.innerHeight) {
                topPos = rect.top - tooltipHeight - 15;
            }
            // Fallback si arriba también se sale
            if (topPos < 0) topPos = window.innerHeight / 2 - tooltipHeight / 2;

            tooltip.style.top = topPos + 'px';
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translateX(-50%)';
        } else {
            // Centrado absoluto
            tooltip.style.top = '50%';
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
        }
    }, 100);
}

function posicionarCursor(selector, offsetX = 0, offsetY = 0) {
    let target = document.querySelector(selector);
    let cursor = document.getElementById('tut-cursor');
    if (target && cursor) {
        let rect = target.getBoundingClientRect();
        cursor.style.display = 'block';
        cursor.style.left = (window.innerWidth / 2) + 'px';
        cursor.style.top = (window.innerHeight) + 'px';
        
        setTimeout(() => {
            cursor.style.left = (rect.left + (rect.width/2) + offsetX) + 'px';
            cursor.style.top = (rect.top + (rect.height/2) + offsetY) + 'px';
        }, 100);
    }
}

// Simula una tarjeta volando de un kanban a otro sin tocar la BD
function simularArrastreVisual() {
    let origenCol = document.getElementById('kb-quilmana');
    let destinoCol = document.getElementById('kb-fundo');
    if(!origenCol || !destinoCol) return;
    
    let realCard = origenCol.querySelector('.card');
    if(!realCard) return; // Si no hay stock en quilmaná, se salta la visual
    
    let rectO = realCard.getBoundingClientRect();
    let rectD = destinoCol.getBoundingClientRect();
    
    // Clonar tarjeta (fantasma)
    let fakeCard = realCard.cloneNode(true);
    fakeCard.classList.add('tut-fake-card');
    fakeCard.style.left = rectO.left + 'px';
    fakeCard.style.top = rectO.top + 'px';
    fakeCard.style.width = rectO.width + 'px';
    document.body.appendChild(fakeCard);
    
    // Cursor
    let cursor = document.getElementById('tut-cursor');
    cursor.style.display = 'block';
    cursor.style.transition = 'none'; // reset
    cursor.style.left = (rectO.left + rectO.width/2) + 'px';
    cursor.style.top = (rectO.top + 20) + 'px';

    // Animación Secuencial
    setTimeout(() => {
        cursor.style.transition = 'all 1.5s cubic-bezier(0.25, 1, 0.5, 1)';
        fakeCard.style.left = (rectD.left + 15) + 'px';
        fakeCard.style.top = (rectD.top + 50) + 'px';
        cursor.style.left = (rectD.left + rectD.width/2) + 'px';
        cursor.style.top = (rectD.top + 80) + 'px';
    }, 400);

    setTimeout(() => {
        fakeCard.style.opacity = '0';
        fakeCard.style.transform = 'scale(0.8)';
    }, 1700);

    setTimeout(() => {
        if(fakeCard.parentNode) fakeCard.parentNode.removeChild(fakeCard);
        cursor.style.display = 'none';
    }, 2000);
}

function siguientePasoTut() {
    if (pasoActualTut < pasosTutorial.length - 1) {
        pasoActualTut++;
        mostrarPasoActualTut();
    } else {
        cerrarTutorialInteractivo();
    }
}

function cerrarTutorialInteractivo() {
    document.getElementById('tut-overlay').style.display = 'none';
    document.getElementById('tut-tooltip').style.display = 'none';
    document.getElementById('tut-cursor').style.display = 'none';
    document.querySelectorAll('.tut-highlighted').forEach(el => el.classList.remove('tut-highlighted'));
    
    // Remover clones fantasmas si el usuario cerró el tutorial rápido
    document.querySelectorAll('.tut-fake-card').forEach(c => c.remove()); 

    localStorage.setItem('tutorialAgroGestCompletado', 'true');
    
    // Devolver la app a la normalidad
    cerrarModal();
    if(usuarioActual) cerrarSesionAdmin(); // Si lo dejamos logueado en la demo, lo sacamos
    document.getElementById('filtroCategoria').value = "ALL";
    switchTab('stock'); // Volvemos al inicio
    filtrarDatos();
}

function reabrirTutorial() {
    iniciarTutorialInteractivo(true);
}