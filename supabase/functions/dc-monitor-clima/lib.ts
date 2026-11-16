// Regras puras do monitoramento (sem rede, sem banco) — testáveis isoladamente.
// Defesa Civil de Ivatuba – PR.

export type Nivel = "normal" | "atencao" | "alerta" | "emergencia";
export const NIVEIS: Nivel[] = ["normal", "atencao", "alerta", "emergencia"];
export const ROTULO: Record<Nivel, string> = {
  normal: "NORMAL",
  atencao: "ATENÇÃO",
  alerta: "ALERTA",
  emergencia: "ALERTA MÁXIMO",
};
export const rank = (n: string | null | undefined): number => Math.max(0, NIVEIS.indexOf((n || "normal") as Nivel));
export const maxNivel = (a: Nivel, b: Nivel): Nivel => (rank(a) >= rank(b) ? a : b);

export interface Municipio {
  ibge: string;
  nome: string;
  uf: string;
  lat: number;
  lon: number;
}

export interface AlertaOficial {
  fonte: string; // "Defesa Civil (IDAP)" | "INMET" | "SIMEPAR"
  id: string;
  evento: string;
  titulo: string;
  descricao: string;
  instrucao: string;
  nivel: Nivel; // já convertido para a escala do município
  nivel_origem: string; // como o nível foi obtido
  severidade: string; // texto original (ex.: "Perigo", "Severe")
  inicio: string | null; // ISO
  fim: string | null; // ISO
  casamento: string; // geocode | texto | poligono
}

export interface Observacao {
  estacao: string;
  codigo: string;
  distancia_km: number | null;
  medido_em: string | null; // ISO
  temperatura_c: number | null;
  umidade_pct: number | null;
  chuva_mm_h: number | null;
  vento_kmh: number | null;
  rajada_kmh: number | null;
  pressao_hpa: number | null;
}

export interface PeriodoPrevisao {
  data: string; // dd/mm/aaaa
  periodo: string; // manha | tarde | noite | dia
  resumo: string;
  temp_max: number | null;
  temp_min: number | null;
  int_vento: string;
  dir_vento: string;
  umidade_max: number | null;
  umidade_min: number | null;
}

// ---------------------------------------------------------------- utilidades
export function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
export const lista = <T>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
export function txt(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("#text" in o) return String(o["#text"] ?? "");
    return "";
  }
  return String(v);
}
export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export function limparHtml(s: unknown, max = 700): string {
  const t = String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/** Datas: ISO com fuso; "aaaa-mm-dd hh:mm(:ss)" e "dd/mm/aaaa hh:mm" sem fuso = horário de Brasília. */
export function lerData(s: unknown, hora?: unknown): Date | null {
  let t = String(s ?? "").trim();
  if (!t) return null;
  if (hora != null && String(hora).trim()) t = t.split(/[ T]/)[0] + " " + String(hora).trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${(m[4] || "00").padStart(2, "0")}:${m[5] || "00"}:${m[6] || "00"}-03:00`);
  m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/.exec(t);
  if (m) return new Date(`${m[1]}T${(m[2] || "00").padStart(2, "0")}:${m[3] || "00"}:${m[4] || "00"}-03:00`);
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Ponto dentro de polígono [[lat,lon],...] (ray casting). */
export function dentro(lat: number, lon: number, poli: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [yi, xi] = poli[i], [yj, xj] = poli[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) c = !c;
  }
  return c;
}
/** Polígono CAP: "lat,lon lat,lon ..." */
export function lerPoligonoCap(s: unknown): [number, number][] {
  const pts: [number, number][] = [];
  for (const par of String(s ?? "").trim().split(/\s+/)) {
    const [a, b] = par.split(",").map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) pts.push([a, b]);
  }
  return pts;
}
/** Qualquer texto/GeoJSON com coordenadas: decide a ordem lat/lon pela faixa do Brasil. */
export function paresDeNumeros(v: unknown): [number, number][] {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  const nums = (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const a = nums[i], b = nums[i + 1];
    if (Math.abs(a) <= 35 && Math.abs(b) > 35) pts.push([a, b]);
    else if (Math.abs(b) <= 35 && Math.abs(a) > 35) pts.push([b, a]);
  }
  return pts;
}

/** Nome do município sem casar com nomes maiores (ex.: "Ivatuba" ≠ "Ivatubalândia"). */
function citaMunicipio(texto: string, m: Municipio): boolean {
  const n = norm(m.nome).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z])${n}(\\s*[-/(]\\s*${norm(m.uf)}\\b|[^a-z]|$)`);
  return re.test(norm(texto));
}

