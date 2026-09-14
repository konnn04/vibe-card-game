import Link from 'next/link';

/**
 * Layout for legal pages (/legal/terms, /legal/privacy).
 *
 * Uses fixed inset-0 with overflow-y-auto so the page can scroll
 * independently of the full-screen game canvas body styling.
 */
export default function LegalLayout({ children }: LayoutProps<'/legal'>) {
  return (
    <div className="fixed inset-0 overflow-y-auto" style={{ background: '#16100F' }}>
      <main className="mx-auto min-h-dvh max-w-[760px] px-5 py-12 text-[#EFE3D4]">
        <Link href="/" className="label text-[12px] tracking-[.2em] uppercase text-[#C79A6C] hover:text-[#FFD79A]">
          ← Ú NỒ!
        </Link>
        <article className="legal mt-6">{children}</article>
        <footer className="label mt-14 border-t border-[rgba(255,196,128,.18)] pt-5 text-[12px] tracking-[.16em] uppercase text-[#8A6A52]">
          <Link href="/legal/terms" className="hover:text-[#FFD79A]">Terms of Service</Link>
          {' · '}
          <Link href="/legal/privacy" className="hover:text-[#FFD79A]">Privacy Policy</Link>
        </footer>
      </main>
    </div>
  );
}
