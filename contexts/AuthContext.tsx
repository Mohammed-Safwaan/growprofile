'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth'
import { auth } from '@/lib/firebase'

export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN'

interface PlanInfo {
  id: string
  name: string
  displayName: string
  maxIgAccounts: number
  maxLeads: number
  features: Record<string, boolean>
}

interface SubscriptionInfo {
  id: string
  status: string
  currentPeriodEnd: string | null
}

interface InstagramAccountInfo {
  id: string
  igUsername: string
  igUserId: string
  isActive: boolean
  tokenExpiresAt: string | null
  subscribedWebhooks: boolean
}

interface User {
  id: string
  firebaseUid: string
  email: string
  name: string | null
  avatarUrl: string | null
  role: UserRole
  status: string
  plan: PlanInfo | null
  subscription: SubscriptionInfo | null
  instagramAccounts: InstagramAccountInfo[]
  stats: {
    campaigns: number
    leads: number
  }
}

interface AuthContextType {
  user: User | null
  firebaseUser: FirebaseUser | null
  loading: boolean
  syncing: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
  authFetch: (url: string, options?: RequestInit) => Promise<Response>
  isAuthenticated: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Sync Firebase user with PostgreSQL backend.
 * Returns the enriched user profile from the database.
 */
async function syncUserWithBackend(firebaseUser: FirebaseUser): Promise<User | null> {
  try {
    const idToken = await firebaseUser.getIdToken()
    const response = await fetch('/api/auth/sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Auth sync failed:', response.status)
      return null
    }

    const result = await response.json()
    if (result.success && result.data) {
      return result.data as User
    }
    return null
  } catch (error) {
    console.error('Auth sync error:', error)
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  // Sync with backend when Firebase auth state changes
  const syncProfile = useCallback(async (fbUser: FirebaseUser) => {
    setSyncing(true)
    try {
      const dbUser = await syncUserWithBackend(fbUser)
      setUser(dbUser)
      if (dbUser) {
        // Set a cookie so the Edge middleware can detect auth state
        document.cookie = `auth-session=1; path=/; max-age=3600; SameSite=Lax`
        if (dbUser.role === 'ADMIN' || dbUser.role === 'SUPER_ADMIN') {
          document.cookie = `user-role=${dbUser.role}; path=/; max-age=3600; SameSite=Lax`
        }
      }
    } catch (error) {
      console.error('Profile sync failed:', error)
    } finally {
      setSyncing(false)
    }
  }, [])

  // Manual refresh (e.g., after connecting IG account, changing plan)
  const refreshProfile = useCallback(async () => {
    if (firebaseUser) {
      await syncProfile(firebaseUser)
    }
  }, [firebaseUser, syncProfile])

  // Listen to Firebase auth state changes
  useEffect(() => {
    if (typeof window === 'undefined' || !auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser)
      if (fbUser) {
        await syncProfile(fbUser)
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [syncProfile])

  const login = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not initialized')
    setLoading(true)
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      // Sync happens automatically via onAuthStateChanged
    } catch (error: any) {
      setLoading(false)
      throw new Error(error.message || 'Failed to login')
    }
  }

  const signup = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not initialized')
    setLoading(true)
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)
      // Sync happens automatically via onAuthStateChanged — creates user in DB
    } catch (error: any) {
      setLoading(false)
      throw new Error(error.message || 'Failed to create account')
    }
  }

  const loginWithGoogle = async () => {
    if (!auth) throw new Error('Firebase not initialized')
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      // Sync happens automatically via onAuthStateChanged
    } catch (error: any) {
      setLoading(false)
      throw new Error(error.message || 'Failed to login with Google')
    }
  }

  const logout = async () => {
    if (!auth) throw new Error('Firebase not initialized')
    await signOut(auth)
    setUser(null)
    setFirebaseUser(null)
    // Clear auth cookies
    document.cookie = 'auth-session=; path=/; max-age=0'
    document.cookie = 'user-role=; path=/; max-age=0'
  }

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  /**
   * Fetch wrapper that automatically includes the Firebase auth token.
   * Use this for all authenticated API calls from client components.
   */
  const authFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const fbUser = firebaseUser
    if (!fbUser) {
      throw new Error('Not authenticated')
    }
    const idToken = await fbUser.getIdToken()
    const headers = new Headers(options.headers || {})
    headers.set('Authorization', `Bearer ${idToken}`)
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json')
    }
    return fetch(url, { ...options, headers })
  }, [firebaseUser])

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        syncing,
        login,
        signup,
        loginWithGoogle,
        logout,
        refreshProfile,
        authFetch,
        isAuthenticated: !!user,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
