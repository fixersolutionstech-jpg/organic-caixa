/**
 * ORGANIC — Backend (Google Apps Script)
 * Recebe registos da PWA (caixa físico) e do Termux (SMS), guarda na Sheet
 * e devolve pendentes, saldos e movimentos recentes.
 *
 * Instalação:
 * 1. Cria uma Google Sheet nova ("Organic — Movimentos").
 * 2. Extensões → Apps Script → cola este ficheiro.
 * 3. Definições do projecto → Propriedades do script → adiciona TOKEN = <uma senha longa>.
 * 4. Implementar → Nova implementação → Aplicação Web
 *      Executar como: Eu | Quem tem acesso: Qualquer pessoa
 * 5. Copia o URL /exec para as Definições da PWA (junto com o TOKEN).
 */

const SHEET = 'Movimentos';
const SALDOS = 'Saldos'; // saldos do Organic (Contas), copiados pela ponte.py — a PWA só os mostra
const HEAD = ['id', 'data', 'tipo', 'valor', 'conta', 'conta_destino', 'categoria',
  'descricao', 'origem', 'estado', 'sms', 'criado_em', 'actualizado_em'];
const COL = Object.fromEntries(HEAD.map((h, i) => [h, i]));

/* ---------- utilitários ---------- */
function sh_() {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(SHEET);
  if (!s) {
    s = ss.insertSheet(SHEET);
    s.appendRow(HEAD);
    s.setFrozenRows(1);
    s.getRange('A:B').setNumberFormat('@'); // id e data como texto
  }
  return s;
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function auth_(t) {
  const tok = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !!tok && t === tok;
}
function agora_() { return Utilities.formatDate(new Date(), 'Africa/Maputo', "yyyy-MM-dd'T'HH:mm:ss"); }
function hoje_() { return Utilities.formatDate(new Date(), 'Africa/Maputo', 'yyyy-MM-dd'); }
function dataTxt_(v) {
  return v instanceof Date ? Utilities.formatDate(v, 'Africa/Maputo', 'yyyy-MM-dd') : String(v || '');
}
function uid_() { return Utilities.getUuid().slice(0, 8); }
function linha_(id) {
  const s = sh_();
  const f = s.getRange('A:A').createTextFinder(String(id)).matchEntireCell(true).findNext();
  return f ? f.getRow() : 0;
}
function obj_(r) {
  const o = {};
  HEAD.forEach((h, i) => o[h] = r[i]);
  o.data = dataTxt_(o.data);
  o.valor = Number(o.valor) || 0;
  return o;
}

/* ---------- entradas HTTP ---------- */
/** Corre uma vez no editor para o Google pedir as permissões (Sheets) e criar a folha. */
function autorizar() {
  const s = sh_();
  Logger.log('OK — folha "%s" pronta, %s linha(s). TOKEN definido: %s',
    SHEET, s.getLastRow(), !!PropertiesService.getScriptProperties().getProperty('TOKEN'));
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!auth_(p.token)) return out_({ ok: false, erro: 'token inválido' });
  if (p.acao === 'listar') return out_(listar_());
  if (p.acao === 'exportar') return out_(exportar_());
  return out_({ ok: true, servico: 'organic' });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, erro: 'json inválido' }); }
  if (!auth_(b.token)) return out_({ ok: false, erro: 'token inválido' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    switch (b.acao) {
      case 'registar': return out_(registar_(b.mov || {}, 'manual', 'aprovado'));
      case 'aprovar':  return out_(actualizar_(b.id, b.mov || {}, 'aprovado'));
      case 'rejeitar': return out_(actualizar_(b.id, {}, 'rejeitado'));
      case 'sms':      return out_(sms_(b.texto || '', b.remetente || ''));
      case 'importado': return out_(importado_(b.ids || []));
      case 'saldos':   return out_(guardarSaldos_(b.saldos || {}));
      default:         return out_({ ok: false, erro: 'acção desconhecida' });
    }
  } finally {
    lock.releaseLock();
  }
}

/* ---------- acções ---------- */
function registar_(m, origem, estado) {
  const id = m.id || uid_();
  if (linha_(id)) return { ok: true, id, duplicado: true }; // idempotente (fila offline)
  const t = agora_();
  sh_().appendRow([
    id, m.data || hoje_(), m.tipo || 'saida', Number(m.valor) || 0,
    m.conta || 'Caixa', m.conta_destino || '', m.categoria || 'Outros',
    m.descricao || '', origem, estado, m.sms || '', t, t
  ]);
  return { ok: true, id };
}

function actualizar_(id, m, estado) {
  const r = linha_(id);
  if (!r) return { ok: false, erro: 'movimento não encontrado' };
  const s = sh_();
  const row = s.getRange(r, 1, 1, HEAD.length).getValues()[0];
  ['data', 'tipo', 'valor', 'conta', 'conta_destino', 'categoria', 'descricao'].forEach(k => {
    if (m[k] !== undefined && m[k] !== null) row[COL[k]] = k === 'valor' ? Number(m[k]) || 0 : m[k];
  });
  row[COL.estado] = estado;
  row[COL.actualizado_em] = agora_();
  s.getRange(r, 1, 1, HEAD.length).setValues([row]);
  return { ok: true, id };
}

