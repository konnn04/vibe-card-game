import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Ú Nồ — an open-source, self-hosted, non-commercial card party game.',
  alternates: { canonical: '/legal/terms' },
  robots: { index: true, follow: true },
};

const UPDATED = 'September 14, 2026';

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="muted">Last updated: {UPDATED}</p>

      <h2>1. Overview</h2>
      <p>
        Ú Nồ is an <strong>open-source</strong>, non-commercial card party game designed for self-hosting
        and playing among friends, family, and Discord communities. There are no user accounts, no subscription
        fees, no advertisements, and no in-app purchases.
      </p>

      <h2>2. Copyright & Intellectual Property</h2>
      <p>
        The gameplay mechanics are based on <strong>generic public domain shedding-type card game rules</strong>{' '}
        (matching by color or number, action cards like draw penalties, reverses, and skips). Gameplay mechanics
        themselves are not subject to copyright protection. This project is{' '}
        <strong>not affiliated with, sponsored by, or endorsed by</strong> Mattel or any other commercial card game publisher,
        and does not use any registered trademarks, copyrighted artwork, or proprietary logos belonging to them.
      </p>
      <p>
        Card textures, sound effects, and background music are <strong>not bundled as proprietary assets</strong>:
        they are placed by host administrators into the <code>public/</code> folder. Server operators are responsible
        for ensuring they possess the appropriate licenses or permissions for any custom assets they deploy. If you are
        a copyright owner and believe content has been improperly placed on a specific deployment, please contact the operator
        of that deployment directly.
      </p>

      <h2>3. Software License</h2>
      <p>
        The source code is provided under the open-source license included in the repository. You are free to use, modify,
        and redistribute the software in compliance with the terms of that license.
      </p>

      <h2>4. Disclaimer of Warranty</h2>
      <p>
        The software is provided <strong>&ldquo;as is&rdquo;</strong>, without warranty of any kind, express or implied.
        Matches may disconnect, rooms may expire, and servers may restart or terminate at any time. The authors and contributors
        disclaim all liability for any damages or losses arising from the use of this software.
      </p>

      <h2>5. Code of Conduct</h2>
      <p>
        Players must refrain from using usernames or custom avatars containing harassment, hate speech, vulgarity, or sexually
        explicit material. Do not intentionally exploit bugs or manipulate network packets to disrupt games for others. Room hosts
        and server operators retain full authority to moderate, kick players, or remove rooms.
      </p>

      <h2>6. Discord Terms</h2>
      <p>
        When running as a Discord Activity, your usage is also subject to Discord&rsquo;s Terms of Service and Community
        Guidelines. This project operates within the Discord ecosystem but does not supersede Discord&rsquo;s rules.
      </p>

      <h2>7. Changes to Terms</h2>
      <p>
        These terms may be updated alongside updates to the software. The version displayed here applies to the current server instance.
      </p>
    </>
  );
}
