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
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { PopupNoticeDelivery } from '@/features/popup-notices/types'

interface PopupNoticeState {
  guestReads: Record<string, number>
  visitDismissals: Record<string, string[]>
  dismissForVisit: (audience: string, notice: PopupNoticeDelivery) => void
  acknowledgeGuest: (notice: PopupNoticeDelivery, now?: number) => void
}

export function popupNoticeKey(
  notice: Pick<PopupNoticeDelivery, 'id' | 'revision'>
): string {
  return `${notice.id}:${notice.revision}`
}

export function beijingDay(timestamp: number): number {
  return Math.floor((timestamp + 8 * 3600) / 86400)
}

export function guestHasRead(
  notice: PopupNoticeDelivery,
  reads: Record<string, number>,
  now: number
): boolean {
  const readAt = reads[popupNoticeKey(notice)]
  if (readAt === undefined || notice.frequency === 'visit') return false
  return notice.frequency === 'once' || beijingDay(readAt) === beijingDay(now)
}

export const usePopupNoticeStore = create<PopupNoticeState>()(
  persist(
    (set) => ({
      guestReads: {},
      visitDismissals: {},
      dismissForVisit: (audience, notice) =>
        set((state) => ({
          visitDismissals: {
            ...state.visitDismissals,
            [audience]: [
              ...(state.visitDismissals[audience] ?? []),
              popupNoticeKey(notice),
            ],
          },
        })),
      acknowledgeGuest: (notice, now = Math.floor(Date.now() / 1000)) =>
        set((state) => {
          // Keep guest history bounded; old revisions naturally drop out as new ones arrive.
          const entries = Object.entries({
            ...state.guestReads,
            [popupNoticeKey(notice)]: now,
          })
            .sort((a, b) => b[1] - a[1])
            .slice(0, 500)
          return { guestReads: Object.fromEntries(entries) }
        }),
    }),
    {
      name: 'popup-notice-guest-reads',
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return localStorage.getItem(name)
          } catch {
            return null
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value)
          } catch {
            /* Current visit remains usable when storage is blocked. */
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name)
          } catch {
            /* Storage is optional. */
          }
        },
      })),
      partialize: (state) => ({ guestReads: state.guestReads }),
    }
  )
)
