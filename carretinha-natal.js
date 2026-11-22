/* ============================================================
   CONECTA GESTÃO — MÓDULO CARRETINHA DE NATAL
   Usa o mesmo login/banco do Conecta Gestão (schema gestao360, tabelas natal_*).
   Segurança garantida no banco (RLS por papel e tenant).
   ============================================================ */
'use strict';

const SUPABASE_URL = 'https://kfvkembarvsbtveksiag.supabase.co';
const SUPABASE_KEY = 'sb_publishable_r4FgIemkyEcQiWCjj23cew_MdN2GVuL';
const BUCKET = 'natal-comprovantes';

const CATEGORIAS_DESPESA = ['Balas', 'Pirulitos', 'Chicletes', 'Saquinhos', 'Combustível', 'Brinquedos', 'Gráfica', 'Prêmios', 'Gastos variáveis', 'Alimentação', 'Decoração', 'Outros'];
const CATEGORIAS_PRODUTO = ['Balas', 'Pirulitos', 'Chicletes', 'Saquinhos', 'Brinquedos', 'Decoração', 'Outros'];
const FORMAS_DESPESA = [['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['cartao', 'Cartão'], ['outro', 'Outro']];
const FORMAS_REC = [['dinheiro', 'Dinheiro'], ['pix', 'PIX']];
const ST_NUM = { disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido', pago: 'Pago', pendente: 'Pendente', cancelado: 'Cancelado' };
const ST_NUM_COR = { disponivel: 'b-cinza', reservado: 'b-azul', vendido: 'b-ouro', pago: 'b-verde', pendente: 'b-verm', cancelado: 'b-cinza' };
const ST_BLOQ = { disponivel: 'Disponível', entregue: 'Entregue', em_andamento: 'Em andamento', devolvido: 'Devolvido', finalizado: 'Finalizado' };
const ST_BLOQ_COR = { disponivel: 'b-cinza', entregue: 'b-azul', em_andamento: 'b-ouro', devolvido: 'b-roxo', finalizado: 'b-verde' };
const ST_PREMIO = { doado: 'Doado', comprado: 'Comprado', pago: 'Pago', pendente: 'Pendente' };
const ST_PREMIO_COR = { doado: 'b-verde', comprado: 'b-azul', pago: 'b-verde', pendente: 'b-verm' };
const PAPEIS = { admin: 'Administrador geral', financeiro: 'Financeiro', bloquinhos: 'Responsável por bloquinhos', consulta: 'Consulta' };

// ---------- Utilidades ----------
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const dataHoraBR = (d) => (d ? new Date(d).toLocaleString('pt-BR') : '');
const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const soma = (arr, f) => arr.reduce((s, x) => s + (Number(typeof f === 'function' ? f(x) : x[f]) || 0), 0);
const pad3 = (n) => String(n).padStart(3, '0');
const num = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s|R\$/g, '');
  if (!s) return 0;
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(s) || 0;
};
const fmtNumInput = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
function decodeJwt(t) {
  try {
    const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(p).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
  } catch (e) { return {}; }
}
function msgErro(e) {
  const m = e?.message || String(e);
  if (/row-level security|permission denied|Sem permiss/i.test(m)) return 'Sem permissão para esta ação (verifique seu papel no módulo).';
  if (/JWT expired|jwt/i.test(m)) return 'Sua sessão expirou. Entre novamente.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha inválidos.';
  if (/Failed to fetch/i.test(m)) return 'Sem conexão com o servidor.';
  if (/duplicate key/i.test(m)) return 'Já existe um registro com esse número.';
  return m;
}
function toast(msg, erro) {
  const t = document.createElement('div');
  t.className = 'toast' + (erro ? ' erro' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), erro ? 5000 : 2800);
}

// Flocos de neve discretos
(function () {
  const box = document.getElementById('flocos');
  for (let i = 0; i < 18; i++) {
    const f = document.createElement('i');
    f.textContent = '❄';
    f.style.left = Math.random() * 100 + '%';
    f.style.fontSize = 8 + Math.random() * 12 + 'px';
    f.style.animationDuration = 9 + Math.random() * 14 + 's';
    f.style.animationDelay = -Math.random() * 20 + 's';
    box.appendChild(f);
  }
})();

// ---------- Estado ----------
let sb = null;          // cliente usado para dados
let sbAuth = null;      // cliente com sessão própria (renovável)
let CLAIMS = {};
let PAPEL = null;
let S = { carregado: false };
let SECAO = 'dashboard';
const F = {};           // filtros por seção
let charts = [];
let fotosCache = {};

const pode = (area) => {
  if (PAPEL === 'admin') return true;
  if (PAPEL === 'financeiro') return ['despesas', 'produtos', 'premios', 'bloquinhos', 'numeros', 'pagamentos', 'receitas', 'pessoas', 'entregas'].includes(area);
  if (PAPEL === 'bloquinhos') return ['bloquinhos', 'numeros', 'pagamentos', 'pessoas'].includes(area);
  return false;
};
const podeConfirmar = () => PAPEL === 'admin' || PAPEL === 'financeiro';

// ---------- Autenticação ----------
async function iniciar() {
  sbAuth = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'gestao360' },
    auth: { storageKey: 'cg-natal-auth', persistSession: true, autoRefreshToken: true },
  });
  const { data } = await sbAuth.auth.getSession();
  if (data.session) { sb = sbAuth; CLAIMS = decodeJwt(data.session.access_token); return entrar(); }
  // Reaproveita a sessão do Painel Administrativo, se ainda válida
  try {
    const cg = JSON.parse(localStorage.getItem('cg_session') || 'null');
    if (cg && cg.access_token) {
      const c = decodeJwt(cg.access_token);
      if (c.exp && c.exp * 1000 > Date.now() + 60000) {
        sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          db: { schema: 'gestao360' },
          auth: { persistSession: false, autoRefreshToken: false, storageKey: 'cg-natal-tmp' },
          global: { headers: { Authorization: 'Bearer ' + cg.access_token } },
        });
        CLAIMS = c;
        return entrar();
      }
    }
  } catch (e) { /* ignora */ }
  mostrarTela('tela-login');
}

function mostrarTela(id) {
  ['tela-carregando', 'tela-login', 'tela-sem-acesso', 'app'].forEach((t) => document.getElementById(t).classList.toggle('oculto', t !== id));
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn'), err = $('#login-erro');
  err.classList.add('oculto');
  btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    const { data, error } = await sbAuth.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-senha').value });
    if (error) throw error;
    sb = sbAuth;
    CLAIMS = decodeJwt(data.session.access_token);
    try { localStorage.setItem('cg_session', JSON.stringify({ access_token: data.session.access_token, claims: CLAIMS })); } catch (e2) { /* */ }
    $('#login-senha').value = '';
    await entrar();
  } catch (e2) {
    err.textContent = msgErro(e2); err.classList.remove('oculto');
  } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
});

async function sair() {
  try { await sbAuth.auth.signOut(); } catch (e) { /* */ }
  try { localStorage.removeItem('cg_session'); } catch (e) { /* */ }
  location.reload();
}
window.sair = sair;

async function entrar() {
  mostrarTela('tela-carregando');
  if (!CLAIMS.perfil) {
    $('#sem-acesso-msg').textContent = 'Seu login funcionou, mas o usuário não tem perfil no Conecta Gestão (cadastro em Usuários e Permissões).';
    return mostrarTela('tela-sem-acesso');
  }
  const { data, error } = await sb.rpc('natal_papel');
  if (error) {
    if (/JWT|jwt/.test(error.message)) { try { localStorage.removeItem('cg_session'); } catch (e) { /* */ } return mostrarTela('tela-login'); }
    $('#sem-acesso-msg').textContent = 'Erro ao verificar acesso: ' + msgErro(error);
    return mostrarTela('tela-sem-acesso');
  }
  PAPEL = data;
  if (!PAPEL) return mostrarTela('tela-sem-acesso');
  $('#usuario-email').textContent = CLAIMS.email || '';
  $('#usuario-papel').textContent = PAPEIS[PAPEL];
  try {
    await carregar();
  } catch (e) {
    $('#sem-acesso-msg').textContent = 'Erro ao carregar dados: ' + msgErro(e);
    return mostrarTela('tela-sem-acesso');
  }
  mostrarTela('app');
  const h = location.hash.slice(1);
  irPara(SECOES.find((s) => s.id === h && s.visivel()) ? h : 'dashboard');
  setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('.modal-fundo')) recarregar(false); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !document.querySelector('.modal-fundo')) recarregar(false); });
}

// ---------- Dados ----------
async function todos(tabela, ordem) {
  let out = [], de = 0;
  for (;;) {
    const { data, error } = await sb.from(tabela).select('*').order(ordem, { ascending: true }).range(de, de + 999);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) break;
    de += 1000;
  }
  return out;
}

async function carregar() {
  const [config, pessoas, despesas, produtos, premios, bloquinhos, numeros, pagamentos, entregas, receitas] = await Promise.all([
    sb.from('natal_config').select('*').maybeSingle().then((r) => { if (r.error) throw r.error; return r.data; }),
    todos('natal_pessoas', 'nome'),
    todos('natal_despesas', 'data_compra'),
    todos('natal_produtos', 'nome'),
    todos('natal_premios', 'criado_em'),
    todos('natal_bloquinhos', 'numero'),
    todos('natal_numeros', 'numero'),
    todos('natal_pagamentos', 'data'),
    todos('natal_entregas', 'data'),
    todos('natal_receitas', 'data'),
  ]);
  S = { carregado: true, config: config || { nome_evento: 'Carretinha de Natal', ano: new Date().getFullYear(), numeros_por_bloquinho: 20, valor_numero: 6.25, estoque_minimo_padrao: 10 },
    pessoas, despesas, produtos, premios, bloquinhos, numeros, pagamentos, entregas, receitas };
  S.bloqPorId = Object.fromEntries(bloquinhos.map((b) => [b.id, b]));
  S.numPorId = Object.fromEntries(numeros.map((n) => [n.id, n]));
  S.pessoaPorId = Object.fromEntries(pessoas.map((p) => [p.id, p]));
  S.numsPorBloq = {};
  for (const n of numeros) (S.numsPorBloq[n.bloquinho_id] ||= []).push(n);
  S.pagsPorNum = {};
  for (const p of pagamentos) if (p.numero_id) (S.pagsPorNum[p.numero_id] ||= []).push(p);
  $('#marca-ano').textContent = (S.config.nome_evento && S.config.nome_evento !== 'Carretinha de Natal' ? S.config.nome_evento + ' · ' : '') + 'Edição ' + S.config.ano;
  $('#topo-sync').textContent = '● Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function recarregar(manual) {
  try {
    await carregar();
    renderSecao(false);
    if (manual) toast('Dados atualizados');
  } catch (e) {
    if (/JWT|jwt/.test(e?.message || '')) { toast('Sessão expirada. Entre novamente.', true); setTimeout(sair, 1500); return; }
    if (manual) toast(msgErro(e), true);
  }
}
window.recarregar = recarregar;

// ---------- Cálculos ----------
const vendidos = () => S.numeros.filter((n) => ['vendido', 'pago', 'pendente'].includes(n.status));
function resumoBloq(b) {
  const ns = S.numsPorBloq[b.id] || [];
  const v = ns.filter((n) => ['vendido', 'pago', 'pendente'].includes(n.status));
  return {
    total: ns.length, vendidos: v.length, pagos: ns.filter((n) => n.status === 'pago').length,
    valorVendido: soma(v, 'valor'), recebido: soma(ns, 'valor_pago'), aguardando: soma(ns, 'valor_aguardando'),
    aberto: soma(v, (n) => Math.max(0, n.valor - n.valor_pago)),
  };
}
function resumoPessoa(p) {
  const bloqs = S.bloquinhos.filter((b) => b.pessoa_id === p.id);
  const ids = new Set(bloqs.map((b) => b.id));
  const nums = S.numeros.filter((n) => ids.has(n.bloquinho_id));
  const pags = S.pagamentos.filter((x) => ids.has(x.bloquinho_id));
  const dinheiro = soma(pags.filter((x) => x.forma === 'dinheiro'), 'valor');
  const pix = soma(pags.filter((x) => x.forma === 'pix'), 'valor');
  const entregue = soma(S.entregas.filter((e) => e.pessoa_id === p.id), 'valor');
  return {
    bloqs, nums, pags,
    vendidos: nums.filter((n) => ['vendido', 'pago', 'pendente'].includes(n.status)).length,
    pagos: nums.filter((n) => n.status === 'pago').length,
    arrecadado: dinheiro + pix, dinheiro, pix, entregue,
    pendenteEntrega: Math.max(0, dinheiro - entregue),
    aReceber: soma(nums.filter((n) => ['vendido', 'pendente'].includes(n.status)), (n) => Math.max(0, n.valor - n.valor_pago)),
  };
}
function totais(de, ate) {
  const dentro = (d) => (!de || (d && d >= de)) && (!ate || (d && d <= ate));
  const pagsConf = S.pagamentos.filter((p) => p.situacao === 'confirmado' && dentro(p.data));
  const pagsAg = S.pagamentos.filter((p) => p.situacao === 'aguardando' && dentro(p.data));
  const recRec = S.receitas.filter((r) => r.situacao === 'recebido' && dentro(r.data));
  const recPend = S.receitas.filter((r) => r.situacao === 'pendente' && dentro(r.data));
  const desp = S.despesas.filter((d) => dentro(d.data_compra));
  const vend = vendidos().filter((n) => !de && !ate ? true : dentro(n.data_venda));
  const rifaRecebido = soma(pagsConf, 'valor');
  const doacoes = soma(recRec.filter((r) => r.tipo === 'doacao'), 'valor');
  const outras = soma(recRec.filter((r) => r.tipo === 'outra'), 'valor');
  const recebidoTotal = rifaRecebido + doacoes + outras;
  const despPagas = soma(desp.filter((d) => d.situacao === 'pago'), 'valor_total');
  const despPend = soma(desp.filter((d) => d.situacao === 'pendente'), 'valor_total');
  const porCat = {};
  for (const d of desp) porCat[d.categoria] = (porCat[d.categoria] || 0) + Number(d.valor_total);
  return {
    pagsConf, desp,
    rifaVendido: soma(vend, 'valor'), rifaRecebido, rifaAguardando: soma(pagsAg, 'valor'),
    rifaAberto: soma(vend, (n) => Math.max(0, n.valor - n.valor_pago)),
    recebidoDinheiro: soma(pagsConf.filter((p) => p.forma === 'dinheiro'), 'valor') + soma(recRec.filter((r) => r.forma === 'dinheiro'), 'valor'),
    recebidoPix: soma(pagsConf.filter((p) => p.forma === 'pix'), 'valor') + soma(recRec.filter((r) => r.forma === 'pix'), 'valor'),
    recebidoOutro: soma(recRec.filter((r) => r.forma === 'outro'), 'valor'),
    doacoes, outras, recebidoTotal, receitasPendentes: soma(recPend, 'valor'),
    despTotal: despPagas + despPend, despPagas, despPend, porCat,
    saldo: recebidoTotal - despPagas,
  };
}
function estoqueMin(p) { return p.estoque_minimo !== null && p.estoque_minimo !== undefined ? Number(p.estoque_minimo) : Number(S.config.estoque_minimo_padrao || 0); }
function alertas() {
  const a = [];
  const hj = hoje();
  const naoDevolvidos = S.bloquinhos.filter((b) => ['entregue', 'em_andamento'].includes(b.situacao));
  const atrasados = naoDevolvidos.filter((b) => b.data_devolucao && b.data_devolucao < hj);
  if (naoDevolvidos.length) a.push({ ic: '📒', grave: atrasados.length > 0, t: `${naoDevolvidos.length} bloquinho(s) ainda não devolvido(s)`, d: atrasados.length ? `${atrasados.length} com data de devolução vencida` : 'em mãos dos responsáveis', ir: 'bloquinhos', f: { sit: 'naodev' } });
  const naoPagos = S.numeros.filter((n) => ['vendido', 'pendente'].includes(n.status));
  if (naoPagos.length) a.push({ ic: '🎟️', grave: true, t: `${naoPagos.length} número(s) vendido(s) e não pago(s)`, d: `${brl(soma(naoPagos, (n) => Math.max(0, n.valor - n.valor_pago)))} a receber`, ir: 'rifas', f: { st: 'naopago' } });
  const naoEntregue = S.pessoas.map((p) => ({ p, r: resumoPessoa(p) })).filter((x) => x.r.pendenteEntrega > 0.009);
  if (naoEntregue.length) a.push({ ic: '💵', grave: true, t: `${brl(soma(naoEntregue, (x) => x.r.pendenteEntrega))} arrecadados e não entregues`, d: `${naoEntregue.length} responsável(is) com dinheiro a entregar`, ir: 'pessoas' });
  const despPend = S.despesas.filter((d) => d.situacao === 'pendente');
  if (despPend.length) a.push({ ic: '🧾', grave: false, t: `${despPend.length} despesa(s) pendente(s)`, d: `${brl(soma(despPend, 'valor_total'))} a pagar`, ir: 'despesas', f: { sit: 'pendente' } });
  const naoConf = S.pagamentos.filter((p) => p.situacao === 'aguardando');
  if (naoConf.length) a.push({ ic: '🔎', grave: false, t: `${naoConf.length} comprovante(s) não conferido(s)`, d: `${brl(soma(naoConf, 'valor'))} aguardando conferência`, ir: 'recebimentos', f: { sit: 'aguardando' } });
  const premPend = S.premios.filter((p) => p.situacao === 'pendente');
  if (premPend.length) a.push({ ic: '🎁', grave: false, t: `${premPend.length} prêmio(s) ainda não adquirido(s)`, d: premPend.slice(0, 3).map((p) => p.nome).join(', '), ir: 'premios' });
  const baixo = S.produtos.filter((p) => Number(p.quantidade_restante) <= estoqueMin(p));
  if (baixo.length) a.push({ ic: '📦', grave: false, t: `${baixo.length} produto(s) com estoque baixo`, d: baixo.slice(0, 3).map((p) => `${p.nome} (${fmtQtd(p.quantidade_restante)})`).join(', '), ir: 'produtos', f: { baixo: true } });
  return a;
}
const fmtQtd = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// ---------- Arquivos (comprovantes e fotos) ----------
async function enviarArquivo(file, pasta) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Arquivo maior que 10 MB.');
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${CLAIMS.tenant_id}/${pasta}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}
async function verArquivo(path) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) return toast(msgErro(error), true);
  window.open(data.signedUrl, '_blank', 'noopener');
}
window.verArquivo = verArquivo;
const linkArq = (path, txt = '📎') => (path ? `<button class="link" title="Ver comprovante" onclick="event.stopPropagation();verArquivo('${esc(path)}')">${txt}</button>` : '');