function listar_() {
  const s = sh_();
  const n = s.getLastRow();
  const rows = n > 1 ? s.getRange(2, 1, n - 1, HEAD.length).getValues().map(obj_) : [];
  const pendentes = rows.filter(r => r.estado === 'pendente');
  const feitos = rows.filter(r => r.estado === 'aprovado' || r.estado === 'importado');
  const recentes = feitos.slice().sort((a, b) => (b.data + b.criado_em).localeCompare(a.data + a.criado_em)).slice(0, 40);
  const sd = lerSaldos_();
  return { ok: true, pendentes, saldos: sd.saldos, saldos_em: sd.em, por_importar: rows.filter(r => r.estado === 'aprovado').length, recentes };
}

/* Aprovados na PWA ainda não passados ao Organic — usado pela ponte.py */
function exportar_() {
  const s = sh_();
  const n = s.getLastRow();
  const rows = n > 1 ? s.getRange(2, 1, n - 1, HEAD.length).getValues().map(obj_) : [];
  return { ok: true, movimentos: rows.filter(r => r.estado === 'aprovado') };
}

/* A ponte marca como 'importado' o que já foi proposto ao Organic (folha Pendentes) */
function importado_(ids) {
  let n = 0;
  ids.forEach(id => {
    const r = linha_(id);
    if (!r) return;
    const s = sh_();
    s.getRange(r, COL.estado + 1).setValue('importado');
    s.getRange(r, COL.actualizado_em + 1).setValue(agora_());
    n++;
  });
  return { ok: true, marcados: n };
}

function saldosSh_() {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(SALDOS);
  if (!s) { s = ss.insertSheet(SALDOS); s.appendRow(['conta', 'saldo', 'actualizado_em']); s.setFrozenRows(1); }
  return s;
}
function guardarSaldos_(saldos) {
  const s = saldosSh_();
  if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, 3).clearContent();
  const t = agora_();
  const linhas = Object.keys(saldos).map(c => [c, Number(saldos[c]) || 0, t]);
  if (linhas.length) s.getRange(2, 1, linhas.length, 3).setValues(linhas);
  return { ok: true, contas: linhas.length };
}
function lerSaldos_() {
  const s = saldosSh_();
  const n = s.getLastRow();
  const saldos = {};
  let em = '';
  if (n > 1) s.getRange(2, 1, n - 1, 3).getValues().forEach(r => { saldos[r[0]] = Number(r[1]) || 0; em = r[2] instanceof Date ? Utilities.formatDate(r[2], 'Africa/Maputo', "yyyy-MM-dd'T'HH:mm") : String(r[2]); });
  return { saldos, em };
}

/* ---------- SMS (Termux) ----------
 * Guarda o SMS como PENDENTE com uma sugestão de classificação (o Rei aprova/corrige na PWA).
 * O id vem do código da transacção (M-Pesa, e-Mola, Ref do Credelec) ou de um hash do texto:
 * reenviar o mesmo SMS nunca duplica.
 * Reconhece: M-Pesa (levantaste, depositaste, transferiste, recebeste, compra), e-Mola (pagamento),
 * STD Bank (débito/crédito + comissão e imposto de selo), Credelec (STD, M-Pesa, e-Mola), TMCEL voucher.
 * Levantamento/depósito = transferência Caixa<->M-Pesa (a taxa vai à parte).
 */
function sms_(texto, remetente) {
  const sug = parseSMS_(texto, remetente);
  sug.sms = texto;
  const taxa = sug.taxa; delete sug.taxa;
  const r = registar_(sug, 'sms', 'pendente');
  r.resumo = `${sug.valor || '?'} MZN · ${sug.conta} · ${sug.tipo === 'entrada' ? 'entrada' : sug.tipo === 'transferencia' ? 'transferência' : 'saída'}`;
  if (taxa > 0 && !r.duplicado) { // a taxa vem no SMS: movimento próprio, para aprovar à parte
    const c = sug.tipo === 'transferencia' ? 'M-Pesa' : sug.conta;
    registar_({ id: sug.id + '-tx', data: sug.data, tipo: 'saida', valor: taxa, conta: c, categoria: 'Taxas',
      descricao: 'Taxa ' + c, sms: texto }, 'sms', 'pendente');
    r.taxa = taxa;
  }
  return r;
}

