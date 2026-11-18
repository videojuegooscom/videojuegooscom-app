-- Panel de control: «lo nuevo desde la última vez» se recuerda en la CUENTA del administrador, no solo en el móvil
-- (dueño, 2026-11-18: «cuando inicio sesión en otros dispositivos me aparece como que todo es nuevo»).
-- Guarda, por sección del panel (pedidos, services, cotizaciones, chats, products, escaparate, users, auditorias), la
-- fecha ISO en que la abrió por última vez. Lo leen y escriben lib/admin/productos.utilidades.ts (leerPanelVistos y
-- marcarPanelVisto). Va en preferencias_usuario, cuyas reglas ya dejan a cada usuario leer y cambiar solo su fila.
-- Aditiva: solo añade una columna vacía.
alter table public.preferencias_usuario
  add column if not exists panel_vistos jsonb;

comment on column public.preferencias_usuario.panel_vistos is
  'Panel de control: última vez que el administrador abrió cada sección (clave = sección, valor = fecha ISO). Compartido entre dispositivos.';
