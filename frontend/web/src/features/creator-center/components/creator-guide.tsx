import { BookOpen01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'

const steps = [
  {
    id: 'start',
    title: 'Start with your creator account',
    summary: 'One skymoni account, your own creative space.',
    paragraphs: [
      'Sign in with your skymoni account. After redeeming any credit code successfully, apply to become a creator, fill in your profile and accept the creator terms.',
      'You can create a project from scratch or open GitHub import in your workspace. Websites, software, Skills, hardware and tutorials can all be presented as projects.',
    ],
  },
  {
    id: 'github',
    title: 'Connect GitHub and choose a repository',
    summary: 'Authorize once, then choose what to import.',
    paragraphs: [
      'Click Connect GitHub, verify your skymoni account and complete authorization on GitHub. This connects a project source to your existing creator account.',
      'Choose a public repository owned by the connected GitHub account. Search filters the current page; use Previous and Next to browse more repositories.',
      'For a whole repository, leave the subdirectory empty. For one project inside a repository, enter a relative path such as skills/my-skill, not a GitHub URL.',
    ],
  },
  {
    id: 'edit',
    title: 'Make the draft your own',
    summary: 'Imported content is a starting point you can edit.',
    paragraphs: [
      'Import as private draft brings in the README and available repository information. Review the title, summary, category, source links and license before submitting.',
      'No screenshots? You can start with text and links. A cover is optional; upload your own cover or image blocks when ready. README images are not copied into your gallery.',
      'Use content blocks to add or rearrange Markdown, text, images and links. If a README is missing or shortened, supplement the description manually. Preserve upstream credit when sharing a fork.',
    ],
  },
  {
    id: 'publish',
    title: 'Preview, save and submit for review',
    summary: 'You decide when the project is ready.',
    paragraphs: [
      'Check desktop and mobile previews, then save your draft before leaving the editor. Opening this guide does not save or submit your changes.',
      'An imported draft stays private. Submit for review when ready; it appears publicly after approval. If changes are requested, edit the draft and submit again.',
      'To distribute an installer, use Software submissions in your workspace. Software review and inclusion in the software center are managed separately from project publication.',
    ],
  },
] as const

export function CreatorGuide({
  context = 'edit',
}: {
  context?: (typeof steps)[number]['id']
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      title={t('Creator Space guide')}
      description={t(
        'From an idea or repository to your first published project.'
      )}
      contentClassName='cguide-dialog'
      trigger={
        <Button type='button' variant='ghost' className='cguide-trigger'>
          <HugeiconsIcon icon={BookOpen01Icon} aria-hidden />
          {t('Usage guide')}
        </Button>
      }
    >
      <div className='cguide-intro'>
        <span aria-hidden>01 → 04</span>
        <p>{t('Connect → Import → Customize → Review')}</p>
        <small>
          {t('Expand any step for tips. You can reopen this guide anytime.')}
        </small>
      </div>
      <Accordion defaultValue={[context]} className='cguide-steps'>
        {steps.map((step, index) => (
          <AccordionItem value={step.id} key={step.id}>
            <AccordionTrigger className='cguide-step-heading'>
              <span className='cguide-number' aria-hidden>
                {index + 1}
              </span>
              <span className='cguide-step-copy'>
                <strong>{t(step.title)}</strong>
                <small>{t(step.summary)}</small>
              </span>
            </AccordionTrigger>
            <AccordionContent className='cguide-step-body'>
              {step.paragraphs.map((paragraph) => (
                <p key={paragraph}>{t(paragraph)}</p>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Dialog>
  )
}
