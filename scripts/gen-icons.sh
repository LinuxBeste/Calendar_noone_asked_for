#!/usr/bin/env bash
# Regenerates app icons (web PWA + Android launcher/splash) from the bundled
# Material "event" glyph (Apache 2.0). Requires ImageMagick (available on
# GitHub's ubuntu-latest runners and most Linux dev machines).
set -euo pipefail
cd "$(dirname "$0")/.."

GLYPH="web/static/icons/material-event.svg"
BLUE="#1a73e8"
WHITE="#ffffff"

pwa_icon() { # size out
  local size="$1" out="$2"
  convert -size "${size}x${size}" xc:"$BLUE" \
    \( -size "${size}x${size}" xc:black -fill white \
       -draw "roundrectangle 0,0,$((size-1)),$((size-1)),$((size/5)),$((size/5))" \) \
    -alpha off -compose CopyOpacity -composite \
    \( "$GLYPH" -resize "$((size*55/100))x$((size*55/100))" -fill white -colorize 100 \) \
    -gravity center -compose over -composite \
    PNG:"$out"
}

android_fg() { # size out
  local size="$1" out="$2"
  local g="$((size*62/100))"
  convert -size "${size}x${size}" xc:none \
    \( "$GLYPH" -resize "${g}x${g}" -fill black -colorize 100 \) \
    -gravity center -compose over -composite \
    PNG:"$out"
}

android_bg() { # size out
  local size="$1" out="$2"
  local g="$((size*55/100))"
  convert -size "${size}x${size}" xc:"$BLUE" \
    \( "$GLYPH" -resize "${g}x${g}" -fill white -colorize 100 \) \
    -gravity center -compose over -composite \
    PNG:"$out"
}

splash_icon() { # width height out
  local w="$1" h="$2" out="$3"
  local g="$((w*14/100))"
  convert -size "${w}x${h}" xc:"$BLUE" \
    \( "$GLYPH" -resize "${g}x${g}" -fill white -colorize 100 \) \
    -gravity center -compose over -composite \
    PNG:"$out"
}

# ---- Web PWA icons ----
pwa_icon 192 web/static/icons/icon-192.png
pwa_icon 512 web/static/icons/icon-512.png

# ---- Android launcher ----
for spec in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  den="${spec%%:*}"
  px="${spec##*:}"
  android_fg "$px" "android/app/src/main/res/mipmap-$den/ic_launcher_foreground.png"
  android_bg "$px" "android/app/src/main/res/mipmap-$den/ic_launcher.png"
  cp "android/app/src/main/res/mipmap-$den/ic_launcher.png" "android/app/src/main/res/mipmap-$den/ic_launcher_round.png"
done

# ---- Android splash (portrait / landscape) ----
for orient in port land; do
  for spec in mdpi:320:480 hdpi:480:720 xhdpi:640:960 xxhdpi:960:1440 xxxhdpi:1280:1920; do
    den="${spec%%:*}"
    rest="${spec#*:}"
    w="${rest%%:*}"
    h="${rest##*:}"
    splash_icon "$w" "$h" "android/app/src/main/res/drawable-$orient-$den/splash.png"
  done
done
splash_icon 320 480 android/app/src/main/res/drawable/splash.png

echo "Icons regenerated ✔"