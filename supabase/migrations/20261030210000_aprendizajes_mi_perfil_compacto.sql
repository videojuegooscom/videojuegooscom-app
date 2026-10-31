-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del dueño (2026-10-30) sobre «Mi perfil» («lo veo muy grande el tamaño de los recuadros», la cuenta
--            dentro, recortar la foto, cerrarse al guardar) y sobre cómo sale cada persona en el Foro.
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Formularios de la cuenta compactos y plegables', 'diseno', 1,
   'Los campos de los formularios del cliente miden 48 px de alto (nunca menos de 44 para tocarlos bien) con texto de 15-16 px; los recuadros de 56 px se ven pesados. Lo que se escribe largo (nombre y apellidos) ocupa toda la fila para leerse entero; los datos cortos van de dos en dos (país | provincia, fecha | edad). Un apartado plegable sale CERRADO si ya está completo, se cierra solo al guardarlo completo (diciendo «Guardado» junto a la cabecera) y lo que es de la misma cuenta va dentro (la sesión y «Cerrar sesión» dentro de «Mi perfil»). Las pestañas y apartados del cliente hablan en primera persona: «Mi perfil», «Mis seguimientos». Una foto de perfil se encuadra antes de subirla (arrastrar y acercar; se guarda cuadrada y ligera).',
   'Campos de 56 px uno debajo de otro, el nombre cortado en media fila, la tarjeta abierta aunque todo esté completo y la cuenta en otra tarjeta aparte.',
   '«Mi perfil» plegado con @usuario · Completo; al abrirlo, campos de 48 px, nombre y apellidos a lo ancho, fecha y edad en la misma fila y «Cerrar sesión» al final; al guardar se cierra solo.'),
  ('En el Foro, el usuario y la foto; nunca el nombre y apellidos', 'seguridad', 1,
   'En el Foro cada persona sale con el usuario y la foto de «Mi perfil» (función perfiles_publicos: solo esos dos datos y solo de quien ha escrito en el Foro, como mucho 200 a la vez). El nombre y apellidos, el país, la provincia y la fecha de nacimiento no se enseñan a otros clientes: solo los ve la propia persona y el administrador. Si alguien aún no tiene usuario, se mantiene lo que había. Una función nueva que la tienda ya usa pero que pega el dueño se avisa en TRABAJO PENDIENTE hasta que esté aplicada (mientras tanto el navegador anota un 404 en la consola y la tienda sigue como antes).',
   'Enseñar en el Foro el nombre y apellidos que la persona escribió para su cuenta, o abrir la tabla de perfiles a todo el mundo para sacar la foto.',
   '«dani_zgz» con su foto en cada mensaje, leído con perfiles_publicos; la tabla perfiles_cliente sigue cerrada.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