// ---------------------------------------------------------------- tipos de risco e orientações
const RISCOS: [RegExp, string][] = [
  [/granizo/, "Granizo"],
  [/tempestade|temporal|convectiv|raios?\b|descargas/, "Tempestade"],
  [/vendaval|ventos? (fortes?|intensos?|costeiros?)|rajada|ventania|tornado|ciclone/, "Ventos fortes / vendaval"],
  [/chuvas? (intensas?|fortes?|volumosas?)|acumulado de chuva|chuva/, "Chuva intensa"],
  [/inundac|enchente|alagament|enxurrada|transbord/, "Alagamento / inundação"],
  [/desliza|movimento de massa/, "Deslizamento"],
  [/baixa umidade|umidade relativa|tempo seco|estiagem|seca/, "Baixa umidade do ar"],
  [/onda de calor|calor|temperaturas? (altas|elevadas)/, "Calor intenso"],
  [/geada|frio|declinio de temperatura|onda de frio/, "Frio / geada"],
  [/incendio|queimada|fogo/, "Risco de incêndio"],
  [/nevoeiro|neblina/, "Nevoeiro"],
];
export function tipoRisco(...textos: unknown[]): string {
  const t = norm(textos.join(" "));
  for (const [re, nome] of RISCOS) if (re.test(t)) return nome;
  return "Evento meteorológico";
}

const ORIENT: Record<string, string> = {
  "Granizo": "Proteja-se em local coberto, afaste-se de janelas e não saia durante a queda de granizo.",
  "Tempestade": "Procure abrigo em local seguro, evite áreas abertas e árvores, e desligue aparelhos elétricos da tomada.",
  "Ventos fortes / vendaval": "Não se abrigue sob árvores, placas ou redes elétricas e recolha objetos soltos do quintal.",
  "Chuva intensa": "Evite áreas de alagamento, não atravesse ruas ou pontes alagadas e fique atento a enxurradas.",
  "Alagamento / inundação": "Afaste-se de rios e áreas baixas; se for orientado, dirija-se ao abrigo mais próximo.",
  "Deslizamento": "Observe rachaduras e inclinações em encostas e saia do local ao primeiro sinal de risco.",
  "Baixa umidade do ar": "Beba bastante água, evite atividades físicas nas horas mais quentes e não faça queimadas.",
  "Calor intenso": "Hidrate-se, evite exposição ao sol entre 10h e 16h e atenção redobrada com idosos e crianças.",
  "Frio / geada": "Agasalhe-se, proteja crianças, idosos e animais e evite aquecedores em ambientes fechados.",
  "Risco de incêndio": "Não faça queimadas e comunique focos de incêndio pelo 193.",
  "Nevoeiro": "Reduza a velocidade e use farol baixo ao dirigir.",
};
export function orientacao(nivel: Nivel, riscos: string[]): string {
  if (nivel === "normal") return "Sem riscos meteorológicos relevantes identificados. Em emergências ligue 199 (Defesa Civil) ou 193 (Bombeiros).";
  const partes = riscos.map((r) => ORIENT[r]).filter(Boolean);
  const base = partes.length ? partes.slice(0, 2).join(" ") : "Acompanhe as orientações da Defesa Civil.";
  const contato = " Em emergências ligue 199 (Defesa Civil) ou 193 (Bombeiros).";
  if (nivel === "emergencia") return "Situação grave: siga imediatamente as orientações da Defesa Civil. " + base + contato;
  return base + contato;
}

