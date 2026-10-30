#!/bin/zsh
cd "$(dirname "$0")" || exit 1
exec "$HOME/.rive/bin/rive" . --artboard='Motion review' --viewport=900x640 --fit=contain
