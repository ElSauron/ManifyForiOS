#!/data/data/com.termux/files/usr/bin/bash
pkill -f "node server.js" && echo "Sunucu durduruldu." || echo "Zaten çalışmıyordu."
pkill -f "cloudflared tunnel" 2>/dev/null