// ---------------------------------------------------------------- CAP 1.2 (IDAP e INMET)
export interface CapInfo {
  identifier: string;
  sender: string;
  sent: string;
  status: string;
  msgType: string;
  references: string;
  info: {
    language: string; event: string; urgency: string; severity: string; certainty: string;
    effective: string; onset: string; expires: string; senderName: string; headline: string;
    description: string; instruction: string; web: string;
    params: Record<string, string>;
    areas: { desc: string; poligonos: [number, number][][]; geocodes: [string, string][] }[];
  } | null;
}

/** Converte um <alert> já lido pelo fast-xml-parser (removeNSPrefix) em objeto simples. */
export function lerCap(alert: Record<string, unknown>): CapInfo {
  const infos = lista(alert.info as Record<string, unknown> | Record<string, unknown>[]).map((inf) => {
    const params: Record<string, string> = {};
    for (const p of lista(inf.parameter as Record<string, unknown>[])) params[txt(p.valueName)] = txt(p.value);
    const areas = lista(inf.area as Record<string, unknown>[]).map((ar) => ({
      desc: txt(ar.areaDesc),
      poligonos: lista(ar.polygon as unknown[]).map((p) => lerPoligonoCap(txt(p))).filter((p) => p.length >= 3),
      geocodes: lista(ar.geocode as Record<string, unknown>[]).map((g) => [txt(g.valueName), txt(g.value)] as [string, string]),
    }));
    const f = (k: string) => txt(inf[k]);
    return {
      language: f("language"), event: f("event"), urgency: f("urgency"), severity: f("severity"),
      certainty: f("certainty"), effective: f("effective"), onset: f("onset"), expires: f("expires"),
      senderName: f("senderName"), headline: f("headline"), description: f("description"),
      instruction: f("instruction"), web: f("web"), params, areas,
    };
  });
  const pt = infos.filter((i) => norm(i.language).startsWith("pt"));
  const g = (k: string) => txt(alert[k]);
  return {
    identifier: g("identifier"), sender: g("sender"), sent: g("sent"), status: g("status"),
    msgType: g("msgType"), references: g("references"), info: (pt[0] || infos[0] || null),
  };
}

/** Verifica se o alerta CAP abrange o município: código IBGE, nome, ou polígono que contém a sede. */
export function capAtinge(cap: CapInfo, m: Municipio): string | null {
  const i = cap.info;
  if (!i) return null;
  const ib6 = m.ibge.slice(0, 6);
  for (const a of i.areas) {
    for (const [, v] of a.geocodes) {
      for (const cod of String(v).match(/\d{6,7}/g) || []) if (cod === m.ibge || cod === ib6) return "geocode";
    }
  }
  const params = Object.values(i.params).join(" ");
  if (new RegExp(`\\(${m.ibge}\\)|\\b${m.ibge}\\b`).test(params)) return "geocode";
  if (i.areas.some((a) => a.poligonos.some((p) => dentro(m.lat, m.lon, p)))) return "poligono";
  if (citaMunicipio(i.areas.map((a) => a.desc).join(" ; ") + " ; " + params, m)) return "texto";
  return null;
}

/** Nível da Defesa Civil (IDAP): escala da Portaria MIDR (baixo…extremo) ou severidade CAP. */
export function nivelIdap(info: NonNullable<CapInfo["info"]>): { nivel: Nivel; origem: string } {
  const escala: [RegExp, Nivel][] = [
    [/\bextremo\b/, "emergencia"], [/\bmuito alto\b/, "emergencia"],
    [/\bsevero\b/, "alerta"], [/\balto\b/, "alerta"],
    [/\bmoderado\b|\bmedio\b/, "atencao"], [/\bbaixo\b/, "atencao"],
  ];
  for (const [k, v] of Object.entries(info.params)) {
    if (/nivel|grau|level|severidade|risco/.test(norm(k))) {
      for (const [re, n] of escala) if (re.test(norm(v))) return { nivel: n, origem: `parâmetro ${k}: ${v}` };
    }
  }
  const t = norm(info.headline + " " + info.event);
  const m = /\b(nivel|alerta|risco|grau)\s*:?\s*(de\s+)?(extremo|muito alto|severo|alto|moderado|medio|baixo)\b/.exec(t);
  if (m) for (const [re, n] of escala) if (re.test(m[3])) return { nivel: n, origem: `texto: ${m[0]}` };
  const sev: Record<string, Nivel> = { minor: "atencao", moderate: "atencao", severe: "alerta", extreme: "emergencia" };
  return { nivel: sev[norm(info.severity)] || "atencao", origem: `severidade CAP: ${info.severity || "ausente"}` };
}

