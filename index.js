require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, StringSelectMenuBuilder
} = require('discord.js');

const client = new Client({ intents: [
  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent
], partials: [Partials.Channel, Partials.Message] });

const supportRoleId = process.env.SUPPORT_ROLE_ID;
const logChannelId = process.env.LOG_CHANNEL_ID;
const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
const ticketCategoryId = process.env.TICKET_CATEGORY_ID;
const findRole = guild => supportRoleId ? guild.roles.cache.get(supportRoleId) : guild.roles.cache.find(r=>r.name==='Support');
const findChannel = (guild, id, name) => id ? guild.channels.cache.get(id) : guild.channels.cache.find(c=>c.name===name && c.isTextBased());
const findCategory = guild => ticketCategoryId ? guild.channels.cache.get(ticketCategoryId) : guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory && c.name==='TICKETS');
const ticketOwners = new Map();
const claimedTickets = new Map();

const commands = [
  new SlashCommandBuilder().setName('panel').setDescription('Publica el panel de tickets').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('verificacion').setDescription('Publica el panel de verificación').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('giveaway').setDescription('Inicia un sorteo')
    .addIntegerOption(o=>o.setName('minutos').setDescription('Duración en minutos').setMinValue(1).setRequired(true))
    .addIntegerOption(o=>o.setName('ganadores').setDescription('Cantidad de ganadores').setMinValue(1).setRequired(true))
    .addStringOption(o=>o.setName('premio').setDescription('Premio del sorteo').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('cerrar').setDescription('Cierra el ticket actual').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('ayuda').setDescription('Muestra los comandos disponibles'),
  new SlashCommandBuilder().setName('ping').setDescription('Comprueba si el bot está conectado'),
  new SlashCommandBuilder().setName('limpiar').setDescription('Borra mensajes recientes del canal')
    .addIntegerOption(o=>o.setName('cantidad').setDescription('Cantidad de mensajes (1 a 100)').setMinValue(1).setMaxValue(100).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('anuncio').setDescription('Publica un anuncio de Gxat Design')
    .addStringOption(o=>o.setName('mensaje').setDescription('Texto del anuncio').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setup-info').setDescription('Muestra el estado de la configuración').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(c=>c.toJSON());

async function log(guild, embed) {
  if (!logChannelId) return;
  const ch = guild.channels.cache.get(logChannelId);
  if (ch && ch.isTextBased()) await ch.send({ embeds:[embed] }).catch(()=>{});
}
function cleanName(s) { return s.toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,25) || 'usuario'; }

async function makeTranscript(channel) {
  let all=[], cursor;
  for(let i=0;i<10;i++){
    const batch=await channel.messages.fetch({limit:100, ...(cursor?{before:cursor}:{})}).catch(()=>null);
    if(!batch || !batch.size) break;
    all.push(...batch.values()); cursor=batch.last().id;
    if(batch.size<100) break;
  }
  all.sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const rows=all.map(m=>{
    const content=esc(m.content||'[mensaje sin texto]');
    const attachments=[...m.attachments.values()].map(a=>`<p><a href="${esc(a.url)}">${esc(a.name||'Archivo adjunto')}</a></p>`).join('');
    const embeds=m.embeds.map(e=>`<p class="embed">${esc(e.title||'Embed')} ${esc(e.description||'')}</p>`).join('');
    return `<article><header>${esc(m.author.tag||m.author.username)} · ${new Date(m.createdTimestamp).toLocaleString()}</header><div>${content.replace(/\n/g,'<br>')}${attachments}${embeds}</div></article>`;
  }).join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Transcripción ${esc(channel.name)}</title><style>
  body{font-family:Arial,sans-serif;background:#f4f4f5;color:#18181b;margin:0;padding:24px}
  main{max-width:900px;margin:auto;background:white;padding:24px;border-radius:16px;box-shadow:0 4px 24px #0001}
  h1{margin-top:0}article{border-top:1px solid #e5e7eb;padding:16px 0;overflow-wrap:anywhere}
  header{font-weight:bold;color:#52525b;margin-bottom:8px}.embed{border-left:4px solid #777;padding:8px;background:#f4f4f5}
  a{color:#2563eb}footer{color:#71717a;margin-top:20px;font-size:12px}</style></head>
  <body><main><h1>Gxat Design · Transcripción</h1><p>Canal: #${esc(channel.name)} · ID: ${channel.id}</p>${rows}<footer>Transcripción generada automáticamente por Gxat Design Bot.</footer></main></body></html>`;
}

async function closeTicket(channel, closer) {
  const ownerId=ticketOwners.get(channel.id) || channel.topic?.match(/ticket-owner:(\d+)/)?.[1];
  const html=await makeTranscript(channel);
  const fileName=`transcript-${channel.name}.html`;
  const filePath=path.join(__dirname,fileName);
  fs.writeFileSync(filePath,html);
  const file={attachment:filePath,name:fileName};
  const owner=ownerId?await client.users.fetch(ownerId).catch(()=>null):null;
  if(owner) await owner.send({content:'Tu ticket de Gxat Design ha sido cerrado. Aquí tienes la transcripción HTML:',files:[file]}).catch(()=>{});
  await log(channel.guild,new EmbedBuilder().setColor(0x222222).setTitle('Ticket cerrado').setDescription(`Canal: ${channel.name}\nCerrado por: ${closer.tag}\nCreador: ${ownerId?`<@${ownerId}>`:'desconocido'}`).setTimestamp());
  const logs=findChannel(channel.guild,logChannelId,'logs');
  if(logs?.isTextBased()) await logs.send({content:`Transcripción de **${channel.name}**`,files:[file]}).catch(()=>{});
  fs.unlinkSync(filePath);
  if(ownerId) await channel.permissionOverwrites.edit(ownerId,{ViewChannel:false,SendMessages:false}).catch(()=>{});
  const sr=findRole(channel.guild); if(sr) await channel.permissionOverwrites.edit(sr,{SendMessages:false}).catch(()=>{});
  await channel.send({embeds:[new EmbedBuilder().setColor(0x222222).setTitle('Ticket cerrado').setDescription(`Cerrado por ${closer}. La transcripción fue enviada por DM al creador si tenía los mensajes directos habilitados.`)]}).catch(()=>{});
}

client.once('ready', async()=>{
  console.log(`Conectado como ${client.user.tag}`);
  const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
  try {
    for (const guild of client.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(client.user.id,guild.id),{body:commands});
      console.log(`Comandos registrados en ${guild.name}.`);
    }
  } catch(e){console.error('Error registrando comandos:',e);}
});

client.on('guildMemberAdd',async member=>{
  const ch=findChannel(member.guild,welcomeChannelId,'bienvenida');
  if(ch?.isTextBased()) ch.send({embeds:[new EmbedBuilder().setColor(0xFFFFFF).setTitle('Bienvenido a Gxat Design').setDescription(`¡Bienvenido/a ${member}!\nAquí podrás solicitar logos, banners, miniaturas, packs y otros diseños.\n\nLee las reglas y verifica tu cuenta para comenzar.`).setThumbnail(member.user.displayAvatarURL()).setTimestamp()]}).catch(()=>{});
});
client.on('guildMemberRemove',member=>{
  log(member.guild,new EmbedBuilder().setColor(0x777777).setTitle('Miembro salió').setDescription(`${member.user.tag} abandonó el servidor.`).setTimestamp());
});

client.on('interactionCreate',async interaction=>{
  try{
    if(interaction.isChatInputCommand()){
      if(interaction.commandName==='panel'){
        const embed=new EmbedBuilder().setColor(0xFFFFFF).setTitle('Gxat Design | Centro de pedidos')
          .setDescription('Solicita un diseño abriendo un ticket.\n\n**Servicios**\n• Logos y branding\n• Banners y miniaturas\n• Server packs\n• Packs para Discord\n• Diseños personalizados\n\nNuestro equipo de Support te atenderá.');
        const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket-open').setLabel('Abrir ticket').setEmoji('🎫').setStyle(ButtonStyle.Secondary));
        return interaction.reply({embeds:[embed],components:[row]});
      }
      if(interaction.commandName==='verificacion'){
        const embed=new EmbedBuilder().setColor(0xFFFFFF).setTitle('Verificación | Gxat Design').setDescription('Pulsa el botón para confirmar que eres humano y acceder al servidor.');
        const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify').setLabel('Verificarme').setEmoji('✅').setStyle(ButtonStyle.Success));
        return interaction.reply({embeds:[embed],components:[row]});
      }
      if(interaction.commandName==='giveaway'){
        const mins=interaction.options.getInteger('minutos'), winners=interaction.options.getInteger('ganadores'), prize=interaction.options.getString('premio');
        const embed=new EmbedBuilder().setColor(0xFFFFFF).setTitle('🎉 SORTEO Gxat Design').setDescription(`**Premio:** ${prize}\n**Ganadores:** ${winners}\n**Duración:** ${mins} minutos\n\nPulsa 🎉 para participar.`).setTimestamp(Date.now()+mins*60000);
        const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('giveaway-join').setLabel('Participar').setEmoji('🎉').setStyle(ButtonStyle.Primary));
        const msg=await interaction.reply({embeds:[embed],components:[row],fetchReply:true});
        const entrants=new Set();
        const collector=msg.createMessageComponentCollector({time:mins*60000});
        collector.on('collect',async i=>{
          if(entrants.has(i.user.id)){await i.reply({content:'Ya estás participando.',ephemeral:true});return;}
          entrants.add(i.user.id);await i.reply({content:'¡Participación registrada!',ephemeral:true});
        });
        collector.on('end',async()=>{
          const pool=[...entrants];const chosen=[];
          for(let n=0;n<winners&&pool.length;n++){const idx=Math.floor(Math.random()*pool.length);chosen.push(pool.splice(idx,1)[0]);}
          const winText=chosen.length?chosen.map(id=>`<@${id}>`).join(', '):'No hubo participantes.';
          msg.edit({embeds:[new EmbedBuilder().setColor(0xFFFFFF).setTitle('🎉 Sorteo finalizado').setDescription(`**Premio:** ${prize}\n**Ganador(es):** ${winText}`)],components:[]}).catch(()=>{});
          interaction.channel.send(chosen.length?`¡Felicidades ${winText}! Ganaste **${prize}**.`:'Sorteo finalizado sin participantes.').catch(()=>{});
        });
        return;
      }
      if(interaction.commandName==='cerrar'){
        if(!interaction.channel.name.startsWith('ticket-'))return interaction.reply({content:'Este comando solo se puede usar dentro de un ticket.',ephemeral:true});
        await interaction.reply({content:'Cerrando y generando transcripción…',ephemeral:true});
        return closeTicket(interaction.channel,interaction.user);
      }
      if(interaction.commandName==='ayuda'){
        const embed=new EmbedBuilder().setColor(0x0066FF).setTitle('Gxat Design | Comandos')
          .setDescription([
            '`/panel` — Publica el panel para abrir tickets.',
            '`/verificacion` — Publica el panel de verificación.',
            '`/giveaway` — Inicia un sorteo.',
            '`/cerrar` — Cierra el ticket actual.',
            '`/setup-info` — Revisa la configuración.',
            '`/ping` — Comprueba la conexión del bot.',
            '`/limpiar` — Borra mensajes recientes (Staff).',
            '`/anuncio` — Publica un anuncio (Staff).',
            '`/ayuda` — Muestra esta lista.'
          ].join('\\n'));
        return interaction.reply({embeds:[embed],ephemeral:true});
      }
      if(interaction.commandName==='ping'){
        return interaction.reply({content:`🏓 Pong. Latencia: ${client.ws.ping} ms`,ephemeral:true});
      }
      if(interaction.commandName==='limpiar'){
        const amount=interaction.options.getInteger('cantidad');
        const deleted=await interaction.channel.bulkDelete(amount,true);
        return interaction.reply({content:`Se eliminaron ${deleted.size} mensajes.`,ephemeral:true});
      }
      if(interaction.commandName==='anuncio'){
        const message=interaction.options.getString('mensaje');
        const embed=new EmbedBuilder().setColor(0x0066FF).setTitle('Gxat Design | Anuncio').setDescription(message).setTimestamp();
        await interaction.channel.send({embeds:[embed]});
        return interaction.reply({content:'Anuncio publicado.',ephemeral:true});
      }
      if(interaction.commandName==='setup-info'){
        return interaction.reply({content:`**Configuración**\nSupport role: ${findRole(interaction.guild)?findRole(interaction.guild):'No configurado'}\nLogs: ${findChannel(interaction.guild,logChannelId,'logs')||'No configurado'}\nBienvenida: ${findChannel(interaction.guild,welcomeChannelId,'bienvenida')||'No configurado'}\nCategoría tickets: ${findCategory(interaction.guild)||'No configurada'}`,ephemeral:true});
      }
    }
    if(interaction.isButton()){
      if(interaction.customId==='verify'){
        const role=interaction.guild.roles.cache.find(r=>r.name==='Verified');
        if(!role)return interaction.reply({content:'No se encontró el rol **Verified**. Crea ese rol y configura sus permisos.',ephemeral:true});
        await interaction.member.roles.add(role).catch(()=>null);
        return interaction.reply({content:'¡Verificación completada!',ephemeral:true});
      }
      if(interaction.customId==='ticket-open'){
        const existing=interaction.guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.topic?.includes(`ticket-owner:${interaction.user.id}`)&&c.topic?.includes('ticket-status:open'));
        if(existing)return interaction.reply({content:`Ya tienes un ticket abierto: ${existing}`,ephemeral:true});
        const perms=[
          {id:interaction.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
          {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},
          {id:roleSupport.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]}
        ];
        const channel=await interaction.guild.channels.create({name:`ticket-${cleanName(interaction.user.username)}`,type:ChannelType.GuildText,topic:`ticket-owner:${interaction.user.id};ticket-status:open`,parent:findCategory(interaction.guild)?.id||undefined,permissionOverwrites:perms});
        ticketOwners.set(channel.id,interaction.user.id);
        const embed=new EmbedBuilder().setColor(0xFFFFFF).setTitle('Gxat Design | Ticket').setDescription(`Hola ${interaction.user}!\nDescribe tu pedido con el mayor detalle posible. El equipo de Support te responderá aquí.\n\n**Información útil:**\n• Tipo de diseño\n• Referencias\n• Medidas/formato\n• Plazo estimado`);
        const row=new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket-claim').setLabel('Reclamar').setEmoji('🧑‍💻').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket-close').setLabel('Cerrar ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
        await channel.send({content:`${interaction.user} ${roleSupport}`,embeds:[embed],components:[row]});
        await interaction.reply({content:`Tu ticket ha sido creado: ${channel}`,ephemeral:true});
        await log(interaction.guild,new EmbedBuilder().setColor(0xFFFFFF).setTitle('Ticket creado').setDescription(`Usuario: ${interaction.user}\nCanal: ${channel}`).setTimestamp());
        return;
      }
      if(interaction.customId==='ticket-claim'){
        if(!findRole(interaction.guild)||!interaction.member.roles.cache.has(findRole(interaction.guild).id))return interaction.reply({content:'Solo Support puede reclamar tickets.',ephemeral:true});
        claimedTickets.set(interaction.channel.id,interaction.user.id);
        return interaction.reply({content:`Ticket reclamado por ${interaction.user}.`});
      }
      if(interaction.customId==='ticket-close'){
        const owner=ticketOwners.get(interaction.channel.id)||interaction.channel.topic?.match(/ticket-owner:(\d+)/)?.[1];
        const isOwner=interaction.user.id===owner;
        const isSupport=!!findRole(interaction.guild)&&interaction.member.roles.cache.has(findRole(interaction.guild).id);
        if(!isOwner&&!isSupport&&!interaction.member.permissions.has(PermissionFlagsBits.Administrator))return interaction.reply({content:'Solo el creador del ticket o Support pueden cerrarlo.',ephemeral:true});
        await interaction.reply({content:'Cerrando ticket y generando transcripción…',ephemeral:true});
        return closeTicket(interaction.channel,interaction.user);
      }
    }
  }catch(err){console.error(err);if(interaction.isRepliable()&&!interaction.replied&&!interaction.deferred)interaction.reply({content:'Ocurrió un error. Revisa la configuración y los permisos del bot.',ephemeral:true}).catch(()=>{});}
});

client.login(process.env.DISCORD_TOKEN);
