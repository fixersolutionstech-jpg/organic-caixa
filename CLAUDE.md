# organic-caixa — contexto para o Claude Code

## O que é
Sistema de registo financeiro **pessoal do Rei** (príncipe Organic do Castelo).
É também o **piloto de um módulo do Fixer OS** (caixa + aprovação de SMS). Quando estabilizar,
extrair como módulo reutilizável para clientes (aí: Web Push via Firebase em vez do Termux).

## Separação (regra de ouro)
- **Código** vive aqui: `Desktop\trabalhos com ia\Projectos IA\organic-caixa` (repositório Git).
- **Dados** vivem no Organic: `...\THE ORANIC\01_OPERACIONAL\Contabilidade\Contabilidade.xlsx` (`ORGANIC_DIR` no `.env`). Único registo; só `THE ORANIC\scripts\organic.py` escreve nele. Nunca copiar dados pessoais para esta pasta.
- Finanças da Fixer **não** entram aqui (só "Aporte Fixer" / "Reembolso Fixer" como categorias).

## Arquitectura
```
SMS → Termux (termux/sms-organic.sh) → GAS (gas/Code.gs) → Sheet [pendente]
                                         ↓ notificação local → PWA ?id=…
PWA (index.html) → aprovar/corrigir/registar caixa → Sheet [aprovado]
ponte.py → lote JSON → THE ORANIC/scripts/organic.py propor → folha Pendentes → o Rei aprova (2.ª aprovação)
ponte.py também copia os saldos de `Contas` para a Sheet (a PWA só os mostra)
```
- Frontend: PWA estática (GitHub Pages), offline com fila (`localStorage` org_fila), sw.js.
- Backend: Google Apps Script como Aplicação Web; acções `registar`, `aprovar`, `rejeitar`, `sms`; GET `listar`, `exportar`. Autenticação por `TOKEN` (Propriedades do script).
- A Sheet é só caixa de entrada; o registo oficial é `Contabilidade.xlsx`. Dupla aprovação: PWA e depois Organic. Aporte/Reembolso Fixer chegam com categoria recomendada, por aprovar.

## Regras
1. `.env`, `termux/config.sh`, tokens, URLs do GAS e SMS reais **nunca** vão para o Git.
2. Testes com SMS anonimizados (números → XXX).
3. Plano primeiro, o Rei aprova, depois executa.
4. Deploy do GAS com `clasp` (a configurar). Ao mudar `Code.gs`: nova versão da implementação, mesmo URL.
5. Ao mudar ficheiros da PWA, subir a versão do cache em `sw.js` (`organic-vN`).
6. Português europeu/moçambicano em toda a interface e documentação.