// ---------- Modais ----------
function abrirModal({ titulo, corpo, rodape, largo, aoAbrir }) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal${largo ? ' largo' : ''}" role="dialog" aria-modal="true">
    <div class="m-topo"><h2>${titulo}</h2><button class="x" aria-label="Fechar">×</button></div>
    <div class="m-corpo">${corpo}</div>${rodape ? `<div class="m-rodape">${rodape}</div>` : ''}</div>`;
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc_);
  fundo.querySelector('.x').onclick = fechar;
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  $('#modais').appendChild(fundo);
  if (aoAbrir) aoAbrir(fundo, fechar);
  return { fundo, fechar };
}
function confirmar(msg, textoOk = 'Confirmar', perigo = true) {
  return new Promise((res) => {
    const { fundo, fechar } = abrirModal({
      titulo: 'Confirmação', corpo: `<p style="margin:0">${msg}</p>`,
      rodape: `<button class="btn" data-n>Cancelar</button><button class="btn ${perigo ? 'verm' : 'prim'}" data-s>${textoOk}</button>`,
    });
    fundo.querySelector('[data-n]').onclick = () => { fechar(); res(false); };
    fundo.querySelector('[data-s]').onclick = () => { fechar(); res(true); };
  });
}

/* Formulário genérico.
   campos: [{k, l, t:'text|tel|number|money|date|select|textarea|file|datalist', op:[[v,l]], req, full, dica, lista}] */
function campoHTML(c, v) {
  const id = 'f_' + c.k;
  const req = c.req ? ' required' : '';
  const lab = `${esc(c.l)}${c.req ? ' *' : ''}`;
  let inp;
  if (c.t === 'select') inp = `<select id="${id}" name="${c.k}"${req}>${(c.op || []).map(([ov, ol]) => `<option value="${esc(ov)}"${String(v ?? '') === String(ov) ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
  else if (c.t === 'textarea') inp = `<textarea id="${id}" name="${c.k}"${req}>${esc(v)}</textarea>`;
  else if (c.t === 'file') inp = `<input type="file" id="${id}" name="${c.k}" accept="${c.accept || 'image/*,application/pdf'}">${v ? `<span class="dica">Arquivo atual: ${linkArq(v, 'ver')} · <label style="display:inline;font-weight:500"><input type="checkbox" name="${c.k}__remover" style="width:auto"> remover</label></span>` : ''}`;
  else if (c.t === 'money') inp = `<input id="${id}" name="${c.k}" inputmode="decimal" placeholder="0,00" value="${esc(fmtNumInput(v))}"${req}>`;
  else if (c.t === 'number') inp = `<input id="${id}" name="${c.k}" inputmode="decimal" value="${esc(fmtNumInput(v))}"${req}>`;
  else if (c.t === 'datalist') inp = `<input id="${id}" name="${c.k}" list="${id}_l" value="${esc(v)}" autocomplete="off"${req}><datalist id="${id}_l">${(c.lista || []).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
  else inp = `<input id="${id}" name="${c.k}" type="${c.t || 'text'}" value="${esc(v)}"${req}${c.t === 'tel' ? ' inputmode="tel"' : ''}>`;
  return `<label class="${c.full ? 'inteiro' : ''}">${lab}${inp}${c.dica ? `<span class="dica">${c.dica}</span>` : ''}</label>`;
}
function abrirForm({ titulo, campos, valores = {}, salvar, excluir, largo, extra = '', aoAbrir }) {
  const corpo = `<form class="form" id="form-gen"><div class="grade-form">${campos.map((c) => campoHTML(c, valores[c.k])).join('')}</div>${extra}<div class="erro-box oculto" id="form-erro"></div></form>`;
  const rodape = `${excluir ? '<button class="btn perigo" data-exc style="margin-right:auto">Excluir</button>' : ''}<button class="btn" data-canc>Cancelar</button><button class="btn prim" data-salv>Salvar</button>`;
  const m = abrirModal({ titulo, corpo, rodape, largo, aoAbrir });
  const form = m.fundo.querySelector('#form-gen');
  const err = m.fundo.querySelector('#form-erro');
  m.fundo.querySelector('[data-canc]').onclick = m.fechar;
  const btnS = m.fundo.querySelector('[data-salv]');
  const enviar = async (e) => {
    e?.preventDefault();
    if (!form.reportValidity()) return;
    err.classList.add('oculto');
    const dados = {};
    const arquivos = {};
    for (const c of campos) {
      const el = form.elements[c.k];
      if (c.t === 'file') {
        if (el.files[0]) arquivos[c.k] = el.files[0];
        else if (form.elements[c.k + '__remover']?.checked) dados[c.k] = null;
        continue;
      }
      let v = el.value;
      if (c.t === 'money' || c.t === 'number') v = v === '' ? null : num(v);
      else if (c.t === 'date') v = v || null;
      else v = typeof v === 'string' ? v.trim() || null : v;
      dados[c.k] = v;
    }
    btnS.disabled = true; btnS.textContent = 'Salvando…';
    try {
      for (const [k, f] of Object.entries(arquivos)) dados[k] = await enviarArquivo(f, campos.find((c) => c.k === k).pasta || 'arquivos');
      await salvar(dados);
      m.fechar();
      await recarregar(false);
      toast('Salvo com sucesso');
    } catch (e2) {
      err.textContent = msgErro(e2); err.classList.remove('oculto');
    } finally { btnS.disabled = false; btnS.textContent = 'Salvar'; }
  };
  btnS.onclick = enviar;
  form.addEventListener('submit', enviar);
  if (excluir) m.fundo.querySelector('[data-exc]').onclick = async () => {
    if (!(await confirmar('Excluir este registro? Esta ação não pode ser desfeita.', 'Excluir'))) return;
    try { await excluir(); m.fechar(); await recarregar(false); toast('Excluído'); } catch (e2) { err.textContent = msgErro(e2); err.classList.remove('oculto'); }
  };
  return m;
}
async function gravar(tabela, id, dados) {
  const q = id ? sb.from(tabela).update(dados).eq('id', id) : sb.from(tabela).insert(dados);
  const { error } = await q;
  if (error) throw error;
}
async function apagar(tabela, id) {
  const { error } = await sb.from(tabela).delete().eq('id', id);
  if (error) throw error;
}
const nomesPessoas = () => S.pessoas.filter((p) => p.ativo).map((p) => p.nome);

// ---------- Navegação ----------
const SECOES = [
  { id: 'dashboard', n: '📊', l: 'Dashboard Geral', visivel: () => true, render: rDashboard },
  { id: 'despesas', n: '🧾', l: 'Controle de Despesas', visivel: () => true, render: rDespesas },
  { id: 'produtos', n: '📦', l: 'Compras e Produtos', visivel: () => true, render: rProdutos },
  { id: 'premios', n: '🎁', l: 'Controle de Prêmios', visivel: () => true, render: rPremios },
  { id: 'rifas', n: '🎟️', l: 'Controle de Rifas', visivel: () => true, render: rRifas },
  { id: 'bloquinhos', n: '📒', l: 'Controle de Bloquinhos', visivel: () => true, render: rBloquinhos },
  { id: 'recebimentos', n: '💰', l: 'Controle de Recebimentos', visivel: () => true, render: rRecebimentos },
  { id: 'pessoas', n: '👥', l: 'Pessoas e Responsáveis', visivel: () => true, render: rPessoas },
  { id: 'relatorios', n: '📑', l: 'Relatórios e Prestação de Contas', visivel: () => true, render: rRelatorios },
  { id: 'config', n: '⚙️', l: 'Configurações', visivel: () => PAPEL === 'admin', render: rConfig },
];
function montarMenu() {
  const nAlertas = alertas().length;
  $('#menu').innerHTML = SECOES.filter((s) => s.visivel()).map((s) =>
    `<button class="${SECAO === s.id ? 'ativo' : ''}" onclick="irPara('${s.id}')"><span class="n">${s.n}</span>${s.l}${s.id === 'dashboard' && nAlertas ? `<span class="cont">${nAlertas}</span>` : ''}</button>`).join('');
}
function irPara(id, filtros) {
  SECAO = id;
  if (filtros) F[id] = { ...(F[id] || {}), ...filtros };
  history.replaceState(null, '', '#' + id);
  $('#lateral').classList.remove('aberta');
  renderSecao(true);
  window.scrollTo(0, 0);
}
window.irPara = irPara;
function renderSecao(completo) {
  const s = SECOES.find((x) => x.id === SECAO) || SECOES[0];
  $('#titulo-secao').textContent = s.l;
  montarMenu();
  charts.forEach((c) => c.destroy()); charts = [];
  s.render(completo);
}

// ============================================================
// 1. DASHBOARD
// ============================================================
function rDashboard() {
  const t = totais();
  const nums = S.numeros;
  const vend = vendidos();
  const al = alertas();
  const bloqDist = S.bloquinhos.filter((b) => b.situacao !== 'disponivel').length;
  $('#conteudo').innerHTML = `
    ${al.length ? `<div class="card"><h3>🔔 Alertas automáticos</h3><div class="alertas">${al.map((a, i) => `<div class="alerta${a.grave ? ' grave' : ''}" data-al="${i}"><span class="ic">${a.ic}</span><div><b>${esc(a.t)}</b><small>${esc(a.d)}</small></div></div>`).join('')}</div></div>` : '<div class="ok-box">✅ Nenhum alerta no momento. Tudo em dia!</div>'}
    <div class="kpis">
      <div class="kpi destaque"><span>Saldo financeiro atual</span><b>${brl(t.saldo)}</b><small>recebido − despesas pagas</small></div>
      <div class="kpi"><span>Total arrecadado com rifas</span><b>${brl(t.rifaVendido)}</b><small>${vend.length} número(s) vendido(s)</small></div>
      <div class="kpi"><span>Total recebido em dinheiro</span><b>${brl(t.recebidoDinheiro)}</b><small>rifas + doações/entradas</small></div>
      <div class="kpi a"><span>Total recebido via PIX</span><b>${brl(t.recebidoPix)}</b><small>${t.rifaAguardando ? brl(t.rifaAguardando) + ' aguardando conferência' : 'conferido'}</small></div>
      <div class="kpi v"><span>Total de despesas</span><b>${brl(t.despTotal)}</b><small>${S.despesas.length} lançamento(s)</small></div>
      <div class="kpi"><span>Despesas pagas</span><b>${brl(t.despPagas)}</b><small>&nbsp;</small></div>
      <div class="kpi v"><span>Contas a pagar</span><b>${brl(t.despPend)}</b><small>despesas pendentes</small></div>
      <div class="kpi o"><span>Valor em aberto das rifas</span><b>${brl(t.rifaAberto)}</b><small>vendido e ainda não pago</small></div>
      <div class="kpi"><span>Bloquinhos distribuídos</span><b>${bloqDist} <small>de ${S.bloquinhos.length}</small></b><small>&nbsp;</small></div>
      <div class="kpi"><span>Números vendidos</span><b>${vend.length} <small>de ${nums.length}</small></b><small>${nums.length ? Math.round((vend.length / nums.length) * 100) : 0}% vendidos</small></div>
      <div class="kpi"><span>Números pagos</span><b>${nums.filter((n) => n.status === 'pago').length}</b><small>&nbsp;</small></div>
      <div class="kpi v"><span>Números pendentes</span><b>${nums.filter((n) => ['vendido', 'pendente'].includes(n.status)).length}</b><small>vendidos sem pagamento total</small></div>
    </div>
    <div class="grade3">
      <div class="card"><h3>💰 Arrecadação × despesas (acumulado)</h3><div class="chart-box"><canvas id="ch1"></canvas></div></div>
      <div class="card"><h3>🧾 Despesas por categoria</h3><div class="chart-box"><canvas id="ch2"></canvas></div></div>
      <div class="card"><h3>🎟️ Evolução das vendas</h3><div class="chart-box"><canvas id="ch3"></canvas></div></div>
    </div>
    <div class="grade2">
      <div class="card"><h3>🏆 Ranking dos responsáveis</h3>${tabelaRanking()}</div>
      <div class="card"><h3>📒 Bloquinhos</h3>${resumoBloquinhosMini()}</div>
    </div>`;
  document.querySelectorAll('[data-al]').forEach((el) => { const a = al[+el.dataset.al]; el.onclick = () => irPara(a.ir, a.f); });
  graficosDashboard(t);
}
function tabelaRanking() {
  const lin = S.pessoas.map((p) => ({ p, r: resumoPessoa(p) })).filter((x) => x.r.bloqs.length).sort((a, b) => b.r.vendidos - a.r.vendidos).slice(0, 8);
  if (!lin.length) return '<p class="vazio">Nenhum bloquinho atribuído a responsáveis ainda.</p>';
  return `<div class="tabela-wrap"><table><thead><tr><th>Responsável</th><th class="num">Vendidos</th><th class="num">Arrecadado</th><th class="num">A entregar</th></tr></thead><tbody>${lin.map(({ p, r }) => `<tr><td>${esc(p.nome)}</td><td class="num">${r.vendidos}</td><td class="num">${brl(r.arrecadado)}</td><td class="num">${r.pendenteEntrega > 0 ? `<span class="badge b-verm">${brl(r.pendenteEntrega)}</span>` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function resumoBloquinhosMini() {
  const c = {};
  for (const b of S.bloquinhos) c[b.situacao] = (c[b.situacao] || 0) + 1;
  if (!S.bloquinhos.length) return `<p class="vazio">Nenhum bloquinho gerado. ${pode('bloquinhos') ? '<button class="link" onclick="irPara(\'bloquinhos\')">Gerar bloquinhos</button>' : ''}</p>`;
  return `<div class="cat-cards">${Object.keys(ST_BLOQ).map((k) => `<div><small>${ST_BLOQ[k]}</small><b>${c[k] || 0}</b></div>`).join('')}</div>
    <p class="dica" style="margin-top:10px">Configuração: ${S.config.numeros_por_bloquinho} números por bloquinho · ${brl(S.config.valor_numero)} por número · ${brl(S.config.numeros_por_bloquinho * S.config.valor_numero)} por bloquinho.</p>`;
}
function graficosDashboard(t) {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  // 1. Acumulado de recebimentos x despesas pagas por data
  const ev = [];
  for (const p of S.pagamentos.filter((x) => x.situacao === 'confirmado')) ev.push([p.data, Number(p.valor), 0]);
  for (const r of S.receitas.filter((x) => x.situacao === 'recebido')) ev.push([r.data, Number(r.valor), 0]);
  for (const d of S.despesas.filter((x) => x.situacao === 'pago')) ev.push([d.data_compra, 0, Number(d.valor_total)]);
  ev.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const datas = [...new Set(ev.map((e) => e[0]))];
  let ar = 0, de = 0;
  const serieA = [], serieD = [];
  for (const d of datas) { for (const e of ev.filter((x) => x[0] === d)) { ar += e[1]; de += e[2]; } serieA.push(ar); serieD.push(de); }
  charts.push(new Chart($('#ch1'), {
    type: 'line',
    data: { labels: datas.map(dataBR), datasets: [
      { label: 'Recebido', data: serieA, borderColor: '#166534', backgroundColor: 'rgba(22,101,52,.12)', fill: true, tension: .3 },
      { label: 'Despesas pagas', data: serieD, borderColor: '#b91c1c', backgroundColor: 'rgba(185,28,28,.08)', fill: true, tension: .3 },
    ] },
    options: { maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + brl(c.raw) } } }, scales: { y: { ticks: { callback: (v) => brl(v).replace(',00', '') } } } },
  }));
  // 2. Despesas por categoria
  const cats = Object.entries(t.porCat).sort((a, b) => b[1] - a[1]);
  const cores = ['#166534', '#b91c1c', '#c9a227', '#1f7a45', '#dc2626', '#e6c45c', '#0f3d24', '#7f1d1d', '#8a6a00', '#4ade80', '#f87171', '#fde68a'];
  charts.push(new Chart($('#ch2'), {
    type: 'doughnut',
    data: { labels: cats.map((c) => c[0]), datasets: [{ data: cats.map((c) => c[1]), backgroundColor: cores, borderWidth: 2, borderColor: '#fff' }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => c.label + ': ' + brl(c.raw) } } } },
  }));
  // 3. Evolução das vendas (números vendidos acumulados por data da venda)
  const vs = vendidos().filter((n) => n.data_venda).sort((a, b) => a.data_venda.localeCompare(b.data_venda));
  const dv = [...new Set(vs.map((n) => n.data_venda))];
  let acc = 0, accP = 0;
  const sv = [], sp = [];
  for (const d of dv) { const doDia = vs.filter((n) => n.data_venda === d); acc += doDia.length; accP += doDia.filter((n) => n.status === 'pago').length; sv.push(acc); sp.push(accP); }
  charts.push(new Chart($('#ch3'), {
    type: 'bar',
    data: { labels: dv.map(dataBR), datasets: [
      { label: 'Vendidos (acumulado)', data: sv, backgroundColor: '#c9a227', borderRadius: 4 },
      { label: 'Pagos (acumulado)', data: sp, backgroundColor: '#166534', borderRadius: 4 },
    ] },
    options: { maintainAspectRatio: false },
  }));
}

