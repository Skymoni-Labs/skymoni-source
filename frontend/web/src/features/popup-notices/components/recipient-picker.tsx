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
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox'
import { getUser, searchUsers } from '@/features/users/api'
import { useDebounce } from '@/hooks/use-debounce'
import { requireServerSuccess } from '@/lib/server-error-message'

interface Recipient {
  id: number
  username: string
  display_name: string
}

export function RecipientPicker(props: {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const debounced = useDebounce(keyword, 300)
  const anchor = useComboboxAnchor()
  const users = useQuery({
    queryKey: ['popup-recipient-search', debounced],
    queryFn: async () =>
      requireServerSuccess(
        await searchUsers({ keyword: debounced, page_size: 15 })
      ).data?.items ?? [],
  })
  const selected = useQuery({
    queryKey: ['popup-recipient', props.value],
    queryFn: async () => requireServerSuccess(await getUser(props.value)).data,
    enabled: props.value > 0,
  })
  const options: Recipient[] = users.data ?? []
  const label = (recipient: Recipient) =>
    `${recipient.username}${recipient.display_name ? ` · ${recipient.display_name}` : ''} (#${recipient.id})`
  return (
    <Combobox
      items={options}
      value={selected.data ?? null}
      filter={null}
      isItemEqualToValue={(a, b) => a.id === b.id}
      itemToStringLabel={label}
      disabled={props.disabled}
      onInputValueChange={(value, details) => {
        if (details.reason === 'input-change') setKeyword(value)
      }}
      onValueChange={(value) => props.onChange(value?.id ?? 0)}
    >
      <div ref={anchor}>
        <ComboboxInput
          id='popup-recipient'
          aria-label={t('Recipient')}
          placeholder={t('Search by username, email or user ID')}
          triggerAriaLabel={t('Select a recipient')}
          showClear
        />
      </div>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>
          {users.isLoading ? t('Loading...') : t('No matching users')}
        </ComboboxEmpty>
        <ComboboxList>
          {(recipient: Recipient) => (
            <ComboboxItem key={recipient.id} value={recipient}>
              {label(recipient)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
