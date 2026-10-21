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

import './sale.css'

const units = ['天', '时', '分', '秒']
export function FlipCountdown({
  target,
  serverTime,
}: {
  target: number
  serverTime?: number
}) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const offset =
      serverTime === undefined ? 0 : serverTime - Math.floor(Date.now() / 1000)
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000) + offset),
      1000
    )
    return () => clearInterval(timer)
  }, [serverTime])
  const remaining = Math.max(0, target - now)
  const values = [
    String(Math.floor(remaining / 86400)).padStart(2, '0'),
    String(Math.floor(remaining / 3600) % 24).padStart(2, '0'),
    String(Math.floor(remaining / 60) % 60).padStart(2, '0'),
    String(remaining % 60).padStart(2, '0'),
  ]
  return (
    <div
      className='sale-countdown'
      aria-label={`剩余 ${values[0]} 天 ${values[1]} 时 ${values[2]} 分 ${values[3]} 秒`}
      role='timer'
    >
      {units.map((unit, index) => (
        <div className='sale-time-group' key={unit}>
          <div className='sale-digits'>
            {[...values[index]].map((digit, place) => (
              <span
                className='sale-digit'
                key={`${unit}-${values[index].length - place}`}
              >
                <span key={digit} className='sale-digit-value'>
                  {digit}
                </span>
              </span>
            ))}
          </div>
          <span className='sale-time-label'>{unit}</span>
        </div>
      ))}
    </div>
  )
}
