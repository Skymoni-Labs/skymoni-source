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
import { useEffect, useState } from 'react'

function hasOtherDialog(): boolean {
  return [
    ...document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
  ].some(
    (dialog) =>
      !dialog.querySelector('[data-popup-notice]') &&
      !dialog.closest('[data-popup-notice]')
  )
}

export function useOtherDialogOpen(): boolean {
  const [open, setOpen] = useState(hasOtherDialog)
  useEffect(() => {
    const refresh = () => setOpen(hasOtherDialog())
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'data-open', 'data-closed'],
    })
    return () => observer.disconnect()
  }, [])
  return open
}
