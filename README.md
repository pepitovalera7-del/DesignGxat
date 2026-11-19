# Gxat Design Bot — Railway ready

## Deploy in Railway (minimal setup)
1. Upload this project to a GitHub repository.
2. In Railway, create a new project and deploy from that GitHub repository.
3. In the service Variables tab, add only:
   - `DISCORD_TOKEN` — token from Discord Developer Portal.
   - `SUPPORT_ROLE_ID` — optional; if omitted, bot looks for role named **Support**.
   - `LOG_CHANNEL_ID` — optional; if omitted, bot looks for a channel named **logs**.
   - `WELCOME_CHANNEL_ID` — optional; if omitted, bot looks for channel named **bienvenida**.
   - `TICKET_CATEGORY_ID` — optional; if omitted, bot looks for category named **TICKETS**.
4. Discord Developer Portal > Bot: enable **Server Members Intent** and **Message Content Intent**.
5. Invite the bot with `bot` and `applications.commands` scopes and the required permissions.
6. Deploy/redeploy on Railway.

The bot registers slash commands globally using the logged-in bot's application ID. Global command propagation can take some time.

## Server setup
Create a role named `Support`, a role named `Verified`, and optionally channels named `logs` and `bienvenida` and category `TICKETS`. For verification to work, configure the Verified role's channel permissions appropriately.

## Commands
`/panel`, `/verificacion`, `/giveaway`, `/cerrar`, `/setup-info`.

## Important notes
- Keep the token private and never commit `.env` to GitHub.
- Discord admins can see private channels by design.
- Transcript delivery via DM may fail if the member blocks DMs. Logs provide an additional copy if configured.
- Transcript is an HTML file with message text, attachment links, and basic embed summaries. It does not download attachment files themselves.
- Railway usage/limits depend on your account and plan.
