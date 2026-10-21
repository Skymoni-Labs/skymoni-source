import { useTranslation } from 'react-i18next'

export function CreatorAvatar(props: { avatar?: string; name: string }) {
  const { t } = useTranslation()
  const custom = Boolean(
    props.avatar && /^data:image\/(?:jpeg|png);base64,/.test(props.avatar)
  )
  return (
    <div className='ch-profile-portrait' data-custom={custom}>
      {!custom && <div className='ch-portrait-orbit' />}
      <img
        src={custom ? props.avatar : '/skymoni-avatar.png'}
        alt={t('Profile picture of {{name}}', { name: props.name })}
      />
      {!custom && <span aria-hidden>✦</span>}
    </div>
  )
}
