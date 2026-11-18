/**
 * Archivo: app/producto/[id].tsx
 * Función: ficha de un producto, en la dirección /producto/<id> (admite ?chat=1 y ?guia=1).
 * Para qué sirve: el cliente ve fotos, precio, estado, entrega estimada y garantía, y puede añadir a la cesta, comprar ya, preguntar, compartir, dar «me gusta», avisarse de bajadas de precio, comparar o reservar con señal.
 * Conectado con: components/ficha/* (DatosFicha, FichaProducto y ExtrasFicha, separados en la tanda 6), lib/supabase.ts (tablas products, product_media, categories, profiles), lib/interaccion.ts, lib/reservas.ts, lib/envio.ts, lib/analiticaPropia.ts, constants/temaTienda.ts, lib/admin/productos.utilidades.ts, components/VisorFotos.tsx, ImagenInteligente.tsx, CarruselProductosCategoria.tsx, ConversacionProducto.tsx, PerfilPublico.tsx, CabeceraMarca.tsx, TirarParaActualizar.tsx, components/marca/*; api/pago.ts (reserva con señal).
 * Utilizado por: Expo Router (dirección /producto/<id>); la enlazan app/catalogo.tsx, app/comparar.tsx, app/(tabs)/index.tsx, app/(tabs)/perfil.tsx, app/(tabs)/blue-ia.tsx, app/admin/escaparate.tsx y components/CarruselProductosCategoria.tsx, AsistenteBlue.tsx, BarraBusqueda.tsx, ConversacionProducto.tsx; exporta FichaProducto, usada por app/servicio/[id].tsx.
 * Dependencias: react, react-native, expo-router, @expo/vector-icons, @react-native-async-storage/async-storage.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: ficha de un producto individual. Carga el producto y su galería
 * de fotos/vídeos desde Supabase a partir del id de la URL, y permite
 * añadirlo a la cesta, ir a checkout, preguntar por este producto,
 * compartir la ficha o darle "me gusta".
 *
 * Dudas (mejora 10 «Chat con el producto adjunto», 2026-11-15): «Preguntar por este artículo» abre directamente el chat
 * de la tienda de (este producto, este cliente) —el que ya hay o uno nuevo, get_or_create_product_chat no duplica— con la
 * tarjeta del producto arriba y preguntas sugeridas (abrirChatProducto en components/ConversacionProducto.tsx); Jefe lo ve
 * en app/admin/chats.tsx. Sin cuenta (PreguntarArticulo): explica la ventaja y ofrece «Crear cuenta gratis» / «Entrar»;
 * al entrar vuelve aquí con ?chat=1 y abre el chat. Se mide chat_producto_invitacion (solo el producto). Antes abría Blue
 * IA con ?producto=<id> (Blue sigue pudiendo pasar al equipo con «Hablar con el equipo»).
 *
 * Cómo funciona: fetchProductRow() trae el producto y su categoría en una
 * sola consulta (join categories). pickInitialHeroImage() elige la foto de portada. detectAdmin() decide si
 * se muestra información extra (estado interno) reservada para el panel de
 * admin.
 *
 * "Me gusta": el contador vive en products.like_count (ver
 * sql/product_likes.sql — hay que ejecutarlo una vez en Supabase). Se
 * actualiza con la función adjust_product_like(product_id, delta), que solo
 * puede sumar o restar 1 a ese contador (no da acceso a modificar el resto
 * de la fila), así que un visitante sin cuenta también puede dar like. Qué
 * productos ha marcado CADA dispositivo se guarda en AsyncStorage (igual que
 * la cesta), no en Supabase, para no exigir inicio de sesión.
 *
 * Tamaños (2026-11-12, grupo 3): compartir y «me gusta» sobre la foto tienen 44 × 44 de zona táctil (el círculo
 * visible sigue en 32) y el contador a 13 px (constants/temaTienda.ts; prueba TM3).
 *
 * "Compartir": usa la Web Share API del navegador (navigator.share) en
 * móvil/web, con copiar el enlace al portapapeles como alternativa en
 * escritorio; en nativo (iOS/Android) usa el Share de React Native.
 *
 * Comprar: "Añadir a la cesta" y "Comprar ya" (con selector de Cantidad)
 * escriben directamente en la misma cesta que usan app/(tabs)/cesta.tsx y
 * app/checkout.tsx (misma clave de AsyncStorage, CART_KEY), duplicada aquí
 * en vez de importada, igual que el resto de pantallas de este proyecto.
 * "Comprar ya" añade el producto y lleva directo a checkout, saltándose la
 * cesta, como el botón equivalente de otras tiendas online. Desde el 2026-11-14 (mejora 2 «Comprar en menos pasos»)
 * abre /checkout?comprar=<id>: se paga SOLO este artículo (lo demás sigue en la cesta) con los datos del perfil ya puestos.
 *
 * Imagen ampliada: al tocar la foto principal se abre
 * components/VisorFotos.tsx, un visor a pantalla completa con zoom
 * (pellizco, doble toque o rueda del ratón) y navegación entre todas las
 * fotos del producto. La foto principal (sin abrir el visor) también se
 * puede deslizar con el dedo hacia los lados como un carrusel, para pasar
 * de una foto a otra sin salir de la ficha (mainImagePan).
 *
 * Ficha de confianza (mejora 4, 2026-11-14): el visor se cierra también deslizando hacia abajo y su uso se mide como
 * ficha_foto_zoom (abrir, zoom, cerrar deslizando). Debajo del precio, «Revisado por nuestro equipo» y «Garantía de N
 * meses» SOLO si el dueño los marca en el producto (products.revisado / garantia_meses, migración 20261114140000; sin
 * la columna no sale nada). Y la entrega estimada (EntregaEstimadaFicha con lib/envio.ts → entregaEstimada): con el
 * código postal del perfil (dirección predeterminada) o uno escrito aquí que no se guarda, «Llega hoy» en Zaragoza y
 * Cuarte, «Llega entre el … y el …» en el resto de España (sin domingos) y, sin código, las dos; se mide como
 * ficha_entrega_estimada (tipo y origen, nunca el código postal). Se ve en Administración → Analítica.
 *
 * «Avísame si baja de precio» (mejora 5, 2026-11-14; AvisoPrecioFicha, migración 20261114160100): bajo «Preguntar por
 * este producto», un interruptor de 44 px SOLO con cuenta (tabla avisos_precio, lib/interaccion.ts). Sin cuenta, al
 * tocarlo explica la ventaja y ofrece «Crear cuenta gratis» (vuelve a esta ficha al entrar). Sin la migración o si la
 * lectura falla, no se ofrece (un error no es «no lo sigues»). Se mide como aviso_precio_activado / aviso_precio_desactivado
 * (solo el producto) y aviso_precio_invitacion; Blue avisa de la bajada (components/AsistenteBlue.tsx).
 *
 * «Productos parecidos» y «Completa tu compra» (mejora 6, 2026-11-14; components/CarruselProductosCategoria.tsx): al final,
 * hasta 8 productos de la misma categoría y precio parecido (carrusel en el móvil, rejilla de 4 en el ordenador; sin
 * ninguno, no sale) y, bajo los botones de comprar, como mucho 3 mandos o accesorios de la misma familia SOLO si es una
 * consola. Se miden parecidos_mostrado / parecido_tocado y complemento_mostrado / _tocado (Administración → Analítica).
 *
 * «Comparar con otros productos» (mejora 8, 2026-11-14; components/CarruselProductosCategoria.tsx → BotonComparar): bajo el
 * aviso de precio, una casilla de 44 px que lo añade a la comparación (como mucho 3, en el dispositivo). La barra de
 * abajo (BarraComparar) se esconde mientras «Comprar ya» / «Añadir a la cesta» (ficha-comprar-ya, ficha-anadir-cesta)
 * estén donde iría ella, y la ficha termina con su hueco. Lleva a app/comparar.tsx.
 *
 * Cabecera: solo el botón "←" queda fijo arriba; el título y el subtítulo
 * del producto viven dentro del ScrollView (son lo primero que se ve) y
 * desaparecen al hacer scroll como el resto del contenido, en vez de
 * quedarse pegados arriba.
 *
 * Número de referencia: viene de products.reference (ver
 * sql/product_reference.sql — columna nueva, opcional, hay que ejecutar el
 * script una vez en Supabase). Se rellena al crear/editar el producto desde
 * app/admin/products.tsx y aquí solo se muestra dentro de "Información del
 * producto" cuando el producto tiene uno asignado.
 *
 * "X Visitas": contador REAL (nunca inventado) junto a "De segunda mano:
 * ...", ambos como texto plano (sin fondo/borde de burbuja). Vive en
 * products.view_count (ver sql/product_views.sql — columna nueva, hay que
 * ejecutar el script una vez en Supabase) y sube exactamente 1 en cada carga
 * real de esta ficha vía increment_product_view(), salvo cuando la abre el
 * propio admin (para no inflar el número con sus propias revisiones). Si esa
 * función todavía no existe en Supabase, el número simplemente no se
 * muestra en vez de romper la ficha.
 *
 * Rendimiento: loadProduct() lanza a la vez (Promise.all) el producto con su
 * categoría (filtrado a "publicado"), sus fotos/vídeos y los "me gusta"
 * locales, y pinta la ficha en cuanto llegan. La comprobación de admin
 * arranca en paralelo y no bloquea: al resolverse ajusta la vista, suma la
 * visita y registra la analítica. Solo si el producto no aparece como
 * publicado se espera a saber si eres admin y se repite la consulta sin
 * filtro (borradores/ocultos, que solo ve el admin).
 *
 * Analítica: al cargar el producto (sin contar visitas del propio admin) se
 * registra el paso "Producto {título}" y el scroll dentro de la ficha
 * dispara "Scroll" (lib/analiticaPropia.ts), para el embudo del panel de métricas.
 * "Añadir a la cesta" y "Comprar ya" registran los eventos de conversión
 * "add_to_cart" y "buy_now" con { productId, price }.
 *
 * Reservar con señal (mejora 14, 2026-11-15; ReservarConSenal): SOLO si GET /api/pago?reserva=ajustes dice que está
 * activa (apagada y vacía hasta que el dueño ponga sus reglas y su gestor revise el texto). Hoja con días, % y € de la
 * escala, vencimiento, arras, qué pasa al vencer, condiciones y casilla obligatoria; «Pagar señal» solo manda artículo y
 * días (el importe lo calcula api/pago.ts). Si el artículo está reservado, «Este artículo está reservado hasta el …» y sin comprar.
 * Las condiciones y «Qué pasa al vencer» se enseñan con las marcas rellenadas (rellenarCondicionesReserva).
 * Mide reserva_abierta y reserva_pagar (lib/reservas.ts tiene el cálculo y los textos).
 *
 * Conectado con:
 * - lib/supabase.ts → tablas products, product_media, categories, profiles.
 * - lib/analiticaPropia.ts → registro de "Producto {título}" y "Scroll" para el
 *   panel de métricas del admin.
 * - sql/product_likes.sql → columna like_count y función adjust_product_like.
 * - sql/product_views.sql → columna view_count y función increment_product_view.
 * - app/catalogo.tsx → de donde se navega hasta aquí.
 * - app/(tabs)/cesta.tsx y app/checkout.tsx → botones "Ver cesta" y
 *   "Finalizar compra".
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import { ActivityIndicator, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, Share, StatusBar, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { filaPerfilCliente, supabase } from "../../lib/supabase";
import { COLORES_TEXTO, TACTIL, TAMANOS, colorTextoAzul } from "../../constants/temaTienda";
import { sinEmojis } from "../../lib/admin/productos.utilidades";
import { contarVistaProducto, fijarMeGusta } from "../../lib/interaccion";
import { marcarOrigenRegistro, medirCargaPantalla, medirEvento, medirEventoEspaciado } from "../../lib/analiticaPropia";
import {
  EXPLICACION_ARRAS,
  eurosReserva,
  fechaReserva,
  leerAjustesReserva,
  porcentajeReserva,
  productosReservadosPorOtros,
  rellenarCondicionesReserva,
  RESERVA_MINUTOS,
  reservaDisponible,
  reservarProducto,
  senalReserva,
  URL_PAGO,
  type AjustesReservaPublicos,
} from "../../lib/reservas";
import { cargarTarifas, formatearEuros, limpiarCodigoPostal, tipoEntregaPorCodigo, type TipoEntregaEstimada, type ZonaEnvio } from "../../lib/envio";
import { direccionesDeFila } from "../../components/PerfilPublico";
import VisorFotos, { type EventoVisor, type FotoVisor } from "../../components/VisorFotos";
import ImagenInteligente from "../../components/ImagenInteligente";
import CargaMarca from "../../components/marca/CargaMarca";
import CabeceraMarca from "../../components/CabeceraMarca";
import { useRecarga } from "../../components/TirarParaActualizar";
import MarcaAnimada from "../../components/marca/MarcaAnimada";
import { BotonComparar, CompletaTuCompra, ProductosParecidos, registrarVisto, useAlturaBarraComparar } from "../../components/CarruselProductosCategoria";
import { BUY_NOW_MARK_KEY, BuyNowMark, COLORS, CartItem, Product, ProductMediaRow, asProductCondition, detectAdmin, fetchProductRow, getLikedProductIds, labelCondition, loadCart, loadProductMediaRows, mapDbStatusToUi, normalizeProductMediaRows, pickInitialHeroImage, pushRoute, replaceRoute, saveCart, saveLikedProductIds, smartBack } from "../../components/ficha/DatosFicha";
import { FichaProducto } from "../../components/ficha/FichaProducto";
import { AvisoPrecioFicha, EntregaEstimadaFicha, InsigniasConfianza, PreguntarArticulo, VOLVER_TRAS_ACCESO_FICHA_KEY } from "../../components/ficha/ExtrasFicha";
export { FichaProducto } from "../../components/ficha/FichaProducto";
export type { Caracteristica } from "../../components/ficha/DatosFicha";

export default function ProductoScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isTablet = widthSafe >= 700 && widthSafe < 1080;
  const isWide = widthSafe >= 1080;
  const pagePadding = isMobile ? 12 : 16;
  const alturaBarraComparar = useAlturaBarraComparar();

  // ?guia=1: la guía de Blue (components/AsistenteBlue.tsx) enseña esta ficha; esa demostración no cuenta como visita.
  // ?chat=1: vuelve de crear la cuenta o entrar desde «Preguntar por este artículo» y abre el chat (PreguntarArticulo).
  const params = useLocalSearchParams<{ id?: string; guia?: string; chat?: string; reserva?: string }>();
  const productId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [p, setP] = useState<Product | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  // Segunda mano: cada ficha es una unidad única, así que siempre se compra 1 (sin selector).
  const qty = 1;
  const [cartBusy, setCartBusy] = useState(false);
  // Otro cliente lo tiene en su cesta (reserva de 15 minutos activa).
  const [reservadoPorOtro, setReservadoPorOtro] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Entrega estimada (mejora 4 «Ficha de confianza»): el código postal del perfil (su dirección predeterminada) o el que
  // escribe aquí el cliente solo para calcular (no se guarda). perfilListo evita contar «sin_cp» antes de leer el perfil.
  const [cpPerfil, setCpPerfil] = useState<string | null>(null);
  const [perfilListo, setPerfilListo] = useState(false);
  const [cpEscrito, setCpEscrito] = useState("");
  const [campoCp, setCampoCp] = useState(false);
  const [zonasEnvio, setZonasEnvio] = useState<ZonaEnvio[] | null>(null);
  const zonasPedidas = useRef(false);
  const entregasContadas = useRef(new Set<string>());

  const reqSeqRef = useRef(0);

  // Reservar con señal (mejora 14): la configuración pública (apagada → nada) y si el artículo ya está reservado.
  const [ajustesReserva, setAjustesReserva] = useState<AjustesReservaPublicos | null>(null);
  const reservadoSenalHasta = ajustesReserva?.reservado_hasta && Date.parse(ajustesReserva.reservado_hasta) > Date.now() ? ajustesReserva.reservado_hasta : null;

  const canBuy = useMemo(() => {
    if (!p) return false;
    if (!isAdmin) return p.status === "PUBLICADA" && p.isActive && !reservadoPorOtro && !reservadoSenalHasta;
    return true;
  }, [p, isAdmin, reservadoPorOtro, reservadoSenalHasta]);

  const loadedId = p?.id ?? null;
  useEffect(() => {
    if (!loadedId) return;
    let vivo = true;
    leerAjustesReserva(loadedId).then((a) => {
      if (vivo) setAjustesReserva(a);
    });
    return () => {
      vivo = false;
    };
  }, [loadedId]);
  useEffect(() => {
    if (!loadedId) return;
    let vivo = true;
    productosReservadosPorOtros([loadedId]).then((ids) => {
      if (vivo) setReservadoPorOtro(ids.has(loadedId));
    });
    return () => {
      vivo = false;
    };
  }, [loadedId]);

  // Debajo del título, solo lo que importa al cliente: el estado del artículo (petición del dueño: sin
  // «Disponible para compra» ni el número de fotos). El admin ve además que está en su vista.
  const heroSubcopy = useMemo(() => {
    if (!p) return "Ficha de producto";
    const estado = p.condition === "NEW" ? "Nuevo · unidad única" : `Segunda mano · ${labelCondition(p.condition)} · unidad única`;
    return isAdmin ? `${estado} · Vista admin` : estado;
  }, [p, isAdmin]);

  // Entrega estimada: el código postal de la dirección predeterminada del perfil (o el de siempre), solo con sesión.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const uid = s.session?.user?.id;
        if (uid) {
          // select("*"): una sola petición que no falla aunque falte alguna columna del perfil.
          // (Compartida con «Completa tu perfil» si las dos la piden a la vez: lib/supabase.ts → filaPerfilCliente.)
          const { data } = await filaPerfilCliente(uid);
          if (vivo && data) {
            const fila = data as Record<string, unknown>;
            const lista = direccionesDeFila(fila);
            const pred = lista?.find((d) => d.predeterminada) ?? lista?.[0] ?? null;
            const cp = limpiarCodigoPostal(pred?.codigoPostal || (typeof fila.codigo_postal === "string" ? fila.codigo_postal : ""));
            setCpPerfil(cp.length === 5 ? cp : null);
          }
        }
      } catch {
        // Sin perfil: se enseñan las dos opciones.
      } finally {
        if (vivo) setPerfilListo(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const cpEscritoLimpio = limpiarCodigoPostal(cpEscrito);
  const cpActivo = cpEscritoLimpio.length === 5 ? cpEscritoLimpio : cpPerfil;
  const origenCp: "escrito" | "perfil" | null = cpEscritoLimpio.length === 5 ? "escrito" : cpPerfil ? "perfil" : null;
  // Las tarifas (zona «local» que edita el dueño) solo hacen falta con un código postal; una vez por visita.
  useEffect(() => {
    if (!cpActivo || zonasPedidas.current) return;
    zonasPedidas.current = true;
    cargarTarifas().then((z) => setZonasEnvio(z));
  }, [cpActivo]);
  const tipoEntrega: TipoEntregaEstimada = tipoEntregaPorCodigo(cpActivo, zonasEnvio);
  // Solo en lo que se puede comprar y enviar (lo que solo se entrega en mano ya lo explica su aviso).
  const conEntrega = !!p && !p.soloEntregaMano && p.status === "PUBLICADA" && p.isActive;
  const productoCargadoId = p?.id ?? null;
  useEffect(() => {
    if (!conEntrega || !perfilListo || !productoCargadoId || params.guia === "1") return;
    const clave = `${productoCargadoId}:${tipoEntrega}`;
    if (entregasContadas.current.has(clave)) return;
    entregasContadas.current.add(clave);
    // Sin el código postal en los datos: solo el tipo y de dónde salió.
    medirEvento("ficha_entrega_estimada", "Ficha: entrega estimada", {
      path: `/producto/${productoCargadoId}`,
      metadata: { tipo: tipoEntrega, origen: origenCp, productId: productoCargadoId },
    });
  }, [conEntrega, perfilListo, productoCargadoId, tipoEntrega, origenCp, params.guia]);

  // silencioso («Desliza para actualizar»): sin volver a la pantalla de carga y sin contar otra visita.
  async function loadProduct(silencioso = false) {
    const seq = ++reqSeqRef.current;

    if (!productId) {
      setErr("No hemos podido encontrar este producto.");
      setP(null);
      setSelectedImageUrl(null);
      setLoading(false);
      return;
    }

    if (!silencioso) {
      setLoading(true);
      setViewCount(null);
    }
    setErr(null);

    // Lo secundario (¿eres admin?) arranca ya, en paralelo, pero no bloquea
    // el pintado de la ficha.
    const adminPromise = detectAdmin();

    try {
      // Lo principal, todo a la vez: producto + categoría (una consulta con
      // join), sus fotos/vídeos (solo dependen del id de la URL) y los "me
      // gusta" de este dispositivo (AsyncStorage, local).
      const [publicRow, mediaRows, likedIds] = await Promise.all([
        fetchProductRow(productId, true),
        loadProductMediaRows(productId).catch((e) => {
          // Sin galería la ficha sigue sirviendo (queda products.images).
          console.error("Error cargando las fotos del producto:", e);
          return [] as ProductMediaRow[];
        }),
        getLikedProductIds(),
      ]);
      if (seq !== reqSeqRef.current) return;

      // Borradores u ocultos: solo los ve el admin, así que únicamente en ese
      // caso (raro) se espera a saber si eres admin y se repite la consulta
      // sin el filtro de "publicado".
      let productRow = publicRow;
      if (!productRow && (await adminPromise)) {
        if (seq !== reqSeqRef.current) return;
        productRow = await fetchProductRow(productId, false);
      }
      if (seq !== reqSeqRef.current) return;

      if (!productRow) {
        setP(null);
        setSelectedImageUrl(null);
        setErr(
          "Este producto no existe o ya no está disponible para la venta. Prueba a volver al catálogo para ver el resto de artículos."
        );
        return;
      }

      const normalizedMedia = normalizeProductMediaRows(mediaRows);
      const heroImage = pickInitialHeroImage(productRow, normalizedMedia);

      const mapped: Product = {
        id: productRow.id,
        title: productRow.title,
        caracteristicas: productRow.caracteristicas,
        mantenimiento: productRow.mantenimiento,
        soloEntregaMano: productRow.solo_entrega_mano,
        revisado: productRow.revisado,
        garantiaMeses: productRow.garantia_meses,
        description: productRow.description ?? null,
        priceEUR: Number(productRow.price_eur ?? 0),
        status: mapDbStatusToUi(productRow.status),
        isActive: Boolean(productRow.is_active),
        imageUrl: heroImage,
        category: productRow.category,
        media: normalizedMedia,
        condition: asProductCondition(productRow.condition),
        likeCount: Math.max(0, Number(productRow.like_count ?? 0)),
        reference: productRow.reference ?? null,
      };

      setP(mapped);
      setSelectedImageUrl(heroImage);
      setLikeCount(mapped.likeCount);
      setLiked(likedIds.has(mapped.id));
      // La ficha se pinta ya: lo que sigue (admin, visitas, analítica) llega
      // después sin bloquear.
      setLoading(false);
      // «Vistos recientemente» de Inicio (solo en este dispositivo): lo que está a la venta pasa a ser el primero.
      if (mapped.status === "PUBLICADA" && mapped.isActive) void registrarVisto(mapped.id);

      adminPromise.then((adminFlag) => {
        if (seq !== reqSeqRef.current) return;
        setIsAdmin(adminFlag);
        if (adminFlag || params.guia === "1" || silencioso) return;

        // Contador de visitas REAL (ver sql/product_views.sql): se suma 1 en
        // cada carga real de la ficha, salvo cuando la abre el propio admin
        // (esas no son visitas de clientes). Si la función falla, simplemente
        // no se muestra el número, sin romper la ficha.
        contarVistaProducto(mapped.id).then((total) => {
          if (seq !== reqSeqRef.current) return;
          if (typeof total === "number") setViewCount(total);
        });

        // Analítica: igual que el contador de visitas, no se cuentan las
        // aperturas del propio admin revisando su catálogo.
        medirEvento("page_view", `Producto ${mapped.title}`, {
          path: `/producto/${mapped.id}`,
          metadata: { productId: mapped.id, category: mapped.category?.name ?? null },
        });
      });
    } catch (e: any) {
      if (seq !== reqSeqRef.current) return;
      console.error("Error cargando el producto:", e);
      setErr("No hemos podido cargar este producto en este momento. Inténtalo de nuevo en unos instantes.");
      setP(null);
      setSelectedImageUrl(null);
    } finally {
      if (seq !== reqSeqRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Carga rápida (mejora 7): la primera pantalla útil es la ficha ya pintada con su producto (una vez por visita).
  const fichaLista = !loading && !!p;
  useEffect(() => {
    if (fichaLista) medirCargaPantalla("producto");
  }, [fichaLista]);

  // «Desliza para actualizar»: precio, ficha, fotos… al día sin volver a la pantalla de carga.
  const recarga = useRecarga();
  useEffect(() => {
    if (recarga > 0) loadProduct(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarga]);

  useEffect(() => {
    if (!p) {
      setSelectedImageUrl(null);
      return;
    }

    const validUrls = p.media.filter((m) => m.kind === "image").map((m) => m.publicUrl);

    if (!validUrls.length) {
      setSelectedImageUrl(p.imageUrl ?? null);
      return;
    }

    if (!selectedImageUrl || !validUrls.includes(selectedImageUrl)) {
      setSelectedImageUrl(validUrls[0]);
    }
  }, [p, selectedImageUrl]);

  // Datos estructurados del producto para Google (schema.org Product), con la ficha técnica como
  // additionalProperty. Solo web; se escribe con textContent (nunca como HTML) y se quita al salir.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !p) return;
    const fotos = p.media.filter((m) => m.kind === "image").map((m) => m.publicUrl);
    const disponible = p.status === "PUBLICADA" && p.isActive;
    const estado =
      p.condition === "NEW"
        ? "https://schema.org/NewCondition"
        : p.condition === "PARTS"
        ? "https://schema.org/DamagedCondition"
        : "https://schema.org/UsedCondition";
    const url = `https://videojuegoszaragoza.com/producto/${p.id}`;
    const datos: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.title,
      url,
      ...(fotos.length ? { image: fotos } : p.imageUrl ? { image: [p.imageUrl] } : {}),
      ...(sinEmojis(p.description) ? { description: sinEmojis(p.description) } : {}),
      ...(p.reference ? { sku: p.reference } : {}),
      ...(p.category?.name ? { category: p.category.name } : {}),
      offers: {
        "@type": "Offer",
        url,
        price: p.priceEUR.toFixed(2),
        priceCurrency: "EUR",
        itemCondition: estado,
        availability: disponible ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        seller: { "@type": "Organization", name: "Videojuegoszaragoza.com" },
      },
      ...(p.caracteristicas.length
        ? { additionalProperty: p.caracteristicas.map((c) => ({ "@type": "PropertyValue", name: c.etiqueta, value: c.valor })) }
        : {}),
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "datos-producto";
    script.textContent = JSON.stringify(datos).replace(/</g, "\\u003c");
    document.getElementById("datos-producto")?.remove();
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [p]);

  const imageGallery = useMemo(() => {
    if (!p) return [];
    return p.media.filter((m) => m.kind === "image");
  }, [p]);

  // Imágenes para el visor a pantalla completa (VisorFotos). Si el
  // producto no tiene fotos en product_media pero sí una imagen "de toda la
  // vida" en products.images, se usa esa como única foto del visor en vez
  // de dejarlo sin nada.
  const lightboxImages: FotoVisor[] = useMemo(() => {
    if (imageGallery.length > 0) {
      return imageGallery.map((m) => ({ id: m.id, url: m.publicUrl }));
    }
    if (p?.imageUrl) {
      return [{ id: p.id, url: p.imageUrl }];
    }
    return [];
  }, [imageGallery, p?.id, p?.imageUrl]);

  function openLightbox() {
    if (!lightboxImages.length) return;
    const idx = selectedImageUrl
      ? lightboxImages.findIndex((img) => img.url === selectedImageUrl)
      : 0;
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxOpen(true);
    // Uso del visor (Administración → Analítica → Recorrido principal). El zoom lo cuenta el propio visor.
    medirEvento("foto_ampliada", "Ficha: foto ampliada", { metadata: { fotos: lightboxImages.length } });
    // Ficha del producto (Analítica → «Ficha del producto (30 días)»): abrir, zoom y cerrar deslizando.
    medirEvento("ficha_foto_zoom", "Ficha: visor de fotos", { path: `/producto/${p?.id ?? ""}`, metadata: { accion: "abrir", fotos: lightboxImages.length } });
  }

  function eventoVisor(evento: EventoVisor, como?: string) {
    medirEvento("ficha_foto_zoom", "Ficha: visor de fotos", {
      path: `/producto/${p?.id ?? ""}`,
      metadata: evento === "zoom" ? { accion: "zoom", como: como ?? null } : { accion: "cerrar_deslizando" },
    });
  }

  // Desliza la foto principal como un carrusel (sin zoom: el zoom vive en
  // VisorFotos). "delta" es -1 (anterior) o 1 (siguiente), y da la
  // vuelta al llegar al final, como cualquier carrusel.
  function stepImage(delta: number) {
    if (imageGallery.length < 2) return;
    const currentIdx = imageGallery.findIndex((m) => m.publicUrl === selectedImageUrl);
    const base = currentIdx >= 0 ? currentIdx : 0;
    const next = ((base + delta) % imageGallery.length + imageGallery.length) % imageGallery.length;
    setSelectedImageUrl(imageGallery[next].publicUrl);
  }

  // Galería con muchas fotos (VeoAura manda hasta 30): posición actual («3 / 30»), miniaturas que solo se descargan
  // cuando van a verse (las demás esperan con su hueco) y la miniatura activa siempre a la vista.
  const fotoActual = Math.max(0, imageGallery.findIndex((m) => m.publicUrl === selectedImageUrl));
  const ladoMiniatura = isMobile ? 74 : 88;
  const pasoMiniatura = ladoMiniatura + 10;
  const miniaturasRef = useRef<ScrollView>(null);
  const [anchoMiniaturas, setAnchoMiniaturas] = useState(0);
  const [miniaturasCargadas, setMiniaturasCargadas] = useState(0);
  const cargarMiniaturasHasta = useCallback(
    (px: number) => setMiniaturasCargadas((v) => Math.max(v, Math.ceil(px / pasoMiniatura) + 3)),
    [pasoMiniatura]
  );
  useEffect(() => {
    if (!anchoMiniaturas || imageGallery.length < 2) return;
    const izquierda = fotoActual * pasoMiniatura;
    const destino = Math.max(0, izquierda - (anchoMiniaturas - ladoMiniatura) / 2);
    cargarMiniaturasHasta(destino + anchoMiniaturas);
    miniaturasRef.current?.scrollTo({ x: destino, animated: true });
  }, [fotoActual, anchoMiniaturas, pasoMiniatura, ladoMiniatura, imageGallery.length, cargarMiniaturasHasta]);

  // Un toque corto (sin apenas movimiento) abre el visor a pantalla
  // completa; un arrastre horizontal claro cambia de foto tipo carrusel. Se
  // crea de nuevo en cada render (a propósito, no con useRef) para que
  // siempre "vea" el selectedImageUrl/imageGallery actuales -si se creara
  // una sola vez, se quedaría con los valores del primer render.
  const mainImagePan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    // Solo reclama arrastres sobre todo horizontales: el arrastre vertical sobre la foto
    // debe desplazar la ficha, no quedarse atrapado en la imagen.
    onMoveShouldSetPanResponder: (_evt, gestureState) =>
      Math.abs(gestureState.dx) > 6 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_evt, gestureState) => {
      const movedLittle = Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6;

      if (movedLittle) {
        openLightbox();
        return;
      }

      if (Math.abs(gestureState.dx) > 40 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
        stepImage(gestureState.dx > 0 ? -1 : 1);
      }
    },
  });

  async function addToCart(mode: "cart" | "buyNow") {
    if (!p || cartBusy) return;

    setCartBusy(true);
    try {
      // "Comprar ya" exige sesión iniciada: es lo que permite marcar el
      // producto como vendido solo al confirmar el pedido. "Añadir a la
      // cesta" sigue funcionando como invitado, sin pedir login.
      if (mode === "buyNow") {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (!userId) {
          // Sin sesión: primero iniciar sesión o registrarse, y después vuelve a esta ficha.
          await AsyncStorage.setItem(
            "videojuegoszaragoza:volver_tras_acceso",
            JSON.stringify({ ruta: `/producto/${p.id}`, hasta: Date.now() + 30 * 60 * 1000 })
          ).catch(() => {});
          pushRoute(
            `/perfil?acceso=entrar&aviso=${encodeURIComponent("Inicia sesión o crea tu cuenta para comprar. Al terminar volverás a este artículo.")}` as Href
          );
          return;
        }
        await AsyncStorage.setItem(
          BUY_NOW_MARK_KEY,
          JSON.stringify({ productId: p.id, userId } as BuyNowMark)
        );
      }

      // Reserva de 15 minutos: si otro cliente ya lo tiene en su cesta, no se añade.
      const reserva = await reservarProducto(p.id);
      if (!reserva.ok) {
        setReservadoPorOtro(true);
        if (mode === "buyNow") await AsyncStorage.removeItem(BUY_NOW_MARK_KEY);
        return;
      }
      setReservadoPorOtro(false);

      const current = await loadCart();
      const existing = current.find((it) => it.id === p.id);

      const next: CartItem[] = existing
        ? current.map((it) =>
            it.id === p.id ? { ...it, qty, reservedUntil: reserva.hasta } : it
          ) // ya estaba: sigue siendo 1 y renueva la reserva
        : [
            {
              id: p.id,
              title: p.title,
              subtitle: p.category?.name ?? null,
              priceEUR: p.priceEUR,
              qty,
              imageUrl: p.imageUrl,
              reservedUntil: reserva.hasta,
            },
            ...current,
          ];

      await saveCart(next);

      // Conversión: sin await, la analítica nunca retrasa la navegación.
      medirEvento(
        mode === "buyNow" ? "buy_now" : "add_to_cart",
        mode === "buyNow" ? "Comprar ya" : "Añadir a la cesta",
        {
          path: `/producto/${p.id}`,
          metadata: { productId: p.id, price: p.priceEUR },
        }
      );

      if (mode === "buyNow") {
        // Directo al pago con SOLO este artículo (lo demás de la cesta se queda allí) y los datos del perfil ya puestos.
        // push (no replace): «atrás» vuelve a esta ficha.
        pushRoute(`/checkout?comprar=${encodeURIComponent(p.id)}` as Href);
      } else {
        pushRoute("/cesta" as Href);
      }
    } finally {
      setCartBusy(false);
    }
  }

  async function toggleLike() {
    if (!p || likeBusy) return;

    const nextLiked = !liked;
    const delta = nextLiked ? 1 : -1;

    setLikeBusy(true);
    setLiked(nextLiked);
    setLikeCount((prev) => Math.max(0, prev + delta));

    try {
      // Pasa por api/interaccion.ts: un «me gusta» por persona y producto (ver lib/interaccion.ts).
      const total = await fijarMeGusta(p.id, nextLiked);
      if (total === null) throw new Error("no se pudo actualizar el me gusta");
      setLikeCount(total);

      const likedIds = await getLikedProductIds();
      if (nextLiked) likedIds.add(p.id);
      else likedIds.delete(p.id);
      await saveLikedProductIds(likedIds);
    } catch (e) {
      console.error("Error actualizando el like:", e);
      // Si falla la llamada, se deshace el cambio optimista.
      setLiked(!nextLiked);
      setLikeCount((prev) => Math.max(0, prev - delta));
    } finally {
      setLikeBusy(false);
    }
  }

  async function shareProduct() {
    if (!p) return;

    // Enlace limpio de la ficha: WhatsApp, Instagram… enseñan su vista previa con foto,
    // título y precio (api/compartir.ts, por la regla de vercel.json para sus lectores).
    const url =
      Platform.OS === "web" && typeof window !== "undefined"
        ? `${window.location.origin}/producto/${p.id}`
        : `https://videojuegoszaragoza.com/producto/${p.id}`;

    if (Platform.OS !== "web") {
      try {
        await Share.share({ title: p.title, message: `${p.title} · ${formatearEuros(p.priceEUR)} · ${url}`, url });
      } catch {
        // El usuario canceló el share nativo: no hay nada que hacer.
      }
      return;
    }

    const nav: any = typeof navigator !== "undefined" ? navigator : null;

    if (nav?.share) {
      try {
        await nav.share({ title: p.title, text: `${p.title} · ${formatearEuros(p.priceEUR)}`, url });
      } catch {
        // El usuario canceló el share del navegador: no hay nada que hacer.
      }
      return;
    }

    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(url);
        setShareFeedback("Enlace copiado");
        setTimeout(() => setShareFeedback(null), 2000);
      } catch {
        // Sin permiso de portapapeles: no hay más alternativa silenciosa.
      }
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#F6FAFD",
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: isMobile ? 12 : 14,
          alignItems: "center",
        }}
      >
        {/* Columna centrada: en pantallas anchas la ficha no se pega a la izquierda */}
        <View style={{ width: "100%", maxWidth: 1240 }}>
          <CabeceraMarca onBack={smartBack} />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <CargaMarca texto="Cargando producto…" />
        </View>
      ) : err ? (
        <View style={{ padding: pagePadding, gap: 12, alignItems: "center" }}>
          <MarcaAnimada cual="taller" ancho={130} />
          <View style={{ gap: 6, alignItems: "center", maxWidth: 520 }}>
            <Text style={{ color: "#B91C1C", fontWeight: "900", textAlign: "center" }}>
              No se ha podido cargar el producto
            </Text>
            <Text style={{ color: "#7A271A", lineHeight: 20, textAlign: "center" }}>{err}</Text>
          </View>

          <View
            style={{
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "center",
              alignSelf: "stretch",
              gap: 10,
            }}
          >
            <Pressable
              onPress={() => loadProduct()}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.accentBorder,
                backgroundColor: COLORS.accent2,
                paddingVertical: 14,
                paddingHorizontal: 16,
                width: isMobile ? "100%" : undefined,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                Reintentar
              </Text>
            </Pressable>

            <Pressable
              onPress={() => replaceRoute("/catalogo" as Href)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "#F6FAFD",
                paddingVertical: 14,
                paddingHorizontal: 16,
                width: isMobile ? "100%" : undefined,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                Volver al catálogo
              </Text>
            </Pressable>
          </View>
        </View>
      ) : !p ? (
        <View style={{ padding: pagePadding, gap: 10, alignItems: "center" }}>
          <MarcaAnimada cual="taller" ancho={130} />
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>
            Producto no disponible
          </Text>

          <Pressable
            onPress={() => replaceRoute("/catalogo" as Href)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: "#F6FAFD",
              paddingVertical: 14,
              paddingHorizontal: 16,
              alignSelf: isMobile ? "stretch" : "center",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
              Volver al catálogo
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: pagePadding,
            paddingBottom: isMobile ? 28 : 36,
            alignItems: "center",
          }}
          onScroll={(e) => {
            if (e.nativeEvent.contentOffset.y > 40) {
              medirEventoEspaciado("producto-scroll", "scroll", "Scroll", {
                path: `/producto/${productId ?? ""}`,
              });
            }
          }}
          scrollEventThrottle={16}
        >
          <View style={{ width: "100%", maxWidth: 1240, gap: 14 }}>
          <View style={{ width: "100%", alignItems: "center" }}>
            <Text
              accessibilityRole="header"
              {...({ "aria-level": 1 } as object)}
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 24 : 28,
                fontWeight: "900",
                lineHeight: isMobile ? 30 : 32,
                textAlign: "center",
              }}
              numberOfLines={isMobile ? 3 : 2}
            >
              {p.title}
            </Text>

            <Text
              style={{
                color: COLORS.muted,
                marginTop: 6,
                lineHeight: 20,
                textAlign: "center",
              }}
            >
              {heroSubcopy}
            </Text>
          </View>

          <View
            style={{
              flexDirection: isWide ? "row" : "column",
              gap: 14,
              alignItems: "stretch",
            }}
          >
            <View
              style={{
                flex: isWide ? 1.08 : undefined,
                minWidth: 0,
              }}
            >
              <View
                style={{
                  borderRadius: 24,
                  backgroundColor: COLORS.card,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {selectedImageUrl ? (
                  <View style={{ width: "100%" }} {...mainImagePan.panHandlers}>
                    <ImagenInteligente
                      uri={selectedImageUrl}
                      alt={p.title}
                      ancho={isWide ? 700 : 420}
                      // Carga rápida: la foto principal es la primera de la ficha (ya y con prioridad alta).
                      priority="high"
                      style={{
                        width: "100%",
                        height: isWide ? 520 : isTablet ? 360 : 260,
                        backgroundColor: "#F8FBFE",
                      }}
                      contentFit="contain"
                    />
                  </View>
                ) : (
                  <View
                    style={{
                      height: isWide ? 520 : isTablet ? 360 : 260,
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 22,
                      backgroundColor: COLORS.bg3,
                    }}
                  >
                    <Text
                      style={{
                        color: "rgba(11,33,56,0.15)",
                        fontWeight: "900",
                        fontSize: isMobile ? 46 : 56,
                      }}
                    >
                      VG
                    </Text>
                    <Text
                      style={{
                        color: COLORS.text,
                        fontWeight: "900",
                        marginTop: 10,
                        fontSize: isMobile ? 17 : 18,
                      }}
                    >
                      Imagen no disponible
                    </Text>
                    <Text
                      style={{
                        color: COLORS.muted,
                        marginTop: 6,
                        textAlign: "center",
                        lineHeight: 20,
                        maxWidth: 380,
                      }}
                    >
                      Este producto todavía no tiene una imagen disponible, pero puedes consultar
                      el resto de la información y escribirnos si necesitas más detalles.
                    </Text>
                  </View>
                )}

                {/* Con varias fotos: en qué foto se está y, en ordenador, flechas (en el móvil se desliza). */}
                {selectedImageUrl && imageGallery.length > 1 ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 12,
                      top: 12,
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      backgroundColor: "rgba(11,33,56,0.60)",
                    }}
                  >
                    <Text nativeID="galeria-posicion" style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>
                      {fotoActual + 1} / {imageGallery.length}
                    </Text>
                  </View>
                ) : null}

                {selectedImageUrl && imageGallery.length > 1 && !isMobile
                  ? ([-1, 1] as const).map((paso) => (
                      <Pressable
                        key={paso}
                        onPress={() => stepImage(paso)}
                        accessibilityRole="button"
                        accessibilityLabel={paso < 0 ? "Foto anterior" : "Foto siguiente"}
                        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                          position: "absolute",
                          top: "50%",
                          marginTop: -22,
                          [paso < 0 ? "left" : "right"]: 12,
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: hovered ? "rgba(11,33,56,0.72)" : "rgba(11,33,56,0.48)",
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Ionicons name={paso < 0 ? "chevron-back" : "chevron-forward"} size={22} color="#FFFFFF" />
                      </Pressable>
                    ))
                  : null}

                {shareFeedback ? (
                  <View
                    style={{
                      position: "absolute",
                      right: 12,
                      bottom: 52,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: "rgba(11,33,56,0.78)",
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>
                      {shareFeedback}
                    </Text>
                  </View>
                ) : null}

                <View
                  style={{
                    position: "absolute",
                    right: 4,
                    bottom: 4,
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  {/* Zona táctil de 44 × 44 (grupo 3, 2026-11-12); el círculo visible sigue siendo de 32. */}
                  <Pressable
                    onPress={shareProduct}
                    accessibilityRole="button"
                    accessibilityLabel="Compartir este producto"
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.85 : 1,
                      width: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(11,33,56,0.60)" }}>
                      <Ionicons name="share-social-outline" size={15} color="#FFFFFF" />
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={toggleLike}
                    disabled={likeBusy}
                    accessibilityRole="button"
                    accessibilityLabel={liked ? "Quitar me gusta" : "Dar me gusta"}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.85 : 1,
                      minWidth: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <View style={{ minWidth: 32, height: 32, borderRadius: 16, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "rgba(11,33,56,0.60)" }}>
                      <Ionicons
                        name={liked ? "heart" : "heart-outline"}
                        size={15}
                        color={liked ? "#FF5A7A" : "#FFFFFF"}
                      />
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: TAMANOS.minimo }}>
                        {likeCount}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              {imageGallery.length > 1 ? (
                <ScrollView
                  ref={miniaturasRef}
                  nativeID="galeria-miniaturas"
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  // Miniaturas de ancho fijo: el carrusel encaja en cada una (ancho + hueco de 10).
                  snapToInterval={pasoMiniatura}
                  decelerationRate="fast"
                  onLayout={(e) => {
                    setAnchoMiniaturas(e.nativeEvent.layout.width);
                    cargarMiniaturasHasta(e.nativeEvent.layout.width);
                  }}
                  onScroll={(e) => cargarMiniaturasHasta(e.nativeEvent.contentOffset.x + e.nativeEvent.layoutMeasurement.width)}
                  scrollEventThrottle={64}
                  contentContainerStyle={{
                    gap: 10,
                    paddingTop: 10,
                    flexGrow: 1,
                    justifyContent: "center",
                  }}
                >
                  {imageGallery.map((media, i) => {
                    const active = selectedImageUrl === media.publicUrl;

                    return (
                      <Pressable
                        key={media.id}
                        onPress={() => setSelectedImageUrl(media.publicUrl)}
                        accessibilityRole="button"
                        accessibilityLabel={`Ver la foto ${i + 1} de ${imageGallery.length}`}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.88 : 1,
                          width: ladoMiniatura,
                          height: ladoMiniatura,
                          borderRadius: 16,
                          overflow: "hidden",
                          borderWidth: 2,
                          borderColor: active ? COLORS.accent : "#E3EAF2",
                          backgroundColor: "#F6FAFD",
                        })}
                      >
                        {/* Carga diferida: solo las miniaturas que se ven (y unas pocas más) piden su foto. */}
                        {i < miniaturasCargadas ? (
                          <ImagenInteligente
                            uri={media.publicUrl}
                            alt={`${p.title} (miniatura ${i + 1})`}
                            ancho={90}
                            contentFit="cover"
                            style={{ width: "100%", height: "100%" }}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>

            <View
              style={{
                flex: isWide ? 0.92 : undefined,
                minWidth: 0,
                gap: 14,
              }}
            >
              <View
                style={{
                  paddingVertical: isMobile ? 4 : 8,
                  gap: 14,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 14,
                  }}
                >
                  {/* El estado («Segunda mano · … · unidad única») va ya debajo del título. */}
                  {viewCount !== null && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Ionicons name="eye-outline" size={14} color={COLORS.muted} />
                      <Text
                        style={{
                          color: COLORS.muted,
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        {viewCount} {viewCount === 1 ? "Visita" : "Visitas"}
                      </Text>
                    </View>
                  )}
                </View>

                <Text
                  style={{
                    color: COLORS.accent,
                    fontSize: isMobile ? 28 : 34,
                    fontWeight: "900",
                    lineHeight: isMobile ? 32 : 38,
                    textAlign: "center",
                  }}
                >
                  {formatearEuros(p.priceEUR)}
                </Text>

                {/* «Revisado por nuestro equipo» y la garantía: SOLO si el dueño lo ha marcado en este producto. */}
                <InsigniasConfianza revisado={p.revisado} garantiaMeses={p.garantiaMeses} />

                {/* Solo entrega en mano (dueño, 2026-11-07: los televisores sin su caja original no se envían). */}
                {p.soloEntregaMano ? (
                  <View nativeID="ficha-solo-mano" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                    <Ionicons name="hand-left-outline" size={16} color={COLORS.muted} />
                    <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 13.5, lineHeight: 19, textAlign: "center", flexShrink: 1 }}>
                      Solo entrega en mano en Zaragoza o Cuarte de Huerva: sin su caja original no se puede enviar.
                    </Text>
                  </View>
                ) : null}

                {/* Entrega estimada con los plazos de siempre (nunca garantizada). */}
                {conEntrega ? (
                  <EntregaEstimadaFicha
                    tipo={tipoEntrega}
                    cp={cpActivo}
                    origen={origenCp}
                    campoAbierto={campoCp}
                    onAbrirCampo={() => setCampoCp(true)}
                    cpEscrito={cpEscrito}
                    onCpEscrito={(v) => setCpEscrito(v.replace(/[^0-9]/g, "").slice(0, 5))}
                    onIrPerfil={() => pushRoute("/perfil" as Href)}
                  />
                ) : null}

                {reservadoPorOtro ? (
                  <Text
                    style={{
                      color: COLORS.muted,
                      fontWeight: "800",
                      fontSize: 13.5,
                      lineHeight: 19,
                      textAlign: "center",
                    }}
                  >
                    Otro cliente lo tiene en su cesta. Se reserva {RESERVA_MINUTOS} minutos:
                    vuelve a mirar en un rato.
                  </Text>
                ) : null}

                {reservadoSenalHasta ? (
                  <Text
                    nativeID="ficha-reservado-senal"
                    style={{ color: COLORES_TEXTO.secundario, fontWeight: "800", fontSize: TAMANOS.minimo + 0.5, lineHeight: 19, textAlign: "center" }}
                  >
                    {/* Sin «señal»: también sale con las reservas apagadas (un artículo ya reservado no se ofrece). */}
                    Este artículo está reservado hasta el {fechaReserva(reservadoSenalHasta)}.
                  </Text>
                ) : null}

                <View style={{ gap: 10, width: "100%", maxWidth: 460 }}>
                  {/* Acción principal: una sola, clara. La secundaria, con contorno. */}
                  <Pressable
                    nativeID="ficha-comprar-ya"
                    onPress={() => addToCart("buyNow")}
                    disabled={!canBuy || cartBusy}
                    accessibilityRole="button"
                    accessibilityLabel={`Comprar ya ${p.title}`}
                    style={({ pressed }) => ({
                      opacity: !canBuy ? 0.45 : pressed ? 0.9 : 1,
                      borderRadius: 999,
                      minHeight: 52,
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: COLORS.accentDark,
                    })}
                  >
                    {cartBusy ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>Comprar ya</Text>
                    )}
                  </Pressable>

                  <Pressable
                    nativeID="ficha-anadir-cesta"
                    onPress={() => addToCart("cart")}
                    disabled={!canBuy || cartBusy}
                    accessibilityRole="button"
                    accessibilityLabel={`Añadir ${p.title} a la cesta`}
                    style={({ pressed }) => ({
                      opacity: !canBuy ? 0.45 : pressed ? 0.9 : 1,
                      borderRadius: 999,
                      minHeight: 48,
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: 1.5,
                      borderColor: COLORS.accent,
                      backgroundColor: "#FFFFFF",
                    })}
                  >
                    <Text style={{ color: COLORS.accentDark, fontWeight: "900", fontSize: 15 }}>
                      Añadir a la cesta
                    </Text>
                  </Pressable>

                  {/* Reservar con señal (mejora 14): SOLO si la tienda la ha activado con sus reglas; apagada, nada. */}
                  {p.status === "PUBLICADA" && p.isActive && !reservadoPorOtro && !reservadoSenalHasta && ajustesReserva && reservaDisponible(ajustesReserva) ? (
                    <ReservarConSenal producto={{ id: p.id, titulo: p.title, precio: p.priceEUR }} ajustes={ajustesReserva} cancelada={params.reserva === "cancelada"} />
                  ) : null}

                  {/* Dudas (mejora 10): el chat de la tienda con este artículo adjunto; sin cuenta, invita a crearla. */}
                  <PreguntarArticulo productId={p.id} abrirAlEntrar={params.chat === "1"} />

                  {/* «Avísame si baja de precio» (solo con cuenta): en lo que se puede comprar. */}
                  {p.status === "PUBLICADA" && p.isActive ? <AvisoPrecioFicha productId={p.id} precio={p.priceEUR} /> : null}

                  {/* «Comparar con otros productos» (mejora 8): hasta 3, en este dispositivo; la barra de abajo lleva a /comparar. */}
                  {p.status === "PUBLICADA" && p.isActive ? (
                    <BotonComparar producto={{ id: p.id, titulo: p.title, precio: p.priceEUR, imagen: p.imageUrl }} origen="ficha" variante="ficha" />
                  ) : null}

                  {/* «Completa tu compra» (mejora 6): solo en consolas, como mucho 3 mandos o accesorios de su familia. */}
                  {p.status === "PUBLICADA" && p.isActive ? <CompletaTuCompra bases={[p.id]} origen="ficha" /> : null}
                </View>

                {/* Ficha técnica y mantenimiento de VeoAura y descripción: con más de una, un carrusel que se desliza
                    (y pasa solo cada 10 s); con solo la descripción, sin carrusel. */}
                <FichaProducto key={p.id} caracteristicas={p.caracteristicas} mantenimiento={p.mantenimiento} descripcion={p.description} />
              </View>
              {/* Las garantías y promesas las escribe la tienda en la descripción de cada producto; las insignias de
                  arriba solo salen si el dueño las marca en ese producto (nunca fijas para todos). */}
            </View>
          </View>

          {/* «Productos parecidos» (mejora 6): misma categoría y precio parecido; sin ninguno, no sale. */}
          <View style={{ width: "100%", paddingTop: isMobile ? 18 : 28 }}>
            <ProductosParecidos producto={{ id: p.id, categoriaId: p.category?.id ?? null, precio: p.priceEUR }} isMobile={isMobile} />
          </View>

          {/* Último botón: limpio y claro, vuelve a donde estaba (o al catálogo). */}
          <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 8 }}>
            <Pressable
              onPress={smartBack}
              accessibilityRole="button"
              accessibilityLabel="Volver atrás"
              style={({ pressed }) => ({
                width: "100%",
                maxWidth: 320,
                minHeight: 52,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: COLORS.accent,
                backgroundColor: "#FFFFFF",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
              <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 16 }}>Volver atrás</Text>
            </Pressable>
          </View>
          {/* Hueco de la barra de «Comparar» (si se ve): el final de la ficha no queda debajo de ella. */}
          {alturaBarraComparar ? <View style={{ height: alturaBarraComparar }} /> : null}
          </View>
        </ScrollView>
      )}

      <VisorFotos
        visible={lightboxOpen}
        images={lightboxImages}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
        onEvento={eventoVisor}
      />
    </View>
  );
}

