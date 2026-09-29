#!/data/data/com.termux/files/usr/bin/bash
# Manify backend'i Termux'a kurar (ilk kurulumda BİR KEZ çalıştır).
set -e
REPO_URL="https://github.com/ElSauron/ManifyForiOS.git"
DIR="$HOME/ManifyForiOS"

echo "== Paketler kuruluyor =="
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git wget curl

echo "== Depo çekiliyor =="
if [ -d "$DIR/.git" ]; then
  cd "$DIR" && git pull
else
  git clone "$REPO_URL" "$DIR"
  cd "$DIR"
fi

echo "== npm bağımlılıkları kuruluyor (birkaç dakika sürebilir) =="
npm install

echo "== cloudflared indiriliyor =="
ARCH=$(uname -m)
case "$ARCH" in
  aarch64) CF_ARCH="arm64" ;;
  armv7l|armv8l) CF_ARCH="arm" ;;
  x86_64) CF_ARCH="amd64" ;;
  *) echo "Bilinmeyen mimari: $ARCH — cloudflared'i elle indirmen gerekebilir"; CF_ARCH="" ;;
esac
if [ -n "$CF_ARCH" ] && [ ! -x "$PREFIX/bin/cloudflared" ]; then
  wget -q --show-progress "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF_ARCH" -O "$PREFIX/bin/cloudflared"
  chmod +x "$PREFIX/bin/cloudflared"
fi

echo
echo "Kurulum tamam. Başlatmak için: bash start.sh"
