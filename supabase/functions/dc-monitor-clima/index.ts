// Edge Function: dc-monitor-clima
// Consulta fontes meteorológicas OFICIAIS para Ivatuba-PR, classifica o risco,
// atualiza o status público, registra histórico e prepara notificações.
// Disparada pelo pg_cron a cada 10 minutos (ver migração 20261116200000).
//
// Fontes:
//   - Defesa Civil Nacional / IDAP (CAP 1.2) — canal oficial de alertas, inclui os emitidos pela Defesa Civil do PR
//   - INMET: avisos meteorológicos, previsão por município e estação automática mais próxima
//   - SIMEPAR: somente com credencial institucional (SIMEPAR_API_URL / SIMEPAR_API_TOKEN). Sem isso, fica "não configurado".

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4";
import {
  AlertaOficial, capsParaAlertas, chaveEvento, classificar, decidir, decidirNotificacao, inmetJsonParaAlertas,
  lerCap, lerEstacao, lerPrevisao, maxNivel, mensagemStatus, Municipio, Nivel, nivelIdap, nivelInmet,
  orientacao, rank, ROTULO, textoPopulacao, CapInfo,
} from "./lib.ts";

const TENANT = "00000000-0000-0000-0000-000000000001";
const URL_IDAP = "https://idapfile.mdr.gov.br/idap/api/rss/cap";
const URL_INMET = "https://apiprevmet3.inmet.gov.br";
const UA = "DefesaCivil-Ivatuba-Monitor/1.0 (+Conecta Gestao 360)";

type Fonte = { ok: boolean; configurada: boolean; http?: number; erro?: string; itens?: number; detalhe?: string; ms?: number };

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, parseTagValue: false, trimValues: true });

async function baixar(url: string, opt: { timeout?: number; limite?: number; headers?: Record<string, string> } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opt.timeout ?? 25000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "*/*", ...(opt.headers || {}) } });
    const limite = opt.limite ?? 40_000_000;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > limite) throw new Error(`resposta grande demais (${buf.byteLength} bytes)`);
    return { status: r.status, ok: r.ok, texto: new TextDecoder().decode(buf) };
  } finally { clearTimeout(t); }
}

function erroTxt(e: unknown) {
  const s = e instanceof Error ? (e.name === "AbortError" ? "tempo esgotado" : e.message) : String(e);
  return s.slice(0, 300);
}

/** Extrai blocos <alert> que podem envolver o município (pré-filtro barato antes do XML). */
function blocosCap(texto: string, m: Municipio): string[] {
  const out: string[] = [];
  const re = /<(?:\w+:)?alert[\s>][\s\S]*?<\/(?:\w+:)?alert>/g;
  const nome = new RegExp(m.nome, "i");
  for (const b of texto.match(re) || []) {
    if (b.includes(m.ibge) || b.includes(m.ibge.slice(0, 6)) || nome.test(b) || (/<(?:\w+:)?polygon>/.test(b) && /Paran[aá]|\bPR\b/.test(b))) out.push(b);
  }
  return out;
}
function capsDeBlocos(blocos: string[]): CapInfo[] {
  const caps: CapInfo[] = [];
  for (const b of blocos) {
    try {
      const o = xml.parse(b) as Record<string, unknown>;
      const a = (o.alert || Object.values(o)[0]) as Record<string, unknown>;
      if (a) caps.push(lerCap(a));
    } catch { /* bloco malformado: ignora */ }
  }
  return caps;
}

