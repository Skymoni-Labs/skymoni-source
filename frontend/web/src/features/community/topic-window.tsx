/** Decorative shopfront; the topic table keeps its native semantics. */
export function TopicWindowFrame() {
  return (
    <div className='sf-window-frame' aria-hidden='true'>
      <div className='sf-window-awning' />
      <div className='sf-window-post sf-window-post-left' />
      <div className='sf-window-post sf-window-post-right' />
      <div className='sf-window-sill' />
    </div>
  )
}
