-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: tres lecciones (avisos de una sola vez, listas de productos con el diseño de Inicio
--            y vigilar el espacio en disco).
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Los avisos y pistas de Blue salen una sola vez', 'diseno', 1,
   'Todo aviso, pista o explicación de Blue (el aviso del selector de pestañas del Foro, la pista «Mantén pulsada una pestaña para moverla», la oferta de instalar la app…) sale UNA sola vez por dispositivo: se guarda en AsyncStorage al mostrarlo y no vuelve, ni al recargar ni en otra visita. Si la guía ya lo enseñó, el aviso suelto tampoco sale. Se muestran como mensajes de Blue (alargados, «Blue · mensaje ›»), nunca como carteles fijos permanentes ni tarjetas gordas. Lo que explica un botón se enseña también en la guía señalando ese botón (aro y flecha), como «Ver categorías» y «Vender ahora».',
   'Un cartel permanente que sale cada vez que se abre un desplegable, o un aviso que vuelve en cada visita.', 'Guardar «visto» al mostrarlo, probar con el navegador que al recargar no vuelve y que la guía señala el mismo botón.'),
  ('Listas de productos con el diseño de Inicio', 'diseno', 1,
   'Toda lista de productos (Catálogo, estantes, resultados) usa la misma tarjeta que Inicio: fondo suave sin borde, foto entera (contain) sobre blanco, título completo centrado y precio en azul de marca (155,00€). Sin etiquetas ni pastillas decorativas («Publicada», «Disponible»), sin botones «Ver más» de adorno (toda la tarjeta es el enlace) y sin frases repetidas en cada tarjeta. Solo el administrador ve el estado interno, como texto de color sin recuadro. Los botones principales son azul de marca con texto blanco.',
   'Tarjetas con borde, etiqueta de estado y botón «Ver más» en cada producto del Catálogo.', 'La misma tarjeta que el estante de Inicio en todas las listas, comprobada con capturas.'),
  ('Vigilar el espacio en disco del servidor', 'codigo', 2,
   'Con el disco lleno Claude no puede ejecutar ni un comando (Bash no crea su archivo de salida en /tmp) y solo el dueño puede liberar espacio desde Termius. Para evitarlo: al terminar cada tarea limpiar lo regenerable (carpeta dist, capturas y carpetas de pruebas del scratchpad), no dejar servidores de pruebas en segundo plano y no acumular capturas de recorridos largos.',
   'Compilar y capturar decenas de imágenes sin borrarlas hasta llenar el disco y bloquear la sesión.', 'Borrar dist y las capturas de prueba al cerrar la tarea y parar los servidores de pruebas.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