// ---------------------------------------------------------------- fontes
async function fonteIdap(m: Municipio, agora: Date): Promise<{ f: Fonte; alertas: AlertaOficial[] }> {
  const t0 = Date.now();
  try {
    const r = await baixar(URL_IDAP, { timeout: 60000 });
    if (!r.ok) return { f: { ok: false, configurada: true, http: r.status, erro: `HTTP ${r.status}`, ms: Date.now() - t0 }, alertas: [] };
    const blocos = blocosCap(r.texto, m);
    const totalFeed = (r.texto.match(/<(?:\w+:)?alert[\s>]/g) || []).length;
    // Feed sem CAP embutido: segue os links dos itens que citam o município
    if (!totalFeed) {
      const itens = r.texto.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) || [];
      const links: string[] = [];
      for (const it of itens) {
        if (!(it.includes(m.ibge) || new RegExp(m.nome, "i").test(it) || /Paran[aá]|\bPR\b/.test(it))) continue;
        const l = /<link[^>]*href="([^"]+)"/.exec(it)?.[1] || /<link>([^<]+)<\/link>/.exec(it)?.[1];
        if (l) links.push(l.trim());
      }
      for (const l of links.slice(0, 30)) {
        try { const s = await baixar(l, { timeout: 15000, limite: 3_000_000 }); if (s.ok) blocos.push(...blocosCap(s.texto, m)); } catch { /* segue */ }
      }
    }
    const caps = capsDeBlocos(blocos);
    const alertas = capsParaAlertas(caps, "Defesa Civil (IDAP)", m, agora, (c) => nivelIdap(c.info!));
    return { f: { ok: true, configurada: true, http: r.status, itens: alertas.length, detalhe: `${totalFeed || "?"} alertas no feed nacional, ${caps.length} analisados`, ms: Date.now() - t0 }, alertas };
  } catch (e) {
    return { f: { ok: false, configurada: true, erro: erroTxt(e), ms: Date.now() - t0 }, alertas: [] };
  }
}

async function fonteInmetAvisos(m: Municipio, agora: Date): Promise<{ f: Fonte; alertas: AlertaOficial[] }> {
  const t0 = Date.now();
  // 1) JSON de avisos ativos
  try {
    const r = await baixar(`${URL_INMET}/avisos/ativos`, { timeout: 25000, headers: { Accept: "application/json" } });
    if (r.ok) {
      const d = JSON.parse(r.texto);
      const { alertas, total } = inmetJsonParaAlertas(d, m, agora);
      if (total > 0 || Array.isArray(d) || (d && typeof d === "object")) {
        return { f: { ok: true, configurada: true, http: r.status, itens: alertas.length, detalhe: `${total} avisos ativos no país (JSON)`, ms: Date.now() - t0 }, alertas };
      }
    }
  } catch { /* cai para o RSS */ }
  // 2) RSS + CAP de cada aviso
  try {
    const r = await baixar(`${URL_INMET}/avisos/rss`, { timeout: 25000 });
    if (!r.ok) return { f: { ok: false, configurada: true, http: r.status, erro: `HTTP ${r.status}`, ms: Date.now() - t0 }, alertas: [] };
    const blocos = blocosCap(r.texto, m);
    if (!(r.texto.match(/<(?:\w+:)?alert[\s>]/g) || []).length) {
      const itens = r.texto.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
      const links = itens.map((it) => /<link>([^<]+)<\/link>/.exec(it)?.[1] || (/<guid[^>]*>([^<]+)<\/guid>/.exec(it)?.[1] ?? "").replace(/^(\d+)$/, `${URL_INMET}/avisos/rss/$1`))
        .filter((l) => /^https?:/.test(l));
      const fila = links.slice(0, 80);
      for (let i = 0; i < fila.length; i += 8) {
        const lote = await Promise.allSettled(fila.slice(i, i + 8).map((l) => baixar(l, { timeout: 15000, limite: 3_000_000 })));
        for (const x of lote) if (x.status === "fulfilled" && x.value.ok) blocos.push(...blocosCap(x.value.texto, m));
      }
    }
    const caps = capsDeBlocos(blocos);
    const alertas = capsParaAlertas(caps, "INMET", m, agora, (c) => {
      const i = c.info!;
      return nivelInmet(`${i.headline} ${i.event} ${i.description} ${Object.values(i.params).join(" ")}`, i.severity, i.params.ColorRisk || "");
    });
    return { f: { ok: true, configurada: true, http: r.status, itens: alertas.length, detalhe: `${caps.length} avisos analisados (RSS/CAP)`, ms: Date.now() - t0 }, alertas };
  } catch (e) {
    return { f: { ok: false, configurada: true, erro: erroTxt(e), ms: Date.now() - t0 }, alertas: [] };
  }
}

