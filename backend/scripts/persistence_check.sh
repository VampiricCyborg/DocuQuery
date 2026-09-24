#!/usr/bin/env bash
# Does a chat survive a different browser, and a logout/login round trip?
#
# Three cookie jars stand in for three browser sessions belonging to the SAME
# account. Nothing is shared between them but the credentials: no localStorage,
# no in-memory state, separate cookie stores on disk.
#
#   jar A  the browser the chat is created in
#   jar B  a second browser, signed in independently -- the "different browser"
#   jar C  jar B after logging out and back in
#
# If conversations were still client-side, B and C would both be empty.

set -u
API=http://127.0.0.1:8011
DIR="$(dirname "$0")/jars"
rm -rf "$DIR"; mkdir -p "$DIR"
A="$DIR/a.txt"; B="$DIR/b.txt"; C="$DIR/c.txt"

EMAIL="persistence-$(date +%s)@example.invalid"
PASS="correct horse battery staple"

hr()  { printf '%s\n' "------------------------------------------------------------"; }
step(){ hr; printf '  %s\n' "$*"; hr; }

step "1. Sign up in browser A"
curl -s -c "$A" -X POST "$API/auth/signup" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Persistence Check\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | python -m json.tool
echo "cookie jar A now holds: $(grep -c docuquery_session "$A" || true) session cookie"

step "2. Sign in as the SAME user in browser B (a separate cookie jar)"
curl -s -c "$B" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | python -m json.tool
echo "jars A and B share no state. Both cookies encode the same user id, so only"
echo "the signature at the tail distinguishes them -- they are separate sessions:"
echo "  A session cookie: ...$(awk '/docuquery_session/{print substr($7,length($7)-15)}' "$A")"
echo "  B session cookie: ...$(awk '/docuquery_session/{print substr($7,length($7)-15)}' "$B")"

step "3. Browser B sees no chats yet"
curl -s -b "$B" "$API/conversations" | python -m json.tool

step "4. Browser A sends a message with no conversation_id"
echo "POST /chat  {\"message\": \"What is a policy enforcement point?\", \"mode\": \"llm\"}"
echo
RAW=$(curl -s -N -b "$A" -X POST "$API/chat" -H 'Content-Type: application/json' \
  -d '{"message":"What is a policy enforcement point?","mode":"llm"}')
echo "--- first frames of the SSE stream ---"
printf '%s\n' "$RAW" | head -6
echo "  ..."
CONV=$(printf '%s\n' "$RAW" | grep -m1 -A1 '^event: conversation' | tail -1 \
        | sed 's/^data: //' | python -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo
echo "server created conversation: $CONV"

step "5. Browser B — never told about that conversation — lists its chats"
curl -s -b "$B" "$API/conversations" | python -m json.tool

step "6. Browser B opens the conversation and reads the transcript"
curl -s -b "$B" "$API/conversations/$CONV" | python -c "
import json,sys
d=json.load(sys.stdin)
print(json.dumps({'id':d['id'],'title':d['title'],'mode':d['mode'],'pinned':d['pinned']},indent=2))
print('messages:')
for m in d['messages']:
    body = m['content'] if len(m['content'])<=70 else m['content'][:67]+'...'
    print(f\"  [{m['role']:9s} {m['status']:8s}] {body}\")
"

step "7. Browser B logs out"
curl -s -o /dev/null -w "  POST /auth/logout -> HTTP %{http_code}\n" -b "$B" -c "$B" -X POST "$API/auth/logout"
printf "  GET /conversations with the logged-out jar -> HTTP %s\n" \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$B" "$API/conversations")"

step "8. Log back in (jar C) and list again"
curl -s -c "$C" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" > /dev/null
echo "  C session cookie: ...$(awk '/docuquery_session/{print substr($7,length($7)-15)}' "$C")  (a newly minted session)"
echo
curl -s -b "$C" "$API/conversations" | python -m json.tool

step "9. And the transcript is still there"
curl -s -b "$C" "$API/conversations/$CONV" | python -c "
import json,sys
d=json.load(sys.stdin)
print('messages:')
for m in d['messages']:
    body = m['content'] if len(m['content'])<=70 else m['content'][:67]+'...'
    print(f\"  [{m['role']:9s} {m['status']:8s}] {body}\")
"

step "10. A different account cannot see it"
OTHER="intruder-$(date +%s)@example.invalid"
curl -s -c "$DIR/x.txt" -X POST "$API/auth/signup" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Someone Else\",\"email\":\"$OTHER\",\"password\":\"$PASS\"}" > /dev/null
OTHER_TOTAL=$(curl -s -b "$DIR/x.txt" "$API/conversations" \
  | python -c 'import json,sys; print(json.load(sys.stdin)["total"])')
OTHER_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$DIR/x.txt" "$API/conversations/$CONV")
printf "  their GET /conversations         -> total=%s\n" "$OTHER_TOTAL"
printf "  their GET /conversations/%s... -> HTTP %s  (404, not 403)\n" "${CONV:0:8}" "$OTHER_CODE"
hr
