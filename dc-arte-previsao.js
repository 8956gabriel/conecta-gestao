/* DEFESA CIVIL IVATUBA — PAINEL ADMIN: aba "Arte da Previsão" (módulo adicional, não altera nada existente).
   Puxa a previsão de Ivatuba (Open-Meteo, grátis e sem chave) e monta a arte pronta para postar
   (feed quadrado ou story), com o logo da Defesa Civil e um recado de orientação editável.
   Uso: carregar logo depois de dc-admin-extras.js com a tag script src="/dc-arte-previsao.js".      */
(function(){
'use strict';
var LAT=-23.62, LON=-52.22, LOGO='/assets/logos/defesa-civil-ivatuba.png';
var AZUL1='#0B2F5E', AZUL2='#1E5FAF', LARANJA='#F28C28', FONTE="'Inter',-apple-system,'Segoe UI',Arial,sans-serif";
var DIAS=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
var DIAS_C=['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
var MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
var dados=null, logoImg=null;
var STATUS={normal:['NORMAL','#16A34A'],atencao:['ATENÇÃO','#CA8A04'],alerta:['ALERTA','#EA580C'],emergencia:['EMERGÊNCIA','#DC2626']};
var STATUS_EMO={normal:'🟢',atencao:'🟡',alerta:'🟠',emergencia:'🔴'};
var STATUS_FRASE={normal:'Situação normal em Ivatuba',atencao:'Ivatuba em ATENÇÃO',alerta:'Ivatuba em ALERTA',emergencia:'Ivatuba em EMERGÊNCIA'};
var STATUS_REC={normal:'✅ Situação normal no município. Em caso de emergência, ligue 199.',
  atencao:'👀 Fique atento às atualizações da Defesa Civil e evite áreas de risco.',
  alerta:'⚠️ Evite áreas de risco, alagamentos e encostas. Tenha um plano para sair de casa se for preciso.',
  emergencia:'🚨 Siga as orientações da Defesa Civil. Procure um local seguro e, se precisar, vá para um abrigo.'};
var TEL_PADRAO=[['199','Defesa Civil'],['193','Bombeiros'],['192','SAMU'],['190','Polícia Militar']];
var telefones=TEL_PADRAO, alertas=[], cfgMun={status_municipio:'normal',status_mensagem:''};
var OVR=null; /* geração automática: {tipo,formato,titulo,recado,registro,canvas} */
var comunicados=[];
var COM_TIPO={comunicado:['📢','COMUNICADO'],alerta:['🚨','ALERTA'],orientacao:['📋','ORIENTAÇÃO'],prevencao:['🛡️','PREVENÇÃO'],encerramento:['✅','ENCERRAMENTO'],mudanca_situacao:['🔄','MUDANÇA DE SITUAÇÃO']};
var COM_PRIO={urgente:['URGENTE','#DC2626'],alta:['PRIORIDADE ALTA','#EA580C'],media:['INFORMATIVO','#2563EB'],baixa:['INFORMATIVO','#16A34A']};
function V(id,def){if(OVR){var m={'arte-formato':'formato','arte-titulo':'titulo','arte-recado':'recado'}[id];if(m&&OVR[m]!=null)return OVR[m];}var e=document.getElementById(id);return e?e.value:def;}
function tipoArte(){return OVR?OVR.tipo:((document.getElementById('arte-tipo')||{}).value||'previsao');}
function comSel(){if(OVR&&OVR.tipo==='comunicado')return OVR.registro;var id=(document.getElementById('arte-comunicado')||{}).value;return comunicados.find(function(c){return String(c.id)===String(id);})||null;}
function alertaSel(){if(OVR&&OVR.tipo==='alerta')return OVR.registro;var id=(document.getElementById('arte-alerta')||{}).value;return alertas.find(function(a){return String(a.id)===String(id);})||null;}
function fmtDH(v){if(!v)return'';var d=new Date(v);return isNaN(d)?'':String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+'h'+(d.getMinutes()?String(d.getMinutes()).padStart(2,'0'):'');}

function tempo(c){
  if(c===0)return['☀️','Céu limpo'];
  if(c===1)return['🌤️','Poucas nuvens'];
  if(c===2)return['⛅','Parcialmente nublado'];
  if(c===3)return['☁️','Nublado'];
  if(c===45||c===48)return['🌫️','Neblina'];
  if(c>=51&&c<=57)return['🌦️','Garoa'];
  if(c===61||c===80)return['🌦️','Chuva fraca'];
  if(c===63||c===81)return['🌧️','Chuva moderada'];
  if(c===65||c===82||c===66||c===67)return['🌧️','Chuva forte'];
  if(c>=71&&c<=77||c===85||c===86)return['🌨️','Frio extremo'];
  if(c===95)return['⛈️','Tempestade'];
  if(c===96||c===99)return['⛈️','Tempestade com granizo'];
  return['🌡️','Tempo variável'];
}
function dataLonga(iso){var d=new Date(iso+'T12:00:00');return DIAS[d.getDay()]+', '+d.getDate()+' de '+MESES[d.getMonth()];}
function diaCurto(iso){var d=new Date(iso+'T12:00:00');return DIAS_C[d.getDay()]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');}
function dia(i){var D=dados.daily;return{data:D.time[i],code:D.weather_code[i],max:Math.round(D.temperature_2m_max[i]),min:Math.round(D.temperature_2m_min[i]),
  prob:Math.round(D.precipitation_probability_max[i]||0),mm:String(Math.round((D.precipitation_sum[i]||0)*10)/10).replace('.',','),vento:Math.round(D.wind_speed_10m_max[i]||0),uv:Math.round(D.uv_index_max[i]||0)};}

function recadoAuto(ds){
  var pior=function(f){return ds.reduce(function(a,d){return Math.max(a,f(d));},-99);};
  if(pior(function(d){return d.code;})>=95||pior(function(d){return d.vento;})>=60)return'⚠️ Risco de temporal e ventos fortes. Evite áreas abertas, não se abrigue sob árvores e fique longe da rede elétrica.';
  if(pior(function(d){return d.prob;})>=70||pior(function(d){return d.code>=63&&d.code<=67||d.code>=81&&d.code<=82?1:0;})===1)return'🌧️ Chuva forte prevista. Evite áreas alagadas e nunca atravesse ruas ou pontes com água.';
  if(pior(function(d){return d.max;})>=34)return'🥵 Calor intenso: beba bastante água, evite o sol entre 10h e 16h e cuide de crianças, idosos e animais.';
  if(ds.reduce(function(a,d){return Math.min(a,d.min);},99)<=8)return'🥶 Frio intenso: agasalhe-se e proteja crianças, idosos, pessoas em situação de rua e animais.';
  if(pior(function(d){return d.uv;})>=8)return'☀️ Índice UV muito alto: use protetor solar, chapéu e evite o sol do meio-dia.';
  return'😊 Tempo estável. Em caso de emergência, ligue para a Defesa Civil: 199.';
}

/* ---------- Desenho ---------- */
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function quebra(ctx,txt,maxW){var ps=String(txt).split(/\s+/),ls=[],l='';ps.forEach(function(p){var t=l?l+' '+p:p;if(ctx.measureText(t).width>maxW&&l){ls.push(l);l=p;}else l=t;});if(l)ls.push(l);return ls;}
function txt(ctx,t,x,y,size,cor,peso,alin){ctx.font=(peso||700)+' '+size+'px '+FONTE;ctx.fillStyle=cor||'#fff';ctx.textAlign=alin||'left';ctx.textBaseline='alphabetic';ctx.fillText(t,x,y);}
function emoji(ctx,e,x,y,size){ctx.font=size+'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#000';ctx.globalAlpha=1;ctx.fillText(e,x,y);}

function desenhar(){
  var cv=OVR?OVR.canvas:document.getElementById('arte-canvas'); if(!cv||(!dados&&tipoArte()==='previsao'))return;
  var formato=V('arte-formato','feed'), periodo=V('arte-periodo','hoje');
  var W=1080,H=formato==='story'?1920:1350; cv.width=W;cv.height=H;
  var ctx=cv.getContext('2d'), S=formato==='story'?1.6:1;
  var g=ctx.createLinearGradient(0,0,W*.4,H);g.addColorStop(0,AZUL1);g.addColorStop(1,AZUL2);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=.07;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(W-80,180,320,0,7);ctx.fill();ctx.beginPath();ctx.arc(60,H-120,260,0,7);ctx.fill();ctx.globalAlpha=1;
  ctx.fillStyle=LARANJA;ctx.fillRect(0,0,W,14);

  // Cabeçalho
  var y=60*S;
  if(logoImg&&logoImg.complete&&logoImg.naturalWidth){var lh=150;ctx.drawImage(logoImg,60,y,lh*logoImg.naturalWidth/logoImg.naturalHeight,lh);}
  txt(ctx,'DEFESA CIVIL',240,y+68,46,'#fff',800);txt(ctx,'IVATUBA - PR',240,y+120,40,LARANJA,800);
  var stv=OVR?'':(document.getElementById('arte-status-mun')||{}).value, tipo=tipoArte();
  if(tipo==='previsao'&&stv&&STATUS[stv]){var sl=STATUS[stv][0],sc=STATUS[stv][1];ctx.font='800 34px '+FONTE;var pw=ctx.measureText(sl).width+90,px=W-60-pw,py=y+52;
    txt(ctx,'STATUS DO MUNICÍPIO',W-60,y+36,20,'#CFE0F5',700,'right');
    rr(ctx,px,py,pw,70,35);ctx.fillStyle=sc;ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='rgba(255,255,255,.85)';ctx.stroke();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(px+38,py+35,11,0,7);ctx.fill();
    txt(ctx,sl,px+60,py+47,34,'#fff',800);}
  y+=210*S;
  rr(ctx,60,y,W-120,96,48);ctx.fillStyle=LARANJA;ctx.fill();
  txt(ctx,(V('arte-titulo','')||'PREVISÃO DO TEMPO').toUpperCase(),W/2,y+64,46,'#fff',800,'center');
  y+=140*S;

  if(tipo!=='previsao'){y=corpoAviso(ctx,y,W,H,S,tipo,formato);}
  else{
  var ini=periodo==='amanha'?1:0, n=periodo==='3'?3:periodo==='5'?5:1, ds=[];
  for(var i=0;i<n;i++)ds.push(dia(ini+i));

  if(n===1){
    var d=ds[0],t=tempo(d.code);
    txt(ctx,(periodo==='amanha'?'AMANHÃ · ':'HOJE · ')+dataLonga(d.data).toUpperCase(),W/2,y,34,'#CFE0F5',700,'center');
    y+=140*S;emoji(ctx,t[0],W/2-210,y,180);
    txt(ctx,d.max+'°',W/2+150,y+20,170,'#fff',800,'center');
    txt(ctx,'mín. '+d.min+'°',W/2+150,y+85,40,'#CFE0F5',700,'center');
    y+=160*S;txt(ctx,t[1],W/2,y,56,'#fff',800,'center');
    y+=45*S;
    var cards=[['💧','Chuva',d.prob+'%'],['🌧️','Volume',d.mm+' mm'],['💨','Vento',d.vento+' km/h'],['🔆','Índice UV',String(d.uv)]];
    var cw=(W-120-3*24)/4,ch=180;
    cards.forEach(function(c,k){var x=60+k*(cw+24);rr(ctx,x,y,cw,ch,26);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fill();
      emoji(ctx,c[0],x+cw/2,y+48,48);txt(ctx,c[2],x+cw/2,y+118,42,'#fff',800,'center');txt(ctx,c[1],x+cw/2,y+158,26,'#CFE0F5',600,'center');});
    y+=ch+36*S;
  } else {
    txt(ctx,'IVATUBA · PRÓXIMOS '+n+' DIAS',W/2,y,34,'#CFE0F5',700,'center');y+=40*S;
    var gap=18,cw2=(W-120-(n-1)*gap)/n,base=n===3?455:425,ch2=formato==='story'?base*1.45:base,K=ch2/base;
    ds.forEach(function(d,k){var x=60+k*(cw2+gap),t=tempo(d.code),cx=x+cw2/2,f=n===3?1:.82;
      rr(ctx,x,y,cw2,ch2,28);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fill();
      txt(ctx,diaCurto(d.data),cx,y+62,36*f,'#fff',800,'center');
      emoji(ctx,t[0],cx,y+165*K,110*f);
      txt(ctx,d.max+'°',cx,y+300*(n===3?1:.95)*K,84*f,'#fff',800,'center');
      txt(ctx,'mín. '+d.min+'°',cx,y+(300*(n===3?1:.95)*K+50),32*f,'#CFE0F5',700,'center');
      txt(ctx,'💧 '+d.prob+'%',cx,y+ch2-72*f,34*f,'#fff',700,'center');
      ctx.font='600 '+Math.round(24*f)+'px '+FONTE;var l=quebra(ctx,t[1],cw2-24);txt(ctx,l[0]+(l.length>1?'…':''),cx,y+ch2-26,24*f,'#CFE0F5',600,'center');});
    y+=ch2+40*S;
  }
  }

  // Recado
  var rec=(V('arte-recado','')||'').trim();
  var RF=formato==='story'?1.15:1,RL=46*RF,maxL=Math.max(1,Math.min(5,Math.floor((H-200-y-46)/RL)));
  if(rec){
    /* diminui a letra do recado (até 26px) para caber inteiro, antes de cortar com "…" */
    for(var tam=34;tam>=26;tam-=2){RF=(formato==='story'?1.15:1)*tam/34;RL=46*RF;maxL=Math.max(1,Math.min(5,Math.floor((H-200-y-30)/RL)));
      ctx.font='700 '+Math.round(34*RF)+'px '+FONTE;if(quebra(ctx,rec,W-200).length<=maxL)break;}
    ctx.font='700 '+Math.round(34*RF)+'px '+FONTE;var ls=quebra(ctx,rec,W-200);if(ls.length>maxL){ls=ls.slice(0,maxL);ls[maxL-1]=ls[maxL-1].replace(/\s*\S*$/,'')+'…';}var rh=Math.round(30+16*RF)+ls.length*RL;
    rr(ctx,60,y,W-120,rh,30);ctx.fillStyle='#fff';ctx.fill();ctx.fillStyle=LARANJA;rr(ctx,60,y,14,rh,7);ctx.fill();
    ls.forEach(function(l,k){txt(ctx,l,100,y+RL+6+k*RL,34*RF,AZUL1,700);});}

  // Rodapé
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(0,H-170,W,170);
  txt(ctx,'📞 TELEFONES DE EMERGÊNCIA',60,H-130,24,LARANJA,800);
  txt(ctx,(tipo==='previsao'?'Fonte: Open-Meteo · ':'')+new Date().toLocaleDateString('pt-BR'),W-60,H-130,22,'#CFE0F5',500,'right');
  var tl=telefones.slice(0,4),tw=(W-120)/tl.length;
  tl.forEach(function(t,k){var cx=60+k*tw+tw/2;
    if(k){ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(60+k*tw,H-105,2,80);}
    var fs=t[0].length>5?34:52;txt(ctx,t[0],cx,H-58,fs,'#fff',800,'center');
    ctx.font='600 22px '+FONTE;var nm=t[1];while(ctx.measureText(nm).width>tw-16&&nm.length>4)nm=nm.slice(0,-2);if(nm!==t[1])nm=nm.trim()+'…';
    txt(ctx,nm,cx,H-24,22,'#CFE0F5',600,'center');});
}

/* ---------- Arte de status / alerta ---------- */
function linhas(ctx,t,size,peso,maxW,max){ctx.font=peso+' '+size+'px '+FONTE;var ls=quebra(ctx,t||'',maxW);if(ls.length>max){ls=ls.slice(0,max);ls[max-1]=ls[max-1].replace(/\s*\S*$/,'')+'…';}return ls;}
function corpoAviso(ctx,y,W,H,S,tipo,formato){
  if(tipo==='comunicado')return corpoComunicado(ctx,y,W,H,S,formato);
  var a=tipo==='alerta'?alertaSel():null;
  var lv=tipo==='alerta'?((a&&a.nivel)||'alerta'):((document.getElementById('arte-status-mun')||{}).value||cfgMun.status_municipio||'normal');
  if(!STATUS[lv])lv='alerta';
  var cor=STATUS[lv][1],story=formato==='story',F=story?1.2:1,BH=story?250:210;
  rr(ctx,60,y,W-120,BH,34);ctx.fillStyle=cor;ctx.fill();ctx.lineWidth=5;ctx.strokeStyle='rgba(255,255,255,.9)';ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.arc(175,y+BH/2,72*F,0,7);ctx.fill();
  emoji(ctx,tipo==='alerta'?'⚠️':STATUS_EMO[lv],175,y+BH/2+3,84*F);
  txt(ctx,tipo==='alerta'?'NÍVEL DO ALERTA':'NÍVEL ATUAL',290,y+BH/2-27,28*F,'rgba(255,255,255,.9)',700);
  txt(ctx,STATUS[lv][0],290,y+BH/2+60*F,(lv==='emergencia'?84:96)*F,'#fff',800);
  y+=BH+(story?110:85);
  var titulo=tipo==='alerta'?(a?a.titulo:'Escolha um alerta na lista'):STATUS_FRASE[lv];
  var desc=tipo==='alerta'?(a&&a.descricao)||'':(cfgMun.status_mensagem||'');
  var lt=linhas(ctx,titulo,54*F,800,W-120,2),lh=64*F;
  lt.forEach(function(l,k){txt(ctx,l,60,y+k*lh,54*F,'#fff',800);});y+=(lt.length-1)*lh;
  if(desc){y+=58*F;var dl=46*F,ld=linhas(ctx,desc,34*F,500,W-120,story?6:(a?2:3));ld.forEach(function(l,k){txt(ctx,l,60,y+k*dl,34*F,'#DCE8F7',500);});y+=(ld.length-1)*dl;}
  if(a){var info=[];if(a.regiao_afetada)info.push('📍 '+a.regiao_afetada);var ini=fmtDH(a.inicio),fim=fmtDH(a.termino);if(ini||fim)info.push('🕒 '+(ini&&fim?ini+' até '+fim:ini?'desde '+ini:'até '+fim));if(a.fonte)info.push('Fonte: '+a.fonte);
    if(info.length){y+=56*F;var il=42*F,li=linhas(ctx,info.join('   '),30*F,700,W-120,2);li.forEach(function(l,k){txt(ctx,l,60,y+k*il,30*F,'#fff',700);});y+=(li.length-1)*il;}}
  return y+(story?90:44);
}

function corpoComunicado(ctx,y,W,H,S,formato){
  var c=comSel()||{titulo:'Escolha um comunicado na lista',tipo:'comunicado',prioridade:'media'};
  var story=formato==='story',F=story?1.2:1,ti=COM_TIPO[c.tipo]||COM_TIPO.comunicado,pr=COM_PRIO[c.prioridade]||COM_PRIO.media;
  ctx.font='800 '+Math.round(34*F)+'px '+FONTE;var lw=ctx.measureText(ti[1]).width+110*F,bh=78*F;
  rr(ctx,60,y,lw,bh,bh/2);ctx.fillStyle=pr[1];ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='rgba(255,255,255,.9)';ctx.stroke();
  emoji(ctx,ti[0],60+44*F,y+bh/2+2,38*F);txt(ctx,ti[1],60+80*F,y+bh/2+12*F,34*F,'#fff',800);
  if(c.prioridade==='urgente'||c.prioridade==='alta')txt(ctx,pr[0],W-60,y+bh/2+10,26*F,'#FFD7B0',800,'right');
  y+=bh+(story?100:80);
  var lt=linhas(ctx,c.titulo,56*F,800,W-120,3),lh=66*F;
  lt.forEach(function(l,k){txt(ctx,l,60,y+k*lh,56*F,'#fff',800);});y+=(lt.length-1)*lh;
  if(c.texto){y+=60*F;var dl=48*F,maxT=Math.max(2,Math.floor((H-230-y)/dl)-(V('arte-recado','')?3:0));var ld=linhas(ctx,c.texto,36*F,500,W-120,Math.min(story?12:8,maxT));
    ld.forEach(function(l,k){txt(ctx,l,60,y+k*dl,36*F,'#E6EEF9',500);});y+=(ld.length-1)*dl;}
  if(c.criado_em){y+=54*F;txt(ctx,'Publicado em '+new Date(c.criado_em).toLocaleDateString('pt-BR'),60,y,26*F,'#CFE0F5',600);}
  return y+(story?80:44);
}

/* ---------- Publicar arte (gera, guarda no Storage e liga ao registro) ---------- */
var TABELA={alerta:'dc_alertas',comunicado:'dc_comunicados'};
async function subirArte(blob,nome){
  var path='artes/'+nome;
  var r=await fetch(SB_URL+'/storage/v1/object/dc-arquivos/'+path,{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'image/png','x-upsert':'true'},body:blob});
  if(!r.ok)throw new Error((await r.text()).slice(0,150));
  return SB_URL+'/storage/v1/object/public/dc-arquivos/'+path+'?v='+Date.now();
}
function blobDe(cv){return new Promise(function(ok){cv.toBlob(ok,'image/png');});}
var baseCarregada=null;
function garantirBase(){if(!baseCarregada)baseCarregada=statusAtual();return baseCarregada;}
async function publicarArte(tipo,reg,canvasPronto){
  if(!reg||!reg.id)throw new Error('Registro não encontrado');
  var cv=canvasPronto;
  if(!cv){await garantirBase();if(document.fonts&&document.fonts.ready)await document.fonts.ready;
    cv=document.createElement('canvas');
    OVR={tipo:tipo,formato:'feed',registro:reg,canvas:cv,titulo:tipo==='alerta'?'Alerta Climático':'Comunicado Oficial',
      recado:tipo==='alerta'?(reg.recomendacoes||STATUS_REC[reg.nivel]||''):''};
    try{desenhar();}finally{OVR=null;}}
  var url=await subirArte(await blobDe(cv),tipo+'-'+reg.id+'.png');
  await sbPatch(TABELA[tipo],'id=eq.'+reg.id,{imagem_url:url});
  return url;
}
window.dcPublicarArte=async function(tipo,id,btn){
  var t0=btn&&btn.textContent;if(btn){btn.disabled=true;btn.textContent='⏳ Gerando...';}
  try{var rows=await sbGet(TABELA[tipo],'select=*&id=eq.'+id);var url=await publicarArte(tipo,rows[0]);
    if(btn){btn.textContent='✔ Publicada';}
    if(confirm('Arte gerada e publicada no site Ivatuba Protegida!\n\nQuer abrir a imagem para baixar ou compartilhar no WhatsApp/Instagram?'))window.open(url,'_blank','noopener');
  }catch(e){alert('Não foi possível publicar a arte: '+e.message);if(btn)btn.textContent=t0;}
  finally{if(btn){btn.disabled=false;setTimeout(function(){btn.textContent='🖼️ Publicar arte';},2500);}}
};

/* ---------- Dados ---------- */
async function carregar(){
  var st=document.getElementById('arte-status');st.textContent='Buscando a previsão de Ivatuba...';
  try{
    var url='https://api.open-meteo.com/v1/forecast?latitude='+LAT+'&longitude='+LON+'&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max&forecast_days=7&timezone=America/Sao_Paulo';
    var r=await fetch(url);if(!r.ok)throw new Error('HTTP '+r.status);dados=await r.json();
    st.textContent='Previsão atualizada às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.';
    autoRecado();
  }catch(e){st.textContent='Não foi possível buscar a previsão agora ('+e.message+'). Tente "Atualizar".';}
}
function autoRecado(){
  var el=document.getElementById('arte-recado'),tipo=tipoArte();
  if(tipo!=='previsao'){
    if(!el.dataset.editado){if(tipo==='comunicado')el.value='';else if(tipo==='alerta'){var a=alertaSel();el.value=(a&&a.recomendacoes)||STATUS_REC[(a&&a.nivel)||'alerta']||'';}
      else el.value=STATUS_REC[document.getElementById('arte-status-mun').value||cfgMun.status_municipio]||'';}
    desenhar();return;}
  if(!dados)return;var p=document.getElementById('arte-periodo').value,ini=p==='amanha'?1:0,n=p==='3'?3:p==='5'?5:1,ds=[];
  for(var i=0;i<n;i++)ds.push(dia(ini+i));
  var el=document.getElementById('arte-recado');if(!el.dataset.editado)el.value=recadoAuto(ds);
  desenhar();
}
function nomeArquivo(){var t=tipoArte();return (t==='previsao'?'previsao-ivatuba-'+document.getElementById('arte-periodo').value:t==='status'?'status-ivatuba':t==='comunicado'?'comunicado-ivatuba':'alerta-ivatuba')+'-'+new Date().toISOString().slice(0,10)+'.png';}
function baixar(){var cv=document.getElementById('arte-canvas');cv.toBlob(function(b){var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=nomeArquivo();a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},2000);},'image/png');}
function compartilhar(){var cv=document.getElementById('arte-canvas');cv.toBlob(async function(b){
  var f=new File([b],nomeArquivo(),{type:'image/png'});
  if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:'Defesa Civil Ivatuba'});}catch(e){}}
  else{alert('Este navegador não compartilha imagens direto. A arte será baixada; depois é só postar no WhatsApp/Instagram.');baixar();}
},'image/png');}

