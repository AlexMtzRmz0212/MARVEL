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
      <Section title="Summary">
        <p>
          You can use this entire site without an account, and if you do, nothing you record ever
          leaves your browser. Creating an account stores your email address and your viewing data
          on the server so it follows you between devices. The site runs no analytics, carries no advertising and
          embeds no third-party trackers, and you can delete everything from inside the app at any
          time.
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
            <span className="text-ink">Share link.</span> Only if you create one. It is a random
            token that lets whoever holds the link see your display name and which titles you have
            marked watched, so the two of you can compare. Nothing is shared until you make a link,
            and revoking it stops every copy of it working at once.
          </li>
          <li>
            <span className="text-ink">Friend code.</span> A random code issued to every account, so
            somebody you give it to can send you a friend request. On its own it discloses nothing,
            not even that an account exists, and you can replace it at any time.
          </li>
          <li>
            <span className="text-ink">Friends and friend requests.</span> Who you have asked to be
            friends with, who has asked you, and who has accepted. Kept so that both of you can see
            each other&rsquo;s watch progress. Declining a request or removing a friend deletes the
            record rather than marking it, so nothing is retained about a friendship that ended.
          </li>
          <li>
            <span className="text-ink">Account creation date.</span> Recorded once, for support and
            debugging.
          </li>
        </ul>
        <p>
          That is the complete list. Your IP address is not logged as history, your device is not
          fingerprinted, and nothing about how you use the site is turned into a behavioural
          profile.
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
          Nobody, unless you decide otherwise. Your data is not sold, rented or shared, and there
          are no third-party analytics, advertising or marketing services embedded in the site. The
          application and its database run on hosting infrastructure that necessarily processes the
          data in order to store and serve it, and it is used for nothing else.
        </p>
        <p>
          The one exception is entirely yours to make. If you create a share link from{' '}
          <Link to="/progress/compare" className="text-ink underline underline-offset-4">
            Compare progress
          </Link>
          , anyone holding that link can see your display name and which titles you have marked
          watched. They cannot see your email address, your ratings, your notes or your custom
          orders, and they do not need an account to look. The link works until you revoke or
          replace it, which takes effect immediately; if you have never made one, nothing about you
          is reachable this way at all.
        </p>
        <p>
          Accepting a friend request from{' '}
          <Link to="/friends" className="text-ink underline underline-offset-4">
            Friends
          </Link>{' '}
          discloses exactly the same things to that one person, and nothing further: your display
          name and which titles you have marked watched, never your email address, your ratings,
          your notes or your custom orders. It only happens once you accept. Somebody holding your
          friend code can ask, and until you say yes they learn nothing at all. Removing a friend
          ends it for both of you immediately.
        </p>
      </Section>

      <Section title="How to delete your data">
        <p>
          You can remove individual pieces at any time: untick a title to drop its watch progress,
          delete a custom order from{' '}
          <Link to="/orders" className="text-ink underline underline-offset-4">
            My orders
          </Link>
          , revoke a share link from{' '}
          <Link to="/progress/compare" className="text-ink underline underline-offset-4">
            Compare progress
          </Link>
          , or remove a friend or replace your friend code from{' '}
          <Link to="/friends" className="text-ink underline underline-offset-4">
            Friends
          </Link>
          .
        </p>
        <p>
          To delete everything, open the account menu in the header and choose{' '}
          <span className="text-ink">Delete account</span>. You will be asked to confirm your
          password, and then your account row, your display name, any share link, your friend code,
          every friendship and pending request you were part of, all of your watch progress and
          every custom order are erased from the database immediately. The rows are deleted outright
          rather than flagged, nothing is kept in reserve for a recovery window, and no copy is
          retained anywhere, so the action cannot be undone.
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
