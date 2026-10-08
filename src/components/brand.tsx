import Link from 'next/link'

export function Brand({
  href = '/',
  className = '',
}: {
  href?: string
  className?: string
}) {
  return (
    <Link href={href} className={`brand ${className}`.trim()} aria-label="ComInfla">
      <img className="brand-mark" src="/cominfla-logo.png?v=3" alt="" aria-hidden="true" />
      <span>ComInfla</span>
    </Link>
  )
}
