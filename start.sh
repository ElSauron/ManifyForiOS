#!/data/data/com.termux/files/usr/bin/bash
# Sunucuyu ve internete açan tüneli başlatır. Her çalıştırmada YENİ bir adres üretir
# (aşağıdaki "trycloudflare.com" ile biten satırı Manify > Ayarlar > Sunucu adresi'ne yapıştır).
cd "$(dirname "$0")"
PORT="${PORT:-3000}"

# Zaten çalışan eski bir kopya varsa temizle
pkill -f "node server.js" 2>/dev/null || true
sleep 1

echo "== Sunucu başlatılıyor (arka planda, port $PORT) =="
PORT=$PORT nohup node server.js > server.log 2>&1 &
sleep 2
if ! wget -O /dev/null "http://127.0.0.1:$PORT/health" 2>/tmp/manify-health.log; then
  echo "Sunucu 'health' isteğine cevap vermedi. wget hatası:"
  cat /tmp/manify-health.log
  echo "server.log:"; tail -n 20 server.log
  exit 1
fi
echo "Sunucu çalışıyor. Şimdi tünel açılıyor, adres birazdan aşağıda görünecek…"
echo "(Bu pencereyi kapatma — Termux bildirimindeki 'Acquire wakelock'a dokunmayı unutma.)"
echo

cloudflared tunnel --url "http://127.0.0.1:$PORT"
