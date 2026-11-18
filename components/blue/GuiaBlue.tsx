/**
 * Archivo: components/blue/GuiaBlue.tsx
 * Función: la guía de Blue («Te enseño la tienda»): oscurece la pantalla, señala cada parte con la mano y la tarjeta,
 *          y va paso a paso por la sección en la que está el cliente.
 * Para qué sirve: enseñar la tienda a quien entra por primera vez o la pide desde Blue. Se separó de
 *          components/AsistenteBlue.tsx en la tanda 6 de «ordenar el proyecto» (2026-11-18), sin cambiar nada.
 * Conectado con: components/blue/PasosGuia.tsx, components/blue/PiezasBlue.tsx, components/blue/AyudasBlue.tsx,
 *          components/blue/DatosBlue.tsx y la analítica propia.
 * Utilizado por: components/AsistenteBlue.tsx.
 * Dependencias: react, react-native, expo-router, @expo/vector-icons.
 * Estado: ACTIVO
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Modal, PanResponder, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { marcarOrigenVender, medirEvento } from "../../lib/analiticaPropia";
import MarcaAnimada from "../marca/MarcaAnimada";
import { escribirEnBuscadorDemo } from "../BarraBusqueda";
import { TAMANOS } from "../../constants/temaTienda";
import { cargarAjustesReparacionEnvio } from "../../lib/envio";
import { COLORS, PagoOnlineGuia, SELECTOR_VISTO_KEY, consultarPagoOnline } from "./DatosBlue";
import { BLUE_DOM_ID, USA_NATIVO, limitar } from "./AyudasBlue";
import { BotonPanel, Caja, medirObjetivo } from "./PiezasBlue";
import { ALTO_COMPACTA, ALTO_COMPACTA_ACCION, ALTO_TARJETA, ASENTAR_TRAS_REINTENTOS_MS, BOTON_IR_A_PAGAR, CAPACIDADES_BLUE, ChipsForo, EJEMPLOS_POR_DEFECTO, EjemploBuscador, EjemplosBuscador, FONDO_GUIA, FilaIconos, GESTOS_DEL_FORO, MARGEN_ARO, ManoToque, NOMBRE_SECCION_GUIA, NombresSeccionesSiri, PASOS_DE_COMPRA, PASOS_GUIA, PESTANAS_FORO, PasoGuia, SECCIONES_GUIA, SeccionGuia, SelectorSecciones, botonSelectorForo, desplazarDom, filasBuscadorQueCaben, idDeArticuloReciente, menuForoAbierto, nombreDeArticulo, panesOscuros, pestanaDelMenuForo, primeroVisible, pulsarEnPagina, tituloDePagina } from "./PasosGuia";

export function GuiaBlue({
  onCerrar: cerrarSinMedir,
  onIr,
  onInstalar,
  instalable,
  conSesion,
  onSenalaBlue,
  seccion,
  rutaFija,
}: {
  // volver = true: se cierra sin más (Saltar, «Ahora no», atrás del móvil) y la persona vuelve a la pantalla donde
  // abrió la guía. Con una acción (Crear cuenta, Instalar…) no se vuelve: esa acción lleva a otro sitio.
  onCerrar: (volver?: boolean) => void;
  onIr: (ruta: string) => void;
  onInstalar: () => void;
  // El paso «Instala la tienda» solo sale si se puede instalar en este dispositivo.
  instalable: boolean;
  // Con sesión iniciada: sale «Mis seguimientos» y no sale «Tu cuenta» (crear cuenta).
  conSesion: boolean;
  // Avisa a Blue de si este paso le señala a él (mientras no, se esconde para no tapar la guía).
  onSenalaBlue: (si: boolean) => void;
  // Mini-guía: solo los pasos de esa pantalla. Si es la pantalla donde ya está la persona, la guía no se mueve de ella
  // (`rutaFija`); si es otra, cada paso la lleva hasta allí. Sin `seccion` es la guía completa.
  seccion?: SeccionGuia;
  rutaFija?: string;
}) {
  const [paso, setPaso] = useState(0);
  // Artículo publicado más reciente: con él se enseña la ficha (undefined = leyéndolo, null = la tienda no tiene).
  const [productoId, setProductoId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    idDeArticuloReciente().then(
      (id) => vivo && setProductoId(id),
      () => vivo && setProductoId(null)
    );
    return () => {
      vivo = false;
    };
  }, []);
  // ¿Está activa la reparación por envío? (la tienda lo lee como siempre; sin sesión, sin la migración o si falla: no, y
  // entonces la guía ni la menciona.)
  const [envioActivo, setEnvioActivo] = useState(false);
  useEffect(() => {
    let vivo = true;
    cargarAjustesReparacionEnvio().then(
      (a) => vivo && setEnvioActivo(!!a?.activo),
      () => {}
    );
    return () => {
      vivo = false;
    };
  }, []);
  // Formas de pago online que ofrece el servidor (la misma consulta GET /api/pago que el checkout): «Cómo se compra» solo
  // nombra las que existen. null = aún no se sabe o no hay servidor (dist estático): texto sin formas concretas.
  const [pagoOnline, setPagoOnline] = useState<PagoOnlineGuia | null>(null);
  useEffect(() => {
    let vivo = true;
    // (sin servidor: sin formas de pago concretas)
    void consultarPagoOnline().then((p) => {
      if (vivo && p) setPagoOnline(p);
    });
    return () => {
      vivo = false;
    };
  }, []);
  const pasos = React.useMemo(() => {
    const aplicables = PASOS_GUIA.filter(
      (x) =>
        (!x.soloInstalable || instalable) &&
        (!x.soloConSesion || conSesion) &&
        (!x.soloSinSesion || !conSesion) &&
        (!x.soloConProducto || productoId !== null) &&
        (!x.soloConEnvio || envioActivo)
    );
    if (!seccion) return aplicables;
    // Mini-guía: solo los pasos de esa pantalla.
    const deLaSeccion = aplicables.filter((x) => x.seccion === seccion);
    if (deLaSeccion.length) return deLaSeccion;
    // Si no queda ninguno (p. ej. la tienda aún no tiene artículos que enseñar) NO se cambia a la guía completa: se enseña
    // el paso de esa pantalla tal cual, sin llevar a ninguna ficha.
    const sinArticulo = PASOS_GUIA.filter((x) => x.seccion === seccion && (!x.soloConSesion || conSesion) && (!x.soloSinSesion || !conSesion) && (!x.soloConEnvio || envioActivo));
    return sinArticulo.length ? sinArticulo : aplicables;
  }, [instalable, conSesion, productoId, seccion, envioActivo]);
  const total = pasos.length;
  const p = pasos[Math.min(paso, pasos.length - 1)];
  // «Ir a pagar» está en pantalla (solo con artículos en la cesta): el texto del paso «Cesta» lo nombra.
  const [pagarVisible, setPagarVisible] = useState(false);
  // Si la lista de pasos cambia a mitad de la guía (p. ej. se quita «Un artículo» porque no hay artículos), la persona
  // sigue en el MISMO paso.
  const pasoObjRef = useRef<PasoGuia>(PASOS_GUIA[0]);
  useEffect(() => {
    const i = pasos.indexOf(pasoObjRef.current);
    if (i >= 0) {
      setPaso((actual) => (actual === i ? actual : i));
    } else {
      const j = Math.min(pasoRef.current, pasos.length - 1);
      pasoObjRef.current = pasos[j];
      setPaso(j);
    }
  }, [pasos]);
  const textoPaso = typeof p.texto === "function" ? p.texto(conSesion, { pagarVisible, pago: pagoOnline }) : p.texto;
  // Número del paso SIEMPRE el mismo (con o sin sesión), para que la analítica no mezcle pasos distintos.
  const numeroPaso = (s: PasoGuia) => String(PASOS_GUIA.indexOf(s) + 1).padStart(2, "0");
  // Quien ha visto el paso de «Vender ahora» y luego abre el formulario (en la hora siguiente) cuenta «desde la guía».
  const vioVenderRef = useRef(false);
  useEffect(() => {
    const i = pasos.findIndex((s) => s.demo === "vender-toque");
    if (i >= 0 && paso >= i) vioVenderRef.current = true;
  }, [paso, pasos]);
  useEffect(
    () => () => {
      if (vioVenderRef.current) marcarOrigenVender("guia", 60);
    },
    []
  );

  // Embudo: en qué paso está cada visitante (con su consentimiento de analítica) y cómo
  // termina la guía. Así se ve en el panel dónde se pierde la gente y cuántos llegan al
  // formulario de Vender.
  // (Las mini-guías se miden aparte —miniguia_*— para no mezclarlas con el embudo de la guía completa.)
  const eventoGuia = seccion ? "miniguia" : "guia";
  const rotuloGuia = seccion ? `Mini-guía ${NOMBRE_SECCION_GUIA[seccion]}` : "Guía Blue";
  useEffect(() => {
    medirEvento(`${eventoGuia}_paso`, `${rotuloGuia}: ${numeroPaso(p)} ${p.titulo}`);
    if (paso === total - 1) medirEvento(`${eventoGuia}_completada`, `${rotuloGuia}: completada`);
    // Si la guía ya enseñó el selector de pestañas del Foro, el aviso suelto no vuelve a salir.
    if (p.objetivo?.some((o) => o.includes("selector-pestanas"))) {
      AsyncStorage.setItem(SELECTOR_VISTO_KEY, "1").catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, p.titulo, p.objetivo, total]);
  const pasoActualRef = useRef(0);
  pasoActualRef.current = paso;
  const pathname = usePathname() ?? "";
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  // Para las demostraciones: sección elegida en el paso «Las 5 secciones» y ejemplo elegido en «El buscador».
  const [seccionElegida, setSeccionElegida] = useState<{ i: number; n: number }>({ i: -1, n: 0 });
  const [ejemploElegido, setEjemploElegido] = useState<number | null>(null);
  // Ejemplos del buscador: null = aún se están leyendo los nombres de la tienda.
  const [ejemplos, setEjemplos] = useState<EjemploBuscador[] | null>(null);
  // Pestaña del Foro que se está enseñando y si la persona ha tomado el mando (entonces la guía deja de moverlas).
  const [pestanaForo, setPestanaForo] = useState(0);
  const [foroManual, setForoManual] = useState(false);
  // Dónde apunta el puntero en los pasos de «tocar» cuando no es el centro del recuadro (la pestaña «Mis seguimientos»).
  const [puntoToque, setPuntoToque] = useState<{ x: number; y: number } | null>(null);
  const [anchoSiguiente, setAnchoSiguiente] = useState(0);
  // false mientras la guía desplaza la página hasta lo señalado: hasta que se asienta, la tarjeta no se aparta (paso «Un artículo»).
  const [asentada, setAsentada] = useState(true);
  useEffect(() => {
    setSeccionElegida({ i: -1, n: 0 });
    setEjemploElegido(null);
    setPestanaForo(0);
    setForoManual(false);
    setPuntoToque(null);
  }, [paso]);
  const onCerrar = useCallback(() => {
    const i = pasoActualRef.current;
    if (i < total - 1) {
      medirEvento(`${eventoGuia}_saltada`, `${rotuloGuia}: saltada`);
      medirEvento(`${eventoGuia}_saltada_en`, `${rotuloGuia}: saltada en el paso ${numeroPaso(pasos[i])} ${pasos[i].titulo}`);
    }
    escribirEnBuscadorDemo(null);
    cerrarSinMedir(true);
  }, [cerrarSinMedir, total, pasos, eventoGuia, rotuloGuia]);
  const anim = useRef(new Animated.Value(1)).current;
  const direccion = useRef(1);
  const [caja, setCaja] = useState<Caja | null>(null);
  // Caja del TÍTULO de la página en la que está la guía (se enmarca con «Estás aquí»).
  const [cajaTitulo, setCajaTitulo] = useState<Caja | null>(null);
  const [pantalla, setPantalla] = useState(() => Dimensions.get("window"));

  // La guía te lleva de la mano: en cada paso cambia sola a la pantalla de la que habla
  // (Inicio, Perfil, Cesta, Foro, Blue IA…). Al abrirse en otra pantalla, vuelve a Inicio.
  // («{producto}» es el artículo más reciente; con ?guia=1 la ficha no cuenta la visita.)
  // (La mini-guía de la pantalla donde ya está la persona no cambia de pantalla: se queda donde estaba.)
  const destino = seccion && rutaFija ? rutaFija : (p.ruta ?? "/").replace("{producto}", productoId ?? "");
  useEffect(() => {
    // En cada paso (aunque la pantalla sea la misma que la del paso anterior: en «Las 5 secciones» se puede haber
    // cambiado de sección desde la tarjeta). El pathname no lleva «?guia=1», por eso se compara sin él.
    if (destino.endsWith("/producto/") || destino.includes("/producto/?")) return; // aún no se sabe qué artículo enseñar
    if (pathnameRef.current !== destino.split("?")[0]) router.navigate(destino as Href);
    // solo al cambiar de paso
  }, [destino, paso]);

  useEffect(() => {
    onSenalaBlue(!!p.objetivo?.includes(`#${BLUE_DOM_ID}`));
  }, [p, onSenalaBlue]);

  // Mide el botón del paso (tras un instante, para que la pantalla ya esté pintada) y
  // vuelve a medir si cambia el tamaño de la pantalla.
  useEffect(() => {
    setCaja(null);
    setCajaTitulo(null);
    // Trae a la vista lo que hay que enseñar (desplaza Inicio hasta el botón o la sección).
    const traer = (primera = true) => {
      if (Platform.OS !== "web" || typeof document === "undefined") return;
      // Inicio arriba del todo (cualquier contenedor desplazado vuelve al principio).
      if (p.arriba && primera) {
        for (const el of Array.from(document.querySelectorAll("*"))) {
          if (el.scrollTop > 0) desplazarDom(el, { top: 0, behavior: "smooth" });
        }
      }
      if (!p.desplazar) return;
      const el = Array.from(document.querySelectorAll(p.desplazar)).find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
      });
      if (!el) return;
      // Lo señalado se deja en la parte de ARRIBA de la pantalla (hacia el 22 %): así la tarjeta, que va fija a la
      // altura del pulgar, no lo tapa y «Siguiente» no tiene que cambiar de sitio.
      // (si ya está donde toca, no se vuelve a desplazar: lo señalado puede tardar en aparecer, p. ej. los botones de la
      // ficha mientras carga el artículo, y por eso se reintenta unas veces)
      const faltan = el.getBoundingClientRect().top - window.innerHeight * 0.22;
      if (Math.abs(faltan) < 40) return;
      let contenedor: HTMLElement | null = el.parentElement;
      while (contenedor && !(contenedor.scrollHeight > contenedor.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(contenedor).overflowY))) {
        contenedor = contenedor.parentElement;
      }
      if (contenedor) {
        desplazarDom(contenedor, { top: faltan, behavior: "smooth" }, true);
      } else {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    };
    const t0 = setTimeout(() => traer(true), 200);
    const reintentos = p.desplazar ? [1000, 1900, 2900].map((ms) => setTimeout(() => traer(false), ms)) : [];
    // Sin recuadro ni título que enmarcar (primer paso, instalar, crear cuenta): no hay nada que medir.
    if (!p.objetivo && p.sinTitulo) {
      return () => {
        clearTimeout(t0);
        reintentos.forEach(clearTimeout);
      };
    }
    const selectoresTitulo = p.sinTitulo ? null : tituloDePagina(pathname);
    // (Solo se actualiza lo que de verdad ha cambiado de sitio: así medir a menudo no vuelve a pintar la guía en balde.)
    const cambio = (a: Caja | null, b: Caja | null) =>
      a === b || (!!a && !!b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1) ? a : b;
    const medirPaso = () => medirObjetivo(p.objetivo) ?? medirObjetivo(p.alternativa);
    // Mientras la guía desplaza la página hasta lo señalado (la ficha), el recuadro pasa por sitios por los que luego no se
    // queda: la tarjeta NO se coloca hasta que se ha asentado (dos fotogramas seguidos sin cambio y al menos 0,9 s, para
    // que ya haya empezado el desplazamiento). Si no, «Siguiente» a veces quedaba en otro sitio (se medía en pleno movimiento).
    let marco = 0;
    if (p.desplazar && Platform.OS === "web" && typeof requestAnimationFrame !== "undefined") {
      setAsentada(false);
      const inicio = Date.now();
      let anterior: Caja | null = null;
      let quietos = 0;
      let asentadaAhora = false;
      const fotograma = () => {
        const c = medirPaso();
        quietos = c && anterior && Math.abs(c.x - anterior.x) < 1 && Math.abs(c.y - anterior.y) < 1 && Math.abs(c.w - anterior.w) < 1 && Math.abs(c.h - anterior.h) < 1 ? quietos + 1 : 0;
        anterior = c;
        const pasado = Date.now() - inicio;
        // (Si lo señalado tarda en aparecer —la ficha carga el artículo— no se da por asentado hasta que aparezca y se quede
        // quieto; el límite de 9 s es solo para no vigilar para siempre un paso sin nada que enmarcar.)
        // (Y no antes de que terminen los reintentos de «traer» —el último a los 2,9 s, más lo que tarda el desplazamiento suave—:
        // si lo señalado aparece tarde y se queda quieto un momento antes de que la guía lo suba, daba por asentado un sitio por
        // el que luego no se quedaba, la tarjeta saltaba hacia arriba y volvía —«Siguiente» se movía unos 164 px—.)
        const lista = pasado >= 9000 || (pasado >= ASENTAR_TRAS_REINTENTOS_MS && quietos >= 2);
        if (lista !== asentadaAhora) {
          asentadaAhora = lista;
          // Al asentarse, el recuadro se pone ya donde ha quedado (sin esperar a la siguiente medida periódica).
          if (lista) setCaja((antes) => cambio(antes, c));
          setAsentada(lista);
        }
        if (pasado < 9000) marco = requestAnimationFrame(fotograma);
      };
      marco = requestAnimationFrame(fotograma);
    } else {
      setAsentada(true);
    }
    const medir = () => {
      setPantalla(Dimensions.get("window"));
      if (p.objetivo?.includes(BOTON_IR_A_PAGAR)) setPagarVisible(!!medirObjetivo([BOTON_IR_A_PAGAR]));
      const c = medirPaso();
      const nueva = c && p.limiteAlto ? { ...c, h: Math.min(c.h, p.limiteAlto) } : c;
      setCaja((antes) => cambio(antes, nueva));
      const t = selectoresTitulo ? medirObjetivo(selectoresTitulo) : null;
      setCajaTitulo((antes) => cambio(antes, t));
    };
    const t1 = setTimeout(medir, 700);
    const t2 = setTimeout(medir, 1300);
    const t3 = setTimeout(medir, 2000);
    // El buscador enseña resultados que van apareciendo: el hueco iluminado los sigue.
    // Lo mismo donde la página se mueve sola durante el paso (el formulario que baja y sube, las pestañas de Perfil).
    // Y donde la guía desplaza la página hasta lo señalado (la ficha, Inicio): el recuadro sigue a lo que se mueve.
    // En los demás pasos también, más despacio: la página puede acabar de colocarse después de medir (p. ej. el
    // catálogo, que recoloca sus botones al cargar los artículos).
    const vigilar =
      p.demo === "buscador"
        ? setInterval(medir, 400)
        : p.demo === "formulario" || p.demo === "perfil-seguimientos" || p.demo === "perfil-pedidos" || p.demo === "perfil-megusta" || p.desplazar
        ? setInterval(medir, 250)
        : setInterval(medir, 500);
    const sub = Dimensions.addEventListener("change", medir);
    return () => {
      clearTimeout(t0);
      reintentos.forEach(clearTimeout);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (vigilar) clearInterval(vigilar);
      if (marco && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(marco);
      // @ts-ignore — API antigua (RN<0.65) devuelve undefined
      sub?.remove?.();
    };
  }, [p, pathname]);

  // Aro que late y flecha que bota sobre el botón señalado.
  const latido = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: USA_NATIVO }),
        Animated.timing(latido, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: USA_NATIVO }),
      ])
    );
    bucle.start();
    return () => bucle.stop();
  }, [latido]);

  const pasoRef = useRef(paso);
  pasoRef.current = paso;

  const irA = useCallback(
    (n: number) => {
      const actual = pasoRef.current;
      const destino = limitar(n, 0, total - 1);
      if (destino === actual) return;
      direccion.current = destino > actual ? 1 : -1;
      pasoRef.current = destino;
      pasoObjRef.current = pasos[destino];
      anim.setValue(0);
      setPaso(destino);
      Animated.timing(anim, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: USA_NATIVO }).start();
    },
    [anim, total, pasos]
  );
  const siguienteRef = useRef(() => irA(pasoRef.current + 1));
  siguienteRef.current = () => irA(pasoRef.current + 1);
  const atrasRef = useRef(() => irA(pasoRef.current - 1));
  atrasRef.current = () => irA(pasoRef.current - 1);

  // --- Demostraciones: la guía hace las cosas para que se vean, en vez de explicarlas con letras ---------------

  // «El buscador»: primero se lee de la tienda el nombre del último artículo añadido y el del más antiguo.
  useEffect(() => {
    if (p.demo !== "buscador") return;
    let vivo = true;
    const lectura = Promise.race([
      Promise.all([nombreDeArticulo(false), nombreDeArticulo(true)]),
      new Promise<[string, string]>((ok) => setTimeout(() => ok(["", ""]), 3000)),
    ]);
    lectura
      .then(([nuevo, viejo]) => {
        if (!vivo) return;
        setEjemplos(
          nuevo && viejo && nuevo !== viejo
            ? [
                { texto: nuevo, etiqueta: "Último añadido", icono: "time-outline" },
                { texto: viejo, etiqueta: "Más antiguo", icono: "hourglass-outline" },
              ]
            : EJEMPLOS_POR_DEFECTO
        );
      })
      .catch(() => {
        if (vivo) setEjemplos(EJEMPLOS_POR_DEFECTO);
      });
    return () => {
      vivo = false;
    };
  }, [p.demo]);

  // …y se escriben solos en el buscador (con el brillo de Siri), dejando ver los resultados de cada uno.
  useEffect(() => {
    if (p.demo !== "buscador" || !ejemplos) return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const espera = (ms: number) => new Promise<void>((ok) => timers.push(setTimeout(ok, ms)));
    const filas = filasBuscadorQueCaben(Dimensions.get("window").height);
    (async () => {
      await espera(900);
      while (!cancelado) {
        const lista = ejemploElegido === null ? ejemplos.map((_, i) => i) : [ejemploElegido];
        for (const i of lista) {
          const texto = ejemplos[i].texto;
          for (let k = 1; k <= texto.length && !cancelado; k++) {
            escribirEnBuscadorDemo(texto.slice(0, k), filas);
            await espera(70);
          }
          await espera(3600); // los resultados, a la vista
          if (cancelado) return;
          escribirEnBuscadorDemo("", filas);
          await espera(600);
        }
      }
    })();
    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
      escribirEnBuscadorDemo(null);
    };
  }, [p.demo, ejemploElegido, ejemplos]);

  // Perfil con sesión: se pulsa de verdad «Mi cuenta» o «Mis seguimientos» para que se vea el contenido de cada una.
  useEffect(() => {
    if ((p.demo !== "perfil-cuenta" && p.demo !== "perfil-seguimientos" && p.demo !== "perfil-pedidos" && p.demo !== "perfil-megusta") || Platform.OS !== "web" || typeof document === "undefined") return;
    // «Mis pedidos» y «Tus facturas» enseñan los filtros, que viven dentro de «Mis seguimientos»; «Me gusta» tiene su pestaña.
    const nombre = p.demo === "perfil-seguimientos" || p.demo === "perfil-pedidos" ? "Mis seguimientos" : p.demo === "perfil-megusta" ? "Me gusta" : "Mi cuenta";
    // Ojo: la página de Perfil existe dos veces en el documento (una oculta): se coge la pestaña que se ve.
    const pestana = () =>
      Array.from(document.querySelectorAll("#perfil-pestanas *")).find((n) => {
        if (n.children.length !== 0 || (n.textContent ?? "").trim() !== nombre) return false;
        const r = n.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
      });
    const t1 = setTimeout(() => pulsarEnPagina(pestana()), 700);
    // El puntero apunta justo a esa pestaña (no al centro de las dos).
    const t2 = setTimeout(() => {
      const el = pestana();
      if (!el || (p.demo !== "perfil-seguimientos" && p.demo !== "perfil-megusta")) return;
      const r = el.getBoundingClientRect();
      setPuntoToque({ x: r.left + r.width / 2 - 10, y: r.top + r.height / 2 - 6 });
    }, 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [p.demo]);

  // «Mis pedidos»: el puntero apunta al filtro «En curso» desde su esquina de arriba (no tapa su nombre). Los filtros
  // salen cuando cargan los pedidos: se reintenta.
  // («Tus facturas»: lo mismo, desde la esquina de arriba de «Facturas».)
  useEffect(() => {
    if ((p.titulo !== "Mis pedidos" && p.titulo !== "Tus facturas") || Platform.OS !== "web" || typeof document === "undefined") return;
    const poner = () => {
      const f = primeroVisible(p.titulo === "Mis pedidos" ? "#seguimiento-filtro-curso" : "#seguimiento-filtro-facturas");
      if (!f) return;
      const r = f.getBoundingClientRect();
      setPuntoToque(p.titulo === "Mis pedidos" ? { x: r.left + r.width / 2 - 10, y: r.top - 4 } : { x: r.right - 26, y: r.top - 4 });
    };
    const timers = [900, 1800, 3000].map((ms) => setTimeout(poner, ms));
    return () => timers.forEach(clearTimeout);
  }, [p.titulo]);

  // El Foro: la guía despliega el selector y enseña cada pestaña, una por una (hasta que la persona toma el mando).
  useEffect(() => {
    if (p.demo !== "foro-pestanas" || foroManual || Platform.OS !== "web" || typeof document === "undefined") return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const espera = (ms: number) => new Promise<void>((ok) => timers.push(setTimeout(ok, ms)));
    (async () => {
      await espera(1500);
      while (!cancelado) {
        for (let i = 0; i < PESTANAS_FORO.length && !cancelado; i++) {
          setPestanaForo(i);
          if (!menuForoAbierto()) pulsarEnPagina(botonSelectorForo()); // se despliega el menú (si no lo estaba ya)
          await espera(1200);
          if (cancelado) return;
          pulsarEnPagina(pestanaDelMenuForo(PESTANAS_FORO[i].nombre)); // y se elige la pestaña
          await espera(1900);
        }
        await espera(1200);
      }
    })();
    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
    };
  }, [p.demo, foroManual]);

  // Tocar una pestaña en la tarjeta (o el botón azul de la página): la guía despliega el menú y abre esa pestaña.
  const elegirPestanaForo = useCallback((i: number) => {
    setForoManual(true);
    setPestanaForo(i);
    if (!menuForoAbierto()) pulsarEnPagina(botonSelectorForo());
    setTimeout(() => pulsarEnPagina(pestanaDelMenuForo(PESTANAS_FORO[i].nombre)), 900);
  }, []);

  // «Reacciona y responde»: la guía abre la pestaña «Foro» (la de los mensajes) para que se vean.
  useEffect(() => {
    if (p.demo !== "foro-chat" || Platform.OS !== "web" || typeof document === "undefined") return;
    const t1 = setTimeout(() => {
      if (!menuForoAbierto()) pulsarEnPagina(botonSelectorForo());
    }, 500);
    const t2 = setTimeout(() => pulsarEnPagina(pestanaDelMenuForo("Foro")), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [p.demo]);

  // «Vender ahora»: la mano pulsa el botón y, tras verlo, la guía pasa sola al formulario (solo yendo hacia delante).
  useEffect(() => {
    if (p.demo !== "vender-toque" || direccion.current !== 1) return;
    const miPaso = pasoRef.current;
    const t = setTimeout(() => {
      if (pasoRef.current === miPaso) siguienteRef.current();
    }, 3000);
    return () => clearTimeout(t);
  }, [p.demo, paso]);

  // El formulario: se desplaza un poco hacia abajo y vuelve, para enseñar que hay más.
  useEffect(() => {
    if (p.demo !== "formulario" || Platform.OS !== "web" || typeof document === "undefined") return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const espera = (ms: number) => new Promise<void>((ok) => timers.push(setTimeout(ok, ms)));
    const ir = (top: number, behavior: ScrollBehavior) => {
      const hoja = document.getElementById("vender-scroll");
      if (hoja) desplazarDom(hoja, { top, behavior });
    };
    (async () => {
      // Primero se ve el título del formulario enmarcado; después baja un poco y vuelve a subir.
      await espera(3000);
      for (let vuelta = 0; vuelta < 2 && !cancelado; vuelta++) {
        ir(360, "smooth");
        await espera(1500);
        ir(0, "smooth");
        await espera(1600);
      }
    })();
    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
      ir(0, "auto");
    };
  }, [p.demo]);

  // Deslizar con un dedo: a la izquierda, siguiente; a la derecha, anterior.
  const deslizar = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (g.dx < -40) siguienteRef.current();
        else if (g.dx > 40) atrasRef.current();
      },
    })
  ).current;

  const { width, height } = pantalla;
  const ancho = Math.min(width - 24, 420);
  const desplazamiento = anim.interpolate({ inputRange: [0, 1], outputRange: [28 * direccion.current, 0] });

  // Dónde va la tarjeta: un poco MÁS ARRIBA que antes (a la altura del pulgar de la mano derecha, no pegada al borde
  // de abajo) y siempre del mismo tamaño, así «Siguiente» no cambia de sitio. Si lo señalado cae justo en esa franja,
  // la tarjeta se pone encima (o debajo, si encima no cabe) con la flecha entre las dos cosas.
  const altoTarjeta = p.compacta ? (p.accion ? ALTO_COMPACTA_ACCION : ALTO_COMPACTA) : ALTO_TARJETA;
  const fondoNormal = Math.round(height * 0.15) + (Platform.OS === "ios" ? 8 : 0);
  const franjaArriba = height - fondoNormal - altoTarjeta;

  // Hueco iluminado alrededor del botón señalado.
  const huecoBruto = caja
    ? {
        x: Math.max(0, caja.x - MARGEN_ARO),
        y: Math.max(0, caja.y - MARGEN_ARO),
        w: Math.min(width, caja.w + MARGEN_ARO * 2),
        h: caja.h + MARGEN_ARO * 2,
      }
    : null;
  // Lo señalado muy alto (limiteAlto: la tarjeta de un servicio): solo se enmarca lo que queda POR ENCIMA de la tarjeta de
  // la guía; si no queda sitio ni para un poco, no se enmarca nada (la página se ve entera con su título enmarcado).
  let hueco = huecoBruto;
  if (huecoBruto && p.limiteAlto) {
    const libre = franjaArriba - 14 - huecoBruto.y;
    hueco = libre >= 48 ? { ...huecoBruto, h: Math.min(huecoBruto.h, libre) } : null;
  }
  // Si lo señalado ocupa casi toda la pantalla (el formulario), no se mueve nada por ello: ni tarjeta ni flecha.
  const enorme = !!hueco && hueco.h > height * 0.45;
  const objetivo = hueco && !enorme ? hueco : null;
  const botonAbajo = !!objetivo && objetivo.y + objetivo.h / 2 > height * 0.5;
  const ESPACIO_FLECHA = 44;
  // (Hasta que lo señalado se asienta tras el desplazamiento, la tarjeta se queda en su sitio de siempre.)
  const estorba = asentada && !!objetivo && objetivo.y + objetivo.h > franjaArriba - 6 && objetivo.y < height - fondoNormal;
  let abajoTarjeta = fondoNormal;
  if (objetivo && estorba) {
    const encima = height - objetivo.y + ESPACIO_FLECHA; // «bottom» de la tarjeta puesta justo encima de lo señalado
    const debajoSitio = height - (objetivo.y + objetivo.h + ESPACIO_FLECHA) - altoTarjeta; // «bottom» si va justo debajo
    abajoTarjeta = height - encima - altoTarjeta >= 24 ? encima : debajoSitio >= 8 ? debajoSitio : Math.max(18, encima);
  }

  // Título de la página en la que está la guía, enmarcado con «Estás aquí» (y sin oscurecer, para que se lea). Si ya
  // queda dentro de lo señalado no se repite.
  const tituloHueco: Caja | null =
    cajaTitulo && !p.sinTitulo
      ? { x: Math.max(0, cajaTitulo.x - 5), y: Math.max(0, cajaTitulo.y - 4), w: Math.min(width, cajaTitulo.w + 10), h: cajaTitulo.h + 8 }
      : null;
  const solapan = (a: Caja, b: Caja) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const titulo = tituloHueco && !(objetivo && solapan(tituloHueco, objetivo)) ? tituloHueco : null;
  // Se oscurece todo menos lo señalado (y el título); si lo señalado es toda la pantalla (el formulario) no se oscurece nada.
  const oscurece = !p.sinOscurecer && (!hueco || !enorme);
  const panes = oscurece ? panesOscuros([objetivo, titulo].filter((h): h is Caja => !!h), width, height) : [];
  const flechaX = objetivo ? limitar(objetivo.x + objetivo.w / 2 - 16, 8, width - 40) : 0;
  const flechaY = objetivo ? (botonAbajo ? objetivo.y - 38 : objetivo.y + objetivo.h + 6) : 0;
  const bote = latido.interpolate({ inputRange: [0, 1], outputRange: [0, botonAbajo ? 7 : -7] });
  const escalaAro = latido.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  // «Siguiente»: aro que late, flecha que empuja hacia la derecha.
  const aroSiguiente = latido.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  const escalaSiguiente = latido.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const empujeFlecha = latido.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });
  const seccionActiva = SECCIONES_GUIA.findIndex((s) => (s.ruta === "/" ? pathname === "/" : pathname.startsWith(s.ruta)));
  // Cada sección enseñada con su dedo: la mano toca justo en el centro de lo señalado (excepto en el paso de las 5
  // secciones, donde la mano va de una a otra, y en los que no son un botón).
  // En los botones anchos el puntero se pone hacia la derecha (a las tres cuartas partes y media): así no tapa el nombre.
  const manoEn =
    hueco && p.gesto === "toque"
      ? puntoToque ?? { x: hueco.x + hueco.w * (hueco.w > 160 ? 0.85 : 0.5), y: hueco.y + hueco.h / 2 - 8 }
      : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={{ flex: 1 }}>
        {/* Oscurecido: todo menos lo señalado y el título de la página (los rectángulos que quedan por fuera). */}
        {panes.map((r, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              // Los que llegan al borde se alargan un poco: así no queda ninguna rendija en el borde de la pantalla.
              width: r.x + r.w >= width - 0.5 ? r.w + 80 : r.w,
              height: r.y + r.h >= height - 0.5 ? r.h + 240 : r.h,
              backgroundColor: FONDO_GUIA,
            }}
          />
        ))}
        {/* Título de la página: recuadro fijo y «Estás aquí» (para que siempre se sepa dónde se está). */}
        {titulo ? (
          <>
            <View
              nativeID="guia-titulo"
              pointerEvents="none"
              style={{
                position: "absolute",
                left: titulo.x,
                top: titulo.y,
                width: titulo.w,
                height: titulo.h,
                borderRadius: 10,
                borderWidth: 2.5,
                borderColor: COLORS.accent,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: limitar(titulo.x + titulo.w / 2 - 44, 6, width - 94),
                top: Math.max(4, titulo.y - 25),
                paddingHorizontal: 8,
                height: 21,
                borderRadius: 11,
                backgroundColor: COLORS.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: TAMANOS.minimo, lineHeight: 16 }}>Estás aquí</Text>
            </View>
          </>
        ) : null}
        {/* Tocar el botón señalado lo pulsa de verdad (la guía tapa la página: sin esto no se podía «probar»). */}
        {p.probar && objetivo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Probar el botón"
            onPress={() => {
              setForoManual(true);
              pulsarEnPagina(primeroVisible(p.probar as string));
            }}
            style={{ position: "absolute", left: objetivo.x, top: objetivo.y, width: objetivo.w, height: objetivo.h }}
          />
        ) : null}
        {objetivo ? (
          <>
            <Animated.View
              nativeID="guia-aro"
              pointerEvents="none"
              style={{
                position: "absolute",
                left: objetivo.x,
                top: objetivo.y,
                width: objetivo.w,
                height: objetivo.h,
                // Poco redondeado: el hueco iluminado es rectangular y, con más radio, asoman
                // esquinas del fondo blanco de la barra por fuera del aro.
                borderRadius: Math.min(10, objetivo.h / 2),
                borderWidth: 3,
                borderColor: COLORS.accent,
                transform: [{ scale: escalaAro }],
              }}
            />
            <Animated.View
              pointerEvents="none"
              style={{ position: "absolute", left: flechaX, top: flechaY, transform: [{ translateY: bote }] }}
            >
              <Ionicons name={botonAbajo ? "arrow-down-circle" : "arrow-up-circle"} size={32} color={COLORS.accent} />
            </Animated.View>
          </>
        ) : null}

        {/* Paso «Las 5 secciones»: los nombres de la barra de abajo se escriben con el brillo de Siri. */}
        {p.demo === "secciones" ? <NombresSeccionesSiri pathname={pathname} elegida={seccionElegida} /> : null}
        {/* Mano que toca lo señalado. */}
        {manoEn ? <ManoToque x={manoEn.x} y={manoEn.y} /> : null}

        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: abajoTarjeta,
            // En pantallas anchas, a la derecha (pulgar derecho); en el móvil, a todo lo ancho.
            alignItems: width >= 700 ? "flex-end" : "center",
          }}
        >
        <Animated.View
          nativeID="guia-tarjeta"
          {...deslizar.panHandlers}
          accessibilityViewIsModal
          style={{
            width: ancho,
            height: altoTarjeta,
            backgroundColor: COLORS.bg,
            borderRadius: 24,
            paddingHorizontal: 18,
            // Arriba cabe «Saltar» (esquina derecha) sin pisar lo de debajo.
            paddingTop: 32,
            paddingBottom: 14,
            // Altura fija y el contenido repartido: «Siguiente» queda SIEMPRE en el mismo sitio.
            justifyContent: "space-between",
            alignItems: "center",
            opacity: anim,
            transform: [{ translateX: desplazamiento }],
            shadowColor: "#0B2138",
            shadowOpacity: 0.18,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          <Pressable
            onPress={onCerrar}
            // Zona táctil de 44 px REAL (en la web el hitSlop no llega ni a la mitad de lo que declara).
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Saltar la guía"
            style={{ position: "absolute", top: 2, right: 8, zIndex: 2, minHeight: 44, minWidth: 56, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 13 }}>Saltar</Text>
          </Pressable>

          {/* Zona visual: según el paso, las secciones para cambiar, los ejemplos del buscador, las pestañas del Foro,
              lo que sabe hacer Blue o Blue. La tarjeta compacta no la lleva (deja ver la página). */}
          {p.cuenta || p.compacta ? null : (
            <View style={{ alignSelf: "stretch", height: 64, alignItems: "center", justifyContent: "center" }}>
              {p.demo === "secciones" ? (
                <SelectorSecciones
                  activa={seccionElegida.i >= 0 ? seccionElegida.i : seccionActiva}
                  ancho={ancho}
                  onElegir={(i) => {
                    setSeccionElegida((a) => ({ i, n: a.n + 1 }));
                    router.navigate(SECCIONES_GUIA[i].ruta as Href);
                  }}
                />
              ) : p.demo === "buscador" ? (
                <EjemplosBuscador ejemplos={ejemplos ?? EJEMPLOS_POR_DEFECTO} activo={ejemploElegido} onElegir={setEjemploElegido} />
              ) : p.demo === "foro-pestanas" ? (
                <ChipsForo activa={pestanaForo} onElegir={elegirPestanaForo} />
              ) : p.demo === "capacidades" ? (
                <FilaIconos items={CAPACIDADES_BLUE} />
              ) : p.demo === "como-se-compra" ? (
                <FilaIconos items={PASOS_DE_COMPRA} />
              ) : p.demo === "foro-chat" ? (
                <FilaIconos items={GESTOS_DEL_FORO} />
              ) : (
                <MarcaAnimada cual="carga" ancho={paso === 0 ? 76 : 56} />
              )}
            </View>
          )}
          <View style={{ alignItems: "center", gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name={p.icono} size={20} color={COLORS.accent} />
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 19, textAlign: "center" }}>{p.titulo}</Text>
            </View>
            <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 21, textAlign: "center", fontWeight: "600" }}>{textoPaso}</Text>
          </View>

          {p.accion ? (
            <Pressable
              onPress={() => (p.accion?.instalar ? onInstalar() : p.accion?.ruta ? onIr(p.accion.ruta) : undefined)}
              accessibilityRole="button"
              // 44 px de alto REALES (regla del pulgar): en la web el hitSlop no llega ni a la mitad de lo que declara.
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 14.5, textAlign: "center" }}>{p.accion.texto} →</Text>
            </Pressable>
          ) : null}

          {/* Progreso */}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }} accessibilityLabel={`Paso ${paso + 1} de ${total}`}>
            {pasos.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === paso ? 18 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i === paso ? COLORS.accent : COLORS.border,
                }}
              />
            ))}
          </View>

          {p.cuenta ? (
            <View style={{ alignSelf: "stretch", gap: 10, marginTop: 4 }}>
              <BotonPanel icono="person-add-outline" texto="Crear cuenta" principal onPress={() => onIr("/perfil?acceso=registro")} />
              <BotonPanel icono="log-in-outline" texto="Ya tengo cuenta: iniciar sesión" onPress={() => onIr("/perfil?acceso=entrar")} />
              <Pressable onPress={onCerrar} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={{ color: COLORS.muted, fontWeight: "800", textAlign: "center" }}>Ahora no, gracias</Text>
              </Pressable>
            </View>
          ) : (
            // Botones grandes abajo; «Siguiente» a la derecha, donde llega el pulgar derecho: más grande, con un
            // aro que late y una flecha que empuja hacia delante (en los dos primeros pasos, además, una mano lo toca).
            <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable
                onPress={() => atrasRef.current()}
                disabled={paso === 0}
                accessibilityRole="button"
                accessibilityLabel="Paso anterior"
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 52,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: paso === 0 ? 0 : pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: COLORS.accentDark, fontWeight: "900", fontSize: 15 }}>Atrás</Text>
              </Pressable>
              <View style={{ flex: 2, minHeight: 60 }} onLayout={(e) => setAnchoSiguiente(Math.round(e.nativeEvent.layout.width))}>
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: -3,
                    right: -3,
                    top: -3,
                    bottom: -3,
                    borderRadius: 999,
                    borderWidth: 3,
                    borderColor: COLORS.accent,
                    opacity: aroSiguiente,
                    transform: [{ scale: escalaSiguiente }],
                  }}
                />
                <Pressable
                  // En el último paso (sin sesión sale «Tu cuenta», con sesión este) el botón termina la guía.
                  onPress={() => (paso === total - 1 ? onCerrar() : siguienteRef.current())}
                  accessibilityRole="button"
                  accessibilityLabel="Paso siguiente"
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 60,
                    borderRadius: 999,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    backgroundColor: COLORS.accent,
                    opacity: pressed ? 0.88 : 1,
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 17 }}>{paso === 0 && !seccion ? "Empezar" : paso === total - 1 ? "Terminar" : "Siguiente"}</Text>
                  <Animated.View style={{ transform: [{ translateX: empujeFlecha }] }}>
                    <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
                  </Animated.View>
                </Pressable>
                {p.gesto === "siguiente" && anchoSiguiente > 0 ? <ManoToque x={anchoSiguiente * 0.62} y={26} tamano={36} /> : null}
              </View>
            </View>
          )}
        </Animated.View>
        </View>
      </View>
    </Modal>
  );
}
