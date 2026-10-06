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
function doGet(e) {
  const p = e.parameter || {};
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
  const aprov = rows.filter(r => r.estado === 'aprovado');
  const saldos = {};
  const soma = (c, v) => { if (c) saldos[c] = (saldos[c] || 0) + v; };
  aprov.forEach(r => {
    if (r.tipo === 'entrada') soma(r.conta, r.valor);
    else if (r.tipo === 'saida') soma(r.conta, -r.valor);
    else if (r.tipo === 'transferencia') { soma(r.conta, -r.valor); soma(r.conta_destino, r.valor); }
  });
  const recentes = aprov.slice().sort((a, b) => (b.data + b.criado_em).localeCompare(a.data + a.criado_em)).slice(0, 40);
  return { ok: true, pendentes, saldos, recentes };
}

/* Todos os aprovados — usado pelo organic.py para gerar o Excel */
function exportar_() {
  const s = sh_();
  const n = s.getLastRow();
  const rows = n > 1 ? s.getRange(2, 1, n - 1, HEAD.length).getValues().map(obj_) : [];
  return { ok: true, movimentos: rows.filter(r => r.estado === 'aprovado') };
}

/* ---------- SMS (Termux) ----------
 * Guarda o SMS como PENDENTE com uma sugestão de classificação.
 * O parser fica completo quando tivermos os SMS de exemplo.
 */
function sms_(texto, remetente) {
  const sug = parseSMS_(texto, remetente);
  sug.sms = texto;
  const r = registar_(sug, 'sms', 'pendente');
  r.resumo = `${sug.valor || '?'} MZN · ${sug.conta} · ${sug.tipo === 'entrada' ? 'entrada' : 'saída'}`;
  return r;
}

function parseSMS_(texto, remetente) {
  const t = String(texto);
  const rem = String(remetente).toUpperCase();
  const conta = /MPESA|M-PESA/.test(rem + t.toUpperCase()) ? 'M-Pesa'
    : /EMOLA|E-MOLA/.test(rem + t.toUpperCase()) ? 'e-Mola' : 'Banco';
  const mv = t.match(/(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?)\s*(?:MT|MZN)/i);
  const valor = mv ? Number(mv[1].replace(/[\s.](?=\d{3})/g, '').replace(',', '.')) : 0;
  const entrada = /recebeu|recebido|credit|depósito|deposito/i.test(t);
  return {
    data: hoje_(), tipo: entrada ? 'entrada' : 'saida', valor, conta,
    categoria: entrada ? 'Rendimento' : 'Outros', descricao: ''
  };
}

/* Teste rápido no editor: Executar → testeSMS */
function testeSMS() {
  Logger.log(JSON.stringify(parseSMS_('Confirmado. Transferiste 1.500,00MT para 84XXXXXXX', 'M-PESA')));
}
