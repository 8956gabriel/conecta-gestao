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
var COM_PRIO={urgente:['URGENTE','#DC2626'],alta:['PRIORIDADE ALTA','#EA580C'],normal:['INFORMATIVO','#2563EB'],media:['INFORMATIVO','#2563EB'],baixa:['INFORMATIVO','#16A34A']};
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
  var lv=tipo==='alerta'?((a&&a.nivel)||'alerta'):((OVR&&OVR.lv)||(OVR?'':(document.getElementById('arte-status-mun')||{}).value)||cfgMun.status_municipio||'normal');
  if(!STATUS[lv])lv='alerta';
  var cor=STATUS[lv][1],story=formato==='story',F=story?1.2:1,BH=story?250:210;
  rr(ctx,60,y,W-120,BH,34);ctx.fillStyle=cor;ctx.fill();ctx.lineWidth=5;ctx.strokeStyle='rgba(255,255,255,.9)';ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.arc(175,y+BH/2,72*F,0,7);ctx.fill();
  emoji(ctx,tipo==='alerta'?'⚠️':STATUS_EMO[lv],175,y+BH/2+3,84*F);
  txt(ctx,tipo==='alerta'?'NÍVEL DO ALERTA':'NÍVEL ATUAL',290,y+BH/2-27,28*F,'rgba(255,255,255,.9)',700);
  txt(ctx,STATUS[lv][0],290,y+BH/2+60*F,(lv==='emergencia'?84:96)*F,'#fff',800);
  y+=BH+(story?110:85);
  var titulo=tipo==='alerta'?(a?a.titulo:'Escolha um alerta na lista'):STATUS_FRASE[lv];
  var desc=tipo==='alerta'?(a&&a.descricao)||'':((OVR&&OVR.msg)||cfgMun.status_mensagem||'');
  var lt=linhas(ctx,titulo,54*F,800,W-120,2),lh=64*F;
  lt.forEach(function(l,k){txt(ctx,l,60,y+k*lh,54*F,'#fff',800);});y+=(lt.length-1)*lh;
  if(desc){y+=58*F;var dl=46*F,ld=linhas(ctx,desc,34*F,500,W-120,story?6:(a?2:3));ld.forEach(function(l,k){txt(ctx,l,60,y+k*dl,34*F,'#DCE8F7',500);});y+=(ld.length-1)*dl;}
  if(a){var info=[];if(a.regiao_afetada)info.push('📍 '+a.regiao_afetada);var ini=fmtDH(a.inicio),fim=fmtDH(a.termino);if(ini||fim)info.push('🕒 '+(ini&&fim?ini+' até '+fim:ini?'desde '+ini:'até '+fim));if(a.fonte)info.push('Fonte: '+a.fonte);
    if(info.length){y+=56*F;var il=42*F,li=linhas(ctx,info.join('   '),30*F,700,W-120,2);li.forEach(function(l,k){txt(ctx,l,60,y+k*il,30*F,'#fff',700);});y+=(li.length-1)*il;}}
  return y+(story?90:44);
}

