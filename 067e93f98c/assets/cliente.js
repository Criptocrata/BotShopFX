/* BotShopFX (01-11-2026): lo único vivo de unas páginas fijas. Pregunta al cobro (data-cobro del <body>):
 *   · el bitcoin al cambio del momento, para enseñar cada precio también en BTC;
 *   · la compra: el correo va al cobro, que crea la factura en Plisio, y se salta a ella;
 *   · el estado del pedido en /order/?p=…, con la descarga cuando está pagado.
 * Y el tablero (14-11-2026): lo filtra por estado, activo, velas, horario y quién lo halló, busca, ordena y abre el
 * desplegable de cada robot, con su backtest y su cuarentena. Sin nada de esto la página se lee igual: los precios en
 * dólares ya están escritos, y el nombre de cada robot lleva a su ficha.
 * En la lengua de la página (<html lang>, 05-11-2026): inglés o español, con sus números. */
(function () {
  "use strict";
  var ES = document.documentElement.lang === "es";
  function di(en, es) { return ES ? es : en; }
  var cuerpo = document.body;
  var COBRO = (cuerpo.getAttribute("data-cobro") || "").replace(/\/+$/, "");
  var VENTA_ABIERTA = cuerpo.getAttribute("data-venta") === "abierta";

  function pedir(ruta, opciones) {
    return fetch(COBRO + ruta, opciones).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (datos) { return { ok: r.ok, estado: r.status, datos: datos }; });
    });
  }
  function dolares(x) {
    var n = String(Math.round(Number(x)));
    return ES ? n.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " $" : "$" + n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /* El precio en bitcoin */
  var conBtc = document.querySelectorAll("[data-btc-usd]");
  if (conBtc.length && COBRO) {
    pedir("/cotizacion").then(function (r) {
      var btcUsd = r.ok && Number(r.datos.btcUsd);
      if (!(btcUsd > 0)) return;
      conBtc.forEach(function (el) {
        var usd = Number(el.getAttribute("data-btc-usd"));
        if (!(usd > 0)) return;
        var btc = (Math.ceil((usd / btcUsd) * 1e5) / 1e5).toFixed(5);
        if (ES) btc = btc.replace(".", ",");
        el.textContent = el.getAttribute("data-btc-largo")
          ? di("or " + btc + " BTC at today's rate (1 BTC = " + dolares(btcUsd) + ", updated live)", "o " + btc + " BTC al cambio de hoy (1 BTC = " + dolares(btcUsd) + ", al momento)")
          : di("or ", "o ") + btc + " BTC · 1 BTC = " + dolares(btcUsd);
      });
    }).catch(function () { /* sin cobro, sólo dólares */ });
  }

  /* El tablero: filtros, búsqueda, orden y el desplegable de cada robot (14-11-2026) */
  var tabla = document.querySelector("table[data-tablero]");
  if (tabla) {
    var cuerpoTabla = tabla.querySelector("tbody");
    var filas = Array.prototype.slice.call(cuerpoTabla.querySelectorAll("tr[data-estado]"));
    var botones = Array.prototype.slice.call(document.querySelectorAll("button[data-grupo]"));
    var buscar = document.querySelector("input[data-buscar]");
    var orden = document.querySelector("select[data-orden]");
    var cuantos = document.querySelector("[data-cuantos]");
    var quitar = document.querySelector("button[data-quitar]");
    var ninguna = cuerpoTabla.querySelector("tr.sin-resultados");
    var elegido = {};
    var normal = function (t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); };
    var enlaceDe = function (fila) { return fila.querySelector("a[data-despliega]"); };
    var desplegableDe = function (fila) { var a = enlaceDe(fila); return a ? document.getElementById(a.getAttribute("data-despliega")) : null; };
    // ¿Pasa los filtros elegidos (menos el de `salvo`, para contar lo que daría cada botón de ese grupo) y la búsqueda?
    var pasa = function (fila, salvo) {
      for (var g in elegido) {
        if (g !== salvo && elegido[g] && fila.getAttribute("data-" + g) !== elegido[g]) return false;
      }
      var q = normal(buscar && buscar.value);
      return !q || (fila.getAttribute("data-buscar") || "").indexOf(q) !== -1;
    };
    var pintar = function () {
      var n = 0;
      filas.forEach(function (fila) {
        var ver = pasa(fila, null);
        fila.hidden = !ver;
        if (ver) n++;
        var d = desplegableDe(fila);
        if (d) d.hidden = !ver || fila.getAttribute("data-abierta") !== "si";
      });
      botones.forEach(function (b) {
        var g = b.getAttribute("data-grupo"), v = b.getAttribute("data-filtro");
        var c = filas.filter(function (f) { return pasa(f, g) && (v === "todos" || f.getAttribute("data-" + g) === v); }).length;
        var cuenta = b.querySelector(".cuenta");
        if (cuenta) cuenta.textContent = String(c);
        var pulsado = (elegido[g] || "todos") === v;
        b.setAttribute("aria-pressed", pulsado ? "true" : "false");
        b.disabled = !pulsado && c === 0;
      });
      if (ninguna) ninguna.hidden = n > 0;
      if (cuantos) cuantos.textContent = n === filas.length ? n + " robot" + (n === 1 ? "" : "s") : di(n + " of " + filas.length + " robots", n + " de " + filas.length + " robots");
      if (quitar) quitar.hidden = !(Object.keys(elegido).some(function (g) { return elegido[g]; }) || normal(buscar && buscar.value));
    };
    botones.forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-filtro");
        elegido[b.getAttribute("data-grupo")] = v === "todos" ? "" : v;
        pintar();
      });
    });
    if (buscar) buscar.addEventListener("input", pintar);
    if (quitar) quitar.addEventListener("click", function () { elegido = {}; if (buscar) buscar.value = ""; pintar(); });
    if (orden) {
      orden.addEventListener("change", function () {
        var k = orden.value;
        var valor = function (f) { var x = f.getAttribute("data-" + k); return x === null || x === "" ? -Infinity : Number(x); };
        var pos = function (f) { return Number(f.getAttribute("data-pos")); };
        filas.slice().sort(function (a, b) {
          if (k === "nombre") return (a.getAttribute("data-nombre") || "").localeCompare(b.getAttribute("data-nombre") || "") || pos(a) - pos(b);
          if (k === "pos") return pos(a) - pos(b);
          var d = valor(b) - valor(a);
          return d === d && d !== 0 ? d : pos(a) - pos(b);
        }).forEach(function (f) {
          cuerpoTabla.appendChild(f);
          var d = desplegableDe(f);
          if (d) cuerpoTabla.appendChild(d);
        });
        if (ninguna) cuerpoTabla.appendChild(ninguna);
      });
    }
    // El nombre abre su desplegable; con Ctrl, Cmd, Mayúsculas o la rueda, su ficha, como cualquier enlace.
    filas.forEach(function (fila) {
      var a = enlaceDe(fila);
      if (!a) return;
      a.setAttribute("aria-controls", a.getAttribute("data-despliega"));
      a.setAttribute("aria-expanded", "false");
      a.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        var abrir = fila.getAttribute("data-abierta") !== "si";
        fila.setAttribute("data-abierta", abrir ? "si" : "no");
        a.setAttribute("aria-expanded", abrir ? "true" : "false");
        var d = desplegableDe(fila);
        if (d) d.hidden = !abrir;
      });
    });
    pintar();
  }

  /* La compra */
  var MENSAJES_COMPRA = {
    400: di("That email doesn't look right.", "Ese correo no parece bien escrito."),
    409: di("This robot is not for sale: only proven robots are.", "Este robot no está a la venta: sólo se venden los probados."),
    429: di("Too many tries. Wait a minute and try again.", "Demasiados intentos. Espera un minuto y vuelve a probar."),
    503: di("Sales are not open yet.", "La venta todavía no está abierta.")
  };
  document.querySelectorAll("form.comprar").forEach(function (form) {
    var estado = form.querySelector(".estado-compra");
    var boton = form.querySelector("button");
    function decir(texto, mal) { estado.textContent = texto; estado.classList.toggle("mal", Boolean(mal)); }
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!VENTA_ABIERTA || !COBRO) { decir(MENSAJES_COMPRA[503], true); return; }
      var correo = form.querySelector("input[type=email]").value.trim();
      boton.disabled = true;
      decir(di("Creating your invoice…", "Creando tu factura…"));
      pedir("/comprar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ robot: form.getAttribute("data-robot"), correo: correo, idioma: ES ? "es" : "en" })
      }).then(function (r) {
        var url = r.datos && r.datos.url;
        if (r.ok && typeof url === "string" && /^https:\/\//.test(url)) {
          decir(di("Taking you to the invoice…", "Te llevamos a la factura…"));
          window.location.href = url;
          return;
        }
        decir(MENSAJES_COMPRA[r.estado] || di("We couldn't create the invoice. Try again in a few minutes.", "No pudimos crear la factura. Vuelve a probar en unos minutos."), true);
        boton.disabled = false;
      }).catch(function () {
        decir(di("We couldn't reach the shop. Check your connection and try again.", "No pudimos llegar a la tienda. Mira tu conexión y vuelve a probar."), true);
        boton.disabled = false;
      });
    });
  });

  /* El pedido */
  var caja = document.querySelector("[data-pedido-caja]");
  if (caja) {
    var ESTADOS = {
      "pendiente": [di("Waiting for payment", "Esperando el pago"), di("We are waiting for your payment. If you have already paid, it can take a few minutes to show here.", "Estamos esperando tu pago. Si ya has pagado, puede tardar unos minutos en verse aquí.")],
      "en camino": [di("Confirming", "Confirmándose"), di("Your payment is on its way. We are waiting for the bitcoin network to confirm it.", "Tu pago está en camino. Esperamos a que la red de bitcoin lo confirme.")],
      "pagado": [di("Paid", "Pagado"), di("Paid. Thank you! Your robot is ready to download.", "Pagado. ¡Gracias! Tu robot está listo para descargar.")],
      "revisar": [di("Being checked", "En revisión"), di("We are checking your payment by hand. Nothing is lost: we will write to you.", "Estamos revisando tu pago a mano. No se pierde nada: te escribiremos.")],
      "caducado": [di("Expired", "Caducado"), di("This invoice expired without a payment. Nothing was charged.", "Esta factura caducó sin pago. No se ha cobrado nada.")],
      "cancelado": [di("Cancelled", "Cancelado"), di("This order was cancelled. Nothing was charged.", "Este pedido se canceló. No se ha cobrado nada.")]
    };
    var texto = caja.querySelector("[data-pedido-estado]");
    var datos = caja.querySelector("[data-pedido-datos]");
    var descarga = caja.querySelector("[data-pedido-descarga]");
    var p = (new URLSearchParams(window.location.search).get("p") || "").trim().toUpperCase();
    var vueltas = 0;
    var mirar = function () {
      pedir("/pedido?p=" + encodeURIComponent(p)).then(function (r) {
        if (!r.ok) {
          texto.textContent = r.estado === 404 ? di("We can't find this order. Check the address of this page.", "No encontramos este pedido. Mira la dirección de esta página.") : di("We couldn't check your order right now. Reload this page in a minute.", "Ahora no podemos comprobar tu pedido. Vuelve a cargar la página en un minuto.");
          return;
        }
        var d = r.datos, e = ESTADOS[d.estado] || [d.estado, ""];
        datos.hidden = false;
        caja.querySelector('[data-campo="pedido"]').textContent = d.pedido;
        caja.querySelector('[data-campo="nombre"]').textContent = d.nombre;
        caja.querySelector('[data-campo="usd"]').textContent = dolares(d.usd);
        caja.querySelector('[data-campo="estado"]').textContent = e[0];
        texto.textContent = e[1];
        if (d.descarga) {
          descarga.href = COBRO + "/descarga?p=" + encodeURIComponent(d.pedido);
          descarga.hidden = false;
        } else if ((d.estado === "pendiente" || d.estado === "en camino") && ++vueltas < 480) {
          setTimeout(mirar, 15000);
        }
      }).catch(function () {
        texto.textContent = di("We couldn't reach the shop. Reload this page in a minute.", "No pudimos llegar a la tienda. Vuelve a cargar la página en un minuto.");
      });
    };
    if (!/^BS-[A-Z2-7]{12}$/.test(p)) texto.textContent = di("This address has no order number. Use the link from your invoice.", "Esta dirección no lleva número de pedido. Usa el enlace de tu factura.");
    else if (!COBRO) texto.textContent = di("We couldn't check your order right now.", "Ahora no podemos comprobar tu pedido.");
    else mirar();
  }
})();
