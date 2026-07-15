export default function PrivacyContent() {
  return (
    <div className="privacy-policy-doc">
      <div style={{ textAlign: 'center' }}>
        <h2>Privacy Policy</h2>
        <p className="privacy-policy-updated">ABC Tune Book (tunebook.net)</p>
      </div>

      <div className="termsofuse privacy-policy-body" style={{ textAlign: 'left' }}>
        <p>
          This Privacy Policy explains how ABC Tune Book (“we”, “the app”, “the service”)
          accesses, uses, stores, and shares Google user data and other information when you use
          https://tunebook.net. Signing in with Google is optional. If you do not sign in, the app
          works on your device only and does not access your Google account data.
        </p>

        <h3 id="data-accessed">Data Accessed</h3>
        <p>
          When you optionally choose to sign in with Google, ABC Tune Book may access the following
          specific types of Google user data:
        </p>
        <ul>
          <li>
            <strong>Google account identity:</strong> your email address, name, and profile picture
            (OAuth / OpenID scopes <code>openid</code>, <code>email</code>, and <code>profile</code>).
          </li>
          <li>
            <strong>Google Drive content related to this app:</strong> tunebook documents, audio
            recordings, and other files that the app creates or that you open with the app (OAuth
            scope <code>https://www.googleapis.com/auth/drive.file</code>), typically stored under an
            “ABC Tune Book” folder in your Drive.
          </li>
          <li>
            <strong>Google Drive files you choose to import (optional):</strong> if you use the Drive
            file picker to import existing files, the app may request temporary read access
            (<code>https://www.googleapis.com/auth/drive.readonly</code>) so you can select files;
            only the files you pick are imported into the app workflow.
          </li>
          <li>
            <strong>Google Photos media you choose to import (optional):</strong> if you use Google
            Photos to import sheet-music images, the app uses the Google Photos Picker and accesses
            only the media items you select
            (<code>https://www.googleapis.com/auth/photospicker.mediaitems.readonly</code>).
          </li>
          <li>
            <strong>YouTube:</strong> the app uses the YouTube Data API and YouTube embeds to search
            for videos, read/import playlists, and play videos you link or choose. Use of YouTube
            features is also subject to{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
              YouTube&apos;s Terms of Service
            </a>
            .
          </li>
        </ul>
        <p>
          The app does not request access to Gmail, Google Calendar, Contacts, or your full Google
          Photos library outside the Photos Picker selections described above.
        </p>

        <h3 id="data-usage">Data Usage</h3>
        <p>
          ABC Tune Book uses, processes, and handles Google user data only to provide and improve
          the app&apos;s user-facing features, specifically to:
        </p>
        <ul>
          <li>Display your signed-in identity (name, email, and profile picture) in the app interface.</li>
          <li>
            Create, read, update, and sync your tunebook and optional recordings/files in{' '}
            <em>your</em> Google Drive account.
          </li>
          <li>Import files or photos that you explicitly select through Drive or Photos pickers.</li>
          <li>Search, import, and play YouTube content that you choose to use.</li>
          <li>
            Optionally verify your Google email with a trusted local media resolver so media-related
            features can confirm you are an authorized user of that resolver.
          </li>
        </ul>
        <p>
          Google user data is <strong>not</strong> sold, is <strong>not</strong> used for advertising
          or advertising personalization, is <strong>not</strong> used for credit scoring or lending
          decisions, and is <strong>not</strong> used for any purpose other than providing or improving
          the features described in this Privacy Policy.
        </p>

        <h3 id="data-sharing">Data Sharing</h3>
        <p>
          We do not sell Google user data. We do not share Google user data with third parties except
          in the limited cases below, and only for the stated purposes:
        </p>
        <ul>
          <li>
            <strong>No routine third-party transfer of Google account content:</strong> your Drive
            tunebook files and Photos selections remain in your Google account and/or on your device
            unless you take an explicit sharing or export action.
          </li>
          <li>
            <strong>User-initiated Drive sharing:</strong> if you use the app to share a tunebook or
            recording, you grant reader access to the shared Google Drive file (anyone with the link /
            any Google account user with reader permission). That sharing is initiated by you and is
            for collaboration or publishing that you choose.
          </li>
          <li>
            <strong>Optional trusted media resolver:</strong> if you use an optional local/trusted
            media resolver, your Google access token may be sent to that resolver solely to verify
            your identity (email) for authorizing media features. The resolver does not operate as a
            general cloud database of your Google Drive or Photos content.
          </li>
          <li>
            <strong>Anonymous analytics (GoatCounter):</strong> we collect anonymous aggregate usage
            statistics that do <em>not</em> include Google account details, tune titles, tune content,
            or media URLs, and that do not use cookies or identify individual users.
          </li>
          <li>
            <strong>Legal requirements:</strong> we may disclose information if required to do so by law.
          </li>
        </ul>
        <p>
          Use of Google services is also subject to the{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            Google Privacy Policy
          </a>
          . If you use Google Drive features, you are additionally subject to the{' '}
          <a href="https://www.google.com/drive/terms-of-service/" target="_blank" rel="noreferrer">
            Google Drive Terms of Service
          </a>
          .
        </p>

        <h3 id="data-storage-protection">Data Storage &amp; Protection</h3>
        <p>Our practices for storing and protecting user data are as follows:</p>
        <ul>
          <li>
            <strong>No central tunebook database:</strong> ABC Tune Book is primarily a client-side
            application. Tune content is stored on your device and, when you are signed in, in your
            own Google Drive account. We do not maintain a central server database of your tune book
            content.
          </li>
          <li>
            <strong>Access tokens:</strong> Google OAuth access tokens are kept in browser memory for
            the active session and are not written to local storage.
          </li>
          <li>
            <strong>Local device storage:</strong> a limited profile cache (such as email, name, and
            picture) and a login/session identifier may be stored locally on your device to restore
            sign-in state.
          </li>
          <li>
            <strong>Optional OAuth session storage:</strong> an optional authentication backend on a
            trusted media resolver may store a refresh session (including your email and Google refresh
            token). Refresh tokens may be encrypted at rest. These sessions are used only to refresh
            authentication for the features described in this policy.
          </li>
          <li>
            <strong>Transport security:</strong> communication with tunebook.net and Google APIs uses
            HTTPS/TLS.
          </li>
        </ul>

        <h3 id="data-retention-deletion">Data Retention &amp; Deletion</h3>
        <p>
          <strong>Retention:</strong> Google user data stored in your Google Drive, Google Photos, or
          YouTube account remains under your Google account and is retained according to Google&apos;s
          policies until you delete it. Local app data remains on your device until you delete it.
          Optional OAuth refresh sessions on a trusted media resolver are retained only while needed
          for login refresh and are removed when you log out or when the session is cleared.
        </p>
        <p>
          <strong>Accessible deletion process:</strong> you can delete or disconnect your data as
          follows:
        </p>
        <ol>
          <li>
            <strong>Logout (disconnect Google from the app):</strong> use Logout in the application.
            This revokes Google tokens where possible and clears local login/session data.
          </li>
          <li>
            <strong>Delete app tune data:</strong> use Settings in the application to delete all tunes.
            When you are signed in, that deletion is synced so the app&apos;s tunebook content in Drive
            is emptied or tombstoned accordingly.
          </li>
          <li>
            <strong>Delete Drive / Photos originals:</strong> logout does not automatically erase every
            historical Drive file or Photos original. To fully remove remaining files, delete the
            “ABC Tune Book” folder (and any related files) in Google Drive, and remove unwanted Photos
            imports as needed in Google Photos.
          </li>
          <li>
            <strong>Revoke app access in Google:</strong> remove ABC Tune Book&apos;s access at{' '}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
              https://myaccount.google.com/permissions
            </a>
            .
          </li>
          <li>
            <strong>Deletion request by email:</strong> you may also request deletion of any residual
            authentication sessions under our control by emailing{' '}
            <a href="mailto:syntithenai@gmail.com">syntithenai@gmail.com</a>. We will respond within a
            reasonable time.
          </li>
        </ol>

        <h3 id="limited-use">Google API Services User Data Policy / Limited Use</h3>
        <p>
          ABC Tune Book&apos;s use of information received from Google APIs adheres to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Specifically, Google user data is used only to
          provide or improve user-facing features that are prominent in the application&apos;s
          interface; is not transferred to others except as necessary to provide those features, with
          user consent, or as required by law; and is not used for serving advertisements, credit
          decisions, or other prohibited purposes.
        </p>

        <hr />

        <div style={{ textAlign: 'center' }}>
          <h2>Terms of Use</h2>
        </div>

        <ol>
          <li>
            <span>
              <strong>Agreement to be bound</strong>
            </span>
            <ol>
              <li>
                <span>
                  By using our service you agree to be bound by these terms of agreement, which may
                  change from time to time. The Privacy Policy above forms part of how we handle
                  Google user data and other information.
                </span>
              </li>
            </ol>
          </li>

          <li>
            <span>
              <strong>Privacy</strong>
            </span>
            <ol>
              <li>
                <span>
                  Please see the Privacy Policy sections above (Data Accessed, Data Usage, Data
                  Sharing, Data Storage &amp; Protection, and Data Retention &amp; Deletion) for a
                  full description of our practices.
                </span>
              </li>
              <li>
                <span>
                  This software does not store personal information on a central server. This website
                  is not backed by a central database of tune content. Information required by the
                  application is stored on your device, and optionally in your own Google account when
                  you choose to sign in.
                </span>
              </li>
            </ol>
          </li>

          <li>
            <span>
              <strong>Third-party login</strong>
            </span>
            <ol>
              <li>
                <span>This site relies on Google to provide optional login and cloud storage.</span>
              </li>
              <li>
                <span>
                  In using Google services you are subject to the{' '}
                  <a target="_blank" rel="noreferrer" href="https://policies.google.com/privacy">
                    Google Privacy Policy
                  </a>
                  .
                </span>
              </li>
            </ol>
          </li>

          <li>
            <span>
              <strong>Third-party content</strong>
            </span>
            <ol>
              <li>
                <span>
                  This site assists users to collect content from third parties. This is not an
                  endorsement of this material and we have no responsibility for any loss caused by
                  reliance or access to third-party sites.
                </span>
              </li>
              <li>
                <span>
                  Collected content only exists on your device (or your Google Drive) and can only be
                  shared by explicit actions by you, including downloading ABC files or using in-app
                  Drive sharing as described in the Privacy Policy.
                </span>
              </li>
              <li>
                <span>
                  When using features to play YouTube videos or search, import, or export YouTube
                  playlists, you are subject to{' '}
                  <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
                    YouTube&apos;s Terms of Service
                  </a>
                  .
                </span>
              </li>
              <li>
                <span>
                  Other than what is shown when playing YouTube videos, there is no Advertising on
                  this site.
                </span>
              </li>
            </ol>
          </li>

          <li>
            <span>
              <strong>User Conduct</strong>
            </span>
            <ol>
              <li>
                <span>
                  You will not engage in conduct or contribute content that belongs to another party
                  or is offensive, obscene, threatening, unlawful, defamatory, vilifying, inducing to
                  violence, harassing, invasive of privacy, or discriminatory, solicitation or spam or
                  private or confidential information or that jeopardises the operations of the site
                  in any way or seek to gain unauthorised access to our servers or misuse the site to
                  cause harm.
                </span>
              </li>
              <li>
                <span>
                  We will endeavour to and reserve the right to remove content that breaches these
                  terms as quickly as possible but we accept no liability for any harm suffered by
                  exposure to or reliance on such content.
                </span>
              </li>
              <li>
                <span>We may preserve and disclose user content if required to do so by law.</span>
              </li>
            </ol>
          </li>

          <li>
            <span>
              <strong>Termination of Your Account</strong>
            </span>
            <ol>
              <li>
                <span>
                  We may modify, suspend or delete your account and associated user content and block
                  your access to the site if you breach these terms.
                </span>
              </li>
              <li>
                <span>
                  You may request that your account be deleted at any time by following the Data
                  Retention &amp; Deletion process in the Privacy Policy above (including emailing{' '}
                  <a href="mailto:syntithenai@gmail.com">syntithenai@gmail.com</a>), and we will
                  comply in reasonable time for any residual sessions under our control.
                </span>
              </li>
              <li>
                <span>
                  Termination of your account will not necessarily remove content you have contributed
                  according to the terms in the preceding clause.
                </span>
              </li>
            </ol>
          </li>

          <li>
            <span>
              <strong>Intellectual property</strong>
            </span>
            <ol>
              <li>
                <span>
                  The content on this site, including that contributed by users, is subject to a
                  Creative Commons Licence (Attribution CC BY Version 4.0 (international licence)) (
                  <a target="_blank" rel="noreferrer" href="http://creativecommons.org.au/learn/licences/">
                    see here
                  </a>
                  ). This means that &apos;whenever a work is copied or redistributed ... the original
                  creator (and any other nominated parties) must be credited and the source linked
                  to.&apos;
                </span>
              </li>
              <li>
                <span>
                  The software used on this site is open source and subject to GNU General Public
                  License version 3 (
                  <a href="https://opensource.org" target="_blank" rel="noreferrer">
                    see here
                  </a>
                  )
                </span>
              </li>
            </ol>
          </li>

          <li>
            <span>
              <strong>No Representations or Warranties</strong>
            </span>
            <ol>
              <li>
                <span>
                  We do not guarantee that our services will always be available or free from bugs or
                  viruses and the onus is on you to maintain current anti-virus software.
                </span>
              </li>
              <li>
                <span>
                  We will endeavor to provide quality content, but make no guarantees to the ongoing
                  quality or quantity of content, including premium content.
                </span>
              </li>
              <li>
                <span>
                  We do not guarantee any warranties such as implied warranties of fitness for purpose
                  or that this site will result in any improvement in your learning.
                </span>
              </li>
              <li>
                <span>We do not guarantee that the information on this site is accurate or up to date.</span>
              </li>
            </ol>
          </li>

          <li>
            <span>
              <strong>Limitation of Liability</strong>
            </span>
            <ol>
              <li>
                <span>
                  Other than as required by law, we are not liable to you for any damages caused by
                  use of or reliance on this site
                  <br />
                </span>
              </li>
            </ol>
          </li>

          <li>
            <span>
              <strong>Indemnity</strong>
            </span>
            <ol>
              <li>
                <span>
                  You agree to indemnify us from any loss or liability due to a claim brought by any
                  third party arising from your user content or conduct.
                </span>
              </li>
            </ol>
          </li>

          <li>
            <span>
              <strong>Dispute resolution etc</strong>
            </span>
            <ol>
              <li>
                <span>
                  These terms and the relationship between us and you are governed by the laws of
                  Australia and subject to the exclusive jurisdiction of Australian courts, with the
                  exception of injunctive relief in any jurisdiction in order to enforce our rights
                  under these terms.
                </span>
              </li>
              <li>
                <span>
                  If we fail to exercise or enforce any rights or provision of these terms, this does
                  not constitute a waiver of such rights or provisions.
                </span>
              </li>
              <li>
                <span>
                  If any provision of the terms are found by a court of competent jurisdiction to be
                  invalid, the parties nevertheless agree that the court should endeavour to give
                  effect to the parties&apos; intentions as reflected in the provision, and the other
                  provisions of the terms remain in full force and effect.
                </span>
              </li>
              <li>
                <span>
                  You agree that these terms represent the entire understanding between us and you and
                  these terms supersede any previous agreements, promises, assurances, warranties,
                  representations and understandings, whether written or oral, between us and you.
                </span>
              </li>
            </ol>
          </li>
        </ol>
      </div>
    </div>
  )
}
