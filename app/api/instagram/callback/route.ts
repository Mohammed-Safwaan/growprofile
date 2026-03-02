import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { encryptToken } from '@/lib/encryption'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
const GRAPH_BASE = 'https://graph.facebook.com/v25.0'

/**
 * Exchange short-lived IG token for a long-lived IG token (60 days).
 */
async function exchangeForLongLivedToken(shortToken: string): Promise<{
  access_token: string
  token_type: string
  expires_in: number
}> {
  const url = new URL('https://graph.instagram.com/access_token')
  url.searchParams.set('grant_type', 'ig_exchange_token')
  url.searchParams.set('client_secret', process.env.INSTAGRAM_APP_SECRET!)
  url.searchParams.set('access_token', shortToken)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Long-lived token exchange failed: ${err}`)
  }
  return res.json()
}

/**
 * Fetch the Instagram user profile.
 */
async function fetchIgProfile(
  accessToken: string
): Promise<{ id: string; username: string }> {
  // Use `id` (not `user_id`) — `id` is the OAuth-scoped IG user ID required
  // by graph.instagram.com/{id}/messages for sending DMs.
  // `user_id` returns the FB-side IG Business Account ID which does NOT work
  // with graph.instagram.com messaging endpoints.
  const url = `https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${accessToken}`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`IG profile fetch failed: ${err}`)
  }
  const data = await res.json()
  return { id: data.id, username: data.username }
}

/**
 * Step 2: Fetch connected Facebook Pages using the IG user token.
 * Returns pages with their Page Access Tokens.
 */
async function fetchConnectedPages(igUserToken: string): Promise<
  Array<{ id: string; name: string; access_token: string }>
> {
  const url = `${GRAPH_BASE}/me/accounts?fields=id,name,access_token&access_token=${igUserToken}`
  console.log('[IG Callback] Fetching connected pages...')
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to fetch Facebook pages: ${err}`)
  }
  const data = await res.json()
  console.log(`[IG Callback] Found ${data.data?.length || 0} page(s)`)
  return data.data || []
}

/**
 * Step 3: Fetch Instagram Business Account ID from a Facebook Page.
 */
