/* DEFESA CIVIL IVATUBA — módulo ADICIONAL. Não altera nada do código existente.
   Uso: subir este arquivo junto da página e acrescentar, antes de </body>:
   a tag script com src="/dc-extras.js"                                              */
(function(){
'use strict';
var $=function(id){return document.getElementById(id);};
var CT={telefone:'(44) 92009-6867',whatsapp:'5544920096867',endereco:'',latitude:null,longitude:null};
function dig(s){return String(s||'').replace(/\D/g,'');}
function waNum(n){var d=dig(n);return d.length<=11?'55'+d:d;}
function url(u){return /^https:\/\//i.test(u||'')?u:'';}
function q(t){return 'select=*&tenant_id=eq.'+TID+(t||'');}
function empty(m){return '<div class="empty">'+m+'</div>';}

/* ---------- Contato (início + rodapé) ---------- */
function contatoHtml(){
  var tel=dig(CT.telefone),loc=mapaLink();
  return '<div class="info-panel" id="dcx-contato" style="margin-top:20px;"><h3>🆘 Contato e Emergência</h3>'+
  '<p><strong>DEFESA CIVIL MUNICIPAL DE IVATUBA – PR</strong><br>Telefone/WhatsApp: '+escHtml(CT.telefone)+'</p>'+
  '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">'+
  '<a class="btn-alerta btn-alerta-primary" href="tel:+55'+tel.replace(/^55/,'')+'">📞 Ligar</a>'+
  '<a class="btn-alerta btn-alerta-primary" style="background:var(--verde);" target="_blank" rel="noopener" href="https://wa.me/'+waNum(CT.whatsapp||CT.telefone)+'">💬 WhatsApp</a>'+
  '<a class="btn-alerta btn-alerta-outline" target="_blank" rel="noopener" href="'+loc+'">📍 Ver localização</a></div></div>';
}
function mapaLink(){
  if(CT.latitude&&CT.longitude)return 'https://www.google.com/maps?q='+CT.latitude+','+CT.longitude;
  return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent((CT.endereco||'Defesa Civil')+' Ivatuba PR');
}
function renderContato(){
  var old=$('dcx-contato');if(old)old.remove();
  var cards=document.querySelector('#view-inicio .cards');
  if(cards)cards.insertAdjacentHTML('afterend',contatoHtml());
  var f=$('dcx-foot');if(!f){f=document.createElement('div');f.id='dcx-foot';f.className='footer-muni';f.style.marginTop='8px';
    var b=document.querySelector('.footer .footer-brand');if(b)b.after(f);}
  f.innerHTML='Tel/WhatsApp: <a href="tel:+55'+dig(CT.telefone).replace(/^55/,'')+'" style="color:var(--azul-medio);font-weight:700;">'+escHtml(CT.telefone)+'</a>';
}
async function loadContato(){
  try{var r=await sbGet('dc_contato',q('&limit=1'));if(r.length){CT.telefone=r[0].telefone||CT.telefone;CT.whatsapp=r[0].whatsapp||CT.whatsapp;
    CT.endereco=r[0].endereco||'';CT.latitude=r[0].latitude;CT.longitude=r[0].longitude;}}catch(e){}
  renderContato();
}

/* ---------- Estrutura: menus e telas ---------- */
var NOVAS=[
 ['legislacao','⚖️','Legislação','Leis, decretos e normas'],
 ['grupo','📢','Canal Oficial','Defesa Civil Municipal'],
 ['local','🏢','Local da Defesa Civil','Sede, fotos e mapa'],
 ['plano','📘','Plano de Contingência','Documentos do plano'],
 ['acoes','🚧','Ações e Ocorrências','Ações realizadas'],
 ['orientacoes','📋','Orientações à População','Como se proteger'],
 ['voluntario','🙋','Seja Voluntário','Ajude a Defesa Civil']
];
var FILTRO='';
function montarEstrutura(){
  var cards=document.querySelector('#view-inicio .cards');
  NOVAS.forEach(function(n){
    if(cards)cards.insertAdjacentHTML('beforeend','<div class="card" onclick="navTo(\''+n[0]+'\')"><div class="card-ico">'+n[1]+'</div><h3>'+n[2]+'</h3><p>'+n[3]+'</p></div>');
  });
  var menu=document.querySelector('#view-mais .container > div');
  if(menu)NOVAS.forEach(function(n){
    menu.insertAdjacentHTML('beforeend','<button onclick="navTo(\''+n[0]+'\')" style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--branco);border:1px solid var(--line);border-radius:var(--radius);font-size:14px;font-weight:600;width:100%;text-align:left;box-shadow:var(--shadow-sm);">'+n[1]+' '+n[2]+'</button>');
  });
  var v='';
  v+=view('legislacao','⚖️ Legislação','<div class="field"><label>Categoria</label><select id="leg-cat" onchange="dcxLeg()"><option value="">Todas</option><option value="lei">Leis</option><option value="decreto">Decretos</option><option value="portaria">Portarias</option><option value="resolucao">Resoluções</option><option value="norma">Normas</option></select></div><div id="leg-list"></div>');
  v+=view('grupo','📢 Canal Oficial da Defesa Civil Municipal','<div class="info-panel"><h3 id="grp-titulo"></h3><p id="grp-texto"></p></div><div class="form-panel"><h3>📲 Entre no canal oficial</h3><p style="font-size:13px;color:var(--cinza-escuro);margin-bottom:10px;">Receba os avisos da Defesa Civil Municipal de Ivatuba direto no seu WhatsApp.</p><a id="grp-btn" class="btn-alerta btn-alerta-primary" style="background:var(--verde);display:none;" target="_blank" rel="noopener" href="#">💬 Entrar no WhatsApp</a><div id="grp-res"></div></div>');
  v+=view('local','🏢 Local da Defesa Civil','<div class="info-panel"><h3>📍 Endereço</h3><p id="loc-end"></p><div id="loc-mapa" style="margin-top:10px;"></div></div><div class="section-title">Galeria</div><div id="loc-fotos" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;"></div>');
  v+=view('plano','📘 Plano de Contingência','<div id="plano-list"></div>');
  v+=view('acoes','🚧 Ações e Ocorrências','<div id="acoes-list"></div>');
  v+=view('orientacoes','📋 Orientações à População','<div id="orientacoes-list"></div>');
  v+=view('voluntario','🙋 Voluntário da Defesa Civil','<div class="info-panel"><h3>Quer ajudar o município?</h3><p>Cadastre-se como voluntário da Defesa Civil Municipal de Ivatuba. A equipe entrará em contato para explicar como participar.</p></div><div class="form-panel"><h3>📝 Ficha de inscrição</h3>'+
    '<div class="field"><label>Nome completo *</label><input id="vol-nome" maxlength="120" autocomplete="name"></div>'+
    '<div class="field"><label>WhatsApp / Telefone com DDD *</label><input id="vol-tel" type="tel" maxlength="20" placeholder="(44) 90000-0000" autocomplete="tel"></div>'+
    '<div class="field"><label>Bairro *</label><input id="vol-bairro" maxlength="80"></div>'+
    '<div class="field"><label>Disponibilidade *</label><select id="vol-disp"><option value="">Selecione</option><option>Manhã</option><option>Tarde</option><option>Noite</option><option>Integral</option><option>Fins de semana</option><option>Somente em emergências</option></select></div>'+
    '<div class="field"><label>Como gostaria de ajudar? *</label><select id="vol-area"><option value="">Selecione</option><option>Apoio logístico</option><option>Primeiros socorros</option><option>Comunicação e divulgação</option><option>Arrecadação de doações</option><option>Atendimento a abrigos</option><option>Outro</option></select></div>'+
    '<div class="field"><label>Experiência ou habilidades *</label><textarea id="vol-exp" rows="3" maxlength="500"></textarea></div>'+
    '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:10px 0;"><input type="checkbox" id="vol-18" style="margin-top:3px;"> <span>Declaro que tenho 18 anos ou mais.</span></label>'+
    '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:10px 0;"><input type="checkbox" id="vol-lgpd" style="margin-top:3px;"> <span>Autorizo o uso dos meus dados pela Defesa Civil Municipal de Ivatuba para contato sobre o voluntariado (LGPD).</span></label>'+
    '<button class="btn-alerta btn-alerta-primary" id="vol-btn" onclick="dcxVoluntario()">🙋 Enviar inscrição</button><div id="vol-res"></div></div>');
  var f=document.querySelector('footer');if(f)f.insertAdjacentHTML('beforebegin',v);
}
function view(id,t,body){return '<div class="view" id="view-'+id+'"><div class="container section"><div class="section-title">'+t+'</div>'+body+'</div></div>';}

/* ---------- Legislação ---------- */
var TIPOS={lei:'Lei',decreto:'Decreto',portaria:'Portaria',resolucao:'Resolução',norma:'Norma'};
window.dcxLeg=async function(){
  var el=$('leg-list');el.innerHTML='<div class="loading">Carregando...</div>';
  var c=$('leg-cat').value;
  try{var r=await sbGet('dc_legislacao',q((c?'&tipo=eq.'+encodeURIComponent(c):'')+'&order=data_publicacao.desc.nullslast'));
    el.innerHTML=r.length?r.map(function(l){var u=url(l.arquivo_url);
      return '<div class="comunicado-card"><div class="com-tipo">'+escHtml(TIPOS[l.tipo]||l.tipo)+(l.numero?' nº '+escHtml(l.numero):'')+(l.categoria?' · '+escHtml(l.categoria):'')+'</div><h4>'+escHtml(l.titulo)+'</h4>'+(l.descricao?'<p>'+escHtml(l.descricao)+'</p>':'')+'<div class="com-meta">'+fmtDate(l.data_publicacao)+'</div>'+
      (u?'<div class="actions" style="display:flex;gap:8px;margin-top:10px;"><a class="btn-alerta btn-alerta-primary" href="'+u+'" target="_blank" rel="noopener">👁️ Visualizar</a><a class="btn-alerta btn-alerta-outline" href="'+u+'" download>⬇️ Baixar</a></div>':'')+'</div>';}).join(''):empty('Nenhum documento cadastrado.');
  }catch(e){el.innerHTML=empty('Erro ao carregar.');}
};

/* ---------- Canal oficial (link só sai com o código) ---------- */
async function loadGrupo(){
  try{var r=await fetch(SB_URL+'/rest/v1/rpc/dc_grupo_info',{method:'POST',headers:{apikey:SB_KEY,'Content-Profile':'gestao360','Content-Type':'application/json'},body:'{}'});
    var d=await r.json();var g=d[0]||{};
    $('grp-titulo').textContent=g.titulo||'Canal Oficial da Defesa Civil Municipal';$('grp-texto').textContent=g.apresentacao||'';}catch(e){}
  var btn=$('grp-btn'),res=$('grp-res');if(res)res.innerHTML='';
  try{var r2=await fetch(SB_URL+'/rest/v1/rpc/dc_grupo_link',{method:'POST',headers:{apikey:SB_KEY,'Content-Profile':'gestao360','Content-Type':'application/json'},body:'{}'});
    var l=await r2.json();
    if(typeof l==='string'&&url(l)){btn.href=l;btn.style.display='inline-flex';}
    else{btn.style.display='none';res.innerHTML='<p style="font-size:13px;color:var(--cinza-escuro);">O link será divulgado em breve pela Defesa Civil.</p>';}
  }catch(e){btn.style.display='none';res.innerHTML='<p style="font-size:13px;color:var(--cinza-escuro);">O link será divulgado em breve pela Defesa Civil.</p>';}
}
window.dcxGrupo=async function(){
  var c=$('grp-codigo').value.trim(),res=$('grp-res');if(!c){res.innerHTML='<p style="color:var(--vermelho);font-size:13px;">Informe o código.</p>';return;}
  try{var r=await fetch(SB_URL+'/rest/v1/rpc/dc_obter_link_grupo',{method:'POST',headers:{apikey:SB_KEY,'Content-Profile':'gestao360','Content-Type':'application/json'},body:JSON.stringify({p_codigo:c})});
    var l=await r.json();
    if(typeof l==='string'&&url(l)){window.open(l,'_blank','noopener');res.innerHTML='<p style="color:var(--verde);font-size:13px;margin-top:8px;">Código aceito. Abrindo o WhatsApp...</p>';}
    else res.innerHTML='<p style="color:var(--vermelho);font-size:13px;margin-top:8px;">Código inválido ou grupo ainda não configurado.</p>';
  }catch(e){res.innerHTML='<p style="color:var(--vermelho);font-size:13px;margin-top:8px;">Erro ao verificar.</p>';}
};

/* ---------- Local ---------- */
async function loadLocal(){
  await loadContato();
  $('loc-end').textContent=CT.endereco||'Endereço a ser cadastrado pela Defesa Civil.';
  var m=$('loc-mapa'),la=CT.latitude,lo=CT.longitude;
  m.innerHTML=(la&&lo?'<iframe title="Mapa" style="width:100%;height:260px;border:0;border-radius:10px;" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox='+(lo-.004)+','+(la-.003)+','+(lo+.004)+','+(la+.003)+'&marker='+la+','+lo+'"></iframe>':'')+
   '<a class="btn-alerta btn-alerta-outline" style="margin-top:8px;" target="_blank" rel="noopener" href="'+mapaLink()+'">📍 Abrir no mapa</a>';
  var el=$('loc-fotos');
  try{var r=await sbGet('dc_local_fotos',q('&order=ordem.asc,criado_em.asc'));
    el.innerHTML=r.length?r.map(function(f){var u=url(f.imagem_url);return u?'<figure style="background:var(--branco);border-radius:12px;overflow:hidden;border:1px solid var(--line);"><a href="'+u+'" target="_blank" rel="noopener"><img src="'+u+'" alt="'+escHtml(f.legenda||'Foto')+'" loading="lazy" style="width:100%;height:120px;object-fit:cover;"></a><figcaption style="padding:8px;font-size:11px;color:var(--cinza-escuro);">'+(f.categoria?'<strong>'+escHtml(f.categoria)+'</strong><br>':'')+escHtml(f.legenda||'')+'</figcaption></figure>':'';}).join(''):empty('Nenhuma foto cadastrada.');
  }catch(e){el.innerHTML=empty('Erro ao carregar fotos.');}
}

/* ---------- Conteúdos (plano, ações, orientações, notícias) ---------- */
async function lista(tipo,elId){
  var el=$(elId);if(!el)return;el.innerHTML='<div class="loading">Carregando...</div>';
  try{var r=await sbGet('dc_conteudos',q('&tipo=eq.'+tipo+'&publicado=eq.true&order=criado_em.desc'));
    el.innerHTML=r.length?r.map(function(c){var a=url(c.arquivo_url),i=url(c.imagem_url);
      return '<div class="comunicado-card">'+(i?'<img src="'+i+'" alt="" loading="lazy" style="border-radius:10px;margin-bottom:10px;max-height:240px;width:100%;object-fit:cover;">':'')+'<h4>'+escHtml(c.titulo)+'</h4>'+(c.texto?'<p style="white-space:pre-line;">'+escHtml(c.texto)+'</p>':'')+'<div class="com-meta">'+fmtDate(c.criado_em)+'</div>'+
      (a?'<div style="display:flex;gap:8px;margin-top:10px;"><a class="btn-alerta btn-alerta-primary" href="'+a+'" target="_blank" rel="noopener">👁️ Visualizar</a><a class="btn-alerta btn-alerta-outline" href="'+a+'" download>⬇️ Baixar</a></div>':'')+'</div>';}).join(''):empty('Nada publicado ainda.');
  }catch(e){el.innerHTML=empty('Erro ao carregar.');}
}


/* ---------- Voluntário: inscrição (o público só consegue enviar, nunca ler a lista) ---------- */
window.dcxVoluntario=async function(){
  var res=$('vol-res'),nome=$('vol-nome').value.trim(),tel=dig($('vol-tel').value);
  function erro(m){res.innerHTML='<p style="color:var(--vermelho);font-size:13px;margin-top:10px;">'+escHtml(m)+'</p>';}
  if(nome.length<3)return erro('Informe seu nome completo.');
  if(tel.length<10||tel.length>13)return erro('Informe um telefone válido com DDD.');
  if(!$('vol-bairro').value.trim())return erro('Informe o seu bairro.');
  if(!$('vol-disp').value)return erro('Escolha a sua disponibilidade.');
  if(!$('vol-area').value)return erro('Escolha como gostaria de ajudar.');
  if($('vol-exp').value.trim().length<3)return erro('Conte brevemente a sua experiência ou habilidades.');
  if(!$('vol-18').checked)return erro('O voluntariado é para maiores de 18 anos.');
  if(!$('vol-lgpd').checked)return erro('É necessário autorizar o uso dos dados (LGPD).');
  var b=$('vol-btn');b.disabled=true;b.textContent='Enviando...';
  try{
    var r=await fetch(SB_URL+'/rest/v1/dc_voluntarios',{method:'POST',headers:{apikey:SB_KEY,'Content-Profile':'gestao360','Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({tenant_id:TID,nome:nome,telefone:tel,bairro:$('vol-bairro').value.trim()||null,disponibilidade:$('vol-disp').value||null,
        area_interesse:$('vol-area').value||null,experiencia:$('vol-exp').value.trim()||null,maior_18:true,consentimento:true,status:'novo'})});
    if(!r.ok)throw new Error('falha');
    res.innerHTML='<div class="protocolo-box"><p style="font-weight:700;">Inscrição enviada! Obrigado por querer ajudar.</p><p style="font-size:13px;margin-top:6px;">A Defesa Civil entrará em contato pelo telefone informado.</p></div>';
    ['vol-nome','vol-tel','vol-bairro','vol-exp'].forEach(function(i){$(i).value='';});['vol-disp','vol-area'].forEach(function(i){$(i).value='';});$('vol-18').checked=false;$('vol-lgpd').checked=false;
  }catch(e){erro('Não foi possível enviar agora. Tente novamente ou ligue para '+CT.telefone+'.');}
  finally{b.disabled=false;b.textContent='🙋 Enviar inscrição';}
};

/* ---------- Registro nos loaders existentes (sem sobrescrever) ---------- */
function init(){
  if(typeof LOADERS==='undefined'||!document.querySelector('#view-inicio .cards'))return setTimeout(init,100);
  montarEstrutura();
  LOADERS.legislacao=window.dcxLeg;LOADERS.grupo=loadGrupo;LOADERS.local=loadLocal;
  LOADERS.plano=function(){lista('plano_contingencia','plano-list');};
  LOADERS.acoes=function(){lista('acao','acoes-list');};
  LOADERS.orientacoes=function(){lista('orientacao','orientacoes-list');};
  /* Notícias entram na tela Comunicados já existente */
  var cv=document.querySelector('#view-comunicados .container');
  if(cv)cv.insertAdjacentHTML('beforeend','<div class="section-title" style="margin-top:20px;">📰 Notícias</div><div id="noticias-list"></div>');
  var antes=LOADERS.comunicados;
  LOADERS.comunicados=function(){if(antes)antes();lista('noticia','noticias-list');};
  loadContato();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
