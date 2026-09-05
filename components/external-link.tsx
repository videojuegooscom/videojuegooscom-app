/**
 * Qué hace: versión de Link (expo-router) para enlaces externos: en web se
 * comporta como un enlace normal (target="_blank"); en apps nativas abre la
 * URL en un navegador dentro de la propia app en vez de salir a Safari/Chrome.
 *
 * Cómo funciona: envuelve <Link> y, si no está en web, cancela la navegación
 * por defecto (event.preventDefault()) y llama a openBrowserAsync().
 *
 * Conectado con: cualquier pantalla que necesite abrir una URL externa
 * (por ejemplo enlaces a redes sociales o páginas externas).
 */
import { Href, Link } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { type ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: Href & string };

export function ExternalLink({ href, ...rest }: Props) {
  return (
    <Link
      target="_blank"
      {...rest}
      href={href}
      onPress={async (event) => {
        if (process.env.EXPO_OS !== 'web') {
          // Prevent the default behavior of linking to the default browser on native.
          event.preventDefault();
          // Open the link in an in-app browser.
          await openBrowserAsync(href, {
            presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
          });
        }
      }}
    />
  );
}
