/**
 * Archivo: app/admin/services.tsx
 * Función: pantalla de administración de servicios, en la dirección /admin/services.
 * Para qué sirve: el administrador gestiona el catálogo de servicios (reparación, limpieza, mantenimiento: opciones, precios, fotos) y las solicitudes de «Contratar servicio ahora», incluida la reparación por envío.
 * Conectado con: components/admin/servicios/* (PiezasServicios, VideosServicios, EnvioReparaciones y CobroReparaciones, separados en la tanda 6), lib/supabase.ts (tablas services, service_media y service_requests), lib/envio.ts, lib/abrirEnlaceExterno.ts, components/ContratarServicioModal.tsx, VisorFotos.tsx, ImagenInteligente.tsx, marca/CargaMarca.tsx, app/servicios.tsx (enlaceVideo, esEnlaceCorto), lib/admin/productos.*, constants/temaTienda.ts, components/admin/PiezasPanelAdmin.tsx.
 * Utilizado por: Expo Router (dirección /admin/services, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Servicios» de app/admin/index.tsx.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: panel de administración del catálogo de SERVICIOS (reparación,
 * limpieza, mantenimiento...) — la contraparte de app/admin/products.tsx
 * pero para servicios en vez de productos, y de app/admin/cotizaciones.tsx
 * pero para las solicitudes de "Contratar servicio ahora" en vez de "Vender
 * ahora". Dos pestañas en una sola pantalla:
 * - "Catálogo": crear, editar, publicar/despublicar, ocultar y borrar
 *   servicios (título, descripción, precio y fotos).
 * - "Solicitudes": las peticiones que envían los clientes desde
 *   components/ContratarServicioModal.tsx en la ficha de cada servicio.
 *
 * Cómo funciona:
 * - Tabla "services" (ver sql/services.sql) + "service_media" (ver
 *   sql/service_media.sql, fotos en el mismo bucket público "product-media"
 *   que ya usan los productos — no hace falta un bucket nuevo). Reutiliza el
 *   selector/subida de imágenes de lib/admin/productos.utilidades.ts
 *   (pickMediaFilesWeb, buildMediaPath) — mismo mecanismo, solo que aquí
 *   solo se admiten fotos (no vídeo, un servicio no lo necesita).
 * - Tabla "service_requests" (ver sql/service_requests.sql): mismo flujo de
 *   estados que sell_requests (nuevo → revisado → contactado, o descartado
 *   en cualquier momento), con botones en vez de desplegable.
 * - Un servicio se ve en la tienda (app/servicios.tsx, app/servicio/[id].tsx)
 *   solo si status='PUBLISHED' y is_active=true, igual que un producto.
 * - Tema claro (fondo blanco, texto azul marino, acentos azul claro) con
 *   contenido centrado en pantallas anchas (columnStyle, maxWidth 1160).
 * - Scroll: cabecera fija y compacta (volver + título centrado) y, debajo,
 *   pestañas y contenido de la pestaña activa en un único ScrollView (flex 1,
 *   margen final con hueco para el «+» flotante + zona segura). El modal de
 *   alta/edición se desplaza entero y, en iOS, deja sitio al teclado.
 * - Dueño, 2026-11-03: pestañas con subrayado (PestanasPanel) y, deslizando
 *   el dedo sobre el contenido, se pasa a la otra en bucle (useGestoPestanas);
 *   en «Catálogo» el buscador va arriba (como en Productos), los cuatro
 *   contadores en una fila también en el móvil, «Nuevo servicio» es el «+»
 *   flotante abajo a la derecha, los servicios y las solicitudes van sin
 *   recuadro alrededor (separados por una línea) y al tocar la foto de un
 *   servicio se abre en grande con zoom (components/VisorFotos.tsx).
 *
 * Rendimiento: uploadNewPhotos() sube las fotos a Storage una a una (no se
 * puede agrupar) pero guarda sus filas en "service_media" con un único
 * INSERT agrupado al final, en vez de uno por foto; syncCover() agrupa igual
 * sus cambios en un solo .upsert(). Mismo patrón ya usado en
 * admin/products.tsx (ver normalizeMediaForProduct allí).
 *
 * Conectado con:
 * - sql/services.sql, sql/service_media.sql, sql/service_requests.sql →
 *   tablas y políticas RLS que usa esta pantalla.
 * - lib/admin/productos.utilidades.ts, productos.constantes.ts → selector
 *   y subida de fotos, formateo de precio/texto (reutilizados, no duplicados).
 * - lib/admin/productos.componentes.tsx → CabeceraPanel, TarjetaCifraPanel,
 *   BotonPrincipalPanel, AvisoPanel y EstadoVacioPanel (mismo diseño en todo el panel).
 * - app/servicios.tsx, app/servicio/[id].tsx → lo que ve el público.
 * - components/ContratarServicioModal.tsx → origen de cada fila de
 *   service_requests.
 * - Reparación por envío (dueño, 2026-11-11; migración 20261111100000): en «Solicitudes», el bloque
 *   plegable «Reparación por envío» (AjustesEnvioPanel: activarla, dirección del taller, peso por
 *   aparato, custodia, Bizum, IBAN, titular y plazo; no se activa si falta algo y lo dice), el filtro
 *   «Entrega» y, en cada solicitud (PanelEnvioSolicitud), aparatos, coste de la etiqueta, «Marcar
 *   etiqueta pagada», «Subir etiqueta» y «Subir fotos de recepción» (almacén privado «reparaciones»),
 *   presupuesto y si el cliente lo aceptó, y «Esperando pieza hasta». lib/envio.ts lee los ajustes.
 * - Reparación por envío, parte 2 (dueño, 2026-11-11; migración 20261111130000; sin ella, todo como antes):
 *   en la ficha de cada servicio, «Peso para el envío (kg, con su caja)» con la marca «estimado» hasta
 *   que el dueño lo guarde; en los ajustes, «Peso por defecto (si el servicio no tiene el suyo)», la
 *   garantía en meses y el aviso de que Bizum, IBAN y titular se enseñan al cliente; en cada solicitud,
 *   «Marcar etiqueta pagada» y «Marcar reparación/vuelta pagada» con forma y fecha (el importe lo pone
 *   la base de datos), los avisos «ya lo he pagado» del cliente, el diagnóstico («Sin arreglo» y «Te lo
 *   compramos por»), qué eligió el cliente, «Marcar enviada» con el nº de Correos de la vuelta y la
 *   marca «Garantía»; el filtro «Cobro y garantía» y su resumen con cuántas hay de cada.
 *   Bizum de Stripe (dueño, 2026-11-11; migración 20261111150000): lo pagado online dice con qué de verdad
 *   («por Bizum online», «por tarjeta online», «por Klarna online»; lo dice Stripe, pago_metodo y
 *   etiqueta_pago_metodo); sin esas columnas, «por tarjeta» como antes. El recuento está en Analítica.
 * - DISEÑO (2026-11-16, el de Usuarios y Pedidos; piezas de components/admin/PiezasPanelAdmin.tsx):
 *   · Catálogo: buscador de 16 px, las 4 cifras (Servicios, Publicados, Visibles y Visitas; tocarlas filtra),
 *     pastillas con su recuento (Todos, Publicados, Borradores, Ocultos) y filas compactas con la etiqueta de
 *     color del estado (Publicado, Borrador, Por revisar, Oculto); el lápiz y la papelera siguen en cada fila.
 *   · Solicitudes: los ajustes de la reparación por envío (plegados), el buscador (nombre, nº VZ-…, servicio,
 *     contacto o ciudad), cifras que filtran (Abiertas, En el taller, Listas, Por envío, Por cobrar, Dicen que
 *     pagaron y Garantías abiertas, según las migraciones aplicadas), pastillas por estado con su recuento y
 *     «Más filtros» (Opción, Recogida, Entrega, Contacto y Cobro y garantía). Cada solicitud es una fila compacta
 *     (cliente, etiqueta de su estado, servicio y fecha, etapa, por envío o recogida, nº VZ-…, cobro, garantía e
 *     importe); al tocarla se despliega por bloques: Cliente · Aparato y servicio · Pasos para el cliente ·
 *     Envío, presupuesto y pago (etiqueta de Correos, fotos de recepción, diagnóstico, cobros y vuelta) y, abajo,
 *     las acciones («Escribir al cliente» por WhatsApp si dejó teléfono, «Pasar a» otro estado y borrar).
 *     «Abrir todas» las despliega. Abajo, «Más datos de las solicitudes» (cobros y números de seguimiento).
 *   Prueba PANRED1 (y P, CS, RS, SV, VP, AF, RE2, RE3, TM4, CAMPOS16).
 * - Tamaños del móvil (grupo 4, 2026-11-12; constants/temaTienda.ts): ningún texto de menos de 13 px (12 solo en
 *   la insignia «Portada/Usar» de las fotos), grises desde COLORES_TEXTO.secundario, texto azul pequeño en
 *   azulTexto y botones, filtros y volver de 44 px como mínimo (los contadores salen de StatCard).
 * - app/admin/index.tsx → origen habitual de la navegación a esta pantalla.
 * - app/admin/_layout.tsx → registra esta ruta ("services") dentro del
 *   Stack protegido del panel admin.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import ImagenInteligente from "../../components/ImagenInteligente";
import VisorFotos, { type FotoVisor } from "../../components/VisorFotos";
import { leerModalidades, type ModalidadServicio } from "../../components/ContratarServicioModal";
import { cargarAjustesReparacionEnvio } from "../../lib/envio";
import CargaMarca from "../../components/marca/CargaMarca";
import { abrirEnlaceExterno } from "../../lib/abrirEnlaceExterno";
import { Bloque, Buscador, Chip, Cifra, Dato, Detalle, Etiqueta, EtiquetaColor, FilaPastillas, ListaVacia, RecuentoLista, Seccion, useDesplegables } from "../../components/admin/PiezasPanelAdmin";
import { TACTIL, TAMANOS } from "../../constants/temaTienda";
import {
  CabeceraPanel,
  AvisoPanel,
  BarraSeleccionFotos,
  BotonFlotante,
  EstadoVacioPanel,
  BotonIconoPanel,
  MarcaSeleccion,
  PestanasPanel,
  PieVentana,
  BotonPrincipalPanel,
  SelectorIOS,
  useGestoPestanas,
  useSeleccionFotos,
} from "../../lib/admin/productos.componentes";
import { ERRORES_PANEL, MAX_FOTOS_PRODUCTO, CUBO_ARCHIVOS_PRODUCTO } from "../../lib/admin/productos.constantes";
import type { ArchivoElegidoLocal } from "../../lib/admin/productos.tipos";
import {
  CIERRE_TECLADO,
  rutaDeArchivo,
  contarEmojis,
  formatearEurosPanel,
  elegirFotosVideoWeb,
  precioSeguro,
} from "../../lib/admin/productos.utilidades";
import { COLORS, COLUMNAS_ENVIO, COLUMNAS_ENVIO_2, COLUMNAS_METODO, ChipButton, DISPONIBILIDAD_LABEL, ETAPAS_TALLER, FiltroCatalogo, IoniconName, METODO_LABEL, MetodoContacto, NOTA_ASIGNADO_CHAT, ORDEN_PESTANAS, PESTANAS_SERVICIOS, REQUEST_STATUS_LABEL, REQUEST_STATUS_PLURAL, REQUEST_STATUS_TONO, RequestStatus, SEGUIMIENTO_LABEL, STATUS_LABEL, ServiceMediaRow, ServiceRequestRow, ServiceRow, ServiceStatus, TextField, VistaSol, columnStyle, coverUrl, faltaEsquema, formatDate, fotosDelServicio, modalColumnStyle } from "../../components/admin/servicios/PiezasServicios";
import { EditorVideosServicios } from "../../components/admin/servicios/VideosServicios";
import { PanelEnvioSolicitud } from "../../components/admin/servicios/CobroReparaciones";
import { AjustesEnvioPanel, RequestSeguimiento } from "../../components/admin/servicios/EnvioReparaciones";

// Sin la migración de la reparación por envío, se pregunta una vez y se recuerda (no se repite el error en cada carga).
let sinColumnasEnvio = false;

// --- Pantalla principal ---------------------------------------------------

export default function AdminServices() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 760;
  const pagePadding = 16;
  const sectionGap = 16;
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"catalogo" | "solicitudes">("catalogo");
  // Deslizar el dedo sobre el contenido cambia de pestaña, en bucle (dueño, 2026-11-03).
  const gesto = useGestoPestanas(ORDEN_PESTANAS, tab, (t) => setTab(t));
  // Visor de fotos a pantalla completa con zoom al tocar la foto de un servicio (dueño, 2026-11-03).
  const [visor, setVisor] = useState<{ fotos: FotoVisor[]; inicio: number } | null>(null);

  // --- Catálogo ---
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [search, setSearch] = useState("");
  // false = falta la columna services.modalidades (migración 20261108230000 sin aplicar): no se enseña el editor.
  const [opcionesOk, setOpcionesOk] = useState(false);
  // false = aún no hay peso por servicio (migración 20261111130000): no se enseña el campo.
  const [pesosOk, setPesosOk] = useState(false);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      // Con los «me gusta» si la base de datos ya los tiene; si no (columna que falta), sin ellos.
      const columnas = "id,title,description,price_eur,status,is_active,view_count,created_at,updated_at";
      const leer = (cols: string) => supabase.from("services").select(cols).order("created_at", { ascending: false });
      const faltaCol = (e: any) => !!e && (e.code === "42703" || e.code === "PGRST204" || /like_count|modalidades/.test(e.message ?? ""));
      // Con las opciones y los «me gusta» si la base de datos ya los tiene; si no, sin ellos.
      let { data: rows, error } = await leer(`${columnas},like_count,modalidades`);
      setOpcionesOk(!error);
      if (faltaCol(error)) ({ data: rows, error } = await leer(`${columnas},like_count`));
      if (faltaCol(error)) ({ data: rows, error } = await leer(columnas));
      if (error) throw error;

      const ids = (rows ?? []).map((r: any) => r.id);
      let mediaByService: Record<string, ServiceMediaRow[]> = {};
      if (ids.length) {
        const { data: media } = await supabase
          .from("service_media")
          .select("id,service_id,storage_path,public_url,file_name,sort_order,is_cover")
          .in("service_id", ids)
          .order("is_cover", { ascending: false })
          .order("sort_order", { ascending: true });
        for (const m of (media ?? []) as ServiceMediaRow[]) {
          (mediaByService[m.service_id] ??= []).push(m);
        }
      }

      // Pesos para el envío (parte 2): solo si la base de datos ya los tiene (los ajustes traen garantia_meses).
      const pesos: Record<string, { kg: number | null; estimado: boolean }> = {};
      const conPesos = !!(await cargarAjustesReparacionEnvio())?.parte2;
      setPesosOk(conPesos);
      if (conPesos && ids.length) {
        const { data: filasPeso, error: errPeso } = await supabase.from("services").select("id,envio_peso_kg,envio_peso_estimado").in("id", ids);
        if (errPeso) setPesosOk(false);
        for (const f of (filasPeso ?? []) as { id: string; envio_peso_kg: number | string | null; envio_peso_estimado: boolean | null }[]) {
          pesos[f.id] = { kg: f.envio_peso_kg == null ? null : Number(f.envio_peso_kg), estimado: f.envio_peso_estimado === true };
        }
      }

      setServices(
        (rows ?? []).map((r: any) => ({
          ...r,
          modalidades: "modalidades" in r ? leerModalidades(r.modalidades) : undefined,
          ...(pesos[r.id] ? { envio_peso_kg: pesos[r.id].kg, envio_peso_estimado: pesos[r.id].estimado } : null),
          media: mediaByService[r.id] ?? [],
        }))
      );
    } catch (e) {
      console.error("Error cargando servicios:", e);
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Pastilla o cifra elegida del catálogo (con algo escrito en el buscador, busca en todos).
  const [filtroCatalogo, setFiltroCatalogo] = useState<FiltroCatalogo>("todos");
  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return services.filter((s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    if (filtroCatalogo === "publicados") return services.filter((s) => s.status === "PUBLISHED");
    if (filtroCatalogo === "visibles") return services.filter((s) => s.status === "PUBLISHED" && s.is_active);
    if (filtroCatalogo === "borradores") return services.filter((s) => s.status !== "PUBLISHED");
    if (filtroCatalogo === "ocultos") return services.filter((s) => !s.is_active);
    return services;
  }, [services, search, filtroCatalogo]);

  const stats = useMemo(() => {
    const total = services.length;
    const published = services.filter((s) => s.status === "PUBLISHED").length;
    const visible = services.filter((s) => s.status === "PUBLISHED" && s.is_active).length;
    const views = services.reduce((sum, s) => sum + (s.view_count ?? 0), 0);
    const borradores = services.filter((s) => s.status !== "PUBLISHED").length;
    const ocultos = services.filter((s) => !s.is_active).length;
    return { total, published, visible, views, borradores, ocultos };
  }, [services]);
  // Las 4 cifras del catálogo en una fila (de 2 en 2 en los móviles más estrechos, para que nada se corte).
  const anchoCifra4 = widthSafe < 380 ? "45%" : 0;

  // --- Modal crear/editar ---
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<ServiceStatus>("DRAFT");
  const [isActive, setIsActive] = useState(true);
  const [existingMedia, setExistingMedia] = useState<ServiceMediaRow[]>([]);
  const [removedMedia, setRemovedMedia] = useState<ServiceMediaRow[]>([]);
  const [newMedia, setNewMedia] = useState<ArchivoElegidoLocal[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  // Opciones del servicio en el formulario (precio como texto, con coma: «77,97»).
  // foto: la dirección de una foto ya guardada del servicio o `nueva:<id>` de una que se sube al guardar (dueño,
  // 2026-11-09: «al elegir una opción, la foto de la ficha cambia a la de esa opción»).
  const [opciones, setOpciones] = useState<{ nombre: string; precio: string; foto: string | null }[]>([]);
  // La opción a la que se le está eligiendo foto (se abre debajo de su fila).
  const [fotoOpcionAbierta, setFotoOpcionAbierta] = useState<number | null>(null);
  // Peso para el envío (parte 2): texto con coma, si es el estimado y si el dueño lo ha tocado (o dado por bueno).
  const [pesoEnvio, setPesoEnvio] = useState("");
  const [pesoEstimado, setPesoEstimado] = useState(false);
  const [pesoTocado, setPesoTocado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  // Precio guardado sin céntimos porque la base de datos aún no los admite (ver save()).
  const [avisoPrecio, setAvisoPrecio] = useState<string | null>(null);
  // «Seleccionar varias» fotos para quitarlas a la vez (dueño, 2026-11-04).
  const seleccion = useSeleccionFotos();
  const [picking, setPicking] = useState(false);

  function openCreate() {
    seleccion.terminar();
    setEditing(null);
    setTitle("");
    setDesc("");
    setPrice("");
    setStatus("DRAFT");
    setIsActive(true);
    setExistingMedia([]);
    setRemovedMedia([]);
    setNewMedia([]);
    setCoverId(null);
    setOpciones([]);
    setFotoOpcionAbierta(null);
    setPesoEnvio("");
    setPesoEstimado(false);
    setPesoTocado(false);
    setModalErr(null);
    setModalOpen(true);
  }

  function openEdit(s: ServiceRow) {
    seleccion.terminar();
    setEditing(s);
    setTitle(s.title);
    setDesc(s.description);
    // Con coma para los céntimos, como se escribe en España (45,50).
    setPrice(String(s.price_eur ?? 0).replace(".", ","));
    setStatus(s.status);
    setIsActive(s.is_active);
    setExistingMedia(s.media);
    setRemovedMedia([]);
    setNewMedia([]);
    setCoverId(s.media.find((m) => m.is_cover)?.id ?? s.media[0]?.id ?? null);
    setOpciones(
      (s.modalidades ?? []).map((m) => ({ nombre: m.nombre, precio: String(m.precio_eur).replace(".", ","), foto: m.foto ?? null }))
    );
    setFotoOpcionAbierta(null);
    setPesoEnvio(s.envio_peso_kg != null ? String(s.envio_peso_kg).replace(".", ",") : "");
    setPesoEstimado(s.envio_peso_estimado === true);
    setPesoTocado(false);
    setModalErr(null);
    setModalOpen(true);
  }

  function closeModal() {
    newMedia.forEach((m) => {
      try {
        URL.revokeObjectURL(m.previewUrl);
      } catch {
        // ignore
      }
    });
    setModalOpen(false);
  }

  // Devuelve las fotos añadidas (la opción que pidió «Subir foto» se queda con la primera).
  async function pickPhotos(): Promise<{ id: string }[]> {
    setModalErr(null);
    setPicking(true);
    try {
      // pickMediaFilesWeb() ya no aborta la selección entera si UN archivo
      // falla (formato raro, HEIC que no se pudo convertir...): las fotos
      // válidas se añaden igual y las que fallan quedan en "skipped". Antes
      // esto era "todo o nada" — elegías 15 fotos, una daba problemas, y no
      // se añadía NINGUNA sin ningún aviso.
      const { items: picked, skipped } = await elegirFotosVideoWeb();
      const images = picked.filter((m) => m.kind === "image");
      const nonImages = picked.filter((m) => m.kind !== "image");

      // Los vídeos no se usan en Servicios: se descartan (revocando su
      // URL local) en vez de dejarlos huérfanos en memoria.
      nonImages.forEach((m) => {
        try {
          URL.revokeObjectURL(m.previewUrl);
        } catch {
          // ignore
        }
      });

      const totalAfter = existingMedia.length + newMedia.length + images.length;
      const skippedNote = skipped.length
        ? `${skipped.length} archivo${skipped.length === 1 ? "" : "s"} no se ${
            skipped.length === 1 ? "pudo" : "pudieron"
          } añadir (${skipped.map((s) => s.name).join(", ")}).`
        : "";

      if (totalAfter > MAX_FOTOS_PRODUCTO) {
        setModalErr(`${ERRORES_PANEL.MAX_IMAGES}${skippedNote ? ` ${skippedNote}` : ""}`);
        return [];
      }

      if (images.length) {
        setNewMedia((prev) => [...prev, ...images]);
        if (!coverId && !existingMedia.length && images[0]) setCoverId(images[0].id);
      }

      if (skippedNote) setModalErr(skippedNote);
      return images;
    } catch (e: any) {
      setModalErr(e?.message ?? ERRORES_PANEL.GENERIC_UPLOAD);
      return [];
    } finally {
      setPicking(false);
    }
  }

  function removeExistingPhoto(id: string) {
    setExistingMedia((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found) setRemovedMedia((curr) => [...curr, found]);
      return prev.filter((m) => m.id !== id);
    });
    if (coverId === id) setCoverId(null);
  }

  function removeNewPhoto(id: string) {
    setNewMedia((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found) {
        try {
          URL.revokeObjectURL(found.previewUrl);
        } catch {
          // ignore
        }
      }
      return prev.filter((m) => m.id !== id);
    });
    if (coverId === id) setCoverId(null);
  }

  // «Seleccionar varias»: quita del formulario las fotos elegidas (se borran de verdad al guardar los cambios). Si la
  // portada estaba entre ellas, pasa a serlo la primera que queda.
  function quitarElegidas() {
    const ids = new Set(seleccion.elegidas);
    const quitadas = existingMedia.filter((m) => ids.has(m.id));
    const nuevasQuitadas = newMedia.filter((m) => ids.has(m.id));
    nuevasQuitadas.forEach((m) => {
      try {
        URL.revokeObjectURL(m.previewUrl);
      } catch {
        // ignore
      }
    });
    const quedanExistentes = existingMedia.filter((m) => !ids.has(m.id));
    const quedanNuevas = newMedia.filter((m) => !ids.has(m.id));
    setExistingMedia(quedanExistentes);
    setNewMedia(quedanNuevas);
    if (quitadas.length) setRemovedMedia((prev) => [...prev, ...quitadas]);
    if (coverId && ids.has(coverId)) setCoverId(quedanExistentes[0]?.id ?? quedanNuevas[0]?.id ?? null);
    seleccion.terminar();
  }

  // Devuelve las fotos quitadas (mientras no se haya guardado).
  function deshacerQuitadas() {
    setExistingMedia((prev) => [...prev, ...removedMedia].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    setRemovedMedia([]);
  }

  // Devuelve la dirección pública de cada foto nueva (por su id local), para las opciones que la usan.
  async function uploadNewPhotos(serviceId: string): Promise<Record<string, string>> {
    const subidas: Record<string, string> = {};
    if (!newMedia.length) return subidas;
    const startIndex = existingMedia.length;

    // La subida a Storage tiene que ser un archivo detrás de otro (no se
    // puede agrupar). Pero antes, además, se hacía un INSERT a
    // "service_media" por cada foto (hasta 15 peticiones de red seguidas
    // solo para guardar las filas). Ahora se suben los archivos igual, uno a
    // uno, pero las filas se acumulan en memoria y se mandan en un único
    // INSERT agrupado al final — mismo patrón que ya usa
    // admin/products.tsx (ver normalizeMediaForProduct).
    const rows: Record<string, any>[] = [];

    for (let i = 0; i < newMedia.length; i++) {
      const item = newMedia[i];
      const storagePath = `services/${rutaDeArchivo(serviceId, item, startIndex + i)}`;

      const uploadRes = await supabase.storage.from(CUBO_ARCHIVOS_PRODUCTO).upload(storagePath, item.file, {
        cacheControl: "3600",
        upsert: false,
        contentType: item.mimeType || undefined,
      });
      if (uploadRes.error) throw uploadRes.error;

      const { data: publicData } = supabase.storage.from(CUBO_ARCHIVOS_PRODUCTO).getPublicUrl(storagePath);
      const publicUrl = publicData?.publicUrl ?? "";
      if (publicUrl) subidas[item.id] = publicUrl;

      rows.push({
        service_id: serviceId,
        storage_path: storagePath,
        public_url: publicUrl,
        file_name: item.name,
        sort_order: startIndex + i,
        is_cover: coverId === item.id,
      });
    }

    if (rows.length) {
      const insertRes = await supabase.from("service_media").insert(rows);
      if (insertRes.error) throw insertRes.error;
    }
    return subidas;
  }

  async function deleteRemovedPhotos() {
    if (!removedMedia.length) return;
    const paths = removedMedia.map((m) => m.storage_path).filter(Boolean) as string[];
    const ids = removedMedia.map((m) => m.id);
    if (paths.length) {
      const storageDelete = await supabase.storage.from(CUBO_ARCHIVOS_PRODUCTO).remove(paths);
      if (storageDelete.error) throw storageDelete.error;
    }
    const dbDelete = await supabase.from("service_media").delete().in("id", ids);
    if (dbDelete.error) throw dbDelete.error;
  }

  async function syncCover(serviceId: string) {
    // Deja como portada únicamente la que coincide con coverId (entre las
    // fotos que ya existían en Supabase; las nuevas ya se insertan con
    // is_cover correcto en uploadNewPhotos). Antes esto era un .update() por
    // foto cuyo estado de portada cambiaba; ahora se agrupan los cambios en
    // un único .upsert() — mismo patrón, y misma cautela con las columnas
    // NOT NULL sin valor por defecto (aquí "service_id"), que ya products.tsx
    // documenta: un .upsert() es un INSERT ... ON CONFLICT DO UPDATE a nivel
    // de Postgres, así que sin service_id fallaría aunque la fila ya exista.
    const changedRows = existingMedia
      .filter((m) => Boolean(m.is_cover) !== (m.id === coverId))
      .map((m) => ({ id: m.id, service_id: serviceId, is_cover: m.id === coverId }));

    if (changedRows.length === 0) return;

    const { error } = await supabase.from("service_media").upsert(changedRows, { onConflict: "id" });
    if (error) throw error;
  }

  async function save() {
    if (saving) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setModalErr("Ponle un título al servicio.");
      return;
    }

    // Opciones (Básica, Completa…): las filas vacías no cuentan; una con nombre necesita precio y al revés.
    const filasOpciones = opciones.filter((o) => o.nombre.trim() || o.precio.trim());
    const incompleta = filasOpciones.find((o) => !o.nombre.trim() || !o.precio.trim() || !(precioSeguro(o.precio, -1) >= 0));
    if (incompleta) {
      setModalErr("Cada opción necesita su nombre y su precio (o déjala vacía para quitarla).");
      return;
    }
    const nombresOpciones = filasOpciones.map((o) => o.nombre.trim().toLowerCase());
    if (new Set(nombresOpciones).size !== nombresOpciones.length) {
      setModalErr("Hay dos opciones con el mismo nombre: cámbiale el nombre a una.");
      return;
    }
    // La foto de cada opción: una foto guardada que siga en el servicio (si se quitó, la opción se queda sin foto); las
    // nuevas (`nueva:<id>`) se resuelven después de subirlas.
    const guardadas = new Set(existingMedia.map((m) => m.public_url ?? ""));
    const nuevas = new Set(newMedia.map((m) => m.id));
    const fotoValida = (f: string | null) =>
      !f ? null : f.startsWith("nueva:") ? (nuevas.has(f.slice(6)) ? f : null) : guardadas.has(f) ? f : null;
    const modalidades: ModalidadServicio[] = filasOpciones.map((o) => {
      const foto = fotoValida(o.foto);
      return {
        nombre: o.nombre.trim(),
        precio_eur: Math.round(precioSeguro(o.precio, 0) * 100) / 100,
        ...(foto && !foto.startsWith("nueva:") ? { foto } : null),
      };
    });
    const opcionesConFotoNueva = filasOpciones.map((o) => fotoValida(o.foto)).filter((f) => f?.startsWith("nueva:"));
    // Peso para el envío (parte 2): vacío = el peso por defecto de los ajustes; si no, entre 0 y 30 kg.
    const pesoKg = pesoEnvio.trim() ? Number(pesoEnvio.trim().replace(",", ".")) : null;
    if (pesosOk && pesoTocado && pesoKg !== null && !(Number.isFinite(pesoKg) && pesoKg > 0 && pesoKg <= 30)) {
      setModalErr("El peso para el envío tiene que estar entre 0,1 y 30 kg (o vacío para usar el peso por defecto).");
      return;
    }

    setSaving(true);
    setModalErr(null);

    try {
      // Con céntimos (45,50 → 45.5; dueño, 2026-11-04). Hasta que se aplique la migración 20261104150000 la columna
      // es de enteros: entonces se guarda redondeado y se avisa (el servicio no se queda sin guardar).
      // Con opciones, el precio del servicio es el de la más barata (el «desde» de los listados de la tienda).
      const precio = modalidades.length
        ? Math.min(...modalidades.map((m) => m.precio_eur))
        : Math.round(precioSeguro(price, 0) * 100) / 100;
      const payload: {
        title: string;
        description: string;
        price_eur: number;
        status: ServiceStatus;
        is_active: boolean;
        modalidades?: ModalidadServicio[];
      } = {
        title: cleanTitle,
        description: desc.trim(),
        price_eur: precio,
        status,
        is_active: isActive,
        ...(opcionesOk ? { modalidades } : null),
      };
      const guardar = async (datos: typeof payload, id: string | null) => {
        if (id) {
          const { error } = await supabase.from("services").update(datos).eq("id", id);
          return { id, error };
        }
        const { data, error } = await supabase.from("services").insert(datos).select("id").single();
        return { id: (data as { id: string } | null)?.id ?? null, error };
      };

      let serviceId = editing?.id ?? null;
      let res = await guardar(payload, serviceId);
      const sinCentimos = !!res.error && String((res.error as { code?: string }).code ?? "") === "22P02" && !Number.isInteger(precio);
      if (sinCentimos) res = await guardar({ ...payload, price_eur: Math.round(precio) }, serviceId);
      if (res.error) throw res.error;
      serviceId = res.id;
      setAvisoPrecio(
        sinCentimos
          ? `Guardado con ${formatearEurosPanel(Math.round(precio))} en vez de ${formatearEurosPanel(precio)}: para guardar céntimos en los servicios falta aplicar un ajuste en la base de datos (migración 20261104150000).`
          : null
      );

      if (serviceId) {
        await deleteRemovedPhotos();
        const subidas = await uploadNewPhotos(serviceId);
        await syncCover(serviceId);
        // Las opciones con una foto recién subida: ya con su dirección pública.
        if (opcionesOk && opcionesConFotoNueva.length) {
          const conFotos = filasOpciones.map((o, i) => {
            const f = fotoValida(o.foto);
            const url = f?.startsWith("nueva:") ? subidas[f.slice(6)] : null;
            return url ? { ...modalidades[i], foto: url } : modalidades[i];
          });
          const { error } = await supabase.from("services").update({ modalidades: conFotos }).eq("id", serviceId);
          if (error) throw error;
        }
        // El peso que el dueño ha guardado (o dado por bueno) deja de ser «estimado».
        if (pesosOk && pesoTocado) {
          const { error } = await supabase
            .from("services")
            .update({ envio_peso_kg: pesoKg === null ? null : Math.round(pesoKg * 1000) / 1000, envio_peso_estimado: false })
            .eq("id", serviceId);
          if (error) throw error;
        }
      }

      closeModal();
      await loadServices();
    } catch (e: any) {
      console.error("Error guardando el servicio:", e);
      setModalErr(e?.message ?? "No se pudo guardar el servicio.");
    } finally {
      setSaving(false);
    }
  }

  // --- Borrar servicio ---
  const [deleteTarget, setDeleteTarget] = useState<ServiceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const paths = deleteTarget.media.map((m) => m.storage_path).filter(Boolean) as string[];
      if (paths.length) {
        await supabase.storage.from(CUBO_ARCHIVOS_PRODUCTO).remove(paths);
      }
      const { error } = await supabase.from("services").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      setDeleteTarget(null);
      await loadServices();
    } catch (e) {
      console.error("Error borrando el servicio:", e);
    } finally {
      setDeleting(false);
    }
  }

  // --- Solicitudes ---
  const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestFilter, setRequestFilter] = useState<"ALL" | RequestStatus | "sin_cuenta" | "veoaura">("ALL");

  // false = faltan las columnas de seguimiento (migración sin aplicar)
  const [seguimientoOk, setSeguimientoOk] = useState(true);
  // false = aún no hay números de seguimiento (migración 20261031170000 sin aplicar): no se enseñan.
  const [numerosOk, setNumerosOk] = useState(false);
  // false = aún no existe la reparación por envío (migración 20261111100000).
  const [envioOk, setEnvioOk] = useState(false);
  // false = aún no está la parte 2 (migración 20261111130000): sin cobros, «sin arreglo» ni garantía.
  const [parte2Ok, setParte2Ok] = useState(false);
  // Fotos de recepción abiertas en el visor (enlaces firmados del almacén privado).
  const [visorEnvio, setVisorEnvio] = useState<FotoVisor[] | null>(null);
  // Reseñas de los servicios terminados (migración 20261103210000): la de cada solicitud y la media de cada servicio.
  // Vacías si la migración aún no está aplicada.
  const [resenasSolicitud, setResenasSolicitud] = useState<Record<string, { rating: number; comment: string }>>({});
  const [mediaServicio, setMediaServicio] = useState<Record<string, { media: number; n: number }>>({});
  useEffect(() => {
    let vivo = true;
    supabase
      .from("store_reviews")
      .select("service_request_id,service_id,rating,comment")
      .not("service_request_id", "is", null)
      .limit(2000)
      .then(({ data, error }) => {
        if (!vivo || error) return;
        const filas = (data ?? []) as { service_request_id: string; service_id: string | null; rating: number; comment: string }[];
        setResenasSolicitud(Object.fromEntries(filas.map((f) => [f.service_request_id, { rating: f.rating, comment: f.comment }])));
        const suma: Record<string, { t: number; n: number }> = {};
        for (const f of filas) {
          if (!f.service_id) continue;
          suma[f.service_id] = { t: (suma[f.service_id]?.t ?? 0) + f.rating, n: (suma[f.service_id]?.n ?? 0) + 1 };
        }
        setMediaServicio(Object.fromEntries(Object.entries(suma).map(([id, v]) => [id, { media: v.t / v.n, n: v.n }])));
      });
    return () => {
      vivo = false;
    };
  }, []);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const base =
        "id,created_at,service_id,service_title,nombre,apellido,metodo_contacto,contacto,ciudad,direccion,disponibilidad,comentario,status";
      const consulta = (columnas: string) =>
        supabase.from("service_requests").select(columnas).order("created_at", { ascending: false }).limit(200);
      const seguimiento = "seguimiento,seguimiento_nota,seguimiento_actualizado";
      const completa = `${base},${seguimiento},customer_user_id,codigo_seguimiento,id_veoaura,vinculado_en,nota_admin`;
      // Con la reparación por envío (migración 20261111100000) y la opción elegida (20261108230000) si la base de datos ya
      // las tiene; si no, sin ellas (y sin volver a preguntar por las de envío en esta visita).
      let res: { data: any[] | null; error: any } = { data: null, error: { code: "42703" } };
      // Parte 2 (cobros, sin arreglo y garantía): solo si los ajustes ya traen garantia_meses (sin errores antes).
      const conParte2 = !sinColumnasEnvio && !!(await cargarAjustesReparacionEnvio())?.parte2;
      setParte2Ok(conParte2);
      if (conParte2) {
        // Con qué se pagó online (migración 20261111150000); sin esas columnas, como antes.
        res = await consulta(`${completa},modalidad,modalidad_precio_eur,${COLUMNAS_ENVIO},${COLUMNAS_ENVIO_2},${COLUMNAS_METODO}`);
        if (res.error) res = await consulta(`${completa},modalidad,modalidad_precio_eur,${COLUMNAS_ENVIO},${COLUMNAS_ENVIO_2}`);
        if (res.error && faltaEsquema(res.error)) setParte2Ok(false);
      }
      if (!sinColumnasEnvio && res.error) {
        res = await consulta(`${completa},modalidad,modalidad_precio_eur,${COLUMNAS_ENVIO}`);
        if (res.error && faltaEsquema(res.error)) sinColumnasEnvio = true;
      }
      setEnvioOk(!res.error);
      if (res.error && faltaEsquema(res.error)) res = await consulta(`${completa},modalidad,modalidad_precio_eur`);
      if (res.error && faltaEsquema(res.error)) res = await consulta(completa);
      setNumerosOk(!res.error);
      if (res.error && faltaEsquema(res.error)) res = await consulta(`${base},${seguimiento}`);
      if (res.error && faltaEsquema(res.error)) {
        setSeguimientoOk(false);
        res = await consulta(base);
      } else if (!res.error) {
        setSeguimientoOk(true);
      }
      const { data, error } = res;
      if (error) throw error;
      setRequests((data ?? []) as ServiceRequestRow[]);
    } catch (e) {
      console.error("Error cargando solicitudes de servicio:", e);
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "solicitudes") loadRequests();
  }, [tab, loadRequests]);

  // Filtros de la opción elegida, la recogida a domicilio (escribió «Dónde podemos recogerlo») y el método de contacto.
  const [filtroOpcion, setFiltroOpcion] = useState("ALL");
  const [filtroRecogida, setFiltroRecogida] = useState<"ALL" | "si" | "no">("ALL");
  const [filtroMetodo, setFiltroMetodo] = useState<"ALL" | MetodoContacto>("ALL");
  // Entrega (reparación por envío): todas, recogida o por envío.
  const [filtroEntrega, setFiltroEntrega] = useState<"ALL" | "recogida" | "correos">("ALL");
  // Parte 2: cobros, «sin arreglo» y garantía (qué hay que mirar y cuántas hay de cada).
  type FiltroCobro = "ALL" | "avisado" | "pendiente" | "pagada" | "sin_arreglo" | "comprar" | "devolver" | "garantia";
  const [filtroCobro, setFiltroCobro] = useState<FiltroCobro>("ALL");
  const pasaCobro = useCallback((r: ServiceRequestRow, f: FiltroCobro) => {
    if (f === "ALL") return true;
    if (f === "avisado") return (!!r.pago_avisado_en && r.pago_estado !== "pagado") || (!!r.etiqueta_avisada_en && !r.etiqueta_pagada_en);
    if (f === "pendiente")
      return (
        r.entrega_modo === "correos" &&
        r.pago_estado !== "pagado" &&
        r.seguimiento !== "cancelado" &&
        ((r.diagnostico_resultado === "sin_arreglo" && r.sin_arreglo_eleccion === "devolver" && Number(r.vuelta_eur ?? 0) > 0) ||
          (r.diagnostico_resultado !== "sin_arreglo" && !!r.presupuesto_aceptado_en && Number(r.presupuesto_eur ?? 0) > 0))
      );
    if (f === "pagada") return r.pago_estado === "pagado";
    if (f === "sin_arreglo") return r.diagnostico_resultado === "sin_arreglo";
    if (f === "comprar" || f === "devolver") return r.diagnostico_resultado === "sin_arreglo" && r.sin_arreglo_eleccion === f;
    return !!r.garantia_de;
  }, []);
  const cuentaCobro = useMemo(() => {
    const c = {} as Record<FiltroCobro, number>;
    for (const f of ["avisado", "pendiente", "pagada", "sin_arreglo", "comprar", "devolver", "garantia"] as FiltroCobro[]) c[f] = requests.filter((r) => pasaCobro(r, f)).length;
    c.ALL = requests.length;
    return c;
  }, [requests, pasaCobro]);
  const garantiasAbiertas = useMemo(() => requests.filter((r) => !!r.garantia_de && r.seguimiento !== "entregado" && r.seguimiento !== "cancelado").length, [requests]);
  const cuentaPorEnvio = useMemo(() => requests.filter((r) => r.entrega_modo === "correos").length, [requests]);
  const opcionesSolicitadas = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const r of requests) if (r.modalidad) cuenta.set(r.modalidad, (cuenta.get(r.modalidad) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  }, [requests]);

  const filteredRequests = useMemo(() => {
    let lista = requests;
    if (requestFilter === "sin_cuenta") lista = lista.filter((r) => !r.customer_user_id);
    else if (requestFilter === "veoaura") lista = lista.filter((r) => !!r.id_veoaura);
    else if (requestFilter !== "ALL") lista = lista.filter((r) => r.status === requestFilter);
    if (filtroOpcion === "SIN") lista = lista.filter((r) => !r.modalidad);
    else if (filtroOpcion !== "ALL") lista = lista.filter((r) => r.modalidad === filtroOpcion);
    if (filtroRecogida !== "ALL") lista = lista.filter((r) => (filtroRecogida === "si") === !!r.direccion?.trim());
    if (filtroMetodo !== "ALL") lista = lista.filter((r) => r.metodo_contacto === filtroMetodo);
    if (filtroEntrega !== "ALL") lista = lista.filter((r) => (r.entrega_modo === "correos" ? "correos" : "recogida") === filtroEntrega);
    if (filtroCobro !== "ALL") lista = lista.filter((r) => pasaCobro(r, filtroCobro));
    return lista;
  }, [requests, requestFilter, filtroOpcion, filtroRecogida, filtroMetodo, filtroEntrega, filtroCobro, pasaCobro]);

  // Cuántas de cada (para los desplegables de filtro).
  const cuentaRecogida = useMemo(() => requests.filter((r) => !!r.direccion?.trim()).length, [requests]);
  const cuentaMetodo = useMemo(() => {
    const c: Partial<Record<MetodoContacto, number>> = {};
    for (const r of requests) if (r.metodo_contacto) c[r.metodo_contacto] = (c[r.metodo_contacto] ?? 0) + 1;
    return c;
  }, [requests]);

  // Números de seguimiento: cuántas fichas vienen de VeoAura y cuántas ya están en la cuenta de su cliente.
  const resumenNumeros = useMemo(() => {
    const deVeoaura = requests.filter((r) => !!r.id_veoaura);
    return {
      veoaura: deVeoaura.length,
      veoauraVinculadas: deVeoaura.filter((r) => !!r.customer_user_id).length,
      sinCuenta: requests.filter((r) => !r.customer_user_id).length,
      anadidasConNumero: requests.filter((r) => !!r.vinculado_en).length,
      desdeChat: requests.filter((r) => r.nota_admin === NOTA_ASIGNADO_CHAT).length,
    };
  }, [requests]);

  // --- Rediseño (2026-11-16): buscador, cifras que filtran, «Más filtros» y filas compactas que se despliegan ---
  const [busquedaSol, setBusquedaSol] = useState("");
  const [vistaSol, setVistaSol] = useState<VistaSol>("ALL");
  const [masFiltrosSol, setMasFiltrosSol] = useState(false);
  const desplegablesSol = useDesplegables();
  const masFiltrosActivos = [filtroOpcion, filtroRecogida, filtroEntrega, filtroMetodo, filtroCobro].filter((f) => f !== "ALL").length;

  const pasaVista = useCallback(
    (r: ServiceRequestRow, v: VistaSol) => {
      const seg = r.seguimiento ?? "solicitado";
      if (v === "abiertas") return r.status !== "descartado" && seg !== "entregado" && seg !== "cancelado";
      if (v === "reparacion") return ETAPAS_TALLER.includes(seg);
      if (v === "listas") return seg === "listo";
      if (v === "envio") return r.entrega_modo === "correos";
      if (v === "por_cobrar") return pasaCobro(r, "pendiente");
      if (v === "avisado") return pasaCobro(r, "avisado");
      if (v === "garantia") return !!r.garantia_de && seg !== "entregado" && seg !== "cancelado";
      return true;
    },
    [pasaCobro]
  );

  const cifrasSolicitudes = useMemo(() => {
    const n = (v: VistaSol) => requests.filter((r) => pasaVista(r, v)).length;
    const lista: { key: VistaSol; valor: number; etiqueta: string; icono: IoniconName; alerta?: boolean }[] = [
      { key: "abiertas", valor: n("abiertas"), etiqueta: "Abiertas", icono: "folder-open-outline" },
      ...(seguimientoOk
        ? [
            { key: "reparacion" as const, valor: n("reparacion"), etiqueta: "En el taller", icono: "construct-outline" as IoniconName },
            { key: "listas" as const, valor: n("listas"), etiqueta: "Listas", icono: "checkmark-done-outline" as IoniconName },
          ]
        : []),
      ...(envioOk ? [{ key: "envio" as const, valor: n("envio"), etiqueta: "Por envío", icono: "cube-outline" as IoniconName }] : []),
      ...(parte2Ok
        ? [
            { key: "por_cobrar" as const, valor: n("por_cobrar"), etiqueta: "Por cobrar", icono: "wallet-outline" as IoniconName },
            { key: "avisado" as const, valor: n("avisado"), etiqueta: "Avisos de pago", icono: "alert-circle-outline" as IoniconName, alerta: n("avisado") > 0 },
            { key: "garantia" as const, valor: n("garantia"), etiqueta: "Garantías en curso", icono: "shield-checkmark-outline" as IoniconName },
          ]
        : []),
    ];
    return lista;
  }, [requests, pasaVista, seguimientoOk, envioOk, parte2Ok]);

  function elegirVistaSol(v: VistaSol) {
    setBusquedaSol("");
    setRequestFilter("ALL");
    setVistaSol((actual) => (actual === v ? "ALL" : v));
  }

  // Con algo escrito busca en todas (nombre, servicio, nº VZ-…, contacto, ciudad); si no, los filtros y la cifra elegida.
  const visiblesSol = useMemo(() => {
    const q = busquedaSol.trim().toLowerCase();
    if (q) {
      const sinGuiones = q.replace(/[\s-]/g, "");
      return requests.filter((r) => {
        const texto = `${r.nombre} ${r.apellido} ${r.service_title} ${r.contacto ?? ""} ${r.ciudad ?? ""} ${r.modalidad ?? ""}`.toLowerCase();
        const codigo = (r.codigo_seguimiento ?? "").toLowerCase().replace(/[\s-]/g, "");
        return texto.includes(q) || (!!sinGuiones && codigo.includes(sinGuiones));
      });
    }
    return vistaSol === "ALL" ? filteredRequests : filteredRequests.filter((r) => pasaVista(r, vistaSol));
  }, [requests, filteredRequests, busquedaSol, vistaSol, pasaVista]);

  // «Escribir al cliente» por WhatsApp si dejó un teléfono (WhatsApp o una ficha de VeoAura con teléfono).
  function telefonoDe(r: ServiceRequestRow): string | null {
    if (!r.contacto) return null;
    if (r.metodo_contacto && r.metodo_contacto !== "whatsapp") return null;
    const tel = r.contacto.replace(/[^\d]/g, "");
    if (tel.length < 9 || tel.length > 13 || /@/.test(r.contacto)) return null;
    return tel.length === 9 ? `34${tel}` : tel;
  }
  function escribirAlCliente(r: ServiceRequestRow) {
    const tel = telefonoDe(r);
    if (!tel) return;
    const ref = r.codigo_seguimiento ? ` ${r.codigo_seguimiento}` : "";
    const texto = encodeURIComponent(`Hola ${r.nombre}, te escribimos por tu solicitud de «${r.service_title}»${ref} en Videojuegoszaragoza.com.`);
    abrirEnlaceExterno(`https://wa.me/${tel}?text=${texto}`);
  }

  // ---------- Fila compacta de una solicitud y su detalle por bloques ----------
  function filaSolicitud(r: ServiceRequestRow, i: number) {
    const abierta = desplegablesSol.estaAbierta(r.id);
    const seg = r.seguimiento ?? null;
    const gris = r.status === "descartado" || seg === "cancelado";
    const importe = r.presupuesto_eur != null ? Number(r.presupuesto_eur) : r.modalidad_precio_eur != null ? Number(r.modalidad_precio_eur) : null;
    const garantiaDe = r.garantia_de ? requests.find((x) => x.id === r.garantia_de) : undefined;
    const pago = !parte2Ok
      ? null
      : r.pago_estado === "pagado"
        ? { texto: "Pagado", icono: "card" as IoniconName, color: COLORS.success }
        : pasaCobro(r, "avisado")
          ? { texto: "Dice que ya pagó", icono: "alert-circle-outline" as IoniconName, color: COLORS.warning }
          : pasaCobro(r, "pendiente")
            ? { texto: "Por cobrar", icono: "wallet-outline" as IoniconName, color: COLORS.danger }
            : null;
    const anchoBloque = isMobile ? "100%" : "45%";
    const tel = telefonoDe(r);
    return (
      <View key={r.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border, paddingVertical: 4 }}>
        <Pressable
          nativeID={`solicitud-fila-${r.id}`}
          onPress={() => desplegablesSol.alternar(r.id)}
          accessibilityRole="button"
          accessibilityState={{ expanded: abierta }}
          {...({ "aria-expanded": abierta } as object)}
          accessibilityLabel={`${r.nombre} ${r.apellido}, ${r.service_title}, ${REQUEST_STATUS_LABEL[r.status]}. ${abierta ? "Plegar" : "Ver el detalle"}`}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 8, opacity: pressed ? 0.85 : 1 })}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 4 }}>
              <Text nativeID={`solicitud-titulo-${r.id}`} style={{ color: gris ? COLORS.muted : COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>
                {`${r.nombre} ${r.apellido}`.trim() || "Sin nombre"}
              </Text>
              <EtiquetaColor nativeID={`solicitud-estado-${r.id}`} texto={REQUEST_STATUS_LABEL[r.status]} tono={REQUEST_STATUS_TONO[r.status]} />
            </View>
            <Text numberOfLines={1} style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
              {r.service_title} · {formatDate(r.created_at)}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 14, rowGap: 4, marginTop: 1 }}>
              {seguimientoOk && seg ? (
                <Etiqueta
                  nativeID={`solicitud-etapa-${r.id}`}
                  icon={seg === "cancelado" ? "close-circle-outline" : seg === "entregado" ? "checkmark-done-outline" : "git-commit-outline"}
                  color={gris ? COLORS.muted : COLORS.text}
                  texto={SEGUIMIENTO_LABEL[seg]}
                />
              ) : null}
              {envioOk && r.entrega_modo === "correos" ? (
                <Etiqueta icon="cube-outline" color={gris ? COLORS.muted : COLORS.text} texto={`Por envío${r.aparatos && r.aparatos > 1 ? ` · ${r.aparatos} aparatos` : ""}`} />
              ) : r.direccion?.trim() ? (
                <Etiqueta icon="car-outline" color={gris ? COLORS.muted : COLORS.text} texto="Recogida a domicilio" />
              ) : null}
              {r.codigo_seguimiento ? <Etiqueta icon="barcode-outline" color={COLORS.muted} texto={r.codigo_seguimiento} /> : null}
              {pago ? <Etiqueta nativeID={`solicitud-cobro-fila-${r.id}`} icon={pago.icono} color={pago.color} texto={pago.texto} /> : null}
              {r.garantia_de ? (
                <Etiqueta
                  nativeID={`solicitud-garantia-${r.id}`}
                  icon="shield-checkmark-outline"
                  color={COLORS.success}
                  texto={`Garantía · sin coste${garantiaDe?.codigo_seguimiento ? ` · de ${garantiaDe.codigo_seguimiento}` : ""}`}
                />
              ) : null}
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            {importe !== null ? (
              <Text nativeID={`solicitud-importe-${r.id}`} style={{ color: gris ? COLORS.muted : COLORS.text, fontWeight: "900", fontSize: TAMANOS.destacado, lineHeight: 22 }}>
                {formatearEurosPanel(importe)}
              </Text>
            ) : null}
            <Ionicons name={abierta ? "chevron-up" : "chevron-down"} size={18} color={COLORS.muted} style={{ marginTop: 2 }} />
          </View>
        </Pressable>

        {abierta ? (
          <View nativeID={`solicitud-detalle-${r.id}`} style={{ gap: 12, paddingBottom: 16 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {/* Cliente: contacto, ciudad, disponibilidad y su número de seguimiento. */}
              <Bloque nativeID={`solicitud-bloque-cliente-${r.id}`} icono="person-outline" titulo="Cliente" ancho={anchoBloque}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>{`${r.nombre} ${r.apellido}`.trim() || "Sin nombre"}</Text>
                {r.metodo_contacto ? (
                  <Dato etiqueta={METODO_LABEL[r.metodo_contacto]}>{r.contacto || "—"}</Dato>
                ) : r.contacto ? (
                  // Fichas de VeoAura: el teléfono o el email que vino con la ficha.
                  <Dato etiqueta="Contacto">{r.contacto}</Dato>
                ) : null}
                {r.ciudad ? <Dato etiqueta="Ciudad">{r.ciudad}</Dato> : null}
                {r.disponibilidad ? <Dato etiqueta="Disponibilidad">{DISPONIBILIDAD_LABEL[r.disponibilidad]}</Dato> : null}
                {r.codigo_seguimiento ? (
                  <View style={{ gap: 2, marginTop: 2 }}>
                    <Text selectable style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo, letterSpacing: 0.5, lineHeight: 19 }}>
                      Nº de seguimiento {r.codigo_seguimiento}
                    </Text>
                    <Detalle>
                      {[
                        r.id_veoaura ? "Ficha de VeoAura" : null,
                        r.customer_user_id
                          ? r.vinculado_en
                            ? `El cliente la añadió a su cuenta el ${formatDate(r.vinculado_en)}`
                            : r.nota_admin === NOTA_ASIGNADO_CHAT
                              ? "Asignada desde el chat: ya está en la cuenta del cliente"
                              : "En la cuenta del cliente"
                          : "Aún no está en ninguna cuenta: dale este número al cliente",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Detalle>
                  </View>
                ) : null}
              </Bloque>

              {/* Aparato y servicio: la opción elegida, dónde recogerlo, lo que contó y su valoración. */}
              <Bloque nativeID={`solicitud-bloque-aparato-${r.id}`} icono="game-controller-outline" titulo="Aparato y servicio" ancho={anchoBloque}>
                <Dato etiqueta="Servicio">{r.service_title}</Dato>
                {r.modalidad ? (
                  <Dato nativeID={`solicitud-opcion-${r.id}`} etiqueta="Opción">
                    {r.modalidad}
                    {r.modalidad_precio_eur != null ? ` · ${formatearEurosPanel(Number(r.modalidad_precio_eur))}` : ""}
                  </Dato>
                ) : null}
                {r.direccion ? <Dato etiqueta="Recogida en">{r.direccion}</Dato> : null}
                {r.comentario ? <Dato etiqueta="Detalles">{r.comentario}</Dato> : null}
                {resenasSolicitud[r.id] ? (
                  <Text nativeID={`solicitud-resena-${r.id}`} style={{ color: COLORS.text, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                    <Text style={{ fontWeight: "800" }}>Valoración del cliente: </Text>
                    <Text style={{ color: COLORS.warning }}>{"★".repeat(resenasSolicitud[r.id].rating)}</Text>
                    {resenasSolicitud[r.id].comment ? ` «${resenasSolicitud[r.id].comment}»` : ""}
                  </Text>
                ) : null}
                <Detalle>Pedida el {formatDate(r.created_at)}</Detalle>
              </Bloque>

              {/* Pasos: la etapa y la nota que ve el cliente en «Mis seguimientos». */}
              <Bloque nativeID={`solicitud-bloque-pasos-${r.id}`} icono="git-network-outline" titulo="Pasos para el cliente" ancho="100%">
                <RequestSeguimiento
                  key={`seg-${r.id}-${r.seguimiento ?? ""}`}
                  request={r}
                  disponible={seguimientoOk}
                  isMobile={isMobile}
                  onSaved={(patch) => setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
                  onMissingMigration={() => setSeguimientoOk(false)}
                  envioOk={envioOk}
                />
              </Bloque>

              {/* Envío (etiqueta de Correos), fotos de recepción, presupuesto, diagnóstico, pago y garantía. */}
              {envioOk ? (
                <Bloque
                  nativeID={`solicitud-bloque-envio-${r.id}`}
                  icono={r.entrega_modo === "correos" ? "cube-outline" : "pricetag-outline"}
                  titulo={r.entrega_modo === "correos" ? "Envío, presupuesto y pago" : "Presupuesto y pago"}
                  ancho="100%"
                >
                  <PanelEnvioSolicitud
                    request={r}
                    isMobile={isMobile}
                    onSaved={(patch) => setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
                    onVerFotos={setVisorEnvio}
                    parte2={parte2Ok}
                  />
                </Bloque>
              ) : null}
            </View>

            {/* Acciones abajo: escribir al cliente, cambiar el estado de la solicitud y borrarla. */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: TACTIL.separacion }}>
              {tel ? (
                <Pressable
                  nativeID={`solicitud-whatsapp-${r.id}`}
                  onPress={() => escribirAlCliente(r)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    minHeight: TACTIL.minimo,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.bg,
                  })}
                >
                  <Ionicons name="logo-whatsapp" size={16} color={COLORS.success} />
                  <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>Escribir al cliente</Text>
                </Pressable>
              ) : null}
              <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>Pasar a:</Text>
              {(["nuevo", "revisado", "contactado", "descartado"] as RequestStatus[])
                .filter((s) => s !== r.status)
                .map((s) => (
                  <ChipButton key={s} label={REQUEST_STATUS_LABEL[s]} onPress={() => setRequestStatus(r.id, s)} isMobile={isMobile} variant={s === "descartado" ? "danger" : "ghost"} />
                ))}
              <BotonIconoPanel icon="trash-outline" label="Borrar la solicitud" variant="danger" onPress={() => setDeleteRequestTarget(r)} />
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  async function setRequestStatus(id: string, next: RequestStatus) {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
    const { error } = await supabase.from("service_requests").update({ status: next }).eq("id", id);
    if (error) {
      console.error("Error actualizando la solicitud:", error);
      await loadRequests();
    }
  }

  const [deleteRequestTarget, setDeleteRequestTarget] = useState<ServiceRequestRow | null>(null);

  async function confirmDeleteRequest() {
    if (!deleteRequestTarget) return;
    const id = deleteRequestTarget.id;
    setDeleteRequestTarget(null);
    setRequests((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("service_requests").delete().eq("id", id);
    if (error) {
      console.error("Error borrando la solicitud:", error);
      await loadRequests();
    }
  }

  // --- Render ---

  return (
    // En iOS deja sitio al teclado (las notas de seguimiento pueden estar al final de la lista).
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: COLORS.bg }}
    >
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual
          en todo el panel. Pestañas y contenido van en un solo scroll. */}
      <CabeceraPanel title="Servicios" isMobile={isMobile} maxWidth={1160} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: pagePadding,
          // Hueco para el «+» flotante: nunca tapa el último servicio.
          paddingBottom: 96 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={CIERRE_TECLADO}
      >
        {/* Deslizar el dedo a un lado u otro sobre el contenido cambia de pestaña, en bucle (useGestoPestanas). */}
        <Animated.View
          ref={gesto.ref}
          nativeID="servicios-deslizable"
          {...gesto.panHandlers}
          style={{ ...columnStyle, gap: sectionGap, transform: [{ translateX: gesto.desliz }] }}
        >
          <PestanasPanel nativeID="servicios-pestanas" pestanas={PESTANAS_SERVICIOS} actual={tab} onChange={setTab} />

      {tab === "catalogo" ? (
          <>
            {/* El buscador (16 px) arriba de las cifras, como en Usuarios y Pedidos. */}
            <Buscador nativeID="servicios-buscar" valor={search} onCambiar={setSearch} placeholder="Buscar por título o descripción" etiqueta="Buscar servicios por título o descripción" />

            {avisoPrecio ? <AvisoPanel tone="warning" text={avisoPrecio} /> : null}

            {/* Las cuatro cifras en una sola fila, también en el móvil (dueño, 2026-11-03); tocarlas filtra la lista. */}
            <View nativeID="servicios-contadores" style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
              <Cifra nativeID="servicios-cifra-todos" valor={String(stats.total)} etiqueta="Servicios" icono="construct-outline" ancho={anchoCifra4} onPress={() => setFiltroCatalogo("todos")} />
              <Cifra nativeID="servicios-cifra-publicados" valor={String(stats.published)} etiqueta="Publicados" icono="checkmark-circle-outline" ancho={anchoCifra4} activa={!search.trim() && filtroCatalogo === "publicados"} onPress={() => setFiltroCatalogo((f) => (f === "publicados" ? "todos" : "publicados"))} />
              <Cifra nativeID="servicios-cifra-visibles" valor={String(stats.visible)} etiqueta="Visibles" icono="eye-outline" ancho={anchoCifra4} activa={!search.trim() && filtroCatalogo === "visibles"} onPress={() => setFiltroCatalogo((f) => (f === "visibles" ? "todos" : "visibles"))} />
              <Cifra nativeID="servicios-cifra-visitas" valor={String(stats.views)} etiqueta="Visitas" icono="trending-up-outline" ancho={anchoCifra4} />
            </View>

            {/* Pastillas con su recuento. */}
            {!loading && services.length ? (
              <FilaPastillas isMobile={isMobile} nativeID="servicios-filtros">
                {(
                  [
                    { value: "todos", label: `Todos (${stats.total})` },
                    { value: "publicados", label: `Publicados (${stats.published})` },
                    { value: "borradores", label: `Borradores (${stats.borradores})` },
                    { value: "ocultos", label: `Ocultos (${stats.ocultos})` },
                  ] as { value: FiltroCatalogo; label: string }[]
                ).map((c) => (
                  <Chip key={c.value} nativeID={`servicios-filtro-${c.value}`} label={c.label} activo={!search.trim() && filtroCatalogo === c.value} onPress={() => setFiltroCatalogo(c.value)} />
                ))}
              </FilaPastillas>
            ) : null}

            {loading ? (
              <CargaMarca texto="Cargando servicios…" />
            ) : filteredServices.length === 0 && services.length ? (
              <ListaVacia nativeID="servicios-vacio" icono="construct-outline" titulo="No hay servicios en esta lista." texto="Prueba a borrar el buscador o a elegir «Todos»." />
            ) : filteredServices.length === 0 ? (
              <EstadoVacioPanel
                icon="construct-outline"
                title="Todavía no hay servicios"
                text="Crea el primero (por ejemplo «Reparación de pantalla» o «Limpieza interna») para que aparezca en la categoría «Reparación/Limpieza» de Inicio."
              />
            ) : (
              // Sin recuadro alrededor de cada servicio (dueño, 2026-11-03: «quitar las burbujas envolventes»): filas
              // separadas por una línea fina.
              <View nativeID="servicios-lista">
                {filteredServices.map((s, i) => {
                  const cover = coverUrl(s.media);
                  return (
                    <View
                      key={s.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingVertical: 12,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: COLORS.border,
                      }}
                    >
                      {cover ? (
                        // Tocar la foto la abre en grande, con zoom.
                        <Pressable
                          onPress={() => setVisor({ fotos: fotosDelServicio(s.media), inicio: 0 })}
                          accessibilityRole="button"
                          accessibilityLabel={`Ver las fotos de ${s.title || "el servicio"}`}
                          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                        >
                          <ImagenInteligente uri={cover} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: COLORS.cardSoft }} />
                        </Pressable>
                      ) : (
                        <View
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 12,
                            backgroundColor: COLORS.cardSoft,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons name="construct-outline" size={22} color={COLORS.muted} />
                        </View>
                      )}

                      {/* Título y datos enteros, en las líneas que hagan falta (dueño, 2026-11-04: «que se vean perfectamente»). */}
                      <View nativeID={`servicio-fila-${s.id}`} style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <Text style={{ color: s.status === "PUBLISHED" && s.is_active ? COLORS.text : COLORS.muted, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>
                          {s.title || "Sin título"}
                        </Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
                        <EtiquetaColor
                          nativeID={`servicio-estado-${s.id}`}
                          texto={!s.is_active ? "Oculto" : STATUS_LABEL[s.status]}
                          tono={!s.is_active ? "gris" : s.status === "PUBLISHED" ? "verde" : s.status === "REVIEW" ? "azul" : "amarillo"}
                        />
                        <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 18, flexShrink: 1 }}>
                          {s.modalidades?.length
                            ? `Desde ${formatearEurosPanel(s.price_eur)} · ${s.modalidades.length} opciones${
                                s.modalidades.some((m) => m.foto) ? ` (${s.modalidades.filter((m) => m.foto).length} con foto)` : ""
                              }`
                            : formatearEurosPanel(s.price_eur)}
                          {!s.is_active ? ` · ${STATUS_LABEL[s.status]}` : ""} · {s.view_count ?? 0} visitas
                          {typeof s.like_count === "number" ? ` · ${s.like_count} me gusta` : ""}
                          {mediaServicio[s.id] ? ` · ★ ${mediaServicio[s.id].media.toFixed(1).replace(".", ",")} (${mediaServicio[s.id].n})` : ""}
                        </Text>
                        </View>
                      </View>

                      <BotonIconoPanel icon="create-outline" label={`Editar ${s.title || "el servicio"}`} variant="primary" onPress={() => openEdit(s)} />
                      <BotonIconoPanel icon="trash-outline" label={`Borrar ${s.title || "el servicio"}`} variant="danger" onPress={() => setDeleteTarget(s)} />
                    </View>
                  );
                })}
              </View>
            )}

            <EditorVideosServicios isMobile={isMobile} />
          </>
      ) : (
          <>
            {/* Ajustes de la reparación por envío (plegados). */}
            <AjustesEnvioPanel isMobile={isMobile} />

            {/* Buscador (16 px): nombre, servicio, nº VZ-…, contacto o ciudad. Con algo escrito busca en todas. */}
            <Buscador
              nativeID="solicitudes-buscar"
              valor={busquedaSol}
              onCambiar={setBusquedaSol}
              placeholder={isMobile ? "Nombre, VZ-…, servicio o contacto" : "Buscar por nombre, nº de seguimiento (VZ-…), servicio, contacto o ciudad"}
              etiqueta="Buscar solicitudes por nombre, número de seguimiento, servicio, contacto o ciudad"
            />

            {/* Cifras que filtran al tocarlas: abiertas, en reparación, por envío, por cobrar, avisos de pago y garantías. */}
            {!requestsLoading ? (
              <View nativeID="solicitudes-cifras" style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
                {cifrasSolicitudes.map((c) => (
                  <Cifra
                    key={c.key}
                    nativeID={`solicitudes-cifra-${c.key}`}
                    valor={String(c.valor)}
                    etiqueta={c.etiqueta}
                    icono={c.icono}
                    alerta={c.alerta}
                    ancho={isMobile ? "30%" : 0}
                    activa={!busquedaSol.trim() && vistaSol === c.key}
                    onPress={() => elegirVistaSol(c.key)}
                  />
                ))}
              </View>
            ) : null}

            {/* Pastillas por estado (con su recuento) y «Más filtros» (opción, recogida, entrega, contacto, cobro). */}
            <View style={{ gap: 10 }}>
              <FilaPastillas isMobile={isMobile} nativeID="solicitudes-estados">
                {(["ALL", "nuevo", "revisado", "contactado", "descartado"] as const).map((f) => (
                  <Chip
                    key={f}
                    nativeID={`solicitudes-estado-${f}`}
                    label={`${f === "ALL" ? "Todas" : REQUEST_STATUS_PLURAL[f]} (${f === "ALL" ? requests.length : requests.filter((r) => r.status === f).length})`}
                    activo={!busquedaSol.trim() && requestFilter === f && vistaSol === "ALL"}
                    onPress={() => {
                      setVistaSol("ALL");
                      setRequestFilter(f);
                    }}
                  />
                ))}
                {numerosOk
                  ? (
                      [
                        ["sin_cuenta", `Sin cuenta (${resumenNumeros.sinCuenta})`],
                        ["veoaura", `De VeoAura (${resumenNumeros.veoaura})`],
                      ] as const
                    ).map(([f, label]) => (
                      <Chip
                        key={f}
                        nativeID={`solicitudes-estado-${f}`}
                        label={label}
                        activo={!busquedaSol.trim() && requestFilter === f}
                        onPress={() => {
                          setVistaSol("ALL");
                          setRequestFilter(f);
                        }}
                      />
                    ))
                  : null}
                {!requestsLoading && requests.length ? (
                  <Chip
                    nativeID="solicitudes-mas-filtros"
                    label={masFiltrosActivos ? `Más filtros · ${masFiltrosActivos}` : "Más filtros"}
                    activo={masFiltrosActivos > 0}
                    desplegable
                    abierto={masFiltrosSol}
                    onPress={() => setMasFiltrosSol((v) => !v)}
                  />
                ) : null}
              </FilaPastillas>
            {/* Filtros de la opción, la recogida y el método de contacto: desplegables del propio móvil, de dos en dos. */}
            {!requestsLoading && requests.length && masFiltrosSol ? (
              <View nativeID="solicitudes-filtros" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, borderRadius: 16, backgroundColor: COLORS.card, padding: 12 }}>
                <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "30%" }}>
                  <SelectorIOS
                    nativeID="solicitudes-filtro-opcion"
                    label="Opción"
                    value={filtroOpcion}
                    onChange={setFiltroOpcion}
                    options={[
                      { value: "ALL", label: "Todas" },
                      ...opcionesSolicitadas.map(([nombre, n]) => ({ value: nombre, label: `${nombre} (${n})` })),
                      { value: "SIN", label: `Sin opción (${requests.filter((r) => !r.modalidad).length})` },
                    ]}
                  />
                </View>
                <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "30%" }}>
                  <SelectorIOS
                    nativeID="solicitudes-filtro-recogida"
                    label="Recogida"
                    value={filtroRecogida}
                    onChange={(v) => setFiltroRecogida(v as "ALL" | "si" | "no")}
                    options={[
                      { value: "ALL", label: "Todas" },
                      { value: "si", label: `Con dirección de recogida (${cuentaRecogida})` },
                      { value: "no", label: `Sin dirección (${requests.length - cuentaRecogida})` },
                    ]}
                  />
                </View>
                {envioOk ? (
                  <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "30%" }}>
                    <SelectorIOS
                      nativeID="solicitudes-filtro-entrega"
                      label="Entrega"
                      value={filtroEntrega}
                      onChange={(v) => setFiltroEntrega(v as "ALL" | "recogida" | "correos")}
                      options={[
                        { value: "ALL", label: "Todas" },
                        { value: "recogida", label: `Recogida (${requests.length - cuentaPorEnvio})` },
                        { value: "correos", label: `Por envío (${cuentaPorEnvio})` },
                      ]}
                    />
                  </View>
                ) : null}
                <View style={{ flexGrow: 1, flexBasis: isMobile ? (envioOk ? "45%" : "100%") : "30%" }}>
                  <SelectorIOS
                    nativeID="solicitudes-filtro-metodo"
                    label="Contacto"
                    value={filtroMetodo}
                    onChange={(v) => setFiltroMetodo(v as "ALL" | MetodoContacto)}
                    options={[
                      { value: "ALL", label: "Todos" },
                      ...(Object.keys(METODO_LABEL) as MetodoContacto[]).map((m) => ({
                        value: m,
                        label: `${METODO_LABEL[m]} (${cuentaMetodo[m] ?? 0})`,
                      })),
                    ]}
                  />
                </View>
                {parte2Ok ? (
                  <View style={{ flexGrow: 1, flexBasis: isMobile ? "100%" : "30%" }}>
                    <SelectorIOS
                      nativeID="solicitudes-filtro-cobro"
                      label="Cobro y garantía"
                      value={filtroCobro}
                      onChange={(v) => setFiltroCobro(v as FiltroCobro)}
                      options={[
                        { value: "ALL", label: "Todas" },
                        { value: "avisado", label: `Dicen que ya pagaron (${cuentaCobro.avisado})` },
                        { value: "pendiente", label: `Pendientes de pago (${cuentaCobro.pendiente})` },
                        { value: "pagada", label: `Pagadas (${cuentaCobro.pagada})` },
                        { value: "sin_arreglo", label: `Sin arreglo (${cuentaCobro.sin_arreglo})` },
                        { value: "comprar", label: `Sin arreglo · te lo compramos (${cuentaCobro.comprar})` },
                        { value: "devolver", label: `Sin arreglo · devuélvemelo (${cuentaCobro.devolver})` },
                        { value: "garantia", label: `Garantía (${cuentaCobro.garantia})` },
                      ]}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
            </View>

            {/* Cuántas salen y «Abrir todas». */}
            <RecuentoLista
              nativeID="solicitudes-recuento"
              texto={
                requestsLoading
                  ? "Cargando…"
                  : busquedaSol.trim()
                    ? `${visiblesSol.length} ${visiblesSol.length === 1 ? "solicitud encontrada" : "solicitudes encontradas"}`
                    : `${visiblesSol.length} de ${requests.length} solicitudes`
              }
              abiertas={desplegablesSol.todasAbiertas(visiblesSol.map((r) => r.id))}
              onAlternar={!requestsLoading && visiblesSol.length ? () => desplegablesSol.abrirOCerrarTodas(visiblesSol.map((r) => r.id)) : undefined}
              idBoton="solicitudes-abrir-todas"
              femenino
            />

            {requestsLoading ? (
              <CargaMarca texto="Cargando solicitudes…" />
            ) : visiblesSol.length === 0 && requests.length ? (
              <ListaVacia nativeID="solicitudes-vacio" icono="document-text-outline" titulo="No hay solicitudes en esta lista." texto="Prueba a borrar el buscador o a elegir «Todas»." />
            ) : visiblesSol.length === 0 ? (
              <EstadoVacioPanel
                icon="document-text-outline"
                title="Sin solicitudes todavía"
                text="Aquí aparecerán los clientes que pulsen «Contratar servicio ahora» en la ficha de un servicio."
              />
            ) : (
              // Filas compactas separadas por una línea fina; al tocarlas, su detalle por bloques y las acciones abajo.
              <View nativeID="solicitudes-lista">{visiblesSol.map((r, i) => filaSolicitud(r, i))}</View>
            )}

            {/* Más datos de las solicitudes: los recuentos de siempre. */}
            {!requestsLoading && ((parte2Ok && requests.length) || numerosOk) ? (
              <Seccion nativeID="solicitudes-resumen" icon="stats-chart-outline" title="Más datos de las solicitudes" extra={`${requests.length} últimas`}>
                <View style={{ gap: 8, borderRadius: 16, backgroundColor: COLORS.card, padding: 14 }}>
                  {parte2Ok && requests.length ? (
                    <Detalle nativeID="servicios-cobros-resumen">
                      Cobros · dicen que ya pagaron: {cuentaCobro.avisado} · pendientes: {cuentaCobro.pendiente} · pagadas: {cuentaCobro.pagada} · sin arreglo:{" "}
                      {cuentaCobro.sin_arreglo} (te lo compramos {cuentaCobro.comprar}, devuélvemelo {cuentaCobro.devolver}) · garantías: {cuentaCobro.garantia} (abiertas{" "}
                      {garantiasAbiertas})
                    </Detalle>
                  ) : null}
                  {numerosOk ? (
                    <Detalle nativeID="servicios-numeros">
                      Números de seguimiento · de VeoAura: {resumenNumeros.veoaura} (en la cuenta del cliente: {resumenNumeros.veoauraVinculadas}) ·
                      añadidas con su número: {resumenNumeros.anadidasConNumero} · sin cuenta: {resumenNumeros.sinCuenta} · asignadas desde
                      el chat: {resumenNumeros.desdeChat}
                    </Detalle>
                  ) : null}
                </View>
              </Seccion>
            ) : null}
          </>
      )}
        </Animated.View>
      </ScrollView>

      {/* «Nuevo servicio»: el «+» flotante abajo a la derecha, como en Productos (al alcance del pulgar). */}
      {tab === "catalogo" && !loading ? <BotonFlotante nativeID="servicio-nuevo" label="Nuevo servicio" onPress={openCreate} /> : null}

      {/* Las fotos de un servicio en grande, con zoom (el mismo visor que la ficha de producto). */}
      <VisorFotos
        visible={!!visor}
        images={visor?.fotos ?? []}
        initialIndex={visor?.inicio ?? 0}
        onClose={() => setVisor(null)}
      />
      {/* Fotos de recepción de una reparación por envío (enlaces firmados de 5 minutos). */}
      <VisorFotos visible={!!visorEnvio} images={visorEnvio ?? []} initialIndex={0} onClose={() => setVisorEnvio(null)} />

      {/* Modal crear/editar servicio: cabecera fija con la X y el
          formulario desplazable dentro (maxHeight), con sitio para el
          teclado en iOS. */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: 1,
            backgroundColor: "rgba(11,33,56,0.55)",
            paddingHorizontal: 16,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              ...modalColumnStyle,
              maxHeight: "92%",
              borderRadius: 22,
              backgroundColor: COLORS.bg,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                position: "relative",
                justifyContent: "center",
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>
                {editing ? "Editar servicio" : "Nuevo servicio"}
              </Text>
            </View>

            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={CIERRE_TECLADO}
            >
              <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Reparación de pantalla" />
              <TextField
                label="Descripción"
                value={desc}
                onChangeText={setDesc}
                placeholder="Qué incluye el servicio, tiempo estimado, garantía…"
                multiline
              />
              {/* Los emojis no salen en la tienda (sinEmojis; dueño, 2026-11-04): se avisa al escribirlos. */}
              {contarEmojis(desc) > 0 ? (
                <Text nativeID="servicio-aviso-emojis" style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center", marginTop: -6 }}>
                  En la tienda la descripción se verá sin {contarEmojis(desc) === 1 ? "su emoji" : `sus ${contarEmojis(desc)} emojis`}.
                </Text>
              ) : null}
              {opciones.some((o) => o.nombre.trim() || o.precio.trim()) ? null : (
                <TextField label="Precio (€)" value={price} onChangeText={setPrice} placeholder="0,00" keyboardType="decimal-pad" />
              )}

              {/* Reparación por envío, parte 2: el peso de UN aparato de este servicio con su caja (para la etiqueta de
                  Correos). «Estimado» hasta que el dueño lo guarde (o lo dé por bueno). */}
              {pesosOk ? (
                <View nativeID="servicio-peso-envio" style={{ gap: 4, width: "100%", alignSelf: "stretch" }}>
                  <TextField
                    label="Peso para el envío (kg, con su caja)"
                    value={pesoEnvio}
                    onChangeText={(t) => {
                      setPesoEnvio(t);
                      setPesoTocado(true);
                    }}
                    placeholder="Vacío = el peso por defecto"
                    keyboardType="decimal-pad"
                  />
                  {pesoEstimado && !pesoTocado && pesoEnvio.trim() ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <Text nativeID="servicio-peso-estimado" style={{ color: COLORS.warning, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                        Estimado: corrígelo con el real o dalo por bueno
                      </Text>
                      <ChipButton label="Es correcto" icon="checkmark" isMobile={isMobile} onPress={() => setPesoTocado(true)} />
                    </View>
                  ) : null}
                  <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 17, textAlign: "center" }}>
                    Tramos de Correos: hasta 1, 2, 3, 4, 5, 10… kg. Con varios aparatos se suma.
                  </Text>
                </View>
              ) : null}

              {/* Opciones que elige el cliente en la ficha y al contratar (dueño, 2026-11-08): nombre y precio de cada
                  una; la primera sale elegida. Con opciones, el precio del servicio es el de la más barata. */}
              {opcionesOk ? (
                <View nativeID="servicio-opciones" style={{ gap: 8, width: "100%", alignSelf: "stretch" }}>
                  <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13, textAlign: "center" }}>Opciones del servicio</Text>
                  <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
                    Por ejemplo «Básica» y «Completa + mando». El cliente elige una en la ficha; la primera sale elegida. Sin
                    opciones, el servicio tiene un solo precio.
                  </Text>
                  {opciones.map((o, i) => {
                    const fotoUri = o.foto?.startsWith("nueva:")
                      ? newMedia.find((m) => m.id === o.foto?.slice(6))?.previewUrl ?? null
                      : o.foto && existingMedia.some((m) => m.public_url === o.foto)
                        ? o.foto
                        : null;
                    const todas = [
                      ...existingMedia.filter((m) => m.public_url).map((m) => ({ valor: m.public_url as string, uri: m.public_url as string })),
                      ...newMedia.map((m) => ({ valor: `nueva:${m.id}`, uri: m.previewUrl })),
                    ];
                    const ponerFoto = (foto: string | null) => {
                      setOpciones((prev) => prev.map((x, j) => (j === i ? { ...x, foto } : x)));
                      setFotoOpcionAbierta(null);
                    };
                    return (
                    <View key={i} style={{ gap: 8, width: "100%" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, width: "100%" }}>
                      {/* La foto de la opción (dueño, 2026-11-09): sale en la ficha al elegirla. */}
                      <Pressable
                        nativeID={`servicio-opcion-foto-${i}`}
                        onPress={() => setFotoOpcionAbierta((v) => (v === i ? null : i))}
                        accessibilityRole="button"
                        accessibilityLabel={fotoUri ? `Cambiar la foto de la opción ${o.nombre || i + 1}` : `Poner foto a la opción ${o.nombre || i + 1}`}
                        style={({ pressed }) => ({
                          width: 48,
                          height: 48,
                          flexShrink: 0,
                          borderRadius: 12,
                          overflow: "hidden",
                          borderWidth: 1,
                          borderStyle: fotoUri ? "solid" : "dashed",
                          borderColor: fotoOpcionAbierta === i ? COLORS.accent : COLORS.border,
                          backgroundColor: COLORS.cardSoft,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        {fotoUri ? (
                          <ImagenInteligente uri={fotoUri} style={{ width: 48, height: 48 }} />
                        ) : (
                          <Ionicons name="image-outline" size={20} color={COLORS.muted} />
                        )}
                      </Pressable>
                      <TextInput
                        nativeID={`servicio-opcion-nombre-${i}`}
                        value={o.nombre}
                        onChangeText={(v) => setOpciones((prev) => prev.map((x, j) => (j === i ? { ...x, nombre: v } : x)))}
                        placeholder="Nombre (Básica)"
                        placeholderTextColor={COLORS.muted2}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          width: 0,
                          minHeight: 48,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          borderRadius: 14,
                          paddingHorizontal: 12,
                          fontSize: 16,
                          color: COLORS.text,
                          backgroundColor: COLORS.cardSoft,
                        }}
                      />
                      <TextInput
                        nativeID={`servicio-opcion-precio-${i}`}
                        value={o.precio}
                        onChangeText={(v) => setOpciones((prev) => prev.map((x, j) => (j === i ? { ...x, precio: v } : x)))}
                        placeholder="0,00 €"
                        placeholderTextColor={COLORS.muted2}
                        keyboardType="decimal-pad"
                        style={{
                          width: 96,
                          flexShrink: 0,
                          minHeight: 48,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          borderRadius: 14,
                          paddingHorizontal: 12,
                          fontSize: 16,
                          color: COLORS.text,
                          backgroundColor: COLORS.cardSoft,
                          textAlign: "center",
                        }}
                      />
                      <BotonIconoPanel
                        icon="trash-outline"
                        label={`Quitar la opción ${o.nombre || i + 1}`}
                        variant="danger"
                        onPress={() => {
                          setOpciones((prev) => prev.filter((_, j) => j !== i));
                          setFotoOpcionAbierta(null);
                        }}
                      />
                    </View>
                    {fotoOpcionAbierta === i ? (
                      <View
                        nativeID={`servicio-opcion-fotos-${i}`}
                        style={{ gap: 8, padding: 10, borderRadius: 14, backgroundColor: COLORS.cardSoft, borderWidth: 1, borderColor: COLORS.border }}
                      >
                        <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                          Elige la foto de «{o.nombre.trim() || `opción ${i + 1}`}» o sube una nueva
                        </Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                          {todas.map((f) => (
                            <Pressable
                              key={f.valor}
                              onPress={() => ponerFoto(f.valor)}
                              accessibilityRole="button"
                              accessibilityLabel="Usar esta foto"
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 10,
                                overflow: "hidden",
                                borderWidth: o.foto === f.valor ? 3 : 1,
                                borderColor: o.foto === f.valor ? COLORS.accent : COLORS.border,
                              }}
                            >
                              <ImagenInteligente uri={f.uri} style={{ width: "100%", height: "100%" }} />
                            </Pressable>
                          ))}
                        </View>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                          <ChipButton
                            icon="cloud-upload-outline"
                            label="Subir foto"
                            onPress={async () => {
                              const añadidas = await pickPhotos();
                              if (añadidas[0]) ponerFoto(`nueva:${añadidas[0].id}`);
                            }}
                            isMobile={isMobile}
                          />
                          {o.foto ? <ChipButton icon="close" label="Sin foto" onPress={() => ponerFoto(null)} isMobile={isMobile} /> : null}
                        </View>
                      </View>
                    ) : null}
                    </View>
                    );
                  })}
                  {opciones.length < 12 ? (
                    <View style={{ alignItems: "center" }}>
                      <ChipButton
                        icon="add"
                        label="Añadir opción"
                        onPress={() =>
                          setOpciones((prev) => [
                            ...prev,
                            // La primera opción nueva arranca con el precio que ya tenía el servicio.
                            { nombre: "", precio: prev.length ? "" : price, foto: null },
                          ])
                        }
                        isMobile={isMobile}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Desplegable con el selector del propio móvil (en el iPhone, la rueda de iOS; dueño, 2026-11-04). */}
              <SelectorIOS
                nativeID="servicio-estado"
                label="Estado"
                centrado
                value={status}
                onChange={(v) => setStatus(v as ServiceStatus)}
                options={(["DRAFT", "PUBLISHED"] as ServiceStatus[]).map((st) => ({ value: st, label: STATUS_LABEL[st] }))}
              />

              <Pressable
                onPress={() => setIsActive((v) => !v)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  alignSelf: "center",
                  gap: 10,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Ionicons
                  name={isActive ? "checkbox" : "square-outline"}
                  size={22}
                  color={isActive ? COLORS.accent : COLORS.muted}
                />
                <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 13 }}>Visible en la tienda</Text>
              </Pressable>

              <View style={{ gap: 8, alignItems: "center" }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13, textAlign: "center" }}>
                  Fotos ({existingMedia.length + newMedia.length}/{MAX_FOTOS_PRODUCTO})
                </Text>

                {/* Quitar varias a la vez (dueño, 2026-11-04). */}
                <BarraSeleccionFotos
                  total={existingMedia.length + newMedia.length}
                  seleccionando={seleccion.seleccionando}
                  elegidas={seleccion.elegidas.length}
                  onEmpezar={seleccion.empezar}
                  onTodas={() => seleccion.setElegidas([...existingMedia.map((m) => m.id), ...newMedia.map((m) => m.id)])}
                  onQuitar={quitarElegidas}
                  onTerminar={seleccion.terminar}
                />

                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                  {/* Las fotos ya guardadas y las nuevas, igual. Eligiendo varias, toda la miniatura se toca y lleva su
                      marca (sin «Usar» ni la X); si no, «Usar»/«Portada» y la X de cada una. */}
                  {[
                    ...existingMedia.map((m) => ({ id: m.id, uri: m.public_url ?? "", quitar: () => removeExistingPhoto(m.id) })),
                    ...newMedia.map((m) => ({ id: m.id, uri: m.previewUrl, quitar: () => removeNewPhoto(m.id) })),
                  ].map((f) => {
                    const elegida = seleccion.elegidas.includes(f.id);
                    return (
                      <View key={f.id} nativeID={`servicio-foto-${f.id}`} style={{ width: 76, height: 76 }}>
                        <ImagenInteligente uri={f.uri} style={{ width: 76, height: 76, borderRadius: 12, backgroundColor: COLORS.cardSoft }} />
                        {seleccion.seleccionando ? (
                          <Pressable
                            onPress={() => seleccion.alternar(f.id)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: elegida }}
                            accessibilityLabel="Elegir esta foto"
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              borderRadius: 12,
                              borderWidth: elegida ? 3 : 0,
                              borderColor: COLORS.accent,
                              backgroundColor: elegida ? "rgba(30,167,232,0.22)" : "transparent",
                            }}
                          >
                            <MarcaSeleccion elegida={elegida} />
                          </Pressable>
                        ) : (
                          <>
                            <Pressable
                              onPress={() => setCoverId(f.id)}
                              hitSlop={8}
                              style={{
                                position: "absolute",
                                top: 4,
                                left: 4,
                                backgroundColor: coverId === f.id ? COLORS.accent : "rgba(11,33,56,0.55)",
                                borderRadius: 999,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                              }}
                            >
                              <Text style={{ color: "#FFFFFF", fontSize: TAMANOS.legal, fontWeight: "900" }}>{coverId === f.id ? "Portada" : "Usar"}</Text>
                            </Pressable>
                            <Pressable
                              onPress={f.quitar}
                              accessibilityRole="button"
                              accessibilityLabel="Quitar esta foto"
                              style={{ position: "absolute", top: 0, right: 0, width: TACTIL.minimo, height: TACTIL.minimo, alignItems: "center", justifyContent: "center" }}
                            >
                              {/* El icono ya es redondo y oscuro (se ve sobre cualquier foto): sin burbuja alrededor. */}
                              <Ionicons name="close-circle" size={22} color="rgba(11,33,56,0.85)" />
                            </Pressable>
                          </>
                        )}
                      </View>
                    );
                  })}

                  <Pressable
                    onPress={pickPhotos}
                    disabled={picking}
                    style={({ pressed }) => ({
                      width: 76,
                      height: 76,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: COLORS.accentBorder,
                      backgroundColor: COLORS.accent2,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: picking ? 0.6 : pressed ? 0.85 : 1,
                    })}
                  >
                    {picking ? (
                      <ActivityIndicator size="small" color={COLORS.accent} />
                    ) : (
                      <Ionicons name="add" size={22} color={COLORS.accent} />
                    )}
                  </Pressable>
                </View>

                {picking && (
                  <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                    Procesando fotos… puede tardar unos segundos si son varias o vienen en formato
                    HEIC del iPhone.
                  </Text>
                )}

                {/* Las quitadas se borran al guardar; hasta entonces se pueden devolver. */}
                {removedMedia.length > 0 ? (
                  <View nativeID="servicio-fotos-quitadas" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, fontWeight: "700", textAlign: "center" }}>
                      {removedMedia.length === 1 ? "1 foto quitada" : `${removedMedia.length} fotos quitadas`}: se borran al guardar los cambios.
                    </Text>
                    <Pressable onPress={deshacerQuitadas} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 8, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
                      <Text style={{ color: COLORS.accentText, fontWeight: "900", fontSize: 13 }}>Deshacer</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {!!modalErr && <AvisoPanel tone="danger" text={modalErr} />}
            </ScrollView>

            {/* Abajo y siempre a la vista: el botón principal y, a su derecha, la X para cerrar. */}
            <View style={{ padding: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <PieVentana nativeID="servicio-ventana-pie" onCerrar={closeModal}>
                <View style={{ flex: 1 }}>
                  <BotonPrincipalPanel
                    label={saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear servicio"}
                    onPress={save}
                    disabled={saving}
                    fullWidth
                  />
                </View>
              </PieVentana>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Confirmar borrado de servicio */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", padding: 16, justifyContent: "center" }}>
          <View style={{ ...modalColumnStyle, borderRadius: 20, backgroundColor: COLORS.bg, padding: 18, gap: 14 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>¿Borrar este servicio?</Text>
            <Text style={{ color: COLORS.muted, lineHeight: 19, textAlign: "center" }}>
              Se borrará «{deleteTarget?.title}» y sus fotos. Esta acción no se puede deshacer.
            </Text>
            <PieVentana onCerrar={() => setDeleteTarget(null)}>
              <View style={{ flex: 1 }}>
                <ChipButton label={deleting ? "Borrando…" : "Borrar"} onPress={confirmDelete} variant="danger" disabled={deleting} fullWidth />
              </View>
            </PieVentana>
          </View>
        </View>
      </Modal>

      {/* Confirmar borrado de solicitud */}
      <Modal visible={!!deleteRequestTarget} transparent animationType="fade" onRequestClose={() => setDeleteRequestTarget(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", padding: 16, justifyContent: "center" }}>
          <View style={{ ...modalColumnStyle, borderRadius: 20, backgroundColor: COLORS.bg, padding: 18, gap: 14 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>¿Borrar esta solicitud?</Text>
            <Text style={{ color: COLORS.muted, lineHeight: 19, textAlign: "center" }}>
              Se borrará la solicitud de {deleteRequestTarget?.nombre}. Esta acción no se puede deshacer.
            </Text>
            <PieVentana onCerrar={() => setDeleteRequestTarget(null)}>
              <View style={{ flex: 1 }}>
                <ChipButton label="Borrar" onPress={confirmDeleteRequest} variant="danger" fullWidth />
              </View>
            </PieVentana>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
