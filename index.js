require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits: P, ChannelType, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) { console.error('Falta DISCORD_TOKEN en las variables de entorno.'); process.exit(1); }

const client = new Client({ intents: [
  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent
], partials: [Partials.Channel, Partials.Message] });

const cfg = {
  supportRole: process.env.SUPPORT_ROLE_ID || '',
  logChannel: process.env.LOG_CHANNEL_ID || '',
  welcomeChannel: process.env.WELCOME_CHANNEL_ID || '',
  ticketCategory: process.env.TICKET_CATEGORY_ID || '',
  verifiedRole: process.env.VERIFIED_ROLE_ID || ''
};
const DATA = path.join(__dirname, 'data');
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, {recursive:true});
const GIVEAWAYS_FILE = path.join(DATA, 'giveaways.json');
function readGiveaways(){ try{return JSON.parse(fs.readFileSync(GIVEAWAYS_FILE,'utf8'));}catch{return [];} }
function saveGiveaways(x){ fs.writeFileSync(GIVEAWAYS_FILE,JSON.stringify(x,null,2)); }
const activeGiveaways = new Map();
const ticketOwners = new Map();

const blue = 0x0066ff;
const embed = (title, description) => new EmbedBuilder().setColor(blue).setTitle(title).setDescription(description).setFooter({text:'Gxat Design • Sistema oficial'}).setTimestamp();
const commands = [
 new SlashCommandBuilder().setName('ayuda').setDescription('Muestra todos los comandos disponibles'),
 new SlashCommandBuilder().setName('ping').setDescription('Comprueba la latencia del bot'),
 new SlashCommandBuilder().setName('panel').setDescription('Publica el panel profesional de pedidos').setDefaultMemberPermissions(P.ManageGuild),
 new SlashCommandBuilder().setName('verificacion').setDescription('Publica el panel de verificación').setDefaultMemberPermissions(P.ManageGuild),
 new SlashCommandBuilder().setName('giveaway').setDescription('Crea un sorteo').addIntegerOption(o=>o.setName('minutos').setDescription('Duración').setMinValue(1).setMaxValue(10080).setRequired(true)).addIntegerOption(o=>o.setName('ganadores').setDescription('Número de ganadores').setMinValue(1).setMaxValue(20).setRequired(true)).addStringOption(o=>o.setName('premio').setDescription('Premio').setMaxLength(150).setRequired(true)).setDefaultMemberPermissions(P.ManageGuild),
 new SlashCommandBuilder().setName('reroll').setDescription('Vuelve a elegir ganadores de un sorteo').addStringOption(o=>o.setName('mensaje_id').setDescription('ID del mensaje del sorteo').setRequired(true)).setDefaultMemberPermissions(P.ManageGuild),
 new SlashCommandBuilder().setName('cerrar').setDescription('Cierra el ticket actual'),
 new SlashCommandBuilder().setName('reclamar').setDescription('Reclama el ticket actual'),
 new SlashCommandBuilder().setName('agregar').setDescription('Añade un usuario al ticket').addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)),
 new SlashCommandBuilder().setName('quitar').setDescription('Retira un usuario del ticket').addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)),
 new SlashCommandBuilder().setName('transcript').setDescription('Genera una transcripción del ticket actual'),
 new SlashCommandBuilder().setName('limpiar').setDescription('Elimina mensajes recientes').addIntegerOption(o=>o.setName('cantidad').setDescription('Entre 1 y 100').setMinValue(1).setMaxValue(100).setRequired(true)).setDefaultMemberPermissions(P.ManageMessages),
 new SlashCommandBuilder().setName('anuncio').setDescription('Publica un anuncio').addStringOption(o=>o.setName('mensaje').setDescription('Texto del anuncio').setMaxLength(3500).setRequired(true)).setDefaultMemberPermissions(P.ManageGuild),
 new SlashCommandBuilder().setName('userinfo').setDescription('Muestra información de un miembro').addUserOption(o=>o.setName('usuario').setDescription('Miembro').setRequired(false)),
 new SlashCommandBuilder().setName('serverinfo').setDescription('Muestra información del servidor'),
 new SlashCommandBuilder().setName('setup-info').setDescription('Comprueba la configuración del bot').setDefaultMemberPermissions(P.ManageGuild)
].map(c=>c.toJSON());

