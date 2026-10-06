#!/data/data/com.termux/files/usr/bin/bash
# sms-organic.sh — lê SMS novos (+842424, STD Bank, M-Pesa, e-Mola), envia ao GAS e avisa para aprovar.
# Requer no Termux: pkg install termux-api jq curl  (+ app Termux:API instalada, permissão de SMS)
# Corre de 2 em 2 min: termux-job-scheduler --script ~/organic/sms-organic.sh --period-ms 120000 --persisted true
# Ao domingo, depois das 18h, também lembra a revisão semanal (uma vez por semana).

DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/config.sh"            # define GAS_URL, GAS_TOKEN, PWA_URL (e opcionalmente DESDE)
ULTIMO="$DIR/.ultimo_sms"
LEMB="$DIR/.ultimo_lembrete"
DESDE="${DESDE:-2026-10-01}"       # ignora SMS anteriores a esta data (o Organic recomeçou a 1 de Outubro)
REMETENTES='842424|STD|M-?PESA|E-?MOLA'
[ -f "$ULTIMO" ] || echo 0 > "$ULTIMO"
ult=$(cat "$ULTIMO")

# envia ao GAS; o GAS falha de vez em quando (HTML ou "token inválido"), por isso repete até 4 vezes
enviar() {
  for i in 1 2 3 4; do
    resp=$(curl -sL -m 30 -H 'Content-Type: text/plain' -d "$1" "$GAS_URL")
    [ "$(echo "$resp" | jq -r '.ok' 2>/dev/null)" = "true" ] && return 0
    sleep 3
  done
  return 1
}

# do mais antigo para o mais novo, para o marcador nunca saltar SMS
termux-sms-list -l 200 -t inbox | jq -c --arg d "$DESDE" 'reverse | .[] | select(.received >= $d)' | while read -r s; do
  id=$(echo "$s" | jq -r '._id')
  [ "$id" -le "$ult" ] && continue
  rem=$(echo "$s" | jq -r '.number')
  echo "$rem" | grep -qiE "$REMETENTES" || { echo "$id" > "$ULTIMO"; continue; }
  txt=$(echo "$s" | jq -r '.body')

  corpo=$(jq -n --arg t "$GAS_TOKEN" --arg x "$txt" --arg r "$rem" '{token:$t,acao:"sms",texto:$x,remetente:$r}')
  if enviar "$corpo"; then
    if [ "$(echo "$resp" | jq -r '.ignorado')" = "true" ]; then echo "$id" > "$ULTIMO"; continue; fi   # ex.: "Falhou. Nao tens saldo"
    mid=$(echo "$resp" | jq -r '.id'); res=$(echo "$resp" | jq -r '.resumo')
    termux-notification --id "org$id" --title "Organic · por aprovar" --content "$res — toca para aprovar" \
      --action "termux-open-url '$PWA_URL?id=$mid'"
    echo "$id" > "$ULTIMO"
  else
    termux-notification --id "org$id" --title "Organic · erro ao enviar" --content "$rem: tenta de novo na próxima ronda"
    break   # não avança o marcador: volta a tentar
  fi
done

# lembrete semanal: domingo depois das 18h, uma vez por semana
if [ "$(date +%u)" = "7" ] && [ "$(date +%H)" -ge 18 ]; then
  sem=$(date +%G-%V)
  if [ "$(cat "$LEMB" 2>/dev/null)" != "$sem" ]; then
    r=$(curl -sL -m 30 "$GAS_URL?acao=listar&token=$GAS_TOKEN")
    pend=$(echo "$r" | jq -r '.pendentes | length' 2>/dev/null)
    imp=$(echo "$r" | jq -r '.por_importar' 2>/dev/null)
    if [ -n "$pend" ] && [ "$pend" != "null" ]; then
      termux-notification --id organic-semana --title "Organic · revisão semanal" \
        --content "$pend por aprovar na app, $imp por passar ao Organic. No PC: python ponte.py" \
        --action "termux-open-url '$PWA_URL'"
      echo "$sem" > "$LEMB"
    fi
  fi
fi
