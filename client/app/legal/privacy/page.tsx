import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Ú Nồ handles your data, what is collected, where it is stored, and retention policies.',
  alternates: { canonical: '/legal/privacy' },
  robots: { index: true, follow: true },
};

const UPDATED = 'September 14, 2026';

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: {UPDATED}</p>

      <p>
        Ú Nồ <strong>does not require accounts, does not track you, does not show advertisements</strong>, and does not include
        any third-party analytics SDKs. Below is a comprehensive explanation of what data is used and how it is processed.
      </p>

      <h2>1. Stored Locally on Your Device (Does Not Leave Your Browser)</h2>
      <ul>
        <li>
          <strong>Settings</strong> — your display name, default avatar preset, sound volume, graphics quality, theme, and language preference.
          Stored in your browser&rsquo;s <code>localStorage</code>.
        </li>
        <li>
          <strong>Player Identifier</strong> — a random unique UUID generated locally so the server can recognize your connection when reconnecting.
          It is not linked to your email, phone number, or any external account.
        </li>
        <li>
          <strong>Room Tokens</strong> — temporary session tokens for rooms you have joined, allowing seamless reconnection if you refresh the browser during a match.
        </li>
        <li>
          <strong>Custom Avatars</strong> — custom avatar files you crop and upload are stored locally in your browser&rsquo;s <code>IndexedDB</code>.
          When joining an online room, a compressed thumbnail is transmitted to room peers so they can see your avatar at the table (see Section 2).
        </li>
      </ul>
      <p>
        Clearing your browser site data permanently deletes all the above information. No remote backup is kept.
      </p>

      <h2>2. Sent to the Game Server During Online Multiplayer</h2>
      <p>Data is only transmitted when you host or join an online room. Solo play against bots runs 100% locally on your device.</p>
      <ul>
        <li>Player ID, <strong>display name</strong>, and chosen avatar preset index.</li>
        <li>
          <strong>Avatar Image</strong>: A compressed WebP thumbnail (or your Discord avatar URL when playing via Discord Activity).
          This is solely used to render your seat avatar for other players at the table.
        </li>
        <li>Game state: cards in hand, current turn, chosen house rules, and room background theme.</li>
        <li>
          Connection heartbeat and <strong>network latency (ping in ms)</strong> to indicate active presence and detect disconnections.
        </li>
      </ul>
      <p>
        All room session data resides in volatile memory or temporary store on the <em>server operator&rsquo;s instance</em>, scoped strictly
        to that room, and <strong>automatically expires and is purged after room completion or inactivity</strong>. Leaving a room removes your seat
        and avatar data immediately. There are no permanent player profiles or match histories stored across rooms.
      </p>
      <p>
        Please note: Usernames and avatars transmitted in an online room are <strong>visible to everyone in that room</strong>.
        Avoid using personal, sensitive, or offensive images or names.
      </p>

      <h2>3. When Running Inside Discord (Discord Activity)</h2>
      <p>
        When launched as a Discord Embedded App / Activity, the application reads Discord context parameters provided in the URL
        (such as <code>instance_id</code>) to automatically identify the current voice channel.
      </p>
      <p>
        The app requests the standard <strong><code>identify</code> Discord permission</strong> to prefill your{' '}
        <strong>Discord display name and avatar URL</strong>, saving you from entering them manually. Discord presents a confirmation
        dialog before granting access. Beyond this, the app{' '}
        <strong>does not read messages, does not read friend lists, and does not inspect other servers</strong>.
      </p>

      <h2>4. Children&rsquo;s Privacy</h2>
      <p>
        Ú Nồ does not knowingly collect personal information from children. Because there are no accounts, the only input requested is a display name.
        We encourage players to use pseudonyms and nicknames rather than real names.
      </p>

      <h2>5. Your Rights & Data Deletion</h2>
      <p>
        Because no persistent user accounts are created, you can delete your data at any time by leaving the room (which purges server-side room data)
        and clearing site data in your web browser. If you have specific inquiries, contact the administrator hosting your particular server instance.
      </p>
    </>
  );
}