function supportRole(guild){return cfg.supportRole ? guild.roles.cache.get(cfg.supportRole) : guild.roles.cache.find(r=>r.name.toLowerCase()==='support');}
function isSupport(member){const role=supportRole(member.guild);return member.permissions.has(P.Administrator)||!!role&&member.roles.cache.has(role.id);}
function logs(guild){return cfg.logChannel?guild.channels.cache.get(cfg.logChannel):guild.channels.cache.find(c=>c.name==='logs'&&c.isTextBased());}
function category(guild){return cfg.ticketCategory?guild.channels.cache.get(cfg.ticketCategory):guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name.toLowerCase()==='tickets');}
function isTicket(ch){return ch?.type===ChannelType.GuildText&&ch.topic?.includes('gxat-ticket:');}
function ownerId(ch){return ch.topic?.match(/gxat-ticket:(\d+)/)?.[1]||ticketOwners.get(ch.id);}
function safeName(s){return s.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').slice(0,22)||'usuario';}
async function log(guild, message){const ch=logs(guild);if(ch?.isTextBased())await ch.send(message).catch(()=>{});}
async function makeTranscript(channel){
 let messages=[],before;
 for(let i=0;i<10;i++){const batch=await channel.messages.fetch({limit:100,...(before?{before}:{})}).catch(()=>null);if(!batch?.size)break;messages.push(...batch.values());before=batch.last().id;if(batch.size<100)break;}
 messages.sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const body=messages.map(m=>`<article><b>${esc(m.author.tag||m.author.username)}</b> <small>${new Date(m.createdTimestamp).toLocaleString()}</small><p>${esc(m.content||'[sin texto]').replace(/\n/g,'<br>')}</p>${[...m.attachments.values()].map(a=>`<a href="${esc(a.url)}">${esc(a.name||'Adjunto')}</a>`).join('<br>')}</article>`).join('');
 return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Gxat Design transcript</title><style>body{background:#101827;color:#e5e7eb;font:15px Arial;padding:20px}main{max-width:900px;margin:auto}article{padding:14px;border-bottom:1px solid #334155;overflow-wrap:anywhere}small{color:#94a3b8}a{color:#60a5fa}</style><main><h1>Gxat Design — Transcripción</h1><p>#${esc(channel.name)} · ${channel.id}</p>${body}</main></html>`;
}
async function transcriptFile(channel){
 const html=await makeTranscript(channel), filePath=path.join(DATA,`transcript-${channel.id}.html`);
 fs.writeFileSync(filePath,html);return {attachment:filePath,name:`transcript-${channel.name}.html`,cleanup:()=>{try{fs.unlinkSync(filePath)}catch{}}};
}
async function closeTicket(channel, user){
 const owner=ownerId(channel), file=await transcriptFile(channel);
 const member=owner?await client.users.fetch(owner).catch(()=>null):null;
 if(member)await member.send({content:'Tu ticket fue cerrado. Aquí tienes la transcripción:',files:[file]}).catch(()=>{});
 await log(channel.guild,{embeds:[embed('Ticket cerrado',`Canal: ${channel.name}\nCerrado por: ${user.tag}\nCreador: ${owner?`<@${owner}>`:'No identificado'}`)]});
 await log(channel.guild,{content:`Transcripción de **${channel.name}**`,files:[file]});
 file.cleanup();
 await channel.send({embeds:[embed('Ticket cerrado',`Cerrado por ${user}. La transcripción se envió por mensaje directo si estaba permitido.`)]}).catch(()=>{});
 setTimeout(()=>channel.delete('Ticket cerrado por Gxat Design').catch(()=>{}),8000);
}
function helpEmbed(){return embed('Gxat Design | Comandos',[
'**General**','`/ayuda` `/ping` `/userinfo` `/serverinfo`',
'**Pedidos y tickets**','`/panel` `/cerrar` `/reclamar` `/agregar` `/quitar` `/transcript`',
'**Administración**','`/verificacion` `/anuncio` `/limpiar` `/setup-info`',
'**Sorteos**','`/giveaway` `/reroll`',
'Abre un ticket desde el panel para solicitar logos, banners, miniaturas y packs.'
].join('\n'));}
async function finishGiveaway(guild, channelId, messageId, data, reroll=false){
 const ch=await guild.channels.fetch(channelId).catch(()=>null);if(!ch?.isTextBased())return null;
 const msg=await ch.messages.fetch(messageId).catch(()=>null);if(!msg)return null;
 const pool=[...new Set(data.entries||[])], winners=[];
 while(pool.length&&winners.length<Math.min(data.winners||1,pool.length)){winners.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);}
 const result=winners.length?winners.map(id=>`<@${id}>`).join(', '):'No hubo participantes.';
 if(!reroll)await msg.edit({embeds:[embed('🎉 Sorteo finalizado',`**Premio:** ${data.prize}\n**Ganador(es):** ${result}\n**Participantes:** ${(data.entries||[]).length}`)],components:[]}).catch(()=>{});
 await ch.send(winners.length?`🎉 Felicidades ${result}, ganaste **${data.prize}**.`:'Sorteo finalizado sin participantes.').catch(()=>{});
 return result;
}
client.once('ready',async()=>{
 console.log(`Conectado como ${client.user.tag}`);
 try{const rest=new REST({version:'10'}).setToken(TOKEN);await rest.put(Routes.applicationCommands(client.user.id),{body:commands});console.log(`Registrados ${commands.length} comandos globales.`);}catch(e){console.error('No se pudieron registrar comandos:',e);}
 // Recuperar sorteos que sigan activos tras reiniciar
 for(const g of client.guilds.cache.values())for(const data of readGiveaways().filter(x=>x.guildId===g.id&&!x.ended)){
  const remaining=data.endsAt-Date.now();
  if(remaining<=0){data.ended=true;await finishGiveaway(g,data.channelId,data.messageId,data);saveGiveaways(readGiveaways().map(x=>x.messageId===data.messageId?data:x));}
  else scheduleGiveaway(g,data,remaining);
 }
});
function scheduleGiveaway(guild,data,delay){
 const timer=setTimeout(async()=>{const all=readGiveaways();const current=all.find(x=>x.messageId===data.messageId);if(!current||current.ended)return;current.ended=true;saveGiveaways(all);await finishGiveaway(guild,current.channelId,current.messageId,current);activeGiveaways.delete(current.messageId);},Math.min(delay,2147483647));
 activeGiveaways.set(data.messageId,timer);
}
client.on('guildMemberAdd',async member=>{
 const ch=cfg.welcomeChannel?member.guild.channels.cache.get(cfg.welcomeChannel):member.guild.channels.cache.find(c=>c.name==='bienvenida'&&c.isTextBased());
 if(ch?.isTextBased())await ch.send({embeds:[embed('¡Bienvenido a Gxat Design!',`Hola ${member}, nos alegra tenerte aquí.\n\nAbre un ticket para solicitar logos, banners, miniaturas y diseños personalizados.`).setThumbnail(member.user.displayAvatarURL())]}).catch(()=>{});
 await log(member.guild,{embeds:[embed('Nuevo miembro',`${member.user.tag} se unió al servidor.`)]});
});
client.on('guildMemberRemove',member=>log(member.guild,{embeds:[embed('Miembro salió',`${member.user.tag} salió del servidor.`)]}));
client.on('interactionCreate',async i=>{
 try{
  if(i.isChatInputCommand()){
   const cmd=i.commandName;
   if(cmd==='ayuda')return i.reply({embeds:[helpEmbed()],ephemeral:true});
   if(cmd==='ping')return i.reply({embeds:[embed('Pong!',`Latencia API: **${client.ws.ping} ms**\nTiempo de respuesta: **${Date.now()-i.createdTimestamp} ms**`)],ephemeral:true});
   if(cmd==='panel'){
    const e=embed('Gxat Design | Centro de pedidos','Solicita tu diseño abriendo un ticket privado.\n\n**Servicios disponibles**\n• Logotipos y branding\n• Banners y miniaturas\n• Logos GIF y cartoon\n• Packs para Discord y servidores\n• Diseños personalizados\n\nNuestro equipo de Support te atenderá dentro del ticket.');
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gxat:ticket').setLabel('Abrir pedido').setEmoji('🎫').setStyle(ButtonStyle.Primary));
    return i.reply({embeds:[e],components:[row]});
   }
   if(cmd==='verificacion'){
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gxat:verify').setLabel('Verificarme').setEmoji('✅').setStyle(ButtonStyle.Success));
    return i.reply({embeds:[embed('Verificación | Gxat Design','Pulsa el botón para obtener acceso al servidor.')],components:[row]});
   }
   if(cmd==='giveaway'){
    const minutes=i.options.getInteger('minutos'), winners=i.options.getInteger('ganadores'), prize=i.options.getString('premio');
    const data={guildId:i.guildId,channelId:i.channelId,prize,winners,entries:[],endsAt:Date.now()+minutes*60000,ended:false};
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gxat:join').setLabel('Participar').setEmoji('🎉').setStyle(ButtonStyle.Primary));
    const msg=await i.reply({embeds:[embed('🎉 SORTEO Gxat Design',`**Premio:** ${prize}\n**Ganadores:** ${winners}\n**Finaliza:** <t:${Math.floor(data.endsAt/1000)}:R>\n\nPulsa el botón para participar.`)],components:[row],fetchReply:true});
    data.messageId=msg.id;const all=readGiveaways();all.push(data);saveGiveaways(all);scheduleGiveaway(i.guild,data,minutes*60000);
    return;
   }
   if(cmd==='reroll'){
    const id=i.options.getString('mensaje_id'), data=readGiveaways().find(x=>x.messageId===id);
    if(!data||!data.ended)return i.reply({content:'No encontré un sorteo finalizado con ese ID.',ephemeral:true});
    const result=await finishGiveaway(i.guild,data.channelId,data.messageId,data,true);
    return i.reply({content:`Nuevo resultado: ${result}`,ephemeral:true});
   }
   if(cmd==='cerrar'||cmd==='reclamar'||cmd==='agregar'||cmd==='quitar'||cmd==='transcript'){
    if(!isTicket(i.channel))return i.reply({content:'Este comando solo funciona dentro de un ticket.',ephemeral:true});
    const owner=ownerId(i.channel), staff=isSupport(i.member);
    if(cmd==='cerrar'){
     if(i.user.id!==owner&&!staff)return i.reply({content:'Solo el creador o Support pueden cerrar este ticket.',ephemeral:true});
     await i.reply({content:'Cerrando ticket y generando transcripción…',ephemeral:true});return closeTicket(i.channel,i.user);
    }
    if(!staff)return i.reply({content:'Solo Support puede utilizar esta acción.',ephemeral:true});
    if(cmd==='reclamar'){await i.channel.setTopic(`${i.channel.topic||''};reclamado:${i.user.id}`);return i.reply({embeds:[embed('Ticket reclamado',`Este pedido está siendo atendido por ${i.user}.`)]});}
    if(cmd==='agregar'||cmd==='quitar'){
     const user=i.options.getUser('usuario');
     await i.channel.permissionOverwrites.edit(user.id,cmd==='agregar'?{ViewChannel:true,SendMessages:true,ReadMessageHistory:true}:{ViewChannel:false,SendMessages:false});
     return i.reply({content:cmd==='agregar'?`${user} fue añadido al ticket.`:`${user} fue retirado del ticket.`,ephemeral:true});
    }
    const file=await transcriptFile(i.channel);await i.reply({content:'Transcripción generada:',files:[file],ephemeral:true});file.cleanup();return;
   }
   if(cmd==='limpiar'){const n=i.options.getInteger('cantidad');const deleted=await i.channel.bulkDelete(n,true);return i.reply({content:`Se eliminaron ${deleted.size} mensajes.`,ephemeral:true});}
   if(cmd==='anuncio'){await i.channel.send({embeds:[embed('📢 Anuncio | Gxat Design',i.options.getString('mensaje'))]});return i.reply({content:'Anuncio publicado.',ephemeral:true});}
   if(cmd==='userinfo'){
    const user=i.options.getUser('usuario')||i.user, member=await i.guild.members.fetch(user.id).catch(()=>null);
    return i.reply({embeds:[embed('Información del usuario',`**Usuario:** ${user.tag}\n**ID:** ${user.id}\n**Cuenta creada:** <t:${Math.floor(user.createdTimestamp/1000)}:F>\n**Entró al servidor:** ${member?.joinedTimestamp?`<t:${Math.floor(member.joinedTimestamp/1000)}:F>`:'No disponible'}`).setThumbnail(user.displayAvatarURL())],ephemeral:true});
   }
   if(cmd==='serverinfo')return i.reply({embeds:[embed('Información del servidor',`**Nombre:** ${i.guild.name}\n**ID:** ${i.guild.id}\n**Miembros:** ${i.guild.memberCount}\n**Canales:** ${i.guild.channels.cache.size}\n**Creado:** <t:${Math.floor(i.guild.createdTimestamp/1000)}:D>`).setThumbnail(i.guild.iconURL()||null)],ephemeral:true});
   if(cmd==='setup-info'){
    const role=supportRole(i.guild), logch=logs(i.guild), cat=category(i.guild);
    return i.reply({embeds:[embed('Estado de configuración',`**Rol Support:** ${role||'No encontrado'}\n**Canal de logs:** ${logch||'No encontrado'}\n**Canal bienvenida:** ${cfg.welcomeChannel?i.guild.channels.cache.get(cfg.welcomeChannel)||'ID inválido':'No configurado'}\n**Categoría tickets:** ${cat||'No encontrada'}\n**Rol verificado:** ${cfg.verifiedRole||'Buscará un rol llamado Verified'}`)],ephemeral:true});
   }
  }
  if(i.isButton()){
   if(i.customId==='gxat:verify'){
    const role=cfg.verifiedRole?i.guild.roles.cache.get(cfg.verifiedRole):i.guild.roles.cache.find(r=>r.name.toLowerCase()==='verified');
    if(!role)return i.reply({content:'No existe el rol Verified. Créalo o configura VERIFIED_ROLE_ID.',ephemeral:true});
    await i.member.roles.add(role);return i.reply({content:'¡Verificación completada! Bienvenido.',ephemeral:true});
   }
   if(i.customId==='gxat:ticket'){
    const existing=i.guild.channels.cache.find(c=>isTicket(c)&&ownerId(c)===i.user.id);
    if(existing)return i.reply({content:`Ya tienes un ticket abierto: ${existing}`,ephemeral:true});
    const role=supportRole(i.guild);if(!role)return i.reply({content:'Falta configurar el rol Support. Configura SUPPORT_ROLE_ID.',ephemeral:true});
    const perms=[{id:i.guild.roles.everyone.id,deny:[P.ViewChannel]},{id:i.user.id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.AttachFiles]},{id:role.id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.AttachFiles]}];
    const cat=category(i.guild);
    const ch=await i.guild.channels.create({name:`pedido-${safeName(i.user.username)}`,type:ChannelType.GuildText,topic:`gxat-ticket:${i.user.id}`,parent:cat?.type===ChannelType.GuildCategory?cat.id:undefined,permissionOverwrites:perms});
    ticketOwners.set(ch.id,i.user.id);
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gxat:claim').setLabel('Reclamar').setEmoji('🧑‍💻').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('gxat:close').setLabel('Cerrar').setEmoji('🔒').setStyle(ButtonStyle.Danger));
    await ch.send({content:`${i.user} ${role}`,embeds:[embed('Gxat Design | Nuevo pedido','¡Hola! Describe tu pedido aquí.\n\n**Incluye:**\n• Tipo de diseño\n• Texto que debe llevar\n• Colores y referencias\n• Tamaño o formato\n• Fecha límite, si aplica')],components:[row]});
    await log(i.guild,{embeds:[embed('Nuevo ticket',`Usuario: ${i.user}\nCanal: ${ch}`)]});
    return i.reply({content:`Tu ticket privado está listo: ${ch}`,ephemeral:true});
   }
   if(i.customId==='gxat:join'){
    const all=readGiveaways(), data=all.find(x=>x.messageId===i.message.id&&!x.ended);
    if(!data)return i.reply({content:'Este sorteo ya terminó.',ephemeral:true});
    if(data.entries.includes(i.user.id))return i.reply({content:'Ya estás participando.',ephemeral:true});
    data.entries.push(i.user.id);saveGiveaways(all);return i.reply({content:'¡Participación registrada! Mucha suerte 🎉',ephemeral:true});
   }
   if(i.customId==='gxat:claim'){
    if(!isSupport(i.member))return i.reply({content:'Solo Support puede reclamar pedidos.',ephemeral:true});
    return i.reply({embeds:[embed('Pedido reclamado',`Este pedido está siendo atendido por ${i.user}.`)]});
   }
   if(i.customId==='gxat:close'){
    if(!isTicket(i.channel))return i.reply({content:'Este canal no es un ticket.',ephemeral:true});
    if(i.user.id!==ownerId(i.channel)&&!isSupport(i.member))return i.reply({content:'Solo el creador o Support pueden cerrar el ticket.',ephemeral:true});
    await i.reply({content:'Cerrando y generando transcripción…',ephemeral:true});return closeTicket(i.channel,i.user);
   }
  }
 }catch(err){console.error('Error interaction:',err);if(i.isRepliable()&&!i.replied&&!i.deferred)await i.reply({content:'Ocurrió un error. Revisa permisos y configuración.',ephemeral:true}).catch(()=>{});}
});
client.login(TOKEN);