// ============================================================
// 2. DESPESAS
// ============================================================
const camposDespesa = () => [
  { k: 'descricao', l: 'Descrição da despesa', req: true, full: true },
  { k: 'categoria', l: 'Categoria', t: 'select', op: CATEGORIAS_DESPESA.map((c) => [c, c]), req: true },
  { k: 'produto', l: 'Produto ou serviço' },
  { k: 'quantidade', l: 'Quantidade', t: 'number', req: true },
  { k: 'valor_unitario', l: 'Valor unitário (R$)', t: 'money', req: true },
  { k: 'data_compra', l: 'Data da compra', t: 'date', req: true },
  { k: 'quem_comprou', l: 'Nome de quem comprou', t: 'datalist', lista: nomesPessoas() },
  { k: 'quem_pagou', l: 'Nome de quem pagou', t: 'datalist', lista: nomesPessoas() },
  { k: 'forma_pagamento', l: 'Forma de pagamento', t: 'select', op: FORMAS_DESPESA },
  { k: 'situacao', l: 'Situação', t: 'select', op: [['pendente', 'Pendente'], ['pago', 'Pago']] },
  { k: 'comprovante_path', l: 'Foto ou anexo do comprovante', t: 'file', pasta: 'despesas', full: true },
  { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
];
function formDespesa(d) {
  const totalPrev = '<p class="dica" id="desp-total" style="margin-top:4px"></p>';
  abrirForm({
    titulo: d ? 'Editar despesa' : 'Nova despesa', campos: camposDespesa(), extra: totalPrev,
    valores: d || { quantidade: 1, data_compra: hoje(), situacao: 'pendente', forma_pagamento: 'dinheiro', categoria: 'Outros' },
    salvar: (dados) => gravar('natal_despesas', d?.id, dados),
    excluir: d && pode('despesas') ? () => apagar('natal_despesas', d.id) : null,
    aoAbrir: (f) => {
      const atualiza = () => { f.querySelector('#desp-total').innerHTML = 'Valor total: <b>' + brl(num(f.querySelector('#f_quantidade').value) * num(f.querySelector('#f_valor_unitario').value)) + '</b>'; };
      f.querySelector('#f_quantidade').oninput = atualiza; f.querySelector('#f_valor_unitario').oninput = atualiza; atualiza();
      if (!pode('despesas')) f.querySelector('[data-salv]').classList.add('oculto');
    },
  });
}
function rDespesas(completo) {
  const f = (F.despesas ||= { cat: '', sit: '', forma: '', q: '' });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="entre"><div class="filtros">
        <input type="search" id="fd-q" placeholder="Buscar descrição, produto, pessoa…" value="${esc(f.q)}">
        <select id="fd-cat"><option value="">Todas as categorias</option>${CATEGORIAS_DESPESA.map((c) => `<option${f.cat === c ? ' selected' : ''}>${c}</option>`).join('')}</select>
        <select id="fd-sit"><option value="">Pagas e pendentes</option><option value="pago"${f.sit === 'pago' ? ' selected' : ''}>Pagas</option><option value="pendente"${f.sit === 'pendente' ? ' selected' : ''}>Pendentes</option></select>
        <select id="fd-forma"><option value="">Todas as formas</option>${FORMAS_DESPESA.map(([v, l]) => `<option value="${v}"${f.forma === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div>${pode('despesas') ? '<button class="btn prim" onclick="formDespesa()">+ Nova despesa</button>' : ''}</div>
      <div id="desp-resumo"></div><div id="desp-lista"></div>`;
    $('#fd-q').oninput = (e) => { f.q = e.target.value; listaDespesas(); };
    $('#fd-cat').onchange = (e) => { f.cat = e.target.value; listaDespesas(); };
    $('#fd-sit').onchange = (e) => { f.sit = e.target.value; listaDespesas(); };
    $('#fd-forma').onchange = (e) => { f.forma = e.target.value; listaDespesas(); };
  }
  listaDespesas();
}
window.formDespesa = formDespesa;
function listaDespesas() {
  const f = F.despesas, q = f.q.toLowerCase();
  const lista = S.despesas.filter((d) => (!f.cat || d.categoria === f.cat) && (!f.sit || d.situacao === f.sit) && (!f.forma || d.forma_pagamento === f.forma)
    && (!q || [d.descricao, d.produto, d.quem_comprou, d.quem_pagou, d.observacoes].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.data_compra || '').localeCompare(a.data_compra || ''));
  const porCat = {};
  for (const d of S.despesas) porCat[d.categoria] = (porCat[d.categoria] || 0) + Number(d.valor_total);
  const total = soma(S.despesas, 'valor_total');
  $('#desp-resumo').innerHTML = `<div class="kpis">
      <div class="kpi v"><span>Total geral das despesas</span><b>${brl(total)}</b><small>${S.despesas.length} lançamento(s)</small></div>
      <div class="kpi"><span>Pagas</span><b>${brl(soma(S.despesas.filter((d) => d.situacao === 'pago'), 'valor_total'))}</b></div>
      <div class="kpi o"><span>Pendentes (a pagar)</span><b>${brl(soma(S.despesas.filter((d) => d.situacao === 'pendente'), 'valor_total'))}</b></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Total por categoria</h3><div class="cat-cards">${CATEGORIAS_DESPESA.filter((c) => porCat[c]).map((c) => `<div style="cursor:pointer" onclick="F.despesas.cat='${c}';rDespesas(true)"><small>${c}</small><b>${brl(porCat[c])}</b></div>`).join('') || '<p class="dica">Nenhuma despesa lançada.</p>'}</div></div>`;
  $('#desp-lista').innerHTML = lista.length ? `<div class="tabela-wrap"><table>
    <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Produto/serviço</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th><th>Comprou</th><th>Pagou</th><th>Forma</th><th>Situação</th><th></th></tr></thead>
    <tbody>${lista.map((d) => `<tr style="cursor:pointer" onclick="formDespesa(S.despesas.find(x=>x.id==='${d.id}'))">
      <td>${dataBR(d.data_compra)}</td><td><b>${esc(d.descricao)}</b>${d.observacoes ? `<br><small class="dica">${esc(d.observacoes)}</small>` : ''}</td><td>${esc(d.categoria)}</td><td>${esc(d.produto)}</td>
      <td class="num">${fmtQtd(d.quantidade)}</td><td class="num">${brl(d.valor_unitario)}</td><td class="num"><b>${brl(d.valor_total)}</b></td>
      <td>${esc(d.quem_comprou)}</td><td>${esc(d.quem_pagou)}</td><td>${esc((FORMAS_DESPESA.find((x) => x[0] === d.forma_pagamento) || [])[1])}</td>
      <td>${d.situacao === 'pago' ? '<span class="badge b-verde">Pago</span>' : `<span class="badge b-verm">Pendente</span>${pode('despesas') ? ` <button class="btn peq" onclick="event.stopPropagation();marcarDespesaPaga('${d.id}')">Pagar</button>` : ''}`}</td>
      <td class="acoes">${linkArq(d.comprovante_path)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="6">${lista.length} despesa(s) filtrada(s)</td><td class="num">${brl(soma(lista, 'valor_total'))}</td><td colspan="5"></td></tr></tfoot></table></div>`
    : '<div class="card vazio">Nenhuma despesa encontrada.</div>';
}
window.marcarDespesaPaga = async (id) => {
  try { await gravar('natal_despesas', id, { situacao: 'pago' }); await recarregar(false); toast('Despesa marcada como paga'); } catch (e) { toast(msgErro(e), true); }
};

// ============================================================
// 3. COMPRAS E PRODUTOS (estoque)
// ============================================================
const camposProduto = () => [
  { k: 'nome', l: 'Nome do produto', req: true },
  { k: 'categoria', l: 'Categoria', t: 'select', op: CATEGORIAS_PRODUTO.map((c) => [c, c]) },
  { k: 'quantidade_comprada', l: 'Quantidade comprada', t: 'number', req: true },
  { k: 'quantidade_utilizada', l: 'Quantidade utilizada', t: 'number' },
  { k: 'unidade', l: 'Unidade', dica: 'un, pacote, kg, caixa…' },
  { k: 'valor_total', l: 'Valor total comprado (R$)', t: 'money' },
  { k: 'fornecedor', l: 'Fornecedor' },
  { k: 'data_compra', l: 'Data da compra', t: 'date' },
  { k: 'responsavel', l: 'Responsável pela compra', t: 'datalist', lista: nomesPessoas() },
  { k: 'estoque_minimo', l: 'Estoque mínimo (alerta)', t: 'number', dica: `Vazio = padrão (${S.config.estoque_minimo_padrao})` },
  { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
];
function formProduto(p) {
  abrirForm({
    titulo: p ? 'Editar produto' : 'Novo produto', campos: camposProduto(),
    valores: p || { categoria: 'Balas', quantidade_utilizada: 0, unidade: 'un', data_compra: hoje() },
    salvar: (d) => { d.quantidade_utilizada = d.quantidade_utilizada || 0; d.valor_total = d.valor_total || 0; if (Number(d.quantidade_utilizada) > Number(d.quantidade_comprada)) throw new Error('A quantidade utilizada não pode ser maior que a comprada.'); return gravar('natal_produtos', p?.id, d); },
    excluir: p && pode('produtos') ? () => apagar('natal_produtos', p.id) : null,
  });
}
window.formProduto = formProduto;
function usarProduto(id) {
  const p = S.produtos.find((x) => x.id === id);
  abrirForm({
    titulo: `Movimentar estoque · ${p.nome}`,
    campos: [
      { k: 'tipo', l: 'Movimento', t: 'select', op: [['uso', 'Registrar uso (saída)'], ['compra', 'Nova compra (entrada)']] },
      { k: 'qtd', l: `Quantidade (${p.unidade || 'un'})`, t: 'number', req: true },
      { k: 'valor', l: 'Valor da compra (se entrada)', t: 'money' },
    ],
    extra: `<p class="dica">Hoje: comprado ${fmtQtd(p.quantidade_comprada)} · utilizado ${fmtQtd(p.quantidade_utilizada)} · <b>restante ${fmtQtd(p.quantidade_restante)}</b></p>`,
    valores: { tipo: 'uso' },
    salvar: (d) => {
      const q = Number(d.qtd) || 0;
      if (q <= 0) throw new Error('Informe uma quantidade.');
      if (d.tipo === 'uso') {
        if (q > Number(p.quantidade_restante)) throw new Error('Quantidade maior que o estoque restante.');
        return gravar('natal_produtos', p.id, { quantidade_utilizada: Number(p.quantidade_utilizada) + q });
      }
      return gravar('natal_produtos', p.id, { quantidade_comprada: Number(p.quantidade_comprada) + q, valor_total: Number(p.valor_total) + (Number(d.valor) || 0) });
    },
  });
}
window.usarProduto = usarProduto;
function rProdutos(completo) {
  const f = (F.produtos ||= { cat: '', q: '', baixo: false });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="entre"><div class="filtros">
        <input type="search" id="fp-q" placeholder="Buscar produto ou fornecedor…" value="${esc(f.q)}">
        <select id="fp-cat"><option value="">Todas as categorias</option>${CATEGORIAS_PRODUTO.map((c) => `<option${f.cat === c ? ' selected' : ''}>${c}</option>`).join('')}</select>
        <label class="dica" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fp-baixo" style="width:auto"${f.baixo ? ' checked' : ''}> Só estoque baixo</label>
      </div>${pode('produtos') ? '<button class="btn prim" onclick="formProduto()">+ Novo produto</button>' : ''}</div>
      <div id="prod-resumo"></div><div id="prod-lista"></div>`;
    $('#fp-q').oninput = (e) => { f.q = e.target.value; listaProdutos(); };
    $('#fp-cat').onchange = (e) => { f.cat = e.target.value; listaProdutos(); };
    $('#fp-baixo').onchange = (e) => { f.baixo = e.target.checked; listaProdutos(); };
  }
  listaProdutos();
}
function listaProdutos() {
  const f = F.produtos, q = f.q.toLowerCase();
  const lista = S.produtos.filter((p) => (!f.cat || p.categoria === f.cat) && (!f.baixo || Number(p.quantidade_restante) <= estoqueMin(p)) && (!q || [p.nome, p.fornecedor, p.responsavel].join(' ').toLowerCase().includes(q)));
  const consumo = ['Balas', 'Pirulitos', 'Chicletes', 'Saquinhos', 'Brinquedos'].map((c) => {
    const ps = S.produtos.filter((p) => p.categoria === c);
    return { c, comp: soma(ps, 'quantidade_comprada'), uso: soma(ps, 'quantidade_utilizada') };
  });
  $('#prod-resumo').innerHTML = `<div class="card"><h3>Consumo dos itens da Carretinha</h3><div class="cat-cards">${consumo.map((x) => {
    const pct = x.comp ? Math.min(100, (x.uso / x.comp) * 100) : 0;
    return `<div><small>${x.c}</small><b>${fmtQtd(x.comp - x.uso)}</b> <small style="display:inline">restantes</small><div class="barra" style="margin-top:6px"><i style="width:${pct}%"></i></div><small>${fmtQtd(x.uso)} de ${fmtQtd(x.comp)} usados</small></div>`;
  }).join('')}</div><p class="dica" style="margin-top:8px">Valor total investido em produtos: <b>${brl(soma(S.produtos, 'valor_total'))}</b></p></div>`;
  $('#prod-lista').innerHTML = lista.length ? `<div class="tabela-wrap"><table>
    <thead><tr><th>Produto</th><th>Categoria</th><th class="num">Comprado</th><th class="num">Utilizado</th><th class="num">Restante</th><th style="min-width:110px">Consumo</th><th class="num">Valor</th><th>Fornecedor</th><th>Compra</th><th>Responsável</th><th></th></tr></thead>
    <tbody>${lista.map((p) => {
      const pct = Number(p.quantidade_comprada) ? Math.min(100, (p.quantidade_utilizada / p.quantidade_comprada) * 100) : 0;
      const baixo = Number(p.quantidade_restante) <= estoqueMin(p);
      return `<tr><td><b>${esc(p.nome)}</b></td><td>${esc(p.categoria)}</td><td class="num">${fmtQtd(p.quantidade_comprada)} ${esc(p.unidade || '')}</td><td class="num">${fmtQtd(p.quantidade_utilizada)}</td>
        <td class="num">${baixo ? `<span class="badge b-verm">${fmtQtd(p.quantidade_restante)}</span>` : fmtQtd(p.quantidade_restante)}</td>
        <td><div class="barra${pct > 85 ? ' verm' : ''}"><i style="width:${pct}%"></i></div></td><td class="num">${brl(p.valor_total)}</td><td>${esc(p.fornecedor)}</td><td>${dataBR(p.data_compra)}</td><td>${esc(p.responsavel)}</td>
        <td class="acoes">${pode('produtos') ? `<button class="btn peq" onclick="usarProduto('${p.id}')">± Estoque</button> <button class="btn peq" onclick="formProduto(S.produtos.find(x=>x.id==='${p.id}'))">Editar</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="card vazio">Nenhum produto cadastrado.</div>';
}

// ============================================================
// 4. PRÊMIOS
// ============================================================
const camposPremio = () => [
  { k: 'nome', l: 'Nome do prêmio', req: true },
  { k: 'ordem_sorteio', l: 'Ordem no sorteio', t: 'number', dica: '1º prêmio, 2º prêmio…' },
  { k: 'descricao', l: 'Descrição', t: 'textarea', full: true },
  { k: 'valor_estimado', l: 'Valor estimado (R$)', t: 'money' },
  { k: 'origem', l: 'Origem', t: 'select', op: [['comprado', 'Comprado'], ['doado', 'Doado']] },
  { k: 'doador_ou_comprador', l: 'Quem doou ou comprou', t: 'datalist', lista: nomesPessoas() },
  { k: 'quem_pagou', l: 'Quem pagou', t: 'datalist', lista: nomesPessoas() },
  { k: 'data', l: 'Data', t: 'date' },
  { k: 'situacao', l: 'Situação', t: 'select', op: Object.entries(ST_PREMIO) },
  { k: 'foto_path', l: 'Foto do prêmio', t: 'file', accept: 'image/*', pasta: 'premios', full: true },
  { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
];
function formPremio(p) {
  abrirForm({
    titulo: p ? 'Editar prêmio' : 'Novo prêmio', campos: camposPremio(),
    valores: p || { origem: 'comprado', situacao: 'pendente', data: hoje() },
    salvar: (d) => { d.valor_estimado = d.valor_estimado || 0; return gravar('natal_premios', p?.id, d); },
    excluir: p && pode('premios') ? () => apagar('natal_premios', p.id) : null,
  });
}
window.formPremio = formPremio;
async function rPremios() {
  const ps = [...S.premios].sort((a, b) => (a.ordem_sorteio ?? 999) - (b.ordem_sorteio ?? 999));
  const tot = soma(ps, 'valor_estimado');
  const doados = ps.filter((p) => p.origem === 'doado'), comprados = ps.filter((p) => p.origem === 'comprado');
  $('#conteudo').innerHTML = `
    <div class="entre"><p class="dica">Prêmios da Rifa Solidária.</p>${pode('premios') ? '<button class="btn prim" onclick="formPremio()">+ Novo prêmio</button>' : ''}</div>
    <div class="kpis">
      <div class="kpi destaque"><span>Valor total dos prêmios</span><b>${brl(tot)}</b><small>${ps.length} prêmio(s)</small></div>
      <div class="kpi"><span>Prêmios doados</span><b>${doados.length} · ${brl(soma(doados, 'valor_estimado'))}</b></div>
      <div class="kpi a"><span>Prêmios comprados</span><b>${comprados.length} · ${brl(soma(comprados, 'valor_estimado'))}</b></div>
      <div class="kpi v"><span>Pendentes de aquisição</span><b>${ps.filter((p) => p.situacao === 'pendente').length}</b></div>
    </div>
    ${ps.length ? `<div class="premios">${ps.map((p) => `<div class="premio" ${pode('premios') ? `style="cursor:pointer" onclick="formPremio(S.premios.find(x=>x.id==='${p.id}'))"` : ''}>
      <div class="foto" data-foto="${esc(p.foto_path || '')}">🎁</div>
      <div class="corpo"><div class="entre"><b>${p.ordem_sorteio ? p.ordem_sorteio + 'º · ' : ''}${esc(p.nome)}</b><span class="badge ${ST_PREMIO_COR[p.situacao]}">${ST_PREMIO[p.situacao]}</span></div>
      ${p.descricao ? `<small class="dica">${esc(p.descricao)}</small>` : ''}
      <div><b style="color:var(--verde)">${brl(p.valor_estimado)}</b> <span class="badge ${p.origem === 'doado' ? 'b-verde' : 'b-azul'}">${p.origem === 'doado' ? 'Doado' : 'Comprado'}</span></div>
      <small class="dica">${p.origem === 'doado' ? 'Doado por' : 'Comprado por'}: ${esc(p.doador_ou_comprador || '—')}${p.quem_pagou ? ` · Pagou: ${esc(p.quem_pagou)}` : ''}${p.data ? ` · ${dataBR(p.data)}` : ''}</small></div></div>`).join('')}</div>`
      : '<div class="card vazio">Nenhum prêmio cadastrado.</div>'}`;
  const paths = ps.map((p) => p.foto_path).filter((x) => x && !fotosCache[x]);
  if (paths.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
    (data || []).forEach((r) => { if (r.signedUrl) fotosCache[r.path] = r.signedUrl; });
  }
  document.querySelectorAll('[data-foto]').forEach((el) => { const u = fotosCache[el.dataset.foto]; if (u) el.innerHTML = `<img src="${esc(u)}" alt="">`; });
}

// ============================================================
// 5. RIFAS — números individuais
// ============================================================
function rRifas(completo) {
  const f = (F.rifas ||= { bloq: '', st: '', q: '' });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="kpis" id="rifa-kpis"></div>
      <div class="card">
        <div class="filtros">
          <input type="search" id="fr-q" placeholder="Buscar nº, comprador, telefone ou vendedor…" value="${esc(f.q)}">
          <select id="fr-bloq"><option value="">Todos os bloquinhos</option>${S.bloquinhos.map((b) => `<option value="${b.id}"${f.bloq === b.id ? ' selected' : ''}>Bloquinho ${pad3(b.numero)}${b.responsavel_nome ? ' – ' + esc(b.responsavel_nome) : ''}</option>`).join('')}</select>
          <select id="fr-st"><option value="">Todos os status</option><option value="naopago"${f.st === 'naopago' ? ' selected' : ''}>Vendidos e não pagos</option>${Object.entries(ST_NUM).map(([k, v]) => `<option value="${k}"${f.st === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
        </div>
        <div class="legenda" style="margin-top:10px">${Object.entries(ST_NUM).map(([k, v]) => `<span><i class="num-tile st-${k}" style="display:inline-block;min-height:0;padding:0"></i>${v}</span>`).join('')}</div>
      </div>
      <div id="rifa-lista"></div>`;
    $('#fr-q').oninput = (e) => { f.q = e.target.value; listaRifas(); };
    $('#fr-bloq').onchange = (e) => { f.bloq = e.target.value; listaRifas(); };
    $('#fr-st').onchange = (e) => { f.st = e.target.value; listaRifas(); };
  }
  listaRifas();
}
function listaRifas() {
  const f = F.rifas, q = f.q.trim().toLowerCase();
  const vend = vendidos();
  $('#rifa-kpis').innerHTML = `
    <div class="kpi"><span>Números</span><b>${S.numeros.length}</b><small>${S.bloquinhos.length} bloquinho(s)</small></div>
    <div class="kpi o"><span>Vendidos</span><b>${vend.length}</b><small>${brl(soma(vend, 'valor'))}</small></div>
    <div class="kpi"><span>Pagos</span><b>${S.numeros.filter((n) => n.status === 'pago').length}</b><small>${brl(soma(S.numeros, 'valor_pago'))} recebidos</small></div>
    <div class="kpi v"><span>Falta receber</span><b>${brl(soma(vend, (n) => Math.max(0, n.valor - n.valor_pago)))}</b><small>${S.numeros.filter((n) => ['vendido', 'pendente'].includes(n.status)).length} número(s)</small></div>`;
  if (!S.numeros.length) { $('#rifa-lista').innerHTML = `<div class="card vazio">Nenhum número ainda. ${pode('bloquinhos') ? 'Gere os bloquinhos em <button class="link" onclick="irPara(\'bloquinhos\')">Controle de Bloquinhos</button>.' : ''}</div>`; return; }
  const filtra = (n) => (!f.bloq || n.bloquinho_id === f.bloq)
    && (!f.st || (f.st === 'naopago' ? ['vendido', 'pendente'].includes(n.status) : n.status === f.st))
    && (!q || String(n.numero) === q.replace(/^0+/, '') || [n.comprador_nome, n.comprador_telefone, n.vendedor].join(' ').toLowerCase().includes(q));
  const blocos = S.bloquinhos.filter((b) => !f.bloq || b.id === f.bloq);
  let html = '', total = 0;
  for (const b of blocos) {
    const ns = (S.numsPorBloq[b.id] || []).filter(filtra);
    if (!ns.length) continue;
    total += ns.length;
    const r = resumoBloq(b);
    html += `<div class="card"><div class="bloq-cab"><div><b>📒 Bloquinho ${pad3(b.numero)}</b> ${b.responsavel_nome ? `– Responsável: <b>${esc(b.responsavel_nome)}</b>` : '<span class="dica">sem responsável</span>'} <span class="badge ${ST_BLOQ_COR[b.situacao]}">${ST_BLOQ[b.situacao]}</span></div>
      <small class="dica">${r.vendidos}/${r.total} vendidos · ${r.pagos} pagos · recebido ${brl(r.recebido)} · em aberto ${brl(r.aberto)}</small></div>
      <div class="numeros-grid">${ns.map((n) => `<div class="num-tile st-${n.status}" onclick="abrirNumero('${n.id}')" title="${esc(ST_NUM[n.status])}${n.comprador_nome ? ' – ' + esc(n.comprador_nome) : ''}">
        <b>${String(n.numero).padStart(2, '0')}</b><small>${esc(n.comprador_nome || ST_NUM[n.status])}</small>${n.status !== 'disponivel' && n.status !== 'cancelado' ? `<small>${n.status === 'pago' ? '✔ ' + brl(n.valor) : n.valor_pago > 0 ? brl(n.valor_pago) + '/' + brl(n.valor) : brl(n.valor)}</small>` : ''}</div>`).join('')}</div></div>`;
  }
  $('#rifa-lista').innerHTML = html || '<div class="card vazio">Nenhum número encontrado com esses filtros.</div>';
}
function abrirNumero(id) {
  const n = S.numPorId[id];
  if (!n) return;
  const b = S.bloqPorId[n.bloquinho_id];
  const pags = (S.pagsPorNum[n.id] || []).sort((a, c) => (a.data || '').localeCompare(c.data || ''));
  const restante = Math.max(0, n.valor - n.valor_pago - n.valor_aguardando);
  const edita = pode('numeros');
  const corpo = `
    <p class="dica" style="margin-top:0">Bloquinho <b>${pad3(b?.numero)}</b>${b?.responsavel_nome ? ' · Responsável: <b>' + esc(b.responsavel_nome) + '</b>' : ''} · Situação atual: <span class="badge ${ST_NUM_COR[n.status]}">${ST_NUM[n.status]}</span></p>
    <form class="form" id="form-num"><div class="grade-form">
      ${campoHTML({ k: 'comprador_nome', l: 'Nome do comprador' }, n.comprador_nome)}
      ${campoHTML({ k: 'comprador_telefone', l: 'Telefone do comprador', t: 'tel' }, n.comprador_telefone)}
      ${campoHTML({ k: 'vendedor', l: 'Nome de quem vendeu', t: 'datalist', lista: nomesPessoas() }, n.vendedor || b?.responsavel_nome)}
      ${campoHTML({ k: 'valor', l: 'Valor do número (R$)', t: 'money' }, n.valor)}
      ${campoHTML({ k: 'data_venda', l: 'Data da venda', t: 'date' }, n.data_venda || (n.status === 'disponivel' ? hoje() : ''))}
      ${campoHTML({ k: 'forma_pagamento', l: 'Forma de pagamento', t: 'select', op: [['', '—'], ...FORMAS_REC] }, n.forma_pagamento)}
      ${campoHTML({ k: 'status', l: 'Situação do número', t: 'select', op: Object.entries(ST_NUM), dica: 'Pago/Pendente é atualizado automaticamente pelos pagamentos.' }, n.status === 'disponivel' ? 'vendido' : n.status)}
      ${campoHTML({ k: 'observacoes', l: 'Observações' }, n.observacoes)}
    </div><div class="erro-box oculto" id="num-erro"></div></form>
    <div class="secao-titulo">Pagamentos deste número</div>
    <div class="relatorio-bloco">
      <div class="lin"><span>Valor do número</span><b>${brl(n.valor)}</b></div>
      <div class="lin"><span>Recebido (confirmado)</span><b style="color:var(--verde2)">${brl(n.valor_pago)}</b></div>
      ${n.valor_aguardando ? `<div class="lin"><span>Aguardando conferência</span><b style="color:#8a6a00">${brl(n.valor_aguardando)}</b></div>` : ''}
      <div class="lin total"><span>Falta receber</span><b style="color:var(--vermelho)">${brl(Math.max(0, n.valor - n.valor_pago))}</b></div>
    </div>
    ${pags.length ? `<div class="tabela-wrap" style="margin-top:10px"><table><thead><tr><th>Data</th><th>Pagador</th><th>Forma</th><th class="num">Valor</th><th>Recebido por</th><th>Situação</th><th></th></tr></thead><tbody>${pags.map((p) => `<tr>
      <td>${dataBR(p.data)}</td><td>${esc(p.pagador)}</td><td>${p.forma === 'pix' ? 'PIX' : 'Dinheiro'}</td><td class="num">${brl(p.valor)}</td><td>${esc(p.recebido_por)}</td>
      <td>${p.situacao === 'confirmado' ? '<span class="badge b-verde">Confirmado</span>' : '<span class="badge b-ouro">Aguardando</span>'}</td>
      <td class="acoes">${linkArq(p.comprovante_path)} ${p.situacao === 'aguardando' && podeConfirmar() ? `<button class="btn peq" data-conf="${p.id}">Confirmar</button>` : ''} ${podeConfirmar() ? `<button class="btn peq perigo" data-delpag="${p.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dica" style="margin-top:8px">Nenhum pagamento registrado.</p>'}
    ${edita && n.status !== 'cancelado' && restante > 0 ? `
    <div class="secao-titulo">Registrar pagamento</div>
    <form class="form" id="form-pag"><div class="grade-form">
      ${campoHTML({ k: 'valor', l: 'Valor recebido (R$)', t: 'money', req: true, dica: 'Pode ser parcial; o restante fica em aberto.' }, restante)}
      ${campoHTML({ k: 'forma', l: 'Forma', t: 'select', op: FORMAS_REC }, n.forma_pagamento || 'dinheiro')}
      ${campoHTML({ k: 'data', l: 'Data do recebimento', t: 'date', req: true }, hoje())}
      ${campoHTML({ k: 'recebido_por', l: 'Responsável pelo recebimento', t: 'datalist', lista: nomesPessoas() }, b?.responsavel_nome || '')}
      ${campoHTML({ k: 'pagador', l: 'Nome de quem pagou' }, n.comprador_nome)}
      ${podeConfirmar() ? campoHTML({ k: 'situacao', l: 'Situação', t: 'select', op: [['confirmado', 'Confirmado'], ['aguardando', 'Aguardando conferência']] }, 'confirmado') : ''}
      ${campoHTML({ k: 'comprovante', l: 'Comprovante do PIX (opcional)', t: 'file', full: true }, null)}
    </div>${!podeConfirmar() ? '<p class="dica">Pagamentos via PIX ficam “aguardando conferência” até o financeiro confirmar.</p>' : ''}
    <div class="erro-box oculto" id="pag-erro"></div>
    <button class="btn ouro" id="btn-pag" style="align-self:flex-start">💰 Registrar pagamento</button></form>` : ''}`;
  const rodape = edita ? `${n.status !== 'disponivel' ? '<button class="btn perigo" data-liberar style="margin-right:auto">Liberar número</button>' : ''}<button class="btn" data-canc>Fechar</button><button class="btn prim" data-salvnum>Salvar dados do número</button>` : '<button class="btn" data-canc>Fechar</button>';
  const m = abrirModal({ titulo: `🎟️ Número ${String(n.numero).padStart(2, '0')}`, corpo, rodape, largo: true });
  const fx = m.fundo;
  fx.querySelector('[data-canc]').onclick = m.fechar;
  if (!edita) fx.querySelectorAll('#form-num input, #form-num select').forEach((e) => { e.disabled = true; });
  const salvarNum = fx.querySelector('[data-salvnum]');
  if (salvarNum) salvarNum.onclick = async () => {
    const fm = fx.querySelector('#form-num'); const err = fx.querySelector('#num-erro');
    const d = {
      comprador_nome: fm.elements.comprador_nome.value.trim() || null, comprador_telefone: fm.elements.comprador_telefone.value.trim() || null,
      vendedor: fm.elements.vendedor.value.trim() || null, valor: num(fm.elements.valor.value) || n.valor, data_venda: fm.elements.data_venda.value || null,
      forma_pagamento: fm.elements.forma_pagamento.value || null, status: fm.elements.status.value, observacoes: fm.elements.observacoes.value.trim() || null,
    };
    if (['vendido', 'pago', 'pendente', 'reservado'].includes(d.status) && !d.comprador_nome) { err.textContent = 'Informe o nome do comprador.'; err.classList.remove('oculto'); return; }
    try { await gravar('natal_numeros', n.id, d); m.fechar(); await recarregar(false); toast('Número salvo'); } catch (e) { err.textContent = msgErro(e); err.classList.remove('oculto'); }
  };
  const liberar = fx.querySelector('[data-liberar]');
  if (liberar) liberar.onclick = async () => {
    if (pags.length) return toast('Exclua os pagamentos deste número antes de liberá-lo.', true);
    if (!(await confirmar(`Liberar o número ${n.numero}? Os dados do comprador serão apagados e ele volta a ficar disponível.`, 'Liberar'))) return;
    try { await gravar('natal_numeros', n.id, { comprador_nome: null, comprador_telefone: null, vendedor: null, data_venda: null, forma_pagamento: null, status: 'disponivel', observacoes: null }); m.fechar(); await recarregar(false); toast('Número liberado'); } catch (e) { toast(msgErro(e), true); }
  };
  const btnPag = fx.querySelector('#btn-pag');
  if (btnPag) btnPag.onclick = async (e) => {
    e.preventDefault();
    const fp = fx.querySelector('#form-pag'); const err = fx.querySelector('#pag-erro');
    if (!fp.reportValidity()) return;
    const fn = fx.querySelector('#form-num');
    const valor = num(fp.elements.valor.value);
    if (!(valor > 0)) { err.textContent = 'Informe o valor.'; err.classList.remove('oculto'); return; }
    if (!fn.elements.comprador_nome.value.trim() && !fp.elements.pagador.value.trim()) { err.textContent = 'Informe o nome do comprador.'; err.classList.remove('oculto'); return; }
    btnPag.disabled = true; btnPag.textContent = 'Registrando…';
    try {
      // garante os dados do número (comprador/vendedor) antes do pagamento
      if (n.status === 'disponivel' || n.status === 'reservado' || !n.comprador_nome) {
        await gravar('natal_numeros', n.id, {
          comprador_nome: fn.elements.comprador_nome.value.trim() || fp.elements.pagador.value.trim(), comprador_telefone: fn.elements.comprador_telefone.value.trim() || null,
          vendedor: fn.elements.vendedor.value.trim() || null, data_venda: fn.elements.data_venda.value || hoje(), forma_pagamento: fp.elements.forma.value, status: 'vendido',
        });
      }
      const file = fp.elements.comprovante.files[0];
      const comprovante_path = file ? await enviarArquivo(file, 'pagamentos') : null;
      await gravar('natal_pagamentos', null, {
        numero_id: n.id, valor, forma: fp.elements.forma.value, data: fp.elements.data.value, recebido_por: fp.elements.recebido_por.value.trim() || null,
        pagador: fp.elements.pagador.value.trim() || fn.elements.comprador_nome.value.trim() || null, comprovante_path,
        situacao: fp.elements.situacao ? fp.elements.situacao.value : 'confirmado',
      });
      m.fechar(); await recarregar(false); toast('Pagamento registrado');
    } catch (e2) { err.textContent = msgErro(e2); err.classList.remove('oculto'); btnPag.disabled = false; btnPag.textContent = '💰 Registrar pagamento'; }
  };
  fx.querySelectorAll('[data-conf]').forEach((bt) => { bt.onclick = async () => { try { await gravar('natal_pagamentos', bt.dataset.conf, { situacao: 'confirmado' }); m.fechar(); await recarregar(false); toast('Pagamento confirmado'); abrirNumero(n.id); } catch (e) { toast(msgErro(e), true); } }; });
  fx.querySelectorAll('[data-delpag]').forEach((bt) => { bt.onclick = async () => { if (!(await confirmar('Excluir este pagamento? O valor volta a ficar em aberto.', 'Excluir'))) return; try { await apagar('natal_pagamentos', bt.dataset.delpag); m.fechar(); await recarregar(false); toast('Pagamento excluído'); abrirNumero(n.id); } catch (e) { toast(msgErro(e), true); } }; });
}
window.abrirNumero = abrirNumero;

// ============================================================
// 6. BLOQUINHOS
// ============================================================
function formBloquinho(b) {
  const opPessoas = [['', '— selecione —'], ...S.pessoas.filter((p) => p.ativo || p.id === b.pessoa_id).map((p) => [p.id, p.nome])];
  abrirForm({
    titulo: `📒 Bloquinho ${pad3(b.numero)}`,
    campos: [
      { k: 'pessoa_id', l: 'Responsável (pessoa cadastrada)', t: 'select', op: opPessoas, full: true, dica: 'Ou digite o nome abaixo. Cadastre pessoas em “Pessoas e Responsáveis”.' },
      { k: 'responsavel_nome', l: 'Nome de quem retirou' },
      { k: 'telefone', l: 'Telefone', t: 'tel' },
      { k: 'data_retirada', l: 'Data da retirada', t: 'date' },
      { k: 'data_devolucao', l: 'Data de devolução', t: 'date', dica: 'Prevista ou realizada' },
      { k: 'situacao', l: 'Situação', t: 'select', op: Object.entries(ST_BLOQ) },
      { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
    ],
    extra: `<p class="dica">Quantidade de números: <b>${b.quantidade_numeros}</b> · Valor total do bloquinho: <b>${brl(b.valor_total)}</b></p>`,
    valores: b,
    aoAbrir: (f) => {
      const sel = f.querySelector('#f_pessoa_id');
      sel.onchange = () => {
        const p = S.pessoaPorId[sel.value];
        if (p) { f.querySelector('#f_responsavel_nome').value = p.nome; f.querySelector('#f_telefone').value = p.telefone || ''; }
        if (sel.value && f.querySelector('#f_situacao').value === 'disponivel') { f.querySelector('#f_situacao').value = 'entregue'; if (!f.querySelector('#f_data_retirada').value) f.querySelector('#f_data_retirada').value = hoje(); }
      };
      if (!pode('bloquinhos')) f.querySelector('[data-salv]').classList.add('oculto');
    },
    salvar: (d) => {
      if (d.pessoa_id && !d.responsavel_nome) d.responsavel_nome = S.pessoaPorId[d.pessoa_id]?.nome;
      if (d.situacao !== 'disponivel' && !d.responsavel_nome) throw new Error('Informe quem retirou o bloquinho.');
      return gravar('natal_bloquinhos', b.id, d);
    },
    excluir: PAPEL === 'admin' ? async () => {
      const r = resumoBloq(b);
      if (r.vendidos || r.recebido) throw new Error('Este bloquinho tem números vendidos ou pagamentos. Cancele-os antes de excluir.');
      await apagar('natal_bloquinhos', b.id);
    } : null,
  });
}
window.formBloquinho = (id) => formBloquinho(S.bloqPorId[id]);
function gerarBloquinhos() {
  abrirForm({
    titulo: 'Gerar bloquinhos',
    campos: [{ k: 'qtd', l: 'Quantos bloquinhos gerar?', t: 'number', req: true }],
    valores: { qtd: 10 },
    extra: `<p class="dica">Cada bloquinho terá <b>${S.config.numeros_por_bloquinho} números</b> de <b>${brl(S.config.valor_numero)}</b> (total ${brl(S.config.numeros_por_bloquinho * S.config.valor_numero)}). A numeração continua a partir do último bloquinho (${pad3(S.bloquinhos.length ? Math.max(...S.bloquinhos.map((b) => b.numero)) : 0)}) e do último número (${S.numeros.length ? Math.max(...S.numeros.map((n) => n.numero)) : 0}).</p>`,
    salvar: async (d) => {
      const q = Math.round(Number(d.qtd) || 0);
      if (q < 1 || q > 500) throw new Error('Informe entre 1 e 500.');
      const { error } = await sb.rpc('natal_gerar_bloquinhos', { p_qtd: q });
      if (error) throw error;
    },
  });
}
window.gerarBloquinhos = gerarBloquinhos;
function rBloquinhos(completo) {
  const f = (F.bloquinhos ||= { sit: '', q: '' });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="entre"><div class="filtros">
        <input type="search" id="fb-q" placeholder="Buscar nº ou responsável…" value="${esc(f.q)}">
        <select id="fb-sit"><option value="">Todas as situações</option><option value="naodev"${f.sit === 'naodev' ? ' selected' : ''}>Não devolvidos</option>${Object.entries(ST_BLOQ).map(([k, v]) => `<option value="${k}"${f.sit === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      </div>${pode('bloquinhos') ? '<button class="btn prim" onclick="gerarBloquinhos()">+ Gerar bloquinhos</button>' : ''}</div>
      <div id="bloq-lista"></div>`;
    $('#fb-q').oninput = (e) => { f.q = e.target.value; listaBloquinhos(); };
    $('#fb-sit').onchange = (e) => { f.sit = e.target.value; listaBloquinhos(); };
  }
  listaBloquinhos();
}
function listaBloquinhos() {
  const f = F.bloquinhos, q = f.q.trim().toLowerCase(), hj = hoje();
  const lista = S.bloquinhos.filter((b) => (!f.sit || (f.sit === 'naodev' ? ['entregue', 'em_andamento'].includes(b.situacao) : b.situacao === f.sit))
    && (!q || String(b.numero) === q.replace(/^0+/, '') || (b.responsavel_nome || '').toLowerCase().includes(q)));
  if (!S.bloquinhos.length) { $('#bloq-lista').innerHTML = `<div class="card vazio">Nenhum bloquinho gerado ainda.${pode('bloquinhos') ? ' Clique em <b>+ Gerar bloquinhos</b> para criar a numeração automática.' : ''}</div>`; return; }
  const linhas = lista.map((b) => {
    const r = resumoBloq(b);
    const atrasado = ['entregue', 'em_andamento'].includes(b.situacao) && b.data_devolucao && b.data_devolucao < hj;
    return `<tr style="cursor:pointer" onclick="formBloquinho('${b.id}')">
      <td><b>${pad3(b.numero)}</b></td><td>${esc(b.responsavel_nome || '—')}</td><td>${esc(b.telefone || '')}</td><td>${dataBR(b.data_retirada)}</td>
      <td>${dataBR(b.data_devolucao)}${atrasado ? ' <span class="badge b-verm">vencida</span>' : ''}</td><td><span class="badge ${ST_BLOQ_COR[b.situacao]}">${ST_BLOQ[b.situacao]}</span></td>
      <td class="num">${r.vendidos}/${r.total}</td><td class="num">${r.pagos}</td><td class="num">${brl(r.recebido)}</td><td class="num">${r.aberto > 0 ? `<b style="color:var(--vermelho)">${brl(r.aberto)}</b>` : '—'}</td>
      <td class="acoes"><button class="btn peq" onclick="event.stopPropagation();irPara('rifas',{bloq:'${b.id}',st:'',q:''})">Números</button></td></tr>`;
  }).join('');
  const rs = lista.map(resumoBloq);
  $('#bloq-lista').innerHTML = `<div class="tabela-wrap"><table>
    <thead><tr><th>Nº</th><th>Quem retirou</th><th>Telefone</th><th>Retirada</th><th>Devolução</th><th>Situação</th><th class="num">Vendidos</th><th class="num">Pagos</th><th class="num">Recebido</th><th class="num">Em aberto</th><th></th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="11" class="vazio">Nenhum bloquinho com esses filtros.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="6">${lista.length} bloquinho(s) · valor total ${brl(soma(lista, 'valor_total'))}</td><td class="num">${soma(rs, 'vendidos')}</td><td class="num">${soma(rs, 'pagos')}</td><td class="num">${brl(soma(rs, 'recebido'))}</td><td class="num">${brl(soma(rs, 'aberto'))}</td><td></td></tr></tfoot></table></div>`;
}

// ============================================================
// 7. RECEBIMENTOS (pagamentos, entregas, outras receitas)
// ============================================================
function rRecebimentos(completo) {
  const f = (F.recebimentos ||= { aba: 'pagamentos', forma: '', sit: '', resp: '', bloq: '', q: '' });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="abas" id="rec-abas">
        <button data-aba="pagamentos">🎟️ Pagamentos da rifa</button>
        <button data-aba="entregas">💵 Entregas dos responsáveis</button>
        <button data-aba="receitas">🤝 Doações e outras entradas</button>
      </div><div id="rec-conteudo"></div>`;
    document.querySelectorAll('#rec-abas button').forEach((bt) => { bt.onclick = () => { f.aba = bt.dataset.aba; montarAbaRec(); }; });
    montarAbaRec();
  } else listaAbaRec();
}
function montarAbaRec() {
  const f = F.recebimentos;
  document.querySelectorAll('#rec-abas button').forEach((bt) => bt.classList.toggle('on', bt.dataset.aba === f.aba));
  const box = $('#rec-conteudo');
  if (f.aba === 'pagamentos') {
    const resps = [...new Set(S.pagamentos.map((p) => p.recebido_por).filter(Boolean))].sort();
    box.innerHTML = `<div id="rec-kpis"></div>
      <div class="filtros" style="margin:12px 0">
        <input type="search" id="frc-q" placeholder="Buscar pagador ou nº…" value="${esc(f.q)}">
        <select id="frc-forma"><option value="">Dinheiro e PIX</option><option value="dinheiro"${f.forma === 'dinheiro' ? ' selected' : ''}>Só dinheiro</option><option value="pix"${f.forma === 'pix' ? ' selected' : ''}>Só PIX</option></select>
        <select id="frc-sit"><option value="">Todas as situações</option><option value="confirmado"${f.sit === 'confirmado' ? ' selected' : ''}>Confirmados</option><option value="aguardando"${f.sit === 'aguardando' ? ' selected' : ''}>Aguardando conferência</option></select>
        <select id="frc-resp"><option value="">Todos os responsáveis</option>${resps.map((r) => `<option${f.resp === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <select id="frc-bloq"><option value="">Todos os bloquinhos</option>${S.bloquinhos.map((b) => `<option value="${b.id}"${f.bloq === b.id ? ' selected' : ''}>Bloquinho ${pad3(b.numero)}</option>`).join('')}</select>
      </div><div id="rec-lista"></div>
      <p class="dica" style="margin-top:8px">Para registrar um novo pagamento, abra o número em <button class="link" onclick="irPara('rifas')">Controle de Rifas</button> (permite pagamentos parciais). Números pendentes: ${S.numeros.filter((n) => ['vendido', 'pendente'].includes(n.status)).length}.</p>`;
    $('#frc-q').oninput = (e) => { f.q = e.target.value; listaAbaRec(); };
    ['forma', 'sit', 'resp', 'bloq'].forEach((k) => { $('#frc-' + k).onchange = (e) => { f[k] = e.target.value; listaAbaRec(); }; });
  } else if (f.aba === 'entregas') {
    box.innerHTML = `<div class="entre" style="margin:12px 0"><p class="dica">Valores em dinheiro que os responsáveis entregaram ao caixa da Carretinha.</p>${pode('entregas') ? '<button class="btn prim" onclick="formEntrega()">+ Registrar entrega</button>' : ''}</div><div id="rec-lista"></div>`;
  } else {
    box.innerHTML = `<div class="entre" style="margin:12px 0"><p class="dica">Doações em dinheiro e outras entradas (fora da rifa).</p>${pode('receitas') ? '<button class="btn prim" onclick="formReceita()">+ Nova entrada</button>' : ''}</div><div id="rec-lista"></div>`;
  }
  listaAbaRec();
}
function listaAbaRec() {
  const f = F.recebimentos;
  if (f.aba === 'pagamentos') {
    const q = f.q.trim().toLowerCase();
    const lista = S.pagamentos.filter((p) => (!f.forma || p.forma === f.forma) && (!f.sit || p.situacao === f.sit) && (!f.resp || p.recebido_por === f.resp) && (!f.bloq || p.bloquinho_id === f.bloq)
      && (!q || (p.pagador || '').toLowerCase().includes(q) || String(S.numPorId[p.numero_id]?.numero) === q.replace(/^0+/, ''))).sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.criado_em.localeCompare(a.criado_em));
    const conf = S.pagamentos.filter((p) => p.situacao === 'confirmado');
    $('#rec-kpis').innerHTML = `<div class="kpis">
      <div class="kpi"><span>Confirmado em dinheiro</span><b>${brl(soma(conf.filter((p) => p.forma === 'dinheiro'), 'valor'))}</b></div>
      <div class="kpi a"><span>Confirmado via PIX</span><b>${brl(soma(conf.filter((p) => p.forma === 'pix'), 'valor'))}</b></div>
      <div class="kpi o"><span>Aguardando conferência</span><b>${brl(soma(S.pagamentos.filter((p) => p.situacao === 'aguardando'), 'valor'))}</b><small>${S.pagamentos.filter((p) => p.situacao === 'aguardando').length} comprovante(s)</small></div>
      <div class="kpi v"><span>Em aberto (a receber)</span><b>${brl(soma(vendidos(), (n) => Math.max(0, n.valor - n.valor_pago)))}</b></div></div>`;
    $('#rec-lista').innerHTML = lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Quem pagou</th><th>Nº</th><th>Bloquinho</th><th class="num">Valor</th><th>Forma</th><th>Recebido por</th><th>Situação</th><th></th></tr></thead><tbody>${lista.map((p) => {
      const n = S.numPorId[p.numero_id], b = S.bloqPorId[p.bloquinho_id];
      return `<tr><td>${dataBR(p.data)}</td><td>${esc(p.pagador)}</td><td>${n ? `<button class="link" onclick="abrirNumero('${n.id}')">${String(n.numero).padStart(2, '0')}</button>` : '—'}</td><td>${b ? pad3(b.numero) : '—'}</td>
        <td class="num"><b>${brl(p.valor)}</b></td><td>${p.forma === 'pix' ? 'PIX' : 'Dinheiro'}</td><td>${esc(p.recebido_por)}</td>
        <td>${p.situacao === 'confirmado' ? '<span class="badge b-verde">Confirmado</span>' : '<span class="badge b-ouro">Aguardando conferência</span>'}</td>
        <td class="acoes">${linkArq(p.comprovante_path)} ${p.situacao === 'aguardando' && podeConfirmar() ? `<button class="btn peq prim" onclick="confirmarPag('${p.id}')">Confirmar</button>` : ''}</td></tr>`;
    }).join('')}</tbody><tfoot><tr><td colspan="4">${lista.length} pagamento(s)</td><td class="num">${brl(soma(lista, 'valor'))}</td><td colspan="4"></td></tr></tfoot></table></div>` : '<div class="card vazio">Nenhum pagamento encontrado.</div>';
  } else if (f.aba === 'entregas') {
    const lista = [...S.entregas].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    $('#rec-lista').innerHTML = lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Responsável</th><th class="num">Valor</th><th>Forma</th><th>Recebido por</th><th>Observações</th><th></th></tr></thead><tbody>${lista.map((e) => `<tr>
      <td>${dataBR(e.data)}</td><td>${esc(S.pessoaPorId[e.pessoa_id]?.nome)}</td><td class="num"><b>${brl(e.valor)}</b></td><td>${e.forma === 'pix' ? 'PIX' : 'Dinheiro'}</td><td>${esc(e.recebido_por)}</td><td>${esc(e.observacoes)}</td>
      <td class="acoes">${pode('entregas') ? `<button class="btn peq" onclick="formEntrega(S.entregas.find(x=>x.id==='${e.id}'))">Editar</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Total entregue</td><td class="num">${brl(soma(lista, 'valor'))}</td><td colspan="4"></td></tr></tfoot></table></div>` : '<div class="card vazio">Nenhuma entrega registrada.</div>';
  } else {
    const lista = [...S.receitas].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    $('#rec-lista').innerHTML = lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Doador / origem</th><th class="num">Valor</th><th>Forma</th><th>Recebido por</th><th>Situação</th><th></th></tr></thead><tbody>${lista.map((r) => `<tr style="cursor:pointer" onclick="formReceita(S.receitas.find(x=>x.id==='${r.id}'))">
      <td>${dataBR(r.data)}</td><td>${r.tipo === 'doacao' ? 'Doação' : 'Outra entrada'}</td><td>${esc(r.descricao)}</td><td>${esc(r.doador)}</td><td class="num"><b>${brl(r.valor)}</b></td>
      <td>${{ dinheiro: 'Dinheiro', pix: 'PIX', outro: 'Outro' }[r.forma]}</td><td>${esc(r.recebido_por)}</td><td>${r.situacao === 'recebido' ? '<span class="badge b-verde">Recebido</span>' : '<span class="badge b-ouro">Pendente</span>'}</td><td class="acoes">${linkArq(r.comprovante_path)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Total recebido</td><td class="num">${brl(soma(lista.filter((r) => r.situacao === 'recebido'), 'valor'))}</td><td colspan="4"></td></tr></tfoot></table></div>` : '<div class="card vazio">Nenhuma doação ou entrada registrada.</div>';
  }
}
window.confirmarPag = async (id) => {
  try { await gravar('natal_pagamentos', id, { situacao: 'confirmado' }); await recarregar(false); toast('Pagamento confirmado'); } catch (e) { toast(msgErro(e), true); }
};
function formEntrega(e) {
  abrirForm({
    titulo: e ? 'Editar entrega' : 'Registrar entrega de valores',
    campos: [
      { k: 'pessoa_id', l: 'Responsável que entregou', t: 'select', req: true, op: [['', '— selecione —'], ...S.pessoas.map((p) => [p.id, p.nome])] },
      { k: 'valor', l: 'Valor entregue (R$)', t: 'money', req: true },
      { k: 'data', l: 'Data', t: 'date', req: true },
      { k: 'forma', l: 'Forma', t: 'select', op: FORMAS_REC },
      { k: 'recebido_por', l: 'Recebido por (caixa)', t: 'datalist', lista: nomesPessoas() },
      { k: 'observacoes', l: 'Observações', full: true },
    ],
    valores: e || { data: hoje(), forma: 'dinheiro' },
    aoAbrir: (f) => {
      const sel = f.querySelector('#f_pessoa_id'), dica = document.createElement('p');
      dica.className = 'dica'; sel.parentElement.appendChild(dica);
      const at = () => { const p = S.pessoaPorId[sel.value]; dica.innerHTML = p ? `Pendente de entrega: <b>${brl(resumoPessoa(p).pendenteEntrega)}</b>` : ''; if (p && !e && !f.querySelector('#f_valor').value) f.querySelector('#f_valor').value = fmtNumInput(resumoPessoa(p).pendenteEntrega.toFixed(2)); };
      sel.onchange = at; at();
    },
    salvar: (d) => { if (!(d.valor > 0)) throw new Error('Informe o valor.'); return gravar('natal_entregas', e?.id, d); },
    excluir: e && pode('entregas') ? () => apagar('natal_entregas', e.id) : null,
  });
}
window.formEntrega = formEntrega;
function formReceita(r) {
  abrirForm({
    titulo: r ? 'Editar entrada' : 'Nova doação / entrada',
    campos: [
      { k: 'tipo', l: 'Tipo', t: 'select', op: [['doacao', 'Doação em dinheiro'], ['outra', 'Outra entrada']] },
      { k: 'descricao', l: 'Descrição', req: true },
      { k: 'doador', l: 'Doador / origem' },
      { k: 'valor', l: 'Valor (R$)', t: 'money', req: true },
      { k: 'data', l: 'Data', t: 'date', req: true },
      { k: 'forma', l: 'Forma', t: 'select', op: [['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['outro', 'Outro']] },
      { k: 'recebido_por', l: 'Recebido por', t: 'datalist', lista: nomesPessoas() },
      { k: 'situacao', l: 'Situação', t: 'select', op: [['recebido', 'Recebido'], ['pendente', 'Pendente']] },
      { k: 'comprovante_path', l: 'Comprovante', t: 'file', pasta: 'receitas', full: true },
      { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
    ],
    valores: r || { tipo: 'doacao', data: hoje(), forma: 'dinheiro', situacao: 'recebido' },
    aoAbrir: (f) => { if (!pode('receitas')) f.querySelector('[data-salv]').classList.add('oculto'); },
    salvar: (d) => { if (!(d.valor > 0)) throw new Error('Informe o valor.'); return gravar('natal_receitas', r?.id, d); },
    excluir: r && pode('receitas') ? () => apagar('natal_receitas', r.id) : null,
  });
}
window.formReceita = formReceita;

// ============================================================
// 8. PESSOAS E RESPONSÁVEIS
// ============================================================
function formPessoa(p) {
  abrirForm({
    titulo: p ? 'Editar pessoa' : 'Nova pessoa',
    campos: [
      { k: 'nome', l: 'Nome', req: true },
      { k: 'telefone', l: 'Telefone', t: 'tel' },
      { k: 'funcao', l: 'Função', t: 'datalist', lista: ['Responsável por bloquinhos', 'Vendedor(a)', 'Tesouraria', 'Compras', 'Motorista', 'Organização', 'Voluntário(a)'] },
      { k: 'ativo', l: 'Situação', t: 'select', op: [['true', 'Ativo'], ['false', 'Inativo']] },
      { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
    ],
    valores: p ? { ...p, ativo: String(p.ativo) } : { ativo: 'true' },
    salvar: (d) => { d.ativo = d.ativo !== 'false'; return gravar('natal_pessoas', p?.id, d); },
    excluir: p && pode('pessoas') ? async () => { if (S.bloquinhos.some((b) => b.pessoa_id === p.id)) throw new Error('Esta pessoa tem bloquinhos. Marque como inativa em vez de excluir.'); await apagar('natal_pessoas', p.id); } : null,
  });
}
window.formPessoa = formPessoa;
function rPessoas() {
  const lin = S.pessoas.map((p) => ({ p, r: resumoPessoa(p) }));
  $('#conteudo').innerHTML = `
    <div class="entre"><p class="dica">Equipe da Carretinha e desempenho de cada responsável.</p><div style="display:flex;gap:8px">${pode('entregas') ? '<button class="btn" onclick="formEntrega()">💵 Registrar entrega</button>' : ''}${pode('pessoas') ? '<button class="btn prim" onclick="formPessoa()">+ Nova pessoa</button>' : ''}</div></div>
    ${lin.length ? `<div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Função</th><th class="num">Bloquinhos</th><th class="num">Vendidos</th><th class="num">Arrecadado</th><th class="num">Entregue</th><th class="num">Pendente de entrega</th><th class="num">A receber</th><th></th></tr></thead><tbody>${lin.map(({ p, r }) => `<tr${p.ativo ? '' : ' style="opacity:.55"'}>
      <td><b>${esc(p.nome)}</b>${p.ativo ? '' : ' <span class="badge b-cinza">inativo</span>'}</td><td>${esc(p.telefone)}</td><td>${esc(p.funcao)}</td>
      <td class="num">${r.bloqs.map((b) => pad3(b.numero)).join(', ') || '—'}</td><td class="num">${r.vendidos}</td><td class="num">${brl(r.arrecadado)}</td><td class="num">${brl(r.entregue)}</td>
      <td class="num">${r.pendenteEntrega > 0.009 ? `<span class="badge b-verm">${brl(r.pendenteEntrega)}</span>` : '<span class="badge b-verde">em dia</span>'}</td><td class="num">${brl(r.aReceber)}</td>
      <td class="acoes"><button class="btn peq" onclick="prestacaoPessoa('${p.id}')">Prestação</button> ${pode('pessoas') ? `<button class="btn peq" onclick="formPessoa(S.pessoas.find(x=>x.id==='${p.id}'))">Editar</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Totais</td><td class="num">${soma(lin, (x) => x.r.vendidos)}</td><td class="num">${brl(soma(lin, (x) => x.r.arrecadado))}</td><td class="num">${brl(soma(lin, (x) => x.r.entregue))}</td><td class="num">${brl(soma(lin, (x) => x.r.pendenteEntrega))}</td><td class="num">${brl(soma(lin, (x) => x.r.aReceber))}</td><td></td></tr></tfoot></table></div>
      <p class="dica">“Pendente de entrega” = dinheiro em espécie recebido nos bloquinhos do responsável − valores já entregues ao caixa. PIX cai direto na conta e não entra nesse cálculo.</p>`
      : '<div class="card vazio">Nenhuma pessoa cadastrada.</div>'}`;
}
function prestacaoPessoa(id) {
  const p = S.pessoaPorId[id], r = resumoPessoa(p);
  const ents = S.entregas.filter((e) => e.pessoa_id === id);
  const corpo = `
    <div class="kpis">
      <div class="kpi"><span>Bloquinhos</span><b>${r.bloqs.length}</b></div>
      <div class="kpi o"><span>Números vendidos</span><b>${r.vendidos}</b><small>${r.pagos} pagos</small></div>
      <div class="kpi"><span>Arrecadado</span><b>${brl(r.arrecadado)}</b><small>dinheiro ${brl(r.dinheiro)} · PIX ${brl(r.pix)}</small></div>
      <div class="kpi v"><span>Pendente de entrega</span><b>${brl(r.pendenteEntrega)}</b><small>entregue ${brl(r.entregue)}</small></div>
    </div>
    <div class="secao-titulo">Números vendidos</div>
    ${r.nums.filter((n) => n.status !== 'disponivel').length ? `<div class="tabela-wrap"><table><thead><tr><th>Bloq.</th><th>Nº</th><th>Comprador</th><th>Telefone</th><th class="num">Valor</th><th class="num">Pago</th><th>Situação</th></tr></thead><tbody>${r.nums.filter((n) => n.status !== 'disponivel').map((n) => `<tr><td>${pad3(S.bloqPorId[n.bloquinho_id]?.numero)}</td><td>${String(n.numero).padStart(2, '0')}</td><td>${esc(n.comprador_nome)}</td><td>${esc(n.comprador_telefone)}</td><td class="num">${brl(n.valor)}</td><td class="num">${brl(n.valor_pago)}</td><td><span class="badge ${ST_NUM_COR[n.status]}">${ST_NUM[n.status]}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Nenhum número vendido.</p>'}
    <div class="secao-titulo">Entregas ao caixa</div>
    ${ents.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th class="num">Valor</th><th>Forma</th><th>Recebido por</th></tr></thead><tbody>${ents.map((e) => `<tr><td>${dataBR(e.data)}</td><td class="num">${brl(e.valor)}</td><td>${e.forma === 'pix' ? 'PIX' : 'Dinheiro'}</td><td>${esc(e.recebido_por)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Nenhuma entrega registrada.</p>'}`;
  const m = abrirModal({ titulo: `Prestação de contas · ${esc(p.nome)}`, corpo, largo: true, rodape: '<button class="btn" data-pdf>⬇ PDF</button><button class="btn prim" data-f>Fechar</button>' });
  m.fundo.querySelector('[data-f]').onclick = m.fechar;
  m.fundo.querySelector('[data-pdf]').onclick = () => pdfPessoa(p, r, ents);
}
window.prestacaoPessoa = prestacaoPessoa;

// ============================================================
// 9. RELATÓRIOS E PRESTAÇÃO DE CONTAS
// ============================================================
function rRelatorios(completo) {
  const f = (F.relatorios ||= { de: '', ate: '', aba: 'contas' });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="card"><div class="entre"><div class="filtros">
        <label class="dica">De <input type="date" id="frl-de" value="${f.de}"></label>
        <label class="dica">Até <input type="date" id="frl-ate" value="${f.ate}"></label>
        <button class="link" onclick="F.relatorios.de='';F.relatorios.ate='';rRelatorios(true)">Período todo</button>
      </div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn verm" onclick="pdfPrestacao()">⬇ PDF da prestação de contas</button><button class="btn prim" onclick="excelPrestacao()">⬇ Excel completo</button></div></div></div>
      <div class="abas" id="rel-abas"><button data-aba="contas">📑 Prestação de contas</button>${['admin', 'financeiro'].includes(PAPEL) ? '<button data-aba="historico">🕓 Histórico de alterações</button>' : ''}</div>
      <div id="rel-conteudo"></div>`;
    $('#frl-de').onchange = (e) => { f.de = e.target.value; relConteudo(); };
    $('#frl-ate').onchange = (e) => { f.ate = e.target.value; relConteudo(); };
    document.querySelectorAll('#rel-abas button').forEach((b) => { b.onclick = () => { f.aba = b.dataset.aba; relConteudo(); }; });
  }
  relConteudo();
}
function relConteudo() {
  const f = F.relatorios;
  document.querySelectorAll('#rel-abas button').forEach((b) => b.classList.toggle('on', b.dataset.aba === f.aba));
  if (f.aba === 'historico') return relHistorico();
  const t = totais(f.de || null, f.ate || null);
  const per = f.de || f.ate ? `${f.de ? dataBR(f.de) : 'início'} a ${f.ate ? dataBR(f.ate) : 'hoje'}` : 'todo o período';
  const despCat = Object.entries(t.porCat).sort((a, b) => b[1] - a[1]);
  const resp = S.pessoas.map((p) => ({ p, r: resumoPessoa(p) })).filter((x) => x.r.bloqs.length || x.r.entregue);
  $('#rel-conteudo').innerHTML = `
    <p class="dica">Período: <b>${per}</b>. Valores pendentes não são contabilizados como dinheiro recebido.</p>
    <div class="grade3">
      <div class="relatorio-bloco"><div class="cab">TOTAL DE RECEITAS (recebidas)</div>
        <div class="lin"><span>Arrecadação das rifas</span><b>${brl(t.rifaRecebido)}</b></div>
        <div class="lin"><span>Doações em dinheiro</span><b>${brl(t.doacoes)}</b></div>
        <div class="lin"><span>Outras entradas</span><b>${brl(t.outras)}</b></div>
        <div class="lin total"><span>Total</span><b>${brl(t.recebidoTotal)}</b></div></div>
      <div class="relatorio-bloco"><div class="cab v">TOTAL DE DESPESAS</div>
        ${despCat.map(([c, v]) => `<div class="lin"><span>${esc(c)}</span><b>${brl(v)}</b></div>`).join('') || '<div class="lin"><span>Nenhuma despesa</span><b>—</b></div>'}
        <div class="lin total"><span>Total</span><b>${brl(t.despTotal)}</b></div></div>
      <div class="relatorio-bloco"><div class="cab o">RESULTADO</div>
        <div class="lin"><span>Total arrecadado (rifas vendidas + entradas)</span><b>${brl(t.rifaVendido + t.doacoes + t.outras + t.receitasPendentes)}</b></div>
        <div class="lin"><span>Total efetivamente recebido</span><b>${brl(t.recebidoTotal)}</b></div>
        <div class="lin"><span>Total gasto (despesas pagas)</span><b>${brl(t.despPagas)}</b></div>
        <div class="lin"><span>Total pendente de recebimento</span><b>${brl(t.rifaAberto + t.receitasPendentes)}</b></div>
        <div class="lin"><span>PIX aguardando conferência</span><b>${brl(t.rifaAguardando)}</b></div>
        <div class="lin"><span>Contas a pagar</span><b>${brl(t.despPend)}</b></div>
        <div class="lin total"><span>SALDO FINAL</span><b style="color:${t.saldo >= 0 ? 'var(--verde2)' : 'var(--vermelho)'}">${brl(t.saldo)}</b></div></div>
    </div>
    <div class="card"><h3>👥 Prestação por responsável</h3>${resp.length ? `<div class="tabela-wrap"><table><thead><tr><th>Responsável</th><th>Bloquinhos</th><th class="num">Vendidos</th><th class="num">Dinheiro</th><th class="num">PIX</th><th class="num">Entregue</th><th class="num">Pendente entrega</th><th class="num">A receber</th></tr></thead><tbody>${resp.map(({ p, r }) => `<tr><td>${esc(p.nome)}</td><td>${r.bloqs.map((b) => pad3(b.numero)).join(', ')}</td><td class="num">${r.vendidos}</td><td class="num">${brl(r.dinheiro)}</td><td class="num">${brl(r.pix)}</td><td class="num">${brl(r.entregue)}</td><td class="num">${brl(r.pendenteEntrega)}</td><td class="num">${brl(r.aReceber)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Nenhum responsável com bloquinhos.</p>'}</div>
    <div class="card"><h3>🧾 Despesas detalhadas</h3>${t.desp.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="num">Total</th><th>Comprou</th><th>Pagou</th><th>Situação</th></tr></thead><tbody>${[...t.desp].sort((a, b) => (a.data_compra || '').localeCompare(b.data_compra || '')).map((d) => `<tr><td>${dataBR(d.data_compra)}</td><td>${esc(d.descricao)}</td><td>${esc(d.categoria)}</td><td class="num">${brl(d.valor_total)}</td><td>${esc(d.quem_comprou)}</td><td>${esc(d.quem_pagou)}</td><td>${d.situacao === 'pago' ? 'Pago' : 'Pendente'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Nenhuma despesa no período.</p>'}</div>`;
}
async function relHistorico() {
  $('#rel-conteudo').innerHTML = '<div class="card vazio">Carregando histórico…</div>';
  const { data, error } = await sb.from('natal_historico').select('*').order('data', { ascending: false }).limit(300);
  if (error) { $('#rel-conteudo').innerHTML = `<div class="erro-box">${esc(msgErro(error))}</div>`; return; }
  const nomeT = { pessoas: 'Pessoa', despesas: 'Despesa', produtos: 'Produto', premios: 'Prêmio', bloquinhos: 'Bloquinho', numeros: 'Número', pagamentos: 'Pagamento', entregas: 'Entrega', receitas: 'Entrada', config: 'Configuração', acessos: 'Acesso' };
  const resumo = (h) => {
    const d = h.depois || h.antes || {};
    const base = d.descricao || d.nome || d.pagador || (d.numero ? 'Nº ' + d.numero : '') || '';
    if (h.acao !== 'alteração' || !h.antes || !h.depois) return base;
    const mud = Object.keys(h.depois).filter((k) => !['atualizado_em', 'criado_em'].includes(k) && JSON.stringify(h.depois[k]) !== JSON.stringify(h.antes[k]));
    return base + (mud.length ? ` — ${mud.slice(0, 4).map((k) => `${k}: ${esc(String(h.antes[k] ?? '∅'))} → ${esc(String(h.depois[k] ?? '∅'))}`).join('; ')}` : '');
  };
  $('#rel-conteudo').innerHTML = data.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead><tbody>${data.map((h) => `<tr><td>${dataHoraBR(h.data)}</td><td>${esc(h.usuario_email || '—')}</td><td><span class="badge ${h.acao === 'exclusão' ? 'b-verm' : h.acao === 'inclusão' ? 'b-verde' : 'b-ouro'}">${h.acao}</span></td><td>${nomeT[h.tabela] || h.tabela}</td><td><small>${resumo(h)}</small></td></tr>`).join('')}</tbody></table></div><p class="dica">Últimas 300 alterações.</p>` : '<div class="card vazio">Nenhuma alteração registrada.</div>';
}

function cabecalhoPdf(doc, titulo) {
  doc.setFillColor(15, 61, 36); doc.rect(0, 0, 210, 26, 'F');
  doc.setFillColor(201, 162, 39); doc.rect(0, 26, 210, 2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(`${S.config.nome_evento || 'Carretinha de Natal'} ${S.config.ano}`, 14, 12);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.text(titulo, 14, 20);
  doc.setFontSize(8); doc.text('Gerado em ' + new Date().toLocaleString('pt-BR') + ' por ' + (CLAIMS.email || ''), 196, 20, { align: 'right' });
  doc.setTextColor(28, 42, 34);
}
function tabelaPdf(doc, titulo, head, body, y, cor = [15, 61, 36]) {
  if (y > 250) { doc.addPage(); y = 16; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(titulo, 14, y);
  doc.autoTable({ startY: y + 3, head: [head], body, theme: 'striped', headStyles: { fillColor: cor }, styles: { fontSize: 8.5 }, margin: { left: 14, right: 14 } });
  return doc.lastAutoTable.finalY + 10;
}
window.pdfPrestacao = () => {
  if (!window.jspdf) return toast('Biblioteca de PDF não carregou. Verifique a internet.', true);
  const f = F.relatorios || {};
  const t = totais(f.de || null, f.ate || null);
  const doc = new window.jspdf.jsPDF();
  const per = f.de || f.ate ? `${f.de ? dataBR(f.de) : 'início'} a ${f.ate ? dataBR(f.ate) : 'hoje'}` : 'todo o período';
  cabecalhoPdf(doc, 'Prestação de Contas — ' + per);
  let y = 38;
  y = tabelaPdf(doc, 'TOTAL DE RECEITAS (efetivamente recebidas)', ['Origem', 'Valor'], [['Arrecadação das rifas', brl(t.rifaRecebido)], ['Doações em dinheiro', brl(t.doacoes)], ['Outras entradas', brl(t.outras)], ['TOTAL', brl(t.recebidoTotal)]], y);
  y = tabelaPdf(doc, 'TOTAL DE DESPESAS', ['Categoria', 'Valor'], [...Object.entries(t.porCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, brl(v)]), ['TOTAL', brl(t.despTotal)]], y, [185, 28, 28]);
  y = tabelaPdf(doc, 'RESULTADO', ['Indicador', 'Valor'], [
    ['Total arrecadado (rifas vendidas + entradas)', brl(t.rifaVendido + t.doacoes + t.outras + t.receitasPendentes)],
    ['Total efetivamente recebido', brl(t.recebidoTotal)], ['Total gasto (despesas pagas)', brl(t.despPagas)],
    ['Total pendente de recebimento', brl(t.rifaAberto + t.receitasPendentes)], ['PIX aguardando conferência', brl(t.rifaAguardando)],
    ['Contas a pagar', brl(t.despPend)], ['SALDO FINAL', brl(t.saldo)]], y, [138, 106, 0]);
  const resp = S.pessoas.map((p) => ({ p, r: resumoPessoa(p) })).filter((x) => x.r.bloqs.length || x.r.entregue);
  if (resp.length) y = tabelaPdf(doc, 'PRESTAÇÃO POR RESPONSÁVEL', ['Responsável', 'Bloquinhos', 'Vendidos', 'Dinheiro', 'PIX', 'Entregue', 'Pend. entrega'], resp.map(({ p, r }) => [p.nome, r.bloqs.map((b) => pad3(b.numero)).join(', '), r.vendidos, brl(r.dinheiro), brl(r.pix), brl(r.entregue), brl(r.pendenteEntrega)]), y);
  if (t.desp.length) y = tabelaPdf(doc, 'DESPESAS DETALHADAS', ['Data', 'Descrição', 'Categoria', 'Total', 'Comprou', 'Pagou', 'Situação'], [...t.desp].sort((a, b) => (a.data_compra || '').localeCompare(b.data_compra || '')).map((d) => [dataBR(d.data_compra), d.descricao, d.categoria, brl(d.valor_total), d.quem_comprou || '', d.quem_pagou || '', d.situacao === 'pago' ? 'Pago' : 'Pendente']), y, [185, 28, 28]);
  if (t.pagsConf.length) tabelaPdf(doc, 'RECEBIMENTOS DA RIFA (confirmados)', ['Data', 'Pagador', 'Nº', 'Bloq.', 'Forma', 'Recebido por', 'Valor'], t.pagsConf.map((p) => [dataBR(p.data), p.pagador || '', S.numPorId[p.numero_id]?.numero ?? '', pad3(S.bloqPorId[p.bloquinho_id]?.numero ?? ''), p.forma === 'pix' ? 'PIX' : 'Dinheiro', p.recebido_por || '', brl(p.valor)]), y);
  const pg = doc.getNumberOfPages();
  for (let i = 1; i <= pg; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Página ${i} de ${pg} · Conecta Gestão — Carretinha de Natal`, 105, 290, { align: 'center' }); }
  doc.save(`prestacao-contas-carretinha-natal-${S.config.ano}.pdf`);
};
function pdfPessoa(p, r, ents) {
  if (!window.jspdf) return toast('Biblioteca de PDF não carregou.', true);
  const doc = new window.jspdf.jsPDF();
  cabecalhoPdf(doc, 'Prestação de contas individual — ' + p.nome);
  let y = 38;
  y = tabelaPdf(doc, 'RESUMO', ['Indicador', 'Valor'], [['Bloquinhos', r.bloqs.map((b) => pad3(b.numero)).join(', ') || '—'], ['Números vendidos', String(r.vendidos)], ['Números pagos', String(r.pagos)], ['Arrecadado em dinheiro', brl(r.dinheiro)], ['Arrecadado via PIX', brl(r.pix)], ['Valor entregue ao caixa', brl(r.entregue)], ['Pendente de entrega', brl(r.pendenteEntrega)], ['Falta receber dos compradores', brl(r.aReceber)]], y);
  const ns = r.nums.filter((n) => n.status !== 'disponivel');
  if (ns.length) y = tabelaPdf(doc, 'NÚMEROS', ['Bloq.', 'Nº', 'Comprador', 'Telefone', 'Valor', 'Pago', 'Situação'], ns.map((n) => [pad3(S.bloqPorId[n.bloquinho_id]?.numero), n.numero, n.comprador_nome || '', n.comprador_telefone || '', brl(n.valor), brl(n.valor_pago), ST_NUM[n.status]]), y);
  if (ents.length) tabelaPdf(doc, 'ENTREGAS AO CAIXA', ['Data', 'Valor', 'Forma', 'Recebido por'], ents.map((e) => [dataBR(e.data), brl(e.valor), e.forma === 'pix' ? 'PIX' : 'Dinheiro', e.recebido_por || '']), y);
  doc.save(`prestacao-${p.nome.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
window.excelPrestacao = () => {
  if (!window.XLSX) return toast('Biblioteca de Excel não carregou.', true);
  const f = F.relatorios || {};
  const t = totais(f.de || null, f.ate || null);
  const wb = XLSX.utils.book_new();
  const add = (nome, linhas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Info: 'Sem registros' }]), nome);
  add('Resumo', [
    { Grupo: 'Receitas', Item: 'Arrecadação das rifas (recebida)', Valor: t.rifaRecebido }, { Grupo: 'Receitas', Item: 'Doações em dinheiro', Valor: t.doacoes }, { Grupo: 'Receitas', Item: 'Outras entradas', Valor: t.outras },
    { Grupo: 'Receitas', Item: 'TOTAL RECEBIDO', Valor: t.recebidoTotal },
    ...Object.entries(t.porCat).map(([c, v]) => ({ Grupo: 'Despesas', Item: c, Valor: v })), { Grupo: 'Despesas', Item: 'TOTAL DESPESAS', Valor: t.despTotal },
    { Grupo: 'Resultado', Item: 'Total arrecadado', Valor: t.rifaVendido + t.doacoes + t.outras + t.receitasPendentes }, { Grupo: 'Resultado', Item: 'Total efetivamente recebido', Valor: t.recebidoTotal },
    { Grupo: 'Resultado', Item: 'Total gasto (pago)', Valor: t.despPagas }, { Grupo: 'Resultado', Item: 'Pendente de recebimento', Valor: t.rifaAberto + t.receitasPendentes },
    { Grupo: 'Resultado', Item: 'Contas a pagar', Valor: t.despPend }, { Grupo: 'Resultado', Item: 'SALDO FINAL', Valor: t.saldo },
  ]);
  add('Despesas', t.desp.map((d) => ({ Data: dataBR(d.data_compra), Descrição: d.descricao, Categoria: d.categoria, Produto: d.produto, Quantidade: Number(d.quantidade), 'Valor unitário': Number(d.valor_unitario), 'Valor total': Number(d.valor_total), 'Quem comprou': d.quem_comprou, 'Quem pagou': d.quem_pagou, Forma: d.forma_pagamento, Situação: d.situacao, Observações: d.observacoes })));
  add('Produtos', S.produtos.map((p) => ({ Produto: p.nome, Categoria: p.categoria, Comprado: Number(p.quantidade_comprada), Utilizado: Number(p.quantidade_utilizada), Restante: Number(p.quantidade_restante), Unidade: p.unidade, 'Valor total': Number(p.valor_total), Fornecedor: p.fornecedor, 'Data compra': dataBR(p.data_compra), Responsável: p.responsavel })));
  add('Prêmios', S.premios.map((p) => ({ Ordem: p.ordem_sorteio, Prêmio: p.nome, Descrição: p.descricao, 'Valor estimado': Number(p.valor_estimado), Origem: p.origem, 'Doou/comprou': p.doador_ou_comprador, 'Quem pagou': p.quem_pagou, Data: dataBR(p.data), Situação: p.situacao })));
  add('Bloquinhos', S.bloquinhos.map((b) => { const r = resumoBloq(b); return { Bloquinho: pad3(b.numero), Responsável: b.responsavel_nome, Telefone: b.telefone, Retirada: dataBR(b.data_retirada), Devolução: dataBR(b.data_devolucao), Situação: ST_BLOQ[b.situacao], Vendidos: r.vendidos, Pagos: r.pagos, Recebido: r.recebido, 'Em aberto': r.aberto }; }));
  add('Números', S.numeros.filter((n) => n.status !== 'disponivel').map((n) => ({ Número: n.numero, Bloquinho: pad3(S.bloqPorId[n.bloquinho_id]?.numero), Comprador: n.comprador_nome, Telefone: n.comprador_telefone, Vendedor: n.vendedor, Valor: Number(n.valor), Pago: Number(n.valor_pago), 'Data venda': dataBR(n.data_venda), Forma: n.forma_pagamento, Situação: ST_NUM[n.status] })));
  add('Recebimentos', S.pagamentos.map((p) => ({ Data: dataBR(p.data), Pagador: p.pagador, Número: S.numPorId[p.numero_id]?.numero, Bloquinho: pad3(S.bloqPorId[p.bloquinho_id]?.numero ?? ''), Valor: Number(p.valor), Forma: p.forma, 'Recebido por': p.recebido_por, Situação: p.situacao })));
  add('Doações e entradas', S.receitas.map((r) => ({ Data: dataBR(r.data), Tipo: r.tipo === 'doacao' ? 'Doação' : 'Outra', Descrição: r.descricao, Doador: r.doador, Valor: Number(r.valor), Forma: r.forma, 'Recebido por': r.recebido_por, Situação: r.situacao })));
  add('Responsáveis', S.pessoas.map((p) => { const r = resumoPessoa(p); return { Nome: p.nome, Telefone: p.telefone, Função: p.funcao, Bloquinhos: r.bloqs.map((b) => pad3(b.numero)).join(', '), Vendidos: r.vendidos, Dinheiro: r.dinheiro, PIX: r.pix, Entregue: r.entregue, 'Pendente entrega': r.pendenteEntrega, 'A receber': r.aReceber }; }));
  add('Entregas', S.entregas.map((e) => ({ Data: dataBR(e.data), Responsável: S.pessoaPorId[e.pessoa_id]?.nome, Valor: Number(e.valor), Forma: e.forma, 'Recebido por': e.recebido_por, Observações: e.observacoes })));
  XLSX.writeFile(wb, `carretinha-natal-${S.config.ano}.xlsx`);
};

// ============================================================
// 10. CONFIGURAÇÕES (admin)
// ============================================================
async function rConfig() {
  const c = S.config;
  $('#conteudo').innerHTML = `
    <div class="grade2">
      <div class="card"><h3>🎄 Parâmetros da Carretinha</h3>
        <form class="form" id="form-config"><div class="grade-form">
          ${campoHTML({ k: 'nome_evento', l: 'Nome do evento' }, c.nome_evento)}
          ${campoHTML({ k: 'ano', l: 'Ano / edição', t: 'number' }, c.ano)}
          ${campoHTML({ k: 'numeros_por_bloquinho', l: 'Números por bloquinho', t: 'number' }, c.numeros_por_bloquinho)}
          ${campoHTML({ k: 'valor_numero', l: 'Valor de cada número (R$)', t: 'money' }, c.valor_numero)}
          ${campoHTML({ k: 'estoque_minimo_padrao', l: 'Estoque mínimo padrão (alerta)', t: 'number' }, c.estoque_minimo_padrao)}
          ${campoHTML({ k: 'data_sorteio', l: 'Data do sorteio', t: 'date' }, c.data_sorteio)}
        </div>
        <p class="dica" id="cfg-bloq">Valor de cada bloquinho: <b>${brl(c.numeros_por_bloquinho * c.valor_numero)}</b>. Alterações valem para os próximos bloquinhos gerados.</p>
        <div class="erro-box oculto" id="cfg-erro"></div>
        <button class="btn prim" style="align-self:flex-start">Salvar parâmetros</button></form></div>
      <div class="card"><h3>🔐 Acessos ao módulo</h3>
        <p class="dica">Admin Master, Prefeito e Chefe de Gabinete já são <b>Administradores</b> automaticamente. Libere aqui os demais usuários do Conecta Gestão:</p>
        <ul class="dica" style="margin:8px 0 12px;padding-left:18px">
          <li><b>Administrador geral</b> — acesso total, configurações e acessos.</li>
          <li><b>Financeiro</b> — despesas, compras, prêmios, rifas, recebimentos e conferência de PIX.</li>
          <li><b>Responsável por bloquinhos</b> — bloquinhos, números e registro de pagamentos (PIX fica aguardando conferência).</li>
          <li><b>Consulta</b> — apenas visualiza.</li></ul>
        <div id="acessos-lista"><p class="dica">Carregando…</p></div>
        <form class="filtros" id="form-acesso" style="margin-top:12px">
          <select id="ac-user" required><option value="">Carregando usuários…</option></select>
          <select id="ac-papel">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}"${k === 'consulta' ? ' selected' : ''}>${v}</option>`).join('')}</select>
          <button class="btn prim">Liberar acesso</button></form></div>
    </div>`;
  const fc = $('#form-config');
  const atBloq = () => { $('#cfg-bloq').innerHTML = `Valor de cada bloquinho: <b>${brl(num(fc.elements.numeros_por_bloquinho.value) * num(fc.elements.valor_numero.value))}</b>. Alterações valem para os próximos bloquinhos gerados.`; };
  fc.elements.numeros_por_bloquinho.oninput = atBloq; fc.elements.valor_numero.oninput = atBloq;
  fc.onsubmit = async (e) => {
    e.preventDefault();
    const d = { nome_evento: fc.elements.nome_evento.value.trim() || 'Carretinha de Natal', ano: Math.round(num(fc.elements.ano.value)) || new Date().getFullYear(),
      numeros_por_bloquinho: Math.round(num(fc.elements.numeros_por_bloquinho.value)) || 20, valor_numero: num(fc.elements.valor_numero.value) || 6.25,
      estoque_minimo_padrao: Math.round(num(fc.elements.estoque_minimo_padrao.value)) || 0, data_sorteio: fc.elements.data_sorteio.value || null };
    const { error } = await sb.from('natal_config').upsert({ tenant_id: CLAIMS.tenant_id, ...d });
    if (error) { $('#cfg-erro').textContent = msgErro(error); $('#cfg-erro').classList.remove('oculto'); return; }
    await recarregar(false); toast('Parâmetros salvos');
  };
  const [{ data: acessos, error: e1 }, { data: usuarios, error: e2 }] = await Promise.all([
    sb.from('natal_acessos').select('*').order('criado_em'),
    sb.rpc('natal_usuarios_sistema'),
  ]);
  if (e1 || e2) { $('#acessos-lista').innerHTML = `<div class="erro-box">${esc(msgErro(e1 || e2))}</div>`; return; }
  const autoAdmin = (usuarios || []).filter((u) => ['admin_master', 'chefe_de_gabinete', 'prefeito'].includes(u.perfil));
  const comAcesso = new Set((acessos || []).map((a) => a.auth_user_id));
  $('#acessos-lista').innerHTML = `<div class="tabela-wrap"><table><thead><tr><th>Usuário</th><th>Papel no módulo</th><th>Situação</th><th></th></tr></thead><tbody>
    ${autoAdmin.map((u) => `<tr><td><b>${esc(u.nome)}</b><br><small class="dica">${esc(u.email)}</small></td><td>Administrador geral <small class="dica">(automático: ${esc(u.perfil.replace(/_/g, ' '))})</small></td><td><span class="badge b-verde">Ativo</span></td><td></td></tr>`).join('')}
    ${(acessos || []).map((a) => `<tr><td><b>${esc(a.nome || a.email || a.auth_user_id)}</b><br><small class="dica">${esc(a.email || '')}</small></td>
      <td><select data-papel="${a.id}" style="width:auto">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}"${a.papel === k ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
      <td><button class="btn peq" data-ativo="${a.id}" data-v="${a.ativo}">${a.ativo ? '<span class="badge b-verde">Ativo</span>' : '<span class="badge b-cinza">Bloqueado</span>'}</button></td>
      <td class="acoes"><button class="btn peq perigo" data-rem="${a.id}">Remover</button></td></tr>`).join('')}
    </tbody></table></div>`;
  const opcoes = (usuarios || []).filter((u) => !comAcesso.has(u.auth_user_id) && !['admin_master', 'chefe_de_gabinete', 'prefeito'].includes(u.perfil));
  $('#ac-user').innerHTML = `<option value="">— escolha um usuário do Conecta Gestão —</option>${opcoes.map((u) => `<option value="${u.auth_user_id}">${esc(u.nome)} (${esc(u.email)})</option>`).join('')}`;
  $('#form-acesso').onsubmit = async (e) => {
    e.preventDefault();
    const u = (usuarios || []).find((x) => x.auth_user_id === $('#ac-user').value);
    if (!u) return toast('Escolha um usuário.', true);
    const { error } = await sb.from('natal_acessos').insert({ auth_user_id: u.auth_user_id, nome: u.nome, email: u.email, papel: $('#ac-papel').value });
    if (error) return toast(msgErro(error), true);
    toast('Acesso liberado'); rConfig();
  };
  document.querySelectorAll('[data-papel]').forEach((s) => { s.onchange = async () => { const { error } = await sb.from('natal_acessos').update({ papel: s.value }).eq('id', s.dataset.papel); if (error) toast(msgErro(error), true); else toast('Papel atualizado'); }; });
  document.querySelectorAll('[data-ativo]').forEach((b) => { b.onclick = async () => { const { error } = await sb.from('natal_acessos').update({ ativo: b.dataset.v !== 'true' }).eq('id', b.dataset.ativo); if (error) toast(msgErro(error), true); else rConfig(); }; });
  document.querySelectorAll('[data-rem]').forEach((b) => { b.onclick = async () => { if (!(await confirmar('Remover o acesso deste usuário ao módulo?', 'Remover'))) return; const { error } = await sb.from('natal_acessos').delete().eq('id', b.dataset.rem); if (error) toast(msgErro(error), true); else { toast('Acesso removido'); rConfig(); } }; });
}

iniciar().catch((e) => { console.error(e); $('#sem-acesso-msg').textContent = 'Erro ao iniciar: ' + msgErro(e); mostrarTela('tela-sem-acesso'); });
