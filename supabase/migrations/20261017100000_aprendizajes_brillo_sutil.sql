-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: añade a una lección existente que el brillo estilo Siri debe ser sutil.
-- Tipo:     actualiza el texto de una sola fila (por título), una única vez. No borra nada.
-- Qué hace: añade una frase al final de la lección de Vender (contacto, brillo Siri y scroll).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- ============================================================================

update public.aprendizajes
set regla = regla || ' El brillo debe ser SUTIL (borde fino, tonos suaves, resplandor muy tenue, unos 2 s): solo sirve para que el usuario vea las opciones, nunca debe ser llamativo.',
    updated_at = now()
where titulo = 'Vender: contacto por Gmail o chat, brillo Siri y scroll al desplegable'
  and regla not like '%SUTIL%';