async function fetchIgBusinessId(
  pageId: string,
  pageAccessToken: string
): Promise<string | null> {
  const url = `${GRAPH_BASE}/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
  console.log(`[IG Callback] Fetching IG business ID for page ${pageId}...`)
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.text()
    console.error(`[IG Callback] Failed to fetch IG business ID: ${err}`)
    return null
  }
  const data = await res.json()
  return data.instagram_business_account?.id || null
}

/**
 * GET /api/instagram/callback
 * Instagram redirects here after user authorizes the app.
 * Flow:
 *   1. Exchange code for short-lived IG token
 *   2. Exchange for long-lived IG token
 *   3. Fetch IG profile
 *   4. Fetch connected Facebook Pages → get PAGE_ACCESS_TOKEN
 *   5. Fetch IG Business ID from the Page
 *   6. Store everything: IG token + PAGE_ACCESS_TOKEN + page_id + ig_business_id
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')
  const errorReason = searchParams.get('error_reason')
  const errorDescription = searchParams.get('error_description')

  // ─── Handle denial / error ─────────────────────────────
  if (error) {
    console.error('Instagram auth denied:', { error, errorReason, errorDescription })
    const redirectUrl = new URL('/dashboard/account', FRONTEND_URL)
    redirectUrl.searchParams.set('ig_error', errorDescription || error)
    return NextResponse.redirect(redirectUrl.toString())
  }

  if (!code || !stateParam) {
    const redirectUrl = new URL('/dashboard/account', FRONTEND_URL)
    redirectUrl.searchParams.set('ig_error', 'Missing authorization code')
    return NextResponse.redirect(redirectUrl.toString())
  }

  // ─── Decode state to get userId ────────────────────────
  let userId: string
  try {
    const stateData = JSON.parse(
      Buffer.from(stateParam, 'base64url').toString()
    )
    userId = stateData.userId
    if (Date.now() - stateData.ts > 10 * 60 * 1000) {
      throw new Error('State expired')
    }
  } catch {
    const redirectUrl = new URL('/dashboard/account', FRONTEND_URL)
    redirectUrl.searchParams.set('ig_error', 'Invalid or expired state')
    return NextResponse.redirect(redirectUrl.toString())
  }

  try {
    // ─── Step 1: Exchange code for short-lived IG token ───
    const tokenRes = await fetch(
      'https://api.instagram.com/oauth/access_token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.INSTAGRAM_APP_SECRET!,
          grant_type: 'authorization_code',
          redirect_uri: process.env.INSTAGRAM_REDIRECT_URI!,
          code,
        }),
      }
    )

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('Token exchange failed:', errBody)
      throw new Error('Failed to exchange authorization code')
    }

    const tokenData = await tokenRes.json()
    const shortLivedToken: string = tokenData.access_token
    const igUserIdFromToken: string = String(tokenData.user_id)

    // ─── Step 2: Exchange for long-lived IG token (60 days)
    const longLived = await exchangeForLongLivedToken(shortLivedToken)
    const igAccessToken = longLived.access_token
    const expiresIn = longLived.expires_in

    // ─── Step 3: Fetch IG profile ────────────────────────
    const igProfile = await fetchIgProfile(igAccessToken)
    const igUserId = igProfile.id || igUserIdFromToken
    const igUsername = igProfile.username

    // ─── Step 4: Fetch connected Pages → PAGE_ACCESS_TOKEN
    let pageId: string | null = null
    let pageName: string | null = null
    let pageAccessToken: string | null = null
    let igBusinessId: string | null = null

    try {
      const pages = await fetchConnectedPages(igAccessToken)
      if (pages.length > 0) {
        // Try each page to find one with an IG business account
        for (const page of pages) {
          const bizId = await fetchIgBusinessId(page.id, page.access_token)
          if (bizId) {
            pageId = page.id
            pageName = page.name
            pageAccessToken = page.access_token
            igBusinessId = bizId
            console.log(
              `[IG Callback] ✅ Found Page "${pageName}" (${pageId}) → IG Business ${igBusinessId}`
            )
            break
          }
        }
        if (!pageAccessToken) {
          console.warn('[IG Callback] Pages found but none have an IG business account linked')
        }
      } else {
        console.warn('[IG Callback] No Facebook Pages found for this IG user token')
      }
    } catch (pageErr) {
      // Non-fatal — we still have the IG token
      console.error('[IG Callback] Page fetch failed (non-fatal):', pageErr)
    }

    // ─── Step 5: Verify user exists and check plan limits ─
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { plan: true, instagramAccounts: true },
    })

    if (!user) {
      throw new Error('User not found in database')
    }

    const maxAccounts = user.plan?.maxIgAccounts ?? 1
    const existingCount = user.instagramAccounts.length
    const alreadyConnected = user.instagramAccounts.find(
      (a) => a.igUserId === igUserId
    )

    if (!alreadyConnected && existingCount >= maxAccounts) {
      const redirectUrl = new URL('/dashboard/account', FRONTEND_URL)
      redirectUrl.searchParams.set(
        'ig_error',
        `Your ${user.plan?.displayName || 'Starter'} plan allows up to ${maxAccounts} Instagram account(s). Upgrade to connect more.`
      )
      return NextResponse.redirect(redirectUrl.toString())
    }

    // ─── Step 6: Encrypt & store IG token + Page token ────
    const encryptedIgToken = encryptToken(igAccessToken)
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000)

    // Encrypt Page Access Token separately (if we got one)
    const encryptedPageToken = pageAccessToken
      ? encryptToken(pageAccessToken)
      : null

    const igAccount = await prisma.instagramAccount.upsert({
      where: { igUserId },
      update: {
        igUsername,
        accessTokenEncrypted: encryptedIgToken.accessTokenEncrypted,
        accessTokenIv: encryptedIgToken.accessTokenIv,
        accessTokenTag: encryptedIgToken.accessTokenTag,
        tokenExpiresAt,
        // Page fields
        pageId: pageId || undefined,
        pageName: pageName || undefined,
        pageAccessTokenEncrypted: encryptedPageToken?.accessTokenEncrypted || undefined,
        pageAccessTokenIv: encryptedPageToken?.accessTokenIv || undefined,
        pageAccessTokenTag: encryptedPageToken?.accessTokenTag || undefined,
        igBusinessId: igBusinessId || undefined,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        igUserId,
        igUsername,
        accessTokenEncrypted: encryptedIgToken.accessTokenEncrypted,
        accessTokenIv: encryptedIgToken.accessTokenIv,
        accessTokenTag: encryptedIgToken.accessTokenTag,
        tokenExpiresAt,
        // Page fields
        pageId,
        pageName,
        pageAccessTokenEncrypted: encryptedPageToken?.accessTokenEncrypted || null,
        pageAccessTokenIv: encryptedPageToken?.accessTokenIv || null,
        pageAccessTokenTag: encryptedPageToken?.accessTokenTag || null,
        igBusinessId,
        isActive: true,
      },
    })

    // ─── Audit log ────────────────────────────────────────
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'INSTAGRAM_ACCOUNT_CONNECTED',
        entityType: 'InstagramAccount',
        entityId: igAccount.id,
        details: {
          igUsername,
          igUserId,
          pageId,
          pageName,
          igBusinessId,
          hasPageToken: !!pageAccessToken,
        },
        ipAddress:
          request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      },
    })

    console.log(
      `[IG Callback] ✅ Stored IG account @${igUsername} (${igUserId}) for user ${userId}` +
      (pageId ? `, Page ${pageId}, IG Biz ${igBusinessId}` : ', NO page token')
    )

    // ─── Redirect to dashboard with success ───────────────
    const redirectUrl = new URL('/dashboard/account', FRONTEND_URL)
    redirectUrl.searchParams.set('ig_connected', igUsername)
    return NextResponse.redirect(redirectUrl.toString())
  } catch (err: any) {
    console.error('Instagram callback error:', err)

    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'INSTAGRAM_AUTH_FAILED',
          entityType: 'InstagramAccount',
          details: { error: err.message || String(err) },
          ipAddress:
            request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      })
    } catch {
      // ignore logging errors
    }

    const redirectUrl = new URL('/dashboard/account', FRONTEND_URL)
    redirectUrl.searchParams.set(
      'ig_error',
      err.message || 'Failed to connect Instagram'
    )
    return NextResponse.redirect(redirectUrl.toString())
  }
}
