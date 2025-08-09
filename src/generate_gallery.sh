#!/bin/sh
set -eu

OUT_DIR="/usr/share/nginx/html/_gallery"
SRC_DIR="/data"

mkdir -p "$OUT_DIR"

# Clear previous jsons
find "$OUT_DIR" -type f -name '*.json' -exec rm -f {} \; 2>/dev/null || true

# For each folder under /data, list image files and emit JSON
for d in "$SRC_DIR"/*; do
  [ -d "$d" ] || continue
  base="$(basename "$d")"
  tmp="$(mktemp)"
  echo -n '{ "folder": "'$base'", "images": [' > "$tmp"

  first=1
  for f in "$d"/*; do
    [ -f "$f" ] || continue
    case "${f##*.}" in
      jpg|JPG|jpeg|JPEG|png|PNG|webp|WEBP|gif|GIF|bmp|BMP|svg|SVG)
        url="/data/$base/$(basename "$f")"
        if [ $first -eq 1 ]; then
          printf '"%s"' "$url" >> "$tmp"
          first=0
        else
          printf ', "%s"' "$url" >> "$tmp"
        fi
      ;;
    esac
  done

  echo '] }' >> "$tmp"
  mv "$tmp" "$OUT_DIR/$base.json"
done