/** "1,530.00" (M-Pesa) e "10,00" (banco) -> número */
function num_(s) {
  s = String(s).replace(/\s/g, '');
  const p = s.lastIndexOf('.'), v = s.lastIndexOf(',');
  if (p >= 0 && v >= 0) {
    const dec = p > v ? '.' : ',';
    s = dec === '.' ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (v >= 0) {
    s = /,\d{2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (p >= 0 && /^\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace('.', '');
  }
  return Number(s) || 0;
}
function iso_(d, m, a) {
  a = Number(a); if (a < 100) a += 2000;
  d = Number(d); m = Number(m);
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  return a + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}
function dataSMS_(t) {
  let m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/) || t.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);
  let d = m ? iso_(m[1], m[2], m[3]) : '';
  if (!d) { m = t.match(/\bRef:?\s*(20\d{2})(\d{2})(\d{2})\d{6,}/i); d = m ? iso_(m[3], m[2], m[1]) : ''; }
  return d || hoje_();
}
function hash_(t) {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(36);
}
/** soma de taxa/comissão/imposto de selo ("a taxa foi de 10.00MT", "Comissao: 0.00MT") */
function taxas_(t) {
  let s = 0, m;
  const re = /(?:taxa|comiss[aã]o|imposto de selo)[^\d\n]{0,20}(\d[\d.,]*)\s*MT/gi;
  while ((m = re.exec(t))) s += num_(m[1]);
  return Math.round(s * 100) / 100;
}

function parseSMS_(texto, remetente) {
  const t = String(texto);
  const U = (String(remetente) + ' ' + t).toUpperCase();
  const conta = /STD\s*BANK|STANDARD BANK|BCI|MILLENNIUM|ABSA|\bBIM\b/.test(U) ? 'Banco'
    : /E-?MOLA|ID DA TRANSACAO/.test(U) ? 'e-Mola' : 'M-Pesa';
  const cod = (t.match(/Confirmado\s+([A-Z0-9]{8,})/) || t.match(/ID da Transacao:\s*([A-Z0-9.]+)/i)
    || t.match(/\bRef:?\s*(\d{12,})/i) || [])[1];
  const o = { id: cod ? String(cod).toLowerCase().replace(/\.$/, '') : hash_(t), data: dataSMS_(t), tipo: 'saida', valor: 0, conta,
    taxa: taxas_(t), categoria: 'Outros', descricao: '' };
  let m;
  if (/credelec|val energia/i.test(t) && (m = t.match(/Total Pago:?\s*([\d.,]+)/i))) {
    o.valor = num_(m[1]); o.categoria = 'Casa'; o.descricao = 'Credelec (energia)'; o.taxa = 0;
  } else if (/voucher/i.test(t) && (m = t.match(/Debit amount\s*([\d.,]+)\s*MT/i))) {
    o.valor = num_(m[1]); o.categoria = 'Comunicação'; o.descricao = 'Recarga TMCEL';
  } else if ((m = t.match(/levantaste\s+([\d.,]+)\s*MT/i))) {
    o.valor = num_(m[1]); o.tipo = 'transferencia'; o.conta = 'M-Pesa'; o.conta_destino = 'Caixa'; o.categoria = ''; o.descricao = 'Levantamento M-Pesa';
  } else if ((m = t.match(/depositaste[^\d]{0,30}([\d.,]+)\s*MT/i))) {
    o.valor = num_(m[1]); o.tipo = 'transferencia'; o.conta = 'Caixa'; o.conta_destino = 'M-Pesa'; o.categoria = ''; o.descricao = 'Depósito M-Pesa';
  } else if ((m = t.match(/transferiste\s+([\d.,]+)\s*MT/i))) {
    o.valor = num_(m[1]); o.descricao = 'Transferência M-Pesa';
  } else if ((m = t.match(/recebeste\s+([\d.,]+)\s*MT/i))) {
    o.valor = num_(m[1]); o.tipo = 'entrada'; o.descricao = 'Recebido M-Pesa'; o.taxa = 0;
  } else if ((m = t.match(/opera[cç][aã]o de compra no valor de\s+([\d.,]+)\s*MT/i))) {
    o.valor = num_(m[1]);
    const e = t.match(/na entidade\s+(.+?)\s+com referencia/i);
    o.descricao = 'Compra: ' + (e ? e[1] : 'M-Pesa');
  } else if ((m = t.match(/pagamento de\s+([\d.,]+)\s*MT\s+para\s+(.+?)\.\s*A\s/i))) {
    o.valor = num_(m[1]); o.descricao = 'Pagamento ' + m[2];
    if (/movitel|tmcel|vodacom/i.test(m[2])) o.categoria = 'Comunicação';
  } else if ((m = t.match(/(d[eé]bito|cr[eé]dito)\s+de\s+([\d.,]+)\s*MT/i))) {
    o.valor = num_(m[2]); o.tipo = /^c/i.test(m[1]) ? 'entrada' : 'saida'; o.descricao = 'Movimento bancário';
  } else { // desconhecido: fica pendente para o Rei preencher
    m = t.match(/(\d[\d.,]*)\s*(?:MT|MZN)/i);
    o.valor = m ? num_(m[1]) : 0;
    o.tipo = /recebeu|recebido|credit|dep[oó]sito/i.test(t) ? 'entrada' : 'saida';
    o.descricao = 'SMS por classificar';
  }
  return o;
}

/* Teste rápido no editor: Executar → testeSMS */
function testeSMS() {
  Logger.log(JSON.stringify(parseSMS_('Confirmado DJ00TEST00X. Transferiste 10.00MT e a taxa foi de 1.00MT para XXX aos 3/10/26 as 11:20 AM.', 'M-PESA')));
}
