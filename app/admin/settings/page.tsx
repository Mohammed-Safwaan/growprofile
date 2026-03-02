'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

interface SettingValue {
  value: any
  updatedAt: string | null
  updatedBy: string | null
}

const SETTING_GROUPS = [
  {
    title: 'General Settings',
    fields: [
      { key: 'platform_name', label: 'Platform Name', type: 'text', default: 'GrowProfile' },
      { key: 'support_email', label: 'Support Email', type: 'email', default: 'support@growprofile.com' },
      { key: 'api_base_url', label: 'API Base URL', type: 'text', default: 'https://api.growprofile.com' },
    ],
  },
  {
    title: 'Email Configuration',
    fields: [
      { key: 'smtp_host', label: 'SMTP Host', type: 'text', default: '' },
      { key: 'smtp_port', label: 'SMTP Port', type: 'number', default: '587' },
      { key: 'email_from', label: 'From Address', type: 'email', default: '' },
      { key: 'resend_api_key', label: 'Resend API Key', type: 'password', default: '' },
    ],
  },
  {
    title: 'Instagram / Meta',
    fields: [
      { key: 'meta_app_id', label: 'Meta App ID', type: 'text', default: '' },
      { key: 'meta_app_secret', label: 'Meta App Secret', type: 'password', default: '' },
      { key: 'meta_webhook_verify', label: 'Webhook Verify Token', type: 'text', default: '' },
    ],
  },
  {
    title: 'Limits & Rate Control',
    fields: [
      { key: 'max_dm_per_hour', label: 'Max DMs / Hour (per user)', type: 'number', default: '50' },
      { key: 'max_campaigns_free', label: 'Max Campaigns (Free)', type: 'number', default: '2' },
      { key: 'max_campaigns_pro', label: 'Max Campaigns (Pro)', type: 'number', default: '20' },
      { key: 'abuse_auto_suspend', label: 'Auto-suspend after N flags', type: 'number', default: '5' },
    ],
  },
  {
    title: 'Security',
    fields: [
      { key: 'require_email_verification', label: 'Require Email Verification', type: 'checkbox', default: true },
      { key: 'session_timeout_minutes', label: 'Session Timeout (minutes)', type: 'number', default: '30' },
    ],
  },
]

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, SettingValue>>({})
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const { authFetch } = useAuth()

  useEffect(() => {
    fetchSettings()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSettings = async () => {
    try {
      const response = await authFetch('/api/admin/settings')
      const data = await response.json()
      if (data.success) {
        setSettings(data.settings || {})
        const vals: Record<string, any> = {}
        for (const group of SETTING_GROUPS) {
          for (const field of group.fields) {
            const stored = data.settings[field.key]
            vals[field.key] = stored?.value ?? field.default
          }
        }
        setFormValues(vals)
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveGroup = async (groupTitle: string, fields: typeof SETTING_GROUPS[0]['fields']) => {
    setSaving(groupTitle)
    try {
      const settingsToSave: Record<string, any> = {}
      for (const field of fields) {
        settingsToSave[field.key] = formValues[field.key]
      }

      const response = await authFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: settingsToSave }),
      })

      if (response.ok) {
        setSaved(groupTitle)
        setTimeout(() => setSaved(null), 2000)
        fetchSettings()
      }
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setSaving(null)
    }
  }

  const handleChange = (key: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Settings</h1>
        <p className="text-slate-600">Configure platform-wide settings. Changes are persisted to the database.</p>
      </div>

      {SETTING_GROUPS.map((group) => (
        <Card key={group.title} className="mb-6">
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {group.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-slate-900 mb-2">{field.label}</label>
                {field.type === 'checkbox' ? (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded border-slate-300"
                      checked={!!formValues[field.key]}
                      onChange={(e) => handleChange(field.key, e.target.checked)}
                    />
                    <span className="text-sm text-slate-600">
                      {formValues[field.key] ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                ) : (
                  <Input
                    type={field.type}
                    value={formValues[field.key] ?? ''}
                    onChange={(e) =>
                      handleChange(
                        field.key,
                        field.type === 'number' ? Number(e.target.value) : e.target.value
                      )
                    }
                    className="max-w-md"
                  />
                )}
                {settings[field.key]?.updatedBy && (
                  <p className="text-xs text-slate-400 mt-1">
                    Last updated by {settings[field.key].updatedBy}{' '}
                    {settings[field.key].updatedAt && (
                      <>on {new Date(settings[field.key].updatedAt!).toLocaleDateString()}</>
                    )}
                  </p>
                )}
              </div>
            ))}
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={() => handleSaveGroup(group.title, group.fields)}
              disabled={saving === group.title}
            >
              {saving === group.title ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
              ) : saved === group.title ? (
                <><CheckCircle2 className="w-4 h-4 mr-2" /> Saved!</>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> Save Changes</>
              )}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
