# organic-caixa — contexto para o Claude Code

## O que é
Sistema de registo financeiro **pessoal do Rei** (príncipe Organic do Castelo).
É também o **piloto de um módulo do Fixer OS** (caixa + aprovação de SMS). Quando estabilizar,
extrair como módulo reutilizável para clientes (aí: Web Push via Firebase em vez do Termux).

## Separação (regra de ouro)
- **Código** vive aqui: `Desktop\trabalhos com ia\Projectos IA\organic-caixa` (repositório Git).
- **Dados** vivem no Organic: `Desktop\AI\The castelo do Rei multiplicado\THE ORANIC\01_OPERACIONAL\Contabilidade\Diario.xlsx` (`EXCEL_PATH` no `.env`). Nunca copiar dados pessoais para esta pasta.
- Finanças da Fixer **não** entram aqui (só "Aporte Fixer" / "Reembolso Fixer" como categorias).

## Arquitectura
```
SMS → Termux (termux/sms-organic.sh) → GAS (gas/Code.gs) → Sheet [pendente]
                                         ↓ notificação local → PWA ?id=…
PWA (index.html) → aprovar/corrigir/registar caixa → Sheet [aprovado]
organic.py sincronizar → Excel do Organic (Diario, Saldos, Mensal)
```
- Frontend: PWA estática (GitHub Pages), offline com fila (`localStorage` org_fila), sw.js.
- Backend: Google Apps Script como Aplicação Web; acções `registar`, `aprovar`, `rejeitar`, `sms`; GET `listar`, `exportar`. Autenticação por `TOKEN` (Propriedades do script).
- Sheet é a fonte de verdade; o Excel é regenerado.

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
- [x] organic.py sincronizar → Excel
- [x] Script Termux (rascunho)
- [ ] Afinar `parseSMS_` com SMS reais de exemplo (M-Pesa, e-Mola, banco)
- [x] Repositório GitHub público + Pages: https://fixersolutionstech-jpg.github.io/organic-caixa/
- [x] Configurar clasp (script ligado à Sheet; `clasp push` + `clasp deploy -i <id>` mantém o URL; `.clasp.json` fora do Git)
- [x] `.env` preenchido; `organic.py` testado (Sheet vazia + movimentos fictícios, saldos correctos) com Excel temporário
- [ ] Primeira `python organic.py sincronizar` para o `Diario.xlsx` real (só depois de registar o saldo inicial na PWA)
- [ ] Instalar a PWA no telemóvel (Definições → URL + TOKEN → Testar ligação) e registar saldos iniciais
- [ ] Lembrete semanal (termux-job-scheduler, domingo)
- [ ] Escrever resumo em `C:\Users\Edson Adolfo\Desktop\AI\The castelo do Rei multiplicado\THE ORANIC\_Estado.md` após cada sincronização

## Ao terminar uma sessão
Actualiza a secção "Estado" acima e o ficheiro `THE ORANIC\01_OPERACIONAL\Sistema-Caixa.md` se algo mudou para o utilizador.
