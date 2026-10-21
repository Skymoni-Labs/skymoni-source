import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { userAvatarSource } from '@/lib/avatar'
import { cn } from '@/lib/utils'

export function UserAvatar(props: {
  setting?: string | Record<string, unknown>
  name?: string
  className?: string
}) {
  const src = userAvatarSource(props.setting)
  const defaultImage = src === '/skymoni-avatar.png'
  const mascot = (
    <img
      src='/skymoni-avatar.png'
      alt={props.name || 'skymoni'}
      className='absolute inset-0 size-full translate-y-[8%] scale-[1.3] object-contain object-center'
    />
  )
  return (
    <Avatar
      className={cn('overflow-hidden rounded-full bg-white', props.className)}
    >
      <AvatarImage
        src={src}
        alt={props.name || 'skymoni'}
        className={cn(
          'absolute inset-0 object-center',
          defaultImage && 'translate-y-[8%] scale-[1.3] rounded-none object-contain'
        )}
      />
      <AvatarFallback className='overflow-hidden bg-white'>
        {mascot}
      </AvatarFallback>
    </Avatar>
  )
}