/** Nível do INMET: Perigo Potencial (amarelo) / Perigo (laranja) / Grande Perigo (vermelho). */
export function nivelInmet(texto: string, severidade = "", cor = ""): { nivel: Nivel; origem: string } {
  const t = norm(texto + " " + severidade);
  if (/grande perigo/.test(t)) return { nivel: "emergencia", origem: "INMET: Grande Perigo" };
  if (/perigo potencial/.test(t)) return { nivel: "atencao", origem: "INMET: Perigo Potencial" };
  if (/\bperigo\b/.test(t)) return { nivel: "alerta", origem: "INMET: Perigo" };
  const c = norm(cor).replace("#", "");
  if (/^(ff0000|e60000|ff1a1a|c00000)/.test(c) || /vermelh/.test(c)) return { nivel: "emergencia", origem: "INMET: cor vermelha" };
  if (/^(ffa500|f96602|ff8c00|ff7f00|ff9900)/.test(c) || /laranja/.test(c)) return { nivel: "alerta", origem: "INMET: cor laranja" };
  if (/^(ffff00|fffe00|ffd700|ffff33)/.test(c) || /amarel/.test(c)) return { nivel: "atencao", origem: "INMET: cor amarela" };
  const sev: Record<string, Nivel> = { minor: "atencao", moderate: "atencao", severe: "alerta", extreme: "emergencia" };
  return { nivel: sev[norm(severidade)] || "atencao", origem: `INMET: severidade ${severidade || "ausente"}` };
}

/** Filtra CAPs (cancelados, vencidos, testes, outros municípios) e converte em AlertaOficial. */
export function capsParaAlertas(
  caps: CapInfo[], fonte: string, m: Municipio, agora: Date,
  fnNivel: (c: CapInfo) => { nivel: Nivel; origem: string },
): AlertaOficial[] {
  const cancelados = new Set<string>();
  for (const c of caps) {
    if (norm(c.msgType) === "cancel") {
      for (const ref of c.references.split(/\s+/).filter(Boolean)) {
        const p = ref.split(",");
        cancelados.add(p.length >= 2 ? p[1] : ref);
      }
    }
  }
  const vistos = new Set<string>();
  const out: AlertaOficial[] = [];
  for (const c of caps) {
    const i = c.info;
    if (!i || norm(c.msgType) === "cancel") continue;
    if (c.status && norm(c.status) !== "actual") continue;
    if (cancelados.has(c.identifier) || vistos.has(c.identifier)) continue;
    const fim = lerData(i.expires);
    if (fim && fim < agora) continue;
    const casou = capAtinge(c, m);
    if (!casou) continue;
    vistos.add(c.identifier);
    const { nivel, origem } = fnNivel(c);
    out.push({
      fonte, id: c.identifier, evento: i.event, titulo: limparHtml(i.headline || i.event, 240),
      descricao: limparHtml(i.description), instrucao: limparHtml(i.instruction, 500),
      nivel, nivel_origem: origem, severidade: i.severity,
      inicio: iso(lerData(i.onset || i.effective || c.sent)), fim: iso(fim), casamento: casou,
    });
  }
  return out;
}

