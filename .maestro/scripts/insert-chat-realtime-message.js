const supabaseUrl = "http://127.0.0.1:54321"
const anonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
const senderEmail = "phase4.chat.event@example.com"
const senderPassword = "Password123!"
const recipientUserId = "00000000-0000-4000-8000-000000000201"

function parseJsonResponse(response, label) {
  if (response.status >= 400) {
    throw new Error(`${label} failed with ${response.status}: ${response.body}`)
  }

  return json(response.body)
}

const authResponse = http.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  headers: {
    apikey: anonKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email: senderEmail, password: senderPassword }),
})

const authData = parseJsonResponse(authResponse, "Peer sign in")
const accessToken = authData.access_token
if (!accessToken) throw new Error("Peer sign in did not return an access token")

const conversationResponse = http.post(`${supabaseUrl}/rest/v1/rpc/upsert_conversation`, {
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ p_other_user_id: recipientUserId }),
})

const conversationRows = parseJsonResponse(conversationResponse, "Peer upsert_conversation")
const conversation = Array.isArray(conversationRows) ? conversationRows[0] : conversationRows
const conversationId = conversation?.conversation_id
if (!conversationId) throw new Error("Peer upsert_conversation did not return a conversation id")

const messageBody = `Live realtime message ${Date.now()}`
const rpcResponse = http.post(`${supabaseUrl}/rest/v1/rpc/send_message`, {
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ p_conversation_id: conversationId, p_body: messageBody }),
})

const messageRows = parseJsonResponse(rpcResponse, "Peer send_message")
const insertedMessage = Array.isArray(messageRows) ? messageRows[0] : messageRows
output.realtimeMessageBody = insertedMessage?.body || messageBody
output.realtimeMessageSender = insertedMessage?.sender_display_name || "Lena Cruz"
