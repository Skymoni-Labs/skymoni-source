import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'
import { saveAccountIdentity } from '@/lib/site-identity'

import type { UserProfile } from '../types'

export function DisplayNameCard({
  profile,
  onUpdate,
}: {
  profile: UserProfile | null
  onUpdate: () => Promise<void>
}) {
  return (
    <DisplayNameForm
      key={`${profile?.id}:${profile?.display_name}:${profile?.username}`}
      profile={profile}
      onUpdate={onUpdate}
    />
  )
}

function DisplayNameForm({
  profile,
  onUpdate,
}: {
  profile: UserProfile | null
  onUpdate: () => Promise<void>
}) {
  const [name, setName] = useState(
    profile?.display_name || profile?.username || ''
  )
  const [busy, setBusy] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>站点个人资料</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className='space-y-3'
          onSubmit={(event) => {
            event.preventDefault()
            setBusy(true)
            void saveAccountIdentity({ name: name.trim() })
              .then(async () => {
                await onUpdate()
                toast.success('名称已同步至中转站和社区')
              })
              .catch(handleServerError)
              .finally(() => setBusy(false))
          }}
        >
          <Label htmlFor='site-display-name'>显示名称</Label>
          <Input
            id='site-display-name'
            value={name}
            maxLength={20}
            required
            disabled={busy || !profile}
            onChange={(event) => setName(event.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            名称和头像在中转站、社区与创作主页统一显示。
          </p>
          <Button type='submit' disabled={busy || !profile || !name.trim()}>
            {busy ? '正在保存…' : '保存名称'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
