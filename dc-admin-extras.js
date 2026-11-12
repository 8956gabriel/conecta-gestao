/* DEFESA CIVIL IVATUBA — PAINEL ADMIN: módulo ADICIONAL (não altera nada existente).
   Acrescenta ao painel: Legislação, Canal Oficial, Local (fotos), Contato, Plano de Contingência,
   Ações e Ocorrências, Orientações e Notícias — com adicionar/editar/excluir e envio real de PDF/fotos.
   Uso: subir ao lado de conecta-gestao-defesa-civil.html e acrescentar, logo ANTES do </body>:
   a tag script com src="/dc-admin-extras.js"                                                       */
(function(){
'use strict';
var BUCKET='dc-arquivos', MAX_MB=20;
var SN=[['true','Sim'],['false','Não']];
function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
function safeUrl(u){return /^https:\/\//i.test(u||'')?u:'';}
function link(u,t){u=safeUrl(u);return u?'<a href="'+u+'" target="_blank" rel="noopener" style="color:var(--accent,#2563EB);font-weight:700;">'+t+'</a>':'—';}
function thumb(u){u=safeUrl(u);return u?'<img src="'+u+'" alt="" style="width:64px;height:44px;object-fit:cover;border-radius:6px;">':'—';}
function sim(v){return v?'Sim':'Não';}

var UP_PDF={pasta:'documentos',accept:'application/pdf'};
var UP_ANY={pasta:'documentos',accept:'application/pdf,image/*'};
var UP_IMG={pasta:'imagens',accept:'image/*'};

/* ---------- Módulos (usam o CRUD genérico do painel) ---------- */
MODULES.legislacao_dc={table:'dc_legislacao',title:'Legislação',fields:[
  {id:'tipo',label:'Tipo',type:'select',opts:[['lei','Lei'],['decreto','Decreto'],['portaria','Portaria'],['resolucao','Resolução'],['norma','Norma']]},
  {id:'numero',label:'Número'},{id:'data_publicacao',label:'Data',type:'date'},
  {id:'titulo',label:'Título',span:2,required:true},{id:'categoria',label:'Categoria'},
  {id:'descricao',label:'Descrição',span:3},
  {id:'arquivo_url',label:'Documento PDF',span:3,upload:{pasta:'legislacao',accept:'application/pdf'}}
 ],cols:['tipo','numero','titulo','data_publicacao','arquivo_url'],colLabels:['Tipo','Número','Título','Data','PDF'],
 renderCol:function(r,c){return c==='data_publicacao'?fmtDate(r[c]):c==='arquivo_url'?link(r[c],'Abrir'):esc(r[c]);},
 query:'order=data_publicacao.desc.nullslast'};

MODULES.grupo_dc={table:'dc_grupo_oficial',title:'Canal Oficial (WhatsApp)',fields:[
  {id:'titulo',label:'Título',span:3},
  {id:'apresentacao',label:'Apresentação do grupo',span:3},
  {id:'link_whatsapp',label:'Link do canal ou grupo do WhatsApp (https://...)',span:3}
 ],cols:['titulo','apresentacao','link_whatsapp'],colLabels:['Título','Apresentação','Link'],
 renderCol:function(r,c){return c==='link_whatsapp'?(r[c]?'Cadastrado':'—'):esc(r[c]);},
 query:'order=atualizado_em.desc'};

MODULES.local_dc={table:'dc_local_fotos',title:'Local da Defesa Civil — Fotos',fields:[
  {id:'categoria',label:'Categoria',type:'select',opts:[['Fachada','Fachada'],['Parte interna','Parte interna'],['Veículos','Veículos'],['Equipamentos','Equipamentos'],['Estrutura','Estrutura'],['Outros','Outros']]},
  {id:'legenda',label:'Legenda',span:2},
  {id:'ordem',label:'Ordem de exibição',type:'number'},
  {id:'imagem_url',label:'Foto',span:3,upload:{pasta:'local',accept:'image/*'}}
 ],cols:['imagem_url','categoria','legenda','ordem'],colLabels:['Foto','Categoria','Legenda','Ordem'],
 renderCol:function(r,c){return c==='imagem_url'?thumb(r[c]):esc(r[c]);},
 query:'order=ordem.asc,criado_em.asc'};

MODULES.contato_dc={table:'dc_contato',title:'Contato e Localização',fields:[
  {id:'telefone',label:'Telefone (como aparece no site)',required:true},
  {id:'whatsapp',label:'WhatsApp só com números (ex.: 5544920096867)'},
  {id:'endereco',label:'Endereço da sede',span:3},
  {id:'latitude',label:'Latitude (opcional)',type:'number'},{id:'longitude',label:'Longitude (opcional)',type:'number'}
 ],cols:['telefone','whatsapp','endereco'],colLabels:['Telefone','WhatsApp','Endereço'],
 renderCol:function(r,c){return esc(r[c]);},query:'order=atualizado_em.desc'};

function conteudo(tipo,rotulo){
  return {table:'dc_conteudos',title:rotulo,fields:[
    {id:'tipo',label:'Seção',type:'select',opts:[[tipo,rotulo]]},
    {id:'titulo',label:'Título',span:2,required:true},
    {id:'publicado',label:'Publicado no site',type:'select',opts:SN},
    {id:'texto',label:'Texto',span:3}].concat(tipo==='acao'?[
    {id:'endereco',label:'Local da ação (endereço — aparece no mapa do site)',span:3},
    {id:'latitude',label:'Latitude (opcional, mais preciso)',type:'number'},{id:'longitude',label:'Longitude (opcional)',type:'number'}]:[]).concat([
    {id:'arquivo_url',label:'Documento (PDF)',span:3,upload:UP_PDF},
    {id:'imagem_url',label:'Imagem',span:3,upload:UP_IMG}
   ]),cols:['titulo','publicado','arquivo_url','imagem_url','criado_em'],colLabels:['Título','Publicado','Documento','Imagem','Criado em'],
   renderCol:function(r,c){return c==='publicado'?sim(r.publicado):c==='arquivo_url'?link(r[c],'Abrir'):c==='imagem_url'?thumb(r[c]):c==='criado_em'?fmtDateTime(r[c]):esc(r[c]);},
   query:'tipo=eq.'+tipo+'&order=criado_em.desc'};
}
MODULES.plano_dc=conteudo('plano_contingencia','Plano de Contingência');
MODULES.acoes_site_dc=conteudo('acao','Ações e Ocorrências (site)');
MODULES.orient_dc=conteudo('orientacao','Orientações à População');
MODULES.noticias_dc=conteudo('noticia','Comunicados e Notícias (site)');


MODULES.voluntarios_dc={table:'dc_voluntarios',title:'Voluntários da Defesa Civil',fields:[
  {id:'nome',label:'Nome',span:2,required:true},{id:'telefone',label:'Telefone / WhatsApp',required:true},
  {id:'bairro',label:'Bairro'},
  {id:'disponibilidade',label:'Disponibilidade',type:'select',opts:[['Manhã','Manhã'],['Tarde','Tarde'],['Noite','Noite'],['Integral','Integral'],['Fins de semana','Fins de semana'],['Somente em emergências','Somente em emergências']]},
  {id:'area_interesse',label:'Área de interesse'},
  {id:'status',label:'Situação',type:'select',opts:[['novo','Novo'],['em_analise','Em análise'],['ativo','Ativo'],['inativo','Inativo']]},
  {id:'experiencia',label:'Experiência / habilidades',span:3},{id:'observacoes',label:'Observações internas',span:3}
 ],cols:['nome','telefone','bairro','area_interesse','status','criado_em'],colLabels:['Nome','Telefone','Bairro','Área','Situação','Inscrito em'],
 renderCol:function(r,c){return c==='criado_em'?fmtDateTime(r[c]):c==='status'?pill(r.status):esc(r[c]);},
 query:'order=criado_em.desc'};

var NOVOS=['voluntarios_dc','legislacao_dc','grupo_dc','local_dc','contato_dc','plano_dc','acoes_site_dc','orient_dc','noticias_dc'];

/* ---------- Menu lateral: novo grupo, sem tirar nada ---------- */
NAV_GROUPS.splice(Math.max(NAV_GROUPS.length-1,0),0,{label:'Conteúdo do Site',items:[
  ['legislacao_dc','⚖️ Legislação'],['grupo_dc','📢 Canal Oficial'],['local_dc','🏢 Local (fotos)'],['contato_dc','☎️ Contato e Localização'],
  ['plano_dc','📘 Plano de Contingência'],['acoes_site_dc','🚧 Ações e Ocorrências (site)'],['orient_dc','📋 Orientações'],['noticias_dc','📰 Comunicados e Notícias'],['voluntarios_dc','🙋 Voluntários']]});

NOVOS.forEach(function(k){LOADERS[k]=function(){loadData(k);};});

/* ---------- Envio real de arquivos (Supabase Storage) ---------- */
async function enviar(file,pasta){
  if(file.size>MAX_MB*1024*1024)throw new Error('Arquivo maior que '+MAX_MB+' MB.');
  var nome=Date.now()+'-'+file.name.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-80);
  var path=pasta+'/'+nome;
  var r=await fetch(SB_URL+'/storage/v1/object/'+BUCKET+'/'+path,{method:'POST',
    headers:{apikey:SB_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file});
  if(!r.ok)throw new Error((await r.text()).slice(0,150));
  return SB_URL+'/storage/v1/object/public/'+BUCKET+'/'+path;
}
function decorarUpload(k,f){
  var inp=document.getElementById('cf-'+k+'-'+f.id);if(!inp||inp.dataset.dcx)return;inp.dataset.dcx='1';
  var box=document.createElement('div');box.style.cssText='margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
  box.innerHTML='<input type="file" accept="'+f.upload.accept+'" style="font-size:12px;max-width:100%;"><button type="button" class="btn-ghost">⬆️ Enviar arquivo</button><span style="font-size:12px;"></span>';
  var fi=box.children[0],bt=box.children[1],st=box.children[2];
  bt.onclick=async function(){
    if(!fi.files[0]){st.style.color='#DC2626';st.textContent='Escolha um arquivo primeiro.';return;}
    bt.disabled=true;st.style.color='#475569';st.textContent='Enviando...';
    try{inp.value=await enviar(fi.files[0],f.upload.pasta);st.style.color='#059669';st.textContent='✔ Enviado. Clique em Salvar para concluir.';fi.value='';}
    catch(e){st.style.color='#DC2626';st.textContent='Erro: '+e.message;}
    finally{bt.disabled=false;}
  };
  inp.insertAdjacentElement('afterend',box);
}

/* ---------- Código de acesso do grupo ---------- */
window.dcDefinirCodigo=async function(){
  var c=prompt('Novo código de acesso ao grupo (mínimo 6 caracteres).\nSó quem receber este código conseguirá abrir o convite do WhatsApp:');
  if(!c)return;c=c.trim();if(c.length<6){alert('Código muito curto.');return;}
  try{var r=await fetch(SB_URL+'/rest/v1/rpc/dc_definir_codigo',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+session.access_token,'Content-Profile':'gestao360','Content-Type':'application/json'},body:JSON.stringify({p_codigo:c})});
    if(!r.ok)throw new Error((await r.text()).slice(0,150));alert('Código atualizado. Divulgue-o apenas aos integrantes autorizados.');
  }catch(e){alert('Erro: '+e.message);}
};

/* ---------- Gancho: depois que o painel monta as telas ---------- */
var _bv=buildViews;
buildViews=function(){
  _bv.apply(this,arguments);
  NOVOS.forEach(function(k){MODULES[k].fields.forEach(function(f){if(f.upload)decorarUpload(k,f);});});
  var tb=document.querySelector('#view-grupo_dc .topbar > div:last-child');
  if(tb&&!tb.querySelector('[data-dcx]')){var b=document.createElement('button');b.className='btn-ghost';b.dataset.dcx='1';b.textContent='🔑 Definir código de acesso';b.onclick=window.dcDefinirCodigo;tb.insertBefore(b,tb.firstChild);}
};

/* ---------- Salvar já envia o arquivo escolhido (evita esquecer o botão "Enviar arquivo") ---------- */
var _sc=submitCrud;
submitCrud=async function(k){
  if(NOVOS.indexOf(k)>=0){
    var campos=MODULES[k].fields.filter(function(f){return f.upload;});
    for(var i=0;i<campos.length;i++){
      var f=campos[i],inp=document.getElementById('cf-'+k+'-'+f.id);if(!inp)continue;
      var fi=inp.nextElementSibling&&inp.nextElementSibling.querySelector('input[type=file]');
      var st=inp.nextElementSibling&&inp.nextElementSibling.lastElementChild;
      if(fi&&fi.files[0]){
        try{if(st){st.style.color='#475569';st.textContent='Enviando...';}
          inp.value=await enviar(fi.files[0],f.upload.pasta);fi.value='';
          if(st){st.style.color='#059669';st.textContent='✔ Enviado.';}
        }catch(e){if(st){st.style.color='#DC2626';st.textContent='Erro: '+e.message;}alert('Não foi possível enviar o arquivo: '+e.message);return;}
      }
      var v=(inp.value||'').trim();
      if(v&&!/^https:\/\//i.test(v)){alert('O campo "'+f.label+'" precisa ser um endereço https:// válido. Apague o texto e escolha o arquivo.');return;}
    }
  }
  return _sc.apply(this,arguments);
};
})();
