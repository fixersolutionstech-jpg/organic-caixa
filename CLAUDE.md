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
- [x] Fase 3 (deploy) 2026-10-06: GAS @4 no ar, Pages com `organic-v2`, saldos a zero enviados. Organic reiniciado a 2026-10-01 (histórico em `Contabilidade\Historico\`)
- [ ] Testes ponta a ponta com movimentos reais de outubro (PWA → `ponte.py` → Pendentes → aprovar) e 1 movimento com backup
- [ ] Afinar a taxa M-Pesa no `parseSMS_` com SMS reais (regex provisória)
- [x] Fase 4 (código): PWA mostra saldos do Organic (folha Saldos da Sheet) e movimentos por importar
- [ ] Instalar a PWA no telemóvel (Definições → URL + TOKEN → Testar ligação)
- [ ] Lembrete semanal (termux-job-scheduler, domingo)
- [ ] Escrever resumo em `C:\Users\Edson Adolfo\Desktop\AI\The castelo do Rei multiplicado\THE ORANIC\_Estado.md` após cada `ponte.py`

## Ao terminar uma sessão
Actualiza a secção "Estado" acima e o ficheiro `THE ORANIC\01_OPERACIONAL\Sistema-Caixa.md` se algo mudou para o utilizador.
