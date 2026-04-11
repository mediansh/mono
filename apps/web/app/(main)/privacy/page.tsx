"use client"

import {
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/legal-document"

const lastUpdated = "April 9, 2026"

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"

      lastUpdated={lastUpdated}
      summary="This Privacy Policy explains how Clovr Labs Pty Ltd collects, uses, discloses, and protects personal information when you use Median, including the website, web application, integrations, API, CLI, AI-assisted features, and related support channels."
    >
      <LegalSection title="1. Who We Are">
        <p>
          Median is operated by Clovr Labs Pty Ltd. In this policy, “Median,”
          “we,” “us,” and “our” mean Clovr Labs Pty Ltd and the Median service.
        </p>
        <p>
          If you have privacy questions, requests, or complaints, contact{" "}
          <LegalLink href="mailto:hello@clovr.dev">hello@clovr.dev</LegalLink>.
        </p>
      </LegalSection>

      <LegalSection title="2. Scope">
        <p>
          This policy applies to information we collect when you visit Median’s
          marketing site, create an account, use a workspace, connect third-party
          services, generate tasks with AI, use the CLI or API, join the waitlist,
          receive invite emails, or otherwise interact with Median.
        </p>
        <p>
          It does not govern third-party products you connect to Median, such as
          Clerk, Discord, GitHub, Linear, X, or payment and analytics providers.
          Those services have their own terms and privacy practices.
        </p>
      </LegalSection>

      <LegalSection title="3. Information We Collect">
        <LegalList
          items={[
            <>
              <strong>Account and identity information.</strong> This includes
              your name, email address, profile image, authentication identifiers,
              and account metadata provided through our authentication provider.
            </>,
            <>
              <strong>Workspace and membership information.</strong> This
              includes workspace names, member roles, invite records, invitee
              email addresses, and workspace configuration such as labels,
              prefixes, and icons.
            </>,
            <>
              <strong>Task and content data.</strong> This includes task titles,
              descriptions, labels, statuses, priorities, attachments, project
              metadata, comments or content ingested from connected services, and
              any feedback or source links associated with a task.
            </>,
            <>
              <strong>Integration data.</strong> When you connect Discord,
              GitHub, Linear, X, or the Median CLI, we may store account IDs,
              usernames, selected repositories, team information, webhook
              metadata, API keys or hashed API keys, OAuth tokens, pairing codes,
              and related sync state needed to operate the integration.
            </>,
            <>
              <strong>Usage, analytics, and diagnostics.</strong> This includes
              page views, interaction events, device and browser information,
              error reports, logs, webhook delivery metadata, performance
              telemetry, and feature usage metrics.
            </>,
            <>
              <strong>Billing and commercial information.</strong> This includes
              plan selections, workspace billing identifiers, usage totals, event
              counts, AI usage cost data, and billing portal actions. Payment card
              details are generally handled by our billing provider rather than
              stored directly by Median.
            </>,
            <>
              <strong>Communications.</strong> If you join the waitlist, request
              support, receive workspace invites, or email us, we collect the
              contact details and message content involved in those
              communications.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="4. How We Collect Information">
        <LegalList
          items={[
            <>Directly from you when you sign up, configure a workspace, create tasks, upload files, generate content with AI, or contact us.</>,
            <>Automatically through your use of the service, including analytics, logs, browser events, and error reporting.</>,
            <>From other users in your workspace, such as when they invite you or assign you a role.</>,
            <>From connected third-party services when you authorize an integration or when Median receives webhooks, messages, issues, posts, commits, pull requests, or status updates linked to your workspace.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="5. How We Use Information">
        <LegalList
          items={[
            <>Provide, operate, maintain, and improve Median.</>,
            <>Authenticate users, secure accounts, enforce permissions, and prevent abuse.</>,
            <>Create, organize, sync, and display tasks, feedback, logs, and workspace activity.</>,
            <>Process and maintain integrations with Discord, GitHub, Linear, X, email, and CLI/API workflows.</>,
            <>Generate AI-assisted task suggestions and measure AI-related usage and cost.</>,
            <>Send transactional communications, including invites, confirmations, billing notices, and product updates relevant to your account.</>,
            <>Monitor reliability, debug errors, investigate incidents, and protect the service and our users.</>,
            <>Measure product usage, adoption, and feature performance.</>,
            <>Comply with legal obligations, resolve disputes, and enforce our agreements.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="6. AI Features">
        <p>
          Median includes AI-assisted functionality, including task generation
          from prompts and imported feedback. When you use those features, the
          prompt, workspace context, selected labels, and related task metadata
          may be sent to our AI processing providers to generate a response.
        </p>
        <p>
          We also record limited usage metadata for billing, product analytics,
          and service reliability, such as the model used, token counts,
          generation duration, and resulting task count. AI output can be
          inaccurate, incomplete, or unsuitable for your use case, and should be
          reviewed by a human before you rely on it.
        </p>
      </LegalSection>

      <LegalSection title="7. Cookies and Analytics">
        <p>
          Median uses cookies and similar technologies for authentication,
          session management, analytics, and product performance. We may use
          analytics tools to understand page visits, feature usage, conversions,
          and user flows. Depending on your location, you may have rights to
          manage cookie preferences through browser settings or applicable
          consent mechanisms.
        </p>
      </LegalSection>

      <LegalSection title="8. When We Share Information">
        <LegalList
          items={[
            <>
              <strong>Service providers and subprocessors.</strong> We share
              information with vendors that help us run Median, such as hosting,
              authentication, analytics, logging, AI, email, file storage, and
              billing providers.
            </>,
            <>
              <strong>Connected services at your direction.</strong> If you
              enable an integration, we exchange data with that service as needed
              to provide syncing, automation, notifications, and related features.
            </>,
            <>
              <strong>Within your workspace.</strong> Workspace members may see
              information you create, upload, or sync into the workspace,
              subject to permissions and roles.
            </>,
            <>
              <strong>Legal and safety disclosures.</strong> We may disclose
              information where reasonably necessary to comply with law, enforce
              our rights, detect fraud, investigate abuse, or protect users,
              Median, or the public.
            </>,
            <>
              <strong>Corporate transactions.</strong> We may share information
              in connection with a merger, acquisition, financing, reorganization,
              or sale of assets, subject to standard confidentiality protections.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="9. Key Service Providers">
        <p>
          Median may rely on third parties including providers for
          authentication, hosting and database infrastructure, analytics, logging,
          email delivery, billing infrastructure, AI model access, and customer
          support workflows. Based on the current product stack, this can include
          providers such as Clerk, Convex, Vercel, PostHog, Axiom, Autumn,
          Inbound, and model providers accessed through our AI gateway.
        </p>
        <p>
          Our provider list may change as the service evolves. If you need
          confirmation of a current subprocessor for procurement or security
          review, contact{" "}
          <LegalLink href="mailto:hello@clovr.dev">hello@clovr.dev</LegalLink>.
        </p>
      </LegalSection>

      <LegalSection title="10. Data Retention">
        <p>
          We retain personal information for as long as reasonably necessary to
          provide Median, maintain your workspace, support integrations,
          troubleshoot issues, comply with legal obligations, resolve disputes,
          and enforce our agreements.
        </p>
        <p>
          Retention periods vary by data type. For example, account and workspace
          data are generally retained while your account or workspace remains
          active, while logs, error reports, and analytics may be retained for
          shorter operational periods. Some data may remain in backups or system
          archives for a limited time after deletion.
        </p>
      </LegalSection>

      <LegalSection title="11. Security">
        <p>
          We use reasonable technical and organizational safeguards designed to
          protect personal information, including access controls, role-based
          permissions, hashed CLI API keys, and restricted handling of
          integration credentials. No method of storage or transmission is fully
          secure, and we cannot guarantee absolute security.
        </p>
        <p>
          You are responsible for keeping your credentials, devices, and
          connected accounts secure, and for promptly notifying us if you suspect
          unauthorized access or misuse.
        </p>
      </LegalSection>

      <LegalSection title="12. International Transfers">
        <p>
          Median and its service providers may process and store information in
          countries outside your state, province, or country of residence.
          Where required, we take reasonable steps to ensure personal
          information receives appropriate protections when transferred across
          borders.
        </p>
      </LegalSection>

      <LegalSection title="13. Your Rights and Choices">
        <LegalList
          items={[
            <>Access, update, or delete certain account and workspace information through the product or by contacting us.</>,
            <>Disconnect integrations, revoke API keys, or remove data from a workspace, subject to your permissions.</>,
            <>Opt out of optional marketing communications where provided. Transactional and service messages may still be sent when necessary.</>,
            <>Request access to, correction of, or deletion of personal information, or object to or restrict certain processing, where available under applicable law.</>,
          ]}
        />
        <p>
          We may need to verify your identity and authority before fulfilling a
          request. Some rights are limited by law, technical constraints, or the
          rights of other users or workspace owners.
        </p>
      </LegalSection>

      <LegalSection title="14. Children">
        <p>
          Median is not directed to children, and we do not intend for children
          under 16 to use the service. If you believe a child has provided us
          personal information, contact{" "}
          <LegalLink href="mailto:hello@clovr.dev">hello@clovr.dev</LegalLink>{" "}
          so we can review and take appropriate action.
        </p>
      </LegalSection>

      <LegalSection title="15. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. If we make
          material changes, we may notify you through the service, by email, or
          by updating the effective date above. Your continued use of Median
          after an update becomes effective means the updated policy applies to
          your use of the service.
        </p>
      </LegalSection>

      <LegalSection title="16. Contact">
        <p>
          Privacy inquiries, data requests, and complaints can be sent to{" "}
          <LegalLink href="mailto:hello@clovr.dev">hello@clovr.dev</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
