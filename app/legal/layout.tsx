import Link from 'next/link';

/**
 * Khung cho hai trang pháp lý (/legal/terms, /legal/privacy).
 *
 * Cố tình KHÔNG dùng chung gì với màn game: đây là hai trang tĩnh, phải đọc
 * được khi JavaScript hỏng, khi Discord render trong webview chật, và khi ai đó
 * mở từ trang cài đặt ứng dụng của Discord. Không import font game, không canvas,
 * không store.
 */
export default function LegalLayout({ children }: LayoutProps<'/legal'>) {
  return (
    <main className="mx-auto min-h-dvh max-w-[760px] px-5 py-12 text-[#EFE3D4]" style={{ background: '#16100F' }}>
      <Link href="/" className="label text-[12px] tracking-[.2em] uppercase text-[#C79A6C] hover:text-[#FFD79A]">
        ← Ú NỒ!
      </Link>
      <article className="legal mt-6">{children}</article>
      <footer className="label mt-14 border-t border-[rgba(255,196,128,.18)] pt-5 text-[12px] tracking-[.16em] uppercase text-[#8A6A52]">
        <Link href="/legal/terms" className="hover:text-[#FFD79A]">Điều khoản</Link>
        {' · '}
        <Link href="/legal/privacy" className="hover:text-[#FFD79A]">Quyền riêng tư</Link>
      </footer>
    </main>
  );
}
