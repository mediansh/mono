"use client"

import {
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/legal-document"

const lastUpdated = "April 9, 2026"

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"

      lastUpdated={lastUpdated}
      summary="These Terms of Service govern your access to and use of Median. By using Median, you agree to these terms on your own behalf and, if applicable, on behalf of the organization or workspace you represent."
    >
      <LegalSection title="1. Agreement to These Terms">
        <p>
          These Terms of Service form a binding agreement between you and Clovr
          Labs Pty Ltd concerning your use of Median, including the website, web
          application, CLI, API, integrations, AI-assisted features, and related
          services.
        </p>
        <p>
          If you are using Median for an organization, you represent that you
          have authority to bind that organization to these terms. If you do not
          agree to these terms, do not use Median.
        </p>
      </LegalSection>

      <LegalSection title="2. Eligibility and Accounts">
        <LegalList
          items={[
            <>You must be legally able to enter into a binding agreement to use Median.</>,
            <>You must provide accurate account information and keep it current.</>,
            <>You are responsible for maintaining the confidentiality of your login credentials, API keys, and connected third-party accounts.</>,
            <>You are responsible for all activity that occurs under your account or within your workspace, except to the extent caused by our breach of these terms.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="3. The Service">
        <p>
          Median is a feedback and task management platform. It allows users to
          collect feedback from multiple sources, triage and manage tasks,
          synchronize with third-party tools, generate tasks with AI, and use
          supporting CLI, API, billing, logging, and notification features.
        </p>
        <p>
          We may modify, improve, suspend, or discontinue portions of Median at
          any time. We do not guarantee that every feature will remain available
          indefinitely or that the service will be uninterrupted or error-free.
        </p>
      </LegalSection>

      <LegalSection title="4. Workspace Administration">
        <p>
          Workspace owners and admins control workspace settings, integrations,
          member permissions, billing choices, task configuration, invite flows,
          and API key generation. If you join a workspace created by another
          party, that workspace’s administrators may be able to access, modify,
          export, or remove data associated with your use of that workspace,
          subject to the product’s permission model.
        </p>
      </LegalSection>

      <LegalSection title="5. Acceptable Use">
        <LegalList
          items={[
            <>Do not use Median for unlawful, fraudulent, deceptive, harmful, or infringing activity.</>,
            <>Do not attempt to gain unauthorized access to Median, another account, or any related system or network.</>,
            <>Do not interfere with the integrity, security, or performance of the service, including through scraping, abuse, denial-of-service activity, or malware.</>,
            <>Do not use Median to store, process, or transmit content you do not have the right to use, disclose, or synchronize.</>,
            <>Do not use AI features or integrations in a way that violates third-party terms, privacy rights, export controls, or applicable law.</>,
            <>Do not reverse engineer or circumvent usage limits, billing controls, or security mechanisms except where non-waivable law expressly permits it.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Customer Data and Your Responsibilities">
        <p>
          You retain responsibility for the data, files, prompts, messages,
          posts, issues, repository data, and other content you or your
          workspace submit to Median or sync through integrations
          (“Customer Data”).
        </p>
        <LegalList
          items={[
            <>You must have all rights, permissions, and lawful bases needed to provide Customer Data to Median and to direct Median to process it.</>,
            <>You are responsible for reviewing AI-generated outputs before acting on them.</>,
            <>You are responsible for configuring permissions, member access, and integration settings appropriately for your workspace.</>,
            <>You acknowledge that deleting or disconnecting data in third-party tools may not automatically remove related records already synchronized into Median unless supported by the product.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="7. AI-Assisted Features">
        <p>
          Median may provide AI-assisted features such as task generation from
          prompts or imported feedback. These features may produce outputs that
          are inaccurate, incomplete, biased, misleading, or otherwise
          unsuitable for your use case. You are responsible for human review of
          any AI-assisted output before relying on it.
        </p>
        <p>
          You must not use AI-assisted features in violation of law, third-party
          rights, or these terms. We may impose usage limits, throttle access,
          or disable AI features where necessary to protect the service, comply
          with provider requirements, or manage abuse and cost.
        </p>
      </LegalSection>

      <LegalSection title="8. Third-Party Services and Integrations">
        <p>
          Median integrates with third-party services including, by way of
          example, Discord, GitHub, Linear, X, authentication providers,
          analytics providers, and billing providers. Your use of those services
          remains governed by their own terms and policies.
        </p>
        <p>
          By enabling an integration, you authorize Median to access, process,
          and exchange relevant data with the third-party service to provide the
          requested functionality. We are not responsible for outages, data loss,
          policy changes, or acts or omissions of third-party services.
        </p>
      </LegalSection>

      <LegalSection title="9. Fees, Billing, and Taxes">
        <p>
          Some Median features require a paid subscription or usage-based
          charges. Pricing, included usage, overage rates, and plan features may
          be described in the product, on our pricing page, or in an order form
          or separate commercial agreement.
        </p>
        <LegalList
          items={[
            <>You authorize us and our billing providers to charge the payment method associated with your account for recurring subscription fees, overages, and other agreed charges.</>,
            <>Unless otherwise stated, fees are non-refundable and exclusive of taxes, duties, and government charges.</>,
            <>You are responsible for applicable taxes other than taxes based on our net income.</>,
            <>We may suspend or limit access to paid features for overdue amounts, failed payments, or billing abuse.</>,
            <>We may change pricing or usage models prospectively by giving reasonable notice.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="10. Intellectual Property">
        <p>
          Median, including its software, design, trademarks, branding,
          documentation, and related materials, is owned by Clovr Labs Pty Ltd
          or its licensors and is protected by intellectual property laws. These
          terms grant you a limited, non-exclusive, non-transferable,
          non-sublicensable right to use Median during the applicable term,
          subject to these terms.
        </p>
        <p>
          Except for the limited rights expressly granted here, we reserve all
          rights in and to Median.
        </p>
      </LegalSection>

      <LegalSection title="11. Feedback">
        <p>
          If you provide feedback, suggestions, or ideas about Median, you grant
          us a worldwide, perpetual, irrevocable, transferable, sublicensable,
          royalty-free license to use, modify, commercialize, and incorporate
          that feedback without restriction or compensation to you.
        </p>
      </LegalSection>

      <LegalSection title="12. Suspension and Termination">
        <p>
          We may suspend or terminate your access to Median, in whole or in
          part, if we reasonably believe you have violated these terms, created
          risk for the service or other users, failed to pay fees when due, or
          if we are required to do so by law or a provider obligation.
        </p>
        <p>
          You may stop using Median at any time. Upon termination, your right to
          access the service ends, but provisions that by their nature should
          survive will continue, including provisions relating to payment
          obligations, intellectual property, disclaimers, limitations of
          liability, indemnity, and dispute terms.
        </p>
      </LegalSection>

      <LegalSection title="13. Disclaimers">
        <p>
          Median is provided on an “as is” and “as available” basis. To the
          maximum extent permitted by law, we disclaim all warranties, whether
          express, implied, statutory, or otherwise, including warranties of
          merchantability, fitness for a particular purpose, title,
          non-infringement, and that the service will be uninterrupted, secure,
          accurate, or error-free.
        </p>
        <p>
          We do not warrant that AI-generated output, synced third-party data,
          or automated actions will be complete, accurate, or suitable for your
          needs.
        </p>
      </LegalSection>

      <LegalSection title="14. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, Clovr Labs Pty Ltd and its
          directors, employees, contractors, affiliates, and licensors will not
          be liable for any indirect, incidental, special, consequential,
          exemplary, or punitive damages, or for any loss of profits, revenues,
          goodwill, data, business interruption, or replacement costs arising
          out of or related to Median or these terms.
        </p>
        <p>
          To the maximum extent permitted by law, our aggregate liability for
          all claims arising out of or relating to Median or these terms will
          not exceed the greater of the amounts you paid us for Median during
          the 12 months before the event giving rise to the claim or AUD $100.
        </p>
        <p>
          Nothing in these terms excludes liability that cannot be excluded
          under applicable law.
        </p>
      </LegalSection>

      <LegalSection title="15. Indemnity">
        <p>
          You will defend, indemnify, and hold harmless Clovr Labs Pty Ltd and
          its affiliates, officers, directors, employees, and agents from and
          against claims, damages, losses, liabilities, costs, and expenses
          arising from or related to your Customer Data, your use of Median,
          your violation of these terms, or your violation of applicable law or
          third-party rights.
        </p>
      </LegalSection>

      <LegalSection title="16. Governing Law and Disputes">
        <p>
          These terms are governed by the laws of New South Wales, Australia,
          excluding conflict of laws principles. The courts located in New South
          Wales will have exclusive jurisdiction over disputes arising out of
          or relating to these terms or the service, except where applicable law
          requires otherwise.
        </p>
      </LegalSection>

      <LegalSection title="17. Changes to These Terms">
        <p>
          We may update these terms from time to time. If we make material
          changes, we may notify you through the service, by email, or by
          updating the date above. Continued use of Median after updated terms
          become effective means you accept the revised terms.
        </p>
      </LegalSection>

      <LegalSection title="18. Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <LegalLink href="mailto:hello@clovr.dev">hello@clovr.dev</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
