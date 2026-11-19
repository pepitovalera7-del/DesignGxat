# Gxat Design Bot — Advanced
Bot de Discord con Discord.js v14.

## Instalación
1. Sube `index.js`, `package.json`, `Procfile`, `.env.example` y `.gitignore` al repositorio.
2. En el hosting usa Node.js 20 o 22 y comando `npm start`.
3. Configura `DISCORD_TOKEN` en Startup/Variables. No publiques el token.
4. Invita el bot con scopes `bot` y `applications.commands`.
5. Permisos recomendados: Manage Channels, View Channels, Send Messages, Embed Links, Read Message History, Attach Files, Manage Messages y Manage Roles (si usa verificación).
6. Activa Server Members Intent y Message Content Intent en Developer Portal.

## Variables
- `DISCORD_TOKEN`: token del bot.
- `SUPPORT_ROLE_ID`: ID del rol Support.
- `LOG_CHANNEL_ID`: ID del canal de logs.
- `WELCOME_CHANNEL_ID`: ID del canal de bienvenida.
- `TICKET_CATEGORY_ID`: ID de la categoría donde crear tickets.
- `VERIFIED_ROLE_ID`: ID del rol de verificados.

## Comandos
`/ayuda`, `/ping`, `/panel`, `/verificacion`, `/giveaway`, `/reroll`, `/cerrar`, `/reclamar`, `/agregar`, `/quitar`, `/transcript`, `/limpiar`, `/anuncio`, `/userinfo`, `/serverinfo`, `/setup-info`.

Los comandos globales pueden tardar un tiempo en aparecer en Discord tras el primer registro.
Los sorteos activos se guardan en `data/giveaways.json`; usa almacenamiento persistente en el hosting para conservarlos al reiniciar.
