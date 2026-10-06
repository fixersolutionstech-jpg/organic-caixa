// node testes/sms.test.js — testa parseSMS_ (gas/Code.gs) com SMS anonimizados (números, contas e referências -> XXX)
const fs = require('fs');
global.Utilities = { formatDate: () => '2026-10-06' };
eval(fs.readFileSync(__dirname + '/../gas/Code.gs', 'utf8') + ';global.parseSMS_=parseSMS_;global.num_=num_;');

const casos = [
  ['STD BANK', 'Caro Cliente, ocorreu um debito de 10,00 MT na sua conta XXX a 24/09/2026, 04:07, S19 AGENCIA XXX. Comissao: 0.00MT e Imposto de selo: 0.00MT. Mais info: XXX',
    { tipo: 'saida', valor: 10, conta: 'Banco', data: '2026-09-24', taxa: 0 }],
  ['STD BANK', 'Credelec\nRecarga: XXX\nContador: XXX\nTotal Pago: 20.00MT\nVal Energia: 2.40MT\nDivida Paga: 0.00MT\nEnergia: 2.4KWh\nIVA: 1.80MT\nTX Radio: 0.00MT\nTX Lixo: 0.00MT',
    { tipo: 'saida', valor: 20, conta: 'Banco', categoria: 'Casa', taxa: 0, data: '2026-10-06' }],
  ['MPESA', 'Confirmado DJ00TEST01A. Aos 3/10/26 as 1:08 PM levantaste 949.00MT no agente XXX - XXX. O novo saldo M-Pesa e de 0.16MT e a taxa foi de 10.00MT. Em caso de duvida, liga 100. M-Pesa e facil!',
    { tipo: 'transferencia', valor: 949, conta: 'M-Pesa', conta_destino: 'Caixa', taxa: 10, data: '2026-10-03', id: 'dj00test01a' }],
  ['MPESA', 'Confirmado DJ00TEST02B. Transferiste 10.00MT e a taxa foi de 1.00MT para XXX aos 3/10/26 as 11:20 AM. O teu novo saldo M-Pesa e de 2,979.16MT. E SEM TAXAS as transferencias de M-Pesa para M-Pesa. Em caso de duvida,liga 100.',
    { tipo: 'saida', valor: 10, conta: 'M-Pesa', taxa: 1, data: '2026-10-03' }],
  ['M-PESA', 'EDM Credelec\n Recarga XXX\n Contador XXX\n Val Energia 80.0 MT\n IVA 2.08 MT\n Divida Paga 0.0 MT\n Divida a Pagar 0 MT\n Tx Radio 12 MT\n Tx Lixo 45 MT\n Total Pago 80 MT\n Energia 2.7 kwh\n Ref 202610010140738628\n M-Pesa e facil!',
    { tipo: 'saida', valor: 80, conta: 'M-Pesa', categoria: 'Casa', taxa: 0, data: '2026-10-01', id: '202610010140738628' }],
  ['MPESA', 'Confirmado DJ00TEST03C. Depositaste o valor de 70.00MT no agente XXX aos 1/10/26 as 6:07 PM. O teu novo saldo M-Pesa e de 92.16MT. Aproveita e transfere SEM TAXAS de M-Pesa para M-Pesa. Em caso de duvida, liga 100.',
    { tipo: 'transferencia', valor: 70, conta: 'Caixa', conta_destino: 'M-Pesa', taxa: 0, data: '2026-10-01' }],
  ['MPESA', 'Confirmado DJ00TEST04D. Recebeste 50.00MT de XXX - XXX aos 30/9/26 as 2:46 PM o novo saldo M-Pesa e de 52.16MT. Aproveita e transfere SEM TAXAS de M-Pesa para M-Pesa. Em caso de duvida, liga 100.',
    { tipo: 'entrada', valor: 50, conta: 'M-Pesa', taxa: 0, data: '2026-09-30' }],
  ['MPESA', 'Confirmado DJ00TEST05E. Registamos uma operacao de compra no valor de 1,530.00MT e a taxa foi de 0.00MT na entidade Conservatoria e Registo das Entidades Legais de Maputo com referencia XXX aos 30/9/26 as 1:49 PM. O teu novo saldo M-Pesa e de 26.16MT. Em caso de duvida, liga 100. M-Pesa e facil!',
    { tipo: 'saida', valor: 1530, conta: 'M-Pesa', taxa: 0, data: '2026-09-30', descricao: 'Compra: Conservatoria e Registo das Entidades Legais de Maputo' }],
  ['+XXXXXX (Mbim)', 'TMCEL Voucher\nSerial:\n Debit amount\n10MT\nNr Ben To:XXX\nSuccessful Purchase.\nData\n20-09-2026 08:51\nCall 8003500 if you dont know',
    { tipo: 'saida', valor: 10, categoria: 'Comunicação', data: '2026-09-20' }],
  ['e-Mola', 'EDM Credelec\nCodigo 1:\nXXX\nContador XXX\nVal Energia 30.00MT\nIVA 2.71MT\nDivida Paga 0.00MT\nTx Radio 0.00MT\nTx Lixo 0.00MT\nTotal Pago 30.00MT\nEnergia 3.60kwh\nRef 202608120114102702\nMeu cell. minha mola',
    { tipo: 'saida', valor: 30, conta: 'e-Mola', categoria: 'Casa', data: '2026-08-12' }],
  ['e-Mola', 'ID da Transacao: CO260812.2030.L97079. Efectuou um pagamento de 1.00 MT para Movitel,SA. A 20:30 12/08/2026. O seu saldo actual e de 6.00 MT. Obrigado!',
    { tipo: 'saida', valor: 1, conta: 'e-Mola', categoria: 'Comunicação', data: '2026-08-12', id: 'co260812.2030.l97079' }],
  ['MPESA', 'Falhou. Nao tens saldo suficiente na conta M-Pesa  para levantar 2,950.00MT  de XXX.O saldo M-Pesa e de 2,979.16MT. M-Pesa e facil!',
    { ignorar: true }],
];

let falhas = 0;
for (const [rem, txt, esp] of casos) {
  const r = parseSMS_(txt, rem);
  const mal = Object.keys(esp).filter(k => r[k] !== esp[k]);
  if (mal.length) { falhas++; console.log('FALHA', txt.slice(0, 50).replace(/\n/g, ' '), mal.map(k => `${k}: obtido ${JSON.stringify(r[k])} esperado ${JSON.stringify(esp[k])}`).join(' | ')); }
}
for (const [a, b] of [['1,530.00', 1530], ['10,00', 10], ['2,979.16', 2979.16], ['1.500,00', 1500], ['80.0', 80], ['12', 12]])
  if (num_(a) !== b) { falhas++; console.log('FALHA num_', a, num_(a), b); }
console.log(falhas ? falhas + ' falha(s)' : `OK — ${casos.length} SMS + números`);
process.exit(falhas ? 1 : 0);
