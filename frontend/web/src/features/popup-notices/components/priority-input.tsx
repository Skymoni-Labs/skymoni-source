/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useState } from 'react'

import { Input } from '@/components/ui/input'

// Preserve an empty editing buffer instead of forcing 0 back after Backspace.
export function PopupPriorityInput(props: {
  value: number
  onChange: (value: number) => void
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const [draft, setDraft] = useState(String(props.value))
  return (
    <Input
      type='number'
      min={0}
      max={100}
      step={1}
      id={props.id}
      aria-invalid={props['aria-invalid']}
      aria-describedby={props['aria-describedby']}
      value={draft}
      onChange={(event) => {
        const value = event.target.value
        setDraft(value)
        props.onChange(value === '' ? 0 : Number(value))
      }}
    />
  )
}
