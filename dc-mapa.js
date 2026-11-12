/* DEFESA CIVIL IVATUBA — módulo ADICIONAL do mapa. Não altera o mapa existente:
   acrescenta sede, ações, ocorrências encerradas e filtros por tipo. */
(function(){
'use strict';
var $=function(id){return document.getElementById(id);};
var G={alerta:[],ocorr:[],abrigo:[],enc:[],sede:[],acao:[]};
var ON={alerta:true,ocorr:true,abrigo:true,enc:true,sede:true,acao:true};
var ROT={alerta:['Alertas ativos','#D92D20'],ocorr:['Ocorrências abertas','#E9A23B'],enc:['Ocorrências encerradas','#98A2B3'],
  abrigo:['Abrigos','#16A36A'],sede:['Sede da Defesa Civil','#F28C28'],acao:['Ações realizadas','#155B91']};
var ORDEM=['alerta','ocorr','enc','abrigo','sede','acao'];
function q(t){return 'select=*&tenant_id=eq.'+TID+(t||'');}
function aplicar(k){G[k].forEach(function(m){if(ON[k]){if(!mapaObj.hasLayer(m))m.addTo(mapaObj);}else if(mapaObj.hasLayer(m))mapaObj.removeLayer(m);});}
function filtros(){
  if($('map-filtros'))return;
  var c=document.querySelector('#view-mapa .legend');
  var html='<div id="map-filtros" class="chips" style="margin-top:12px;" role="group" aria-label="Filtrar o mapa por tipo">'+ORDEM.map(function(k){
    return '<label class="chip"><input type="checkbox" data-k="'+k+'" checked><i style="width:10px;height:10px;border-radius:50%;background:'+ROT[k][1]+';display:inline-block"></i> '+ROT[k][0]+' <span id="mf-n-'+k+'" style="opacity:.7"></span></label>';}).join('')+'</div>';
  if(c){c.insertAdjacentHTML('afterend',html);c.style.display='none';}
  else{var cont=document.querySelector('#view-mapa .container');if(cont)cont.insertAdjacentHTML('beforeend',html);}
  document.querySelectorAll('#map-filtros input').forEach(function(i){i.addEventListener('change',function(){var k=i.getAttribute('data-k');ON[k]=i.checked;aplicar(k);});});
}
function contar(){ORDEM.forEach(function(k){var e=$('mf-n-'+k);if(e)e.textContent='('+G[k].length+')';});}
function num(v){return v===null||v===undefined||v===''?NaN:Number(v);}
var geoCache={};try{geoCache=JSON.parse(localStorage.getItem('dcGeo')||'{}');}catch(e){}
function variantes(addr){
  var a=String(addr).trim(),v=[a];
  var simples=a.replace(/(\d+)\s*[-–]\s*\d+/g,'$1');if(simples!==a)v.push(simples);
  var rua=a.split(/[,\-–]/)[0].replace(/\d+/g,'').trim();if(rua&&v.indexOf(rua)<0)v.push(rua);
  return v;
}
async function buscar(txt){
  try{
    var r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q='+encodeURIComponent(txt+' Ivatuba PR'));
    var d=await r.json();
    if(d&&d[0])return [parseFloat(d[0].lat),parseFloat(d[0].lon)];
  }catch(e){}
  return null;
}
async function geocode(addr){
  if(!addr)return null;
  if(geoCache[addr])return geoCache[addr];
  var v=variantes(addr);
  for(var i=0;i<v.length;i++){
    var p=await buscar(v[i]);
    if(p){geoCache[addr]=p;try{localStorage.setItem('dcGeo',JSON.stringify(geoCache));}catch(e){}return p;}
    await new Promise(function(r){setTimeout(r,1100);});
  }
  return null;
}
function pinSede(){return L.divIcon({className:'',iconSize:[34,42],iconAnchor:[17,40],popupAnchor:[0,-36],
  html:'<svg width="34" height="42" viewBox="0 0 24 30" aria-hidden="true"><path d="M12 29s9-7.5 9-16a9 9 0 0 0-18 0c0 8.5 9 16 9 16z" fill="#F28C28" stroke="#103B60" stroke-width="1.5"/><circle cx="12" cy="13" r="3.6" fill="#103B60"/></svg>'});}
async function sede(){
  try{
    var r=await sbGet('dc_contato','select=endereco,latitude,longitude&tenant_id=eq.'+TID+'&limit=1');
    if(!r.length)return;
    var e=r[0],lat=num(e.latitude),lng=num(e.longitude);
    if(isNaN(lat)||isNaN(lng)){var g=await geocode(e.endereco);if(!g)return;lat=g[0];lng=g[1];}
    var link='https://www.google.com/maps?q='+lat+','+lng;
    var m=L.marker([lat,lng],{icon:pinSede(),title:'Sede da Defesa Civil'}).bindPopup('<strong>Sede da Defesa Civil</strong>'+(e.endereco?'<br>'+escHtml(e.endereco):'')+'<br><a href="'+link+'" target="_blank" rel="noopener">Abrir no Google Maps</a>');
    G.sede.push(m);
  }catch(x){}
}
async function encerradas(){
  try{
    var o=await sbGet('dc_ocorrencias','select=tipo,protocolo,latitude,longitude,criado_em&tenant_id=eq.'+TID+'&status=eq.encerrada&order=criado_em.desc&limit=100');
    o.forEach(function(x){
      if(x.latitude&&x.longitude)G.enc.push(L.circleMarker([x.latitude,x.longitude],{radius:6,fillColor:'#98A2B3',color:'#fff',weight:1.5,fillOpacity:.75})
        .bindPopup('<strong>'+escHtml(x.tipo)+'</strong><br>'+escHtml(x.protocolo)+'<br>'+fmtDateTime(x.criado_em)+'<br><em>Encerrada</em>'));
    });
  }catch(x){}
}
async function abrigos(){
  try{
    var a=await sbGet('dc_abrigos','select=nome,endereco,latitude,longitude&tenant_id=eq.'+TID);
    for(var i=0;i<a.length;i++){
      var x=a[i];
      if(x.latitude&&x.longitude)continue;
      if(!x.endereco)continue;
      var fresh=!geoCache[x.endereco];var g=await geocode(x.endereco);if(!g)continue;
      G.abrigo.push(L.circleMarker(g,{radius:8,fillColor:'#059669',color:'#fff',weight:2,fillOpacity:.8})
        .bindPopup('<strong>'+escHtml(x.nome)+'</strong><br>'+escHtml(x.endereco||'')));
      if(fresh)await new Promise(function(r){setTimeout(r,1100);});
    }
  }catch(e){}
}
async function acoes(){
  try{
    var a=await sbGet('dc_conteudos','select=titulo,texto,endereco,latitude,longitude&tenant_id=eq.'+TID+'&tipo=eq.acao&publicado=eq.true&order=criado_em.desc&limit=100');
    for(var i=0;i<a.length;i++){
      var x=a[i],lat=num(x.latitude),lng=num(x.longitude);
      if(isNaN(lat)||isNaN(lng)){
        if(!x.endereco)continue;
        var fresh=!geoCache[x.endereco];var g=await geocode(x.endereco);if(!g)continue;lat=g[0];lng=g[1];
        if(fresh)await new Promise(function(r){setTimeout(r,1100);});
      }
      G.acao.push(L.circleMarker([lat,lng],{radius:9,fillColor:'#155B91',color:'#fff',weight:2,fillOpacity:.9})
        .bindPopup('<strong>'+escHtml(x.titulo)+'</strong>'+(x.endereco?'<br>'+escHtml(x.endereco):'')+(x.texto?'<br>'+escHtml(String(x.texto).slice(0,180)):'')));
    }
  }catch(x){}
}
var orig=window.carregarDadosMapa;
if(typeof orig==='function'){
  window.carregarDadosMapa=async function(){
    if(!mapaObj)return;
    ORDEM.forEach(function(k){G[k].forEach(function(m){try{mapaObj.removeLayer(m);}catch(e){}});G[k]=[];});
    var oc=L.circleMarker;
    L.circleMarker=function(ll,o){var m=oc.call(L,ll,o);var c=(o&&o.fillColor)||'';
      G[c==='#D97706'?'ocorr':c==='#059669'?'abrigo':'alerta'].push(m);return m;};
    try{await orig();}finally{L.circleMarker=oc;}
    filtros();contar();
    await Promise.all([sede(),encerradas()]);
    ORDEM.forEach(aplicar);contar();
    await abrigos();aplicar('abrigo');contar();
    await acoes();
    aplicar('acao');contar();
  };
}
})();