async function fonteInmetJson(caminho: string) {
  const t0 = Date.now();
  try {
    const r = await baixar(`${URL_INMET}${caminho}`, { timeout: 20000, headers: { Accept: "application/json" } });
    if (!r.ok) return { f: { ok: false, configurada: true, http: r.status, erro: `HTTP ${r.status}`, ms: Date.now() - t0 } as Fonte, d: null };
    return { f: { ok: true, configurada: true, http: r.status, ms: Date.now() - t0 } as Fonte, d: JSON.parse(r.texto) };
  } catch (e) {
    return { f: { ok: false, configurada: true, erro: erroTxt(e), ms: Date.now() - t0 } as Fonte, d: null };
  }
}

/** SIMEPAR: o órgão não publica API aberta. Só consulta com URL e token fornecidos por convênio. */
async function fonteSimepar(): Promise<{ f: Fonte; bruto: unknown }> {
  const url = Deno.env.get("SIMEPAR_API_URL"), token = Deno.env.get("SIMEPAR_API_TOKEN");
  if (!url || !token) {
    return { f: { ok: false, configurada: false, detalhe: "Aguardando credenciamento institucional junto ao SIMEPAR (sem API pública)." }, bruto: null };
  }
  const t0 = Date.now();
  try {
    const r = await baixar(url, { timeout: 20000, limite: 5_000_000, headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { f: { ok: false, configurada: true, http: r.status, erro: `HTTP ${r.status}`, ms: Date.now() - t0 }, bruto: null };
    // O formato depende do serviço contratado; os dados ficam no histórico e só entram na classificação
    // depois que o leitor do formato oficial for implementado (ver guia de implantação).
    let bruto: unknown = r.texto.slice(0, 20000);
    try { bruto = JSON.parse(r.texto); } catch { /* texto */ }
    return { f: { ok: true, configurada: true, http: r.status, detalhe: "Conectado. Interpretação aguarda a especificação oficial do formato.", ms: Date.now() - t0 }, bruto };
  } catch (e) {
    return { f: { ok: false, configurada: true, erro: erroTxt(e), ms: Date.now() - t0 }, bruto: null };
  }
}

// ---------------------------------------------------------------- persistência
async function inserirTolerante(sb: SupabaseClient, tabela: string, linhas: Record<string, unknown>[], opcionais: string[]) {
  if (!linhas.length) return { ok: true as const };
  let { error } = await sb.from(tabela).insert(linhas);
  if (error && opcionais.length) {
    const reduzidas = linhas.map((l) => { const c = { ...l }; for (const k of opcionais) delete c[k]; return c; });
    ({ error } = await sb.from(tabela).insert(reduzidas));
  }
  return error ? { ok: false as const, erro: error.message } : { ok: true as const };
}

async function publicarAlertasOficiais(sb: SupabaseClient, alertas: AlertaOficial[], municipio: string) {
  const res = { novos: 0, atualizados: 0, encerrados: 0, erros: [] as string[] };
  const ext = (a: AlertaOficial) => `${a.fonte === "INMET" ? "inmet" : a.fonte === "SIMEPAR" ? "simepar" : "idap"}:${a.id}`;
  const atuais = new Set(alertas.map(ext));
  const { data: existentes, error } = await sb.from("dc_alertas").select("id,external_id,ativo,hash_conteudo")
    .eq("tenant_id", TENANT).like("external_id", "%:%");
  if (error) { res.erros.push("leitura dc_alertas: " + error.message); return res; }
  const porExt = new Map((existentes || []).map((r) => [r.external_id as string, r]));
  // Evita duplicar alertas que a sincronização antiga já gravou com o ID sem prefixo
  const { data: legados } = await sb.from("dc_alertas").select("external_id").eq("tenant_id", TENANT).in("external_id", alertas.map((a) => a.id).filter(Boolean));
  const idsLegados = new Set((legados || []).map((r) => r.external_id as string));

  for (const a of alertas) {
    if (rank(a.nivel) < rank("atencao") || idsLegados.has(a.id)) continue;
    const linha = {
      tenant_id: TENANT, titulo: a.titulo || a.evento, tipo: a.evento, nivel: a.nivel,
      descricao: a.descricao || null, recomendacoes: a.instrucao || null, regiao_afetada: municipio,
      fonte: a.fonte, inicio: a.inicio, termino: a.fim, ativo: true, external_id: ext(a),
      hash_conteudo: `${a.nivel}|${a.titulo}|${a.inicio}|${a.fim}`, sincronizado: true, sincronizado_em: new Date().toISOString(),
    };
    const ex = porExt.get(ext(a));
    if (!ex) {
      const { error: e } = await sb.from("dc_alertas").insert(linha);
      if (e) res.erros.push(e.message); else res.novos++;
    } else if (ex.hash_conteudo !== linha.hash_conteudo || !ex.ativo) {
      const { error: e } = await sb.from("dc_alertas").update(linha).eq("id", ex.id);
      if (e) res.erros.push(e.message); else res.atualizados++;
    }
  }
  for (const [k, r] of porExt) {
    if (r.ativo && /^(idap|inmet|simepar):/.test(k) && !atuais.has(k)) {
      const { error: e } = await sb.from("dc_alertas").update({ ativo: false, sincronizado_em: new Date().toISOString() }).eq("id", r.id);
      if (e) res.erros.push(e.message); else res.encerrados++;
    }
  }
  return res;
}

// ---------------------------------------------------------------- execução
async function executar(sb: SupabaseClient, origem: string, usuario: string | null) {
  const inicio = Date.now();
  const agora = new Date();
  const { data: est, error: errEst } = await sb.from("dc_monitor_estado").select("*").eq("tenant_id", TENANT).maybeSingle();
  if (errEst || !est) throw new Error("Estado do monitor não encontrado: " + (errEst?.message || "execute a migração"));
  if (!est.ativo && origem === "cron") return { ok: true, ignorado: "monitor desativado" };

  const m: Municipio = { ibge: est.ibge, nome: est.municipio, uf: est.uf, lat: est.latitude, lon: est.longitude };

  const [idap, avisos, estacao, previsao, simepar] = await Promise.all([
    fonteIdap(m, agora),
    fonteInmetAvisos(m, agora),
    fonteInmetJson(`/estacao/proxima/${m.ibge}`),
    fonteInmetJson(`/previsao/${m.ibge}`),
    fonteSimepar(),
  ]);

  const obs = estacao.d ? lerEstacao(estacao.d) : null;
  if (estacao.f.ok && !obs) { estacao.f.ok = false; estacao.f.erro = "resposta sem dados da estação"; }
  if (obs) estacao.f.itens = 1, estacao.f.detalhe = `${obs.estacao} (${obs.codigo})${obs.distancia_km != null ? `, ${obs.distancia_km} km` : ""}`;
  const prev = previsao.d ? lerPrevisao(previsao.d, m.ibge) : [];
  if (previsao.f.ok && !prev.length) { previsao.f.ok = false; previsao.f.erro = "resposta sem previsão para o município"; }
  if (prev.length) previsao.f.itens = prev.length;

  const fontes: Record<string, Fonte> = {
    defesa_civil_idap: idap.f, inmet_avisos: avisos.f, inmet_estacao: estacao.f, inmet_previsao: previsao.f, simepar: simepar.f,
  };
  const configuradas = Object.values(fontes).filter((f) => f.configurada);
  const okCount = configuradas.filter((f) => f.ok).length;
  const conexao = okCount === 0 ? "falha" : okCount === configuradas.length ? "ok" : "parcial";
  const fontesAlertasOk = idap.f.ok && avisos.f.ok && (!simepar.f.configurada || simepar.f.ok);

  // Mantém o último dado válido de cada parte quando a fonte falha (marcado como desatualizado)
  const antigo = (est.dados || {}) as Record<string, unknown>;
  const alertas = [...idap.alertas, ...avisos.alertas];
  const dados = {
    observacao: obs ?? (antigo.observacao ?? null),
    observacao_desatualizada: !obs && !!antigo.observacao,
    previsao: prev.length ? prev.slice(0, 9) : (antigo.previsao ?? []),
    previsao_desatualizada: !prev.length && !!(antigo.previsao as unknown[] | undefined)?.length,
    alertas_oficiais: fontesAlertasOk || alertas.length ? alertas : (antigo.alertas_oficiais ?? []),
    alertas_desatualizados: !fontesAlertasOk && !alertas.length && !!(antigo.alertas_oficiais as unknown[] | undefined)?.length,
    simepar_bruto: simepar.bruto ? "recebido" : null,
  };

  const cls = classificar({
    alertas: dados.alertas_oficiais as AlertaOficial[],
    observacao: obs, // medição antiga não entra na classificação
    previsao: dados.previsao as never,
    agora,
  });
  const nivelOficial = cls.alertas_vigentes.reduce<Nivel>((n, a) => maxNivel(n, a.nivel), "normal");
  const anterior = (est.nivel_aplicado || null) as string | null;
  const dec = decidir({ calculado: cls.nivel, anterior: est, fontesAlertasOk, nivelOficial, agora });

  const okAgora = conexao !== "falha";
  const ultimaOk = okAgora ? agora.toISOString() : est.ultima_consulta_ok_em;
  const desatualizado = !okAgora || !ultimaOk || agora.getTime() - new Date(ultimaOk).getTime() > 25 * 60e3 || dados.alertas_desatualizados;
  const falhas = Object.entries(fontes).filter(([, f]) => f.configurada && !f.ok).map(([k]) => k);
  const avisoFalha = falhas.length
    ? (conexao === "falha"
      ? "Falha de comunicação com os serviços meteorológicos. Exibindo o último dado válido."
      : "Algumas fontes meteorológicas não responderam nesta consulta.")
    : null;

  const alteracoes: Record<string, unknown> = {};
  const mensagens: Record<string, unknown>[] = [];
  const erros: string[] = [];
  const proxima = new Date(Math.ceil((agora.getTime() + 1000) / (est.intervalo_minutos * 60e3)) * est.intervalo_minutos * 60e3);

  // --- dc_config (página pública)
  const { data: cfgRows } = await sb.from("dc_config").select("id,status_municipio,status_mensagem").eq("tenant_id", TENANT).limit(1);
  const cfg = cfgRows?.[0];
  const statusMudou = (cfg?.status_municipio || "normal") !== dec.aplicado;
  const msgAuto = mensagemStatus(dec.aplicado, cls);
  const pub: Record<string, unknown> = {
    status_consulta_em: agora.toISOString(),
    status_dados_em: est.dados_em && !okAgora ? est.dados_em : agora.toISOString(),
    status_desatualizado: desatualizado,
    status_aviso_falha: avisoFalha,
    status_fonte: "Defesa Civil Nacional (IDAP) · INMET" + (simepar.f.ok ? " · SIMEPAR" : ""),
  };
  if (dec.origem === "automatico") {
    Object.assign(pub, {
      status_origem: "automatico", status_municipio: dec.aplicado, status_mensagem: msgAuto,
      status_risco: dec.aplicado === "normal" ? null : (cls.riscos.join(", ") || null),
      status_orientacao: orientacao(dec.aplicado, cls.riscos),
    });
    if (statusMudou || cfg?.status_mensagem !== msgAuto) pub.status_atualizado_em = agora.toISOString();
  } else if (statusMudou) {
    erros.push("Status manual divergente em dc_config; mantido o valor do monitor.");
  }
  if (cfg) {
    const { error } = await sb.from("dc_config").update(pub).eq("id", cfg.id);
    if (error) erros.push("dc_config: " + error.message);
  } else {
    const { error } = await sb.from("dc_config").insert({ tenant_id: TENANT, status_municipio: dec.aplicado, status_atualizado_em: agora.toISOString(), ...pub });
    if (error) erros.push("dc_config: " + error.message);
  }
  if (statusMudou && dec.origem === "automatico") alteracoes.status = { de: cfg?.status_municipio || "normal", para: dec.aplicado };

  // --- alertas oficiais na página pública (só quando as fontes de alerta responderam)
  if (est.publicar_alertas_oficiais && fontesAlertasOk) {
    const r = await publicarAlertasOficiais(sb, cls.alertas_vigentes.concat(cls.alertas_futuros), m.nome);
    if (r.novos || r.atualizados || r.encerrados) alteracoes.alertas_publicos = { novos: r.novos, atualizados: r.atualizados, encerrados: r.encerrados };
    erros.push(...r.erros.map((e) => "dc_alertas: " + e));
  }

  // --- notificações (sem repetição para o mesmo nível/evento)
  const upd: Record<string, unknown> = {};
  const nivelMudouAplicado = (anterior || "normal") !== dec.aplicado;
  if (nivelMudouAplicado) {
    const titulo = `Status do município: ${ROTULO[(anterior || "normal") as Nivel]} → ${ROTULO[dec.aplicado]}`;
    const r = await inserirTolerante(sb, "dc_notificacoes", [{ tenant_id: TENANT, titulo, mensagem: `${msgAuto}\n\nMotivo: ${cls.motivos.slice(0, 3).join(" | ")}`, tipo: rank(dec.aplicado) >= rank("alerta") ? "urgente" : "alerta", lida: false }], ["tenant_id"]);
    mensagens.push({ canal: "painel", titulo, ok: r.ok, erro: r.ok ? undefined : r.erro });
  }
  if (falhas.length && (est.conexao === "ok" || est.conexao === "aguardando") && conexao !== "ok") {
    const titulo = "Falha de comunicação com serviço meteorológico";
    const r = await inserirTolerante(sb, "dc_notificacoes", [{ tenant_id: TENANT, titulo, mensagem: `Fontes sem resposta: ${falhas.join(", ")}. O status não será rebaixado enquanto houver falha.`, tipo: "alerta", lida: false }], ["tenant_id"]);
    mensagens.push({ canal: "painel", titulo, ok: r.ok });
  }

  const acao = decidirNotificacao({ aplicado: dec.aplicado, ultimoNotificado: est.ultimo_nivel_notificado, minimo: est.notificar_nivel_minimo });
  if (acao) {
    const texto = textoPopulacao(acao, dec.aplicado, cls, m.nome);
    if (est.publicar_comunicados) {
      const r = await inserirTolerante(sb, "dc_comunicados", [{
        tenant_id: TENANT, titulo: acao === "encerramento" ? "Alerta meteorológico encerrado" : `${ROTULO[dec.aplicado]} — ${cls.riscos[0] || "condições meteorológicas"}`,
        tipo: acao === "encerramento" ? "encerramento" : "mudanca_situacao",
        texto: acao === "encerramento" ? texto.replace(/\*/g, "") : `${msgAuto} ${orientacao(dec.aplicado, cls.riscos)}`,
        prioridade: dec.aplicado === "emergencia" ? "urgente" : "alta", criado_por: "Monitoramento automático", ativo: true,
      }], []);
      mensagens.push({ canal: "comunicado_publico", acao, ok: r.ok, erro: r.ok ? undefined : r.erro });
    }
    if (est.notificar_populacao) {
      const { data: pessoas, error } = await sb.from("dc_pessoas_alerta")
        .select("id,telefone,whatsapp,receber_sms,receber_whatsapp").eq("tenant_id", TENANT).eq("status", "ativo");
      if (error) erros.push("dc_pessoas_alerta: " + error.message);
      const fila = (pessoas || []).map((p) => {
        const tel = String(p.whatsapp || p.telefone || "").replace(/\D/g, "");
        if (tel.length < 10) return null;
        if (p.receber_whatsapp === false && p.receber_sms === false) return null;
        return { tenant_id: TENANT, pessoa_id: p.id, canal: p.receber_whatsapp !== false ? "whatsapp" : "sms", telefone: tel, mensagem: texto, status: "pendente", provider: est.fila_provider, tentativas: 0 };
      }).filter(Boolean) as Record<string, unknown>[];
      const r = await inserirTolerante(sb, "dc_notification_queue", fila, []);
      mensagens.push({ canal: "whatsapp_sms_fila", acao, destinatarios: fila.length, ok: r.ok, erro: r.ok ? undefined : r.erro, texto });
    }
    upd.ultimo_nivel_notificado = dec.aplicado;
    upd.ultimo_evento_notificado = chaveEvento(cls);
    upd.ultima_notificacao_em = agora.toISOString();
  } else if (rank(dec.aplicado) < rank(est.ultimo_nivel_notificado || "normal") && rank(dec.aplicado) < rank(est.notificar_nivel_minimo)) {
    upd.ultimo_nivel_notificado = dec.aplicado;
  }

  if (dec.manual_expirou) {
    upd.manual_ativo = false;
    await inserirTolerante(sb, "dc_auditoria", [{ tenant_id: TENANT, usuario: "Monitoramento automático", acao: "Intervenção manual expirou; status voltou ao modo automático", modulo: "monitoramento_clima", detalhes: `Status manual anterior: ${est.manual_status}` }], []);
    alteracoes.manual = "expirou";
  }
  if (dec.manual_superado) {
    upd.manual_ativo = false;
    await inserirTolerante(sb, "dc_auditoria", [{ tenant_id: TENANT, usuario: "Monitoramento automático", acao: "Status manual substituído por alerta oficial de nível superior", modulo: "monitoramento_clima", detalhes: dec.motivo }], []);
    alteracoes.manual = "superado por alerta oficial";
  }
  if (statusMudou && dec.origem === "automatico") {
    await inserirTolerante(sb, "dc_auditoria", [{ tenant_id: TENANT, usuario: "Monitoramento automático", acao: `Status alterado automaticamente para ${ROTULO[dec.aplicado]}`, modulo: "monitoramento_clima", detalhes: cls.motivos.join(" | ").slice(0, 1500) }], []);
  }

  Object.assign(upd, {
    ultima_consulta_em: agora.toISOString(), ultima_consulta_ok_em: ultimaOk, proxima_consulta_em: proxima.toISOString(),
    falhas_consecutivas: okAgora ? 0 : (est.falhas_consecutivas || 0) + 1, conexao, fontes,
    dados, dados_em: okAgora ? agora.toISOString() : est.dados_em,
    nivel_calculado: cls.nivel, nivel_aplicado: dec.aplicado, nivel_motivos: cls.motivos, riscos: cls.riscos,
    rebaixamento_nivel: dec.rebaixamento_nivel, rebaixamento_contagem: dec.rebaixamento_contagem, atualizado_em: agora.toISOString(),
  });
  const { error: eu } = await sb.from("dc_monitor_estado").update(upd).eq("tenant_id", TENANT);
  if (eu) erros.push("dc_monitor_estado: " + eu.message);

  const resumoDados = {
    observacao: obs, previsao: prev.slice(0, 6),
    alertas: alertas.map((a) => ({ fonte: a.fonte, id: a.id, evento: a.evento, nivel: a.nivel, origem: a.nivel_origem, inicio: a.inicio, fim: a.fim, casamento: a.casamento })),
  };
  await sb.from("dc_monitor_consultas").insert({
    tenant_id: TENANT, tipo: "consulta", origem, usuario, duracao_ms: Date.now() - inicio, conexao, fontes, dados: resumoDados,
    nivel_calculado: cls.nivel, nivel_anterior: anterior, nivel_aplicado: dec.aplicado, alterou_status: statusMudou && dec.origem === "automatico",
    motivo: `${dec.motivo} ${cls.motivos.join(" | ")}`.slice(0, 4000), alteracoes, mensagens, erros: erros.length ? erros : null,
  });

  return { ok: true, conexao, nivel_calculado: cls.nivel, nivel_aplicado: dec.aplicado, origem: dec.origem, fontes, erros };
}

Deno.serve(async (req) => {
  const segredo = Deno.env.get("DC_MONITOR_CRON_SECRET");
  if (!segredo || req.headers.get("x-monitor-secret") !== segredo) {
    return new Response(JSON.stringify({ ok: false, error: "não autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* sem corpo */ }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "gestao360" }, auth: { persistSession: false },
  });
  try {
    const r = await executar(sb, String(corpo.origem || "cron"), (corpo.usuario as string) || null);
    return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = erroTxt(e);
    await sb.from("dc_monitor_consultas").insert({ tenant_id: TENANT, tipo: "consulta", origem: String(corpo.origem || "cron"), conexao: "falha", motivo: "Erro interno no monitor", erros: [msg] });
    await sb.from("dc_monitor_estado").update({ ultima_consulta_em: new Date().toISOString(), conexao: "falha" }).eq("tenant_id", TENANT);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
