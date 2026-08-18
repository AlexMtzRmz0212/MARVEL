import { Link } from 'react-router'

import { LegalLayout, Section } from './LegalLayout'

/**
 * Written against what the code actually does, not against a template. Every
 * claim here has a counterpart in the backend: the field list matches
 * `app/models/user.py`, `watch_progress.py` and `custom_order.py`, the cookie
 * paragraph matches `core/security.py`, and the deletion section matches
 * `DELETE /api/auth/me`. If any of those change, this page changes with them.
 */
export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy" updated="18 August 2026">
      <Section title="The short version">
        <p>
          You can use this entire site without an account, and if you do, nothing you record ever
          leaves your browser. Creating an account stores your email address and your viewing data
          on the server so it follows you between devices. There is no analytics, no advertising
          and no third-party tracking of any kind, and you can delete everything from inside the
          app at any time.
        </p>
      </Section>

      <Section title="If you do not have an account">
        <p>
          Your watch progress, your custom orders and your display preferences are written to your
          browser&rsquo;s local storage on your own device. They are not transmitted to the server
          and nobody else can read them. Clearing your browser data removes them.
        </p>
        <p>
          The catalog itself is public and is served to everyone identically, so browsing it
          requires no information about you.
        </p>
      </Section>

      <Section title="What an account stores, and why">
        <ul className="flex list-none flex-col gap-3">
          <li>
            <span className="text-ink">Email address.</span> It identifies your account and is what
            you sign in with. It is never shown to other users and is never sent anywhere else.
          </li>
          <li>
            <span className="text-ink">Password.</span> Stored only as an Argon2 hash. The original
            password is never written to the database and cannot be recovered from what is stored.
          </li>
          <li>
            <span className="text-ink">Display name.</span> Optional. Used only to greet you in the
            header instead of the first part of your email address.
          </li>
          <li>
            <span className="text-ink">Watch progress.</span> Which titles you have marked watched
            and when, plus a rating or note if you add one. This is the feature; without it there
            is nothing to sync.
          </li>
          <li>
            <span className="text-ink">Custom orders.</span> The name, optional description and
            title list of each order you build, so they are available on your other devices.
          </li>
          <li>
            <span className="text-ink">Display preferences.</span> Small settings such as whether
            watched titles fade or hide, so the catalog looks the same wherever you open it.
          </li>
          <li>
            <span className="text-ink">Account creation date.</span> Recorded once, for support and
            debugging.
          </li>
        </ul>
        <p>
          That is the complete list. No IP address history, no device fingerprint and no
          behavioural profile is built from your use of the site.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          One cookie is set, and only after you sign in. It is named{' '}
          <code className="font-mono text-xs text-ink">mcu_session</code>, it holds your signed
          session token, and it exists so that you stay signed in between page loads. It is
          HttpOnly, so no script can read it, and it is restricted to this site.
        </p>
        <p>
          It is strictly necessary for the sign-in feature to work, which is why it is not behind a
          consent prompt. No advertising, analytics or tracking cookies are set, because no such
          tools are loaded. If that ever changes, an opt-in prompt will appear before anything
          starts tracking.
        </p>
      </Section>

      <Section title="Who else sees your data">
        <p>
          Nobody. Your data is not sold, rented or shared, and there are no third-party analytics,
          advertising or marketing services embedded in the site. The application and its database
          run on hosting infrastructure that necessarily processes the data in order to store and
          serve it, and it is used for nothing else.
        </p>
      </Section>

      <Section title="How to delete your data">
        <p>
          You can remove individual pieces at any time: untick a title to drop its watch progress,
          or delete a custom order from{' '}
          <Link to="/orders" className="text-ink underline underline-offset-4">
            My orders
          </Link>
          .
        </p>
        <p>
          To delete everything, open the account menu in the header and choose{' '}
          <span className="text-ink">Delete account</span>. You will be asked to confirm your
          password, and then your account row, your display name, all of your watch progress and
          every custom order are erased from the database immediately. There is no soft delete, no
          recovery window and no retained copy, so the action cannot be undone.
        </p>
        <p>
          If you signed out without deleting, your data stays in your account until you come back
          and remove it.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this policy changes, the date at the top of this page changes with it. For questions
          about your data, or to request deletion if you cannot access your account, contact the
          site owner at the address published on the project&rsquo;s repository.
        </p>
      </Section>
    </LegalLayout>
  )
}