function corpoComunicado(ctx,y,W,H,S,formato){
  var c=comSel()||{titulo:'Escolha um comunicado na lista',tipo:'comunicado',prioridade:'normal'};
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
async function publicarArte(tipo,reg,canvasPronto){INTERNO++;try{return await publicarArte_(tipo,reg,canvasPronto);}finally{INTERNO--;}}
async function publicarArte_(tipo,reg,canvasPronto){
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
/* Previsão e status viram um comunicado no site (com a arte). O post anterior do mesmo tipo sai do ar. */
var MARCA={previsao:'🌤️ Previsão do tempo',status:'🚦 Status do município'};
async function postarComoComunicado(t,urlPronta){
  var hoje=new Date().toLocaleDateString('pt-BR');
  var lv=V('arte-status-mun','')||cfgMun.status_municipio||'normal';
  var titulo=t==='previsao'?MARCA.previsao+' — '+(document.getElementById('arte-periodo').selectedOptions[0].text)+' ('+hoje+')'
                           :MARCA.status+': '+((STATUS[lv]||STATUS.normal)[0])+' ('+hoje+')';
  var prio=t==='status'?({emergencia:'urgente',alerta:'alta',atencao:'normal'}[lv]||'baixa'):'normal';
  var texto=(V('arte-recado','')||'').trim()||(t==='status'?(cfgMun.status_mensagem||STATUS_REC[lv]):'Confira a previsão do tempo para Ivatuba.');
  try{var antigos=await sbGet('dc_comunicados','select=id,titulo&ativo=eq.true&titulo=like.'+encodeURIComponent(MARCA[t]+'*'));
    for(var i=0;i<antigos.length;i++)await sbPatch('dc_comunicados','id=eq.'+antigos[i].id,{ativo:false});}catch(e){}
  var res=await sbPost('dc_comunicados',{tenant_id:tid(),titulo:titulo,tipo:t==='status'?'mudanca_situacao':'comunicado',texto:texto,prioridade:prio,publico_alvo:'Toda a população',ativo:true});
  var reg=res&&res[0];if(!reg)throw new Error('O comunicado não foi criado.');
  var url=urlPronta||await subirArte(await blobDe(document.getElementById('arte-canvas')),'comunicado-'+reg.id+'.png');
  await sbPatch('dc_comunicados','id=eq.'+reg.id,{imagem_url:url});
  return reg;
}
/* ---------- Divulgar: Comunicados, Alertas Climáticos, WhatsApp, Canal Oficial e SMS ---------- */
var CANAL_PADRAO='https://whatsapp.com/channel/0029Vb9xa3aKGGGLJOJSpd1L';
async function postarNoCanal(msg,blob,link){
  try{await navigator.clipboard.writeText(msg);}catch(e){}
  var f=new File([blob],nomeArquivo(),{type:'image/png'});
  if(navigator.canShare&&navigator.canShare({files:[f]})&&/Android|iPhone|iPad/i.test(navigator.userAgent)){
    try{await navigator.share({files:[f],text:msg});return;}catch(e){}}
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nomeArquivo();a.click();
  window.open(link,'_blank','noopener');
  alert('Pronto!\n\n1. A arte foi baixada no seu computador.\n2. A mensagem já está copiada.\n3. No Canal Oficial que abriu, clique para postar: anexe a imagem e cole a mensagem (Ctrl+V).');
}
function infoArte(){
  var t=tipoArte(),hoje=new Date().toLocaleDateString('pt-BR'),lv,titulo,texto,risco=false;
  var rec=(V('arte-recado','')||'').trim();
  if(t==='alerta'){var a=alertaSel()||{};lv=a.nivel||'alerta';titulo=a.titulo||'Alerta climático';texto=[a.descricao,a.recomendacoes?'Orientações: '+a.recomendacoes:''].filter(Boolean).join('\n\n');risco=true;}
  else if(t==='comunicado'){var c=comSel()||{};lv=c.prioridade==='urgente'?'emergencia':c.prioridade==='alta'?'alerta':'normal';titulo=c.titulo||'Comunicado';texto=c.texto||'';}
  else if(t==='status'){lv=V('arte-status-mun','')||cfgMun.status_municipio||'normal';titulo=STATUS_FRASE[lv]+' ('+hoje+')';texto=[cfgMun.status_mensagem,rec].filter(Boolean).join('\n\n');risco=lv!=='normal';}
  else{var p=document.getElementById('arte-periodo'),ini=p.value==='amanha'?1:0,n=p.value==='3'?3:p.value==='5'?5:1,ds=[];for(var k=0;k<n&&dados;k++)ds.push(dia(ini+k));
    risco=ds.some(function(d){return d.prob>=70||d.code>=63||d.vento>=60;});
    lv=ds.some(function(d){return d.code>=95||d.vento>=60;})?'alerta':risco?'atencao':'normal';
    titulo=MARCA.previsao+' — '+p.selectedOptions[0].text+' ('+hoje+')';
    texto=ds.map(function(d){var tt=tempo(d.code);return diaCurto(d.data)+': '+tt[1]+', '+d.min+'° a '+d.max+'°, chuva '+d.prob+'%';}).join('\n')+(rec?'\n\n'+rec:'');}
  return {t:t,lv:lv,titulo:titulo,texto:texto,risco:risco};
}
function abrirDivulgar(){
  var inf=infoArte(),old=document.getElementById('arte-divulgar');if(old)old.remove();
  var ok=function(c){return c?' checked':'';};
  var linha=function(id,marc,tit,sub){return '<label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:8px;cursor:pointer;"><input type="checkbox" id="'+id+'"'+ok(marc)+' style="width:18px;height:18px;margin-top:2px;"><span><strong style="font-size:14px;">'+tit+'</strong><br><span style="font-size:12px;color:#64748B;">'+sub+'</span></span></label>';};
  var d=document.createElement('div');d.id='arte-divulgar';
  d.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  d.innerHTML='<div style="background:#fff;border-radius:16px;max-width:460px;width:100%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.3);max-height:90vh;overflow:auto;">'+
    '<h3 style="margin:0 0 4px;">📤 Divulgar esta arte</h3><p style="margin:0 0 14px;font-size:13px;color:#64748B;">'+String(inf.titulo).replace(/[<>&]/g,'')+'</p>'+
    linha('dv-com',true,'📢 Comunicados (site)',inf.t==='comunicado'?'Coloca a arte neste comunicado.':'Cria um comunicado com a arte no site Ivatuba Protegida.')+
    linha('dv-ale',inf.t==='alerta'||inf.risco,'⚠️ Alertas Climáticos (site)',inf.t==='alerta'?'Coloca a arte neste alerta.':'Cria um alerta (nível '+(STATUS[inf.lv]||STATUS.normal)[0]+') com a arte. O alerta anterior do mesmo tipo sai do ar.')+
    linha('dv-wa',true,'📲 WhatsApp','Abre a lista de pessoas cadastradas para enviar a mensagem com o link da arte.')+
    linha('dv-canal',true,'📢 Canal Oficial do WhatsApp','Copia a mensagem e a arte e abre o Canal Oficial da Defesa Civil para você postar.')+
    linha('dv-sms',false,'📱 SMS','Coloca na fila de SMS (mensagem curta com o link do site) para quem aceita SMS.')+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;"><button class="btn-ghost" id="dv-cancelar">Cancelar</button><button class="btn-accent" id="dv-ok" style="background:linear-gradient(135deg,#16A34A,#15803D);">📤 Divulgar agora</button></div>'+
    '<div id="dv-res" style="margin-top:10px;font-size:13px;"></div></div>';
  document.body.appendChild(d);
  d.onclick=function(e){if(e.target===d)d.remove();};
  document.getElementById('dv-cancelar').onclick=function(){d.remove();};
  document.getElementById('dv-ok').onclick=function(){divulgar(inf,{com:dv('dv-com'),ale:dv('dv-ale'),wa:dv('dv-wa'),canal:dv('dv-canal'),sms:dv('dv-sms')});};
  function dv(id){return document.getElementById(id).checked;}
}
async function divulgar(inf,op){INTERNO++;try{return await divulgar_(inf,op);}finally{INTERNO--;}}
async function divulgar_(inf,op){
  var b=document.getElementById('dv-ok'),res=document.getElementById('dv-res'),feito=[];
  if(!op.com&&!op.ale&&!op.wa&&!op.canal&&!op.sms){res.textContent='Marque pelo menos uma opção.';return;}
  if(inf.t==='previsao'&&!dados){res.textContent='A previsão ainda não carregou. Clique em Atualizar previsão.';return;}
  if((inf.t==='alerta'&&!alertaSel())||(inf.t==='comunicado'&&!comSel())){res.textContent='Escolha o registro na lista primeiro.';return;}
  if(op.sms&&!confirm('Confirma colocar a mensagem na fila de SMS para todas as pessoas cadastradas que aceitam SMS?'))return;
  b.disabled=true;b.textContent='⏳ Divulgando...';
  var log=function(m){feito.push(m);res.innerHTML=feito.map(function(x){return '<div>'+x+'</div>';}).join('');};
  try{
    var url=await subirArte(await blobDe(document.getElementById('arte-canvas')),'divulgacao-'+inf.t+'-'+Date.now()+'.png');
    var alertaId=null;
    if(op.com){
      if(inf.t==='comunicado'){await sbPatch('dc_comunicados','id=eq.'+comSel().id,{imagem_url:url});}
      else if(inf.t==='alerta'){var a0=alertaSel();var rc=await sbPost('dc_comunicados',{tenant_id:tid(),titulo:a0.titulo,tipo:'alerta',texto:inf.texto||a0.titulo,prioridade:a0.nivel==='emergencia'?'urgente':'alta',publico_alvo:'Toda a população',ativo:true,imagem_url:url});}
      else{await postarComoComunicado(inf.t,url);}
      log('✅ Publicado em Comunicados');}
    if(op.ale){
      if(inf.t==='alerta'){alertaId=alertaSel().id;await sbPatch('dc_alertas','id=eq.'+alertaId,{imagem_url:url});}
      else{
        var marca=inf.t==='previsao'?MARCA.previsao:inf.t==='status'?MARCA.status:'📢';
        if(inf.t!=='comunicado'){try{var ant=await sbGet('dc_alertas','select=id&ativo=eq.true&titulo=like.'+encodeURIComponent(marca+'*'));for(var i=0;i<ant.length;i++)await sbPatch('dc_alertas','id=eq.'+ant[i].id,{ativo:false});}catch(e){}}
        var tit=inf.t==='status'?MARCA.status+': '+(STATUS[inf.lv]||STATUS.normal)[0]+' — '+inf.titulo:inf.t==='comunicado'?'📢 '+inf.titulo:inf.titulo;
        var ra=await sbPost('dc_alertas',{tenant_id:tid(),titulo:tit,tipo:inf.t==='previsao'?'previsao_tempo':inf.t==='status'?'status_municipio':'comunicado',nivel:STATUS[inf.lv]?inf.lv:'atencao',
          descricao:inf.texto||null,recomendacoes:(V('arte-recado','')||'').trim()||null,regiao_afetada:'Ivatuba',fonte:inf.t==='previsao'?'Open-Meteo / Defesa Civil Ivatuba':'Defesa Civil Ivatuba',
          inicio:new Date().toISOString(),ativo:true,imagem_url:url});
        alertaId=ra&&ra[0]&&ra[0].id;}
      log('✅ Publicado em Alertas Climáticos');}
    var pagina=location.origin+'/conecta-gestao-ivatuba-protegida.html';
    var cab=inf.t==='comunicado'?'📢 *COMUNICADO — DEFESA CIVIL IVATUBA*':inf.t==='previsao'?'🌤️ *PREVISÃO DO TEMPO — DEFESA CIVIL IVATUBA*':'⚠️ *'+(STATUS[inf.lv]||STATUS.alerta)[0]+' — DEFESA CIVIL IVATUBA*';
    var msg=cab+'\n\n*'+inf.titulo+'*'+(inf.texto?'\n\n'+inf.texto:'')+'\n\n🖼️ Veja a arte: '+url+'\n\n📞 Emergência: 199\nMais informações: '+pagina;
    if(op.wa||op.sms){
      var pessoas=await sbGet('dc_pessoas_alerta','select=id,nome,telefone,whatsapp,receber_sms,receber_whatsapp&tenant_id=eq.'+tid()+'&status=eq.ativo')||[];
      if(op.sms){var curto='DEFESA CIVIL IVATUBA: '+inf.titulo.replace(/[^\w\sÀ-ú°%.,:()\/-]/g,'').replace(/\s+/g,' ').trim();var lk=' Info: '+pagina.replace(/^https?:\/\//,'');
        if((curto+lk).length>160)curto=curto.slice(0,157-lk.length)+'...';
        var n=0;for(var k=0;k<pessoas.length;k++){var p=pessoas[k],ph=(p.telefone||p.whatsapp||'').replace(/\D/g,'');if(p.receber_sms===false||ph.length<10)continue;
          try{await sbPost('dc_notification_queue',{tenant_id:tid(),pessoa_id:p.id,alerta_id:alertaId,canal:'sms',telefone:ph,mensagem:curto+lk,status:'pendente',provider:'sandbox',tentativas:0});n++;}catch(e){}}
        log('✅ SMS: '+n+' mensagem(ns) na fila — envie em Dashboard › 📤 Processar Fila');}
    }
    var blobArte=await blobDe(document.getElementById('arte-canvas'));
    var botoes=[];
    if(op.canal){var link=CANAL_PADRAO;try{var g=await sbGet('dc_grupo_oficial','select=link_whatsapp&order=atualizado_em.desc&limit=1');if(g[0]&&/^https:\/\//.test(g[0].link_whatsapp||''))link=g[0].link_whatsapp;}catch(e){}
      botoes.push(['📢 Postar no Canal Oficial','#128C7E',function(){postarNoCanal(msg,blobArte,link);}]);}
    if(op.wa){if(!pessoas||!pessoas.length)log('⚠️ WhatsApp: nenhuma pessoa cadastrada em Pessoas Cadastradas');
      else botoes.push(['📲 Enviar para '+pessoas.length+' pessoa(s) no WhatsApp','#25D366',function(){document.getElementById('arte-divulgar').remove();abrirNotificarWhatsApp(alertaId,msg,pessoas);}]);}
    if(botoes.length){var box=document.createElement('div');box.style.cssText='display:flex;flex-direction:column;gap:8px;margin-top:12px;';
      box.innerHTML='<div style="font-size:12px;color:#64748B;">Agora é só tocar para enviar:</div>';
      botoes.forEach(function(x){var bt=document.createElement('button');bt.textContent=x[0];bt.style.cssText='padding:11px;border:none;border-radius:10px;color:#fff;font-weight:700;font-size:14px;cursor:pointer;background:'+x[1]+';';bt.onclick=x[2];box.appendChild(bt);});
      res.appendChild(box);}
    b.textContent='✔ Divulgado';if(typeof toast==='function')toast('📤 Arte divulgada');
    try{statusAtual();}catch(e){}
  }catch(e){log('❌ Erro: '+String(e.message||e).slice(0,180));b.disabled=false;b.textContent='📤 Tentar de novo';}
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
    var dig=function(t){return String(t.numero).replace(/\D/g,'');};
    var ok=(ts||[]).filter(function(t){return t.ativo!==false&&t.numero&&/emergencia|defesa_civil|saude|seguranca/.test(t.categoria||'emergencia');});
    var vistos={};ok=ok.filter(function(t){var d=dig(t);if(!d||vistos[d])return false;vistos[d]=1;return true;});
    ok.sort(function(a,b){var cur=function(t){return dig(t).length<=4?0:1;},dc=function(t){return /defesa/i.test(t.categoria+' '+t.nome)?0:1;};
      return cur(a)-cur(b)||dc(a)-dc(b)||(a.ordem||99)-(b.ordem||99);});
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
   '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn-ghost" id="arte-atualizar">🔄 Atualizar previsão</button><button class="btn-ghost" id="arte-compartilhar">📲 Compartilhar</button><button class="btn-accent" id="arte-publicar" style="background:linear-gradient(135deg,#16A34A,#15803D);">📤 Divulgar</button><button class="btn-accent" id="arte-baixar">⬇️ Baixar arte (PNG)</button></div></div>'+
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
     '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;font-weight:600;color:var(--ink-soft);margin:0 0 12px;cursor:pointer;"><input type="checkbox" id="arte-auto" style="width:auto;margin-top:2px;"> <span>🤖 Divulgar automaticamente no site quando o status mudar ou entrar um alerta novo</span></label>'+
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
  document.getElementById('arte-publicar').onclick=abrirDivulgar;
 document.getElementById('arte-alerta').onchange=function(){delete document.getElementById('arte-recado').dataset.editado;autoRecado();};
  var rec=document.getElementById('arte-recado');rec.oninput=function(){rec.dataset.editado='1';desenhar();};
  document.getElementById('arte-recado-auto').onclick=function(){delete rec.dataset.editado;autoRecado();};
  trocarTipo();
  var au=document.getElementById('arte-auto');au.checked=autoLigado();au.onchange=function(){try{localStorage.setItem('dc_auto_divulgar',au.checked?'1':'0');}catch(e){}};
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
  SALVANDO_FORM++;var r;try{r=await _sc2.apply(this,arguments);}finally{SALVANDO_FORM--;}
  if(!gerar)return r;
  try{
    var rows=ed?await sbGet(TABELA[tipo],'select=*&id=eq.'+ed):await sbGet(TABELA[tipo],'select=*&criado_em=gte.'+antes+'&order=criado_em.desc&limit=1');
    var reg=rows&&rows[0];if(!reg||reg.ativo===false||(!ed&&editingId[k]))return r;
    await publicarArte(tipo,reg);loadData(k);
    if(typeof toast==='function')toast('🖼️ Arte gerada e publicada no site');
  }catch(e){console.warn('Arte automática:',e);alert('O registro foi salvo, mas a arte não pôde ser gerada: '+e.message+'\nUse o botão "🖼️ Publicar arte" na lista.');}
  return r;
};

/* ================= DIVULGAÇÃO AUTOMÁTICA =================
   Quando o status do município muda (manual ou pela previsão) ou entra um alerta novo
   (cadastro, SMS ou sincronização oficial), gera a arte e publica no site sozinho.
   WhatsApp e Canal Oficial não aceitam postagem automática: aparece um aviso com botões de 1 clique. */
var SALVANDO_FORM=0, INTERNO=0;
function autoLigado(){try{return localStorage.getItem('dc_auto_divulgar')!=='0';}catch(e){return true;}}
async function interno(fn){INTERNO++;try{return await fn();}finally{INTERNO--;}}
function avisoAuto(titulo,msg,url){
  var old=document.getElementById('dc-aviso-auto');if(old)old.remove();
  var d=document.createElement('div');d.id='dc-aviso-auto';
  d.style.cssText='position:fixed;right:16px;bottom:16px;z-index:9998;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);width:340px;max-width:calc(100vw - 32px);padding:14px;border-top:5px solid #F28C28;font-size:13px;';
  d.innerHTML='<div style="display:flex;justify-content:space-between;gap:8px;"><strong>🤖 '+String(titulo).replace(/[<>&]/g,'')+'</strong><button id="dca-x" style="border:none;background:none;font-size:16px;cursor:pointer;">✕</button></div>'+
    '<div style="color:#475569;margin:6px 0 10px;">Arte gerada e publicada no site. Toque para divulgar também:</div>'+
    (url?'<a href="'+url+'" target="_blank" rel="noopener"><img src="'+url+'" style="width:100%;border-radius:8px;margin-bottom:8px;"></a>':'')+
    '<div style="display:flex;flex-direction:column;gap:6px;"><button id="dca-canal" style="padding:9px;border:none;border-radius:9px;background:#128C7E;color:#fff;font-weight:700;cursor:pointer;">📢 Postar no Canal Oficial</button>'+
    '<button id="dca-wa" style="padding:9px;border:none;border-radius:9px;background:#25D366;color:#fff;font-weight:700;cursor:pointer;">📲 Enviar para pessoas cadastradas</button></div>';
  document.body.appendChild(d);
  document.getElementById('dca-x').onclick=function(){d.remove();};
  document.getElementById('dca-canal').onclick=async function(){var link=CANAL_PADRAO;try{var g=await sbGet('dc_grupo_oficial','select=link_whatsapp&order=atualizado_em.desc&limit=1');if(g[0]&&/^https:\/\//.test(g[0].link_whatsapp||''))link=g[0].link_whatsapp;}catch(e){}
    var blob=url?await (await fetch(url)).blob():null;try{await navigator.clipboard.writeText(msg);}catch(e){}
    if(blob){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='arte-defesa-civil.png';a.click();}
    window.open(link,'_blank','noopener');alert('A arte foi baixada e a mensagem copiada. No Canal Oficial, anexe a imagem e cole a mensagem (Ctrl+V).');};
  document.getElementById('dca-wa').onclick=async function(){try{var ps=await sbGet('dc_pessoas_alerta','select=id,nome,telefone,whatsapp,receber_whatsapp&tenant_id=eq.'+tid()+'&status=eq.ativo');
    if(!ps.length){alert('Nenhuma pessoa cadastrada.');return;}d.remove();abrirNotificarWhatsApp(null,msg,ps);}catch(e){alert('Erro: '+e.message);}};
}
function msgDe(cab,titulo,texto,url){var pagina=location.origin+'/conecta-gestao-ivatuba-protegida.html';
  return cab+'\n\n*'+titulo+'*'+(texto?'\n\n'+texto:'')+(url?'\n\n🖼️ Veja a arte: '+url:'')+'\n\n📞 Emergência: 199\nMais informações: '+pagina;}

var statusEmAndamento=false;
async function autoStatus(lv,msg){
  if(!autoLigado()||statusEmAndamento||!STATUS[lv])return;statusEmAndamento=true;
  try{await interno(async function(){
    var desde=new Date(Date.now()-6*3600e3).toISOString(),rotulo=STATUS[lv][0];
    var ativosC=await sbGet('dc_comunicados','select=id,titulo&ativo=eq.true&titulo=like.'+encodeURIComponent(MARCA.status+'*'));
    var ativosA=await sbGet('dc_alertas','select=id,titulo&ativo=eq.true&titulo=like.'+encodeURIComponent(MARCA.status+'*'));
    if(lv==='normal'){ /* voltou ao normal: tira do ar os avisos de status */
      for(var i=0;i<ativosC.length;i++)await sbPatch('dc_comunicados','id=eq.'+ativosC[i].id,{ativo:false});
      for(var j=0;j<ativosA.length;j++)await sbPatch('dc_alertas','id=eq.'+ativosA[j].id,{ativo:false});
      if(ativosC.length||ativosA.length){if(typeof toast==='function')toast('🟢 Status normal: avisos de status retirados do site');}
      return;}
    if(ativosC.some(function(c){return c.titulo.indexOf(': '+rotulo+' ')>0;}))return; /* já publicado para este nível */
    var recentes=await sbGet('dc_comunicados','select=id&titulo=like.'+encodeURIComponent(MARCA.status+': '+rotulo+'*')+'&criado_em=gte.'+desde+'&limit=1');
    if(recentes.length)return; /* evita repetir o mesmo nível em menos de 6 horas */
    await garantirBase();if(document.fonts&&document.fonts.ready)await document.fonts.ready;
    cfgMun={status_municipio:lv,status_mensagem:msg||''};
    var cv=document.createElement('canvas'),rec=STATUS_REC[lv];
    OVR={tipo:'status',formato:'feed',lv:lv,msg:msg||'',canvas:cv,titulo:'Status do Município',recado:rec};try{desenhar();}finally{OVR=null;}
    var url=await subirArte(await blobDe(cv),'status-'+lv+'-'+Date.now()+'.png');
    for(var k=0;k<ativosC.length;k++)await sbPatch('dc_comunicados','id=eq.'+ativosC[k].id,{ativo:false});
    for(var m=0;m<ativosA.length;m++)await sbPatch('dc_alertas','id=eq.'+ativosA[m].id,{ativo:false});
    var hoje=new Date().toLocaleDateString('pt-BR'),titulo=MARCA.status+': '+rotulo+' ('+hoje+')',texto=[msg,rec].filter(Boolean).join('\n\n');
    await sbPost('dc_comunicados',{tenant_id:tid(),titulo:titulo,tipo:'mudanca_situacao',texto:texto,prioridade:{emergencia:'urgente',alerta:'alta',atencao:'normal'}[lv],publico_alvo:'Toda a população',ativo:true,imagem_url:url});
    await sbPost('dc_alertas',{tenant_id:tid(),titulo:titulo,tipo:'status_municipio',nivel:lv,descricao:msg||null,recomendacoes:rec,regiao_afetada:'Ivatuba',fonte:'Defesa Civil Ivatuba',inicio:new Date().toISOString(),ativo:true,imagem_url:url});
    avisoAuto('Status mudou para '+rotulo,msgDe('⚠️ *'+rotulo+' — DEFESA CIVIL IVATUBA*',STATUS_FRASE[lv],texto,url),url);
  });}catch(e){console.warn('Divulgação automática do status:',e);}
  finally{statusEmAndamento=false;}
}
async function autoAlerta(reg){
  if(!autoLigado()||!reg||!reg.id||reg.ativo===false||reg.imagem_url)return;
  if(reg.tipo==='status_municipio'||reg.tipo==='previsao_tempo'||reg.tipo==='comunicado')return;
  try{await interno(async function(){var url=await publicarArte('alerta',reg);
    avisoAuto('Novo alerta: '+(reg.titulo||''),msgDe('⚠️ *'+((STATUS[reg.nivel]||STATUS.alerta)[0])+' — DEFESA CIVIL IVATUBA*',reg.titulo||'Alerta',[reg.descricao,reg.recomendacoes?'Orientações: '+reg.recomendacoes:''].filter(Boolean).join('\n\n'),url),url);});}
  catch(e){console.warn('Arte automática do alerta:',e);}
}
/* Observa as gravações do painel */
var _patch=sbPatch,_post=sbPost;
sbPatch=async function(t,q,d){var r=await _patch.apply(this,arguments);
  if(!INTERNO&&t==='dc_config'&&d&&d.status_municipio)setTimeout(function(){autoStatus(d.status_municipio,d.status_mensagem);},0);return r;};
sbPost=async function(t,d){var r=await _post.apply(this,arguments);
  if(!INTERNO&&!SALVANDO_FORM){if(t==='dc_config'&&d&&d.status_municipio)setTimeout(function(){autoStatus(d.status_municipio,d.status_mensagem);},0);
    if(t==='dc_alertas'&&r&&r[0])setTimeout(function(){autoAlerta(r[0]);},0);}return r;};
/* Ao abrir o painel (e a cada carga do Dashboard): alertas ativos sem arte ganham arte — inclusive os da sincronização oficial */
var ultimaVerif=0;
async function verificarPendentes(){
  if(!autoLigado()||Date.now()-ultimaVerif<5*60e3)return;ultimaVerif=Date.now();
  try{var al=await sbGet('dc_alertas','select=*&ativo=eq.true&imagem_url=is.null&order=criado_em.desc&limit=5');
    for(var i=0;i<al.length;i++)await autoAlerta(al[i]);
    var c=await sbGet('dc_config','select=status_municipio,status_mensagem&tenant_id=eq.'+tid()+'&limit=1');
    if(c[0])await autoStatus(c[0].status_municipio||'normal',c[0].status_mensagem);}catch(e){}
}
var _ldash=LOADERS.dashboard_dc;
LOADERS.dashboard_dc=function(){var r=_ldash&&_ldash.apply(this,arguments);setTimeout(verificarPendentes,4000);return r;};

logoImg=new Image();logoImg.onload=function(){desenhar();};logoImg.src=LOGO;
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){desenhar();});
})();