/* ---------- Aba no painel ---------- */
var grp=NAV_GROUPS.find(function(g){return g.label==='Comunicação';})||NAV_GROUPS[0];
grp.items.push(['arte_previsao','🎨 Artes (previsão, status e alertas)']);
async function statusAtual(){
  try{var rows=await sbGet('dc_config','select=status_municipio,status_mensagem&tenant_id=eq.'+tid()+'&limit=1');
    if(rows[0])cfgMun=rows[0];
    var el=document.getElementById('arte-status-mun');if(el&&!el.dataset.mexeu)el.value=cfgMun.status_municipio||'normal';}catch(e){}
  try{var ts=await sbGet('dc_telefones','select=nome,numero,categoria,ativo,ordem&order=ordem.asc.nullslast');
    var ok=(ts||[]).filter(function(t){return t.ativo!==false&&t.numero&&/emergencia|defesa_civil|saude|seguranca/.test(t.categoria||'emergencia');});
    ok.sort(function(a,b){var dc=function(t){return /defesa/i.test(t.categoria+' '+t.nome)||String(t.numero).trim()==='199'?0:1;};return dc(a)-dc(b)||String(a.numero).replace(/\D/g,'').length-String(b.numero).replace(/\D/g,'').length||(a.ordem||99)-(b.ordem||99);});
    if(ok.length)telefones=ok.slice(0,4).map(function(t){return[String(t.numero).trim(),String(t.nome).trim()];});}catch(e){}
  try{alertas=await sbGet('dc_alertas','select=*&order=criado_em.desc&limit=50')||[];}catch(e){alertas=[];}
  try{comunicados=await sbGet('dc_comunicados','select=*&order=criado_em.desc&limit=50')||[];}catch(e){comunicados=[];}
  var sc=document.getElementById('arte-comunicado');
  if(sc){var cc=sc.dataset.querido||sc.value||'';sc.innerHTML=comunicados.length?comunicados.map(function(c){return'<option value="'+c.id+'">'+(c.ativo?'● ':'○ ')+String(c.titulo||'Comunicado').replace(/[<>&"]/g,'')+'</option>';}).join(''):'<option value="">Nenhum comunicado cadastrado</option>';
    if(cc&&comunicados.some(function(c){return String(c.id)===String(cc);}))sc.value=cc;delete sc.dataset.querido;}
  var sa=document.getElementById('arte-alerta');
  if(sa){var cur=sa.dataset.querido||sa.value||'';sa.innerHTML=alertas.length?alertas.map(function(a){return'<option value="'+a.id+'">'+(a.ativo?'● ':'○ ')+String(a.titulo||'Alerta').replace(/[<>&"]/g,'')+(a.nivel?' ('+(STATUS[a.nivel]||[a.nivel])[0]+')':'')+'</option>';}).join(''):'<option value="">Nenhum alerta cadastrado</option>';
    if(cur&&alertas.some(function(a){return String(a.id)===String(cur);}))sa.value=cur;delete sa.dataset.querido;}
  autoRecado();desenhar();
}
var TITULOS={previsao:'Previsão do Tempo',status:'Status do Município',alerta:'Alerta Climático',comunicado:'Comunicado Oficial'};
function trocarTipo(){
  var t=tipoArte();
  document.getElementById('arte-box-periodo').style.display=t==='previsao'?'':'none';
  document.getElementById('arte-box-alerta').style.display=t==='alerta'?'':'none';
  document.getElementById('arte-box-status').style.display=(t==='alerta'||t==='comunicado')?'none':'';
  document.getElementById('arte-box-com').style.display=t==='comunicado'?'':'none';
  document.getElementById('arte-publicar').style.display=(t==='alerta'||t==='comunicado')?'':'none';
  var ti=document.getElementById('arte-titulo');if(!ti.dataset.editado)ti.value=TITULOS[t];
  delete document.getElementById('arte-recado').dataset.editado;
  autoRecado();desenhar();
}
window.dcArteComunicado=function(id){
  navigateTo('arte_previsao');
  document.getElementById('arte-tipo').value='comunicado';
  var sc=document.getElementById('arte-comunicado');sc.dataset.querido=id;sc.value=id;trocarTipo();
};
window.dcArteAlerta=function(id){
  navigateTo('arte_previsao');
  var tp=document.getElementById('arte-tipo');tp.value='alerta';
  var sa=document.getElementById('arte-alerta');sa.dataset.querido=id;sa.value=id;trocarTipo();
};
LOADERS.arte_previsao=function(){statusAtual();if(!dados)carregar();else desenhar();};

var _bv=buildViews;
buildViews=function(){
  _bv.apply(this,arguments);
  if(document.getElementById('view-arte_previsao'))return;
  var sec=document.createElement('section');sec.className='view';sec.id='view-arte_previsao';
  sec.innerHTML='<div class="topbar"><div><h1>🎨 Artes da Defesa Civil</h1><div class="sub">Artes prontas para WhatsApp, Instagram e Facebook: previsão do tempo, status do município e alertas climáticos</div></div>'+
   '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn-ghost" id="arte-atualizar">🔄 Atualizar previsão</button><button class="btn-ghost" id="arte-compartilhar">📲 Compartilhar</button><button class="btn-ghost" id="arte-publicar" style="display:none;border-color:#F28C28;color:#C2410C;">📤 Publicar no site</button><button class="btn-accent" id="arte-baixar">⬇️ Baixar arte (PNG)</button></div></div>'+
   '<div style="display:grid;grid-template-columns:minmax(260px,360px) 1fr;gap:20px;align-items:start;" class="arte-grid">'+
    '<div class="panel">'+
     '<div class="field"><label>Tipo de arte</label><select id="arte-tipo"><option value="previsao">🌤️ Previsão do tempo</option><option value="status">🚦 Status do município</option><option value="alerta">⚠️ Alerta climático</option><option value="comunicado">📢 Comunicado</option></select></div>'+
     '<div class="field" id="arte-box-com" style="display:none"><label>Comunicado</label><select id="arte-comunicado"><option value="">Carregando...</option></select><div style="font-size:12px;color:var(--ink-soft);margin-top:6px;">● ativo · ○ inativo. Cadastre em Comunicados.</div></div>'+
     '<div class="field" id="arte-box-alerta" style="display:none"><label>Alerta</label><select id="arte-alerta"><option value="">Carregando...</option></select><div style="font-size:12px;color:var(--ink-soft);margin-top:6px;">● ativo · ○ encerrado. Cadastre em Alertas Climáticos.</div></div>'+
     '<div id="arte-box-periodo"><div class="field"><label>Período</label><select id="arte-periodo"><option value="hoje">Hoje</option><option value="amanha">Amanhã</option><option value="3">Próximos 3 dias</option><option value="5">Próximos 5 dias</option></select></div></div>'+
     '<div class="field"><label>Formato</label><select id="arte-formato"><option value="feed">Feed (1080×1350)</option><option value="story">Story / Status (1080×1920)</option></select></div>'+
     '<div class="field" id="arte-box-status"><label>Status do município na arte</label><select id="arte-status-mun"><option value="">Não mostrar</option><option value="normal">🟢 Normal</option><option value="atencao">🟡 Atenção</option><option value="alerta">🟠 Alerta</option><option value="emergencia">🔴 Emergência</option></select>'+
     '<div style="font-size:12px;color:var(--ink-soft);margin-top:6px;">Vem com o status atual do município. Pode trocar só para a arte.</div></div>'+
     '<div class="field"><label>Título da arte</label><input id="arte-titulo" maxlength="32" value="Previsão do Tempo"></div>'+
     '<div class="field"><label>Recado à população</label><textarea id="arte-recado" rows="4" maxlength="220"></textarea>'+
     '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;"><span style="font-size:12px;color:var(--ink-soft);">Preenchido automaticamente conforme a previsão. Pode editar.</span><button type="button" class="btn-ghost" id="arte-recado-auto" style="padding:4px 10px;">↺ Automático</button></div></div>'+
     '<p id="arte-status" style="font-size:12.5px;color:var(--ink-soft);margin:0;"></p></div>'+
    '<div class="panel" style="text-align:center;"><canvas id="arte-canvas" style="width:100%;max-width:460px;height:auto;border-radius:14px;box-shadow:0 8px 30px rgba(15,23,42,.18);"></canvas></div>'+
   '</div><style>@media(max-width:820px){.arte-grid{grid-template-columns:1fr!important}}</style>';
  ['alertas_dc','comunicados_dc'].forEach(function(k){var sb=document.getElementById('sb-'+k);if(!sb||document.getElementById('arte-auto-'+k))return;
    var l=document.createElement('label');l.style.cssText='display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink-soft);margin:0 0 12px;cursor:pointer;';
    l.innerHTML='<input type="checkbox" id="arte-auto-'+k+'" checked style="width:auto;"> 🖼️ Gerar a arte e publicar no site automaticamente ao salvar';
    var fa=sb.parentNode;fa.parentNode.insertBefore(l,fa);});
  var ultima=document.querySelectorAll('section.view');var pai=ultima.length?ultima[ultima.length-1].parentNode:document.body;pai.appendChild(sec);
  document.getElementById('arte-atualizar').onclick=carregar;
  document.getElementById('arte-baixar').onclick=baixar;
  document.getElementById('arte-compartilhar').onclick=compartilhar;
  document.getElementById('arte-periodo').onchange=autoRecado;
  document.getElementById('arte-formato').onchange=desenhar;
  var sm=document.getElementById('arte-status-mun');sm.onchange=function(){sm.dataset.mexeu='1';if(tipoArte()==='status'){delete document.getElementById('arte-recado').dataset.editado;autoRecado();}else desenhar();};
  var ti=document.getElementById('arte-titulo');ti.oninput=function(){ti.dataset.editado='1';desenhar();};
  document.getElementById('arte-tipo').onchange=trocarTipo;
  document.getElementById('arte-comunicado').onchange=function(){delete document.getElementById('arte-recado').dataset.editado;autoRecado();};
  document.getElementById('arte-publicar').onclick=async function(){
    var t=tipoArte(),reg=t==='alerta'?alertaSel():comSel(),b=this;if(!reg){alert('Escolha o registro primeiro.');return;}
    b.disabled=true;var t0=b.textContent;b.textContent='⏳ Publicando...';
    try{await publicarArte(t,reg,document.getElementById('arte-canvas'));b.textContent='✔ Publicada no site';}catch(e){alert('Não foi possível publicar: '+e.message);b.textContent=t0;}
    finally{b.disabled=false;setTimeout(function(){b.textContent='📤 Publicar no site';},2500);}
  };
  document.getElementById('arte-alerta').onchange=function(){delete document.getElementById('arte-recado').dataset.editado;autoRecado();};
  var rec=document.getElementById('arte-recado');rec.oninput=function(){rec.dataset.editado='1';desenhar();};
  document.getElementById('arte-recado-auto').onclick=function(){delete rec.dataset.editado;autoRecado();};
  trocarTipo();
};

/* Botão "🎨 Arte" em cada alerta climático */
var _ld=loadData;
loadData=async function(k){
  var r=await _ld.apply(this,arguments);
  if(k==='alertas_dc'||k==='comunicados_dc'){var tipo=k==='alertas_dc'?'alerta':'comunicado',rows=caches[k+'_data']||[];
    document.querySelectorAll('#tbl-'+k+' button[onclick*="deleteCrud"]').forEach(function(b){
      var m=/deleteCrud\('[^']+','([^']+)'\)/.exec(b.getAttribute('onclick')||'');if(!m)return;var td=b.parentNode;if(td.querySelector('[data-arte]'))return;
      var reg=rows.find(function(x){return String(x.id)===m[1];})||{};
      var est='padding:4px 8px;font-size:11px;margin-right:4px;border:none;border-radius:7px;font-weight:700;cursor:pointer;color:#fff;';
      var a=document.createElement('button');a.dataset.arte='1';a.textContent='🎨 Arte';a.title='Abrir e ajustar a arte';a.style.cssText=est+'background:#F28C28;';
      a.onclick=function(){tipo==='alerta'?window.dcArteAlerta(m[1]):window.dcArteComunicado(m[1]);};
      var p=document.createElement('button');p.dataset.arte='1';p.textContent=reg.imagem_url?'🖼️ Republicar arte':'🖼️ Publicar arte';p.title='Gerar a arte e publicar no site automaticamente';p.style.cssText=est+'background:#1E5FAF;';
      p.onclick=function(){window.dcPublicarArte(tipo,m[1],p);};
      td.insertBefore(p,td.firstChild);td.insertBefore(a,td.firstChild);
      if(reg.imagem_url&&/^https:\/\//.test(reg.imagem_url)){var v=document.createElement('a');v.dataset.arte='1';v.href=reg.imagem_url;v.target='_blank';v.rel='noopener';v.textContent='👁️';v.title='Ver arte publicada';v.style.cssText='margin-right:6px;text-decoration:none;';td.insertBefore(v,td.firstChild);}
    });}
  return r;
};

/* Ao salvar alerta/comunicado: gera e publica a arte sozinho (se a caixinha estiver marcada) */
var _sc2=submitCrud;
submitCrud=async function(k){
  if(k!=='alertas_dc'&&k!=='comunicados_dc')return _sc2.apply(this,arguments);
  var auto=document.getElementById('arte-auto-'+k),gerar=!auto||auto.checked,ed=editingId[k],tipo=k==='alertas_dc'?'alerta':'comunicado';
  var antes=new Date(Date.now()-60000).toISOString();
  var r=await _sc2.apply(this,arguments);
  if(!gerar)return r;
  try{
    var rows=ed?await sbGet(TABELA[tipo],'select=*&id=eq.'+ed):await sbGet(TABELA[tipo],'select=*&criado_em=gte.'+antes+'&order=criado_em.desc&limit=1');
    var reg=rows&&rows[0];if(!reg||reg.ativo===false||(!ed&&editingId[k]))return r;
    await publicarArte(tipo,reg);loadData(k);
    if(typeof toast==='function')toast('🖼️ Arte gerada e publicada no site');
  }catch(e){console.warn('Arte automática:',e);alert('O registro foi salvo, mas a arte não pôde ser gerada: '+e.message+'\nUse o botão "🖼️ Publicar arte" na lista.');}
  return r;
};

logoImg=new Image();logoImg.onload=function(){desenhar();};logoImg.src=LOGO;
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){desenhar();});
})();