/** INMET /avisos/ativos (JSON). Estrutura sem documentação estável: leitura tolerante. */
export function inmetJsonParaAlertas(d: unknown, m: Municipio, agora: Date): { alertas: AlertaOficial[]; total: number } {
  const itens: Record<string, unknown>[] = [];
  const coletar = (v: unknown) => {
    if (Array.isArray(v)) v.forEach((x) => x && typeof x === "object" && itens.push(x as Record<string, unknown>));
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => Array.isArray(x) && coletar(x));
  };
  coletar(d);
  const out: AlertaOficial[] = [];
  const vistos = new Set<string>();
  for (const a of itens) {
    const geo = Array.isArray(a.geocodes) ? (a.geocodes as unknown[]).join(",") : String(a.geocodes ?? a.geocode ?? "");
    const munTxt = String(a.municipios ?? a.cidades ?? "");
    let casou: string | null = null;
    if ((geo.match(/\d{6,7}/g) || []).some((c) => c === m.ibge || c === m.ibge.slice(0, 6)) || munTxt.includes(`(${m.ibge})`)) casou = "geocode";
    if (!casou) {
      const poli = paresDeNumeros(a.poligono ?? a.polygon ?? a.coordenadas ?? "");
      if (poli.length >= 3 && dentro(m.lat, m.lon, poli)) casou = "poligono";
    }
    if (!casou && citaMunicipio(munTxt, m)) casou = "texto";
    if (!casou) continue;
    const ini = lerData(a.inicio) || lerData(a.data_inicio, a.hora_inicio);
    const fim = lerData(a.fim) || lerData(a.data_fim, a.hora_fim);
    if (fim && fim < agora) continue;
    const id = String(a.id ?? a.codigo ?? "");
    if (id && vistos.has(id)) continue;
    if (id) vistos.add(id);
    const evento = String(a.descricao ?? a.evento ?? "Aviso meteorológico");
    const sev = String(a.severidade ?? a.nivel ?? "");
    const { nivel, origem } = nivelInmet(evento + " " + sev, "", String(a.aviso_cor ?? a.cor ?? ""));
    out.push({
      fonte: "INMET", id, evento, titulo: limparHtml(evento, 240), descricao: limparHtml(a.riscos ?? ""),
      instrucao: limparHtml(a.instrucoes ?? "", 500), nivel, nivel_origem: origem, severidade: sev,
      inicio: iso(ini), fim: iso(fim), casamento: casou,
    });
  }
  return { alertas: out, total: itens.length };
}

// ---------------------------------------------------------------- INMET estação e previsão
/** /estacao/proxima/{ibge}: valores em m/s convertidos para km/h; HR_MEDICAO em UTC (ex.: "1600"). */
export function lerEstacao(d: Record<string, unknown> | null): Observacao | null {
  if (!d || typeof d !== "object") return null;
  const e = (d.estacao || {}) as Record<string, unknown>;
  const x = (d.dados || {}) as Record<string, unknown>;
  if (!Object.keys(x).length) return null;
  let medido: string | null = null;
  const dt = String(x.DT_MEDICAO ?? ""), hr = String(x.HR_MEDICAO ?? "").padStart(4, "0");
  if (/^\d{4}-\d{2}-\d{2}$/.test(dt) && /^\d{4}$/.test(hr)) medido = `${dt}T${hr.slice(0, 2)}:${hr.slice(2)}:00Z`;
  const kmh = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n * 3.6 * 10) / 10; };
  return {
    estacao: String(e.NOME ?? x.DC_NOME ?? ""), codigo: String(e.CODIGO ?? x.CD_ESTACAO ?? ""),
    distancia_km: num(e.DISTANCIA_EM_KM), medido_em: medido,
    temperatura_c: num(x.TEM_INS), umidade_pct: num(x.UMD_INS), chuva_mm_h: num(x.CHUVA),
    vento_kmh: kmh(x.VEN_VEL), rajada_kmh: kmh(x.VEN_RAJ), pressao_hpa: num(x.PRE_INS),
  };
}

