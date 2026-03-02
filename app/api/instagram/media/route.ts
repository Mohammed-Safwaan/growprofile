import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { decryptToken } from '@/lib/encryption'
import { AuthUser } from '@/lib/auth'

/**
 * GET /api/instagram/media?accountId=xxx&limit=25&after=cursor
 * Fetch recent media from a connected Instagram account.
 */
export const GET = withAuth(async (request: NextRequest, user: AuthUser) => {
  const accountId = request.nextUrl.searchParams.get('accountId')
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || 25), 50)
  const after = request.nextUrl.searchParams.get('after') // pagination cursor

  if (!accountId) {
    return NextResponse.json(
      { error: 'accountId query param is required' },
      { status: 400 }
    )
  }

  const account = await prisma.instagramAccount.findUnique({
    where: { id: accountId },
  })

  if (!account || account.userId !== user.id) {
    return NextResponse.json(
      { error: 'Account not found' },
      { status: 404 }
    )
  }

  const accessToken = decryptToken({
    accessTokenEncrypted: account.accessTokenEncrypted,
    accessTokenIv: account.accessTokenIv,
    accessTokenTag: account.accessTokenTag,
  })

  if (!accessToken) {
    return NextResponse.json(
      { error: 'No valid access token. Please reconnect the account.' },
      { status: 400 }
    )
  }

  try {
    const fields = [
      'id',
      'caption',
      'media_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'timestamp',
      'like_count',
      'comments_count',
    ].join(',')

    // Prefer Page token + igBusinessId → graph.facebook.com (needed for full comments API)
    // Fall back to IG user token → graph.instagram.com (works for accounts without a FB Page)
    let apiBase: string
    let apiToken = accessToken
    let apiIgId = account.igUserId

    if (account.pageAccessTokenEncrypted && account.igBusinessId) {
      const pageToken = decryptToken({
        accessTokenEncrypted: account.pageAccessTokenEncrypted,
        accessTokenIv: account.pageAccessTokenIv,
        accessTokenTag: account.pageAccessTokenTag,
      })
      if (pageToken) {
        apiToken = pageToken
        apiIgId = account.igBusinessId
        apiBase = 'https://graph.facebook.com/v25.0'
      } else {
        apiBase = 'https://graph.instagram.com/v21.0'
      }
    } else {
      // No Page token — use IG user token with graph.instagram.com
      apiBase = 'https://graph.instagram.com/v21.0'
    }

    const url = new URL(`${apiBase}/${apiIgId}/media`)
    url.searchParams.set('fields', fields)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('access_token', apiToken)
    if (after) url.searchParams.set('after', after)

    const res = await fetch(url.toString())
    if (!res.ok) {
      const errBody = await res.text()
      console.error('IG media fetch failed:', errBody)

      // If token is invalid, mark account
      if (res.status === 401 || res.status === 403) {
        await prisma.instagramAccount.update({
          where: { id: accountId },
          data: { isActive: false },
        })
      }

      throw new Error('Failed to fetch media from Instagram')
    }

    const data = await res.json()

    return NextResponse.json({
      success: true,
      media: data.data || [],
      paging: data.paging || null,
    })
  } catch (err: any) {
    console.error('Media fetch error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to fetch media' },
      { status: 500 }
    )
  }
})
