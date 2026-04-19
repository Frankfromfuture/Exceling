import { useEffect, useState } from 'react'

interface InlineLabelProps {
  value: string
  placeholder?: string
  className?: string
  onCommit: (value: string) => void
}

export function InlineLabel({
  value,
  placeholder = 'Label',
  className,
  onCommit,
}: InlineLabelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  if (isEditing) {
    return (
      <input
        autoFocus
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onCommit(draft.trim())
          setIsEditing(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(value)
            setIsEditing(false)
          }
        }}
        className={[
          'h-8 w-full rounded-sm border border-ink-300 bg-ink-0 px-3 text-sm font-medium text-ink-800 outline-none transition-colors duration-default focus:border-ink-900',
          className ?? '',
        ].join(' ')}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className={[
        'w-full rounded-sm px-1 py-1 text-left text-sm font-medium text-ink-800 transition-colors duration-default hover:bg-ink-100',
        className ?? '',
      ].join(' ')}
      title="Edit label"
    >
      {value || placeholder}
    </button>
  )
}
