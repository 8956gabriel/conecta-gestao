/* DEFESA CIVIL IVATUBA — Monitoramento meteorológico automático (painel administrativo)
   Usa as funções já existentes da página: sbGet, SB_URL, SB_KEY, session, fmtDateTime, tid.
   Carregado depois de conecta-gestao-defesa-civil.html (tag script antes de </body>). */
(function () {
  'use strict';
  var ROT = { normal: 'NORMAL', atencao: 'ATENÇÃO', alerta: 'ALERTA', emergencia: 'ALERTA MÁXIMO' };
  var ICO = { normal: '🟢', atencao: '🟡', alerta: '🟠', emergencia: '🔴' };
  var CLS = { normal: 'ok', atencao: 'warn', alerta: 'warn', emergencia: 'danger' };
  var FONTES = {
    defesa_civil_idap: 'Defesa Civil Nacional (IDAP) — alertas oficiais',
    inmet_avisos: 'INMET — avisos meteorológicos',
    inmet_previsao: 'INMET — previsão para Ivatuba',
    inmet_estacao: 'INMET — estação automática mais próxima',
    simepar: 'SIMEPAR'
  };
  var timer = null;

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function dt(v) { return v ? fmtDateTime(v) : '—'; }
  function hora(v) { return v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'; }
  function n(v, suf) { return v == null || v === '' ? '—' : (Math.round(Number(v) * 10) / 10) + (suf || ''); }

  async function rpc(nome, args) {
    var r = await fetch(SB_URL + '/rest/v1/rpc/' + nome, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Profile': 'gestao360', 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    });
    var t = await r.text(); var d = null; try { d = JSON.parse(t); } catch (e) {}
    if (!r.ok) throw new Error((d && (d.message || d.hint)) || t || ('HTTP ' + r.status));
    return d;
  }

  /* ---------------- tela "Status do Município" ---------------- */
  function montarTela() {
    var v = document.getElementById('view-config_dc'); if (!v || v.dataset.monitor) return;
    v.dataset.monitor = '1';
    v.innerHTML =
      '<div class="topbar"><div><h1>🔴 Status do Município</h1><div class="sub">Atualizado automaticamente a cada 10 minutos com dados oficiais (Defesa Civil Nacional/IDAP e INMET)</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn-ghost" id="mon-btn-agora" onclick="DCMonitor.consultarAgora()">🔄 Consultar agora</button></div></div>' +
      '<div id="mon-aviso"></div>' +
      '<div class="grid-2"><div class="panel"><h3>Nível de risco atual</h3><div id="mon-nivel">Carregando...</div></div>' +
      '<div class="panel"><h3>Conexão com os serviços meteorológicos</h3><div id="mon-conexao">Carregando...</div></div></div>' +
      '<div class="grid-2"><div class="panel"><h3>Condições meteorológicas atuais</h3><div id="mon-cond">Carregando...</div></div>' +
      '<div class="panel"><h3>Alertas oficiais para Ivatuba</h3><div id="mon-alertas">Carregando...</div></div></div>' +
      '<div class="panel"><h3>Intervenção manual (situações excepcionais)</h3>' +
      '<p class="panel-sub">Use somente quando necessário. Toda alteração manual fica registrada na Auditoria. Se surgir alerta oficial de nível maior, o sistema eleva o status automaticamente.</p>' +
      '<div id="mon-manual-estado" style="margin-bottom:10px;"></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Status</label><select id="cfg-status"><option value="normal">🟢 Normal</option><option value="atencao">🟡 Atenção</option><option value="alerta">🟠 Alerta</option><option value="emergencia">🔴 Alerta Máximo</option></select></div>' +
      '<div class="field"><label>Validade</label><select id="mon-horas"><option value="2">2 horas</option><option value="6" selected>6 horas</option><option value="12">12 horas</option><option value="24">24 horas</option><option value="0">Até eu liberar</option></select></div>' +
      '<div class="field"><label>Motivo (obrigatório)</label><input id="mon-motivo" placeholder="Ex: Ocorrência em campo confirmada"></div>' +
      '<div class="field span-2"><label>Mensagem para a população</label><input id="cfg-msg" placeholder="Ex: Chuvas previstas para as próximas 48h"></div></div>' +
      '<div class="form-actions"><button class="btn-accent" onclick="salvarConfig()" id="cfg-btn">Aplicar status manual</button> ' +
      '<button class="btn-ghost" onclick="DCMonitor.liberarManual()" id="mon-btn-liberar" style="margin-left:8px;">↩️ Voltar ao automático</button></div></div>' +
      '<div class="panel"><h3>Histórico de atualizações automáticas</h3><div style="overflow-x:auto;"><table><thead><tr><th>Data/hora</th><th>Tipo</th><th>Conexão</th><th>Nível</th><th>Alterou</th><th>Detalhes</th></tr></thead><tbody id="mon-hist"></tbody></table></div></div>' +
      '<div class="panel"><h3>Regras de classificação</h3><div style="font-size:12.5px;line-height:1.7;color:var(--ink-soft);">' +
      '🟢 <strong>NORMAL</strong>: nenhum alerta oficial e nenhuma condição de risco na previsão ou nas medições.<br>' +
      '🟡 <strong>ATENÇÃO</strong>: aviso oficial amarelo (INMET Perigo Potencial / Defesa Civil risco baixo-moderado), previsão do INMET de chuva, tempestade ou ventos fortes, chuva ≥ 20 mm/h ou rajada ≥ 60 km/h medidas na estação.<br>' +
      '🟠 <strong>ALERTA</strong>: somente alerta oficial laranja (INMET Perigo / Defesa Civil risco alto ou severo).<br>' +
      '🔴 <strong>ALERTA MÁXIMO</strong>: somente alerta oficial vermelho (INMET Grande Perigo / Defesa Civil risco muito alto ou extremo).<br>' +
      'Previsão isolada nunca passa de ATENÇÃO. Alerta oficial que começa daqui a mais de 6 h conta como ATENÇÃO até se aproximar. Em falha de comunicação o nível não é rebaixado; o rebaixamento exige 2 consultas seguidas confirmando.' +
      '</div></div>';
  }

  function painelNivel(e, cfg) {
    var nv = e.nivel_aplicado || (cfg && cfg.status_municipio) || 'normal';
    var h = '<div class="diag diag-' + CLS[nv] + '" style="font-size:15px;">' + ICO[nv] + ' <strong>' + ROT[nv] + '</strong>' +
      (e.manual_ativo ? ' <span class="status-pill status-pendente">manual</span>' : ' <span class="status-pill status-ativo">automático</span>') + '</div>';
    if (cfg && cfg.status_mensagem) h += '<p style="font-size:13px;margin-top:8px;">' + esc(cfg.status_mensagem) + '</p>';
    if (cfg && cfg.status_risco) h += '<p style="font-size:12.5px;margin-top:4px;"><strong>Tipo de risco:</strong> ' + esc(cfg.status_risco) + '</p>';
    if (e.nivel_calculado && e.nivel_calculado !== nv) h += '<p style="font-size:12px;color:var(--muted);margin-top:4px;">Nível calculado na última consulta: ' + ROT[e.nivel_calculado] + (e.rebaixamento_nivel ? ' (aguardando confirmação)' : '') + '</p>';
    var mot = Array.isArray(e.nivel_motivos) ? e.nivel_motivos : [];
    if (mot.length) h += '<details style="margin-top:8px;font-size:12px;"><summary style="cursor:pointer;">Por que este nível?</summary><ul style="margin:6px 0 0 18px;">' + mot.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></details>';
    h += '<p style="font-size:11px;color:var(--muted);margin-top:8px;">Status publicado em ' + dt(cfg && cfg.status_atualizado_em) + '</p>';
    return h;
  }

  function painelConexao(e) {
    var c = e.conexao || 'aguardando';
    var lbl = { ok: '🟢 Conectado', parcial: '🟡 Parcial', falha: '🔴 Falha de comunicação', aguardando: '⏳ Aguardando primeira consulta' }[c] || c;
    var h = '<div class="diag diag-' + (c === 'ok' ? 'ok' : c === 'falha' ? 'danger' : 'warn') + '"><strong>' + lbl + '</strong></div>' +
      '<div style="font-size:12.5px;line-height:1.9;margin-top:8px;">' +
      'Última consulta: <strong>' + dt(e.ultima_consulta_em) + '</strong><br>' +
      'Último dado válido: <strong>' + dt(e.ultima_consulta_ok_em) + '</strong><br>' +
      'Próxima consulta programada: <strong>' + dt(e.proxima_consulta_em || proximaPrevista(e.ultima_consulta_em)) + '</strong></div>' +
      '<table style="margin-top:8px;"><tbody>';
    var f = e.fontes || {};
    Object.keys(FONTES).forEach(function (k) {
      var x = f[k]; var st;
      if (!x) st = '<span style="color:var(--muted)">—</span>';
      else if (!x.configurada) st = '<span class="status-pill status-pendente">não configurado</span>';
      else st = x.ok ? '<span class="status-pill status-ativo">ok</span>' : '<span class="status-pill status-inativo">falha</span>';
      var det = x ? (x.erro || x.detalhe || '') : '';
      h += '<tr><td style="font-size:12px;">' + FONTES[k] + (det ? '<div style="font-size:11px;color:var(--muted);">' + esc(det) + '</div>' : '') + '</td><td style="text-align:right;">' + st + '</td></tr>';
    });
    return h + '</tbody></table>';
  }
  function proximaPrevista(ult) {
    var base = ult ? new Date(ult).getTime() : Date.now();
    return new Date(Math.ceil((base + 1000) / 600000) * 600000).toISOString();
  }

  function painelCondicoes(e) {
    var d = e.dados || {}; var o = d.observacao; var h = '';
    if (o) {
      h += '<div style="font-size:13px;line-height:1.9;">' +
        '<div style="font-size:22px;font-weight:800;">' + n(o.temperatura_c, '°C') + '</div>' +
        '💧 Umidade: <strong>' + n(o.umidade_pct, '%') + '</strong><br>' +
        '🌧️ Chuva na última hora: <strong>' + n(o.chuva_mm_h, ' mm') + '</strong><br>' +
        '💨 Vento: <strong>' + n(o.vento_kmh, ' km/h') + '</strong> · rajada <strong>' + n(o.rajada_kmh, ' km/h') + '</strong><br>' +
        '<span style="font-size:11px;color:var(--muted);">Estação INMET ' + esc(o.estacao) + ' (' + esc(o.codigo) + ')' + (o.distancia_km != null ? ' a ' + esc(o.distancia_km) + ' km' : '') + ' · medição ' + dt(o.medido_em) + '</span>' +
        (d.observacao_desatualizada ? '<div class="diag diag-warn" style="margin-top:6px;">⚠️ Medição desatualizada (estação sem resposta).</div>' : '') + '</div>';
    } else h += '<p style="color:var(--muted);font-size:12px;">Sem medição da estação ainda.</p>';
    var pv = Array.isArray(d.previsao) ? d.previsao.slice(0, 4) : [];
    if (pv.length) {
      var per = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite', dia: 'Dia' };
      h += '<div style="margin-top:10px;font-size:12.5px;"><strong>Previsão INMET</strong>' + pv.map(function (p) {
        return '<div style="padding:4px 0;border-bottom:1px solid var(--line);">' + esc(p.data) + ' · ' + (per[p.periodo] || p.periodo) + ': ' + esc(p.resumo) +
          (p.temp_max != null ? ' · ' + p.temp_min + '–' + p.temp_max + '°C' : '') + (p.int_vento ? ' · vento ' + esc(p.int_vento) : '') + '</div>';
      }).join('') + (d.previsao_desatualizada ? '<div class="diag diag-warn" style="margin-top:6px;">⚠️ Previsão desatualizada.</div>' : '') + '</div>';
    }
    return h;
  }

  function painelAlertas(e) {
    var al = ((e.dados || {}).alertas_oficiais) || [];
    if (!al.length) return '<div class="diag diag-ok">🟢 Nenhum alerta oficial vigente para Ivatuba.</div>';
    return al.map(function (a) {
      return '<div class="diag diag-' + CLS[a.nivel] + '" style="margin-bottom:6px;">' + ICO[a.nivel] + ' <strong>' + esc(a.titulo || a.evento) + '</strong><br>' +
        '<span style="font-size:11.5px;">' + esc(a.fonte) + ' · ' + esc(a.nivel_origem || '') + ' · ' + dt(a.inicio) + (a.fim ? ' até ' + dt(a.fim) : '') + '</span></div>';
    }).join('') + (e.dados && e.dados.alertas_desatualizados ? '<div class="diag diag-warn">⚠️ Lista de alertas desatualizada (falha nas fontes).</div>' : '');
  }

  function linhaHist(r) {
    var tipo = { consulta: 'Consulta ' + (r.origem === 'manual' ? 'manual' : 'automática'), manual: 'Alteração manual', liberacao_manual: 'Volta ao automático', falha_disparo: 'Falha no agendamento' }[r.tipo] || r.tipo;
    var con = r.conexao ? ({ ok: '🟢 ok', parcial: '🟡 parcial', falha: '🔴 falha' }[r.conexao] || r.conexao) : '—';
    var nv = r.nivel_aplicado ? ICO[r.nivel_aplicado] + ' ' + ROT[r.nivel_aplicado] : '—';
    var det = [];
    if (r.usuario) det.push('por ' + r.usuario);
    if (r.alterou_status) det.push('status: ' + (ROT[r.nivel_anterior] || '—') + ' → ' + (ROT[r.nivel_aplicado] || '—'));
    if (r.alteracoes && r.alteracoes.alertas_publicos) { var ap = r.alteracoes.alertas_publicos; det.push('alertas públicos: +' + ap.novos + ' / ~' + ap.atualizados + ' / -' + ap.encerrados); }
    if (Array.isArray(r.mensagens) && r.mensagens.length) det.push('divulgado: ' + r.mensagens.map(function (m) { return m.canal + (m.destinatarios != null ? ' (' + m.destinatarios + ')' : '') + (m.ok === false ? ' ❌' : ''); }).join(', '));
    if (Array.isArray(r.erros) && r.erros.length) det.push('⚠️ ' + r.erros.join('; '));
    if (r.motivo && !r.alterou_status && r.tipo !== 'consulta') det.push(r.motivo);
    return '<tr><td style="white-space:nowrap;">' + dt(r.executado_em) + '</td><td>' + tipo + '</td><td>' + con + '</td><td style="white-space:nowrap;">' + nv + '</td><td>' + (r.alterou_status ? 'Sim' : 'Não') + '</td>' +
      '<td style="font-size:11.5px;max-width:420px;">' + esc(det.join(' · ') || (r.duracao_ms ? r.duracao_ms + ' ms' : '')) + '</td></tr>';
  }

  async function carregar() {
    montarTela();
    try {
      var res = await Promise.all([
        sbGet('dc_monitor_estado', 'select=*&limit=1'),
        sbGet('dc_config', 'select=*&tenant_id=eq.' + tid() + '&limit=1').catch(function () { return []; }),
        sbGet('dc_monitor_consultas', 'select=*&order=executado_em.desc&limit=40').catch(function () { return []; })
      ]);
      var e = res[0][0], cfg = res[1][0] || {};
      if (!e) throw new Error('Tabela do monitor vazia. Execute a migração do monitoramento no Supabase.');
      document.getElementById('mon-aviso').innerHTML = cfg.status_desatualizado
        ? '<div class="diag diag-warn" style="margin-bottom:14px;">⚠️ ' + esc(cfg.status_aviso_falha || 'Dados desatualizados.') + ' O status não é rebaixado enquanto houver falha.</div>'
        : (cfg.status_aviso_falha ? '<div class="diag diag-warn" style="margin-bottom:14px;">⚠️ ' + esc(cfg.status_aviso_falha) + '</div>' : '');
      document.getElementById('mon-nivel').innerHTML = painelNivel(e, cfg);
      document.getElementById('mon-conexao').innerHTML = painelConexao(e);
      document.getElementById('mon-cond').innerHTML = painelCondicoes(e);
      document.getElementById('mon-alertas').innerHTML = painelAlertas(e);
      document.getElementById('mon-manual-estado').innerHTML = e.manual_ativo
        ? '<div class="diag diag-warn">✋ Status manual ativo: <strong>' + ROT[e.manual_status] + '</strong> desde ' + dt(e.manual_desde) + ' por ' + esc(e.manual_usuario || '—') + ' · validade: ' + (e.manual_ate ? dt(e.manual_ate) : 'até liberar') + '<br>Motivo: ' + esc(e.manual_motivo || '') + '</div>'
        : '<div class="diag diag-ok">⚙️ Modo automático ativo.</div>';
      document.getElementById('mon-btn-liberar').style.display = e.manual_ativo ? '' : 'none';
      var sel = document.getElementById('cfg-status'); if (sel && !sel.dataset.editado) sel.value = e.manual_ativo ? e.manual_status : (e.nivel_aplicado || cfg.status_municipio || 'normal');
      var hist = res[2];
      document.getElementById('mon-hist').innerHTML = hist.length ? hist.map(linhaHist).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;">Nenhuma consulta registrada ainda.</td></tr>';
    } catch (err) {
      document.getElementById('mon-nivel').innerHTML = '<div class="diag diag-danger">' + esc(err.message).slice(0, 300) + '</div>';
    }
  }

  function agendar() {
    clearInterval(timer);
    timer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      if (typeof currentView !== 'undefined' && currentView === 'config_dc') carregar();
      if (typeof currentView !== 'undefined' && currentView === 'dashboard_dc') dashClima();
    }, 60000);
  }

  /* ---------------- dashboard: card "Clima Ivatuba" (somente leitura, dados oficiais) ---------------- */
  async function dashClima() {
    var el = document.getElementById('dash-clima'); if (!el) return;
    try {
      var e = (await sbGet('dc_monitor_estado', 'select=dados,conexao,ultima_consulta_em,nivel_aplicado&limit=1'))[0];
      if (!e || !e.dados) { el.innerHTML = '<p style="color:var(--muted);font-size:12px;">Aguardando a primeira consulta automática.</p>'; return; }
      var o = e.dados.observacao || {};
      el.innerHTML = '<div style="font-size:13px;line-height:2;"><div style="font-size:22px;font-weight:800;">' + n(o.temperatura_c, '°C') + '</div>' +
        '💧 Umidade: ' + n(o.umidade_pct, '%') + '<br>💨 Vento: ' + n(o.vento_kmh, ' km/h') + ' (rajada ' + n(o.rajada_kmh, ' km/h') + ')<br>' +
        '🌧️ Chuva última hora: ' + n(o.chuva_mm_h, ' mm') + '<br>' +
        '<span style="font-size:11px;color:var(--muted);">Fonte: INMET' + (o.estacao ? ' · ' + esc(o.estacao) : '') + ' · consulta ' + hora(e.ultima_consulta_em) +
        (e.conexao === 'falha' ? ' · <span style="color:var(--danger)">falha de comunicação</span>' : '') + '</span></div>';
    } catch (err) { el.innerHTML = '<span style="color:var(--muted);font-size:12px;">Não foi possível carregar o clima.</span>'; }
  }

  /* ---------------- ações ---------------- */
  async function consultarAgora() {
    var b = document.getElementById('mon-btn-agora'); b.disabled = true; b.textContent = '⏳ Consultando...';
    try {
      var r = await rpc('dc_monitor_consultar_agora');
      if (r && r.ok === false) { alert(r.erro); return; }
      var antes = Date.now();
      // a consulta roda no servidor; acompanha até aparecer o resultado (até ~90 s)
      for (var i = 0; i < 18; i++) {
        await new Promise(function (ok) { setTimeout(ok, 5000); });
        var e = (await sbGet('dc_monitor_estado', 'select=ultima_consulta_em&limit=1'))[0];
        if (e && e.ultima_consulta_em && new Date(e.ultima_consulta_em).getTime() > antes - 5000) break;
      }
      await carregar();
    } catch (err) { alert('Erro: ' + err.message.slice(0, 200)); }
    finally { b.disabled = false; b.textContent = '🔄 Consultar agora'; }
  }

  async function salvarManual() {
    var b = document.getElementById('cfg-btn');
    var st = document.getElementById('cfg-status').value, msg = document.getElementById('cfg-msg').value.trim();
    var mot = document.getElementById('mon-motivo').value.trim(), h = parseInt(document.getElementById('mon-horas').value, 10);
    if (mot.length < 5) { alert('Informe o motivo da intervenção manual (mínimo 5 caracteres).'); return; }
    if (st === 'emergencia' && !confirm('Confirmar ALERTA MÁXIMO para o município? Esta ação será registrada na auditoria.')) return;
    b.disabled = true;
    try {
      await rpc('dc_monitor_definir_manual', { p_status: st, p_mensagem: msg, p_motivo: mot, p_horas: h || null });
      document.getElementById('mon-motivo').value = '';
      delete document.getElementById('cfg-status').dataset.editado;
      alert('Status manual aplicado e registrado na auditoria.');
      await carregar();
    } catch (err) { alert('Erro: ' + err.message.slice(0, 200)); }
    finally { b.disabled = false; }
  }

  async function liberarManual() {
    var mot = prompt('Motivo para voltar ao modo automático (opcional):', '') ;
    if (mot === null) return;
    try { await rpc('dc_monitor_liberar_manual', { p_motivo: mot || null }); alert('Modo automático restabelecido. O status será recalculado na próxima consulta.'); await carregar(); }
    catch (err) { alert('Erro: ' + err.message.slice(0, 200)); }
  }

  document.addEventListener('change', function (ev) { if (ev.target && ev.target.id === 'cfg-status') ev.target.dataset.editado = '1'; });

  /* ---------------- ligação com a página ---------------- */
  window.DCMonitor = { carregar: carregar, consultarAgora: consultarAgora, liberarManual: liberarManual, dashClima: dashClima };
  window.loadConfig = carregar;
  window.salvarConfig = salvarManual;
  window.carregarClimaDash = dashClima;        // não grava mais o status a partir de previsão
  if (typeof LOADERS !== 'undefined') LOADERS.config_dc = carregar;
  agendar();
})();
