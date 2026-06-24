#!/bin/sh
set -eu

if grep -R "expo-notifications\|PROVIDER_GOOGLE\|service_role\|delete account\|public.*avatars" app app.json package.json supabase >/dev/null 2>&1; then
  echo "Forbidden Phase 5 scope string found" >&2
  exit 1
fi

echo "Forbidden Phase 5 scope grep passed"
