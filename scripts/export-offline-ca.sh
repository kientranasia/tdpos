#!/usr/bin/env sh
set -eu

ENV_FILE="${HKDPLUS_ENV_FILE:-.env}"
OUTPUT="${1:-hkdsmart-local-ca.crt}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Không tìm thấy $ENV_FILE. Hãy tạo file .env từ .env.offline.example." >&2
  exit 1
fi

output_dir=$(dirname "$OUTPUT")
mkdir -p "$output_dir"

docker compose --env-file "$ENV_FILE" -f docker-compose.offline.yml \
  run --rm --no-deps --entrypoint sh gateway \
  -c 'cat /data/caddy/pki/authorities/local/root.crt' > "$OUTPUT"

if [ ! -s "$OUTPUT" ]; then
  rm -f "$OUTPUT"
  echo "Chưa có Local CA. Hãy khởi động gateway trước rồi chạy lại." >&2
  exit 1
fi

chmod 0644 "$OUTPUT"
echo "Đã xuất Local CA: $OUTPUT"
echo "Cài file này trên điện thoại/máy trạm một lần để tin cậy HTTPS nội bộ."