## Estado
- [x] PWA: registar, aprovar, saldos, fila offline
- [x] GAS: endpoints + parser SMS provisório
- [x] `organic.py` (sincronizar → Diario.xlsx) removido; substituído por `ponte.py`
- [x] Script Termux (rascunho)
- [ ] Afinar `parseSMS_` com SMS reais de exemplo (M-Pesa, e-Mola, banco)
- [x] Repositório GitHub público + Pages: https://fixersolutionstech-jpg.github.io/organic-caixa/
- [x] Configurar clasp (script ligado à Sheet; `clasp push` + `clasp deploy -i <id>` mantém o URL; `.clasp.json` fora do Git)
- [x] `.env` preenchido (falta trocar EXCEL_PATH por ORGANIC_DIR). O teste anterior do `organic.py` só provou que corre, não que o desenho está certo
- [ ] NÃO registar saldos iniciais na PWA (já estão em `Contas`)
- [x] Fase 2: mapeamento aprovado (Caixa e M-Pesa → CASH; e-Mola → EMOLA; Banco → BANCO; categorias em `ponte.py`)
- [x] Fase 3 (código): `ponte.py` testado com cópia do Organic e movimentos fictícios; `Code.gs` com acções `importado` e `saldos` e taxa M-Pesa como movimento à parte
- [x] Fase 3 (deploy) 2026-10-06: GAS @7, Pages com `organic-v2`; Organic reiniciado a 2026-10-01 (histórico em `Contabilidade\Historico\`)
- [x] `ponte.py` (sem `.env` para o Organic: usa a pasta THE ORANIC por defeito) com `--seco`, `--saldos`, `--revisao`; teste ponta a ponta feito com 1 movimento
- [x] `parseSMS_` afinado com SMS reais (M-Pesa, e-Mola, STD Bank, Credelec, TMCEL); ignora "Falhou…" e a compra EDM (o recibo do Credelec já regista a luz); testes em `testes/sms.test.js`
- [x] Termux a ler SMS de +842424, STD, M-Pesa, e-Mola desde 2026-10-01 (`DESDE` em `config.sh`); lembrete de domingo às 18h no próprio script
- [x] Termux agendado (Job 0, 15 min — mínimo do Android) a 2026-10-06; `sms-organic.sh` corrigido (ciclo lê do fd 3: notification/curl comiam o stdin e o marcador avançava 1 SMS por ronda); marcador posto em 2375
- [x] Teste com SMS real: confirmado pelo Rei a 2026-10-16 (o fluxo tem funcionado). `ponte.py --seco` a 16-10: 32 aprovados na PWA → 29 para o Organic (07 a 11-10; 1 entrada de 500, saídas 1 737 MT, tudo em CASH), por importar. Deixados de fora: 1 transferência M-Pesa→Caixa (não precisa de registo) e 2 com conta desconhecida na PWA ('Fixer', 'Banco Standard'). Nada aprovado depois de 11-10
- [x] 2026-10-17: lote de 07 a 16/10 enviado para **Pendentes** do Organic (34 linhas; backup em `Contabilidade\backup`). O Rei aprova no Organic (2.ª aprovação). Histórico em `Contabilidade\Historico\movimentos_2026-10-07_a_11_so_historico.md`
- [x] Conta STD (1190008072587) é da **Fixer**: `ponte.py` deixa-a fora do Organic (`e_std`); 'Banco' com SMS do Millennium BIM ou registo manual = BANCO pessoal
- [x] Parser Millennium BIM (código `Code.gs`, testes 17/17): débito, crédito, comissão anual, código de levantamento IZI (= transferência Banco->Caixa; o débito seguinte só acrescenta a comissão). **Falta `clasp push` + nova versão (pedir ao Rei)**; Termux já filtra BIM/MILLENNIUM (actualizar o script no telemóvel)
- [x] `ponte.py --conferir` (e automático ao importar): segue o saldo M-Pesa SMS a SMS e aponta o valor que falta. Também em `--revisao`
- [x] Corrigido bug do GAS: `actualizar_` deslocava a data um dia (Sheets convertia o texto em Date); formato de texto forçado (vai no mesmo deploy)
- [ ] Decidir o movimento 'Fixer' (`muzk458zvhts`) na PWA; confirmar o levantamento IZI de 500 (sem SMS de débito)
- [x] Reestruturação 2026-10-06: CASH inicial 131 (41 M-Pesa + 90 físico), DIVIDAS -11 750 (detalhe em `Contabilidade\Passivos.md`); 21 movimentos 01–06/10 aprovados no Organic (CASH 500, dívidas -10 150); Sheet limpa; STD/caixa Fixer ficam fora do Organic
- [x] (resolvido) Saldo inicial de 01-10 (Caixa+M-Pesa em CASH, Banco): M-Pesa era 41,16 MT às 00:00 de 01-10 (dos SMS); falta o dinheiro físico e o banco. Há 3.000 MT que entraram no M-Pesa entre 01-10 18:10 e 03-10 00:04 sem SMS
- [x] Token trocado e capturas de ecrã apagadas
- [x] PWA instalada; pendentes de 01–06/10 substituídos pelo lote da reestruturação
- Cuidado: `ponte.py` trata qualquer argumento desconhecido (ex. `--help`) como importação
- [ ] Futuro: correr `ponte.py --conferir` na revisão semanal (já faz parte do `--revisao`); atenção: o GAS responde "token inválido" de vez em quando (a ponte e o Termux repetem)

## Ao terminar uma sessão
Actualiza a secção "Estado" acima e o ficheiro `THE ORANIC\01_OPERACIONAL\Sistema-Caixa.md` se algo mudou para o utilizador.