/** /previsao/{ibge}: { "ibge": { "dd/mm/aaaa": { manha:{...}, tarde:{...}, noite:{...} } | {...} } } */
export function lerPrevisao(d: unknown, ibge: string): PeriodoPrevisao[] {
  const raiz = (d && typeof d === "object" ? (d as Record<string, unknown>)[ibge] : null) as Record<string, unknown> | null;
  if (!raiz) return [];
  const out: PeriodoPrevisao[] = [];
  const conv = (data: string, periodo: string, p: Record<string, unknown>): PeriodoPrevisao => ({
    data, periodo, resumo: String(p.resumo ?? ""), temp_max: num(p.temp_max), temp_min: num(p.temp_min),
    int_vento: String(p.int_vento ?? ""), dir_vento: String(p.dir_vento ?? ""),
    umidade_max: num(p.umidade_max), umidade_min: num(p.umidade_min),
  });
  for (const [data, v] of Object.entries(raiz)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    let achou = false;
    for (const per of ["manha", "tarde", "noite"]) {
      if (o[per] && typeof o[per] === "object") { out.push(conv(data, per, o[per] as Record<string, unknown>)); achou = true; }
    }
    if (!achou && ("resumo" in o)) out.push(conv(data, "dia", o));
  }
  return out;
}

// ---------------------------------------------------------------- classificação
export interface Classificacao {
  nivel: Nivel;
  motivos: string[];
  riscos: string[];
  alertas_vigentes: AlertaOficial[]; // alertas que entram na conta agora
  alertas_futuros: AlertaOficial[];  // oficiais previstos (mais de 6 h à frente)
}

/**
 * Regras (documentadas no guia):
 *  - ALERTA e ALERTA MÁXIMO só vêm de alertas OFICIAIS (Defesa Civil/IDAP, INMET, SIMEPAR).
 *  - Alerta oficial vigente ou que começa em até 6 h conta com o nível oficial.
 *  - Alerta oficial que começa entre 6 h e 24 h eleva no máximo para ATENÇÃO.
 *  - Previsão do INMET e medição da estação elevam no máximo para ATENÇÃO
 *    (nunca emergência com base em previsão isolada).
 */
export function classificar(p: {
  alertas: AlertaOficial[]; observacao: Observacao | null; previsao: PeriodoPrevisao[]; agora: Date;
}): Classificacao {
  const { agora } = p;
  let nivel: Nivel = "normal";
  const motivos: string[] = [];
  const riscos = new Set<string>();
  const vigentes: AlertaOficial[] = [], futuros: AlertaOficial[] = [];
  const H = 3600e3;

  for (const a of p.alertas) {
    const ini = a.inicio ? new Date(a.inicio) : null;
    const fim = a.fim ? new Date(a.fim) : null;
    if (fim && fim < agora) continue;
    const faltam = ini ? ini.getTime() - agora.getTime() : 0;
    if (faltam > 24 * H) { futuros.push(a); continue; }
    let n = a.nivel;
    let quando = "vigente";
    if (faltam > 6 * H) { n = rank(n) > rank("atencao") ? "atencao" : n; quando = "previsto"; futuros.push(a); }
    else { vigentes.push(a); if (faltam > 0) quando = "previsto para as próximas horas"; }
    nivel = maxNivel(nivel, n);
    riscos.add(tipoRisco(a.evento, a.titulo));
    motivos.push(`${a.fonte}: ${a.titulo || a.evento} (${a.nivel_origem}; ${quando}) → ${ROTULO[n]}`);
  }

  const o = p.observacao;
  if (o && o.medido_em && agora.getTime() - new Date(o.medido_em).getTime() <= 3 * H) {
    const longe = o.distancia_km != null ? ` a ${o.distancia_km} km` : "";
    if ((o.chuva_mm_h ?? 0) >= 20) {
      nivel = maxNivel(nivel, "atencao"); riscos.add("Chuva intensa");
      motivos.push(`Estação INMET ${o.estacao}${longe}: ${o.chuva_mm_h} mm na última hora → ATENÇÃO`);
    }
    if ((o.rajada_kmh ?? 0) >= 60) {
      nivel = maxNivel(nivel, "atencao"); riscos.add("Ventos fortes / vendaval");
      motivos.push(`Estação INMET ${o.estacao}${longe}: rajada de ${o.rajada_kmh} km/h → ATENÇÃO`);
    }
  }

  // Previsão: períodos de hoje (a partir do atual) e a manhã seguinte
  const hojeBr = new Date(agora.getTime() - 3 * H);
  const dd = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  const hoje = dd(hojeBr), amanha = dd(new Date(hojeBr.getTime() + 24 * H));
  const horaBr = hojeBr.getUTCHours();
  const ordem: Record<string, number> = { manha: 0, tarde: 1, noite: 2, dia: 0 };
  const atual = horaBr < 12 ? 0 : horaBr < 18 ? 1 : 2;
  const relevantes = p.previsao.filter((x) =>
    (x.data === hoje && (x.periodo === "dia" || ordem[x.periodo] >= atual)) ||
    (x.data === amanha && (x.periodo === "manha" || x.periodo === "dia")));
  for (const x of relevantes) {
    const r = norm(x.resumo), v = norm(x.int_vento);
    const severo = /tempestade|temporal|granizo|chuva forte|chuvas fortes|chuva intensa|chuvas intensas|rajada|ventania/.test(r);
    const chuva = /chuva|pancada/.test(r) && !/isolad|possibilidade|fraca|chuvisco|garoa|sem chuva/.test(r);
    const vento = /\bforte|intens/.test(v);
    if (severo || chuva || vento) {
      nivel = maxNivel(nivel, "atencao");
      riscos.add(vento && !severo && !chuva ? "Ventos fortes / vendaval" : tipoRisco(x.resumo));
      motivos.push(`Previsão INMET ${x.data} (${x.periodo}): ${x.resumo}${vento ? `, ventos ${x.int_vento}` : ""} → ATENÇÃO`);
    }
  }

  if (!motivos.length) motivos.push("Nenhum alerta oficial vigente e nenhuma condição de risco na previsão ou nas medições.");
  return { nivel, motivos, riscos: [...riscos], alertas_vigentes: vigentes, alertas_futuros: futuros };
}

