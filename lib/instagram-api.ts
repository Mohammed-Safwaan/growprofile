/**
 * Instagram Graph API helper functions.
 * Handles DM sending, follower checking, comment replies, and webhook subscriptions.
 */

const IG_API_VERSION = 'v25.0'
const IG_API_BASE = `https://graph.facebook.com/${IG_API_VERSION}`

// IG Business Login messaging uses graph.instagram.com (NOT graph.facebook.com).
// The instagram_business_manage_messages scope only works at this endpoint.
const IG_MESSAGING_VERSION = 'v21.0'
const IG_MESSAGING_BASE = `https://graph.instagram.com/${IG_MESSAGING_VERSION}`

// ─── Types ────────────────────────────────────────────────

export interface IgSendMessageResult {
  recipient_id: string
  message_id: string
}

export interface IgCommentReplyResult {
  id: string
}

export interface IgFollowerCheckResult {
  is_following: boolean
}

// ─── Send DM via Instagram Messaging API ──────────────────

/**
 * Send a DM (text) to a user via the IG Messaging API.
 * Uses: POST /{ig-user-id}/messages at graph.instagram.com
 * Requires: instagram_business_manage_messages scope (IG Business Login)
 *
 * IMPORTANT: Use the IG User Token from OAuth (NOT the Page Access Token).
 * Page Access Tokens do NOT have messaging capability at this endpoint.
 *
 * @param igUserId - The IG user ID from IG Business Login OAuth (not igBusinessId)
 * @param recipientId - The IGSID of the recipient (comment.from.id)
 * @param messageText - The text message to send
 * @param accessToken - The IG User Token (from instagram_business_manage_messages OAuth)
 */
export async function sendInstagramDM(
  igUserId: string,
  recipientId: string,
  messageText: string,
  accessToken: string
): Promise<IgSendMessageResult> {
  const url = `${IG_MESSAGING_BASE}/${igUserId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: messageText },
      access_token: accessToken,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`IG DM send failed (${res.status}): ${err}`)
  }

  return res.json()
}

// ─── Reply to a comment ────────────────────────────────────

/**
 * Post a reply to a comment on an IG media.
 * Uses: POST /{ig-user-id}/messages (for private reply) OR
 *       POST /{comment-id}/replies for public reply
 *
 * @param commentId - The comment to reply to
 * @param message - The reply text
 * @param accessToken - Page/IG access token
 */
export async function replyToComment(
  commentId: string,
  message: string,
  accessToken: string
): Promise<IgCommentReplyResult> {
  const url = `${IG_API_BASE}/${commentId}/replies`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`IG comment reply failed (${res.status}): ${err}`)
  }

  return res.json()
}

// ─── Send private reply to a comment ───────────────────────

/**
 * Send a private (DM) reply to a comment.
 * Uses: POST /{ig-user-id}/messages at graph.instagram.com with recipient.comment_id
 * Requires: instagram_business_manage_messages scope (IG Business Login)
 *
 * IMPORTANT: Use the IG User Token from OAuth (NOT the Page Access Token).
 *
 * @param igUserId - The IG user ID from IG Business Login OAuth
 * @param commentId - The comment ID to privately reply to
 * @param messageText - The DM text
 * @param accessToken - The IG User Token
 */
export async function sendPrivateReply(
  igUserId: string,
  commentId: string,
  messageText: string,
  accessToken: string
): Promise<IgSendMessageResult> {
  const url = `${IG_MESSAGING_BASE}/${igUserId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: messageText },
      access_token: accessToken,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`IG private reply failed (${res.status}): ${err}`)
  }

  return res.json()
}

// ─── Check if user follows the account ─────────────────────

/**
 * Check if a user with the given IGSID follows the business account.
 * Uses: GET /{ig-user-id}?fields=follower_count (limited)
 *
 * Note: The IG API doesn't directly expose "does user X follow me".
 * We use the conversation API or check during webhook processing.
 * For follow-gating, we rely on the `messaging_referral` webhook approach.
 *
 * This is a placeholder — the actual implementation depends on
 * available permissions and API endpoints.
 */
export async function checkFollowStatus(
  igUserId: string,
  targetUserId: string,
  accessToken: string
): Promise<boolean> {
  // Instagram doesn't have a direct "is_following" endpoint for IGSID.
  // The recommended approach is to use the Follower/Following edges
  // on the IG User node, but these require specific permissions.
  //
  // For now, we'll use the conversations endpoint to check
  // if the user has an existing conversation (indicates engagement).
  // A more robust approach would use the webhook's follow event.

  try {
    const url = `${IG_API_BASE}/${igUserId}/conversations?user_id=${targetUserId}&fields=id&access_token=${accessToken}`
    const res = await fetch(url)
    if (!res.ok) return false
    const data = await res.json()
    return data.data && data.data.length > 0
  } catch {
    return false
  }
}

// ─── Fetch comment details ─────────────────────────────────

export interface IgCommentDetails {
  id: string
  text: string
  from: { id: string; username: string }
  media: { id: string }
  timestamp: string
}

/**
 * Fetch details of a specific comment.
 */
export async function fetchCommentDetails(
  commentId: string,
  accessToken: string
): Promise<IgCommentDetails> {
  const url = `${IG_API_BASE}/${commentId}?fields=id,text,from,media,timestamp&access_token=${accessToken}`

  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`IG comment fetch failed (${res.status}): ${err}`)
  }

  return res.json()
}

// ─── Fetch comments on a media post ────────────────────────

export interface IgComment {
  id: string
  text: string
  from: { id: string; username: string }
  timestamp: string
}

export type CommentApiMode = 'facebook' | 'instagram'

