'use client';
import { NextIntlClientProvider } from 'next-intl';
import { useSettings, type Locale } from '@/src/lib/settings';
import en from './messages/en';
import vi from './messages/vi';

const MESSAGES: Record<Locale, typeof en> = { en, vi: vi as unknown as typeof en };

/** Đổi ngôn ngữ runtime, không reload: locale nằm trong store, provider re-render. */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSettings((s) => s.locale);
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC" now={new Date(0)}>
      {children}
    </NextIntlClientProvider>
  );
}
