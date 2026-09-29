/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          900: 'var(--color-primary-900)',
          700: 'var(--color-primary-700)',
          600: 'var(--color-primary-600)',
          100: 'var(--color-primary-100)',
        },
        accent: { 500: 'var(--color-accent-500)' },
        ink: {
          900: 'var(--color-text-900)',
          700: 'var(--color-text-700)',
          500: 'var(--color-text-500)',
          400: 'var(--color-text-400)',
        },
        line: 'var(--color-border)',
        surface: 'var(--color-surface)',
        canvas: 'var(--color-canvas)',
        disabled: {
          bg: 'var(--color-disabled-bg)',
          text: 'var(--color-disabled-text)',
        },
        neutral: {
          700: 'var(--color-neutral-700)',
          100: 'var(--color-neutral-100)',
        },
        success: {
          700: 'var(--color-success-700)',
          600: 'var(--color-success-600)',
          100: 'var(--color-success-100)',
        },
        warning: {
          700: 'var(--color-warning-700)',
          600: 'var(--color-warning-600)',
          100: 'var(--color-warning-100)',
        },
        danger: {
          700: 'var(--color-danger-700)',
          600: 'var(--color-danger-600)',
          100: 'var(--color-danger-100)',
        },
        info: {
          600: 'var(--color-info-600)',
          100: 'var(--color-info-100)',
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
      },
      fontFamily: {
        sans: ['Vazirmatn', 'Tahoma', 'sans-serif'],
      },
      fontSize: {
        display: ['30px', { lineHeight: '1.25', fontWeight: '700' }],
        h1: ['24px', { lineHeight: '1.35', fontWeight: '700' }],
        h2: ['18px', { lineHeight: '1.4', fontWeight: '700' }],
        h3: ['15px', { lineHeight: '1.45', fontWeight: '600' }],
        'body-l': ['16px', { lineHeight: '1.75', fontWeight: '400' }],
        body: ['14px', { lineHeight: '1.75', fontWeight: '400' }],
        'body-strong': ['14px', { lineHeight: '1.7', fontWeight: '600' }],
        caption: ['12px', { lineHeight: '1.6', fontWeight: '400' }],
        button: ['14px', { lineHeight: '1.4', fontWeight: '600' }],
        code: ['12px', { lineHeight: '1.55', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
}
