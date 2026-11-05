/* BotShopFX (01-11-2026): lo único vivo de unas páginas fijas. Pregunta al cobro (data-cobro del <body>):
 *   · el bitcoin al cambio del momento, para enseñar cada precio también en BTC;
 *   · la compra: el correo va al cobro, que crea la factura en Plisio, y se salta a ella;
 *   · el estado del pedido en /order/?p=…, con la descarga cuando está pagado.
 * Y filtra el tablero por estado. Sin nada de esto la página se lee igual: los precios en dólares ya están escritos.
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

  /* Los filtros del tablero */
  var botones = document.querySelectorAll("[data-filtro]");
  botones.forEach(function (b) {
    b.addEventListener("click", function () {
      var filtro = b.getAttribute("data-filtro");
      botones.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
      document.querySelectorAll("tr[data-estado]").forEach(function (fila) {
        fila.hidden = filtro !== "todos" && fila.getAttribute("data-estado") !== filtro;
      });
    });
  });

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
