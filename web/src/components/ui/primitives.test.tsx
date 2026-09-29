import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { PasswordField } from '@/components/ui/PasswordField'
import { SegmentedRating } from '@/components/ui/SegmentedRating'
import { TextField } from '@/components/ui/TextField'
import { PASSWORD_HIDE, PASSWORD_SHOW } from '@/i18n/uiText'

describe('Button (§5.1)', () => {
  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)('renders the %s variant', (variant) => {
    render(<Button variant={variant}>ثبت</Button>)
    const button = screen.getByRole('button', { name: 'ثبت' })
    expect(button).toBeInTheDocument()
    expect(button).not.toHaveAttribute('aria-busy')
  })

  it('sets aria-busy and blocks clicks while loading', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        ثبت
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'ثبت' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()

    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('TextField (§5.2)', () => {
  it('associates the label and wires the error', () => {
    render(<TextField label="نام کاربری" defaultValue="doctor" error="اجباری است" />)

    const input = screen.getByLabelText('نام کاربری')
    expect(input).toHaveValue('doctor')
    expect(input).toHaveAttribute('aria-invalid', 'true')

    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const helper = document.getElementById(describedBy as string)
    expect(helper).toHaveTextContent('اجباری است')
  })

  it('has no aria-invalid without an error', () => {
    render(<TextField label="نام کاربری" />)
    expect(screen.getByLabelText('نام کاربری')).not.toHaveAttribute('aria-invalid')
  })
})

describe('PasswordField (§5.2)', () => {
  it('toggles the input type via the show/hide button', async () => {
    const user = userEvent.setup()
    render(<PasswordField label="رمز عبور" value="secret" onChange={() => undefined} />)

    expect(screen.getByLabelText('رمز عبور')).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: PASSWORD_SHOW }))
    expect(screen.getByLabelText('رمز عبور')).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: PASSWORD_HIDE }))
    expect(screen.getByLabelText('رمز عبور')).toHaveAttribute('type', 'password')
  })
})

describe('Modal (§5.6)', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          باز کردن
        </button>
        <Modal
          open={open}
          title="گفتگو پایان یابد؟"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setOpen(false)}>
                انصراف
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                بله
              </button>
            </>
          }
        />
      </div>
    )
  }

  it('traps focus, closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: 'باز کردن' })
    await user.click(trigger)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // focus moved into the dialog
    expect(dialog.contains(document.activeElement)).toBe(true)

    // tabbing from the last control wraps back inside the trap
    screen.getByRole('button', { name: 'بله' }).focus()
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

describe('SegmentedRating (§5.10)', () => {
  function Harness() {
    const [value, setValue] = useState<number | null>(3)
    return (
      <SegmentedRating
        label="درستی سطح تریاژ"
        name="kpi-triage"
        value={value}
        onChange={setValue}
        anchors={{ 1: 'کاملاً نادرست', 3: 'نزدیک ولی نه دقیق', 5: 'کاملاً درست' }}
      />
    )
  }

  it('uses native radios, moves with the arrow keys and shows the 1/3/5 anchors', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(5)
    expect(screen.getByRole('radio', { name: '۳' })).toBeChecked()

    // the anchors are shown under boxes 1, 3 and 5
    expect(screen.getByText('کاملاً نادرست')).toBeInTheDocument()
    expect(screen.getByText('نزدیک ولی نه دقیق')).toBeInTheDocument()
    expect(screen.getByText('کاملاً درست')).toBeInTheDocument()

    screen.getByRole('radio', { name: '۳' }).focus()
    await user.keyboard('{ArrowRight}')

    const four = screen.getByRole('radio', { name: '۴' })
    expect(four).toBeChecked()
    expect(four).toHaveFocus()
  })
})