// ---------------------------------------------------------------- decisão do status aplicado
export interface EstadoAnterior {
  nivel_aplicado: string | null;
  rebaixamento_nivel: string | null;
  rebaixamento_contagem: number;
  manual_ativo: boolean;
  manual_status: string | null;
  manual_ate: string | null;
}
export interface Decisao {
  aplicado: Nivel;
  origem: "automatico" | "manual";
  motivo: string;
  rebaixamento_nivel: Nivel | null;
  rebaixamento_contagem: number;
  manual_expirou: boolean;
  manual_superado: boolean;
}

/**
 *  - Falha nas fontes de alertas: nunca rebaixa (não vai para NORMAL por falha).
 *  - Elevação: imediata.
 *  - Rebaixamento: só após 2 consultas seguidas confirmando o nível menor (evita oscilação e mensagens repetidas).
 *  - Manual: prevalece até expirar; se a automação identificar nível OFICIAL maior, eleva mesmo assim.
 */
export function decidir(p: {
  calculado: Nivel; anterior: EstadoAnterior; fontesAlertasOk: boolean; nivelOficial: Nivel; agora: Date;
}): Decisao {
  const ant = (NIVEIS.includes(p.anterior.nivel_aplicado as Nivel) ? p.anterior.nivel_aplicado : "normal") as Nivel;
  let manual = p.anterior.manual_ativo && NIVEIS.includes(p.anterior.manual_status as Nivel);
  let expirou = false;
  if (manual && p.anterior.manual_ate && new Date(p.anterior.manual_ate) <= p.agora) { manual = false; expirou = true; }

  if (manual) {
    const ms = p.anterior.manual_status as Nivel;
    if (rank(p.nivelOficial) > rank(ms)) {
      return { aplicado: p.nivelOficial, origem: "automatico", motivo: `Alerta oficial de nível ${ROTULO[p.nivelOficial]} supera o status manual (${ROTULO[ms]}).`,
        rebaixamento_nivel: null, rebaixamento_contagem: 0, manual_expirou: false, manual_superado: true };
    }
    return { aplicado: ms, origem: "manual", motivo: "Status definido manualmente pelo administrador.",
      rebaixamento_nivel: null, rebaixamento_contagem: 0, manual_expirou: false, manual_superado: false };
  }

  const calc = p.calculado;
  if (rank(calc) >= rank(ant)) {
    return { aplicado: calc, origem: "automatico", motivo: rank(calc) > rank(ant) ? "Elevação imediata do nível." : "Nível mantido.",
      rebaixamento_nivel: null, rebaixamento_contagem: 0, manual_expirou: expirou, manual_superado: false };
  }
  if (!p.fontesAlertasOk) {
    return { aplicado: ant, origem: "automatico", motivo: "Nível mantido: falha de comunicação com fonte oficial de alertas (não rebaixa sem dados completos).",
      rebaixamento_nivel: null, rebaixamento_contagem: 0, manual_expirou: expirou, manual_superado: false };
  }
  const cont = p.anterior.rebaixamento_nivel === calc ? p.anterior.rebaixamento_contagem + 1 : 1;
  if (cont >= 2) {
    return { aplicado: calc, origem: "automatico", motivo: "Rebaixamento confirmado em 2 consultas seguidas.",
      rebaixamento_nivel: null, rebaixamento_contagem: 0, manual_expirou: expirou, manual_superado: false };
  }
  return { aplicado: ant, origem: "automatico", motivo: `Nível menor (${ROTULO[calc]}) aguardando confirmação na próxima consulta.`,
    rebaixamento_nivel: calc, rebaixamento_contagem: cont, manual_expirou: expirou, manual_superado: false };
}

