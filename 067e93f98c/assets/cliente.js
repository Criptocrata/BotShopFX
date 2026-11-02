/* BotShopFX (01-11-2026): lo único vivo de unas páginas fijas. Pregunta al cobro (data-cobro del <body>):
 *   · el bitcoin al cambio del momento, para enseñar cada precio también en BTC;
 *   · la compra: el correo va al cobro, que crea la factura en Plisio, y se salta a ella;
 *   · el estado del pedido en /order/?p=…, con la descarga cuando está pagado.
 * Y filtra el tablero por estado. Sin nada de esto la página se lee igual: los precios en dólares ya están escritos. */
(function () {
  "use strict";
  var cuerpo = document.body;
  var COBRO = (cuerpo.getAttribute("data-cobro") || "").replace(/\/+$/, "");
  var VENTA_ABIERTA = cuerpo.getAttribute("data-venta") === "abierta";

  function pedir(ruta, opciones) {
    return fetch(COBRO + ruta, opciones).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (datos) { return { ok: r.ok, estado: r.status, datos: datos }; });
    });
  }
  function dolares(x) {
    return "$" + String(Math.round(Number(x))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
        el.textContent = el.getAttribute("data-btc-largo")
          ? "or " + btc + " BTC at today's rate (1 BTC = " + dolares(btcUsd) + ", updated live)"
          : "or " + btc + " BTC · 1 BTC = " + dolares(btcUsd);
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
    400: "That email doesn't look right.",
    409: "This robot is retired: it is no longer for sale.",
    429: "Too many tries. Wait a minute and try again.",
    503: "Sales are not open yet."
  };
  document.querySelectorAll("form.comprar").forEach(function (form) {
    var estado = form.querySelector(".estado-compra");
    var boton = form.querySelector("button");
    function di(texto, mal) { estado.textContent = texto; estado.classList.toggle("mal", Boolean(mal)); }
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!VENTA_ABIERTA || !COBRO) { di(MENSAJES_COMPRA[503], true); return; }
      var correo = form.querySelector("input[type=email]").value.trim();
      boton.disabled = true;
      di("Creating your invoice…");
      pedir("/comprar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ robot: form.getAttribute("data-robot"), correo: correo })
      }).then(function (r) {
        var url = r.datos && r.datos.url;
        if (r.ok && typeof url === "string" && /^https:\/\//.test(url)) {
          di("Taking you to the invoice…");
          window.location.href = url;
          return;
        }
        di(MENSAJES_COMPRA[r.estado] || "We couldn't create the invoice. Try again in a few minutes.", true);
        boton.disabled = false;
      }).catch(function () {
        di("We couldn't reach the shop. Check your connection and try again.", true);
        boton.disabled = false;
      });
    });
  });

  /* El pedido */
  var caja = document.querySelector("[data-pedido-caja]");
  if (caja) {
    var ESTADOS = {
      "pendiente": ["Waiting for payment", "We are waiting for your payment. If you have already paid, it can take a few minutes to show here."],
      "en camino": ["Confirming", "Your payment is on its way. We are waiting for the bitcoin network to confirm it."],
      "pagado": ["Paid", "Paid. Thank you! Your robot is ready to download."],
      "revisar": ["Being checked", "We are checking your payment by hand. Nothing is lost: we will write to you."],
      "caducado": ["Expired", "This invoice expired without a payment. Nothing was charged."],
      "cancelado": ["Cancelled", "This order was cancelled. Nothing was charged."]
    };
    var texto = caja.querySelector("[data-pedido-estado]");
    var datos = caja.querySelector("[data-pedido-datos]");
    var descarga = caja.querySelector("[data-pedido-descarga]");
    var p = (new URLSearchParams(window.location.search).get("p") || "").trim().toUpperCase();
    var vueltas = 0;
    var mirar = function () {
      pedir("/pedido?p=" + encodeURIComponent(p)).then(function (r) {
        if (!r.ok) {
          texto.textContent = r.estado === 404 ? "We can't find this order. Check the address of this page." : "We couldn't check your order right now. Reload this page in a minute.";
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
        texto.textContent = "We couldn't reach the shop. Reload this page in a minute.";
      });
    };
    if (!/^BS-[A-Z2-7]{12}$/.test(p)) texto.textContent = "This address has no order number. Use the link from your invoice.";
    else if (!COBRO) texto.textContent = "We couldn't check your order right now.";
    else mirar();
  }
})();
