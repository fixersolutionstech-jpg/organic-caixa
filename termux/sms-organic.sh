#!/data/data/com.termux/files/usr/bin/bash
# sms-organic.sh — lê SMS novos de M-Pesa / e-Mola / banco, envia ao GAS e mostra notificação.
# Requer no Termux: pkg install termux-api jq curl  (+ app Termux:API instalada, permissão de SMS)
# Corre de 2 em 2 min com: termux-job-scheduler --script ~/organic/sms-organic.sh --period-ms 120000 --persisted true
# ⚠ Remetentes e parser serão afinados com os SMS de exemplo.

DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/config.sh"            # define GAS_URL, GAS_TOKEN, PWA_URL
ULTIMO="$DIR/.ultimo_sms"
REMETENTES='M-PESA|MPESA|EMOLA|E-MOLA|BCI|MILLENNIUM|BIM|STANDARD|ABSA'
[ -f "$ULTIMO" ] || echo 0 > "$ULTIMO"
ult=$(cat "$ULTIMO")

termux-sms-list -l 30 -t inbox | jq -c '.[]' | while read -r s; do
  id=$(echo "$s" | jq -r '._id')
  [ "$id" -le "$ult" ] && continue
  rem=$(echo "$s" | jq -r '.number')
  echo "$rem" | grep -qiE "$REMETENTES" || { echo "$id" > "$ULTIMO"; continue; }
  txt=$(echo "$s" | jq -r '.body')

  corpo=$(jq -n --arg t "$GAS_TOKEN" --arg x "$txt" --arg r "$rem" '{token:$t,acao:"sms",texto:$x,remetente:$r}')
  resp=$(curl -sL -m 30 -H 'Content-Type: text/plain' -d "$corpo" "$GAS_URL")

  if [ "$(echo "$resp" | jq -r '.ok' 2>/dev/null)" = "true" ]; then
    mid=$(echo "$resp" | jq -r '.id'); res=$(echo "$resp" | jq -r '.resumo')
    termux-notification --id "org$id" --title "Organic · por aprovar" --content "$res — toca para aprovar" \
      --action "termux-open-url '$PWA_URL?id=$mid'"
    echo "$id" > "$ULTIMO"
  else
    termux-notification --id "org$id" --title "Organic · erro ao enviar" --content "$rem: tenta de novo na próxima ronda"
    break   # não avança o marcador: volta a tentar
  fi
done