// ---------------------------------------------------------------- mensagens
export function fmtBr(isoStr: string | null): string {
  if (!isoStr) return "";
  const d = new Date(new Date(isoStr).getTime() - 3 * 3600e3);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function mensagemStatus(nivel: Nivel, c: Classificacao): string {
  if (nivel === "normal") return "Município sem alertas ativos. Condições meteorológicas sem riscos relevantes.";
  const a = [...c.alertas_vigentes].sort((x, y) => rank(y.nivel) - rank(x.nivel))[0];
  const risco = c.riscos[0] || "Evento meteorológico";
  if (a) {
    const ate = a.fim ? ` até ${fmtBr(a.fim)}` : "";
    return `${ROTULO[nivel]}: ${a.titulo || risco} — ${a.fonte}${ate}.`;
  }
  return `${ROTULO[nivel]}: possibilidade de ${risco.toLowerCase()} nas próximas horas. Fique atento.`;
}

export function chaveEvento(c: Classificacao): string {
  const ids = c.alertas_vigentes.map((a) => `${a.fonte}:${a.id}`).sort();
  return ids.length ? ids.join("|") : "previsao:" + c.riscos.slice().sort().join(",");
}

export type AcaoNotificacao = "escalada" | "encerramento" | null;
/**
 * Avisa a população somente quando:
 *  - o nível sobe e fica >= mínimo configurado, acima do último nível já avisado (escalada);
 *  - o nível cai abaixo do mínimo depois de um aviso (encerramento).
 * Repetições do mesmo evento/nível não geram nova mensagem.
 */
export function decidirNotificacao(p: { aplicado: Nivel; ultimoNotificado: string | null; minimo: Nivel }): AcaoNotificacao {
  const ult = (p.ultimoNotificado || "normal") as Nivel;
  if (rank(p.aplicado) >= rank(p.minimo) && rank(p.aplicado) > rank(ult)) return "escalada";
  if (rank(ult) >= rank(p.minimo) && rank(p.aplicado) < rank(p.minimo)) return "encerramento";
  return null;
}

export function textoPopulacao(acao: AcaoNotificacao, nivel: Nivel, c: Classificacao, municipio: string): string {
  const cab = `🚨 *DEFESA CIVIL ${municipio.toUpperCase()}*`;
  if (acao === "encerramento") {
    return `${cab}\n\n✅ *ALERTA ENCERRADO*\n\nAs condições meteorológicas voltaram ao nível ${ROTULO[nivel]}. Continue acompanhando os canais oficiais.\n\n📞 199 — Defesa Civil\n🚒 193 — Corpo de Bombeiros`;
  }
  const ico = nivel === "emergencia" ? "🔴" : nivel === "alerta" ? "🟠" : "🟡";
  return `${cab}\n\n${ico} *${ROTULO[nivel]}*\n\n${mensagemStatus(nivel, c)}\n\n⚠️ *Orientações:* ${orientacao(nivel, c.riscos)}\n\n_Prevenir é proteger._`;
}
