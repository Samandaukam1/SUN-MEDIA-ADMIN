#!/usr/bin/env bash
# Commit qilingan kodni (HEAD) Vercel production'ga yuboradi — docs/PRODUCTION_SETUP.md 4-bo'limdagi usul.
# Ishlatish: npm run deploy   (yoki: bash scripts/deploy-prod.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Diqqat: commit qilinmagan o'zgarishlar bor — ular deploy'ga KIRMAYDI (faqat commit qilingan kod yuboriladi)."
fi
DIR="$(mktemp -d /tmp/admin-deploy.XXXXXX)"
git archive HEAD | tar -x -C "$DIR"
mkdir "$DIR/.vercel" && cp .vercel/project.json "$DIR/.vercel/"
echo "Deploy: $(git log --oneline -1)"
cd "$DIR" && npx vercel deploy --prod --yes
rm -rf "$DIR"
