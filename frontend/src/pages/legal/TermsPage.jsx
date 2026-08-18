import { Link } from 'react-router'

import { LegalLayout, Section } from './LegalLayout'

export function TermsPage() {
  return (
    <LegalLayout title="Terms of service" updated="18 August 2026">
      <Section title="What this is">
        <p>
          Marvel Watch Order is a free, unofficial reference tool for planning what to watch and in
          what order. It is a fan project. It is not affiliated with, endorsed by or connected to
          Marvel, Marvel Studios, The Walt Disney Company or any other rights holder, and it hosts
          no video content of any kind.
        </p>
        <p>
          Title names, release dates and related facts are catalogue information. All trademarks
          and characters belong to their respective owners.
        </p>
      </Section>

      <Section title="Using the site">
        <p>
          You may use the catalog, build viewing orders and track your progress for your own
          personal use, with or without an account. Automated scraping that degrades the service
          for other people, attempts to break into other accounts, and use of the site to
          distribute unlawful content are not permitted.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You are responsible for keeping your password to yourself. Accounts exist only to sync
          your own data between your own devices, and you can delete yours at any time from the
          account menu, as described in the{' '}
          <Link to="/privacy" className="text-ink underline underline-offset-4">
            privacy policy
          </Link>
          . An account may be suspended if it is used to attack the service or other users.
        </p>
      </Section>

      <Section title="Accuracy">
        <p>
          Watch orders, prerequisite chains and continuity notes are editorial judgements, and
          reasonable people disagree about them. The catalog is maintained carefully but is offered
          without any guarantee that it is complete, current or correct.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          The site is provided as is, without warranties of any kind. It may be unavailable,
          changed or discontinued at any time. To the fullest extent permitted by law, the site
          owner is not liable for any loss arising from your use of it, including loss of data you
          have saved here. If your viewing orders matter to you, keep your own copy.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          These terms may change; the date at the top of this page shows when they last did.
          Continuing to use the site after a change means you accept the revised terms.
        </p>
      </Section>
    </LegalLayout>
  )
}
