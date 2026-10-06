# organic-caixa — instalação

## 0. Onde fica cada coisa
| Pasta do zip | Copiar para |
|---|---|
| `Projectos IA\organic-caixa\` | `C:\Users\Edson Adolfo\Desktop\trabalhos com ia\Projectos IA\organic-caixa\` |
| `THE ORANIC\01_OPERACIONAL\` | `C:\Users\Edson Adolfo\Desktop\AI\The castelo do Rei multiplicado\THE ORANIC\01_OPERACIONAL\` (junta com o que já existe) |

## 1. Backend (Google Apps Script)
1. Cria uma Google Sheet: **Organic — Movimentos**.
2. Extensões → Apps Script → cola `gas/Code.gs`.
3. ⚙ Definições do projecto → Propriedades do script → `TOKEN` = senha longa.
4. Implementar → Nova implementação → **Aplicação Web** (Executar como: Eu · Acesso: Qualquer pessoa). Copia o URL `/exec`.

## 2. PWA (GitHub Pages)
1. Repositório `organic-caixa` → envia esta pasta (o `.gitignore` protege `.env` e `config.sh`).
2. Settings → Pages → branch `main` / root.
3. Abre o link no Chrome do telemóvel → **Instalar app** → Definições → URL + TOKEN → **Testar ligação**.
4. Regista o saldo inicial de cada conta: Entrada · "Saldo inicial".

## 3. Excel no Organic (PC)
1. Copia `.env.example` para `.env` e preenche.
2. `pip install openpyxl requests`
3. `python organic.py sincronizar` → gera `Diario.xlsx` (folhas Diario, Saldos, Mensal).

## 4. Termux (telemóvel) — depois de afinar o parser
1. Instala Termux + Termux:API (F-Droid) → `pkg install termux-api jq curl` → `termux-setup-storage`.
2. Copia `termux/` para `~/organic/`, cria `config.sh` a partir de `config.exemplo.sh`.
3. Testa: `bash ~/organic/sms-organic.sh`
4. Agenda: `termux-job-scheduler --script ~/organic/sms-organic.sh --period-ms 120000 --persisted true`