/**
 * Fetch all comments on a media post.
 * Uses: GET /{media-id}/comments
 * Handles pagination automatically.
 *
 * @param mediaId - The IG media ID
 * @param accessToken - Page/IG access token
 * @param limit - Max comments to fetch (default 100)
 */
export async function fetchMediaComments(
  mediaId: string,
  accessToken: string,
  limit: number = 100,
  mode: CommentApiMode = 'facebook'
): Promise<IgComment[]> {
  const allComments: IgComment[] = []
  let url: string | null = mode === 'instagram'
    ? `https://graph.instagram.com/${IG_MESSAGING_VERSION}/${mediaId}/comments?fields=id,text,username,timestamp,from&limit=50&access_token=${accessToken}`
    : `${IG_API_BASE}/${mediaId}/comments?fields=id,text,from,timestamp&limit=50&access_token=${accessToken}`

  while (url && allComments.length < limit) {
    const res: Response = await fetch(url)
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`IG comments fetch failed (${res.status}): ${err}`)
    }

    const data: any = await res.json()
    if (data.data) {
      const normalized = (data.data as Array<Record<string, unknown>>).map((comment) => {
        const from = (comment.from as Record<string, unknown> | undefined) || undefined
        const username = String(from?.username || comment.username || '')
        const fallbackId = username ? `username:${username}` : `comment:${String(comment.id || '')}`

        return {
          id: String(comment.id || ''),
          text: String(comment.text || ''),
          timestamp: String(comment.timestamp || ''),
          from: {
            id: String(from?.id || fallbackId),
            username,
          },
        } satisfies IgComment
      })

      allComments.push(...normalized)
    }

    // Follow pagination cursor
    url = data.paging?.next || null
  }

  return allComments.slice(0, limit)
}

// ─── Subscribe to webhooks ─────────────────────────────────

/**
 * Subscribe an Instagram account to webhook events.
 * Uses the App-level subscription endpoint.
 * This should be called once during app setup, not per-user.
 *
 * Per-user webhook subscriptions are handled through the
 * Instagram API's page subscribed apps endpoint.
 */
export async function subscribeToWebhooks(
  igUserId: string,
  accessToken: string,
  subscribedFields: string[] = ['comments', 'messages', 'messaging_postbacks']
): Promise<boolean> {
  // Subscribe the IG user's page to the app's webhooks
  const url = `${IG_API_BASE}/${igUserId}/subscribed_apps`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscribed_fields: subscribedFields,
      access_token: accessToken,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`Webhook subscription failed for ${igUserId}:`, err)
    return false
  }

  const data = await res.json()
  return data.success === true
}

// ─── Unsubscribe from webhooks ─────────────────────────────

export async function unsubscribeFromWebhooks(
  igUserId: string,
  accessToken: string
): Promise<boolean> {
  const url = `${IG_API_BASE}/${igUserId}/subscribed_apps`

  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`Webhook unsubscription failed for ${igUserId}:`, err)
    return false
  }

  return true
}

// ─── Token Debug & Page Token Helpers ────────────────────────

export interface TokenDebugData {
  app_id: string
  type: string
  application: string
  /** Unix timestamp. 0 means "never expires". */
  expires_at: number
  /** Unix timestamp for data access expiry. */
  data_access_expires_at: number
  is_valid: boolean
  scopes: string[]
  user_id?: string
}

/**
 * Inspect a token using the Graph API's /debug_token endpoint.
 * Returns validity, expiry timestamp (0 = never), scopes, etc.
 *
 * @param inputToken  - The token to inspect
 * @param appId       - Facebook App ID
 * @param appSecret   - Facebook App Secret
 */
export async function debugToken(
  inputToken: string,
  appId: string,
  appSecret: string
): Promise<TokenDebugData> {
  const appToken = `${appId}|${appSecret}`
  const url = `${IG_API_BASE}/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(appToken)}`

  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`debug_token failed (${res.status}): ${err}`)
  }

  const json = await res.json()
  if (json.error) throw new Error(`debug_token error: ${JSON.stringify(json.error)}`)
  return json.data as TokenDebugData
}

export interface FacebookPage {
  id: string
  name: string
  access_token: string
}

/**
 * Fetch the Facebook Pages the given user manages, including their Page Access Tokens.
 * Requires a long-lived User token or IG User token.
 * The returned Page tokens are non-expiring when derived from a long-lived user token.
 *
 * @param userToken - Long-lived IG or Facebook User access token
 */
export async function fetchPagesForUser(userToken: string): Promise<FacebookPage[]> {
  const url = `${IG_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`

  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`fetch /me/accounts failed (${res.status}): ${err}`)
  }

  const json = await res.json()
  if (json.error) throw new Error(`/me/accounts error: ${JSON.stringify(json.error)}`)
  return (json.data || []) as FacebookPage[]
}

// ─── Rate limiting helper ──────────────────────────────────

/**
 * Instagram API rate limits:
 * - Messaging: 250 messages per user per 24 hours
 * - Comments: Platform limits apply
 *
 * This helper tracks and enforces rate limits via Redis.
 */
export const RATE_LIMITS = {
  DM_PER_HOUR: 40,       // Conservative: 40 DMs per IG account per hour
  DM_PER_DAY: 200,       // Conservative: 200 DMs per IG account per day
  COMMENT_REPLY_PER_HOUR: 30,
  API_CALLS_PER_HOUR: 200,
}

/**
 * Build a rate limit key for Redis.
 */
export function rateLimitKey(
  igAccountId: string,
  action: 'dm' | 'comment_reply' | 'api_call',
  window: 'hour' | 'day'
): string {
  const now = new Date()
  const windowKey = window === 'hour'
    ? `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`
    : `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`
  return `ratelimit:${igAccountId}:${action}:${window}:${windowKey}`
}