// --- Reservar con señal (mejora 14, aprobada por el dueño el 2026-11-15) ---------------------------------------------
// Solo sale si GET /api/pago?reserva=ajustes dice que está activa y completa (reglas del dueño y texto revisado por su
// gestor). La hoja enseña los días (hasta dias_max), el porcentaje y la señal de la escala, el vencimiento, el tipo de
// arras explicado, qué pasa al vencer y las condiciones completas, con la casilla OBLIGATORIA. «Pagar señal» solo manda el
// artículo y los días: el importe lo calcula el servidor con la base de datos. Solo con cuenta (sin cuenta, invita).
function ReservarConSenal({
  producto,
  ajustes,
  cancelada,
}: {
  producto: { id: string; titulo: string; precio: number };
  ajustes: AjustesReservaPublicos;
  cancelada: boolean;
}) {
  const escala = useMemo(() => ajustes.escala ?? [], [ajustes.escala]);
  const diasMax = Number(ajustes.dias_max ?? 0);
  const tipo = ajustes.tipo_arras ?? "penitenciales";
  const [abierto, setAbierto] = useState(false);
  const [conSesion, setConSesion] = useState<boolean | null>(null);
  const [invitacion, setInvitacion] = useState(false);
  const [dias, setDias] = useState(() => Math.max(1, Math.min(escala[0]?.hasta_dias ?? 1, diasMax || 1)));
  const [acepta, setAcepta] = useState(false);
  const [verCondiciones, setVerCondiciones] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(cancelada ? "Has cancelado el pago de la señal: el artículo no se ha reservado." : null);
  const { width } = useWindowDimensions();

  useEffect(() => {
    let vivo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => vivo && setConSesion(!!data.session?.user))
      .catch(() => vivo && setConSesion(false));
    return () => {
      vivo = false;
    };
  }, []);

  const porcentaje = porcentajeReserva(escala, dias);
  const senal = porcentaje ? senalReserva(producto.precio, porcentaje) : 0;
  const vence = Date.now() + dias * 86_400_000;
  const arras = EXPLICACION_ARRAS[tipo];
  // Las marcas ({porcentaje}, {dias}…) rellenadas con lo elegido: lo mismo que guardará el servidor.
  const datosTexto = { porcentaje: porcentaje ?? 0, dias, vence, senal_eur: senal, precio_eur: producto.precio };
  const condiciones = rellenarCondicionesReserva(ajustes.texto_condiciones ?? "", datosTexto);
  const alVencer = rellenarCondicionesReserva(ajustes.al_vencer ?? "", datosTexto);

  const abrir = useCallback(() => {
    if (conSesion === false) {
      setInvitacion((v) => !v);
      return;
    }
    setAbierto(true);
    void medirEvento("reserva_abierta", "Ficha: reservar con señal", { path: `/producto/${producto.id}`, metadata: { productId: producto.id } });
  }, [conSesion, producto.id]);

  const crearCuenta = useCallback(() => {
    marcarOrigenRegistro("reserva_senal");
    AsyncStorage.setItem(VOLVER_TRAS_ACCESO_FICHA_KEY, JSON.stringify({ ruta: `/producto/${producto.id}`, hasta: Date.now() + 30 * 60_000 })).catch(() => {});
    pushRoute("/perfil?acceso=registro" as Href);
  }, [producto.id]);

  const pagar = useCallback(async () => {
    if (!acepta || enviando || !porcentaje) return;
    setEnviando(true);
    setError(null);
    void medirEvento("reserva_pagar", "Ficha: pagar la señal", { path: `/producto/${producto.id}`, metadata: { dias, porcentaje } });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Inicia sesión para reservar.");
        return;
      }
      // Solo el artículo, los días y que acepta: el importe lo calcula el servidor.
      const r = await fetch(URL_PAGO, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accion: "reserva", producto: producto.id, dias, acepta: true }),
      });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (r.ok && d?.url && /^https:\/\/checkout\.stripe\.com\//.test(d.url)) {
        if (Platform.OS === "web" && typeof window !== "undefined") window.location.assign(d.url);
        else await Linking.openURL(d.url);
        return;
      }
      const motivo = d?.error ? `${d.error.charAt(0).toUpperCase()}${d.error.slice(1)}.` : "No se ha podido abrir el pago. Inténtalo de nuevo.";
      setError(motivo);
    } catch {
      setError("No se ha podido abrir el pago: revisa tu conexión.");
    } finally {
      setEnviando(false);
    }
  }, [acepta, enviando, porcentaje, producto.id, dias]);

  const boton = (props: { id: string; texto: string; onPress: () => void; disabled?: boolean; icono: React.ComponentProps<typeof Ionicons>["name"] }) => (
    <Pressable
      nativeID={props.id}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.texto}
      style={({ pressed }) => ({
        width: TACTIL.minimo,
        height: TACTIL.minimo,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: props.disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={props.icono} size={20} color={COLORS.text} />
    </Pressable>
  );

  return (
    <View nativeID="ficha-reserva-senal" style={{ gap: 8, alignItems: "stretch" }}>
      <Pressable
        nativeID="ficha-reservar-senal"
        onPress={abrir}
        accessibilityRole="button"
        accessibilityLabel={`Reservar con señal ${producto.titulo}`}
        style={({ pressed }) => ({
          minHeight: TACTIL.minimo,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: "#FFFFFF",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="calendar-outline" size={16} color={COLORS.text} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5 }}>Reservar con señal</Text>
      </Pressable>
      {error && !abierto ? (
        <Text nativeID="ficha-reserva-aviso" style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
          {error}
        </Text>
      ) : null}
      {conSesion === false && invitacion ? (
        <View nativeID="ficha-reserva-invitacion" style={{ alignItems: "center", gap: 8 }}>
          <Text style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center" }}>
            Las reservas con señal son solo con cuenta: créala gratis y podrás apartar este artículo y seguir tu reserva en Mis pedidos.
          </Text>
          <Pressable
            nativeID="ficha-reserva-crear-cuenta"
            onPress={crearCuenta}
            accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: COLORS.accentDark, opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Crear cuenta gratis</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.45)", justifyContent: width >= 700 ? "center" : "flex-end", alignItems: "center" }}>
          <View
            nativeID="reserva-hoja"
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "92%",
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderBottomLeftRadius: width >= 700 ? 22 : 0,
              borderBottomRightRadius: width >= 700 ? 22 : 0,
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: 18 }}>Reservar con señal</Text>
                <Pressable
                  nativeID="reserva-cerrar"
                  onPress={() => setAbierto(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  style={({ pressed }) => ({ width: TACTIL.minimo, height: TACTIL.minimo, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
                >
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </Pressable>
              </View>
              <Text style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo + 0.5, lineHeight: 19 }} numberOfLines={2}>
                {producto.titulo} · {eurosReserva(producto.precio)}
              </Text>

              <View style={{ gap: 6 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 14 }}>¿Cuántos días quieres reservarlo?</Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 }}>
                  {boton({ id: "reserva-dias-menos", texto: "Un día menos", icono: "remove", onPress: () => setDias((d) => Math.max(1, d - 1)), disabled: dias <= 1 })}
                  <Text nativeID="reserva-dias-valor" style={{ minWidth: 96, textAlign: "center", color: COLORS.text, fontWeight: "900", fontSize: 18 }}>
                    {dias} {dias === 1 ? "día" : "días"}
                  </Text>
                  {boton({ id: "reserva-dias-mas", texto: "Un día más", icono: "add", onPress: () => setDias((d) => Math.min(diasMax, d + 1)), disabled: dias >= diasMax })}
                </View>
                <Text style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, textAlign: "center" }}>Como mucho {diasMax} días.</Text>
              </View>

              <View nativeID="reserva-calculo" style={{ borderRadius: 16, backgroundColor: COLORS.card, padding: 12, gap: 4 }}>
                <Text nativeID="reserva-senal" style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                  {porcentaje ? `Señal: ${porcentaje} % · ${eurosReserva(senal)}` : "Elige los días"}
                </Text>
                <Text nativeID="reserva-vence" style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo + 0.5, lineHeight: 19, textAlign: "center" }}>
                  Vence el {fechaReserva(vence)} si pagas hoy.
                </Text>
                {porcentaje ? (
                  <Text style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
                    El resto ({eurosReserva(Math.round((producto.precio - senal) * 100) / 100)}) se paga al completar la compra.
                  </Text>
                ) : null}
              </View>

              <View nativeID="reserva-arras" style={{ gap: 4 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 14 }}>{arras.titulo}</Text>
                <Text style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo + 0.5, lineHeight: 20 }}>{arras.texto}</Text>
              </View>
              <View nativeID="reserva-al-vencer" style={{ gap: 4 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 14 }}>Qué pasa al vencer</Text>
                <Text style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo + 0.5, lineHeight: 20 }}>{alVencer}</Text>
              </View>

              <Pressable
                nativeID="reserva-condiciones-ver"
                onPress={() => setVerCondiciones((v) => !v)}
                accessibilityRole="button"
                style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: colorTextoAzul(14), fontWeight: "800", fontSize: 14 }}>
                  {verCondiciones ? "Ocultar las condiciones completas" : "Leer las condiciones completas"}
                </Text>
              </Pressable>
              {verCondiciones ? (
                <Text nativeID="reserva-condiciones-texto" style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo + 0.5, lineHeight: 20 }}>
                  {condiciones}
                </Text>
              ) : null}

              <Pressable
                nativeID="reserva-acepta"
                onPress={() => setAcepta((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acepta }}
                aria-checked={acepta}
                style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.8 : 1 })}
              >
                <Ionicons name={acepta ? "checkbox" : "square-outline"} size={24} color={acepta ? COLORS.accent : COLORS.text} />
                <Text style={{ flex: 1, color: COLORS.text, fontWeight: "700", fontSize: 14, lineHeight: 20 }}>
                  He leído y acepto las condiciones de la reserva
                </Text>
              </Pressable>

              {error ? (
                <Text nativeID="reserva-error" style={{ color: "#B91C1C", fontWeight: "800", fontSize: 14, lineHeight: 20, textAlign: "center" }}>
                  {error}
                </Text>
              ) : null}

              <Pressable
                nativeID="reserva-pagar"
                onPress={pagar}
                disabled={!acepta || enviando || !porcentaje}
                accessibilityRole="button"
                accessibilityState={{ disabled: !acepta || enviando || !porcentaje }}
                style={({ pressed }) => ({
                  minHeight: 52,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: COLORS.accentDark,
                  opacity: !acepta || !porcentaje ? 0.45 : pressed || enviando ? 0.85 : 1,
                })}
              >
                {enviando ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>{porcentaje ? `Pagar señal · ${eurosReserva(senal)}` : "Pagar señal"}</Text>
                )}
              </Pressable>
              <Text style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
                Se paga en la página segura de Stripe. Podrás seguir tu reserva en Mis pedidos.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
